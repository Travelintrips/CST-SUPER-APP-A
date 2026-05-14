import {
  db,
  chartOfAccountsTable,
  accountingJournalsTable,
  accountingTaxesTable,
  accountingSettingsTable,
  expenseCategoriesTable,
} from "@workspace/db";
import { eq, isNull, or, sql } from "drizzle-orm";
import { logger } from "./logger.js";

type AccountType = "asset" | "liability" | "equity" | "revenue" | "expense";

interface SeedAccount {
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
}

const COMPANY_ABBR: Record<number, string> = {
  1: "CST",
  2: "WS",
  3: "DV",
  4: "ER",
};

/** Map lama → baru untuk rename akun yang sudah dibuat dengan singkatan lama */
const OLD_TO_NEW_ABBR: Record<string, string> = {
  WSM: "WS",
  DVS: "DV",
  ERA: "ER",
};

const ALL_COMPANY_IDS = [1, 2, 3, 4];

/**
 * Parent/group accounts — global (no companyId), inserted once.
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

/**
 * Leaf account templates — seeded per-company with abbreviation suffix.
 * code here is the BASE code; actual code will be "code-ABBR".
 */
const COA_LEAF_TEMPLATES: SeedAccount[] = [
  // ── Aset Lancar ───────────────────────────────────────────
  { code: "1-1010", name: "Kas",                              type: "asset",   parentCode: "1-1000" },
  { code: "1-1020", name: "Bank Mandiri",                     type: "asset",   parentCode: "1-1000" },
  { code: "1-1021", name: "Bank BCA",                         type: "asset",   parentCode: "1-1000" },
  { code: "1-1022", name: "Bank BNI",                         type: "asset",   parentCode: "1-1000" },
  { code: "1-1030", name: "Piutang Usaha",                    type: "asset",   parentCode: "1-1000" },
  { code: "1-1031", name: "Piutang Lainnya",                  type: "asset",   parentCode: "1-1000" },
  { code: "1-1040", name: "Persediaan Barang",                type: "asset",   parentCode: "1-1000" },
  { code: "1-1050", name: "PPN Masukan",                      type: "asset",   parentCode: "1-1000" },
  { code: "1-1060", name: "Uang Muka Biaya",                  type: "asset",   parentCode: "1-1000" },
  // ── Aset Tidak Lancar ─────────────────────────────────────
  { code: "1-2010", name: "Aset Tetap",                       type: "asset",   parentCode: "1-2000" },
  { code: "1-2020", name: "Akumulasi Depresiasi",             type: "asset",   parentCode: "1-2000" },
  // ── Kewajiban Lancar ──────────────────────────────────────
  { code: "2-1010", name: "Hutang Usaha",                     type: "liability", parentCode: "2-1000" },
  { code: "2-1020", name: "PPN Keluaran",                     type: "liability", parentCode: "2-1000" },
  { code: "2-1030", name: "Hutang Pajak Lainnya",             type: "liability", parentCode: "2-1000" },
  { code: "2-1040", name: "Uang Muka Pelanggan",              type: "liability", parentCode: "2-1000" },
  // ── Kewajiban Jangka Panjang ──────────────────────────────
  { code: "2-2010", name: "Hutang Jangka Panjang",            type: "liability", parentCode: "2-2000" },
  // ── Modal ─────────────────────────────────────────────────
  { code: "3-1010", name: "Modal Disetor",                    type: "equity",  parentCode: "3-1000" },
  // ── Laba / Rugi ───────────────────────────────────────────
  { code: "3-2010", name: "Laba Ditahan",                     type: "equity",  parentCode: "3-2000" },
  { code: "3-2020", name: "Laba Tahun Berjalan",              type: "equity",  parentCode: "3-2000" },
  // ── Pendapatan Usaha (Freight) ────────────────────────────
  { code: "4-1010", name: "Pendapatan Jasa Freight",          type: "revenue", parentCode: "4-1000" },
  { code: "4-1011", name: "Pendapatan Sea Freight",           type: "revenue", parentCode: "4-1000" },
  { code: "4-1012", name: "Pendapatan Air Freight",           type: "revenue", parentCode: "4-1000" },
  { code: "4-1013", name: "Pendapatan Land Freight",          type: "revenue", parentCode: "4-1000" },
  { code: "4-1014", name: "Pendapatan Custom Clearance",      type: "revenue", parentCode: "4-1000" },
  { code: "4-1015", name: "Pendapatan Penjualan Barang",      type: "revenue", parentCode: "4-1000" },
  // ── Pendapatan Lain-lain ──────────────────────────────────
  { code: "4-1020", name: "Pendapatan Lain-lain",             type: "revenue", parentCode: "4-2000" },
  { code: "4-2010", name: "Pendapatan Bunga",                 type: "revenue", parentCode: "4-2000" },
  { code: "4-2020", name: "Keuntungan Selisih Kurs",          type: "revenue", parentCode: "4-2000" },
  // ── HPP ───────────────────────────────────────────────────
  { code: "5-1010", name: "Harga Pokok Penjualan",            type: "expense", parentCode: "5-1000" },
  { code: "5-1011", name: "Biaya Pengiriman Langsung",        type: "expense", parentCode: "5-1000" },
  { code: "5-1012", name: "Biaya Kepabeanan",                 type: "expense", parentCode: "5-1000" },
  { code: "5-1013", name: "Biaya Penanganan & Handling",      type: "expense", parentCode: "5-1000" },
  // ── Beban Operasional ─────────────────────────────────────
  { code: "5-2010", name: "Beban Gaji & Tunjangan",           type: "expense", parentCode: "5-2000" },
  { code: "5-2020", name: "Beban Sewa",                       type: "expense", parentCode: "5-2000" },
  { code: "5-2030", name: "Beban Utilitas",                   type: "expense", parentCode: "5-2000" },
  { code: "5-2040", name: "Beban Operasional Lain",           type: "expense", parentCode: "5-2000" },
  { code: "5-2050", name: "Beban Perjalanan Dinas",           type: "expense", parentCode: "5-2000" },
  { code: "5-2060", name: "Beban Representasi & Hiburan",     type: "expense", parentCode: "5-2000" },
  { code: "5-2070", name: "Beban Asuransi",                   type: "expense", parentCode: "5-2000" },
  { code: "5-2080", name: "Beban Komunikasi & Internet",      type: "expense", parentCode: "5-2000" },
  { code: "5-2090", name: "Beban ATK & Perlengkapan",         type: "expense", parentCode: "5-2000" },
  { code: "5-2100", name: "Beban Penyusutan",                 type: "expense", parentCode: "5-2000" },
  // ── Beban Lain-lain ───────────────────────────────────────
  { code: "5-3010", name: "Beban Bunga & Administrasi Bank",  type: "expense", parentCode: "5-3000" },
  { code: "5-3020", name: "Beban Pajak & Perijinan",          type: "expense", parentCode: "5-3000" },
  { code: "5-3030", name: "Kerugian Selisih Kurs",            type: "expense", parentCode: "5-3000" },
];

