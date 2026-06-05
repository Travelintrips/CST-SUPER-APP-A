import { Router, type Request } from "express";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { eq, desc, and, gte, lte, like, or, sql, count } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logStorageEvent, getRequestIp, getActor } from "../lib/storageAuditLog.js";
import {
  db,
  expenseCategoriesTable,
  expensesTable,
  expenseAttachmentsTable,
  chartOfAccountsTable,
  accountingTaxesTable,
  accountingJournalsTable,
  accountingEntriesTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postEntry } from "../lib/accounting.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";

const _expenseObjectStorage = new ObjectStorageService();

// ── Boot migration: add default_tax_id & default_amount to expense_categories ──
db.execute(sql`
  ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS default_tax_id integer
  REFERENCES accounting_taxes(id) ON DELETE SET NULL
`).catch(() => {});
db.execute(sql`
  ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS default_amount NUMERIC(14,2)
`).catch(() => {});
db.execute(sql`
  ALTER TABLE expense_categories
  ADD COLUMN IF NOT EXISTS default_coa_id integer REFERENCES chart_of_accounts(id) ON DELETE SET NULL
`).catch(() => {});

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// ===================== Serialize helpers =====================

function serializeCategory(c: typeof expenseCategoriesTable.$inferSelect) {
  return { ...c };
}

function serializeExpense(e: typeof expensesTable.$inferSelect) {
  return {
    ...e,
    qty: Number(e.qty),
    unitPrice: Number(e.unitPrice),
    subtotal: Number(e.subtotal),
    taxAmount: Number(e.taxAmount),
    total: Number(e.total),
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

// ===================== Expense Number Generator =====================

async function nextExpenseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(expensesTable)
    .where(like(expensesTable.expenseNumber, `EXP/${year}/%`));
  const seq = (Number(count) + 1).toString().padStart(5, "0");
  return `EXP/${year}/${seq}`;
}

// ===================== Expense Categories =====================

router.get("/categories/check-code", async (req, res) => {
  const code = String(req.query.code ?? "").trim().toUpperCase();
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
  if (!code) return res.json({ taken: false });
  const result = await db.execute(sql`
    SELECT id FROM expense_categories
    WHERE UPPER(code) = ${code}
    ${excludeId && !Number.isNaN(excludeId) ? sql`AND id != ${excludeId}` : sql``}
    LIMIT 1
  `);
  return res.json({ taken: result.rows.length > 0 });
});

router.get("/categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(expenseCategoriesTable)
    .orderBy(expenseCategoriesTable.name);
  return res.json(rows.map(serializeCategory));
});

router.post("/categories", async (req, res) => {
  const { name, code, expenseAccountId, payableAccountId, defaultTaxId, defaultAmount, defaultCoaId, requiresAttachment, isActive } = req.body ?? {};
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });
  const [created] = await db
    .insert(expenseCategoriesTable)
    .values({
      name: String(name),
      code: String(code).toUpperCase(),
      expenseAccountId: expenseAccountId ? Number(expenseAccountId) : null,
      payableAccountId: payableAccountId ? Number(payableAccountId) : null,
      defaultTaxId: defaultTaxId ? Number(defaultTaxId) : null,
      defaultAmount: defaultAmount ? String(Number(defaultAmount)) : null,
      defaultCoaId: defaultCoaId ? Number(defaultCoaId) : null,
      requiresAttachment: Boolean(requiresAttachment),
      isActive: isActive !== false,
    })
    .returning();
  return res.status(201).json(serializeCategory(created!));
});

router.patch("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { name, code, expenseAccountId, payableAccountId, defaultTaxId, defaultAmount, defaultCoaId, requiresAttachment, isActive } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = String(name);
  if (code !== undefined) update.code = String(code).toUpperCase();
  if (expenseAccountId !== undefined) update.expenseAccountId = expenseAccountId ? Number(expenseAccountId) : null;
  if (payableAccountId !== undefined) update.payableAccountId = payableAccountId ? Number(payableAccountId) : null;
  if (defaultTaxId !== undefined) update.defaultTaxId = defaultTaxId ? Number(defaultTaxId) : null;
  if (defaultAmount !== undefined) update.defaultAmount = defaultAmount ? String(Number(defaultAmount)) : null;
  if (defaultCoaId !== undefined) update.defaultCoaId = defaultCoaId ? Number(defaultCoaId) : null;
  if (requiresAttachment !== undefined) update.requiresAttachment = Boolean(requiresAttachment);
  if (isActive !== undefined) update.isActive = Boolean(isActive);
  const [updated] = await db
    .update(expenseCategoriesTable)
    .set(update)
    .where(eq(expenseCategoriesTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeCategory(updated));
});

router.delete("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
  return res.json({ message: "Deleted" });
});

