import { Router, type Request } from "express";
import { randomBytes } from "crypto";
import { requireAdmin } from "../lib/requireAdmin.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { streamInvoicePdf, buildInvoicePdfBuffer } from "../lib/pdfInvoice.js";
import { postPurchaseBill, postPurchaseBillReversal } from "../lib/accounting.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminGroupWa } from "../lib/adminWa.js";
import { saveAndBroadcast } from "../lib/notificationStore.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { postStockIn } from "../lib/inventoryStock.js";
import {
  db,
  suppliersTable,
  purchaseDocumentsTable,
  purchaseDocumentLinesTable,
  accountingTaxesTable,
  goodsReceiptsTable,
  vendorInvoicesTable,
  accountingEntriesTable,
  accountingEntryLinesTable,
  chartOfAccountsTable,
} from "@workspace/db";
import { eq, sql, desc, and, or, inArray, type SQL } from "drizzle-orm";

/** Kirim WA ke semua admin (ADMIN_WA_PHONES + FONNTE_ADMIN_WA), fire-and-forget. */
function notifyAdminWa(message: string, context?: string, refType?: string, refId?: string): void {
  const phones = [
    ...(process.env.ADMIN_WA_PHONES ?? "").split(",").map((p) => p.trim()).filter(Boolean),
    ...(process.env.FONNTE_ADMIN_WA?.trim() ? [process.env.FONNTE_ADMIN_WA.trim()] : []),
  ];
  const unique = [...new Set(phones)];
  for (const phone of unique) {
    sendWhatsApp(phone, message, { context, refType, refId }).catch((e: unknown) =>
      console.error("[purchase WA]", e),
    );
  }
}

async function computeTax(subtotal: number, taxRateId: number | null | undefined): Promise<{ taxAmount: number; grandTotal: number }> {
  if (!taxRateId) return { taxAmount: 0, grandTotal: subtotal };
  const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, taxRateId));
  if (!tax) return { taxAmount: 0, grandTotal: subtotal };
  const taxAmount = Math.round(subtotal * Number(tax.rate)) / 100;
  return { taxAmount, grandTotal: subtotal + taxAmount };
}

// ── Public router: vendor PO accept (no auth required) ────────────────────
export const purchasePublicRouter = Router();

purchasePublicRouter.get("/vendor-accept/:token", async (req, res) => {
  const token = req.params.token;
  const result = await db.execute(sql`
    SELECT pd.id, pd.doc_number, pd.supplier_name, pd.grand_total, pd.total_amount, pd.tax_amount,
           pd.status, pd.kind, pd.vendor_accepted_at, pd.vendor_accept_notes, pd.expected_date,
           pd.notes, pd.created_at
    FROM purchase_documents pd
    WHERE pd.vendor_accept_token = ${token} AND pd.kind = 'order'
    LIMIT 1
  `);
  const doc = (result as any).rows?.[0] ?? (Array.isArray(result) ? result[0] : null);
  if (!doc) return res.status(404).json({ message: "Link tidak valid atau sudah kadaluarsa" });

  const lines = await db.execute(sql`
    SELECT name, description, quantity, unit_cost, subtotal
    FROM purchase_document_lines WHERE document_id = ${doc.id} ORDER BY id
  `);

  return res.json({ ...doc, lines: (lines as any).rows ?? lines });
});

