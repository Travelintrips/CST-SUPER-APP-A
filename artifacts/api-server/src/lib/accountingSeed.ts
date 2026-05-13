import {
  db,
  chartOfAccountsTable,
  accountingJournalsTable,
  accountingTaxesTable,
  accountingSettingsTable,
  expenseCategoriesTable,
} from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "./logger.js";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
}

/**
 * Full hierarchical COA for a freight/logistics company.
 * Parents (no parentCode) are inserted first, then children reference them.
 */
const COA_PARENTS: SeedAccount[] = [
  // ── ASET ──────────────────────────────────────────────────
  { code: "1-0000", name: "Aset", type: "asset" },
  { code: "1-1000", name: "Aset Lancar", type: "asset", parentCode: "1-0000" },
  { code: "1-2000", name: "Aset Tidak Lancar", type: "asset", parentCode: "1-0000" },
  // ── KEWAJIBAN ─────────────────────────────────────────────
  { code: "2-0000", name: "Kewajiban", type: "liability" },
  { code: "2-1000", name: "Kewajiban Lancar", type: "liability", parentCode: "2-0000" },
  { code: "2-2000", name: "Kewajiban Jangka Panjang", type: "liability", parentCode: "2-0000" },
  // ── EKUITAS ───────────────────────────────────────────────
  { code: "3-0000", name: "Ekuitas", type: "equity" },
  { code: "3-1000", name: "Modal", type: "equity", parentCode: "3-0000" },
  { code: "3-2000", name: "Laba / Rugi", type: "equity", parentCode: "3-0000" },
  // ── PENDAPATAN ────────────────────────────────────────────
  { code: "4-0000", name: "Pendapatan", type: "revenue" },
  { code: "4-1000", name: "Pendapatan Usaha", type: "revenue", parentCode: "4-0000" },
  { code: "4-2000", name: "Pendapatan Lain-lain", type: "revenue", parentCode: "4-0000" },
  // ── BEBAN ─────────────────────────────────────────────────
  { code: "5-0000", name: "Beban", type: "expense" },
  { code: "5-1000", name: "Harga Pokok Penjualan", type: "expense", parentCode: "5-0000" },
  { code: "5-2000", name: "Beban Operasional", type: "expense", parentCode: "5-0000" },
  { code: "5-3000", name: "Beban Lain-lain", type: "expense", parentCode: "5-0000" },
];