router.post("/seed-categories", async (_req, res) => {
  const settings = await ensureAccountingSettings();
  const allAccounts = await db.select().from(chartOfAccountsTable);
  const byCode = new Map(allAccounts.map((a) => [a.code, a]));
  const ap = byCode.get("2-1010");
  const opex = byCode.get("5-2040");

  // Lookup default taxes by name for auto-mapping
  const allTaxes = await db.select().from(accountingTaxesTable);
  const taxByName = new Map(allTaxes.map((t) => [t.name.toLowerCase(), t]));
  const pph23 = taxByName.get("pph 23") ?? allTaxes.find((t) => t.name.toLowerCase().includes("pph 23"));
  const pph21 = taxByName.get("pph 21") ?? allTaxes.find((t) => t.name.toLowerCase().includes("pph 21"));
  const pphSewa = allTaxes.find((t) => t.name.toLowerCase().includes("sewa"));

  type CatDef = {
    name: string; code: string; coaCode?: string;
    requiresAttachment?: boolean; taxCode?: "pph23" | "pph21" | "pphSewa" | null;
  };
  const CATEGORIES: CatDef[] = [
    { name: "Biaya Trucking",         code: "TRUCKING",      taxCode: "pph23" },
    { name: "Biaya Handling",         code: "HANDLING",      taxCode: "pph23" },
    { name: "Biaya Storage",          code: "STORAGE",       taxCode: "pph23" },
    { name: "Biaya Pabean",           code: "CUSTOMS",       taxCode: "pph23" },
    { name: "Biaya Dokumen",          code: "DOCUMENT",      taxCode: "pph23" },
    { name: "Biaya Freight",          code: "FREIGHT",       taxCode: "pph23" },
    { name: "Biaya Container",        code: "CONTAINER",     taxCode: "pph23" },
    { name: "Biaya Operasional",      code: "OPERATIONAL",   taxCode: "pph23" },
    { name: "Reimbursement Karyawan", code: "REIMBURSEMENT", requiresAttachment: true, taxCode: "pph21" },
    { name: "Biaya Vendor/Subcon",    code: "VENDOR",        taxCode: "pph23" },
    // ── Preset Rutin ──────────────────────────────────────────────
    { name: "Entertainment",          code: "ENTERTAINMENT", coaCode: "5-2060", taxCode: null },
    { name: "Makan & Minum",          code: "MAKAN_MINUM",  coaCode: "5-2040", taxCode: null },
    { name: "Sewa Kantor",            code: "SEWA_KANTOR",  coaCode: "5-2020", taxCode: "pphSewa" },
    { name: "Utilitas",               code: "UTILITAS",     coaCode: "5-2030", taxCode: null },
    { name: "Peralatan & ATK",        code: "PERALATAN",    coaCode: "5-2090", taxCode: null },
    { name: "Biaya Lain-lain",        code: "LAIN_LAIN",    coaCode: "5-3000", taxCode: null },
  ];

  for (const cat of CATEGORIES) {
    const expAcc = cat.coaCode ? byCode.get(cat.coaCode) : opex;
    const defaultTaxId =
      cat.taxCode === "pph23" ? (pph23?.id ?? null)
      : cat.taxCode === "pph21" ? (pph21?.id ?? null)
      : cat.taxCode === "pphSewa" ? (pphSewa?.id ?? null)
      : null;
    await db
      .insert(expenseCategoriesTable)
      .values({
        name: cat.name,
        code: cat.code,
        expenseAccountId: expAcc?.id ?? opex?.id ?? null,
        payableAccountId: ap?.id ?? settings.apAccountId ?? null,
        defaultTaxId,
        requiresAttachment: cat.requiresAttachment ?? false,
        isActive: true,
      })
      .onConflictDoNothing({ target: expenseCategoriesTable.code });
  }

  const rows = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
  return res.json({ seeded: rows.length, categories: rows.map(serializeCategory) });
});

// ===================== Quick Expense (Expense Rutin) =====================
// Direct cash/bank payment: DR Biaya, CR Kas/Bank (no AP step)

// ─── Helper: post journal for a pending quick expense (called from approval route) ─
export async function postQuickExpenseJournal(expenseId: number) {
  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, expenseId));
  if (!expense) throw new Error("Expense tidak ditemukan");

  const companyId = expense.companyId ?? null;
  const settings = await ensureAccountingSettings(companyId);

  const expenseAccountId = expense.expenseAccountId;
  if (!expenseAccountId) throw new Error("Akun biaya tidak ditemukan di record ini");

  const isCash = expense.notes?.includes("cash") || false;
  const cashBankAccountId =
    (settings.defaultBankAccountId ?? settings.defaultCashAccountId);
  if (!cashBankAccountId) throw new Error("Akun Kas/Bank default belum dikonfigurasi");

  const amountN = Number(expense.subtotal);
  const taxAmountN = Number(expense.taxAmount ?? 0);
  const totalN = Number(expense.total);

  let taxKindQEJ: string | null = null;
  let taxAccountIdQEJ: number | null = null;
  if (expense.taxRateId) {
    const [taxRow] = await db.select().from(accountingTaxesTable)
      .where(eq(accountingTaxesTable.id, expense.taxRateId));
    taxKindQEJ = taxRow?.kind ?? null;
    taxAccountIdQEJ = taxRow?.accountId ?? null;
  }
  const isWithholdingQEJ = taxKindQEJ === "withholding";
  const cashNetQEJ = isWithholdingQEJ ? amountN - taxAmountN : totalN;

  const journalType = "bank";
  const journals = await db.select().from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.type, journalType)).limit(1);
  const fallback = !journals[0]
    ? (await db.select().from(accountingJournalsTable).limit(1))[0]
    : null;
  const journal = journals[0] ?? fallback;
  if (!journal) throw new Error("Jurnal kas/bank tidak ditemukan");

  const lines = [
    { accountId: expenseAccountId, debit: amountN, credit: 0, description: expense.description ?? "Biaya" },
    ...(taxAmountN > 0 && isWithholdingQEJ && taxAccountIdQEJ
      ? [{ accountId: taxAccountIdQEJ, debit: 0, credit: taxAmountN, description: "Hutang PPh" }]
      : taxAmountN > 0 && !isWithholdingQEJ && settings.ppnInputAccountId
      ? [{ accountId: settings.ppnInputAccountId, debit: taxAmountN, credit: 0, description: "PPN Masukan" }]
      : []),
    { accountId: cashBankAccountId, debit: 0, credit: cashNetQEJ, description: "Bank" },
  ];

  const entry = await postEntry({
    journalId: journal.id,
    date: new Date(expense.date),
    ref: expense.expenseNumber,
    description: `${expense.expenseNumber} — ${expense.description ?? "Expense"}`,
    source: "manual",
    companyId,
    lines,
  }, journal.code);

  await db.update(expensesTable)
    .set({ entryId: entry.id, status: "posted", updatedAt: new Date() })
    .where(eq(expensesTable.id, expenseId));
  return entry;
}