purchasePublicRouter.post("/vendor-accept/:token", async (req, res) => {
  const token = req.params.token;
  const { notes } = req.body ?? {};

  const result = await db.execute(sql`
    SELECT id, doc_number, supplier_name, grand_total, total_amount, vendor_accepted_at
    FROM purchase_documents
    WHERE vendor_accept_token = ${token} AND kind = 'order' LIMIT 1
  `);
  const doc = (result as any).rows?.[0] ?? (Array.isArray(result) ? result[0] : null);
  if (!doc) return res.status(404).json({ message: "Link tidak valid atau sudah kadaluarsa" });
  if (doc.vendor_accepted_at) return res.status(409).json({ message: "PO ini sudah dikonfirmasi sebelumnya", alreadyAccepted: true });

  await db.execute(sql`
    UPDATE purchase_documents
    SET vendor_accepted_at = NOW(), vendor_accept_notes = ${notes ?? null}
    WHERE id = ${doc.id}
  `);

  // In-app notification to admin
  const acceptedAt = new Date().toISOString();
  const totalNum = Number(doc.grand_total ?? doc.total_amount ?? 0);
  saveAndBroadcast("vendor_po_accepted", {
    type: "vendor_po_accepted",
    orderId: doc.id,
    orderNumber: doc.doc_number ?? "-",
    customerName: doc.supplier_name ?? "-",
    companyName: null,
    grandTotal: totalNum,
    vendorNotes: notes?.trim() ?? null,
    acceptedAt,
  }).catch(() => undefined);

  // Notify admin group via WhatsApp
  const total = Number(doc.grand_total ?? doc.total_amount ?? 0);
  const msgLines = [
    `✅ *Vendor Konfirmasi Purchase Order*`,
    ``,
    `• *No PO*: ${doc.doc_number ?? "-"}`,
    `• *Vendor*: ${doc.supplier_name ?? "-"}`,
    `• *Total*: Rp ${total.toLocaleString("id-ID")}`,
    `• *Waktu*: ${new Date(acceptedAt).toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })}`,
    notes?.trim() ? `• *Catatan vendor*: ${notes.trim()}` : null,
    ``,
    `Silakan proses GR (Goods Receipt) untuk PO ini.`,
  ].filter(Boolean).join("\n");

  getAdminGroupWa().then((adminGroup) => {
    if (!adminGroup) return;
    sendWhatsApp(adminGroup, msgLines, {
      context: "purchase_vendor_accept_admin",
      refType: "purchase_document",
      refId: String(doc.id),
    }).catch(() => undefined);
  }).catch(() => undefined);

  return res.json({ ok: true, acceptedAt });
});