/** All leaf accounts (for backward compat export) */
export const DEFAULT_ACCOUNTS = COA_LEAF_TEMPLATES;

export async function seedAccountingDefaults(): Promise<void> {
  logger.info("Accounting seed: starting COA hierarchy build...");

  // ── Ensure company_id column exists before any insert ────────────────────
  await db.execute(sql`
    ALTER TABLE chart_of_accounts
      ADD COLUMN IF NOT EXISTS company_id integer
  `);

  // ── Pass 1: Upsert global parent group accounts ───────────────────────────
  const parentRoots = COA_PARENTS.filter((p) => !p.parentCode);
  if (parentRoots.length) {
    await db
      .insert(chartOfAccountsTable)
      .values(parentRoots.map((p) => ({ code: p.code, name: p.name, type: p.type, companyId: null })))
      .onConflictDoUpdate({
        target: chartOfAccountsTable.code,
        set: { name: sql`excluded.name` },
      });
  }

  // ── Pass 2: Upsert sub-parent group accounts (level-2 groups) ────────────
  let allAccounts = await db.select().from(chartOfAccountsTable);
  let byCode = new Map(allAccounts.map((a) => [a.code, a]));

  const parentSubs = COA_PARENTS.filter((p) => p.parentCode);
  for (const p of parentSubs) {
    const parentId = byCode.get(p.parentCode!)?.id ?? null;
    await db
      .insert(chartOfAccountsTable)
      .values({ code: p.code, name: p.name, type: p.type, parentId: parentId ?? undefined, companyId: null })
      .onConflictDoUpdate({
        target: chartOfAccountsTable.code,
        set: { name: sql`excluded.name`, parentId: parentId },
      });
  }

  // ── Pass 2b: Rename akun yang masih pakai singkatan lama ─────────────────
  for (const [oldAbbr, newAbbr] of Object.entries(OLD_TO_NEW_ABBR)) {
    await db.execute(sql`
      UPDATE chart_of_accounts
         SET code = REPLACE(code, ${"-" + oldAbbr}, ${"-" + newAbbr}),
             name = REPLACE(name, ${" " + oldAbbr}, ${" " + newAbbr})
       WHERE code LIKE ${"%-" + oldAbbr}
    `);
  }

  // ── Pass 3: Upsert per-company leaf accounts with abbreviation suffix ─────
  allAccounts = await db.select().from(chartOfAccountsTable);
  byCode = new Map(allAccounts.map((a) => [a.code, a]));

  for (const companyId of ALL_COMPANY_IDS) {
    const abbr = COMPANY_ABBR[companyId]!;
    for (const leaf of COA_LEAF_TEMPLATES) {
      const parentId = leaf.parentCode ? (byCode.get(leaf.parentCode)?.id ?? null) : null;
      const companyCode = `${leaf.code}-${abbr}`;
      const companyName = `${leaf.name} ${abbr}`;
      await db
        .insert(chartOfAccountsTable)
        .values({
          code: companyCode,
          name: companyName,
          type: leaf.type,
          parentId: parentId ?? undefined,
          companyId,
        })
        .onConflictDoUpdate({
          target: chartOfAccountsTable.code,
          set: { name: sql`excluded.name`, parentId: parentId, companyId },
        });
    }
  }

  logger.info("Accounting seed: COA hierarchy done.");

  // ── Refresh map after all inserts ─────────────────────────────────────────
  allAccounts = await db.select().from(chartOfAccountsTable);
  byCode = new Map(allAccounts.map((a) => [a.code, a]));

  const needFor = (baseCode: string, companyId: number) => {
    const abbr = COMPANY_ABBR[companyId]!;
    const key = `${baseCode}-${abbr}`;
    const a = byCode.get(key);
    if (!a) throw new Error(`Seed missing required account ${key}`);
    return a;
  };

  // ── Journals: ensure company_id column exists ─────────────────────────────
  await db.execute(sql`
    ALTER TABLE accounting_journals ADD COLUMN IF NOT EXISTS company_id integer
  `);

  // ── Migrate legacy global journals (no company_id) → assign to company 1 ─
  const LEGACY_RENAME: Record<string, string> = {
    SAL: "SAL-CST",
    PUR: "PUR-CST",
    BNK: "BNK-CST",
    CSH: "CSH-CST",
    GEN: "GEN-CST",
    EXP: "EXP-CST",
  };
  for (const [oldCode, newCode] of Object.entries(LEGACY_RENAME)) {
    await db.execute(sql`
      UPDATE accounting_journals
         SET code = ${newCode}, company_id = 1
       WHERE code = ${oldCode} AND (company_id IS NULL)
    `);
  }

  // ── Per-company journal templates ─────────────────────────────────────────
  interface JournalTemplate {
    suffix: string;
    label: string;
    type: "sales" | "purchase" | "bank" | "cash" | "general";
    debitBase: string | null;
    creditBase: string | null;
  }
  const JOURNAL_TEMPLATES: JournalTemplate[] = [
    { suffix: "SAL", label: "Penjualan",              type: "sales",    debitBase: "1-1030", creditBase: "4-1010" },
    { suffix: "PUR", label: "Pembelian",              type: "purchase", debitBase: "5-1010", creditBase: "2-1010" },
    { suffix: "BNK", label: "Bank Mandiri",           type: "bank",     debitBase: "1-1020", creditBase: "1-1020" },
    { suffix: "CSH", label: "Kas",                    type: "cash",     debitBase: "1-1010", creditBase: "1-1010" },
    { suffix: "GEN", label: "Memorial / Penyesuaian", type: "general",  debitBase: null,     creditBase: null     },
    { suffix: "EXP", label: "Beban & Reimburse",      type: "purchase", debitBase: "5-1010", creditBase: "2-1010" },
  ];

  for (const companyId of ALL_COMPANY_IDS) {
    const abbr = COMPANY_ABBR[companyId]!;
    for (const tpl of JOURNAL_TEMPLATES) {
      const code = `${tpl.suffix}-${abbr}`;
      const name = tpl.label + (tpl.suffix === "BNK" ? ` ${abbr}` : "");
      const debitId  = tpl.debitBase  ? (byCode.get(`${tpl.debitBase}-${abbr}`)?.id  ?? null) : null;
      const creditId = tpl.creditBase ? (byCode.get(`${tpl.creditBase}-${abbr}`)?.id ?? null) : null;
      await db
        .insert(accountingJournalsTable)
        .values({
          code,
          name,
          type: tpl.type,
          companyId,
          defaultDebitAccountId:  debitId,
          defaultCreditAccountId: creditId,
        })
        .onConflictDoUpdate({
          target: accountingJournalsTable.code,
          set: { companyId, name: sql`excluded.name` },
        });
    }
  }

  const allJournals = await db.select().from(accountingJournalsTable);
  const journalByCode = new Map(allJournals.map((j) => [j.code, j]));

  const getJournal = (suffix: string, companyId: number) => {
    const abbr = COMPANY_ABBR[companyId]!;
    return journalByCode.get(`${suffix}-${abbr}`)!;
  };

  // aliases for company 1 (used below for taxes & expense categories)
  const salesJ = getJournal("SAL", 1);
  const purJ   = getJournal("PUR", 1);
  const bankJ  = getJournal("BNK", 1);
  const cashJ  = getJournal("CSH", 1);
  const expJ   = getJournal("EXP", 1);

  // ── Taxes: ensure PPN sale + purchase exist ───────────────────────────────
  const c1ppnOut = needFor("2-1020", 1);
  const c1ppnIn  = needFor("1-1050", 1);

  const existingTaxes = await db.select().from(accountingTaxesTable);
  const hasSaleTax     = existingTaxes.some((t) => t.kind === "sale");
  const hasPurchaseTax = existingTaxes.some((t) => t.kind === "purchase");
  if (!hasSaleTax) {
    await db.insert(accountingTaxesTable).values({
      name: "PPN Keluaran 11%", rate: "11.000", kind: "sale", accountId: c1ppnOut.id,
    });
  }
  if (!hasPurchaseTax) {
    await db.insert(accountingTaxesTable).values({
      name: "PPN Masukan 11%", rate: "11.000", kind: "purchase", accountId: c1ppnIn.id,
    });
  }
  const allTaxes    = await db.select().from(accountingTaxesTable);
  const saleTax     = allTaxes.find((t) => t.kind === "sale")!;
  const purchaseTax = allTaxes.find((t) => t.kind === "purchase")!;

  // ── Settings: upsert for all 4 companies using their own accounts ─────────
  const existingSettingsList = await db.select().from(accountingSettingsTable);
  const existingByCompany    = new Map(existingSettingsList.map((s) => [s.companyId ?? 1, s]));

  for (const companyId of ALL_COMPANY_IDS) {
    const cash        = needFor("1-1010", companyId);
    const bankMandiri = needFor("1-1020", companyId);
    const ar          = needFor("1-1030", companyId);
    const inventory   = needFor("1-1040", companyId);
    const ppnIn       = needFor("1-1050", companyId);
    const ap          = needFor("2-1010", companyId);
    const ppnOut      = needFor("2-1020", companyId);
    const salesIncome = needFor("4-1010", companyId);
    const cogs        = needFor("5-1010", companyId);

    const cSalesJ = getJournal("SAL", companyId);
    const cPurJ   = getJournal("PUR", companyId);
    const cBankJ  = getJournal("BNK", companyId);
    const cCashJ  = getJournal("CSH", companyId);

    const settingsBase = {
      arAccountId:             ar.id,
      apAccountId:             ap.id,
      salesIncomeAccountId:    salesIncome.id,
      purchaseExpenseAccountId: cogs.id,
      defaultBankAccountId:    bankMandiri.id,
      defaultCashAccountId:    cash.id,
      ppnOutputAccountId:      ppnOut.id,
      ppnInputAccountId:       ppnIn.id,
      salesJournalId:          cSalesJ?.id ?? salesJ.id,
      purchaseJournalId:       cPurJ?.id   ?? purJ.id,
      bankJournalId:           cBankJ?.id  ?? bankJ.id,
      cashJournalId:           cCashJ?.id  ?? cashJ.id,
      defaultSalesTaxId:       saleTax.id,
      defaultPurchaseTaxId:    purchaseTax.id,
      inventoryAccountId:      inventory.id,
      cogsAccountId:           cogs.id,
    };

    const existing = existingByCompany.get(companyId);
    if (!existing) {
      await db.insert(accountingSettingsTable).values({ ...settingsBase, companyId });
      logger.info(`Accounting seed: created settings for company ${companyId} (${COMPANY_ABBR[companyId]}).`);
    } else {
      await db.update(accountingSettingsTable)
        .set(settingsBase)
        .where(eq(accountingSettingsTable.id, existing.id));
      logger.info(`Accounting seed: updated settings for company ${companyId} (${COMPANY_ABBR[companyId]}).`);
    }
  }

  // ── Expense categories: seed using CST accounts ───────────────────────────
  const c1ExpByCode = new Map(
    allAccounts
      .filter((a) => a.companyId === 1)
      .map((a) => {
        const baseCode = a.code.replace(/-CST$/, "");
        return [baseCode, a];
      }),
  );
  const c1ap = needFor("2-1010", 1);
  await seedExpenseCategories(c1ExpByCode, expJ.id, c1ap.id);

  logger.info("Accounting seed: complete (4 perusahaan, per-company COA).");
}

