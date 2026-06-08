import { Router } from "express";
import multer from "multer";
import { db, productMediaTable } from "@workspace/db";
import { eq, and, asc, isNull, notInArray } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { uploadToSupabase, deleteFromSupabase } from "../lib/supabaseStorage.js";
import { compressImageBuffer, isCompressibleImage } from "../lib/imageCompress.js";
import { getOpenAI } from "../lib/openaiClient.js";
import { sql } from "drizzle-orm";

const router = Router();

const IMAGE_MIME = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp"]);
const VIDEO_MIME = new Set(["video/mp4", "video/webm", "video/quicktime"]);
const IMAGE_MAX = 5 * 1024 * 1024;
const VIDEO_MAX = 50 * 1024 * 1024;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: VIDEO_MAX } });

function actor(req: any) {
  const u = req.user as { email?: string; role?: string } | undefined;
  return { email: u?.email ?? "ai-system", role: u?.role ?? "system" };
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildAiPrompt(item: {
  name: string;
  templateKind?: string | null;
  description?: string | null;
  specValues?: Record<string, unknown> | null;
  kategori?: string | null;
  serviceType?: string | null;
  origin?: string | null;
  vendorName?: string | null;
  vendorServiceType?: string | null;
}): string {
  const kind = item.templateKind ?? "product";
  const name = item.name.trim();
  const specs = item.specValues ?? {};

  const parts: string[] = [];

  if (kind === "product") {
    // Extract key specs
    const grade = specs.grade ?? specs.gar ? `${specs.grade ?? "GAR " + specs.gar}` : null;
    const origin = item.origin ?? (specs.origin as string) ?? null;
    const beanType = specs.bean_type as string | null;
    const productType = specs.product_type as string | null;

    const baseSubject = [
      "Ultra realistic professional marketplace product photography of",
      productType ?? beanType ?? name,
      grade ? `${grade}` : null,
      origin ? `from ${origin}` : null,
    ].filter(Boolean).join(" ");

    parts.push(baseSubject + ".");

    if (item.description?.trim()) {
      const shortDesc = item.description.trim().split(".")[0];
      parts.push(`Context: ${shortDesc}.`);
    }

    parts.push(
      "Export quality commodity, detailed texture and surface, clean commercial white or gradient background.",
      "Premium B2B trading catalog image, realistic studio lighting, highly detailed, no text, no watermark, no logos.",
      "Square 1:1 format, marketplace ready, professional photography style.",
    );
  } else {
    // Service
    const svcType = item.serviceType ?? item.vendorServiceType ?? item.kategori ?? "";
    const routeFrom = specs.route_from as string | null;
    const routeTo = specs.route_to as string | null;
    const truckType = specs.truck_type as string | null;
    const port = specs.port as string | null;
    const containerSize = specs.container_size as string | null;

    let subject = "Professional logistics and trade service";

    if (/trucking|angkut|tronton|fuso|cdd/i.test(name + svcType + (truckType ?? ""))) {
      subject = `Professional logistics trucking service, modern ${truckType ?? "cargo"} trucks transporting goods`;
      if (routeFrom && routeTo) subject += `, ${routeFrom} to ${routeTo} route`;
      subject += ", Indonesian highways, realistic operation";
    } else if (/sea|ocean|fcl|lcl|container|kapal/i.test(name + svcType)) {
      subject = `Professional ocean freight container shipping service`;
      if (containerSize) subject += `, ${containerSize} container`;
      if (routeFrom && routeTo) subject += `, ${routeFrom} to ${routeTo}`;
      subject += ", commercial port terminal, modern container ship";
    } else if (/air|udara/i.test(name + svcType)) {
      subject = "Professional air freight cargo service, aircraft loading at international airport, cargo handling operations";
    } else if (/customs|clearance|ppjk|kepabeanan/i.test(name + svcType)) {
      subject = `Professional customs clearance service`;
      if (port) subject += ` at ${port}`;
      subject += ", documentation and customs inspection, professional business environment";
    } else if (/kopi|coffee|arabica|robusta/i.test(name)) {
      subject = "Professional coffee bean product photography, premium green coffee beans, export quality";
    }

    parts.push(`${subject}.`);

    if (item.description?.trim()) {
      const shortDesc = item.description.trim().split(".")[0];
      parts.push(`Context: ${shortDesc}.`);
    }

    parts.push(
      "Commercial quality, clean composition, premium business service photography.",
      "Realistic professional lighting, no text, no watermark, no logos.",
      "Square 1:1 format, marketplace ready, B2B catalog quality.",
    );
  }

  return parts.join(" ");
}

// ── Generate helper (shared logic) ────────────────────────────────────────────
async function generateAndSave(opts: {
  vendorCatalogItemId: number;
  vendorId: number | null;
  prompt: string;
  itemName: string;
  uploadedBy: string;
  uploadedByRole: string;
  replacePrimary?: boolean;
}): Promise<{ fileUrl: string; storagePath: string; mediaId: number }> {
  const openai = getOpenAI();

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: opts.prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
    response_format: "b64_json",
  });

  const b64 = response.data?.[0]?.b64_json;
  if (!b64) throw new Error("Model tidak mengembalikan gambar");

  const buffer = Buffer.from(b64, "base64");
  const { publicUrl, storagePath } = await uploadToSupabase(buffer, "image/png", "product-media/images");

  if (opts.replacePrimary) {
    await db.update(productMediaTable)
      .set({ isPrimary: false, updatedAt: new Date() })
      .where(and(
        eq(productMediaTable.vendorCatalogItemId, opts.vendorCatalogItemId),
        eq(productMediaTable.isPrimary, true),
      ));
  }

  const existingCount = await db.select({ id: productMediaTable.id })
    .from(productMediaTable)
    .where(eq(productMediaTable.vendorCatalogItemId, opts.vendorCatalogItemId));
  const isPrimary = existingCount.length === 0 || opts.replacePrimary;

  const [inserted] = await db.insert(productMediaTable).values({
    vendorCatalogItemId: opts.vendorCatalogItemId,
    vendorId: opts.vendorId,
    mediaType: "image",
    fileUrl: publicUrl,
    storagePath,
    isPrimary,
    isActive: true,
    title: `AI — ${opts.itemName}`,
    uploadedBy: opts.uploadedBy,
    uploadedByRole: opts.uploadedByRole,
    sortOrder: 0,
  }).returning();

  return { fileUrl: publicUrl, storagePath, mediaId: inserted.id };
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

