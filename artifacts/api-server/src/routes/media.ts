import { Router } from "express";
import multer from "multer";

import { db, mediaAssetsTable } from "@workspace/db";
import { eq, desc, sql, inArray } from "drizzle-orm";
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
  try {
    const rows = await db
      .select({
        folder: mediaAssetsTable.folder,
        count: sql<number>`cast(count(*) as int)`,
      })
      .from(mediaAssetsTable)
      .groupBy(mediaAssetsTable.folder)
      .orderBy(mediaAssetsTable.folder);
    res.json({ folders: rows });
  } catch (err: any) {
    console.error("[media/folders] Error:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Gagal mengambil daftar folder" });
  }
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
  try {
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

    // Upload ke private storage (tidak memerlukan PUBLIC_OBJECT_SEARCH_PATHS)
    const objectPath = await objectStorageService.uploadPrivateEntity(buffer, finalContentType);
    // objectPath = "/objects/uploads/{uuid}" — serve via /api/storage/objects/...
    const url = `/api/storage${objectPath}`; // e.g. /api/storage/objects/uploads/{uuid}

    const [inserted] = await db.insert(mediaAssetsTable).values({
      originalName: originalname,
      contentType: finalContentType,
      sizeBytes: buffer.byteLength,
      url,
      objectPath,
      uploadedBy: (req as any).user?.email ?? null,
      folder,
    }).returning();

    res.json({ ok: true, item: inserted });
  } catch (err: any) {
    console.error("[media/upload] Error:", err?.message ?? err);
    res.status(500).json({ error: err?.message ?? "Upload gagal" });
  }
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

// DELETE /api/media/folders/:name — hapus folder, pindahkan isinya ke "Umum"
router.delete("/folders/:name", async (req, res) => {
  const name = decodeURIComponent(req.params.name).trim();
  if (!name || name === "Umum") {
    return res.status(400).json({ error: "Folder ini tidak dapat dihapus" });
  }
  const result = await db
    .update(mediaAssetsTable)
    .set({ folder: "Umum" })
    .where(eq(mediaAssetsTable.folder, name));
  res.json({ ok: true, moved: (result as any).rowCount ?? 0 });
});

// POST /api/media/bulk-move — pindahkan banyak gambar ke satu folder
router.post("/bulk-move", async (req, res) => {
  const ids = (req.body.ids as number[]) ?? [];
  const folder = (req.body.folder as string)?.trim();
  if (!ids.length || !folder) return res.status(400).json({ error: "ids dan folder wajib diisi" });
  const result = await db
    .update(mediaAssetsTable)
    .set({ folder })
    .where(inArray(mediaAssetsTable.id, ids));
  res.json({ ok: true, affected: (result as any).rowCount ?? 0 });
});

// POST /api/media/bulk-delete — hapus banyak gambar sekaligus
router.post("/bulk-delete", async (req, res) => {
  const ids = (req.body.ids as number[]) ?? [];
  if (!ids.length) return res.status(400).json({ error: "ids wajib diisi" });
  const result = await db.delete(mediaAssetsTable).where(inArray(mediaAssetsTable.id, ids));
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