async function seedExpenseCategories(
  byBaseCode: Map<string, { id: number; code: string; name: string }>,
  expJournalId: number,
  apAccountId: number,
): Promise<void> {
  const existing = await db.select().from(expenseCategoriesTable);
  if (existing.length > 0) return;

  const get = (code: string) => byBaseCode.get(code)?.id ?? null;

  const cats = [
    { code: "EXP-GAJI",    name: "Gaji & Tunjangan",           expenseAccountId: get("5-2010"), payableAccountId: apAccountId },
    { code: "EXP-SEWA",    name: "Sewa Gedung & Kantor",        expenseAccountId: get("5-2020"), payableAccountId: apAccountId },
    { code: "EXP-UTIL",    name: "Listrik, Air & Gas",          expenseAccountId: get("5-2030"), payableAccountId: apAccountId },
    { code: "EXP-ATK",     name: "ATK & Perlengkapan Kantor",   expenseAccountId: get("5-2090"), payableAccountId: apAccountId },
    { code: "EXP-DINAS",   name: "Perjalanan Dinas",            expenseAccountId: get("5-2050"), payableAccountId: apAccountId },
    { code: "EXP-REPRS",   name: "Representasi & Hiburan",      expenseAccountId: get("5-2060"), payableAccountId: apAccountId },
    { code: "EXP-ASURANSI",name: "Asuransi",                    expenseAccountId: get("5-2070"), payableAccountId: apAccountId },
    { code: "EXP-KOMUN",   name: "Komunikasi & Internet",       expenseAccountId: get("5-2080"), payableAccountId: apAccountId },
    { code: "EXP-KIRIM",   name: "Biaya Pengiriman",            expenseAccountId: get("5-1011"), payableAccountId: apAccountId },
    { code: "EXP-PABEAN",  name: "Biaya Kepabeanan",            expenseAccountId: get("5-1012"), payableAccountId: apAccountId },
    { code: "EXP-HANDLING",name: "Biaya Handling & Penanganan", expenseAccountId: get("5-1013"), payableAccountId: apAccountId },
    { code: "EXP-BUNGA",   name: "Beban Bunga & Adm. Bank",     expenseAccountId: get("5-3010"), payableAccountId: apAccountId },
    { code: "EXP-PAJAK",   name: "Pajak & Perijinan",           expenseAccountId: get("5-3020"), payableAccountId: apAccountId },
    { code: "EXP-OPS",     name: "Beban Operasional Lainnya",   expenseAccountId: get("5-2040"), payableAccountId: apAccountId },
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
