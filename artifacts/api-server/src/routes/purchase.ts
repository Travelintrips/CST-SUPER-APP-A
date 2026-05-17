import { Router, type Request } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { streamInvoicePdf, buildInvoicePdfBuffer } from "../lib/pdfInvoice.js";
import { postPurchaseBill } from "../lib/accounting.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { postStockIn } from "../lib/inventoryStock.js";
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
    amountPaid: Number(d.amountPaid ?? 0),
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



router.get("/summary", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const docs = await db.select().from(purchaseDocumentsTable)
    .where(eq(purchaseDocumentsTable.companyId, companyId));
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
  const companyId = resolveCompanyId(req);
  const kind = req.query["kind"] as PurchaseKind | undefined;
  const billStatus = req.query["billStatus"] as PurchaseBillStatus | undefined;
  const paymentStatus = req.query["paymentStatus"] as "unpaid" | "partial" | "paid" | undefined;
  const conds: SQL[] = [eq(purchaseDocumentsTable.companyId, companyId)];
  if (kind === "rfq" || kind === "order") conds.push(eq(purchaseDocumentsTable.kind, kind));
  if (billStatus === "none" || billStatus === "to_bill" || billStatus === "billed")
    conds.push(eq(purchaseDocumentsTable.billStatus, billStatus));
  if (paymentStatus === "unpaid" || paymentStatus === "partial" || paymentStatus === "paid")
    conds.push(eq(purchaseDocumentsTable.paymentStatus, paymentStatus));
  const rows = await db
    .select()
    .from(purchaseDocumentsTable)
    .where(and(...conds))
    .orderBy(desc(purchaseDocumentsTable.createdAt));
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
  const companyId = resolveCompanyId(req);
  const { kind, supplierId, supplierName, supplierAddress, expectedDate, notes, lines, taxRateId, warehouseId } = req.body ?? {};
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
      companyId,
      docNumber,
      kind: docKind,
      status: "draft",
      warehouseId: warehouseId ? Number(warehouseId) : null,
      supplierId: supplierId ?? null,
      supplierName,
      supplierAddress: supplierAddress ?? null,
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

  const { supplierId, supplierName, supplierAddress, expectedDate, notes, lines, kind, taxRateId, warehouseId } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (typeof supplierName === "string") patch["supplierName"] = supplierName;
  if (supplierAddress !== undefined) patch["supplierAddress"] = supplierAddress ?? null;
  if (supplierId !== undefined) patch["supplierId"] = supplierId;
  if (warehouseId !== undefined) patch["warehouseId"] = warehouseId ? Number(warehouseId) : null;
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
    case "receive_to_warehouse": {
      // Mark received + post stock movements to wh_stock
      patch["receiveStatus"] = "received" satisfies PurchaseReceiveStatus;
      if (doc.billStatus === "billed") patch["status"] = "done" satisfies PurchaseStatus;
      break;
    }
    case "mark_billed": {
      // Auto-numbering: BILL/YYYY/NNNN
      const billYear = new Date().getFullYear();
      const [{ billCount }] = await db
        .select({ billCount: sql<number>`cast(count(*) as int)` })
        .from(purchaseDocumentsTable)
        .where(sql`bill_number IS NOT NULL`);
      const billSeq = (Number(billCount) + 1).toString().padStart(4, "0");
      const billNumber = `BILL/${billYear}/${billSeq}`;
      const billDate = new Date().toISOString().split("T")[0]!;
      // Auto due date: billDate + paymentTermDays (default 30)
      const termDays = Number((doc as Record<string, unknown>)["paymentTermDays"] ?? 30);
      const dueDate = new Date(Date.now() + termDays * 24 * 60 * 60 * 1000).toISOString().split("T")[0]!;
      patch["billStatus"] = "billed" satisfies PurchaseBillStatus;
      patch["billNumber"] = billNumber;
      patch["billDate"] = billDate;
      patch["dueDate"] = dueDate;
      if (doc.receiveStatus === "received") patch["status"] = "done" satisfies PurchaseStatus;
      break;
    }
    case "cancel_bill": {
      if (doc.billStatus !== "billed") {
        return res.status(400).json({ message: "Hanya bill yang sudah diposting yang bisa dibatalkan" });
      }
      patch["cancelledAt"] = new Date();
      break;
    }
    default:
      return res.status(400).json({ message: "Invalid action" });
  }

  await db.update(purchaseDocumentsTable).set(patch).where(eq(purchaseDocumentsTable.id, id));

  // T004: When PO is received, post stock-in movements to wh_stock AND inventory_stock (fire-and-forget)
  if ((action === "mark_received" || action === "receive_to_warehouse") && doc.receiveStatus !== "received") {
    void (async () => {
      try {
        const lines = await db.select().from(purchaseDocumentLinesTable).where(eq(purchaseDocumentLinesTable.documentId, id));
        const productLines = lines.filter((l) => l.productId != null);
        if (productLines.length === 0) return;
        // POS warehouse (wh_stock)
        const docWarehouseId = (doc as any).warehouseId ?? null;
        let posWhId: number | undefined = docWarehouseId ? Number(docWarehouseId) : undefined;
        if (!posWhId) {
          const [defaultWh] = await db.execute(sql`SELECT id FROM pos_warehouses WHERE is_active = TRUE ORDER BY id LIMIT 1`);
          const wh = (defaultWh as any)?.rows?.[0] ?? (defaultWh as any);
          posWhId = wh?.id;
        }
        // ERP warehouse (inventory_stock)
        const erpWhRow = (await db.execute(sql`SELECT id FROM warehouses WHERE is_active = TRUE ORDER BY id LIMIT 1`)).rows[0] as { id: number } | undefined;
        const erpWhId: number | undefined = erpWhRow?.id;

        for (const line of productLines) {
          const qty = Number(line.quantity);
          const costPrice = Number(line.unitCost);

          // ── wh_stock (POS/legacy) ──────────────────────────────────────────
          if (posWhId) {
            const cur = await db.execute(sql`
              SELECT qty::float FROM wh_stock WHERE product_id = ${line.productId} AND warehouse_id = ${posWhId} AND rack_id IS NULL
            `);
            const qtyBefore = Number((cur.rows[0] as any)?.qty ?? 0);
            const qtyAfter = qtyBefore + qty;
            await db.execute(sql`
              INSERT INTO wh_stock (product_id, warehouse_id, rack_id, qty, cost_price, updated_at)
              VALUES (${line.productId}, ${posWhId}, NULL, ${qtyAfter}, ${costPrice}, NOW())
              ON CONFLICT ON CONSTRAINT wh_stock_product_warehouse_rack_idx
              DO UPDATE SET qty = ${qtyAfter}, cost_price = ${costPrice}, updated_at = NOW()
            `);
            await db.execute(sql`
              INSERT INTO wh_movements (product_id, warehouse_id, rack_id, type, qty, qty_before, qty_after, cost_price, ref_type, ref_id, note)
              VALUES (${line.productId}, ${posWhId}, NULL, 'po_receipt', ${qty}, ${qtyBefore}, ${qtyAfter}, ${costPrice},
                      'purchase_order', ${id}, ${`PO Diterima: ${doc.docNumber}`})
            `);
          }

          // ── inventory_stock (ERP — enables SO pre-flight check) ───────────
          if (erpWhId) {
            await postStockIn({
              productId: line.productId!,
              warehouseId: erpWhId,
              qty,
              unitCost: costPrice,
              movementType: "PO_RECEIPT",
              referenceType: "PURCHASE_ORDER",
              referenceId: id,
              notes: `PO Diterima: ${doc.docNumber}`,
            }).catch((e) => console.error("[inventory] postStockIn PO error:", e));
          }
        }
      } catch (e) {
        console.error("[wh] mark_received stock-in error:", e);
      }
    })();
  }

  if (action === "mark_billed" && doc.billStatus !== "billed") {
    const taxAmount = Number(doc.taxAmount ?? 0);
    // Fetch lines to split inventory vs service/expense debit
    void (async () => {
      try {
        const billLines = await db
          .select({
            productId: purchaseDocumentLinesTable.productId,
            unitCost: purchaseDocumentLinesTable.unitCost,
            quantity: purchaseDocumentLinesTable.quantity,
          })
          .from(purchaseDocumentLinesTable)
          .where(eq(purchaseDocumentLinesTable.documentId, id));
        await postPurchaseBill({
          purchaseDocId: doc.id,
          docNumber: doc.docNumber,
          supplierName: doc.supplierName,
          docLines: billLines.map((l) => ({
            productId: l.productId,
            unitCost: Number(l.unitCost),
            quantity: Number(l.quantity),
          })),
          taxAmount,
          taxAccountId: null,
        });
      } catch (e) {
        console.error("[accounting] postPurchaseBill error:", e);
      }
    })();
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
  const acctSettings = await ensureAccountingSettings();
  const titleMap: Record<string, string> = {
    rfq: "REQUEST FOR QUOTATION",
    order: "PURCHASE ORDER",
  };
  streamInvoicePdf(res, {
    title: titleMap[detail.kind] ?? "DOKUMEN PEMBELIAN",
    docNumber: detail.docNumber,
    status: detail.status,
    kind: detail.kind,
    companyName: acctSettings.companyName,
    companyAddress: acctSettings.companyAddress,
    companyNpwp: acctSettings.companyNpwp,
    partyLabel: "Vendor",
    partyName: detail.supplierName,
    partyEmail: supplier?.contactEmail ?? null,
    partyAddress: detail.supplierAddress ?? null,
    partyTaxId: supplier?.taxId ?? null,
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

  let supplier: typeof suppliersTable.$inferSelect | null = null;
  if (detail.supplierId) {
    const rows = await db.select().from(suppliersTable).where(eq(suppliersTable.id, detail.supplierId)).limit(1);
    supplier = rows[0] ?? null;
  }

  const acctSettings = await ensureAccountingSettings();
  const titleMap: Record<string, string> = { rfq: "REQUEST FOR QUOTATION", order: "PURCHASE ORDER" };
  const pdfData = {
    title: titleMap[detail.kind] ?? "DOKUMEN PEMBELIAN",
    docNumber: detail.docNumber,
    status: detail.status,
    kind: detail.kind,
    companyName: acctSettings.companyName,
    companyAddress: acctSettings.companyAddress,
    companyNpwp: acctSettings.companyNpwp,
    partyLabel: "Vendor",
    partyName: detail.supplierName,
    partyEmail: supplier?.contactEmail ?? null,
    partyAddress: detail.supplierAddress ?? null,
    partyTaxId: supplier?.taxId ?? null,
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