// GET /api/product-media/generation-status — semua item beserta status gambar
router.get("/generation-status", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  try {
    const rows = await db.execute(sql`
      SELECT
        vci.id,
        vci.name,
        vci.template_kind,
        vci.description,
        vci.spec_values,
        vci.kategori,
        vci.service_type,
        vci.origin,
        vci.is_published,
        vci.vendor_id,
        s.name AS vendor_name,
        s.service_type AS vendor_service_type,
        COUNT(pm.id) FILTER (WHERE pm.is_active = true) AS media_count,
        MAX(pm.file_url) FILTER (WHERE pm.is_primary = true AND pm.is_active = true) AS primary_image_url,
        MAX(pm.created_at) FILTER (WHERE pm.is_active = true) AS last_generated_at
      FROM vendor_catalog_items vci
      LEFT JOIN suppliers s ON s.id = vci.vendor_id
      LEFT JOIN product_media pm ON pm.vendor_catalog_item_id = vci.id
      GROUP BY vci.id, vci.name, vci.template_kind, vci.description, vci.spec_values,
               vci.kategori, vci.service_type, vci.origin, vci.is_published, vci.vendor_id,
               s.name, s.service_type
      ORDER BY vci.is_published DESC, CAST(COUNT(pm.id) FILTER (WHERE pm.is_active = true) AS int) ASC, vci.id
    `);

    const items = (rows as any[]).map((r: any) => ({
      id: r.id,
      name: r.name,
      templateKind: r.template_kind,
      description: r.description,
      specValues: r.spec_values,
      kategori: r.kategori,
      serviceType: r.service_type,
      origin: r.origin,
      isPublished: r.is_published,
      vendorId: r.vendor_id,
      vendorName: r.vendor_name,
      vendorServiceType: r.vendor_service_type,
      mediaCount: parseInt(r.media_count ?? "0"),
      primaryImageUrl: r.primary_image_url ?? null,
      lastGeneratedAt: r.last_generated_at ?? null,
      hasImage: parseInt(r.media_count ?? "0") > 0,
    }));

    const total = items.length;
    const withImage = items.filter((i) => i.hasImage).length;
    const withoutImage = total - withImage;

    res.json({ items, stats: { total, withImage, withoutImage } });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
  }
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

// POST /api/product-media/generate-ai  — single item generation
router.post("/generate-ai", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const {
    productName, category, commodity, description,
    vendorCatalogItemId: rawId, vendorId: rawVid,
    specValues, origin, templateKind, serviceType, kategori, vendorName, vendorServiceType,
  } = req.body;
  const vendorCatalogItemId = rawId ? parseInt(rawId) : null;
  const vendorId = rawVid ? parseInt(rawVid) : null;
  if (!vendorCatalogItemId) { res.status(400).json({ error: "vendorCatalogItemId wajib" }); return; }
  if (!productName?.trim()) { res.status(400).json({ error: "productName wajib" }); return; }

  const prompt = buildAiPrompt({
    name: productName.trim(),
    templateKind: templateKind ?? null,
    description: description?.trim() ?? null,
    specValues: specValues ?? null,
    kategori: kategori ?? category ?? null,
    serviceType: serviceType ?? null,
    origin: origin ?? null,
    vendorName: vendorName ?? null,
    vendorServiceType: vendorServiceType ?? null,
  });

  try {
    const a = actor(req);
    const result = await generateAndSave({
      vendorCatalogItemId,
      vendorId,
      prompt,
      itemName: productName.trim(),
      uploadedBy: a.email,
      uploadedByRole: a.role,
    });

    const [media] = await db.select().from(productMediaTable).where(eq(productMediaTable.id, result.mediaId));
    res.status(201).json({ media });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Gagal generate gambar" });
  }
});