// ── Authenticated router ─────────────────────────────────────────────────────
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
  // IDOR guard: ensure document belongs to the requesting user's company
  const companyId = resolveCompanyId(req);
  if (doc.companyId !== companyId) return res.status(404).json({ message: "Document not found" });
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

  saveAndBroadcast("purchase_doc_created", {
    type: docKind === "rfq" ? "purchase_rfq" : "purchase_po",
    orderId: doc.id,
    orderNumber: docNumber,
    customerName: supplierName,
    companyName: null,
    grandTotal,
  }).catch(() => {});

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
      patch["billStatus"] = "to_bill" satisfies PurchaseBillStatus;
      patch["billNumber"] = null;
      patch["billDate"] = null;
      patch["dueDate"] = null;
      // Kembalikan status ke confirmed jika sebelumnya done
      if (doc.status === "done") patch["status"] = "confirmed" satisfies PurchaseStatus;
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
          const defaultWhResult = await db.execute(sql`SELECT id FROM warehouses WHERE is_active = TRUE ORDER BY id LIMIT 1`);
          const wh = defaultWhResult.rows[0] as any;
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
            const docCompanyId = (doc as any).companyId ?? null;
            const cur = await db.execute(sql`
              SELECT qty::float FROM wh_stock WHERE product_id = ${line.productId} AND warehouse_id = ${posWhId} AND rack_id IS NULL
            `);
            const qtyBefore = Number((cur.rows[0] as any)?.qty ?? 0);
            const qtyAfter = qtyBefore + qty;
            await db.execute(sql`
              INSERT INTO wh_stock (company_id, product_id, warehouse_id, rack_id, qty, cost_price, updated_at)
              VALUES (${docCompanyId}, ${line.productId}, ${posWhId}, NULL, ${qtyAfter}, ${costPrice}, NOW())
              ON CONFLICT ON CONSTRAINT wh_stock_product_warehouse_rack_idx
              DO UPDATE SET company_id = COALESCE(wh_stock.company_id, ${docCompanyId}), qty = ${qtyAfter}, cost_price = ${costPrice}, updated_at = NOW()
            `);
            await db.execute(sql`
              INSERT INTO wh_movements (company_id, product_id, warehouse_id, rack_id, type, qty, qty_before, qty_after, cost_price, ref_type, ref_id, note)
              VALUES (${docCompanyId}, ${line.productId}, ${posWhId}, NULL, 'po_receipt', ${qty}, ${qtyBefore}, ${qtyAfter}, ${costPrice},
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
          companyId: doc.companyId ?? null,
        });
        // Notifikasi WA admin setelah bill diposting
        const grandTotal = Number(doc.grandTotal ?? doc.totalAmount ?? 0);
        const billYear = new Date().getFullYear();
        const [{ billCount }] = await db
          .select({ billCount: sql<number>`cast(count(*) as int)` })
          .from(purchaseDocumentsTable)
          .where(sql`bill_number IS NOT NULL`);
        const billNum = patch["billNumber"] as string ?? `BILL/${billYear}/${String(Number(billCount)).padStart(4, "0")}`;
        const waMsg = `🧾 *Bill Pembelian Diposting*\nNo: ${billNum}\nPO: ${doc.docNumber}\nSupplier: ${doc.supplierName}\nTotal: Rp ${grandTotal.toLocaleString("id-ID")}`;
        notifyAdminWa(waMsg, "bill_posted", "purchase_document", String(doc.id));

        // Email ke supplier
        if (isSmtpConfigured() && doc.supplierId) {
          const supRows = await db.select().from(suppliersTable).where(eq(suppliersTable.id, doc.supplierId)).limit(1);
          const sup = supRows[0] ?? null;
          const supplierEmail = sup?.contactEmail;
          if (supplierEmail) {
            const billLines = await db
              .select({
                productId: purchaseDocumentLinesTable.productId,
                description: purchaseDocumentLinesTable.description,
                quantity: purchaseDocumentLinesTable.quantity,
                unitCost: purchaseDocumentLinesTable.unitCost,
                subtotal: purchaseDocumentLinesTable.subtotal,
              })
              .from(purchaseDocumentLinesTable)
              .where(eq(purchaseDocumentLinesTable.documentId, doc.id));
            const lineItems = billLines
              .map((l) => {
                const label = l.description ?? `Produk #${l.productId}`;
                return (
                  `<tr><td style="padding:4px 8px;border:1px solid #ddd;">${label}</td>` +
                  `<td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">${Number(l.quantity).toLocaleString("id-ID")}</td>` +
                  `<td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Rp ${Number(l.unitCost).toLocaleString("id-ID")}</td>` +
                  `<td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Rp ${Number(l.subtotal ?? 0).toLocaleString("id-ID")}</td></tr>`
                );
              })
              .join("");
            const taxAmount = Number(doc.taxAmount ?? 0);
            const html = `
<p>Kepada Yth. ${doc.supplierName ?? sup?.name ?? "Supplier"},</p>
<p>Berikut konfirmasi <strong>Bill Pembelian ${billNum}</strong> atas Purchase Order <strong>${doc.docNumber}</strong>:</p>
<table style="border-collapse:collapse;width:100%;font-family:sans-serif;font-size:14px;">
  <thead>
    <tr style="background:#f5f5f5;">
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:left;">Deskripsi</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Qty</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Harga Satuan</th>
      <th style="padding:6px 8px;border:1px solid #ddd;text-align:right;">Total</th>
    </tr>
  </thead>
  <tbody>${lineItems}</tbody>
  <tfoot>
    ${taxAmount ? `<tr><td colspan="3" style="padding:4px 8px;border:1px solid #ddd;text-align:right;">PPN</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;">Rp ${taxAmount.toLocaleString("id-ID")}</td></tr>` : ""}
    <tr>
      <td colspan="3" style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">Grand Total</td>
      <td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-weight:bold;">Rp ${grandTotal.toLocaleString("id-ID")}</td>
    </tr>
  </tfoot>
