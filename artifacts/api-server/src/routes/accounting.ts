import { Router } from "express";
import {
  db,
  chartOfAccountsTable,
  accountingJournalsTable,
  accountingTaxesTable,
  accountingEntriesTable,
  accountingEntryLinesTable,
  accountingSettingsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray, type SQL } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { postEntry, type PostingLine } from "../lib/accounting.js";

const router = Router();

router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

function serializeAccount(a: typeof chartOfAccountsTable.$inferSelect) {
  return { ...a, createdAt: a.createdAt.toISOString() };
}
function serializeJournal(j: typeof accountingJournalsTable.$inferSelect) {
  return { ...j, createdAt: j.createdAt.toISOString() };
}
function serializeTax(t: typeof accountingTaxesTable.$inferSelect) {
  return { ...t, rate: Number(t.rate), createdAt: t.createdAt.toISOString() };
}
function serializeEntry(e: typeof accountingEntriesTable.$inferSelect) {
  return {
    ...e,
    totalDebit: Number(e.totalDebit),
    totalCredit: Number(e.totalCredit),
    createdAt: e.createdAt.toISOString(),
  };
}
function serializeEntryLine(l: typeof accountingEntryLinesTable.$inferSelect) {
  return { ...l, debit: Number(l.debit), credit: Number(l.credit) };
}
function serializeSettings(s: typeof accountingSettingsTable.$inferSelect) {
  return { ...s, updatedAt: s.updatedAt.toISOString() };
}

function parseDateRange(req: { query: Record<string, unknown> }):
  | { from: Date | null; to: Date | null; error: null }
  | { from: null; to: null; error: string } {
  const fromStr = typeof req.query["from"] === "string" ? (req.query["from"] as string) : null;
  const toStr = typeof req.query["to"] === "string" ? (req.query["to"] as string) : null;
  let from: Date | null = null;
  let to: Date | null = null;
  if (fromStr) {
    from = new Date(fromStr);
    if (Number.isNaN(from.getTime())) return { from: null, to: null, error: "Invalid 'from' date" };
  }
  if (toStr) {
    to = new Date(toStr);
    if (Number.isNaN(to.getTime())) return { from: null, to: null, error: "Invalid 'to' date" };
  }
  return { from, to, error: null };
}

// ============ Chart of Accounts ============
router.get("/accounts", async (_req, res) => {
  const rows = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);
  return res.json(rows.map(serializeAccount));
});

router.post("/accounts", async (req, res) => {
  const { code, name, type, parentId, isActive } = req.body ?? {};
  if (!code || !name || !type) return res.status(400).json({ message: "code, name, type required" });
  const validTypes = ["asset", "liability", "equity", "revenue", "expense"];
  if (!validTypes.includes(type)) return res.status(400).json({ message: "Invalid type" });
  try {
    const [created] = await db
      .insert(chartOfAccountsTable)
      .values({ code, name, type, parentId: parentId ?? null, isActive: isActive ?? true })
      .returning();
    return res.status(201).json(serializeAccount(created!));
  } catch (err: unknown) {
    return res.status(409).json({ message: "Account code already exists", error: String((err as Error)?.message ?? err) });
  }
});

router.patch("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { code, name, type, parentId, isActive } = req.body ?? {};
  const patch: Record<string, unknown> = {};
  if (code !== undefined) patch["code"] = code;
  if (name !== undefined) patch["name"] = name;
  if (type !== undefined) patch["type"] = type;
  if (parentId !== undefined) patch["parentId"] = parentId;
  if (isActive !== undefined) patch["isActive"] = isActive;
  await db.update(chartOfAccountsTable).set(patch).where(eq(chartOfAccountsTable.id, id));
  const [updated] = await db.select().from(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, id));
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeAccount(updated));
});

router.delete("/accounts/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  // Soft check: if any entry line references this account, refuse
  const [used] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(accountingEntryLinesTable)
    .where(eq(accountingEntryLinesTable.accountId, id));
  if ((used?.count ?? 0) > 0) {
    return res.status(409).json({ message: "Akun sudah dipakai di jurnal, tidak bisa dihapus. Set non-aktif saja." });
  }
  await db.delete(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, id));
  return res.json({ message: "Deleted", id });
});

// ============ Journals ============
router.get("/journals", async (_req, res) => {
  const rows = await db.select().from(accountingJournalsTable).orderBy(accountingJournalsTable.code);
  return res.json(rows.map(serializeJournal));
});

