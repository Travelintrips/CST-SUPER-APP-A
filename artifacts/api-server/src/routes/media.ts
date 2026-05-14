import { Router } from "express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db, mediaAssetsTable } from "@workspace/db";
import { eq, desc, sql } from "drizzle-orm";
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

// GET /api/media/folders — daftar folder beserta jumlah gambar
router.get("/folders", async (_req, res) => {
  const rows = await db
    .select({
      folder: mediaAssetsTable.folder,
      count: sql<number>`cast(count(*) as int)`,
    })
    .from(mediaAssetsTable)
    .groupBy(mediaAssetsTable.folder)
    .orderBy(mediaAssetsTable.folder);
  res.json({ folders: rows });
});

// GET /api/media — daftar semua gambar (opsional filter ?folder=xxx)
router.get("/", async (req, res) => {
  const folderFilter = req.query.folder as string | undefined;
  const query = db
    .select()
    .from(mediaAssetsTable)
    .orderBy(desc(mediaAssetsTable.createdAt));

  const items = folderFilter
    ? await db
        .select()
        .from(mediaAssetsTable)
        .where(eq(mediaAssetsTable.folder, folderFilter))
        .orderBy(desc(mediaAssetsTable.createdAt))
    : await query;

  res.json({ items });
});

// POST /api/media/upload — upload dan kompres gambar, simpan sebagai public asset
router.post("/upload", upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "Tidak ada file yang diunggah" });
  }

  const { mimetype, originalname } = req.file;
  const folder = (req.body.folder as string)?.trim() || "Umum";
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
    folder,
  }).returning();

  res.json({ ok: true, item: inserted });
});

// PATCH /api/media/folders/rename — rename folder (update semua gambar di folder lama)
router.patch("/folders/rename", async (req, res) => {
  const oldName = (req.body.oldName as string)?.trim();
  const newName = (req.body.newName as string)?.trim();
  if (!oldName || !newName) return res.status(400).json({ error: "oldName dan newName wajib diisi" });
  if (oldName === newName) return res.json({ ok: true, affected: 0 });
  const result = await db
    .update(mediaAssetsTable)
    .set({ folder: newName })
    .where(eq(mediaAssetsTable.folder, oldName));
  res.json({ ok: true, affected: (result as any).rowCount ?? 0 });
});

// PATCH /api/media/:id/folder — pindahkan gambar ke folder lain
router.patch("/:id/folder", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID tidak valid" });
  const folder = (req.body.folder as string)?.trim();
  if (!folder) return res.status(400).json({ error: "Nama folder wajib diisi" });
  const [updated] = await db
    .update(mediaAssetsTable)
    .set({ folder })
    .where(eq(mediaAssetsTable.id, id))
    .returning();
  res.json({ ok: true, item: updated });
});

// DELETE /api/media/:id — hapus metadata dari DB
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: "ID tidak valid" });
  await db.delete(mediaAssetsTable).where(eq(mediaAssetsTable.id, id));
  res.json({ ok: true });
});

export default router;
