import { Router } from "express";
import { db, ppjkOrdersTable, ppjkAuditLogsTable, freightCustomsDocsTable } from "@workspace/db";
import { eq, desc, and, ilike, or, count } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

// ── Nomor order generator ─────────────────────────────────────────────────────
async function generatePpjkNumber(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const [{ value }] = await db
    .select({ value: count() })
    .from(ppjkOrdersTable);
  const seq = String(Number(value) + 1).padStart(5, "0");
  return `PPJK/${year}/${month}/${seq}`;
}

// ── Audit log helper ──────────────────────────────────────────────────────────
async function logAudit(
  ppjkOrderId: number,
  action: string,
  changedBy: string,
  changedById: string | null,
  extra: Partial<{ fromStatus: string; toStatus: string; field: string; oldValue: string; newValue: string; notes: string }> = {}
) {
  await db.insert(ppjkAuditLogsTable).values({
    ppjkOrderId,
    action,
    changedBy,
    changedById: changedById ?? null,
    fromStatus: extra.fromStatus ?? null,
    toStatus: extra.toStatus ?? null,
    field: extra.field ?? null,
    oldValue: extra.oldValue ?? null,
    newValue: extra.newValue ?? null,
    notes: extra.notes ?? null,
  });
}

// ── GET /api/ppjk/orders ──────────────────────────────────────────────────────
router.get("/orders", requireAdmin, async (req, res) => {
  const { status, tradeType, customsStatus, q, limit = "100", offset = "0" } = req.query;
  const conditions = [];
  if (status && status !== "all") conditions.push(eq(ppjkOrdersTable.status, String(status)));
  if (tradeType && tradeType !== "all") conditions.push(eq(ppjkOrdersTable.tradeType, String(tradeType)));
  if (customsStatus && customsStatus !== "all") conditions.push(eq(ppjkOrdersTable.customsStatus, String(customsStatus)));
  if (q) {
    const qStr = `%${q}%`;
    conditions.push(
      or(
        ilike(ppjkOrdersTable.orderNumber, qStr),
        ilike(ppjkOrdersTable.customerName, qStr),
        ilike(ppjkOrdersTable.customerCompany, qStr),
        ilike(ppjkOrdersTable.nomorAju, qStr),
        ilike(ppjkOrdersTable.nomorPib, qStr),
        ilike(ppjkOrdersTable.nomorPeb, qStr),
      )
    );
  }
  const rows = await db
    .select()
    .from(ppjkOrdersTable)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(ppjkOrdersTable.createdAt))
    .limit(Number(limit))
    .offset(Number(offset));
  const [{ total }] = await db.select({ total: count() }).from(ppjkOrdersTable).where(conditions.length > 0 ? and(...conditions) : undefined);
  return res.json({ orders: rows, total: Number(total) });
});

// ── POST /api/ppjk/orders ─────────────────────────────────────────────────────
router.post("/orders", requireAdmin, async (req, res) => {
  const {
    customerName, customerEmail, customerPhone, customerCompany, customerNpwp,
    tradeType, commodity, hsCode, origin, destination, grossWeight, cbm,
    packingType, koli, portOfEntry, kantorPabean, jenisPelayanan,
    vendorId, vendorName, notes, adminNotes,
    nomorAju, nomorPib, nomorPeb, nomorSppb, tanggalAju,
    nilaiPabean, beaMasuk, ppnImpor, pphImpor, totalTagihanPabean,
    serviceFee, ppnServiceFee, totalServiceFee,
    companyId,
  } = req.body;
  if (!customerName) return res.status(400).json({ message: "customerName wajib" });

  const orderNumber = await generatePpjkNumber();
  const user = (req as any).user;
  const changedBy = user?.name ?? user?.email ?? "system";
  const changedById = user?.id ?? null;

  const [created] = await db.insert(ppjkOrdersTable).values({
    orderNumber,
    companyId: companyId ?? null,
    customerName,
    customerEmail: customerEmail || null,
    customerPhone: customerPhone || null,
    customerCompany: customerCompany || null,
    customerNpwp: customerNpwp || null,
    tradeType: tradeType || "import",
    commodity: commodity || null,
    hsCode: hsCode || null,
    origin: origin || null,
    destination: destination || null,
    grossWeight: grossWeight ?? null,
    cbm: cbm ?? null,
    packingType: packingType || null,
    koli: koli ?? null,
    portOfEntry: portOfEntry || null,
    kantorPabean: kantorPabean || null,
    jenisPelayanan: jenisPelayanan || null,
    nomorAju: nomorAju || null,
    nomorPib: nomorPib || null,
    nomorPeb: nomorPeb || null,
    nomorSppb: nomorSppb || null,
    tanggalAju: tanggalAju || null,
    nilaiPabean: nilaiPabean ?? null,
    beaMasuk: beaMasuk ?? null,
    ppnImpor: ppnImpor ?? null,
    pphImpor: pphImpor ?? null,
    totalTagihanPabean: totalTagihanPabean ?? null,
    serviceFee: serviceFee ?? null,
    ppnServiceFee: ppnServiceFee ?? null,
    totalServiceFee: totalServiceFee ?? null,
    vendorId: vendorId ?? null,
    vendorName: vendorName || null,
    notes: notes || null,
    adminNotes: adminNotes || null,
    createdById: changedById,
    status: "draft",
  }).returning();

  await logAudit(created.id, "created", changedBy, changedById, { toStatus: "draft" });
  return res.status(201).json(created);
});