router.post("/journals", async (req, res) => {
  const { code, name, type, defaultDebitAccountId, defaultCreditAccountId, isActive } = req.body ?? {};
  if (!code || !name || !type) return res.status(400).json({ message: "code, name, type required" });
  const validTypes = ["sales", "purchase", "bank", "cash", "general"];
  if (!validTypes.includes(type)) return res.status(400).json({ message: "Invalid type" });
  try {
    const [created] = await db
      .insert(accountingJournalsTable)
      .values({
        code,
        name,
        type,
        defaultDebitAccountId: defaultDebitAccountId ?? null,
        defaultCreditAccountId: defaultCreditAccountId ?? null,
        isActive: isActive ?? true,
      })
      .returning();
    return res.status(201).json(serializeJournal(created!));
  } catch (err) {
    return res.status(409).json({ message: "Journal code already exists", error: String((err as Error)?.message ?? err) });
  }
});

router.patch("/journals/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const patch: Record<string, unknown> = {};
  for (const k of ["code", "name", "type", "defaultDebitAccountId", "defaultCreditAccountId", "isActive"]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  await db.update(accountingJournalsTable).set(patch).where(eq(accountingJournalsTable.id, id));
  const [updated] = await db.select().from(accountingJournalsTable).where(eq(accountingJournalsTable.id, id));
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeJournal(updated));
});

// ============ Taxes ============
router.get("/taxes", async (_req, res) => {
  const rows = await db.select().from(accountingTaxesTable).orderBy(accountingTaxesTable.id);
  return res.json(rows.map(serializeTax));
});

router.post("/taxes", async (req, res) => {
  const { name, rate, kind, accountId, isActive } = req.body ?? {};
  if (!name || rate === undefined || !kind || !accountId)
    return res.status(400).json({ message: "name, rate, kind, accountId required" });
  if (kind !== "sale" && kind !== "purchase")
    return res.status(400).json({ message: "kind must be 'sale' or 'purchase'" });
  const [created] = await db
    .insert(accountingTaxesTable)
    .values({ name, rate: String(rate), kind, accountId: Number(accountId), isActive: isActive ?? true })
    .returning();
  return res.status(201).json(serializeTax(created!));
});

router.patch("/taxes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const patch: Record<string, unknown> = {};
  if (req.body?.name !== undefined) patch["name"] = req.body.name;
  if (req.body?.rate !== undefined) patch["rate"] = String(req.body.rate);
  if (req.body?.kind !== undefined) patch["kind"] = req.body.kind;
  if (req.body?.accountId !== undefined) patch["accountId"] = Number(req.body.accountId);
  if (req.body?.isActive !== undefined) patch["isActive"] = req.body.isActive;
  await db.update(accountingTaxesTable).set(patch).where(eq(accountingTaxesTable.id, id));
  const [updated] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, id));
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeTax(updated));
});

// ============ Journal Entries ============
router.get("/entries", async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const conds: SQL<unknown>[] = [];
  if (range.from) conds.push(gte(accountingEntriesTable.date, range.from.toISOString().split("T")[0]!));
  if (range.to) conds.push(lte(accountingEntriesTable.date, range.to.toISOString().split("T")[0]!));
  const journalId = req.query["journalId"] ? Number(req.query["journalId"]) : null;
  if (journalId && !Number.isNaN(journalId)) conds.push(eq(accountingEntriesTable.journalId, journalId));
  const rows = await db
    .select()
    .from(accountingEntriesTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(accountingEntriesTable.date), desc(accountingEntriesTable.id))
    .limit(500);
  return res.json(rows.map(serializeEntry));
});

router.get("/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [entry] = await db.select().from(accountingEntriesTable).where(eq(accountingEntriesTable.id, id));
  if (!entry) return res.status(404).json({ message: "Not found" });
  const lines = await db
    .select()
    .from(accountingEntryLinesTable)
    .where(eq(accountingEntryLinesTable.entryId, id));
  return res.json({ ...serializeEntry(entry), lines: lines.map(serializeEntryLine) });
});

