import { db, accountingTaxesTable, transactionTaxesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { broadcastTaxUpdate } from "./taxSseBroadcast.js";

export type TxType =
  | "logistic_order"
  | "sales_order"
  | "purchase_order"
  | "expense"
  | "other";

interface RecordTaxParams {
  companyId: number;
  transactionType: TxType;
  transactionId: number;
  transactionRef?: string | null;
  baseAmount: number;
  taxAmount?: number;
  subType?: string | null;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function findTaxByName(
  companyId: number,
  namePart: string,
): Promise<typeof accountingTaxesTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(accountingTaxesTable)
    .where(
      sql`${accountingTaxesTable.companyId} = ${companyId}
          AND ${accountingTaxesTable.isActive} = true
          AND LOWER(${accountingTaxesTable.name}) LIKE LOWER(${`%${namePart}%`})`,
    )
    .limit(1);
  return rows[0] ?? null;
}

async function findTaxByKind(
  companyId: number,
  kind: "sale" | "purchase" | "withholding",
): Promise<typeof accountingTaxesTable.$inferSelect | null> {
  const rows = await db
    .select()
    .from(accountingTaxesTable)
    .where(
      sql`${accountingTaxesTable.companyId} = ${companyId}
          AND ${accountingTaxesTable.isActive} = true
          AND ${accountingTaxesTable.kind} = ${kind}`,
    )
    .limit(1);
  return rows[0] ?? null;
}

async function detectTax(
  companyId: number,
  txType: TxType,
  subType?: string | null,
): Promise<typeof accountingTaxesTable.$inferSelect | null> {
  switch (txType) {
    case "logistic_order":
      return (
        (await findTaxByName(companyId, "Freight Paket")) ??
        (await findTaxByName(companyId, "Freight"))
      );

    case "sales_order":
      return (
        (await findTaxByName(companyId, "PPN Keluaran")) ??
        (await findTaxByKind(companyId, "sale"))
      );

    case "purchase_order":
      return (
        (await findTaxByName(companyId, "PPN Masukan")) ??
        (await findTaxByKind(companyId, "purchase"))
      );

    case "expense": {
      const sub = (subType ?? "").toLowerCase();
      if (sub.includes("gaji") || sub.includes("honor") || sub.includes("salary")) {
        return (
          (await findTaxByName(companyId, "PPh 21")) ??
          (await findTaxByKind(companyId, "withholding"))
        );
      }
      return (
        (await findTaxByName(companyId, "PPh 23")) ??
        (await findTaxByKind(companyId, "withholding"))
      );
    }

    default:
      return null;
  }
}

export async function recordTransactionTax(params: RecordTaxParams): Promise<void> {
  try {
    const {
      companyId,
      transactionType,
      transactionId,
      transactionRef,
      baseAmount,
      subType,
    } = params;

    if (!baseAmount || baseAmount <= 0) return;

    const tax = await detectTax(companyId, transactionType, subType);
    if (!tax) {
      logger.warn(
        { companyId, transactionType, transactionId },
        "[taxAutoService] No matching tax found, skipping",
      );
      return;
    }

    const taxAmount = params.taxAmount != null
      ? round2(params.taxAmount)
      : round2((baseAmount * Number(tax.rate)) / 100);

    const period = currentPeriod();

    await db
      .insert(transactionTaxesTable)
      .values({
        companyId,
        transactionType,
        transactionId,
        transactionRef: transactionRef ?? null,
        taxId: tax.id,
        taxName: tax.name,
        taxRate: String(tax.rate),
        cutType: tax.cutType,
        baseAmount: String(round2(baseAmount)),
        taxAmount: String(taxAmount),
        accountId: tax.accountId ?? null,
        period,
        status: "pending",
      })
      .onConflictDoNothing();

    logger.info(
      { companyId, transactionType, transactionId, taxName: tax.name, taxAmount },
      "[taxAutoService] Transaction tax recorded",
    );

    broadcastTaxUpdate({
      event: "tax_recorded",
      period,
      companyId,
      transactionType,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    logger.warn({ err: e }, "[taxAutoService] Failed to record transaction tax (non-fatal)");
  }
}