// ─── Check approval limit ─────────────────────────────────────────────────────
async function checkExpenseApprovalLimit(companyId: number | null, amount: number) {
  const { sql: sqlFn } = await import("drizzle-orm");
  const result = await db.execute(sqlFn.raw(`
    SELECT * FROM expense_approval_limits
    WHERE category = 'expense'
      AND (company_id = ${companyId ?? "NULL"} OR company_id IS NULL)
    ORDER BY company_id NULLS LAST
    LIMIT 1
  `));
  const limit = result.rows[0] as any | undefined;
  if (!limit) return { needsApproval: false, limit: null };
  const maxAuto = parseFloat(limit.max_auto_approve ?? "0");
  const needsApproval = maxAuto === 0 || amount > maxAuto;
  return { needsApproval, limit };
}

router.post("/quick", async (req: Request, res) => {
  const { date, categoryId, amount, vendorEmployee, notes, taxRateId, paymentMethod, sourceAccountId, debitAccountId } = req.body ?? {};

  if (!date) return res.status(400).json({ message: "Tanggal wajib diisi." });
  if (!categoryId) return res.status(400).json({ message: "Kategori wajib dipilih." });
  const amountN = Number(amount ?? 0);
  if (!amountN || amountN <= 0) return res.status(400).json({ message: "Nominal harus lebih dari 0." });

  const companyId = resolveCompanyId(req as Request);
  const settings = await ensureAccountingSettings(companyId);

  const [cat] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, Number(categoryId)));
  if (!cat) return res.status(404).json({ message: "Kategori tidak ditemukan." });

  // debitAccountId override → from form dropdown, fallback to category default
  const expenseAccountId = debitAccountId ? Number(debitAccountId) : cat.expenseAccountId;
  if (!expenseAccountId) {
    return res.status(400).json({ message: `Kategori "${cat.name}" belum punya akun biaya. Konfigurasi di halaman Kategori Expense.` });
  }

  // sourceAccountId override → specific COA for cash/bank payment
  let cashBankAccountId: number | null = sourceAccountId ? Number(sourceAccountId) : null;
  if (!cashBankAccountId) {
    const isCash = paymentMethod === "cash" || paymentMethod === "tunai";
    cashBankAccountId = isCash
      ? (settings.defaultCashAccountId ?? settings.defaultBankAccountId)
      : (settings.defaultBankAccountId ?? settings.defaultCashAccountId);
  }
  const isCash = paymentMethod === "cash" || paymentMethod === "tunai";
  if (!cashBankAccountId) {
    return res.status(400).json({ message: "Akun Kas/Bank default belum dikonfigurasi di Pengaturan Akuntansi." });
  }

  let taxAmountN = 0;
  let taxKindQ: string | null = null;
  let taxAccountIdQ: number | null = null;
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) {
      taxAmountN = Math.round(amountN * Number(tax.rate) / 100 * 100) / 100;
      taxKindQ = tax.kind ?? null;
      taxAccountIdQ = tax.accountId ?? null;
    }
  }
  const isWithholdingQ = taxKindQ === "withholding";
  const totalN = isWithholdingQ
    ? Math.round((amountN - taxAmountN) * 100) / 100
    : Math.round((amountN + taxAmountN) * 100) / 100;

  // ── Cek limit approval ────────────────────────────────────────────────────
  const { needsApproval, limit } = await checkExpenseApprovalLimit(companyId, totalN);
  const userId = (req as unknown as { userId?: string }).userId ?? null;

  const expenseNumber = await nextExpenseNumber();

  if (needsApproval && limit) {
    // Simpan expense dengan status pending_approval, tunda jurnal
    const [expense] = await db.insert(expensesTable).values({
      companyId,
      expenseNumber,
      date: String(date),
      vendorEmployee: vendorEmployee ? String(vendorEmployee) : null,
      expenseType: "routine",
      categoryId: Number(categoryId),
      description: notes ? String(notes) : cat.name,
      qty: "1",
      unitPrice: String(amountN),
      subtotal: String(amountN),
      taxRateId: taxRateId ? Number(taxRateId) : null,
      taxAmount: String(taxAmountN),
      total: String(totalN),
      currency: "IDR",
      status: "pending_approval",
      notes: notes ? String(notes) : null,
      expenseAccountId,
      payableAccountId: cat.payableAccountId ?? null,
      createdById: userId,
    }).returning();

    // Ambil nama requester & approvers
    let requesterName: string | null = null;
    if (userId) {
      const ur = await db.execute(sql`SELECT name FROM users WHERE id = ${userId} LIMIT 1`);
      requesterName = (ur.rows[0] as any)?.name ?? null;
    }
    let l1Name: string | null = null, l2Name: string | null = null;
    if (limit.l1_approver_id) {
      const r = await db.execute(sql`SELECT name FROM users WHERE id = ${limit.l1_approver_id} LIMIT 1`);
      l1Name = (r.rows[0] as any)?.name ?? null;
    }
    if (limit.l2_approver_id) {
      const r = await db.execute(sql`SELECT name FROM users WHERE id = ${limit.l2_approver_id} LIMIT 1`);
      l2Name = (r.rows[0] as any)?.name ?? null;
    }

    // Buat approval request
    const desc = `${cat.name}${vendorEmployee ? ` / ${vendorEmployee}` : ""} — Rp ${new Intl.NumberFormat("id-ID").format(totalN)}`;
    const ar = await db.execute(sql.raw(`
      INSERT INTO expense_approval_requests
        (company_id, ref_type, ref_id, description, amount, requester_id, requester_name,
         status, l1_approver_id, l1_approver_name, l1_status,
         l2_approver_id, l2_approver_name, l2_status)
      VALUES
        (${companyId ?? "NULL"}, 'expense', ${expense!.id},
         '${desc.replace(/'/g, "''")}', ${totalN},
         ${userId ? `'${userId}'` : "NULL"},
         ${requesterName ? `'${requesterName.replace(/'/g, "''")}'` : "NULL"},
         'pending',
         ${limit.l1_approver_id ? `'${limit.l1_approver_id}'` : "NULL"},
         ${l1Name ? `'${l1Name.replace(/'/g, "''")}'` : "NULL"},
         ${limit.l1_approver_id ? "'pending'" : "NULL"},
         ${limit.l2_approver_id ? `'${limit.l2_approver_id}'` : "NULL"},
         ${l2Name ? `'${l2Name.replace(/'/g, "''")}'` : "NULL"},
         ${limit.l2_approver_id ? "'pending'" : "NULL"})
      RETURNING id
    `));

    // Kirim WA notifikasi ke grup admin
    try {
      const { getAdminGroupWa } = await import("../lib/adminWa.js");
      const { sendWhatsApp } = await import("../lib/fonnte.js");
      const adminGroup = await getAdminGroupWa();
      const arId = (ar.rows[0] as any)?.id;
      if (adminGroup) {
        const approverInfo = l1Name ? `\nApprover L1: *${l1Name}*` : "";
        const msg = `🔔 *Permintaan Approval Expense Baru*\n\nKategori: ${cat.name}\nDeskripsi: ${notes ?? cat.name}\nNominal: Rp ${new Intl.NumberFormat("id-ID").format(totalN)}\nPemohon: ${requesterName ?? userId ?? "-"}${approverInfo}\n\nBuka BizPortal → Expense → Approval untuk memproses.`;
        sendWhatsApp(adminGroup, msg, { context: "expense_approval_request", refId: String(arId) }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    return res.status(201).json({
      ...serializeExpense(expense!),
      needsApproval: true,
      message: `Expense menunggu persetujuan (melebihi limit auto-approve).`,
    });
  }

  // ── Tidak perlu approval — posting langsung ───────────────────────────────
  const [expense] = await db.insert(expensesTable).values({
    companyId,
    expenseNumber,
    date: String(date),
    vendorEmployee: vendorEmployee ? String(vendorEmployee) : null,
    expenseType: "routine",
    categoryId: Number(categoryId),
    description: notes ? String(notes) : cat.name,
    qty: "1",
    unitPrice: String(amountN),
    subtotal: String(amountN),
    taxRateId: taxRateId ? Number(taxRateId) : null,
    taxAmount: String(taxAmountN),
    total: String(totalN),
    currency: "IDR",
    status: "posted",
    notes: notes ? String(notes) : null,
    expenseAccountId,
    createdById: userId,
  }).returning();

  // Journal: DR Expense Account, [DR PPN Input], CR Kas/Bank
  const journalType = isCash ? "cash" : "bank";
  const journals = await db.select().from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.type, journalType)).limit(1);
  const fallback = !journals[0]
    ? (await db.select().from(accountingJournalsTable).where(eq(accountingJournalsTable.type, "bank")).limit(1))[0]
    : null;
  const journal = journals[0] ?? fallback;
  if (!journal) return res.status(400).json({ message: "Jurnal kas/bank tidak ditemukan." });

  const lines = [
    { accountId: expenseAccountId, debit: amountN, credit: 0, description: cat.name },
    ...(taxAmountN > 0 && isWithholdingQ && taxAccountIdQ
      ? [{ accountId: taxAccountIdQ, debit: 0, credit: taxAmountN, description: "Hutang PPh" }]
      : taxAmountN > 0 && !isWithholdingQ && settings.ppnInputAccountId
      ? [{ accountId: settings.ppnInputAccountId, debit: taxAmountN, credit: 0, description: "PPN Masukan" }]
      : []),
    { accountId: cashBankAccountId, debit: 0, credit: totalN, description: isCash ? "Kas" : "Bank" },
  ];

  const entry = await postEntry({
    journalId: journal.id,
    date: new Date(expense!.date),
    ref: expense!.expenseNumber,
    description: `${expense!.expenseNumber} — ${cat.name}${vendorEmployee ? ` / ${vendorEmployee}` : ""}`,
    source: "manual",
    companyId,
    lines,
  }, journal.code);

  await db.update(expensesTable).set({ entryId: entry.id }).where(eq(expensesTable.id, expense!.id));

  const { recordTransactionTax } = await import("../lib/taxAutoService.js");
  void recordTransactionTax({
    companyId,
    transactionType: "expense",
    transactionId: expense!.id,
    transactionRef: expense!.expenseNumber,
    baseAmount: amountN,
    taxAmount: taxAmountN > 0 ? taxAmountN : undefined,
    subType: cat.code ?? null,
  });

  return res.status(201).json({ ...serializeExpense({ ...expense!, entryId: entry.id }), needsApproval: false });
});

// ===================== Expense Summary / Reports =====================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const VALID_STATUSES = new Set(["draft", "submitted", "approved", "posted", "paid", "rejected"]);

router.get("/summary", async (req, res) => {
  const { from, to, status } = req.query as Record<string, string>;

  const dateFrom = from && ISO_DATE_RE.test(from)
    ? from
    : new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);
  const dateTo = to && ISO_DATE_RE.test(to)
    ? to
    : new Date().toISOString().slice(0, 10);

  if (status && !VALID_STATUSES.has(status)) {
    return res.status(400).json({ message: `Invalid status: ${status}` });
  }

  const conditions: ReturnType<typeof eq>[] = [
    gte(expensesTable.date, dateFrom),
    lte(expensesTable.date, dateTo),
  ];
  if (status) conditions.push(eq(expensesTable.status, status));

  const where = and(...conditions);

  // Grand total & count
  const [totals] = await db
    .select({
      grandTotal: sql<number>`COALESCE(SUM(CAST(${expensesTable.total} AS NUMERIC)), 0)`,
      totalCount: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(expensesTable)
    .where(where);

  // By category
  const byCategory = await db
    .select({
      categoryId: expensesTable.categoryId,
      categoryName: expenseCategoriesTable.name,
      total: sql<number>`COALESCE(SUM(CAST(${expensesTable.total} AS NUMERIC)), 0)`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(expensesTable)
    .leftJoin(expenseCategoriesTable, eq(expensesTable.categoryId, expenseCategoriesTable.id))
    .where(where)
    .groupBy(expensesTable.categoryId, expenseCategoriesTable.name)
    .orderBy(sql`SUM(CAST(${expensesTable.total} AS NUMERIC)) DESC`);

  // By month (trend)
  const byMonth = await db
    .select({
      month: sql<string>`TO_CHAR(${expensesTable.date}::date, 'YYYY-MM')`,
      total: sql<number>`COALESCE(SUM(CAST(${expensesTable.total} AS NUMERIC)), 0)`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(expensesTable)
    .where(where)
    .groupBy(sql`TO_CHAR(${expensesTable.date}::date, 'YYYY-MM')`)
    .orderBy(sql`TO_CHAR(${expensesTable.date}::date, 'YYYY-MM') ASC`);

  // Top vendors
  const topVendors = await db
    .select({
      vendor: sql<string>`COALESCE(${expensesTable.vendorEmployee}, '(Tanpa vendor)')`,
      total: sql<number>`COALESCE(SUM(CAST(${expensesTable.total} AS NUMERIC)), 0)`,
      count: sql<number>`CAST(COUNT(*) AS INT)`,
    })
    .from(expensesTable)
    .where(where)
    .groupBy(expensesTable.vendorEmployee)
    .orderBy(sql`SUM(CAST(${expensesTable.total} AS NUMERIC)) DESC`)
    .limit(10);

  return res.json({
    from: dateFrom,
    to: dateTo,
    grandTotal: Number(totals?.grandTotal ?? 0),
    totalCount: Number(totals?.totalCount ?? 0),
    byCategory: byCategory.map((r) => ({
      categoryId: r.categoryId,
      categoryName: r.categoryName ?? "(Tanpa kategori)",
      total: Number(r.total),
      count: Number(r.count),
    })),
    byMonth: byMonth.map((r) => ({
      month: r.month,
      total: Number(r.total),
      count: Number(r.count),
    })),
    topVendors: topVendors.map((r) => ({
      vendor: r.vendor,
      total: Number(r.total),
      count: Number(r.count),
    })),
  });
});

// ===================== Expenses CRUD =====================

router.get("/", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const conditions: ReturnType<typeof eq>[] = [eq(expensesTable.companyId, companyId)];
  const { status, categoryId, expenseType, salesDocId, shipmentId, search, from, to } = req.query as Record<string, string>;

  if (status) conditions.push(eq(expensesTable.status, status));
  if (categoryId) conditions.push(eq(expensesTable.categoryId, Number(categoryId)));
  if (expenseType) conditions.push(eq(expensesTable.expenseType, expenseType));
  if (salesDocId) conditions.push(eq(expensesTable.salesDocId, Number(salesDocId)));
  if (shipmentId) conditions.push(eq(expensesTable.shipmentId, Number(shipmentId)));
  if (from) conditions.push(gte(expensesTable.date, from));
  if (to) conditions.push(lte(expensesTable.date, to));

  let rows = await db
    .select()
    .from(expensesTable)
    .where(and(...conditions))
    .orderBy(desc(expensesTable.date), desc(expensesTable.id))
    .limit(500);

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.expenseNumber.toLowerCase().includes(q) ||
        (r.vendorEmployee ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }

  return res.json(rows.map(serializeExpense));
});

router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!expense) return res.status(404).json({ message: "Not found" });
  const attachments = await db
    .select()
    .from(expenseAttachmentsTable)
    .where(eq(expenseAttachmentsTable.expenseId, id));
  const category = expense.categoryId
    ? (await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, expense.categoryId)))[0] ?? null
    : null;
  return res.json({
    ...serializeExpense(expense),
    attachments,
    category: category ? serializeCategory(category) : null,
  });
});

router.post("/", async (req, res) => {
  const {
    date, vendorEmployee, expenseType, salesDocId, shipmentId, categoryId,
    description, qty, unit, unitPrice, taxRateId, currency, notes,
    expenseAccountId, payableAccountId,
  } = req.body ?? {};

  if (!date) return res.status(400).json({ message: "date required" });
  if (!categoryId) return res.status(400).json({ message: "Kategori wajib dipilih." });

  const qtyN = Number(qty ?? 1);
  const upN = Number(unitPrice ?? 0);
  const subtotal = Math.round(qtyN * upN * 100) / 100;

  let taxAmountN = 0;
  let taxKindCreate: string | null = null;
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) {
      taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
      taxKindCreate = tax.kind ?? null;
    }
  }
  const total = taxKindCreate === "withholding"
    ? Math.round((subtotal - taxAmountN) * 100) / 100
    : Math.round((subtotal + taxAmountN) * 100) / 100;

  const companyIdForInsert = resolveCompanyId(req as Request);
  const expenseNumber = await nextExpenseNumber();

  const [created] = await db
    .insert(expensesTable)
    .values({
      companyId: companyIdForInsert,
      expenseNumber,
      date: String(date),
      vendorEmployee: vendorEmployee ? String(vendorEmployee) : null,
      expenseType: expenseType ?? "vendor_bill",
      salesDocId: salesDocId ? Number(salesDocId) : null,
      shipmentId: shipmentId ? Number(shipmentId) : null,
      categoryId: categoryId ? Number(categoryId) : null,
      description: description ? String(description) : null,
      qty: String(qtyN),
      unit: unit ? String(unit) : null,
      unitPrice: String(upN),
      subtotal: String(subtotal),
      taxRateId: taxRateId ? Number(taxRateId) : null,
      taxAmount: String(taxAmountN),
      total: String(total),
      currency: currency ? String(currency) : "IDR",
      status: "draft",
      notes: notes ? String(notes) : null,
      expenseAccountId: expenseAccountId ? Number(expenseAccountId) : null,
      payableAccountId: payableAccountId ? Number(payableAccountId) : null,
      createdById: (req as { userId?: string }).userId ?? null,
    })
    .returning();

  return res.status(201).json(serializeExpense(created!));
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) return res.status(404).json({ message: "Not found" });
  if (existing.status === "posted" || existing.status === "paid") {
    return res.status(400).json({ message: "Expense yang sudah diposting tidak bisa diedit." });
  }

  const {
    date, vendorEmployee, expenseType, salesDocId, shipmentId, categoryId,
    description, qty, unit, unitPrice, taxRateId, currency, notes,
    expenseAccountId, payableAccountId,
  } = req.body ?? {};

  const qtyN = Number(qty ?? 1);
  const upN = Number(unitPrice ?? 0);
  const subtotal = Math.round(qtyN * upN * 100) / 100;

  let taxAmountN = 0;
  let taxKindUpdate: string | null = null;
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) {
      taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
      taxKindUpdate = tax.kind ?? null;
    }
  }
  const total = taxKindUpdate === "withholding"
    ? Math.round((subtotal - taxAmountN) * 100) / 100
    : Math.round((subtotal + taxAmountN) * 100) / 100;

  const [updated] = await db
    .update(expensesTable)
    .set({
      date: String(date),
      vendorEmployee: vendorEmployee ? String(vendorEmployee) : null,
      expenseType: expenseType ?? "vendor_bill",
      salesDocId: salesDocId ? Number(salesDocId) : null,
      shipmentId: shipmentId ? Number(shipmentId) : null,
      categoryId: categoryId ? Number(categoryId) : null,
      description: description ? String(description) : null,
      qty: String(qtyN),
      unit: unit ? String(unit) : null,
      unitPrice: String(upN),
      subtotal: String(subtotal),
      taxRateId: taxRateId ? Number(taxRateId) : null,
      taxAmount: String(taxAmountN),
      total: String(total),
      currency: currency ? String(currency) : "IDR",
      notes: notes ? String(notes) : null,
      expenseAccountId: expenseAccountId ? Number(expenseAccountId) : null,
      payableAccountId: payableAccountId ? Number(payableAccountId) : null,
      updatedAt: new Date(),
    })
    .where(eq(expensesTable.id, id))
    .returning();

  return res.json(serializeExpense(updated!));
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!existing) return res.status(404).json({ message: "Not found" });
  if (existing.status !== "draft" && existing.status !== "rejected") {
    return res.status(400).json({ message: "Hanya expense dengan status Draft atau Rejected yang bisa dihapus." });
  }
  // Ambil objectPath semua attachment sebelum dihapus dari DB
  const attachments = await db
    .select({ objectPath: expenseAttachmentsTable.objectPath })
    .from(expenseAttachmentsTable)
    .where(eq(expenseAttachmentsTable.expenseId, id));
  await db.delete(expenseAttachmentsTable).where(eq(expenseAttachmentsTable.expenseId, id));
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
  // Cascade storage cleanup — hapus file fisik (non-fatal)
  for (const a of attachments) {
    if (a.objectPath) _expenseObjectStorage.tryDeletePrivateEntity(a.objectPath).catch(() => {});
  }
  return res.json({ message: "Deleted" });
});

// ===================== Status Actions =====================

router.post("/:id/action", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const action = req.body?.action as string | undefined;
  if (!action) return res.status(400).json({ message: "action required" });

  const [expense] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  if (!expense) return res.status(404).json({ message: "Not found" });

  const transitions: Record<string, string[]> = {
    submit: ["draft"],
    approve: ["submitted"],
    reject: ["submitted"],
    post: ["approved"],
    pay: ["posted"],
    reset: ["submitted", "rejected"],
  };
  const allowed = transitions[action];
  if (!allowed) return res.status(400).json({ message: `Unknown action: ${action}` });
  if (!allowed.includes(expense.status)) {
    return res.status(400).json({ message: `Cannot ${action} from status '${expense.status}'` });
  }

  if (action === "submit" && expense.categoryId) {
    const [cat] = await db
      .select({ requiresAttachment: expenseCategoriesTable.requiresAttachment })
      .from(expenseCategoriesTable)
      .where(eq(expenseCategoriesTable.id, expense.categoryId));
    if (cat?.requiresAttachment) {
      const [{ total }] = await db
        .select({ total: count() })
        .from(expenseAttachmentsTable)
        .where(eq(expenseAttachmentsTable.expenseId, id));
      if (Number(total) === 0) {
        return res.status(400).json({
          message: "Kategori ini mewajibkan lampiran bukti. Harap unggah dokumen pendukung sebelum mengajukan.",
        });
      }
    }
  }

  if (action === "post") {
    const expenseCompanyId = expense.companyId ?? 1;
    const settings = await ensureAccountingSettings(expenseCompanyId);

    const effectiveExpenseAccountId = expense.expenseAccountId ?? null;
    const effectivePayableAccountId = expense.payableAccountId ?? settings.apAccountId ?? null;

    let resolvedExpenseAccountId = effectiveExpenseAccountId;
    let resolvedPayableAccountId = effectivePayableAccountId;

    if (expense.categoryId) {
      const [cat] = await db.select().from(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, expense.categoryId));
      if (cat) {
        resolvedExpenseAccountId = expense.expenseAccountId ?? cat.expenseAccountId;
        resolvedPayableAccountId = expense.payableAccountId ?? cat.payableAccountId;
      }
    }

    if (!resolvedExpenseAccountId) {
      return res.status(400).json({ message: "Akun biaya belum diset. Pilih akun biaya di kategori atau di expense." });
    }
    if (!resolvedPayableAccountId) {
      return res.status(400).json({ message: "Akun hutang belum diset. Pilih akun hutang di kategori atau di expense." });
    }

    const totalN = Number(expense.total);
    const taxAmountN = Number(expense.taxAmount);
    const subtotalN = Number(expense.subtotal);

    let taxKindPost: string | null = null;
    let taxAccountIdPost: number | null = null;
    if (expense.taxRateId) {
      const [taxRow] = await db.select().from(accountingTaxesTable)
        .where(eq(accountingTaxesTable.id, expense.taxRateId));
      taxKindPost = taxRow?.kind ?? null;
      taxAccountIdPost = taxRow?.accountId ?? null;
    }
    const isWithholdingPost = taxKindPost === "withholding";

    const lines = [];
    lines.push({ accountId: resolvedExpenseAccountId, debit: subtotalN, credit: 0, description: expense.description ?? expense.expenseNumber });
    if (taxAmountN > 0 && isWithholdingPost && taxAccountIdPost) {
      lines.push({ accountId: taxAccountIdPost, debit: 0, credit: taxAmountN, description: "Hutang PPh" });
      lines.push({ accountId: resolvedPayableAccountId, debit: 0, credit: totalN, description: expense.vendorEmployee ?? expense.expenseNumber });
    } else if (taxAmountN > 0 && !isWithholdingPost && settings.ppnInputAccountId) {
      lines.push({ accountId: settings.ppnInputAccountId, debit: taxAmountN, credit: 0, description: "PPN Masukan" });
      lines.push({ accountId: resolvedPayableAccountId, debit: 0, credit: totalN, description: expense.vendorEmployee ?? expense.expenseNumber });
    } else {
      lines.push({ accountId: resolvedPayableAccountId, debit: 0, credit: subtotalN, description: expense.vendorEmployee ?? expense.expenseNumber });
    }

    const [journal] = await db.select().from(accountingJournalsTable).where(eq(accountingJournalsTable.type, "purchase")).limit(1);
    if (!journal) return res.status(400).json({ message: "Jurnal pembelian tidak ditemukan." });

    const entry = await postEntry(
      {
        journalId: journal.id,
        date: new Date(expense.date),
        ref: expense.expenseNumber,
        description: `${expense.expenseNumber} — ${expense.description ?? expense.vendorEmployee ?? "Expense"}`,
        source: "manual",
        companyId: expenseCompanyId,
        lines,
      },
      journal.code,
    );

    await db.update(expensesTable)
      .set({ status: "posted", entryId: entry.id, updatedAt: new Date() })
      .where(eq(expensesTable.id, id));
    const expSubType = (expense.expenseType as string | null) ?? null;
    const { recordTransactionTax } = await import("../lib/taxAutoService.js");
    void recordTransactionTax({
      companyId: expenseCompanyId,
      transactionType: "expense",
      transactionId: expense.id,
      transactionRef: expense.expenseNumber,
      baseAmount: subtotalN,
      taxAmount: taxAmountN > 0 ? taxAmountN : undefined,
      subType: expSubType,
    });
  } else if (action === "pay") {
    const expenseCompanyId = expense.companyId ?? 1;
    const settings = await ensureAccountingSettings(expenseCompanyId);
    const totalN = Number(expense.total);

    // Step 5 Fix F: support pembayaran tunai (kas) vs transfer (bank) via request body paymentMethod
    const payMethodReq = (req.body?.paymentMethod as string | undefined) ?? "bank";
    const isCashPay = payMethodReq === "cash" || payMethodReq === "tunai" || payMethodReq === "qris";

    const effectivePayableAccountId = expense.payableAccountId ?? settings.apAccountId;
    const effectiveCashBankAccountId = isCashPay
      ? (settings.defaultCashAccountId ?? settings.defaultBankAccountId)
      : settings.defaultBankAccountId;

    if (!effectivePayableAccountId) {
      return res.status(400).json({ message: "Akun hutang belum dikonfigurasi." });
    }
    if (!effectiveCashBankAccountId) {
      return res.status(400).json({ message: "Akun kas/bank default belum dikonfigurasi." });
    }

    const journalType = isCashPay ? "cash" : "bank";
    const [payJournal] = await db
      .select()
      .from(accountingJournalsTable)
      .where(eq(accountingJournalsTable.type, journalType))
      .limit(1);
    const fallbackJournal = payJournal ? null : await db
      .select()
      .from(accountingJournalsTable)
      .where(eq(accountingJournalsTable.type, "bank"))
      .limit(1)
      .then((rows) => rows[0]);
    const journal = payJournal ?? fallbackJournal;
    if (!journal) return res.status(400).json({ message: "Jurnal kas/bank tidak ditemukan." });

    await postEntry(
      {
        journalId: journal.id,
        date: new Date(),
        ref: expense.expenseNumber,
        description: `Pembayaran ${expense.expenseNumber} — ${expense.vendorEmployee ?? expense.description ?? "Expense"}`,
        source: "manual",
        companyId: expenseCompanyId,
        lines: [
          { accountId: effectivePayableAccountId, debit: totalN, credit: 0, description: "Pelunasan Hutang Biaya" },
          { accountId: effectiveCashBankAccountId, debit: 0, credit: totalN, description: isCashPay ? "Kas" : "Bank" },
        ],
      },
      journal.code,
    );

    await db.update(expensesTable)
      .set({ status: "paid", updatedAt: new Date() })
      .where(eq(expensesTable.id, id));
  } else {
    const statusMap: Record<string, string> = {
      submit: "submitted",
      approve: "approved",
      reject: "rejected",
      reset: "draft",
    };
    const update: Record<string, unknown> = { status: statusMap[action]!, updatedAt: new Date() };
    if (action === "reject" && req.body?.reason) update.rejectionReason = String(req.body.reason);
    await db.update(expensesTable).set(update).where(eq(expensesTable.id, id));
  }

  const [updated] = await db.select().from(expensesTable).where(eq(expensesTable.id, id));
  return res.json(serializeExpense(updated!));
});

// ===================== Attachments =====================

router.post("/:id/attachments", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { objectPath, fileName, contentType } = req.body ?? {};
  if (!objectPath || !fileName) return res.status(400).json({ message: "objectPath and fileName required" });

  // Duplicate guard: reject if the same objectPath is already linked to this expense
  const [dup] = await db.select({ id: expenseAttachmentsTable.id })
    .from(expenseAttachmentsTable)
    .where(and(eq(expenseAttachmentsTable.expenseId, id), eq(expenseAttachmentsTable.objectPath, String(objectPath))))
    .limit(1);
  if (dup) return res.status(409).json({ message: "File ini sudah terlampir ke expense ini" });

  const [att] = await db.insert(expenseAttachmentsTable).values({
    expenseId: id,
    objectPath: String(objectPath),
    fileName: String(fileName),
    contentType: contentType ? String(contentType) : null,
  }).returning();
  const actor = getActor(req);
  logStorageEvent({
    action: "upload",
    entityType: "expense_attachment",
    entityId: att!.id,
    objectPath: String(objectPath),
    fileName: String(fileName),
    contentType: contentType ? String(contentType) : null,
    actorId: actor.actorId,
    actorType: actor.actorType,
    ipAddress: getRequestIp(req),
    details: `expenseId=${id}`,
  });
  return res.status(201).json(att);
});

router.delete("/:id/attachments/:attId", async (req, res) => {
  const expenseId = Number(req.params.id);
  const attId = Number(req.params.attId);
  if (Number.isNaN(expenseId) || Number.isNaN(attId)) return res.status(400).json({ message: "Invalid id" });
  // Filter by BOTH id AND expenseId to prevent IDOR (deleting another expense's attachment)
  const [deleted] = await db
    .delete(expenseAttachmentsTable)
    .where(and(eq(expenseAttachmentsTable.id, attId), eq(expenseAttachmentsTable.expenseId, expenseId)))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Attachment tidak ditemukan" });
  // Delete the underlying GCS object (non-fatal — DB record already removed)
  if (deleted.objectPath) {
    _expenseObjectStorage.tryDeletePrivateEntity(deleted.objectPath).catch(() => {});
  }
  const actor = getActor(req);
  logStorageEvent({
    action: "delete",
    entityType: "expense_attachment",
    entityId: deleted.id,
    objectPath: deleted.objectPath,
    fileName: deleted.fileName,
    contentType: deleted.contentType ?? null,
    actorId: actor.actorId,
    actorType: actor.actorType,
    ipAddress: getRequestIp(req),
    details: `expenseId=${expenseId}`,
  });
  return res.json({ message: "Deleted" });
});

export default router;