router.post("/entries", async (req, res) => {
  const { journalId, date: dateStr, ref, description, lines } = req.body ?? {};
  if (!journalId || !dateStr || !Array.isArray(lines))
    return res.status(400).json({ message: "journalId, date, lines[] required" });
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return res.status(400).json({ message: "Invalid date" });
  const [journal] = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.id, Number(journalId)));
  if (!journal) return res.status(404).json({ message: "Journal not found" });

  const postingLines: PostingLine[] = lines.map((l: { accountId: number; debit?: number; credit?: number; description?: string }) => ({
    accountId: Number(l.accountId),
    debit: Number(l.debit ?? 0),
    credit: Number(l.credit ?? 0),
    description: l.description ?? null,
  }));
  try {
    const entry = await postEntry(
      {
        journalId: journal.id,
        date,
        ref: ref ?? null,
        description: description ?? null,
        source: "manual",
        lines: postingLines,
      },
      journal.code,
    );
    const fullLines = await db
      .select()
      .from(accountingEntryLinesTable)
      .where(eq(accountingEntryLinesTable.entryId, entry.id));
    return res.status(201).json({ ...serializeEntry(entry), lines: fullLines.map(serializeEntryLine) });
  } catch (err) {
    return res.status(400).json({ message: String((err as Error)?.message ?? err) });
  }
});

// ============ Settings ============
router.get("/settings", async (_req, res) => {
  const s = await ensureAccountingSettings();
  return res.json(serializeSettings(s));
});

router.patch("/settings", async (req, res) => {
  const s = await ensureAccountingSettings();
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "arAccountId",
    "apAccountId",
    "salesIncomeAccountId",
    "purchaseExpenseAccountId",
    "defaultBankAccountId",
    "ppnOutputAccountId",
    "ppnInputAccountId",
    "salesJournalId",
    "purchaseJournalId",
    "bankJournalId",
    "defaultSalesTaxId",
    "defaultPurchaseTaxId",
  ]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k] === null ? null : Number(req.body[k]);
  }
  await db.update(accountingSettingsTable).set(patch).where(eq(accountingSettingsTable.id, s.id));
  const [updated] = await db.select().from(accountingSettingsTable).where(eq(accountingSettingsTable.id, s.id));
  return res.json(serializeSettings(updated!));
});

// ============ Reports ============
async function buildLedgerWindow(from: Date | null, to: Date | null) {
  const conds: SQL<unknown>[] = [eq(accountingEntriesTable.status, "posted")];
  if (from) conds.push(gte(accountingEntriesTable.date, from.toISOString().split("T")[0]!));
  if (to) conds.push(lte(accountingEntriesTable.date, to.toISOString().split("T")[0]!));
  const entries = await db
    .select()
    .from(accountingEntriesTable)
    .where(and(...conds));
  const entryIds = entries.map((e) => e.id);
  const lines = entryIds.length
    ? await db
        .select()
        .from(accountingEntryLinesTable)
        .where(inArray(accountingEntryLinesTable.entryId, entryIds))
    : [];
  return { entries, lines };
}

router.get("/reports/trial-balance", async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const accounts = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);
  const { lines } = await buildLedgerWindow(range.from, range.to);
  const totals = new Map<number, { debit: number; credit: number }>();
  for (const l of lines) {
    const cur = totals.get(l.accountId) ?? { debit: 0, credit: 0 };
    cur.debit += Number(l.debit);
    cur.credit += Number(l.credit);
    totals.set(l.accountId, cur);
  }
  const rows = accounts.map((a) => {
    const t = totals.get(a.id) ?? { debit: 0, credit: 0 };
    const net = t.debit - t.credit;
    const isDebitNormal = a.type === "asset" || a.type === "expense";
    return {
      accountId: a.id,
      code: a.code,
      name: a.name,
      type: a.type,
      debit: Math.round(t.debit * 100) / 100,
      credit: Math.round(t.credit * 100) / 100,
      balance: Math.round((isDebitNormal ? net : -net) * 100) / 100,
    };
  });
  const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
  return res.json({
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    rows: rows.filter((r) => r.debit !== 0 || r.credit !== 0),
    totalDebit: Math.round(totalDebit * 100) / 100,
    totalCredit: Math.round(totalCredit * 100) / 100,
  });
});