// ── GET /api/ppjk/orders/:id ─────────────────────────────────────────────────
router.get("/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [order] = await db.select().from(ppjkOrdersTable).where(eq(ppjkOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const docs = await db
    .select()
    .from(freightCustomsDocsTable)
    .where(and(
      eq(freightCustomsDocsTable.sourceModule, "ppjk"),
      eq(freightCustomsDocsTable.sourceOrderId, id)
    ))
    .orderBy(desc(freightCustomsDocsTable.createdAt));

  const auditLogs = await db
    .select()
    .from(ppjkAuditLogsTable)
    .where(eq(ppjkAuditLogsTable.ppjkOrderId, id))
    .orderBy(desc(ppjkAuditLogsTable.createdAt));

  return res.json({
    order,
    docs: docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })),
    auditLogs: auditLogs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })),
  });
});

// ── PUT /api/ppjk/orders/:id ─────────────────────────────────────────────────
router.put("/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(ppjkOrdersTable).where(eq(ppjkOrdersTable.id, id));
  if (!existing) return res.status(404).json({ message: "Order tidak ditemukan" });

  const user = (req as any).user;
  const changedBy = user?.name ?? user?.email ?? "system";
  const changedById = user?.id ?? null;

  const allowed = [
    "customerName","customerEmail","customerPhone","customerCompany","customerNpwp",
    "tradeType","commodity","hsCode","origin","destination","grossWeight","cbm",
    "packingType","koli","portOfEntry","kantorPabean","jenisPelayanan",
    "nomorAju","nomorPib","nomorPeb","nomorSppb","tanggalAju",
    "nilaiPabean","beaMasuk","ppnImpor","pphImpor","totalTagihanPabean",
    "serviceFee","ppnServiceFee","totalServiceFee",
    "vendorId","vendorName","notes","adminNotes","status","customsStatus",
  ];

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  const auditFields: string[] = [];

  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      const oldVal = String((existing as any)[key] ?? "");
      const newVal = String(req.body[key] ?? "");
      if (oldVal !== newVal) auditFields.push(key);
      patch[key] = req.body[key] === "" ? null : req.body[key];
    }
  }

  const [updated] = await db
    .update(ppjkOrdersTable)
    .set(patch)
    .where(eq(ppjkOrdersTable.id, id))
    .returning();

  for (const field of auditFields) {
    if (field === "status") {
      await logAudit(id, "status_changed", changedBy, changedById, {
        fromStatus: existing.status, toStatus: String(patch[field]),
      });
    } else if (field === "customsStatus") {
      await logAudit(id, "customs_status_changed", changedBy, changedById, {
        fromStatus: existing.customsStatus ?? undefined, toStatus: String(patch[field] ?? ""),
      });
    } else {
      await logAudit(id, "field_updated", changedBy, changedById, {
        field, oldValue: String((existing as any)[field] ?? ""), newValue: String(patch[field] ?? ""),
      });
    }
  }

  return res.json(updated);
});

// ── POST /api/ppjk/orders/:id/status ─────────────────────────────────────────
router.post("/orders/:id/status", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { status, customsStatus, notes } = req.body;
  if (!status && !customsStatus) return res.status(400).json({ message: "status atau customsStatus wajib" });

  const [existing] = await db.select().from(ppjkOrdersTable).where(eq(ppjkOrdersTable.id, id));
  if (!existing) return res.status(404).json({ message: "Order tidak ditemukan" });

  const user = (req as any).user;
  const changedBy = user?.name ?? user?.email ?? "system";
  const changedById = user?.id ?? null;

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (status) patch.status = status;
  if (customsStatus) patch.customsStatus = customsStatus;

  const [updated] = await db
    .update(ppjkOrdersTable)
    .set(patch)
    .where(eq(ppjkOrdersTable.id, id))
    .returning();

  if (status) {
    await logAudit(id, "status_changed", changedBy, changedById, {
      fromStatus: existing.status, toStatus: status, notes,
    });
  }
  if (customsStatus) {
    await logAudit(id, "customs_status_changed", changedBy, changedById, {
      fromStatus: existing.customsStatus ?? undefined, toStatus: customsStatus, notes,
    });
  }
  return res.json(updated);
});

// ── DELETE /api/ppjk/orders/:id ───────────────────────────────────────────────
router.delete("/orders/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [deleted] = await db.delete(ppjkOrdersTable).where(eq(ppjkOrdersTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Order tidak ditemukan" });
  return res.json({ message: "Deleted" });
});

// ── GET /api/ppjk/orders/:id/audit-log ───────────────────────────────────────
router.get("/orders/:id/audit-log", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const logs = await db
    .select()
    .from(ppjkAuditLogsTable)
    .where(eq(ppjkAuditLogsTable.ppjkOrderId, id))
    .orderBy(desc(ppjkAuditLogsTable.createdAt));
  return res.json(logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

export default router;
