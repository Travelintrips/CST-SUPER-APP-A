import { Router, type Request } from "express";
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import {
  db, cashAdvancesTable, cashAdvanceRepaymentsTable,
  chartOfAccountsTable, accountingJournalsTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postEntry } from "../lib/accounting.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// ─── Inline migration ────────────────────────────────────────────────────────
async function ensureTables() {
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS cash_advances (
      id SERIAL PRIMARY KEY,
      company_id INTEGER,
      advance_number TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      party_name TEXT NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      paid_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
      remaining_amount NUMERIC(14,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'bank',
      date DATE NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      receivable_account_id INTEGER,
      cash_bank_account_id INTEGER,
      entry_id INTEGER,
      created_by_id TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS cash_advance_repayments (
      id SERIAL PRIMARY KEY,
      advance_id INTEGER NOT NULL,
      amount NUMERIC(14,2) NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'bank',
      date DATE NOT NULL,
      notes TEXT,
      entry_id INTEGER,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS cash_advances_company_idx ON cash_advances(company_id);
    CREATE INDEX IF NOT EXISTS cash_advances_type_idx ON cash_advances(type);
    CREATE INDEX IF NOT EXISTS cash_advances_status_idx ON cash_advances(status);
    CREATE INDEX IF NOT EXISTS cash_advance_repayments_advance_idx ON cash_advance_repayments(advance_id);
  `));
}
ensureTables().catch(console.error);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeAdv(r: typeof cashAdvancesTable.$inferSelect) {
  return {
    ...r,
    amount: Number(r.amount),
    paidAmount: Number(r.paidAmount),
    remainingAmount: Number(r.remainingAmount),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
function serializeRep(r: typeof cashAdvanceRepaymentsTable.$inferSelect) {
  return { ...r, amount: Number(r.amount), createdAt: r.createdAt.toISOString() };
}

const PREFIXES: Record<string, string> = { kasbon: "KSB", talangan: "TLG" };

async function nextAdvanceNumber(type: string): Promise<string> {
  const prefix = PREFIXES[type] ?? "ADV";
  const year = new Date().getFullYear();
  const [{ cnt }] = await db
    .select({ cnt: sql<number>`cast(count(*) as int)` })
    .from(cashAdvancesTable)
    .where(and(
      eq(cashAdvancesTable.type, type),
      sql`advance_number LIKE ${`${prefix}/${year}/%`}`,
    ));
  return `${prefix}/${year}/${String(Number(cnt) + 1).padStart(5, "0")}`;
}

async function resolveReceivableAccount(type: string, companyId: number | null) {
  const coaCode = type === "kasbon" ? "1-1032" : "1-1033";
  const [row] = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(sql`code LIKE ${coaCode + "%"} ${companyId ? sql`AND (company_id = ${companyId} OR company_id IS NULL)` : sql``}`)
    .orderBy(sql`company_id DESC NULLS LAST`)
    .limit(1);
  return row?.id ?? null;
}

async function resolveCashBankAccount(paymentMethod: string, settings: Awaited<ReturnType<typeof ensureAccountingSettings>>) {
  return paymentMethod === "cash"
    ? (settings.defaultCashAccountId ?? settings.defaultBankAccountId)
    : (settings.defaultBankAccountId ?? settings.defaultCashAccountId);
}

// ─── List ─────────────────────────────────────────────────────────────────────

router.get("/", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const { type, status, from, to } = req.query as Record<string, string>;
  const conds: ReturnType<typeof eq>[] = [eq(cashAdvancesTable.companyId, companyId)];
  if (type) conds.push(eq(cashAdvancesTable.type, type));
  if (status) conds.push(eq(cashAdvancesTable.status, status));
  if (from) conds.push(gte(cashAdvancesTable.date, from));
  if (to) conds.push(lte(cashAdvancesTable.date, to));
  const rows = await db
    .select().from(cashAdvancesTable)
    .where(and(...conds))
    .orderBy(desc(cashAdvancesTable.date), desc(cashAdvancesTable.id))
    .limit(500);
  return res.json(rows.map(serializeAdv));
});

// ─── Detail ───────────────────────────────────────────────────────────────────

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [adv] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  if (!adv) return res.status(404).json({ message: "Not found" });
  const repayments = await db
    .select().from(cashAdvanceRepaymentsTable)
    .where(eq(cashAdvanceRepaymentsTable.advanceId, id))
    .orderBy(desc(cashAdvanceRepaymentsTable.date), desc(cashAdvanceRepaymentsTable.id));
  return res.json({ ...serializeAdv(adv), repayments: repayments.map(serializeRep) });
});

// ─── Create ───────────────────────────────────────────────────────────────────

router.post("/", async (req: Request, res) => {
  const { type, partyName, amount, paymentMethod, date, notes } = req.body ?? {};
  if (!type || !["kasbon", "talangan"].includes(type))
    return res.status(400).json({ message: "type harus 'kasbon' atau 'talangan'." });
  if (!partyName?.trim()) return res.status(400).json({ message: "Nama pihak wajib diisi." });
  const amountN = Number(amount ?? 0);
  if (amountN <= 0) return res.status(400).json({ message: "Nominal harus lebih dari 0." });
  if (!date) return res.status(400).json({ message: "Tanggal wajib diisi." });

  const companyId = resolveCompanyId(req);
  const settings = await ensureAccountingSettings(companyId);

  const receivableAccountId = await resolveReceivableAccount(type, companyId);
  if (!receivableAccountId)
    return res.status(400).json({ message: `Akun piutang (${type === "kasbon" ? "1-1032" : "1-1033"}) belum ada di COA. Seed ulang Chart of Accounts.` });

  const cashBankAccountId = await resolveCashBankAccount(paymentMethod ?? "bank", settings);
  if (!cashBankAccountId)
    return res.status(400).json({ message: "Akun Kas/Bank default belum dikonfigurasi di Pengaturan Akuntansi." });

  const advanceNumber = await nextAdvanceNumber(type);
  const [adv] = await db.insert(cashAdvancesTable).values({
    companyId,
    advanceNumber,
    type,
    partyName: String(partyName).trim(),
    amount: String(amountN),
    paidAmount: "0",
    remainingAmount: String(amountN),
    paymentMethod: paymentMethod ?? "bank",
    date: String(date),
    notes: notes ? String(notes) : null,
    status: "active",
    receivableAccountId,
    cashBankAccountId,
    createdById: (req as any).userId ?? null,
  }).returning();

  // Journal: DR Piutang Karyawan/Talangan, CR Kas/Bank
  const journalType = (paymentMethod ?? "bank") === "cash" ? "cash" : "bank";
  const [journal] = await db.select().from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.type, journalType as any)).limit(1);
  const fallbackJournal = !journal
    ? (await db.select().from(accountingJournalsTable).limit(1))[0]
    : null;
  const j = journal ?? fallbackJournal;
  if (!j) return res.status(400).json({ message: "Jurnal kas/bank tidak ditemukan." });

  const typeLabel = type === "kasbon" ? "Kasbon" : "Dana Talangan";
  const entry = await postEntry({
    journalId: j.id,
    date: new Date(adv!.date),
    ref: adv!.advanceNumber,
    description: `${adv!.advanceNumber} — ${typeLabel} ${adv!.partyName}`,
    source: "manual",
    companyId,
    lines: [
      { accountId: receivableAccountId, debit: amountN, credit: 0, description: `${typeLabel} — ${partyName}` },
      { accountId: cashBankAccountId, debit: 0, credit: amountN, description: paymentMethod === "cash" ? "Kas" : "Bank" },
    ],
  }, j.code);

  await db.update(cashAdvancesTable).set({ entryId: entry.id }).where(eq(cashAdvancesTable.id, adv!.id));
  return res.status(201).json(serializeAdv({ ...adv!, entryId: entry.id }));
});

// ─── Repayment ────────────────────────────────────────────────────────────────

router.post("/:id/repay", async (req: Request, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [adv] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  if (!adv) return res.status(404).json({ message: "Not found" });
  if (adv.status === "repaid") return res.status(400).json({ message: "Kasbon/Talangan ini sudah lunas." });

  const { amount, paymentMethod, date, notes } = req.body ?? {};
  const amountN = Number(amount ?? 0);
  if (amountN <= 0) return res.status(400).json({ message: "Nominal cicilan harus lebih dari 0." });
  if (!date) return res.status(400).json({ message: "Tanggal wajib diisi." });

  const remaining = Number(adv.remainingAmount);
  if (amountN > remaining + 0.01)
    return res.status(400).json({ message: `Cicilan (${amountN}) melebihi sisa piutang (${remaining}).` });

  const companyId = adv.companyId ?? resolveCompanyId(req);
  const settings = await ensureAccountingSettings(companyId);

  const receivableAccountId = adv.receivableAccountId;
  if (!receivableAccountId)
    return res.status(400).json({ message: "Akun piutang tidak ditemukan di record ini." });

  const pm = paymentMethod ?? adv.paymentMethod;
  const cashBankId = pm === "cash"
    ? (settings.defaultCashAccountId ?? settings.defaultBankAccountId)
    : (settings.defaultBankAccountId ?? settings.defaultCashAccountId);
  if (!cashBankId) return res.status(400).json({ message: "Akun Kas/Bank default belum dikonfigurasi." });

  const journalType = pm === "cash" ? "cash" : "bank";
  const [journal] = await db.select().from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.type, journalType as any)).limit(1);
  const fallback = !journal
    ? (await db.select().from(accountingJournalsTable).limit(1))[0]
    : null;
  const j = journal ?? fallback;
  if (!j) return res.status(400).json({ message: "Jurnal kas/bank tidak ditemukan." });

  const typeLabel = adv.type === "kasbon" ? "Kasbon" : "Talangan";
  const repNum = `${adv.advanceNumber}-R${String(Math.floor(Number(adv.paidAmount) / amountN) + 1).padStart(2, "0")}`;
  const entry = await postEntry({
    journalId: j.id,
    date: new Date(String(date)),
    ref: repNum,
    description: `${repNum} — Pelunasan ${typeLabel} ${adv.partyName}`,
    source: "manual",
    companyId,
    lines: [
      { accountId: cashBankId, debit: amountN, credit: 0, description: pm === "cash" ? "Kas" : "Bank" },
      { accountId: receivableAccountId, debit: 0, credit: amountN, description: `${typeLabel} — ${adv.partyName}` },
    ],
  }, j.code);

  const [rep] = await db.insert(cashAdvanceRepaymentsTable).values({
    advanceId: id,
    amount: String(amountN),
    paymentMethod: pm,
    date: String(date),
    notes: notes ? String(notes) : null,
    entryId: entry.id,
  }).returning();

  const newPaid = Number(adv.paidAmount) + amountN;
  const newRemaining = Math.max(0, remaining - amountN);
  const newStatus = newRemaining <= 0.005 ? "repaid" : "partial";

  await db.update(cashAdvancesTable).set({
    paidAmount: String(newPaid),
    remainingAmount: String(newRemaining),
    status: newStatus,
    updatedAt: new Date(),
  }).where(eq(cashAdvancesTable.id, id));

  const [updated] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  return res.status(201).json({ repayment: serializeRep(rep!), advance: serializeAdv(updated!) });
});

// ─── Delete ───────────────────────────────────────────────────────────────────

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [adv] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  if (!adv) return res.status(404).json({ message: "Not found" });
  if (adv.status !== "active" || Number(adv.paidAmount) > 0)
    return res.status(400).json({ message: "Hanya kasbon/talangan yang belum ada cicilan yang bisa dihapus." });
  await db.delete(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  return res.json({ message: "Deleted" });
});

export default router;
