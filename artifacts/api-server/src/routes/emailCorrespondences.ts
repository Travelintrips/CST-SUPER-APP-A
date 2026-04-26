import { Router } from "express";
import {
  db,
  emailCorrespondencesTable,
  emailAttachmentsTable,
  emailLinksTable,
} from "@workspace/db";
import { eq, desc, ilike, or, and } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { auth } from "@clerk/express";

const router = Router();

function serializeCorrespondence(c: typeof emailCorrespondencesTable.$inferSelect) {
  return {
    ...c,
    receivedAt: c.receivedAt.toISOString(),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}

function serializeAttachment(a: typeof emailAttachmentsTable.$inferSelect) {
  return {
    ...a,
    createdAt: a.createdAt.toISOString(),
  };
}

function serializeLink(l: typeof emailLinksTable.$inferSelect) {
  return {
    ...l,
    validatedAt: l.validatedAt ? l.validatedAt.toISOString() : null,
    createdAt: l.createdAt.toISOString(),
  };
}

// GET /api/email-correspondences
router.get("/", async (req, res) => {
  const { q, status } = req.query;
  const conditions = [];
  if (status) conditions.push(eq(emailCorrespondencesTable.status, status as string));
  if (q) {
    const like = `%${q}%`;
    conditions.push(
      or(
        ilike(emailCorrespondencesTable.subject, like),
        ilike(emailCorrespondencesTable.fromEmail, like),
        ilike(emailCorrespondencesTable.toEmail, like),
        ilike(emailCorrespondencesTable.body, like),
      ),
    );
  }

  const rows = await db
    .select()
    .from(emailCorrespondencesTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(emailCorrespondencesTable.receivedAt))
    .limit(200);

  return res.json(rows.map(serializeCorrespondence));
});

// GET /api/email-correspondences/:id
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [row] = await db
    .select()
    .from(emailCorrespondencesTable)
    .where(eq(emailCorrespondencesTable.id, id))
    .limit(1);
  if (!row) return res.status(404).json({ message: "Email tidak ditemukan" });

  const attachments = await db
    .select()
    .from(emailAttachmentsTable)
    .where(eq(emailAttachmentsTable.emailCorrespondenceId, id))
    .orderBy(emailAttachmentsTable.id);

  const links = await db
    .select()
    .from(emailLinksTable)
    .where(eq(emailLinksTable.emailCorrespondenceId, id))
    .orderBy(desc(emailLinksTable.createdAt));

  return res.json({
    ...serializeCorrespondence(row),
    attachments: attachments.map(serializeAttachment),
    links: links.map(serializeLink),
  });
});

// POST /api/email-correspondences/:id/validate-status
router.post("/:id/validate-status", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const validStatuses = ["new", "validated", "rejected", "archived"];
  if (!status || !validStatuses.includes(status)) {
    return res.status(400).json({ message: `status harus salah satu dari: ${validStatuses.join(", ")}` });
  }
  const [row] = await db
    .update(emailCorrespondencesTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(emailCorrespondencesTable.id, id))
    .returning();
  if (!row) return res.status(404).json({ message: "Email tidak ditemukan" });
  return res.json(serializeCorrespondence(row));
});

// GET /api/email-correspondences/:id/links
router.get("/:id/links", async (req, res) => {
  const id = Number(req.params.id);
  const links = await db
    .select()
    .from(emailLinksTable)
    .where(eq(emailLinksTable.emailCorrespondenceId, id))
    .orderBy(desc(emailLinksTable.createdAt));
  return res.json(links.map(serializeLink));
});

// POST /api/email-correspondences/:id/links
router.post("/:id/links", async (req, res) => {
  const emailCorrespondenceId = Number(req.params.id);
  const { linkedType, linkedId, linkReason, notes } = req.body;

  const validLinkedTypes = ["sales_order", "purchase_order", "expense", "shipment", "payment", "invoice"];
  if (!linkedType || !validLinkedTypes.includes(linkedType)) {
    return res.status(400).json({ message: `linkedType harus salah satu dari: ${validLinkedTypes.join(", ")}` });
  }
  if (!linkedId || isNaN(Number(linkedId))) {
    return res.status(400).json({ message: "linkedId harus berupa angka" });
  }

  const [emailRow] = await db
    .select({ id: emailCorrespondencesTable.id })
    .from(emailCorrespondencesTable)
    .where(eq(emailCorrespondencesTable.id, emailCorrespondenceId))
    .limit(1);
  if (!emailRow) return res.status(404).json({ message: "Email tidak ditemukan" });

  const [link] = await db
    .insert(emailLinksTable)
    .values({
      emailCorrespondenceId,
      linkedType,
      linkedId: Number(linkedId),
      linkReason: linkReason ?? null,
      notes: notes ?? null,
    })
    .returning();

  // Also update status to "linked"
  await db
    .update(emailCorrespondencesTable)
    .set({ status: "linked", updatedAt: new Date() })
    .where(eq(emailCorrespondencesTable.id, emailCorrespondenceId));

  return res.status(201).json(serializeLink(link));
});

// PUT /api/email-correspondences/:id/links/:linkId/validate
router.put("/:id/links/:linkId/validate", async (req, res) => {
  const linkId = Number(req.params.linkId);
  const { notes } = req.body;
  const { userId } = auth()(req, res, () => {}) as unknown as { userId: string | null };

  const [link] = await db
    .update(emailLinksTable)
    .set({
      isValidated: true,
      validatedBy: userId ?? null,
      validatedAt: new Date(),
      notes: notes ?? null,
    })
    .where(eq(emailLinksTable.id, linkId))
    .returning();
  if (!link) return res.status(404).json({ message: "Link tidak ditemukan" });
  return res.json(serializeLink(link));
});

// DELETE /api/email-correspondences/:id/links/:linkId
router.delete("/:id/links/:linkId", async (req, res) => {
  const linkId = Number(req.params.linkId);
  await db.delete(emailLinksTable).where(eq(emailLinksTable.id, linkId));
  return res.json({ message: "Link berhasil dihapus" });
});

export default router;