const COA_CHILDREN: SeedAccount[] = [
  // ── Aset Lancar ───────────────────────────────────────────
  { code: "1-1010", name: "Kas", type: "asset", parentCode: "1-1000" },
  { code: "1-1020", name: "Bank Mandiri", type: "asset", parentCode: "1-1000" },
  { code: "1-1021", name: "Bank BCA", type: "asset", parentCode: "1-1000" },
  { code: "1-1022", name: "Bank BNI", type: "asset", parentCode: "1-1000" },
  { code: "1-1030", name: "Piutang Usaha", type: "asset", parentCode: "1-1000" },
  { code: "1-1031", name: "Piutang Lainnya", type: "asset", parentCode: "1-1000" },
  { code: "1-1040", name: "Persediaan Barang", type: "asset", parentCode: "1-1000" },
  { code: "1-1050", name: "PPN Masukan", type: "asset", parentCode: "1-1000" },
  { code: "1-1060", name: "Uang Muka Biaya", type: "asset", parentCode: "1-1000" },
  // ── Aset Tidak Lancar ─────────────────────────────────────
  { code: "1-2010", name: "Aset Tetap", type: "asset", parentCode: "1-2000" },
  { code: "1-2020", name: "Akumulasi Depresiasi", type: "asset", parentCode: "1-2000" },
  // ── Kewajiban Lancar ──────────────────────────────────────
  { code: "2-1010", name: "Hutang Usaha", type: "liability", parentCode: "2-1000" },
  { code: "2-1020", name: "PPN Keluaran", type: "liability", parentCode: "2-1000" },
  { code: "2-1030", name: "Hutang Pajak Lainnya", type: "liability", parentCode: "2-1000" },
  { code: "2-1040", name: "Uang Muka Pelanggan", type: "liability", parentCode: "2-1000" },
  // ── Kewajiban Jangka Panjang ──────────────────────────────
  { code: "2-2010", name: "Hutang Jangka Panjang", type: "liability", parentCode: "2-2000" },
  // ── Modal ─────────────────────────────────────────────────
  { code: "3-1010", name: "Modal Disetor", type: "equity", parentCode: "3-1000" },
  // ── Laba / Rugi ───────────────────────────────────────────
  { code: "3-2010", name: "Laba Ditahan", type: "equity", parentCode: "3-2000" },
  { code: "3-2020", name: "Laba Tahun Berjalan", type: "equity", parentCode: "3-2000" },
  // ── Pendapatan Usaha (Freight) ────────────────────────────
  { code: "4-1010", name: "Pendapatan Jasa Freight", type: "revenue", parentCode: "4-1000" },
  { code: "4-1011", name: "Pendapatan Sea Freight", type: "revenue", parentCode: "4-1000" },
  { code: "4-1012", name: "Pendapatan Air Freight", type: "revenue", parentCode: "4-1000" },
  { code: "4-1013", name: "Pendapatan Land Freight", type: "revenue", parentCode: "4-1000" },
  { code: "4-1014", name: "Pendapatan Custom Clearance", type: "revenue", parentCode: "4-1000" },
  { code: "4-1015", name: "Pendapatan Penjualan Barang", type: "revenue", parentCode: "4-1000" },
  // ── Pendapatan Lain-lain ──────────────────────────────────
  { code: "4-1020", name: "Pendapatan Lain-lain", type: "revenue", parentCode: "4-2000" },
  { code: "4-2010", name: "Pendapatan Bunga", type: "revenue", parentCode: "4-2000" },
  { code: "4-2020", name: "Keuntungan Selisih Kurs", type: "revenue", parentCode: "4-2000" },
  // ── HPP ───────────────────────────────────────────────────
  { code: "5-1010", name: "Harga Pokok Penjualan", type: "expense", parentCode: "5-1000" },
  { code: "5-1011", name: "Biaya Pengiriman Langsung", type: "expense", parentCode: "5-1000" },
  { code: "5-1012", name: "Biaya Kepabeanan", type: "expense", parentCode: "5-1000" },
  { code: "5-1013", name: "Biaya Penanganan & Handling", type: "expense", parentCode: "5-1000" },
  // ── Beban Operasional ─────────────────────────────────────
  { code: "5-2010", name: "Beban Gaji & Tunjangan", type: "expense", parentCode: "5-2000" },
  { code: "5-2020", name: "Beban Sewa", type: "expense", parentCode: "5-2000" },
  { code: "5-2030", name: "Beban Utilitas", type: "expense", parentCode: "5-2000" },
  { code: "5-2040", name: "Beban Operasional Lain", type: "expense", parentCode: "5-2000" },
  { code: "5-2050", name: "Beban Perjalanan Dinas", type: "expense", parentCode: "5-2000" },
  { code: "5-2060", name: "Beban Representasi & Hiburan", type: "expense", parentCode: "5-2000" },
  { code: "5-2070", name: "Beban Asuransi", type: "expense", parentCode: "5-2000" },
  { code: "5-2080", name: "Beban Komunikasi & Internet", type: "expense", parentCode: "5-2000" },
  { code: "5-2090", name: "Beban ATK & Perlengkapan", type: "expense", parentCode: "5-2000" },
  { code: "5-2100", name: "Beban Penyusutan", type: "expense", parentCode: "5-2000" },
  // ── Beban Lain-lain ───────────────────────────────────────
  { code: "5-3010", name: "Beban Bunga & Administrasi Bank", type: "expense", parentCode: "5-3000" },
  { code: "5-3020", name: "Beban Pajak & Perijinan", type: "expense", parentCode: "5-3000" },
  { code: "5-3030", name: "Kerugian Selisih Kurs", type: "expense", parentCode: "5-3000" },
];

/** All leaf accounts (for backward compat export) */
export const DEFAULT_ACCOUNTS = COA_CHILDREN;

