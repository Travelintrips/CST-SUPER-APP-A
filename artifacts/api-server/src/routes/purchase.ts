import { Router } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { streamInvoicePdf } from "../lib/pdfInvoice.js";
import { postPurchaseBill } from "../lib/accounting.js";
import {
  db,
  suppliersTable,
  purchaseDocumentsTable,
  purchaseDocumentLinesTable,
  accountingTaxesTable,
} from "@workspace/db";
import { eq, sql, desc, and, type SQL } from "drizzle-orm";

async function computeTax(subtotal: number, taxRateId: number | null | undefined): Promise<{ taxAmount: number; grandTotal: number }> {
  if (!taxRateId) return { taxAmount: 0, grandTotal: subtotal };
  const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, taxRateId));
  if (!tax) return { taxAmount: 0, grandTotal: subtotal };
  const taxAmount = Math.round(subtotal * Number(tax.rate)) / 100;
  return { taxAmount, grandTotal: subtotal + taxAmount };
}

const router = Router();

router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

type PurchaseKind = "rfq" | "order";
type PurchaseStatus = "draft" | "sent" | "confirmed" | "done" | "cancelled";
type PurchaseBillStatus = "none" | "to_bill" | "billed";
type PurchaseReceiveStatus = "none" | "to_receive" | "received";

interface LineInput {
  productId?: number | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitCost: number;
}

