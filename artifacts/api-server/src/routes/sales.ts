import { Router } from "express";
import {
  db,
  customersTable,
  salesDocumentsTable,
  salesDocumentLinesTable,
  accountingTaxesTable,
  freightShipmentsTable,
} from "@workspace/db";
import { eq, sql, desc, and, count, type SQL } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { streamInvoicePdf, buildInvoicePdfBuffer } from "../lib/pdfInvoice.js";
import { postSalesInvoice } from "../lib/accounting.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer.js";

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

type SalesDocKind = "quote" | "order";
type SalesInvoiceStatus = "none" | "to_invoice" | "invoiced";
type SalesDocStatus = "draft" | "sent" | "confirmed" | "done" | "cancelled";

interface LineInput {
  productId?: number | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
}

function serializeCustomer(c: typeof customersTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

function serializeDoc(d: typeof salesDocumentsTable.$inferSelect) {
  return {
    ...d,
    totalAmount: Number(d.totalAmount),
    taxAmount: Number(d.taxAmount ?? 0),
    grandTotal: Number(d.grandTotal ?? d.totalAmount),
    amountPaid: Number(d.amountPaid ?? 0),
    validUntil: d.validUntil ? d.validUntil.toISOString() : null,
    expectedDate: d.expectedDate ? d.expectedDate.toISOString() : null,
    confirmedAt: d.confirmedAt ? d.confirmedAt.toISOString() : null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
  };
}

function serializeLine(l: typeof salesDocumentLinesTable.$inferSelect) {
  return {
    ...l,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unitPrice),
    subtotal: Number(l.subtotal),
  };
}

