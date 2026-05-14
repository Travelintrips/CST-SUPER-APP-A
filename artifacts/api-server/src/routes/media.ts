import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db, mediaAssetsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin";
import { ObjectStorageService } from "../lib/objectStorage";
import { compressImageBuffer, isCompressibleImage } from "../lib/imageCompress";

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const objectStorageService = new ObjectStorageService();

router.use(async (req, res, next) => {
  if (!(await requireClerkUser(req, res))) return;
  next();
});

// GET /api/media — daftar semua gambar
router.get("/", async (_req, res) => {
  const items = await db
    .select()
    .from(mediaAssetsTable)
    .orderBy(desc(mediaAssetsTable.createdAt));
  res.json({ items });
});

// POST /api/media/upload — upload dan kompres gambar, simpan sebagai public asset
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Tidak ada file yang diunggah" });
  }

  const { mimetype, originalname, size } = req.file;
  let buffer = req.file.buffer;
  let finalContentType = mimetype;

  if (isCompressibleImage(mimetype)) {
    const compressed = await compressImageBuffer(buffer, mimetype, "photo");
    buffer = compressed.buffer;
    finalContentType = compressed.contentType;
  }

  const objectId = randomUUID();
  const url = await objectStorageService.uploadPublicAsset(buffer, objectId, finalContentType);

  const [inserted] = await db.insert(mediaAssetsTable).values({
    originalName: originalname,
    contentType: finalContentType,
    sizeBytes: buffer.byteLength,
    url,
    objectPath: `/portal-assets/${objectId}`,
    uploadedBy: (req as any).user?.email ?? null,
  }).returning();

  res.json({ ok: true, item: inserted });
});

// DELETE /api/media/:id — hapus metadata dari DB (file di storage tidak dihapus untuk keamanan)
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID tidak valid" });
  await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  res.json({ ok: true });
});

export default router;
