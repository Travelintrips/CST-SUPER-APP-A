import { Router } from "express";
import { db, correspondencesTable, correspondenceAttachmentsTable, customersTable, suppliersTable } from "@workspace/db";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();
const objectStorageService = new ObjectStorageService();

function serializeCorrespondence(c: typeof correspondencesTable.$inferSelect) {
  return {
    ...c,
    correspondedAt: c.correspondedAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    tags: c.tags ? c.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
  };
}

function serializeAttachment(a: typeof correspondenceAttachmentsTable.$inferSelect) {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
  };
}

// GET /api/correspondences
router.get("/", async (req, res) => {
  const { q, kind, direction, customerId, supplierId } = req.query;
  const conditions = [];
  if (kind) conditions.push(eq(correspondencesTable.kind, kind as "email" | "whatsapp" | "letter" | "other"));
  if (direction) conditions.push(eq(correspondencesTable.direction, direction as "inbound" | "outbound"));
  if (customerId) conditions.push(eq(correspondencesTable.customerId, Number(customerId)));
  if (supplierId) conditions.push(eq(correspondencesTable.supplierId, Number(supplierId)));
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(correspondencesTable.subject, like),
        ilike(correspondencesTable.body, like),
        ilike(correspondencesTable.extractedText, like),
        ilike(correspondencesTable.senderName, like),
        ilike(correspondencesTable.senderEmail, like),
        ilike(correspondencesTable.tags, like),
      )!
    );
  }
  const rows = await db
    .select()
    .from(correspondencesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(correspondencesTable.correspondedAt));
  return res.json(rows.map(serializeCorrespondence));
});

// GET /api/correspondences/:id
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db.select().from(correspondencesTable).where(eq(correspondencesTable.id, id));
  if (!row) return res.status(404).json({ message: "Korespondensi tidak ditemukan" });
  const attachments = await db
    .select()
    .from(correspondenceAttachmentsTable)
    .where(eq(correspondenceAttachmentsTable.correspondenceId, id))
    .orderBy(correspondenceAttachmentsTable.createdAt);

  let customerName: string | null = null;
  let supplierName: string | null = null;
  if (row.customerId) {
    const [c] = await db.select({ name: customersTable.name }).from(customersTable).where(eq(customersTable.id, row.customerId));
    customerName = c?.name ?? null;
  }
  if (row.supplierId) {
    const [s] = await db.select({ name: suppliersTable.name }).from(suppliersTable).where(eq(suppliersTable.id, row.supplierId));
    supplierName = s?.name ?? null;
  }

  return res.json({
    ...serializeCorrespondence(row),
    attachments: attachments.map(serializeAttachment),
    customerName,
    supplierName,
  });
});

// POST /api/correspondences
router.post("/", async (req, res) => {
  const {
    kind, direction, subject, body, senderName, senderEmail,
    receiverName, receiverEmail, customerId, supplierId, tags,
    correspondedAt, emailMessageId, emailThreadId,
  } = req.body;
  if (!subject?.trim()) return res.status(400).json({ message: "Subjek wajib diisi" });
  const [row] = await db.insert(correspondencesTable).values({
    kind: kind ?? "email",
    direction: direction ?? "inbound",
    subject: subject.trim(),
    body: body ?? null,
    senderName: senderName ?? null,
    senderEmail: senderEmail ?? null,
    receiverName: receiverName ?? null,
    receiverEmail: receiverEmail ?? null,
    customerId: customerId ?? null,
    supplierId: supplierId ?? null,
    tags: Array.isArray(tags) ? tags.join(", ") : (tags ?? null),
    correspondedAt: correspondedAt ? new Date(correspondedAt) : new Date(),
    emailMessageId: emailMessageId ?? null,
    emailThreadId: emailThreadId ?? null,
  }).returning();
  return res.status(201).json(serializeCorrespondence(row));
});

// PUT /api/correspondences/:id
router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const {
    kind, direction, subject, body, senderName, senderEmail,
    receiverName, receiverEmail, customerId, supplierId, tags,
    correspondedAt,
  } = req.body;
  if (!subject?.trim()) return res.status(400).json({ message: "Subjek wajib diisi" });
  const [row] = await db.update(correspondencesTable).set({
    kind: kind ?? "email",
    direction: direction ?? "inbound",
    subject: subject.trim(),
    body: body ?? null,
    senderName: senderName ?? null,
    senderEmail: senderEmail ?? null,
    receiverName: receiverName ?? null,
    receiverEmail: receiverEmail ?? null,
    customerId: customerId ?? null,
    supplierId: supplierId ?? null,
    tags: Array.isArray(tags) ? tags.join(", ") : (tags ?? null),
    correspondedAt: correspondedAt ? new Date(correspondedAt) : undefined,
  }).where(eq(correspondencesTable.id, id)).returning();
  if (!row) return res.status(404).json({ message: "Korespondensi tidak ditemukan" });
  return res.json(serializeCorrespondence(row));
});

// DELETE /api/correspondences/:id
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(correspondenceAttachmentsTable).where(eq(correspondenceAttachmentsTable.correspondenceId, id));
  await db.delete(correspondencesTable).where(eq(correspondencesTable.id, id));
  return res.json({ message: "Berhasil dihapus" });
});

// POST /api/correspondences/:id/attachments
router.post("/:id/attachments", async (req, res) => {
  const correspondenceId = Number(req.params.id);
  const { fileName, objectPath, mimeType, extractedText } = req.body;
  if (!objectPath) return res.status(400).json({ message: "objectPath wajib diisi" });
  const normalizedPath = objectStorageService.normalizeObjectEntityPath(objectPath);
  const [att] = await db.insert(correspondenceAttachmentsTable).values({
    correspondenceId,
    fileName: fileName ?? objectPath.split("/").pop() ?? "attachment",
    objectPath: normalizedPath,
    mimeType: mimeType ?? null,
    extractedText: extractedText ?? null,
  }).returning();
  return res.status(201).json(serializeAttachment(att));
});

// PUT /api/correspondences/:id/attachments/:attId/extracted-text
router.put("/:id/attachments/:attId/extracted-text", async (req, res) => {
  const attId = Number(req.params.attId);
  const { extractedText } = req.body;
  const [att] = await db.update(correspondenceAttachmentsTable)
    .set({ extractedText: extractedText ?? null })
    .where(eq(correspondenceAttachmentsTable.id, attId))
    .returning();
  if (!att) return res.status(404).json({ message: "Lampiran tidak ditemukan" });
  return res.json(serializeAttachment(att));
});

// DELETE /api/correspondences/:id/attachments/:attId
router.delete("/:id/attachments/:attId", async (req, res) => {
  const attId = Number(req.params.attId);
  await db.delete(correspondenceAttachmentsTable).where(eq(correspondenceAttachmentsTable.id, attId));
  return res.json({ message: "Lampiran berhasil dihapus" });
});

export default router;
