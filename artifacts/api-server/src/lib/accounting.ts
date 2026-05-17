import {
  db,
  accountingEntriesTable,
  accountingEntryLinesTable,
  accountingTaxesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { ensureAccountingSettings } from "./accountingSeed.js";
import { logger } from "./logger.js";

export interface PostingLine {
  accountId: number;
  debit: number;
  credit: number;
  description?: string | null;
}

export interface PostingInput {
  journalId: number;
  date: Date;
  ref?: string | null;
  description?: string | null;
  source?:
    | "manual"
    | "sales_invoice"
    | "purchase_bill"
    | "sales_payment"
    | "purchase_payment"
    | "pos_sale"
    | "ecommerce_order"
    | "stock_received"
    | "manual_payment"
    | "cogs_delivery";
  sourceId?: number | null;
  createdById?: string | null;
  companyId?: number | null;
  lines: PostingLine[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function nextEntryNumber(journalCode: string, source?: string): Promise<string> {
  const year = new Date().getFullYear();
  // Manual entries always use JE prefix; auto-posted entries use the journal code
  const prefix = (source === "manual" || !source) ? "JE" : journalCode;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(accountingEntriesTable);
  const seq = (Number(count) + 1).toString().padStart(4, "0");
  return `${prefix}/${year}/${seq}`;
}

/** Create and post a balanced journal entry. Throws if not balanced. */
export async function postEntry(
  input: PostingInput,
  journalCode: string,
): Promise<typeof accountingEntriesTable.$inferSelect> {
  const totalDebit = round2(input.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = round2(input.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      `Journal entry not balanced: debit=${totalDebit} credit=${totalCredit}`,
    );
  }
  if (input.lines.length === 0) {
    throw new Error("Journal entry must have at least one line");
  }

  const entryNumber = await nextEntryNumber(journalCode, input.source);
  const dateStr = input.date.toISOString().split("T")[0]!;
  const source = input.source ?? "manual";
  const sourceId = input.sourceId ?? null;

  if (source !== "manual" && sourceId !== null) {
    const existing = await db
      .select()
      .from(accountingEntriesTable)
      .where(
        sql`${accountingEntriesTable.source} = ${source} AND ${accountingEntriesTable.sourceId} = ${sourceId}`,
      )
      .limit(1);
    if (existing[0]) {
      logger.info(`[accounting] Skipping duplicate auto-post source=${source} sourceId=${sourceId}`);
      return existing[0];
    }
  }

  const inserted = await db
    .insert(accountingEntriesTable)
    .values({
      entryNumber,
      journalId: input.journalId,
      date: dateStr,
      ref: input.ref ?? null,
      description: input.description ?? null,
      status: "posted",
      source,
      sourceId,
      totalDebit: String(totalDebit),
      totalCredit: String(totalCredit),
      createdById: input.createdById ?? null,
      companyId: input.companyId ?? 1,
    })
    .onConflictDoNothing()
    .returning();
  let entry = inserted[0];
  if (!entry && source !== "manual" && sourceId !== null) {
    const [existing] = await db
      .select()
      .from(accountingEntriesTable)
      .where(
        sql`${accountingEntriesTable.source} = ${source} AND ${accountingEntriesTable.sourceId} = ${sourceId}`,
      )
      .limit(1);
    if (existing) return existing;
  }
  if (!entry) {
    throw new Error("Failed to create journal entry");
  }

  await db.insert(accountingEntryLinesTable).values(
    input.lines.map((l) => ({
      entryId: entry.id,
      accountId: l.accountId,
      description: l.description ?? null,
      debit: String(round2(Number(l.debit) || 0)),
      credit: String(round2(Number(l.credit) || 0)),
    })),
  );

  return entry;
}

/** Compute tax amount from a tax id and net amount. Returns 0 if tax not found. */
export async function computeTaxAmount(
  taxId: number | null | undefined,
  netAmount: number,
): Promise<{ taxAmount: number; tax: typeof accountingTaxesTable.$inferSelect | null }> {
  if (!taxId) return { taxAmount: 0, tax: null };
  const [tax] = await db
    .select()
    .from(accountingTaxesTable)
    .where(eq(accountingTaxesTable.id, taxId));
  if (!tax || !tax.isActive) return { taxAmount: 0, tax: null };
  const taxAmount = round2((netAmount * Number(tax.rate)) / 100);
  return { taxAmount, tax };
}

/** Auto-post when a Sales document gets invoiced. */
export async function postSalesInvoice(args: {
  salesDocId: number;
  docNumber: string;
  customerName: string;
  netAmount: number;
  taxAmount: number;
  taxAccountId: number | null;
  createdById?: string | null;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings();
    if (!settings.arAccountId || !settings.salesIncomeAccountId || !settings.salesJournalId) {
      logger.warn(
        { salesDocId: args.salesDocId },
        "Skipping auto-post sales invoice: accounting settings incomplete",
      );
      return;
    }
    const grand = round2(args.netAmount + args.taxAmount);
    const lines: PostingLine[] = [
      {
        accountId: settings.arAccountId,
        debit: grand,
        credit: 0,
        description: `Piutang ${args.customerName} - ${args.docNumber}`,
      },
      {
        accountId: settings.salesIncomeAccountId,
        debit: 0,
        credit: round2(args.netAmount),
        description: `Pendapatan ${args.docNumber}`,
      },
    ];
    if (args.taxAmount > 0 && (args.taxAccountId ?? settings.ppnOutputAccountId)) {
      lines.push({
        accountId: (args.taxAccountId ?? settings.ppnOutputAccountId)!,
        debit: 0,
        credit: round2(args.taxAmount),
        description: `PPN Keluaran ${args.docNumber}`,
      });
    }
    await postEntry(
      {
        journalId: settings.salesJournalId,
        date: new Date(),
        ref: args.docNumber,
        description: `Faktur penjualan ${args.docNumber}`,
        source: "sales_invoice",
        sourceId: args.salesDocId,
        createdById: args.createdById ?? null,
        lines,
      },
      "SAL",
    );
  } catch (err) {
    logger.error({ err, salesDocId: args.salesDocId }, "Auto-post sales invoice failed");
  }
}

/** Auto-post when a Purchase document gets billed.
 *
 * Debit allocation (per line):
 *  - Lines with productId (barang/inventory)  → DR 1-1040 Persediaan
 *  - Lines without productId (jasa/beban)     → DR purchaseExpenseAccountId (5-1011)
 *  - Tax                                      → DR 1-1050 PPN Masukan
 *  Credit: 2-1010 Hutang Usaha (grand total)
 */
export async function postPurchaseBill(args: {
  purchaseDocId: number;
  docNumber: string;
  supplierName: string;
  /** Lines from purchase_document_lines — used to split inventory vs expense debit */
  docLines?: Array<{ productId: number | null; unitCost: number; quantity: number }>;
  /** Fallback if docLines not provided */
  netAmount?: number;
  taxAmount: number;
  taxAccountId: number | null;
  createdById?: string | null;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings();
    if (!settings.apAccountId || !settings.purchaseJournalId) {
      logger.warn({ purchaseDocId: args.purchaseDocId }, "Skipping auto-post purchase bill: accounting settings incomplete");
      return;
    }

    // Split net amount into inventory portion vs service/expense portion
    let inventoryAmount = 0;
    let expenseAmount = 0;

    if (args.docLines && args.docLines.length > 0) {
      for (const line of args.docLines) {
        const lineTotal = round2(Number(line.unitCost) * Number(line.quantity));
        if (line.productId != null) {
          inventoryAmount = round2(inventoryAmount + lineTotal);
        } else {
          expenseAmount = round2(expenseAmount + lineTotal);
        }
      }
    } else {
      // Fallback: treat full amount as expense (legacy behaviour)
      expenseAmount = round2(args.netAmount ?? 0);
    }

    const netTotal = round2(inventoryAmount + expenseAmount);
    const taxAmount = round2(args.taxAmount);
    const grand = round2(netTotal + taxAmount);

    if (grand <= 0) {
      logger.warn({ purchaseDocId: args.purchaseDocId }, "Skipping purchase bill post: grand total is 0");
      return;
    }

    const lines: PostingLine[] = [];

    // DR Persediaan for product lines
    if (inventoryAmount > 0) {
      if (!settings.inventoryAccountId) {
        logger.warn({ purchaseDocId: args.purchaseDocId }, "inventoryAccountId missing — falling back to expense account for product lines");
        expenseAmount = round2(expenseAmount + inventoryAmount);
        inventoryAmount = 0;
      } else {
        lines.push({
          accountId: settings.inventoryAccountId,
          debit: inventoryAmount,
          credit: 0,
          description: `Persediaan barang: ${args.docNumber}`,
        });
      }
    }

    // DR Beban/Jasa for non-product lines
    if (expenseAmount > 0) {
      const expAcct = settings.purchaseExpenseAccountId;
      if (!expAcct) {
        logger.warn({ purchaseDocId: args.purchaseDocId }, "purchaseExpenseAccountId missing — skipping service/expense lines");
      } else {
        lines.push({
          accountId: expAcct,
          debit: expenseAmount,
          credit: 0,
          description: `Pembelian jasa/beban: ${args.docNumber}`,
        });
      }
    }

    // DR PPN Masukan
    if (taxAmount > 0 && (args.taxAccountId ?? settings.ppnInputAccountId)) {
      lines.push({
        accountId: (args.taxAccountId ?? settings.ppnInputAccountId)!,
        debit: taxAmount,
        credit: 0,
        description: `PPN Masukan ${args.docNumber}`,
      });
    }

    // CR Hutang Usaha
    const totalDebitCheck = round2(lines.reduce((s, l) => s + l.debit, 0));
    lines.push({
      accountId: settings.apAccountId,
      debit: 0,
      credit: totalDebitCheck,
      description: `Hutang ${args.supplierName} - ${args.docNumber}`,
    });

    if (lines.length < 2) {
      logger.warn({ purchaseDocId: args.purchaseDocId }, "Skipping purchase bill post: no debit lines generated");
      return;
    }

    await postEntry(
      {
        journalId: settings.purchaseJournalId,
        date: new Date(),
        ref: args.docNumber,
        description: `Tagihan pembelian ${args.docNumber}`,
        source: "purchase_bill",
        sourceId: args.purchaseDocId,
        createdById: args.createdById ?? null,
        lines,
      },
      "PUR",
    );
    logger.info({ purchaseDocId: args.purchaseDocId, inventoryAmount, expenseAmount, taxAmount }, "Purchase bill journal entry posted");
  } catch (err) {
    logger.error({ err, purchaseDocId: args.purchaseDocId }, "Auto-post purchase bill failed");
  }
}

/** Auto-post when a POS transaction is created (immediate cash/bank sale). */
export async function postPosTransaction(args: {
  transactionId: number;
  productName: string;
  totalPrice: number;
  paymentMethod: string;
  createdById?: string | null;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings();
    if (!settings.salesIncomeAccountId) {
      logger.warn({ transactionId: args.transactionId }, "Skipping POS post: salesIncomeAccountId missing");
      return;
    }
    const isCash = args.paymentMethod === "cash" || args.paymentMethod === "qris";
    const debitAccountId = isCash
      ? (settings.defaultCashAccountId ?? settings.defaultBankAccountId)
      : settings.defaultBankAccountId;
    if (!debitAccountId) {
      logger.warn({ transactionId: args.transactionId }, "Skipping POS post: no cash/bank account configured");
      return;
    }
    const journalId = isCash
      ? (settings.cashJournalId ?? settings.bankJournalId)
      : settings.bankJournalId;
    if (!journalId) {
      logger.warn({ transactionId: args.transactionId }, "Skipping POS post: no journal configured");
      return;
    }
    const amt = round2(args.totalPrice);
    await postEntry(
      {
        journalId,
        date: new Date(),
        ref: `POS-${args.transactionId}`,
        description: `Penjualan POS: ${args.productName}`,
        source: "pos_sale",
        sourceId: args.transactionId,
        createdById: args.createdById ?? null,
        lines: [
          { accountId: debitAccountId, debit: amt, credit: 0, description: `Penerimaan POS #${args.transactionId}` },
          { accountId: settings.salesIncomeAccountId, debit: 0, credit: amt, description: `Pendapatan POS: ${args.productName}` },
        ],
      },
      isCash ? "CSH" : "BNK",
    );
  } catch (err) {
    logger.error({ err, transactionId: args.transactionId }, "Auto-post POS transaction failed");
  }
}

/** Auto-post when an e-commerce order reaches "delivered" status. */
export async function postEcommerceOrder(args: {
  orderId: number;
  customerName: string;
  totalAmount: number;
  taxAmount?: number;
  grandTotal?: number;
  createdById?: string | null;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings();
    if (!settings.arAccountId || !settings.salesIncomeAccountId || !settings.salesJournalId) {
      logger.warn({ orderId: args.orderId }, "Skipping ecommerce order post: accounting settings incomplete");
      return;
    }
    const subtotal = round2(args.totalAmount);
    const taxAmt = round2(args.taxAmount ?? 0);
    const grandTotal = round2(args.grandTotal ?? subtotal + taxAmt);

    if (taxAmt > 0 && !settings.ppnOutputAccountId) {
      logger.warn({ orderId: args.orderId, taxAmt }, "Skipping ecommerce order post: taxAmount > 0 but ppnOutputAccountId not configured");
      return;
    }

    const lines: PostingLine[] = [
      { accountId: settings.arAccountId, debit: grandTotal, credit: 0, description: `Piutang order #${args.orderId} - ${args.customerName}` },
      { accountId: settings.salesIncomeAccountId, debit: 0, credit: subtotal, description: `Pendapatan e-commerce #${args.orderId}` },
    ];

    if (taxAmt > 0) {
      lines.push({ accountId: settings.ppnOutputAccountId!, debit: 0, credit: taxAmt, description: `PPN Keluaran order #${args.orderId}` });
    }

    await postEntry(
      {
        journalId: settings.salesJournalId,
        date: new Date(),
        ref: `ECO-${args.orderId}`,
        description: `Order e-commerce #${args.orderId} - ${args.customerName}`,
        source: "ecommerce_order",
        sourceId: args.orderId,
        createdById: args.createdById ?? null,
        lines,
      },
      "SAL",
    );
  } catch (err) {
    logger.error({ err, orderId: args.orderId }, "Auto-post ecommerce order failed");
  }
}

/** Auto-post COGS when a Sales Order is delivered (DR HPP / CR Persediaan). */
export async function postSalesCogs(args: {
  salesDocId: number;
  docNumber: string;
  lines: Array<{ name: string; qty: number; costPrice: number }>;
  createdById?: string | null;
}): Promise<void> {
  try {
    const validLines = args.lines.filter((l) => l.costPrice > 0 && l.qty > 0);
    if (validLines.length === 0) {
      logger.info({ salesDocId: args.salesDocId }, "postSalesCogs: all cost prices are 0 — skipping COGS entry");
      return;
    }
    const settings = await ensureAccountingSettings();
    if (!settings.cogsAccountId || !settings.inventoryAccountId || !settings.purchaseJournalId) {
      logger.warn({ salesDocId: args.salesDocId }, "Skipping COGS post: cogsAccountId/inventoryAccountId/purchaseJournalId missing in settings");
      return;
    }
    const totalCogs = round2(validLines.reduce((s, l) => s + l.costPrice * l.qty, 0));
    if (totalCogs <= 0) return;
    const description = validLines.map((l) => `${l.name} ×${l.qty}`).join(", ");
    await postEntry(
      {
        journalId: settings.purchaseJournalId,
        date: new Date(),
        ref: args.docNumber,
        description: `HPP Penjualan: ${args.docNumber}`,
        source: "cogs_delivery",
        sourceId: args.salesDocId,
        createdById: args.createdById ?? null,
        lines: [
          { accountId: settings.cogsAccountId, debit: totalCogs, credit: 0, description: `HPP: ${description}` },
          { accountId: settings.inventoryAccountId, debit: 0, credit: totalCogs, description: `Persediaan keluar: ${description}` },
        ],
      },
      "PUR",
    );
    logger.info({ salesDocId: args.salesDocId, totalCogs, lineCount: validLines.length }, "COGS journal entry posted");
  } catch (err) {
    logger.error({ err, salesDocId: args.salesDocId }, "Auto-post COGS delivery failed");
  }
}

/** Auto-post when new stock is received in Trading (DR Persediaan / CR Hutang Usaha). */
export async function postStockReceived(args: {
  stockId: number;
  productName: string;
  quantity: number;
  costPrice: number;
  createdById?: string | null;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings();
    if (!settings.inventoryAccountId || !settings.apAccountId || !settings.purchaseJournalId) {
      logger.warn({ stockId: args.stockId }, "Skipping stock received post: accounting settings incomplete");
      return;
    }
    const total = round2(args.quantity * args.costPrice);
    if (total <= 0) return;
    await postEntry(
      {
        journalId: settings.purchaseJournalId,
        date: new Date(),
        ref: `STK-${args.stockId}`,
        description: `Penerimaan stok: ${args.productName} (${args.quantity} unit)`,
        source: "stock_received",
        sourceId: args.stockId,
        createdById: args.createdById ?? null,
        lines: [
          { accountId: settings.inventoryAccountId, debit: total, credit: 0, description: `Persediaan: ${args.productName}` },
          { accountId: settings.apAccountId, debit: 0, credit: total, description: `Hutang usaha stok #${args.stockId}` },
        ],
      },
      "PUR",
    );
  } catch (err) {
    logger.error({ err, stockId: args.stockId }, "Auto-post stock received failed");
  }
}

/** Auto-post when a payment becomes paid. */
export async function postPaymentReceived(args: {
  paymentId: number;
  refKind: "sales" | "purchase";
  refDocNumber: string;
  amount: number;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings();
    if (!settings.bankJournalId || !settings.defaultBankAccountId) {
      logger.warn({ paymentId: args.paymentId }, "Skipping auto-post payment: bank settings missing");
      return;
    }
    const amt = round2(args.amount);
    let lines: PostingLine[];
    let source: "sales_payment" | "purchase_payment";
    if (args.refKind === "sales") {
      if (!settings.arAccountId) return;
      source = "sales_payment";
      lines = [
        {
          accountId: settings.defaultBankAccountId,
          debit: amt,
          credit: 0,
          description: `Penerimaan ${args.refDocNumber}`,
        },
        {
          accountId: settings.arAccountId,
          debit: 0,
          credit: amt,
          description: `Pelunasan piutang ${args.refDocNumber}`,
        },
      ];
    } else {
      if (!settings.apAccountId) return;
      source = "purchase_payment";
      lines = [
        {
          accountId: settings.apAccountId,
          debit: amt,
          credit: 0,
          description: `Pelunasan hutang ${args.refDocNumber}`,
        },
        {
          accountId: settings.defaultBankAccountId,
          debit: 0,
          credit: amt,
          description: `Pembayaran ${args.refDocNumber}`,
        },
      ];
    }
    await postEntry(
      {
        journalId: settings.bankJournalId,
        date: new Date(),
        ref: args.refDocNumber,
        description: `Pembayaran ${args.refDocNumber}`,
        source,
        sourceId: args.paymentId,
        lines,
      },
      "BNK",
    );
  } catch (err) {
    logger.error({ err, paymentId: args.paymentId }, "Auto-post payment failed");
  }
}