async function nextDocNumber(kind: SalesDocKind): Promise<string> {
  const prefix = kind === "quote" ? "SQ" : "SO";
  const year = new Date().getFullYear();
  const pattern = `${prefix}/${year}/%`;
  const [row] = await db
    .select({
      maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(doc_number, '/', 3) AS int)), 0)`,
    })
    .from(salesDocumentsTable)
    .where(sql`doc_number LIKE ${pattern}`);
  const seq = (Number(row?.maxSeq ?? 0) + 1).toString().padStart(5, "0");
  return `${prefix}/${year}/${seq}`;
}

// GET /api/sales/summary
router.get("/summary", async (_req, res) => {
  const docs = await db.select().from(salesDocumentsTable);
  const customers = await db.select().from(customersTable);
  const quotationsCount = docs.filter((d) => d.kind === "quote").length;
  const ordersCount = docs.filter((d) => d.kind === "order").length;
  const toInvoiceCount = docs.filter(
    (d) => d.kind === "order" && d.invoiceStatus === "to_invoice",
  ).length;
  const totalRevenue = docs
    .filter((d) => d.kind === "order" && d.status !== "cancelled")
    .reduce((sum, d) => sum + Number(d.totalAmount), 0);

  const customerTotals = new Map<string, number>();
  for (const d of docs) {
    if (d.kind !== "order" || d.status === "cancelled") continue;
    const cur = customerTotals.get(d.customerName) || 0;
    customerTotals.set(d.customerName, cur + Number(d.totalAmount));
  }
  let topCustomer: string | null = null;
  let topAmount = 0;
  for (const [name, amt] of customerTotals) {
    if (amt > topAmount) {
      topAmount = amt;
      topCustomer = name;
    }
  }
  void customers;
  return res.json({ quotationsCount, ordersCount, toInvoiceCount, totalRevenue, topCustomer });
});

// CUSTOMERS
router.get("/customers", async (_req, res) => {
  const rows = await db.select().from(customersTable).orderBy(customersTable.name);
  return res.json(rows.map(serializeCustomer));
});

router.post("/customers", async (req, res) => {
  const { name, email, phone, taxId, address, notes, defaultSalesTaxId } = req.body ?? {};
  if (typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "name required" });
  }
  const [created] = await db
    .insert(customersTable)
    .values({ name, email, phone, taxId, address, notes, defaultSalesTaxId: defaultSalesTaxId ?? null })
    .returning();
  return res.status(201).json(serializeCustomer(created));
});

router.put("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { name, email, phone, taxId, address, notes, defaultSalesTaxId } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (typeof name === "string") patch["name"] = name;
  if (email !== undefined) patch["email"] = email;
  if (phone !== undefined) patch["phone"] = phone;
  if (taxId !== undefined) patch["taxId"] = taxId;
  if (address !== undefined) patch["address"] = address;
  if (notes !== undefined) patch["notes"] = notes;
  if (defaultSalesTaxId !== undefined) patch["defaultSalesTaxId"] = defaultSalesTaxId;
  const [updated] = await db
    .update(customersTable)
    .set(patch)
    .where(eq(customersTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ message: "Customer not found" });
  return res.json(serializeCustomer(updated));
});

router.delete("/customers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db
    .delete(customersTable)
    .where(eq(customersTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Customer not found" });
  return res.json({ message: "Deleted", id });
});

// DOCUMENTS
router.get("/documents", async (req, res) => {
  const kind = req.query["kind"] as SalesDocKind | undefined;
  const invoiceStatus = req.query["invoiceStatus"] as SalesInvoiceStatus | undefined;
  const conds: SQL[] = [];
  if (kind === "quote" || kind === "order") conds.push(eq(salesDocumentsTable.kind, kind));
  if (invoiceStatus === "none" || invoiceStatus === "to_invoice" || invoiceStatus === "invoiced")
    conds.push(eq(salesDocumentsTable.invoiceStatus, invoiceStatus));
  const where = conds.length === 0 ? undefined : conds.length === 1 ? conds[0] : and(...conds);
  const rows = where
    ? await db.select().from(salesDocumentsTable).where(where).orderBy(desc(salesDocumentsTable.createdAt))
    : await db.select().from(salesDocumentsTable).orderBy(desc(salesDocumentsTable.createdAt));
  return res.json(rows.map(serializeDoc));
});

async function loadDocWithLines(id: number) {
  const [doc] = await db.select().from(salesDocumentsTable).where(eq(salesDocumentsTable.id, id));
  if (!doc) return null;
  const lines = await db
    .select()
    .from(salesDocumentLinesTable)
    .where(eq(salesDocumentLinesTable.documentId, id))
    .orderBy(salesDocumentLinesTable.id);
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
  const { kind, customerId, customerName, validUntil, expectedDate, notes, lines, taxRateId,
    origin, destination, transportMode, etd, eta } = req.body ?? {};
  if (typeof customerName !== "string" || !customerName.trim())
    return res.status(400).json({ message: "customerName required" });
  if (!Array.isArray(lines) || lines.length === 0)
    return res.status(400).json({ message: "At least one line required" });

  const docKind: SalesDocKind = kind === "order" ? "order" : "quote";
  const docNumber = await nextDocNumber(docKind);
  const total = (lines as LineInput[]).reduce(
    (s, l) => s + Number(l.quantity) * Number(l.unitPrice),
    0,
  );
  const { taxAmount, grandTotal } = await computeTax(total, taxRateId);

  const [doc] = await db
    .insert(salesDocumentsTable)
    .values({
      docNumber,
      kind: docKind,
      status: "draft",
      customerId: customerId ?? null,
      customerName,
      totalAmount: String(total),
      taxRateId: taxRateId ?? null,
      taxAmount: String(taxAmount),
      grandTotal: String(grandTotal),
      validUntil: validUntil ? new Date(validUntil) : null,
      expectedDate: expectedDate ? new Date(expectedDate) : null,
      notes: notes ?? null,
      origin: origin ?? null,
      destination: destination ?? null,
      transportMode: transportMode ?? null,
      etd: etd ?? null,
      eta: eta ?? null,
    })
    .returning();

  await db.insert(salesDocumentLinesTable).values(
    (lines as LineInput[]).map((l) => ({
      documentId: doc.id,
      productId: l.productId ?? null,
      name: l.name,
      description: l.description ?? null,
      quantity: String(l.quantity),
      unitPrice: String(l.unitPrice),
      subtotal: String(Number(l.quantity) * Number(l.unitPrice)),
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

  const { customerId, customerName, validUntil, expectedDate, notes, lines, kind, taxRateId,
    origin, destination, transportMode, etd, eta } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof customerName === "string") patch["customerName"] = customerName;
  if (customerId !== undefined) patch["customerId"] = customerId;
  if (validUntil !== undefined) patch["validUntil"] = validUntil ? new Date(validUntil) : null;
  if (expectedDate !== undefined) patch["expectedDate"] = expectedDate ? new Date(expectedDate) : null;
  if (notes !== undefined) patch["notes"] = notes;
  if (kind === "quote" || kind === "order") patch["kind"] = kind;
  if (taxRateId !== undefined) patch["taxRateId"] = taxRateId;
  if (origin !== undefined) patch["origin"] = origin || null;
  if (destination !== undefined) patch["destination"] = destination || null;
  if (transportMode !== undefined) patch["transportMode"] = transportMode || null;
  if (etd !== undefined) patch["etd"] = etd || null;
  if (eta !== undefined) patch["eta"] = eta || null;

  if (Array.isArray(lines)) {
    const total = (lines as LineInput[]).reduce(
      (s, l) => s + Number(l.quantity) * Number(l.unitPrice),
      0,
    );
    const effTaxId = taxRateId !== undefined ? taxRateId : existing.taxRateId;
    const { taxAmount, grandTotal } = await computeTax(total, effTaxId);
    patch["totalAmount"] = String(total);
    patch["taxAmount"] = String(taxAmount);
    patch["grandTotal"] = String(grandTotal);
    await db.delete(salesDocumentLinesTable).where(eq(salesDocumentLinesTable.documentId, id));
    if (lines.length > 0) {
      await db.insert(salesDocumentLinesTable).values(
        (lines as LineInput[]).map((l) => ({
          documentId: id,
          productId: l.productId ?? null,
          name: l.name,
          description: l.description ?? null,
          quantity: String(l.quantity),
          unitPrice: String(l.unitPrice),
          subtotal: String(Number(l.quantity) * Number(l.unitPrice)),
        })),
      );
    }
  } else if (taxRateId !== undefined) {
    const total = Number(existing.totalAmount);
    const { taxAmount, grandTotal } = await computeTax(total, taxRateId);
    patch["taxAmount"] = String(taxAmount);
    patch["grandTotal"] = String(grandTotal);
  }

  await db.update(salesDocumentsTable).set(patch).where(eq(salesDocumentsTable.id, id));
  const detail = await loadDocWithLines(id);
  return res.json(detail);
});

router.delete("/documents/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db
    .delete(salesDocumentsTable)
    .where(eq(salesDocumentsTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Document not found" });
  return res.json({ message: "Deleted", id });
});

router.post("/documents/:id/action", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { action } = req.body ?? {};
  const [doc] = await db.select().from(salesDocumentsTable).where(eq(salesDocumentsTable.id, id));
  if (!doc) return res.status(404).json({ message: "Document not found" });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  switch (action) {
    case "send":
      patch["status"] = "sent" satisfies SalesDocStatus;
      break;
    case "confirm":
      patch["status"] = "confirmed" satisfies SalesDocStatus;
      patch["kind"] = "order";
      patch["confirmedAt"] = new Date();
      patch["invoiceStatus"] = "to_invoice" satisfies SalesInvoiceStatus;
      patch["deliveryStatus"] = "to_deliver";
      break;
    case "cancel":
      patch["status"] = "cancelled" satisfies SalesDocStatus;
      break;
    case "draft":
      patch["status"] = "draft" satisfies SalesDocStatus;
      break;
    case "mark_invoiced": {
      const [{ shipmentCount }] = await db
        .select({ shipmentCount: count() })
        .from(freightShipmentsTable)
        .where(eq(freightShipmentsTable.salesDocId, id));
      if (shipmentCount === 0) {
        return res.status(400).json({ message: "Tidak bisa membuat invoice: belum ada Shipment yang terhubung dengan Sales Order ini. Buat Shipment terlebih dahulu." });
      }
      patch["invoiceStatus"] = "invoiced" satisfies SalesInvoiceStatus;
      if (doc.deliveryStatus === "delivered") patch["status"] = "done" satisfies SalesDocStatus;
      break;
    }
    case "mark_delivered":
      patch["deliveryStatus"] = "delivered";
      if (doc.invoiceStatus === "invoiced") patch["status"] = "done" satisfies SalesDocStatus;
      break;
    default:
      return res.status(400).json({ message: "Invalid action" });
  }

  await db.update(salesDocumentsTable).set(patch).where(eq(salesDocumentsTable.id, id));

  // Auto-post journal entry when newly invoiced
  if (
    action === "mark_invoiced" &&
    doc.invoiceStatus !== "invoiced"
  ) {
    const net = Number(doc.totalAmount);
    const taxAmount = Number(doc.taxAmount ?? 0);
    void postSalesInvoice({
      salesDocId: doc.id,
      docNumber: doc.docNumber,
      customerName: doc.customerName,
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
  let customer: typeof customersTable.$inferSelect | null = null;
  if (detail.customerId) {
    const rows = await db.select().from(customersTable).where(eq(customersTable.id, detail.customerId)).limit(1);
    customer = rows[0] ?? null;
  }
  const titleMap: Record<string, string> = {
    quote: "QUOTATION",
    order: "SALES ORDER",
  };
  streamInvoicePdf(res, {
    title: titleMap[detail.kind] ?? "DOKUMEN PENJUALAN",
    docNumber: detail.docNumber,
    status: detail.status,
    kind: detail.kind,
    partyLabel: "Pelanggan",
    partyName: detail.customerName,
    partyEmail: customer?.email ?? null,
    partyPhone: customer?.phone ?? null,
    partyAddress: customer?.address ?? null,
    partyTaxId: customer?.taxId ?? null,
    validUntil: detail.validUntil,
    expectedDate: detail.expectedDate,
    confirmedAt: detail.confirmedAt,
    createdAt: detail.createdAt,
    notes: detail.notes,
    lines: detail.lines.map((l: any) => ({
      name: l.name,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      subtotal: Number(l.subtotal),
    })),
    totalAmount: Number(detail.totalAmount),
    invoiceStatus: detail.invoiceStatus,
    deliveryStatus: detail.deliveryStatus,
  });
});

router.post("/documents/:id/email", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }

  if (!isSmtpConfigured()) {
    res.status(503).json({ message: "Email belum dikonfigurasi. Hubungi administrator untuk mengatur SMTP." });
    return;
  }

  const { to, subject, body } = req.body as { to?: string; subject?: string; body?: string };
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    res.status(400).json({ message: "Alamat email tujuan tidak valid" });
    return;
  }

  const detail = await loadDocWithLines(id);
  if (!detail) { res.status(404).json({ message: "Document not found" }); return; }

  let customer: typeof customersTable.$inferSelect | null = null;
  if (detail.customerId) {
    const rows = await db.select().from(customersTable).where(eq(customersTable.id, detail.customerId)).limit(1);
    customer = rows[0] ?? null;
  }

  const titleMap: Record<string, string> = { quote: "QUOTATION", order: "SALES ORDER" };
  const pdfData = {
    title: titleMap[detail.kind] ?? "DOKUMEN PENJUALAN",
    docNumber: detail.docNumber,
    status: detail.status,
    kind: detail.kind,
    partyLabel: "Pelanggan",
    partyName: detail.customerName,
    partyEmail: customer?.email ?? null,
    partyPhone: customer?.phone ?? null,
    partyAddress: customer?.address ?? null,
    partyTaxId: customer?.taxId ?? null,
    validUntil: detail.validUntil,
    expectedDate: detail.expectedDate,
    confirmedAt: detail.confirmedAt,
    createdAt: detail.createdAt,
    notes: detail.notes,
    lines: detail.lines.map((l: any) => ({
      name: l.name,
      description: l.description,
      quantity: Number(l.quantity),
      unitPrice: Number(l.unitPrice),
      subtotal: Number(l.subtotal),
    })),
    totalAmount: Number(detail.totalAmount),
    invoiceStatus: detail.invoiceStatus,
    deliveryStatus: detail.deliveryStatus,
  };

  const pdfBuffer = await buildInvoicePdfBuffer(pdfData);
  const filename = `${detail.docNumber.replace(/[\\/]/g, "-")}.pdf`;
  const emailSubject = subject?.trim() || `${pdfData.title} ${detail.docNumber}`;
  const emailBody = body?.trim() || `Terlampir ${pdfData.title} ${detail.docNumber} dari BizPortal.`;

  await sendMail({
    to,
    subject: emailSubject,
    text: emailBody,
    html: `<p>${emailBody.replace(/\n/g, "<br>")}</p>`,
    attachments: [{ filename, content: pdfBuffer, contentType: "application/pdf" }],
  });

  res.json({ message: "Email berhasil dikirim", to, filename });
});

export default router;
