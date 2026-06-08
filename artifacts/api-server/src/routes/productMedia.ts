import { Router } from "express";
import multer from "multer";
import { db, productMediaTable, vendorCatalogItemsTable } from "@workspace/db";
import { eq, and, asc, desc, isNull } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { uploadToSupabase, deleteFromSupabase } from "../lib/supabaseStorage.js";
import { compressImageBuffer, isCompressibleImage } from "../lib/imageCompress.js";
import { getOpenAI } from "../lib/openaiClient.js";

const router = Router();

const IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const IMAGE_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: VIDEO_MAX } });

function actor(req: any) {
  const u = req.user as { email?: string; role?: string } | undefined;
  return { email: u?.email ?? "unknown", role: u?.role ?? "staff" };
}

// GET /api/product-media/item/:id  — public, active only
router.get("/item/:vendorCatalogItemId", async (req, res): Promise<void> => {
  const itemId = parseInt(req.params.vendorCatalogItemId);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const media = await db.select().from(productMediaTable)
      .where(and(eq(productMediaTable.vendorCatalogItemId, itemId), eq(productMediaTable.isActive, true)))
      .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.createdAt));
    res.json({ media });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// GET /api/product-media/admin/item/:id — auth required, all records
router.get("/admin/item/:vendorCatalogItemId", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const itemId = parseInt(req.params.vendorCatalogItemId);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const media = await db.select().from(productMediaTable)
      .where(eq(productMediaTable.vendorCatalogItemId, itemId))
      .orderBy(asc(productMediaTable.sortOrder), asc(productMediaTable.createdAt));
    res.json({ media });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST /api/product-media/upload
router.post("/upload", upload.single("file"), async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  if (!req.file) { res.status(400).json({ error: "Tidak ada file" }); return; }
  const { mimetype } = req.file;
  const isImage = IMAGE_MIME.has(mimetype);
  const isVideo = VIDEO_MIME.has(mimetype);
  if (!isImage && !isVideo) { res.status(415).json({ error: `Tipe tidak didukung: ${mimetype}` }); return; }
  if (isImage && req.file.buffer.byteLength > IMAGE_MAX) { res.status(413).json({ error: "Foto maks 5 MB" }); return; }
  if (isVideo && req.file.buffer.byteLength > VIDEO_MAX) { res.status(413).json({ error: "Video maks 50 MB" }); return; }

  const vendorCatalogItemId = req.body.vendorCatalogItemId ? parseInt(req.body.vendorCatalogItemId) : null;
  const vendorId = req.body.vendorId ? parseInt(req.body.vendorId) : null;
  const isPrimary = req.body.isPrimary === "true";
  if (!vendorCatalogItemId) { res.status(400).json({ error: "vendorCatalogItemId wajib" }); return; }

  try {
    let buffer = req.file.buffer;
    let mime = mimetype;
    if (isImage && isCompressibleImage(mimetype)) {
      const c = await compressImageBuffer(buffer, mimetype, "photo");
      buffer = c.buffer; mime = c.contentType;
    }
    const folder = isImage ? "product-media/images" : "product-media/videos";
    const { publicUrl, storagePath } = await uploadToSupabase(buffer, mime, folder);

    if (isPrimary) {
      await db.update(productMediaTable).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(productMediaTable.vendorCatalogItemId, vendorCatalogItemId), eq(productMediaTable.isPrimary, true)));
    }
    const a = actor(req);
    const [inserted] = await db.insert(productMediaTable).values({
      vendorCatalogItemId, vendorId, mediaType: isImage ? "image" : "video",
      fileUrl: publicUrl, storagePath, isPrimary, isActive: true,
      uploadedBy: a.email, uploadedByRole: a.role, sortOrder: 0,
    }).returning();
    res.status(201).json({ media: inserted });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST /api/product-media/link
router.post("/link", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const { vendorCatalogItemId: rawId, vendorId: rawVid, externalUrl, title, isPrimary } = req.body;
  const vendorCatalogItemId = rawId ? parseInt(rawId) : null;
  const vendorId = rawVid ? parseInt(rawVid) : null;
  if (!vendorCatalogItemId) { res.status(400).json({ error: "vendorCatalogItemId wajib" }); return; }
  if (!externalUrl || !/^https?:\/\//.test(externalUrl)) { res.status(400).json({ error: "URL tidak valid" }); return; }
  try {
    const a = actor(req);
    const [ins] = await db.insert(productMediaTable).values({
      vendorCatalogItemId, vendorId, mediaType: "video_link",
      externalUrl: externalUrl.trim(), title: title?.trim() ?? null,
      isPrimary: isPrimary === true || isPrimary === "true",
      isActive: true, uploadedBy: a.email, uploadedByRole: a.role, sortOrder: 0,
    }).returning();
    res.status(201).json({ media: ins });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// PUT /api/product-media/:id
router.put("/:id", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  const { title, description, isActive } = req.body;
  const update: Record<string, unknown> = { updatedAt: new Date() };
  if (title !== undefined) update.title = title?.trim() ?? null;
  if (description !== undefined) update.description = description?.trim() ?? null;
  if (isActive !== undefined) update.isActive = isActive === true || isActive === "true";
  try {
    const [updated] = await db.update(productMediaTable).set(update as any)
      .where(eq(productMediaTable.id, id)).returning();
    if (!updated) { res.status(404).json({ error: "Tidak ditemukan" }); return; }
    res.json({ media: updated });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// DELETE /api/product-media/:id
router.delete("/:id", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [found] = await db.select().from(productMediaTable).where(eq(productMediaTable.id, id));
    if (!found) { res.status(404).json({ error: "Tidak ditemukan" }); return; }
    if (found.storagePath) await deleteFromSupabase(found.storagePath);
    await db.delete(productMediaTable).where(eq(productMediaTable.id, id));
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST /api/product-media/:id/set-primary
router.post("/:id/set-primary", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  try {
    const [found] = await db.select().from(productMediaTable).where(eq(productMediaTable.id, id));
    if (!found) { res.status(404).json({ error: "Tidak ditemukan" }); return; }
    if (found.vendorCatalogItemId) {
      await db.update(productMediaTable).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(productMediaTable.vendorCatalogItemId, found.vendorCatalogItemId), eq(productMediaTable.isPrimary, true)));
    }
    const [updated] = await db.update(productMediaTable)
      .set({ isPrimary: true, updatedAt: new Date() }).where(eq(productMediaTable.id, id)).returning();
    res.json({ media: updated });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST /api/product-media/generate-ai
router.post("/generate-ai", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const { productName, category, commodity, description, vendorCatalogItemId: rawId, vendorId: rawVid } = req.body;
  const vendorCatalogItemId = rawId ? parseInt(rawId) : null;
  const vendorId = rawVid ? parseInt(rawVid) : null;
  if (!vendorCatalogItemId) { res.status(400).json({ error: "vendorCatalogItemId wajib" }); return; }
  if (!productName?.trim()) { res.status(400).json({ error: "productName wajib" }); return; }

  const prompt = [
    `Professional B2B marketplace product photography for a logistics and international trading platform.`,
    `Product name: ${productName.trim()}.`,
    category?.trim() ? `Category: ${category.trim()}.` : "",
    commodity?.trim() ? `Commodity: ${commodity.trim()}.` : "",
    description?.trim() ? `Description: ${description.trim()}.` : "",
    `Style: Commercial product photography, ultra realistic, marketplace quality, professional lighting, sharp focus, high detail, premium B2B catalog image.`,
    `The product must be centered as the main subject. Clean, modern, professional background. Realistic lighting and high quality. No text, no watermarks, no logos, no writing of any kind.`,
    `Natural colors matching the actual product condition. If a commodity, show it in its commonly traded form. If a service, show the relevant service activity professionally.`,
    `Square 1:1 ratio. High resolution. Suitable for logistics and international trade marketplace. Focus on trust, quality, and commercial value.`,
  ].filter(Boolean).join(" ");

  try {
    const openai = getOpenAI();
    const response = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) { res.status(500).json({ error: "Model tidak mengembalikan gambar" }); return; }

    const buffer = Buffer.from(b64, "base64");
    const { publicUrl, storagePath } = await uploadToSupabase(buffer, "image/png", "product-media/images");

    const existingMedia = await db.select().from(productMediaTable)
      .where(eq(productMediaTable.vendorCatalogItemId, vendorCatalogItemId));
    const isPrimary = existingMedia.length === 0;

    if (isPrimary) {
      await db.update(productMediaTable).set({ isPrimary: false, updatedAt: new Date() })
        .where(and(eq(productMediaTable.vendorCatalogItemId, vendorCatalogItemId), eq(productMediaTable.isPrimary, true)));
    }

    const a = actor(req);
    const [inserted] = await db.insert(productMediaTable).values({
      vendorCatalogItemId, vendorId, mediaType: "image",
      fileUrl: publicUrl, storagePath, isPrimary, isActive: true,
      title: `AI — ${productName.trim()}`,
      uploadedBy: a.email, uploadedByRole: a.role, sortOrder: 0,
    }).returning();

    res.status(201).json({ media: inserted });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Gagal generate gambar" });
  }
});

// POST /api/product-media/reorder
router.post("/reorder", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const { order } = req.body as { order: Array<{ id: number; sortOrder: number }> };
  if (!Array.isArray(order)) { res.status(400).json({ error: "order harus array" }); return; }
  try {
    for (const item of order) {
      await db.update(productMediaTable).set({ sortOrder: item.sortOrder, updatedAt: new Date() })
        .where(eq(productMediaTable.id, item.id));
    }
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildAiPrompt(item: {
  name: string;
  templateKind?: string | null;
  categoryKey?: string | null;
  serviceType?: string | null;
  description?: string | null;
  origin?: string | null;
  location?: string | null;
  vendorName?: string | null;
  specValues?: Record<string, unknown> | null;
}): string {
  const sv = item.specValues ?? {};
  const kind = item.templateKind ?? "product";

  if (kind === "service") {
    const stype = (item.serviceType ?? item.categoryKey ?? "logistics").toLowerCase();
    let base = "";
    if (stype.includes("trucking") || stype.includes("truck")) {
      const truck = sv.truck_type ?? sv.truckType ?? "";
      const from = sv.route_from ?? sv.routeFrom ?? sv.coverage_area ?? item.location ?? "";
      const to = sv.route_to ?? sv.routeTo ?? "";
      base = `Professional Indonesian trucking service, ${truck ? truck + " truck, " : ""}container truck on highway${from ? ", route " + from : ""}${to ? " to " + to : ""}, clean corporate logistics style, professional lighting`;
    } else if (stype.includes("ppjk") || stype.includes("custom") || stype.includes("bea cukai")) {
      base = `Customs clearance service, port documentation, customs officer reviewing shipping documents, container inspection at port, professional logistics environment, Indonesia customs office`;
    } else if (stype.includes("sea") || stype.includes("ocean") || stype.includes("fcl") || stype.includes("lcl")) {
      const pol = sv.port_loading ?? sv.portLoading ?? "";
      const pod = sv.port_discharge ?? sv.portDischarge ?? "";
      const cont = sv.container_size ?? sv.containerSize ?? "";
      base = `Container vessel at port terminal, international sea freight${cont ? ", " + cont + " container" : ""}${pol ? ", loading at " + pol : ""}${pod ? ", discharge " + pod : ""}, professional logistics operation, realistic maritime photography`;
    } else if (stype.includes("air")) {
      base = `Cargo aircraft and airport warehouse, professional air freight logistics, cargo loading operation, modern airport terminal, commercial aviation freight`;
    } else if (stype.includes("warehouse") || stype.includes("gudang")) {
      base = `Modern logistics warehouse interior, organized shelving systems, forklift operations, inventory management, professional storage facility, bright lighting`;
    } else {
      base = `Professional ${item.name} logistics service, B2B commercial photography, modern logistics operations, professional lighting, clean corporate environment`;
    }
    return [
      base,
      "Ultra realistic, professional photography quality, high detail, no text, no watermarks, no logos.",
      "Square 1:1 ratio, suitable for professional B2B logistics marketplace.",
    ].join(" ");
  }

  // Product prompt
  const category = item.categoryKey ?? item.specValues?.commodity ?? "";
  const grade = sv.grade ?? sv.quality ?? "";
  const commodity = sv.commodity ?? category;
  const origin = item.origin ?? sv.origin ?? sv.country_of_origin ?? "";
  return [
    `Professional B2B marketplace product photography for a logistics and international trading platform.`,
    `Product: ${item.name}.`,
    commodity ? `Commodity: ${commodity}.` : "",
    grade ? `Grade/Quality: ${grade}.` : "",
    origin ? `Origin: ${origin}.` : "",
    item.description ? `Details: ${item.description.slice(0, 120)}.` : "",
    `Style: Commercial product photography, ultra realistic, marketplace quality, professional lighting, sharp focus, high detail, premium B2B catalog image.`,
    `Product centered as main subject. Clean modern background. No text, no watermarks, no logos. Square 1:1 ratio.`,
  ].filter(Boolean).join(" ");
}

// GET /api/product-media/generation-status — admin, status overview
router.get("/generation-status", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const { onlyPublished } = req.query;
  try {
    // 1. All catalog items
    const allItems = await db
      .select({
        id: vendorCatalogItemsTable.id,
        name: vendorCatalogItemsTable.name,
        vendorName: vendorCatalogItemsTable.vendorName,
        vendorId: vendorCatalogItemsTable.vendorId,
        categoryKey: vendorCatalogItemsTable.categoryKey,
        templateKind: vendorCatalogItemsTable.templateKind,
        serviceType: vendorCatalogItemsTable.serviceType,
        isPublished: vendorCatalogItemsTable.isPublished,
      })
      .from(vendorCatalogItemsTable)
      .where(
        onlyPublished === "true"
          ? eq(vendorCatalogItemsTable.isPublished, true)
          : eq(vendorCatalogItemsTable.isActive, true),
      )
      .orderBy(asc(vendorCatalogItemsTable.id));

    // 2. All active images
    const allMedia = await db
      .select({
        vendorCatalogItemId: productMediaTable.vendorCatalogItemId,
        fileUrl: productMediaTable.fileUrl,
        isPrimary: productMediaTable.isPrimary,
        createdAt: productMediaTable.createdAt,
      })
      .from(productMediaTable)
      .where(
        and(
          eq(productMediaTable.isActive, true),
          eq(productMediaTable.mediaType, "image"),
        ),
      );

    // 3. Build lookup: itemId → { primaryImageUrl, mediaCount, lastGeneratedAt }
    const mediaByItem = new Map<number, { primaryImageUrl: string | null; mediaCount: number; lastGeneratedAt: Date | null }>();
    for (const m of allMedia) {
      if (m.vendorCatalogItemId == null) continue;
      const existing = mediaByItem.get(m.vendorCatalogItemId);
      if (!existing) {
        mediaByItem.set(m.vendorCatalogItemId, {
          primaryImageUrl: m.isPrimary ? (m.fileUrl ?? null) : null,
          mediaCount: 1,
          lastGeneratedAt: m.createdAt ?? null,
        });
      } else {
        existing.mediaCount += 1;
        if (m.isPrimary) existing.primaryImageUrl = m.fileUrl ?? null;
        if (m.createdAt && (!existing.lastGeneratedAt || m.createdAt > existing.lastGeneratedAt)) {
          existing.lastGeneratedAt = m.createdAt;
        }
      }
    }

    // 4. Build response items
    const items = allItems.map((item) => {
      const med = mediaByItem.get(item.id);
      return {
        id: item.id,
        name: item.name,
        vendorName: item.vendorName ?? null,
        category: item.categoryKey ?? item.serviceType ?? null,
        templateKind: item.templateKind ?? null,
        serviceType: item.serviceType ?? null,
        isPublished: item.isPublished,
        hasImage: !!med?.primaryImageUrl || (med?.mediaCount ?? 0) > 0,
        primaryImageUrl: med?.primaryImageUrl ?? null,
        mediaCount: med?.mediaCount ?? 0,
        lastGeneratedAt: med?.lastGeneratedAt ?? null,
      };
    });

    const withImage = items.filter((i) => i.hasImage).length;
    const withoutImage = items.length - withImage;
    res.json({
      totalItems: items.length,
      withImage,
      withoutImage,
      coveragePercent: items.length > 0 ? Math.round((withImage / items.length) * 100) : 0,
      items,
    });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST /api/product-media/bulk-generate-ai — admin, batch AI image generation
router.post("/bulk-generate-ai", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const { limit = 10, onlyPublished = true, dryRun = false, force = false } = req.body ?? {};
  const limitNum = Math.min(Math.max(1, Number(limit) || 10), 50);
  const a = actor(req);

  try {
    // 1. Get all catalog items
    const allItems = await db
      .select({
        id: vendorCatalogItemsTable.id,
        vendorId: vendorCatalogItemsTable.vendorId,
        vendorName: vendorCatalogItemsTable.vendorName,
        name: vendorCatalogItemsTable.name,
        description: vendorCatalogItemsTable.description,
        templateKind: vendorCatalogItemsTable.templateKind,
        categoryKey: vendorCatalogItemsTable.categoryKey,
        serviceType: vendorCatalogItemsTable.serviceType,
        origin: vendorCatalogItemsTable.origin,
        location: vendorCatalogItemsTable.location,
        specValues: vendorCatalogItemsTable.specValues,
      })
      .from(vendorCatalogItemsTable)
      .where(
        onlyPublished
          ? eq(vendorCatalogItemsTable.isPublished, true)
          : eq(vendorCatalogItemsTable.isActive, true),
      )
      .orderBy(asc(vendorCatalogItemsTable.id));

    // 2. Get items that already have active images
    const existingMedia = await db
      .select({ vendorCatalogItemId: productMediaTable.vendorCatalogItemId })
      .from(productMediaTable)
      .where(and(eq(productMediaTable.isActive, true), eq(productMediaTable.mediaType, "image")));
    const itemsWithImage = new Set(existingMedia.map((m) => m.vendorCatalogItemId));

    // 3. Filter: skip items that already have image (unless force=true)
    const targets = allItems
      .filter((item) => force || !itemsWithImage.has(item.id))
      .slice(0, limitNum);

    if (dryRun) {
      res.json({
        dryRun: true,
        wouldProcess: targets.length,
        items: targets.map((t) => ({ id: t.id, name: t.name, templateKind: t.templateKind })),
      });
      return;
    }

    const openai = getOpenAI();
    const results: Array<{ id: number; name: string; success: boolean; imageUrl?: string; error?: string }> = [];

    for (const item of targets) {
      try {
        const prompt = buildAiPrompt({
          name: item.name,
          templateKind: item.templateKind,
          categoryKey: item.categoryKey,
          serviceType: item.serviceType,
          description: item.description,
          origin: item.origin,
          location: item.location,
          vendorName: item.vendorName,
          specValues: item.specValues as Record<string, unknown> | null,
        });

        const aiRes = await openai.images.generate({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          response_format: "b64_json",
        });

        const b64 = aiRes.data?.[0]?.b64_json;
        if (!b64) throw new Error("Model tidak mengembalikan gambar");

        const buffer = Buffer.from(b64, "base64");
        const folder = `product-media/vendor-${item.vendorId}/item-${item.id}`;
        const { publicUrl, storagePath } = await uploadToSupabase(buffer, "image/png", folder);

        // Ensure only one primary
        await db.update(productMediaTable)
          .set({ isPrimary: false, updatedAt: new Date() })
          .where(and(eq(productMediaTable.vendorCatalogItemId, item.id), eq(productMediaTable.isPrimary, true)));

        await db.insert(productMediaTable).values({
          vendorCatalogItemId: item.id,
          vendorId: item.vendorId,
          mediaType: "image",
          fileUrl: publicUrl,
          storagePath,
          isPrimary: true,
          isActive: true,
          title: `AI — ${item.name}`,
          uploadedBy: a.email,
          uploadedByRole: a.role,
          sortOrder: 0,
        });

        results.push({ id: item.id, name: item.name, success: true, imageUrl: publicUrl });
      } catch (err: any) {
        results.push({ id: item.id, name: item.name, success: false, error: err?.message ?? "Unknown error" });
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    res.json({ processed: results.length, succeeded, failed, results });
  } catch (e: any) { res.status(500).json({ error: e?.message }); }
});

// POST /api/product-media/regenerate-ai/:id — admin, regenerate single item (id = vendor_catalog_item_id)
router.post("/regenerate-ai/:id", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const itemId = parseInt(req.params.id);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }
  const a = actor(req);

  try {
    const [item] = await db
      .select({
        id: vendorCatalogItemsTable.id,
        vendorId: vendorCatalogItemsTable.vendorId,
        vendorName: vendorCatalogItemsTable.vendorName,
        name: vendorCatalogItemsTable.name,
        description: vendorCatalogItemsTable.description,
        templateKind: vendorCatalogItemsTable.templateKind,
        categoryKey: vendorCatalogItemsTable.categoryKey,
        serviceType: vendorCatalogItemsTable.serviceType,
        origin: vendorCatalogItemsTable.origin,
        location: vendorCatalogItemsTable.location,
        specValues: vendorCatalogItemsTable.specValues,
      })
      .from(vendorCatalogItemsTable)
      .where(eq(vendorCatalogItemsTable.id, itemId));

    if (!item) { res.status(404).json({ error: "Item tidak ditemukan" }); return; }

    // Deactivate all existing images for this item
    await db.update(productMediaTable)
      .set({ isActive: false, isPrimary: false, updatedAt: new Date() })
      .where(and(eq(productMediaTable.vendorCatalogItemId, itemId), eq(productMediaTable.mediaType, "image")));

    const prompt = buildAiPrompt({
      name: item.name,
      templateKind: item.templateKind,
      categoryKey: item.categoryKey,
      serviceType: item.serviceType,
      description: item.description,
      origin: item.origin,
      location: item.location,
      vendorName: item.vendorName,
      specValues: item.specValues as Record<string, unknown> | null,
    });

    const openai = getOpenAI();
    const aiRes = await openai.images.generate({
      model: "dall-e-3",
      prompt,
      n: 1,
      size: "1024x1024",
      quality: "standard",
      response_format: "b64_json",
    });

    const b64 = aiRes.data?.[0]?.b64_json;
    if (!b64) { res.status(500).json({ error: "Model tidak mengembalikan gambar" }); return; }

    const buffer = Buffer.from(b64, "base64");
    const folder = `product-media/vendor-${item.vendorId}/item-${item.id}`;
    const { publicUrl, storagePath } = await uploadToSupabase(buffer, "image/png", folder);

    const [inserted] = await db.insert(productMediaTable).values({
      vendorCatalogItemId: item.id,
      vendorId: item.vendorId,
      mediaType: "image",
      fileUrl: publicUrl,
      storagePath,
      isPrimary: true,
      isActive: true,
      title: `AI — ${item.name}`,
      uploadedBy: a.email,
      uploadedByRole: a.role,
      sortOrder: 0,
    }).returning();

    res.status(201).json({ media: inserted, prompt });
  } catch (e: any) { res.status(500).json({ error: e?.message ?? "Gagal generate gambar" }); }
});

export default router;