function serializeDoc(d: typeof purchaseDocumentsTable.$inferSelect) {
  return {
    ...d,
    totalAmount: Number(d.totalAmount),
    taxAmount: Number(d.taxAmount ?? 0),
    grandTotal: Number(d.grandTotal ?? d.totalAmount),
    expectedDate: d.expectedDate ? d.expectedDate.toISOString() : null,
    confirmedAt: d.confirmedAt ? d.confirmedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function serializeLine(l: typeof purchaseDocumentLinesTable.$inferSelect) {
  return {
    ...l,
    quantity: Number(l.quantity),
    unitCost: Number(l.unitCost),
    subtotal: Number(l.subtotal),
  };
}

async function nextDocNumber(kind: PurchaseKind): Promise<string> {
  const prefix = kind === "rfq" ? "RFQ" : "PO";
  const year = new Date().getFullYear();
  const pattern = `${prefix}/${year}/%`;
  const [row] = await db
    .select({
      maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(doc_number, '/', 3) AS int)), 0)`,
    })
    .from(purchaseDocumentsTable)
    .where(sql`doc_number LIKE ${pattern}`);
  const seq = (Number(row?.maxSeq ?? 0) + 1).toString().padStart(5, "0");
  return `${prefix}/${year}/${seq}`;
}

router.get("/summary", async (_req, res) => {
  const docs = await db.select().from(purchaseDocumentsTable);
  const rfqCount = docs.filter((d) => d.kind === "rfq").length;
  const ordersCount = docs.filter((d) => d.kind === "order").length;
  const toBillCount = docs.filter((d) => d.kind === "order" && d.billStatus === "to_bill").length;
  const totalSpend = docs
    .filter((d) => d.kind === "order" && d.status !== "cancelled")
    .reduce((sum, d) => sum + Number(d.totalAmount), 0);

  const vendorTotals = new Map<string, number>();
  for (const d of docs) {
    if (d.kind !== "order" || d.status === "cancelled") continue;
    const cur = vendorTotals.get(d.supplierName) || 0;
    vendorTotals.set(d.supplierName, cur + Number(d.totalAmount));
  }
  let topVendor: string | null = null;
  let topAmount = 0;
  for (const [name, amt] of vendorTotals) {
    if (amt > topAmount) {
      topAmount = amt;
      topVendor = name;
    }
  }
  return res.json({ rfqCount, ordersCount, toBillCount, totalSpend, topVendor });
});

router.get("/documents", async (req, res) => {
  const kind = req.query["kind"] as PurchaseKind | undefined;
  const billStatus = req.query["billStatus"] as PurchaseBillStatus | undefined;
  const conds: SQL[] = [];
  if (kind === "rfq" || kind === "order") conds.push(eq(purchaseDocumentsTable.kind, kind));
  if (billStatus === "none" || billStatus === "to_bill" || billStatus === "billed")
    conds.push(eq(purchaseDocumentsTable.billStatus, billStatus));
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
  const rows = where
    ? await db
        .select()
        .from(purchaseDocumentsTable)
        .where(where)
        .orderBy(desc(purchaseDocumentsTable.createdAt))
    : await db.select().from(purchaseDocumentsTable).orderBy(desc(purchaseDocumentsTable.createdAt));
  return res.json(rows.map(serializeDoc));
});

async function loadDocWithLines(id: number) {
  const [doc] = await db
    .select()
    .from(purchaseDocumentsTable)
    .where(eq(purchaseDocumentsTable.id, id));
  if (!doc) return null;
  const lines = await db
    .select()
    .from(purchaseDocumentLinesTable)
    .where(eq(purchaseDocumentLinesTable.documentId, id))
    .orderBy(purchaseDocumentLinesTable.id);
  return { ...serializeDoc(doc), lines: lines.map(serializeLine) };
}

router.get("/documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const doc = await loadDocWithLines(id);
  if (!doc) return res.status(404).json({ message: "Document not found" });
  return res.json(doc);
});

router.post("/documents", async (req, res) => {
  const { kind, supplierId, supplierName, expectedDate, notes, lines, taxRateId } = req.body ?? {};
  if (typeof supplierName !== "string" || !supplierName.trim())
    return res.status(400).json({ message: "supplierName required" });
  if (!Array.isArray(lines) || lines.length === 0)
    return res.status(400).json({ message: "At least one line required" });

  const docKind: PurchaseKind = kind === "order" ? "order" : "rfq";

  if (supplierId !== undefined && supplierId !== null) {
    const [s] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, supplierId));
    if (!s) return res.status(400).json({ message: "Supplier not found" });
  }

  const docNumber = await nextDocNumber(docKind);
  const total = (lines as LineInput[]).reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unitCost),
    0,
  );
  const { taxAmount, grandTotal } = await computeTax(total, taxRateId);

  const [doc] = await db
    .insert(purchaseDocumentsTable)
    .values({
      docNumber,
      kind: docKind,
      status: "draft",
      supplierId: supplierId ?? null,
      supplierName,
      totalAmount: String(total),
      taxRateId: taxRateId ?? null,
      taxAmount: String(taxAmount),
      grandTotal: String(grandTotal),
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes: notes ?? null,
    })
    .returning();

  await db.insert(purchaseDocumentLinesTable).values(
    (lines as LineInput[]).map((l) => ({
      documentId: doc.id,
      productId: l.productId ?? null,
      name: l.name,
      description: l.description ?? null,
      quantity: String(l.quantity),
      unitCost: String(l.unitCost),
      subtotal: String(Number(l.quantity) * Number(l.unitCost)),
    })),
  );

  const detail = await loadDocWithLines(doc.id);
  return res.status(201).json(detail);
});

router.put("/documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const existing = await loadDocWithLines(id);
  if (!existing) return res.status(404).json({ message: "Document not found" });

  const { supplierId, supplierName, expectedDate, notes, lines, kind, taxRateId } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof supplierName === "string") patch["supplierName"] = supplierName;
  if (supplierId !== undefined) patch["supplierId"] = supplierId;
  if (expectedDate !== undefined) patch["expectedDate"] = expectedDate ? new Date(expectedDate) : null;
  if (notes !== undefined) patch["notes"] = notes;
  if (kind === "rfq" || kind === "order") patch["kind"] = kind;
  if (taxRateId !== undefined) patch["taxRateId"] = taxRateId;

  if (Array.isArray(lines)) {
    const total = (lines as LineInput[]).reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unitCost),
      0,
    );
    const effTaxId = taxRateId !== undefined ? taxRateId : existing.taxRateId;
    const { taxAmount, grandTotal } = await computeTax(total, effTaxId);
    patch["totalAmount"] = String(total);
    patch["taxAmount"] = String(taxAmount);
    patch["grandTotal"] = String(grandTotal);
    await db
      .delete(purchaseDocumentLinesTable)
      .where(eq(purchaseDocumentLinesTable.documentId, id));
    if (lines.length > 0) {
      await db.insert(purchaseDocumentLinesTable).values(
        (lines as LineInput[]).map((l) => ({
          documentId: id,
          productId: l.productId ?? null,
          name: l.name,
          description: l.description ?? null,
          quantity: String(l.quantity),
          unitCost: String(l.unitCost),
          subtotal: String(Number(l.quantity) * Number(l.unitCost)),
        })),
      );
    }
  } else if (taxRateId !== undefined) {
    const total = Number(existing.totalAmount);
    const { taxAmount, grandTotal } = await computeTax(total, taxRateId);
    patch["taxAmount"] = String(taxAmount);
    patch["grandTotal"] = String(grandTotal);
  }

  await db.update(purchaseDocumentsTable).set(patch).where(eq(purchaseDocumentsTable.id, id));
  const detail = await loadDocWithLines(id);
  return res.json(detail);
});

router.delete("/documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db
    .delete(purchaseDocumentsTable)
    .where(eq(purchaseDocumentsTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Document not found" });
  return res.json({ message: "Deleted", id });
});

router.post("/documents/:id/action", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { action } = req.body ?? {};
  const [doc] = await db
    .select()
    .from(purchaseDocumentsTable)
    .where(eq(purchaseDocumentsTable.id, id));
  if (!doc) return res.status(404).json({ message: "Document not found" });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  switch (action) {
    case "send":
      patch["status"] = "sent" satisfies PurchaseStatus;
      break;
    case "confirm":
      patch["status"] = "confirmed" satisfies PurchaseStatus;
      patch["kind"] = "order";
      patch["confirmedAt"] = new Date();
      patch["receiveStatus"] = "to_receive" satisfies PurchaseReceiveStatus;
      patch["billStatus"] = "to_bill" satisfies PurchaseBillStatus;
      break;
    case "cancel":
      patch["status"] = "cancelled" satisfies PurchaseStatus;
      break;
    case "draft":
      patch["status"] = "draft" satisfies PurchaseStatus;
      break;
    case "mark_received":
      patch["receiveStatus"] = "received" satisfies PurchaseReceiveStatus;
      if (doc.billStatus === "billed") patch["status"] = "done" satisfies PurchaseStatus;
      break;
    case "mark_billed":
      patch["billStatus"] = "billed" satisfies PurchaseBillStatus;
      if (doc.receiveStatus === "received") patch["status"] = "done" satisfies PurchaseStatus;
      break;
    default:
      return res.status(400).json({ message: "Invalid action" });
  }

  await db.update(purchaseDocumentsTable).set(patch).where(eq(purchaseDocumentsTable.id, id));

  if (action === "mark_billed" && doc.billStatus !== "billed") {
    const net = Number(doc.totalAmount);
    const taxAmount = Number(doc.taxAmount ?? 0);
    void postPurchaseBill({
      purchaseDocId: doc.id,
      docNumber: doc.docNumber,
      supplierName: doc.supplierName,
      netAmount: net,
      taxAmount,
      taxAccountId: null,
    });
  }

  const detail = await loadDocWithLines(id);
  return res.json(detail);
});

router.get("/documents/:id/pdf", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const detail = await loadDocWithLines(id);
  if (!detail) { res.status(404).json({ message: "Document not found" }); return; }
  let supplier: typeof suppliersTable.$inferSelect | null = null;
  if (detail.supplierId) {
    const rows = await db.select().from(suppliersTable).where(eq(suppliersTable.id, detail.supplierId)).limit(1);
    supplier = rows[0] ?? null;
  }
  const titleMap: Record<string, string> = {
    rfq: "REQUEST FOR QUOTATION",
    order: "PURCHASE ORDER",
  };
  streamInvoicePdf(res, {
    title: titleMap[detail.kind] ?? "DOKUMEN PEMBELIAN",
    docNumber: detail.docNumber,
    status: detail.status,
    kind: detail.kind,
    partyLabel: "Vendor",
    partyName: detail.supplierName,
    partyEmail: supplier?.contactEmail ?? null,
    partyAddress: supplier?.country ?? null,
    validUntil: null,
    expectedDate: detail.expectedDate,
    confirmedAt: detail.confirmedAt,
    createdAt: detail.createdAt,
    notes: detail.notes,
    lines: detail.lines.map((l: any) => ({
      name: l.name,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitCost ?? l.unitPrice ?? 0),
      subtotal: Number(l.subtotal),
    })),
    totalAmount: Number(detail.totalAmount),
    receiveStatus: detail.receiveStatus,
    billStatus: detail.billStatus,
  });
});

export default router;
