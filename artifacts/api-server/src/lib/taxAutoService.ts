import { db, accountingTaxesTable, transactionTaxesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";
import { broadcastTaxUpdate } from "./taxSseBroadcast.js";

export type TxType =
  | "logistic_order"
  | "sales_order"
  | "purchase_order"
  | "expense"
  | "bank_loan"
  | "employee_advance"
  | "fixed_asset"
  | "sport_center"
  | "other";

interface RecordTaxParams {
  companyId: number;
  transactionType: TxType;
  transactionId: number;
  transactionRef?: string | null;
  baseAmount: number;
  taxAmount?: number;
  subType?: string | null;
  partnerName?: string | null;
  npwp?: string | null;
  fakturPajakNumber?: string | null;
  buktiPotongNumber?: string | null;
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

function subIncludes(sub: string, ...keywords: string[]): boolean {
  return keywords.some((k) => sub.includes(k));
}

/**
 * Hitung PPh 21 menggunakan tarif progresif Pasal 17 UU PPh (berlaku 2024).
 * Input: gaji kotor TAHUNAN (rupiah). Output: pajak tahunan.
 * Bracket: 0-60jt@5%, 60jt-250jt@15%, 250jt-500jt@25%, 500jt-5M@30%, >5M@35%.
 */
function calculatePph21Progressive(annualGross: number): number {
  const brackets: Array<[number, number]> = [
    [60_000_000,    0.05],
    [250_000_000,   0.15],
    [500_000_000,   0.25],
    [5_000_000_000, 0.30],
    [Infinity,      0.35],
  ];
  let tax = 0;
  let remaining = Math.max(annualGross, 0);
  let prevLimit = 0;
  for (const [limit, rate] of brackets) {
    const bracket = Math.min(remaining, limit - prevLimit);
    if (bracket <= 0) break;
    tax += bracket * rate;
    remaining -= bracket;
    prevLimit = limit;
    if (remaining <= 0) break;
  }
  return tax;
}

async function detectTax(
  companyId: number,
  txType: TxType,
  subType?: string | null,
): Promise<typeof accountingTaxesTable.$inferSelect | null> {
  const sub = (subType ?? "").toLowerCase();

  switch (txType) {
    case "logistic_order": {
      // PPh 15: khusus pelayaran laut / ocean / sea freight
      if (subIncludes(sub, "laut", "sea", "ocean", "pelayaran", "kapal", "fcl", "lcl", "b/l", "bl", "mbl")) {
        const isLN = subIncludes(sub, "ln", "luar negeri", "international", "overseas", "foreign");
        if (isLN) {
          return (
            (await findTaxByName(companyId, "PPh 15 Pelayaran LN")) ??
            (await findTaxByName(companyId, "Pelayaran LN")) ??
            (await findTaxByName(companyId, "PPh 15"))
          );
        }
        return (
          (await findTaxByName(companyId, "PPh 15 Pelayaran DN")) ??
          (await findTaxByName(companyId, "Pelayaran DN")) ??
          (await findTaxByName(companyId, "PPh 15"))
        );
      }
      // Default freight darat/udara → PPh Freight Paket 1,1%
      return (
        (await findTaxByName(companyId, "Freight Paket")) ??
        (await findTaxByName(companyId, "PPh Freight")) ??
        (await findTaxByName(companyId, "Freight")) ??
        (await findTaxByKind(companyId, "withholding"))
      );
    }

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
      // Sewa → PPh 4(2) Final 10%
      if (subIncludes(sub, "sewa", "rental", "sewa_kantor", "kantor")) {
        return (
          (await findTaxByName(companyId, "PPh 4(2)")) ??
          (await findTaxByName(companyId, "PPh 4")) ??
          (await findTaxByName(companyId, "PPh 23"))
        );
      }
      // Gaji / honorarium → PPh 21
      if (subIncludes(sub, "gaji", "honor", "salary", "tunjangan", "upah", "pph_21")) {
        return (
          (await findTaxByName(companyId, "PPh 21")) ??
          (await findTaxByKind(companyId, "withholding"))
        );
      }
      // Luar negeri → PPh 26
      if (subIncludes(sub, "luar negeri", "overseas", "foreign", "pph_26")) {
        return (
          (await findTaxByName(companyId, "PPh 26")) ??
          (await findTaxByKind(companyId, "withholding"))
        );
      }
      // Default jasa → PPh 23
      return (
        (await findTaxByName(companyId, "PPh 23")) ??
        (await findTaxByKind(companyId, "withholding"))
      );
    }

    case "bank_loan":
      // Bunga pinjaman → PPh 23 (bunga) atau PPh Final sesuai kebijakan
      return (
        (await findTaxByName(companyId, "PPh 23")) ??
        (await findTaxByKind(companyId, "withholding"))
      );

    case "sport_center":
      // Sport center → PPN Keluaran (jasa olahraga)
      return (
        (await findTaxByName(companyId, "PPN Keluaran")) ??
        (await findTaxByKind(companyId, "sale"))
      );

    case "employee_advance":
    case "fixed_asset":
      // Kasbon & Aset Tetap umumnya tidak kena pajak otomatis
      return null;

    default:
      return null;
  }
}

function taxDirection(tax: typeof accountingTaxesTable.$inferSelect): string {
  if (tax.kind === "sale") return "output";
  if (tax.kind === "purchase") return "input";
  return "withholding";
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
      partnerName,
      npwp,
      fakturPajakNumber,
      buktiPotongNumber,
    } = params;

    if (!baseAmount || baseAmount <= 0) return;

    const tax = await detectTax(companyId, transactionType, subType);
    if (!tax) {
      logger.debug(
        { companyId, transactionType, transactionId },
        "[taxAutoService] No matching tax found, skipping",
      );
      return;
    }

    // PPh 21: gunakan tarif progresif Pasal 17 UU PPh — asumsikan baseAmount = gaji bulanan
    let taxAmount: number;
    if (params.taxAmount != null) {
      taxAmount = round2(params.taxAmount);
    } else if (tax.name.toLowerCase().includes("pph 21")) {
      const annualGross = baseAmount * 12;
      const annualTax = calculatePph21Progressive(annualGross);
      taxAmount = round2(annualTax / 12);
    } else {
      taxAmount = round2((baseAmount * Number(tax.rate)) / 100);
    }

    const period = currentPeriod();
    const direction = taxDirection(tax);

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
        direction,
        partnerName: partnerName ?? null,
        npwp: npwp ?? null,
        fakturPajakNumber: fakturPajakNumber ?? null,
        buktiPotongNumber: buktiPotongNumber ?? null,
      })
      .onConflictDoUpdate({
        target: [
          transactionTaxesTable.transactionType,
          transactionTaxesTable.transactionId,
          transactionTaxesTable.taxId,
        ],
        set: {
          baseAmount: String(round2(baseAmount)),
          taxAmount: String(taxAmount),
          direction,
          partnerName: partnerName ?? null,
          npwp: npwp ?? null,
          fakturPajakNumber: fakturPajakNumber ?? null,
          buktiPotongNumber: buktiPotongNumber ?? null,
          updatedAt: new Date(),
        },
      });

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