// POST /api/product-media/regenerate-ai/:itemId — hapus gambar AI lama, buat baru
router.post("/regenerate-ai/:itemId", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const itemId = parseInt(req.params.itemId);
  if (isNaN(itemId)) { res.status(400).json({ error: "Invalid id" }); return; }

  try {
    // Ambil data item dari DB
    const [itemRow] = await db.execute(sql`
      SELECT vci.id, vci.name, vci.template_kind, vci.description, vci.spec_values,
             vci.kategori, vci.service_type, vci.origin, vci.vendor_id,
             s.name AS vendor_name, s.service_type AS vendor_service_type
      FROM vendor_catalog_items vci
      LEFT JOIN suppliers s ON s.id = vci.vendor_id
      WHERE vci.id = ${itemId}
    `) as any[];

    if (!itemRow) { res.status(404).json({ error: "Item tidak ditemukan" }); return; }

    // Hapus gambar AI yang ada (ditandai title 'AI — ')
    const existing = await db.select().from(productMediaTable)
      .where(eq(productMediaTable.vendorCatalogItemId, itemId));
    for (const m of existing) {
      if (m.storagePath) await deleteFromSupabase(m.storagePath).catch(() => {});
    }
    await db.delete(productMediaTable).where(eq(productMediaTable.vendorCatalogItemId, itemId));

    const prompt = buildAiPrompt({
      name: itemRow.name,
      templateKind: itemRow.template_kind,
      description: itemRow.description,
      specValues: itemRow.spec_values,
      kategori: itemRow.kategori,
      serviceType: itemRow.service_type,
      origin: itemRow.origin,
      vendorName: itemRow.vendor_name,
      vendorServiceType: itemRow.vendor_service_type,
    });

    const a = actor(req);
    const result = await generateAndSave({
      vendorCatalogItemId: itemId,
      vendorId: itemRow.vendor_id ? parseInt(itemRow.vendor_id) : null,
      prompt,
      itemName: itemRow.name,
      uploadedBy: a.email,
      uploadedByRole: a.role,
    });

    const [media] = await db.select().from(productMediaTable).where(eq(productMediaTable.id, result.mediaId));
    res.status(201).json({ media, prompt });
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Gagal regenerate gambar" });
  }
});

// POST /api/product-media/bulk-generate-ai — generate untuk semua item tanpa gambar
router.post("/bulk-generate-ai", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const { onlyPublished = false, itemIds } = req.body as {
    onlyPublished?: boolean;
    itemIds?: number[];
  };

  try {
    let query = sql`
      SELECT vci.id, vci.name, vci.template_kind, vci.description, vci.spec_values,
             vci.kategori, vci.service_type, vci.origin, vci.vendor_id, vci.is_published,
             s.name AS vendor_name, s.service_type AS vendor_service_type,
             COUNT(pm.id) FILTER (WHERE pm.is_active = true) AS media_count
      FROM vendor_catalog_items vci
      LEFT JOIN suppliers s ON s.id = vci.vendor_id
      LEFT JOIN product_media pm ON pm.vendor_catalog_item_id = vci.id
      GROUP BY vci.id, vci.name, vci.template_kind, vci.description, vci.spec_values,
               vci.kategori, vci.service_type, vci.origin, vci.vendor_id, vci.is_published,
               s.name, s.service_type
      HAVING COUNT(pm.id) FILTER (WHERE pm.is_active = true) = 0
      ORDER BY vci.is_published DESC, vci.id
    `;

    let items = (await db.execute(query)) as any[];

    if (onlyPublished) {
      items = items.filter((i: any) => i.is_published);
    }
    if (itemIds && itemIds.length > 0) {
      items = items.filter((i: any) => itemIds.includes(Number(i.id)));
    }

    const a = actor(req);
    const results: Array<{
      id: number;
      name: string;
      success: boolean;
      imageUrl?: string;
      error?: string;
    }> = [];

    for (const item of items) {
      const prompt = buildAiPrompt({
        name: item.name,
        templateKind: item.template_kind,
        description: item.description,
        specValues: item.spec_values,
        kategori: item.kategori,
        serviceType: item.service_type,
        origin: item.origin,
        vendorName: item.vendor_name,
        vendorServiceType: item.vendor_service_type,
      });

      let attempt = 0;
      let success = false;
      let lastError = "";

      while (attempt < 3 && !success) {
        try {
          const r = await generateAndSave({
            vendorCatalogItemId: Number(item.id),
            vendorId: item.vendor_id ? parseInt(item.vendor_id) : null,
            prompt,
            itemName: item.name,
            uploadedBy: a.email,
            uploadedByRole: a.role,
          });
          results.push({ id: Number(item.id), name: item.name, success: true, imageUrl: r.fileUrl });
          success = true;
        } catch (e: any) {
          lastError = e?.message ?? "Unknown error";
          attempt++;
          if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
        }
      }

      if (!success) {
        results.push({ id: Number(item.id), name: item.name, success: false, error: lastError });
      }
    }

    const succeeded = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    res.json({
      summary: {
        total: results.length,
        succeeded: succeeded.length,
        failed: failed.length,
      },
      results,
      succeeded,
      failed,
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message });
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

export default router;