export async function seedAccountingDefaults(): Promise<void> {
  logger.info("Accounting seed: starting COA hierarchy build...");

  // ── Pass 1: Upsert parent group accounts ──────────────────────────────────
  const parentRoots = COA_PARENTS.filter((p) => !p.parentCode);
  if (parentRoots.length) {
    await db
      .insert(chartOfAccountsTable)
      .values(parentRoots.map((p) => ({ code: p.code, name: p.name, type: p.type })))
      .onConflictDoUpdate({
        target: chartOfAccountsTable.code,
        set: { name: sql`excluded.name` },
      });
  }

  // ── Pass 2: Upsert sub-parents (level 2 groups, reference root parents) ──
  let allAccounts = await db.select().from(chartOfAccountsTable);
  let byCode = new Map(allAccounts.map((a) => [a.code, a]));

  const parentSubs = COA_PARENTS.filter((p) => p.parentCode);
  for (const p of parentSubs) {
    const parentId = byCode.get(p.parentCode!)?.id ?? null;
    await db
      .insert(chartOfAccountsTable)
      .values({ code: p.code, name: p.name, type: p.type, parentId: parentId ?? undefined })
      .onConflictDoUpdate({
        target: chartOfAccountsTable.code,
        set: { name: sql`excluded.name`, parentId: parentId },
      });
  }

  // ── Pass 3: Upsert child accounts with parentId ───────────────────────────
  allAccounts = await db.select().from(chartOfAccountsTable);
  byCode = new Map(allAccounts.map((a) => [a.code, a]));

  for (const child of COA_CHILDREN) {
    const parentId = child.parentCode ? (byCode.get(child.parentCode)?.id ?? null) : null;
    await db
      .insert(chartOfAccountsTable)
      .values({
        code: child.code,
        name: child.name,
        type: child.type,
        parentId: parentId ?? undefined,
      })
      .onConflictDoUpdate({
        target: chartOfAccountsTable.code,
        set: {
          name: sql`excluded.name`,
          parentId: parentId,
        },
      });
  }

  logger.info("Accounting seed: COA hierarchy done.");

  // ── Refresh map after all inserts ─────────────────────────────────────────
  allAccounts = await db.select().from(chartOfAccountsTable);
  byCode = new Map(allAccounts.map((a) => [a.code, a]));

  const need = (code: string) => {
    const a = byCode.get(code);
    if (!a) throw new Error(`Seed missing required account ${code}`);
    return a;
  };

  const cash = need("1-1010");
  const bankMandiri = need("1-1020");
  const ar = need("1-1030");
  const inventory = need("1-1040");
  const ppnIn = need("1-1050");
  const ap = need("2-1010");
  const ppnOut = need("2-1020");
  const salesIncome = need("4-1010");
  const cogs = need("5-1010");

  // ── Journals (upsert: update name + default accounts) ────────────────────
  await db
    .insert(accountingJournalsTable)
    .values([
      {
        code: "SAL", name: "Penjualan", type: "sales",
        defaultDebitAccountId: ar.id,
        defaultCreditAccountId: salesIncome.id,
      },
      {
        code: "PUR", name: "Pembelian", type: "purchase",
        defaultDebitAccountId: cogs.id,
        defaultCreditAccountId: ap.id,
      },
      {
        code: "BNK", name: "Bank Mandiri", type: "bank",
        defaultDebitAccountId: bankMandiri.id,
        defaultCreditAccountId: bankMandiri.id,
      },
      {
        code: "CSH", name: "Kas", type: "cash",
        defaultDebitAccountId: cash.id,
        defaultCreditAccountId: cash.id,
      },
      {
        code: "GEN", name: "Memorial / Penyesuaian", type: "general",
        defaultDebitAccountId: null,
        defaultCreditAccountId: null,
      },
      {
        code: "EXP", name: "Beban & Reimburse", type: "purchase",
        defaultDebitAccountId: cogs.id,
        defaultCreditAccountId: ap.id,
      },
    ])
    .onConflictDoUpdate({
      target: accountingJournalsTable.code,
      set: { name: sql`excluded.name` },
    });

  const allJournals = await db.select().from(accountingJournalsTable);
  const journalByCode = new Map(allJournals.map((j) => [j.code, j]));
  const salesJ = journalByCode.get("SAL")!;
  const purJ = journalByCode.get("PUR")!;
  const bankJ = journalByCode.get("BNK")!;
  const cashJ = journalByCode.get("CSH")!;
  const expJ = journalByCode.get("EXP")!;

  // ── Taxes: ensure PPN sale + purchase exist ───────────────────────────────
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

  // ── Settings: insert or patch null fields ─────────────────────────────────
  const settingsBase = {
    arAccountId: ar.id,
    apAccountId: ap.id,
    salesIncomeAccountId: salesIncome.id,
    purchaseExpenseAccountId: cogs.id,
    defaultBankAccountId: bankMandiri.id,
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
    // Always keep defaultBankAccountId pointing to Bank Mandiri (1-1020)
    const patch: Record<string, number> = {
      defaultBankAccountId: bankMandiri.id,
      bankJournalId: bankJ.id,
    };
    for (const [k, v] of Object.entries(settingsBase)) {
      if ((existingSettings as Record<string, unknown>)[k] == null) {
        patch[k] = v as number;
      }
    }
    await db.update(accountingSettingsTable)
      .set(patch)
      .where(eq(accountingSettingsTable.id, existingSettings.id));
    logger.info(`Accounting seed: updated settings (bank→Bank Mandiri, keys=${Object.keys(patch).join(",")})`);
  }

  // ── Expense categories: seed standard categories with proper accounts ─────
  await seedExpenseCategories(byCode, expJ.id, ap.id);

  logger.info("Accounting seed: complete.");
}