router.get("/reports/general-ledger", async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const accountId = req.query["accountId"] ? Number(req.query["accountId"]) : null;
  const accounts = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);
  const { entries, lines } = await buildLedgerWindow(range.from, range.to);
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const filtered = accountId ? lines.filter((l) => l.accountId === accountId) : lines;
  const grouped = new Map<number, { account: typeof accounts[number]; rows: Array<{ date: string; entryNumber: string; ref: string | null; description: string | null; debit: number; credit: number; balance: number }>; totalDebit: number; totalCredit: number }>();
  for (const a of accounts) {
    if (accountId && a.id !== accountId) continue;
    grouped.set(a.id, { account: a, rows: [], totalDebit: 0, totalCredit: 0 });
  }
  for (const l of filtered) {
    const e = entryById.get(l.entryId);
    if (!e) continue;
    const grp = grouped.get(l.accountId);
    if (!grp) continue;
    grp.rows.push({
      date: e.date,
      entryNumber: e.entryNumber,
      ref: e.ref,
      description: l.description ?? e.description,
      debit: Number(l.debit),
      credit: Number(l.credit),
      balance: 0,
    });
    grp.totalDebit += Number(l.debit);
    grp.totalCredit += Number(l.credit);
  }
  // Sort each group by date and compute running balance
  const out = [];
  for (const [, grp] of grouped) {
    if (grp.rows.length === 0) continue;
    grp.rows.sort((a, b) => (a.date === b.date ? a.entryNumber.localeCompare(b.entryNumber) : a.date.localeCompare(b.date)));
    const isDebitNormal = grp.account.type === "asset" || grp.account.type === "expense";
    let running = 0;
    for (const r of grp.rows) {
      running += isDebitNormal ? r.debit - r.credit : r.credit - r.debit;
      r.balance = Math.round(running * 100) / 100;
    }
    out.push({
      accountId: grp.account.id,
      code: grp.account.code,
      name: grp.account.name,
      type: grp.account.type,
      rows: grp.rows,
      totalDebit: Math.round(grp.totalDebit * 100) / 100,
      totalCredit: Math.round(grp.totalCredit * 100) / 100,
      endingBalance: Math.round(running * 100) / 100,
    });
  }
  return res.json({
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    accounts: out,
  });
});

router.get("/reports/profit-loss", async (req, res) => {
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const accounts = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);
  const { lines } = await buildLedgerWindow(range.from, range.to);
  const totals = new Map<number, number>();
  for (const l of lines) {
    const cur = totals.get(l.accountId) ?? 0;
    // For revenue: credit - debit; for expense: debit - credit
    const acc = accounts.find((a) => a.id === l.accountId);
    if (!acc) continue;
    const v = Number(l.credit) - Number(l.debit);
    totals.set(l.accountId, cur + v);
  }
  const revenues = accounts
    .filter((a) => a.type === "revenue")
    .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((totals.get(a.id) ?? 0) * 100) / 100 }))
    .filter((r) => r.amount !== 0);
  const expenses = accounts
    .filter((a) => a.type === "expense")
    .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((-(totals.get(a.id) ?? 0)) * 100) / 100 }))
    .filter((r) => r.amount !== 0);
  const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
  const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
  return res.json({
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    revenues,
    expenses,
    totalRevenue: Math.round(totalRevenue * 100) / 100,
    totalExpense: Math.round(totalExpense * 100) / 100,
    netIncome: Math.round((totalRevenue - totalExpense) * 100) / 100,
  });
});

router.get("/reports/balance-sheet", async (req, res) => {
  // Balance sheet is "as of" date — use 'to' as cutoff, ignore 'from'
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const asOf = range.to;
  const accounts = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);
  const { lines } = await buildLedgerWindow(null, asOf);
  const totals = new Map<number, number>();
  for (const l of lines) {
    const acc = accounts.find((a) => a.id === l.accountId);
    if (!acc) continue;
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const v = isDebitNormal ? Number(l.debit) - Number(l.credit) : Number(l.credit) - Number(l.debit);
    totals.set(l.accountId, (totals.get(l.accountId) ?? 0) + v);
  }
  const mapAccs = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((totals.get(a.id) ?? 0) * 100) / 100 }))
      .filter((r) => r.amount !== 0);
  const assets = mapAccs("asset");
  const liabilities = mapAccs("liability");
  const equity = mapAccs("equity");
  // Net income (revenue - expense) gets added to equity for current period
  const revenueTotal = accounts.filter((a) => a.type === "revenue").reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
  const expenseTotal = accounts.filter((a) => a.type === "expense").reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
  const netIncome = Math.round((revenueTotal - expenseTotal) * 100) / 100;
  const totalAssets = Math.round(assets.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const totalLiabilities = Math.round(liabilities.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const totalEquity = Math.round((equity.reduce((s, a) => s + a.amount, 0) + netIncome) * 100) / 100;
  return res.json({
    asOf: asOf?.toISOString() ?? new Date().toISOString(),
    assets,
    liabilities,
    equity,
    netIncomeYTD: netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity: Math.round((totalLiabilities + totalEquity) * 100) / 100,
  });
});

export default router;
