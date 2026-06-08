import { Router } from "express";
import multer from "multer";
import { db, productMediaTable } from "@workspace/db";
import { eq, and, asc } from "drizzle-orm";
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

export default router;