</table>
<p>Mohon konfirmasi penerimaan bill ini. Terima kasih.</p>`;
            const text = `Bill Pembelian ${billNum}\nPO: ${doc.docNumber}\nSupplier: ${doc.supplierName}\nTotal: Rp ${grandTotal.toLocaleString("id-ID")}`;
            await sendMail({
              to: supplierEmail,
              subject: `Konfirmasi Bill Pembelian - ${billNum}`,
              html,
              text,
              context: "bill_posted",
              refType: "purchase_document",
              refId: String(doc.id),
            }).catch((e: unknown) => console.error("[bill email]", e));
          }
        }
      } catch (e) {
        console.error("[accounting] postPurchaseBill error:", e);
      }
    })();
  }

  if (action === "cancel_bill" && doc.billStatus === "billed") {
    void (async () => {
      try {
        await postPurchaseBillReversal({
          purchaseDocId: doc.id,
          docNumber: doc.docNumber,
          supplierName: doc.supplierName,
          companyId: doc.companyId ?? null,
        });
        const waMsg = `❌ *Bill Pembelian Dibatalkan*\nPO: ${doc.docNumber}\nSupplier: ${doc.supplierName}\nJurnal reversal telah diposting.`;
        notifyAdminWa(waMsg, "bill_cancelled", "purchase_document", String(doc.id));
      } catch (e) {
        console.error("[accounting] postPurchaseBillReversal error:", e);
      }
    })();
  }

  const detail = await loadDocWithLines(id);

  if (action === "confirm") {
    saveAndBroadcast("purchase_doc_confirmed", {
      type: "purchase_po",
      orderId: id,
      orderNumber: detail?.docNumber ?? doc.docNumber,
      customerName: doc.supplierName,
      companyName: null,
      grandTotal: Number(doc.grandTotal ?? doc.totalAmount ?? 0),
    }).catch(() => {});
  }

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

router.post("/documents/:id/generate-vendor-token", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const sendWa = req.body?.sendWa === true;

  const [doc] = await db.select().from(purchaseDocumentsTable).where(eq(purchaseDocumentsTable.id, id));
  if (!doc) return res.status(404).json({ message: "Document not found" });
  if (doc.kind !== "order") return res.status(400).json({ message: "Hanya PO yang bisa dibuat link vendor accept" });

  const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : `http://localhost:5000`;

  const existingToken = (doc as any).vendor_accept_token as string | null | undefined;
  const token = existingToken ?? randomBytes(24).toString("hex");

  if (!existingToken) {
    await db.execute(sql`UPDATE purchase_documents SET vendor_accept_token = ${token} WHERE id = ${id}`);
  }

  const url = `${baseUrl}/vendor-po-accept/${token}`;

  // Lookup supplier phone
  let waTarget: string | null = null;
  let waSent = false;
  if (doc.supplierId) {
    const [sup] = await db.select({ phone: suppliersTable.phone, name: suppliersTable.name })
      .from(suppliersTable).where(eq(suppliersTable.id, doc.supplierId)).limit(1);
    waTarget = sup?.phone ?? null;
  }

  if (sendWa && waTarget) {
    const msgLines = [
      `📋 *Konfirmasi Purchase Order*`,
      ``,
      `Kepada Yth. *${doc.supplierName ?? "Vendor"}*,`,
      ``,
      `Kami mengirimkan Purchase Order berikut untuk dikonfirmasi:`,
      `• *No PO*: ${doc.docNumber ?? "-"}`,
      `• *Total*: Rp ${Number(doc.grandTotal ?? doc.totalAmount ?? 0).toLocaleString("id-ID")}`,
      ``,
      `Silakan buka link berikut untuk melihat detail PO dan mengkonfirmasi penerimaan:`,
      url,
      ``,
      `Terima kasih.`,
    ];
    sendWhatsApp(waTarget, msgLines.join("\n"), {
      context: "purchase_vendor_accept",
      refType: "purchase_document",
      refId: String(id),
    }).catch(() => undefined);
    waSent = true;
  }

  return res.json({ token, url, waSent, waTarget, waAvailable: !!waTarget });
});