async function seedExpenseCategories(
  byCode: Map<string, { id: number; code: string; name: string }>,
  expJournalId: number,
  apAccountId: number,
): Promise<void> {
  const existing = await db.select().from(expenseCategoriesTable);
  if (existing.length > 0) return;

  const get = (code: string) => byCode.get(code)?.id ?? null;

  const cats = [
    { code: "EXP-GAJI",    name: "Gaji & Tunjangan",             expenseAccountId: get("5-2010"), payableAccountId: apAccountId },
    { code: "EXP-SEWA",    name: "Sewa Gedung & Kantor",          expenseAccountId: get("5-2020"), payableAccountId: apAccountId },
    { code: "EXP-UTIL",    name: "Listrik, Air & Gas",            expenseAccountId: get("5-2030"), payableAccountId: apAccountId },
    { code: "EXP-ATK",     name: "ATK & Perlengkapan Kantor",     expenseAccountId: get("5-2090"), payableAccountId: apAccountId },
    { code: "EXP-DINAS",   name: "Perjalanan Dinas",              expenseAccountId: get("5-2050"), payableAccountId: apAccountId },
    { code: "EXP-REPRS",   name: "Representasi & Hiburan",        expenseAccountId: get("5-2060"), payableAccountId: apAccountId },
    { code: "EXP-ASURANSI",name: "Asuransi",                      expenseAccountId: get("5-2070"), payableAccountId: apAccountId },
    { code: "EXP-KOMUN",   name: "Komunikasi & Internet",         expenseAccountId: get("5-2080"), payableAccountId: apAccountId },
    { code: "EXP-KIRIM",   name: "Biaya Pengiriman",              expenseAccountId: get("5-1011"), payableAccountId: apAccountId },
    { code: "EXP-PABEAN",  name: "Biaya Kepabeanan",              expenseAccountId: get("5-1012"), payableAccountId: apAccountId },
    { code: "EXP-HANDLING",name: "Biaya Handling & Penanganan",   expenseAccountId: get("5-1013"), payableAccountId: apAccountId },
    { code: "EXP-BUNGA",   name: "Beban Bunga & Adm. Bank",       expenseAccountId: get("5-3010"), payableAccountId: apAccountId },
    { code: "EXP-PAJAK",   name: "Pajak & Perijinan",             expenseAccountId: get("5-3020"), payableAccountId: apAccountId },
    { code: "EXP-OPS",     name: "Beban Operasional Lainnya",     expenseAccountId: get("5-2040"), payableAccountId: apAccountId },
  ];

  const validCats = cats.filter((c) => c.expenseAccountId !== null);
  if (validCats.length > 0) {
    await db.insert(expenseCategoriesTable).values(validCats).onConflictDoNothing();
    logger.info(`Accounting seed: seeded ${validCats.length} expense categories.`);
  }
}

export async function getAccountingSettings(companyId = 1): Promise<typeof accountingSettingsTable.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(accountingSettingsTable)
    .where(eq(accountingSettingsTable.companyId, companyId))
    .limit(1);
  return row ?? null;
}

export async function ensureAccountingSettings(companyId = 1): Promise<typeof accountingSettingsTable.$inferSelect> {
  const existing = await getAccountingSettings(companyId);
  if (existing) return existing;
  const [created] = await db
    .insert(accountingSettingsTable)
    .values({ companyId })
    .returning();
  return created!;
}
