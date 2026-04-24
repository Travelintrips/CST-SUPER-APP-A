import {
  db,
  chartOfAccountsTable,
  accountingJournalsTable,
  accountingTaxesTable,
  accountingSettingsTable,
} from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

interface SeedAccount {
  code: string;
  name: string;
  type: "asset" | "liability" | "equity" | "revenue" | "expense";
}

const DEFAULT_ACCOUNTS: SeedAccount[] = [
  { code: "1-1010", name: "Kas", type: "asset" },
  { code: "1-1020", name: "Bank", type: "asset" },
  { code: "1-1030", name: "Piutang Usaha", type: "asset" },
  { code: "1-1040", name: "Persediaan Barang", type: "asset" },
  { code: "1-1050", name: "PPN Masukan", type: "asset" },
  { code: "1-2010", name: "Aset Tetap", type: "asset" },
  { code: "1-2020", name: "Akumulasi Depresiasi", type: "asset" },
  { code: "2-1010", name: "Hutang Usaha", type: "liability" },
  { code: "2-1020", name: "PPN Keluaran", type: "liability" },
  { code: "2-1030", name: "Hutang Pajak Lainnya", type: "liability" },
  { code: "2-2010", name: "Hutang Jangka Panjang", type: "liability" },
  { code: "3-1010", name: "Modal Disetor", type: "equity" },
  { code: "3-2010", name: "Laba Ditahan", type: "equity" },
  { code: "4-1010", name: "Pendapatan Penjualan", type: "revenue" },
  { code: "4-1020", name: "Pendapatan Lain-lain", type: "revenue" },
  { code: "5-1010", name: "Harga Pokok Penjualan", type: "expense" },
  { code: "5-2010", name: "Beban Gaji", type: "expense" },
  { code: "5-2020", name: "Beban Sewa", type: "expense" },
  { code: "5-2030", name: "Beban Utilitas", type: "expense" },
  { code: "5-2040", name: "Beban Operasional Lain", type: "expense" },
];

export async function seedAccountingDefaults(): Promise<void> {
  // Idempotent — each step (accounts/journals/taxes/settings) is checked & backfilled independently.
  await db
    .insert(chartOfAccountsTable)
    .values(DEFAULT_ACCOUNTS)
    .onConflictDoNothing({ target: chartOfAccountsTable.code });

  const allAccounts = await db.select().from(chartOfAccountsTable);
  const byCode = new Map(allAccounts.map((a) => [a.code, a]));
  const need = (code: string) => {
    const a = byCode.get(code);
    if (!a) throw new Error(`Seed missing required account ${code}`);
    return a;
  };
  const cash = need("1-1010");
  const bank = need("1-1020");
  const ar = need("1-1030");
  const ppnIn = need("1-1050");
  const ap = need("2-1010");
  const ppnOut = need("2-1020");
  const salesIncome = need("4-1010");
  const cogs = need("5-1010");

  await db
    .insert(accountingJournalsTable)
    .values([
      { code: "SAL", name: "Penjualan", type: "sales", defaultDebitAccountId: ar.id, defaultCreditAccountId: salesIncome.id },
      { code: "PUR", name: "Pembelian", type: "purchase", defaultDebitAccountId: cogs.id, defaultCreditAccountId: ap.id },
      { code: "BNK", name: "Bank", type: "bank", defaultDebitAccountId: bank.id, defaultCreditAccountId: bank.id },
      { code: "CSH", name: "Kas", type: "cash", defaultDebitAccountId: cash.id, defaultCreditAccountId: cash.id },
      { code: "GEN", name: "Memorial / Penyesuaian", type: "general", defaultDebitAccountId: null, defaultCreditAccountId: null },
    ])
    .onConflictDoNothing({ target: accountingJournalsTable.code });

  const allJournals = await db.select().from(accountingJournalsTable);
  const journalByCode = new Map(allJournals.map((j) => [j.code, j]));
  const salesJ = journalByCode.get("SAL")!;
  const purJ = journalByCode.get("PUR")!;
  const bankJ = journalByCode.get("BNK")!;
  const cashJ = journalByCode.get("CSH")!;
  const inventory = need("1-1040");

  // Taxes — by name (no unique constraint, so check first)
  const existingTaxes = await db.select().from(accountingTaxesTable);
  const hasSaleTax = existingTaxes.some((t) => t.kind === "sale");
  const hasPurchaseTax = existingTaxes.some((t) => t.kind === "purchase");
  if (!hasSaleTax) {
    await db.insert(accountingTaxesTable).values({
      name: "PPN Keluaran 11%", rate: "11.000", kind: "sale", accountId: ppnOut.id,
    });
  }
  if (!hasPurchaseTax) {
    await db.insert(accountingTaxesTable).values({
      name: "PPN Masukan 11%", rate: "11.000", kind: "purchase", accountId: ppnIn.id,
    });
  }
  const allTaxes = await db.select().from(accountingTaxesTable);
  const saleTax = allTaxes.find((t) => t.kind === "sale")!;
  const purchaseTax = allTaxes.find((t) => t.kind === "purchase")!;

  // Settings — singleton: insert if missing, otherwise patch any null mappings.
  const settingsBase = {
    arAccountId: ar.id,
    apAccountId: ap.id,
    salesIncomeAccountId: salesIncome.id,
    purchaseExpenseAccountId: cogs.id,
    defaultBankAccountId: bank.id,
    defaultCashAccountId: cash.id,
    ppnOutputAccountId: ppnOut.id,
    ppnInputAccountId: ppnIn.id,
    salesJournalId: salesJ.id,
    purchaseJournalId: purJ.id,
    bankJournalId: bankJ.id,
    cashJournalId: cashJ.id,
    defaultSalesTaxId: saleTax.id,
    defaultPurchaseTaxId: purchaseTax.id,
    inventoryAccountId: inventory.id,
    cogsAccountId: cogs.id,
  };
  const [existingSettings] = await db.select().from(accountingSettingsTable).limit(1);
  if (!existingSettings) {
    await db.insert(accountingSettingsTable).values(settingsBase);
    logger.info("Accounting seed: created settings row.");
  } else {
    const patch: Record<string, number> = {};
    for (const [k, v] of Object.entries(settingsBase)) {
      if ((existingSettings as Record<string, unknown>)[k] == null) patch[k] = v as number;
    }
    if (Object.keys(patch).length > 0) {
      await db.update(accountingSettingsTable).set(patch).where(sql`id = ${existingSettings.id}`);
      logger.info(`Accounting seed: backfilled missing settings keys=${Object.keys(patch).join(",")}`);
    }
  }
}

export async function getAccountingSettings(): Promise<typeof accountingSettingsTable.$inferSelect | null> {
  const [row] = await db.select().from(accountingSettingsTable).limit(1);
  return row ?? null;
}

export async function ensureAccountingSettings(): Promise<typeof accountingSettingsTable.$inferSelect> {
  const existing = await getAccountingSettings();
  if (existing) return existing;
  const [created] = await db.insert(accountingSettingsTable).values({}).returning();
  return created!;
}

export { DEFAULT_ACCOUNTS };