router.get("/po-detail/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const doc = await loadDocWithLines(id);
  if (!doc) return res.status(404).json({ message: "Not found" });

  const grs = await db.select().from(goodsReceiptsTable)
    .where(eq(goodsReceiptsTable.poId, id))
    .orderBy(desc(goodsReceiptsTable.createdAt));

  const vis = await db.select().from(vendorInvoicesTable)
    .where(eq(vendorInvoicesTable.poId, id))
    .orderBy(desc(vendorInvoicesTable.createdAt));

  const grIds = grs.map((g) => g.id);
  const viIds = vis.map((v) => v.id);

  let journalEntries: object[] = [];
  const entryConds: ReturnType<typeof and>[] = [];
  if (viIds.length > 0) {
    entryConds.push(and(
      sql`${accountingEntriesTable.source} = 'purchase_bill'`,
      inArray(accountingEntriesTable.sourceId, viIds),
    )!);
  }
  entryConds.push(and(
    sql`${accountingEntriesTable.source} = 'purchase_bill'`,
    eq(accountingEntriesTable.sourceId, id),
  )!);
  if (grIds.length > 0) {
    entryConds.push(and(
      sql`${accountingEntriesTable.source} = 'grn_receipt'`,
      inArray(accountingEntriesTable.sourceId, grIds),
    )!);
  }

  const entries = await db.select().from(accountingEntriesTable)
    .where(or(...entryConds))
    .orderBy(desc(accountingEntriesTable.createdAt));

  if (entries.length > 0) {
    const entryIds = entries.map((e) => e.id);
    const lines = await db.select({
      id: accountingEntryLinesTable.id,
      entryId: accountingEntryLinesTable.entryId,
      description: accountingEntryLinesTable.description,
      debit: accountingEntryLinesTable.debit,
      credit: accountingEntryLinesTable.credit,
      accountId: accountingEntryLinesTable.accountId,
      accountCode: chartOfAccountsTable.code,
      accountName: chartOfAccountsTable.name,
    }).from(accountingEntryLinesTable)
      .leftJoin(chartOfAccountsTable, eq(accountingEntryLinesTable.accountId, chartOfAccountsTable.id))
      .where(inArray(accountingEntryLinesTable.entryId, entryIds));

    journalEntries = entries.map((e) => ({
      id: e.id,
      entryNumber: e.entryNumber,
      date: e.date ? String(e.date) : null,
      description: e.description,
      status: e.status,
      source: e.source,
      sourceId: e.sourceId,
      totalDebit: Number(e.totalDebit ?? 0),
      totalCredit: Number(e.totalCredit ?? 0),
      createdAt: e.createdAt?.toISOString(),
      lines: lines
        .filter((l) => l.entryId === e.id)
        .map((l) => ({
          id: l.id,
          entryId: l.entryId,
          description: l.description,
          debit: Number(l.debit ?? 0),
          credit: Number(l.credit ?? 0),
          accountId: l.accountId,
          accountCode: l.accountCode,
          accountName: l.accountName,
        })),
    }));
  }

  return res.json({
    ...doc,
    goodsReceipts: grs.map((g) => ({
      ...g,
      receivedAt: (g as any).receiveDate instanceof Date ? (g as any).receiveDate.toISOString() : ((g as any).receiveDate ?? null),
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    })),
    vendorInvoices: vis.map((v) => ({
      ...v,
      grandTotal: Number(v.grandTotal),
      totalAmount: Number(v.totalAmount),
      taxAmount: Number(v.taxAmount ?? 0),
      amountPaid: Number(v.amountPaid ?? 0),
      invoiceDate: v.invoiceDate instanceof Date ? v.invoiceDate.toISOString() : (v.invoiceDate ?? null),
      dueDate: v.dueDate instanceof Date ? v.dueDate.toISOString() : (v.dueDate ?? null),
      cancelledAt: v.cancelledAt instanceof Date ? v.cancelledAt.toISOString() : (v.cancelledAt ?? null),
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString(),
    })),
    journalEntries,
  });
});

export default router;
