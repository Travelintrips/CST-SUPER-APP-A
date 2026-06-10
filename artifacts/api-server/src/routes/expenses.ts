import { Router, type Request } from "express";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { eq, desc, and, gte, lte, like, sql, count, getTableColumns, or, isNull } from "drizzle-orm";
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
} from "@workspace/db";
import { requireAdmin, requireClerkUser } from "../lib/requireAdmin.js";
import { postEntry } from "../lib/accounting.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { auditFromReq } from "../lib/auditLog.js";

const _expenseObjectStorage = new ObjectStorageService();
const router = Router();

// ── Boot migration ──
let _columnsEnsured = false;
async function ensureExpenseColumns() {
  if (_columnsEnsured) return;
  _columnsEnsured = true;
  try {
    await db.execute(sql.raw(`
      ALTER TABLE expense_categories ADD COLUMN IF NOT EXISTS category_type TEXT NOT NULL DEFAULT 'both';
      ALTER TABLE expenses ADD COLUMN IF NOT EXISTS transaction_type TEXT NOT NULL DEFAULT 'expense';
    `));
  } catch {}
}

// ── Middleware Authentication ──
router.use(async (req, res, next) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureExpenseColumns();
  next();
});

// ── GET /api/expenses/payment-accounts ──
// Mengembalikan HANYA akun Kas (1-101x) & Bank (1-102x) dari COA untuk dropdown Sumber Dana.
router.get("/payment-accounts", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db
    .select({
      id: chartOfAccountsTable.id,
      code: chartOfAccountsTable.code,
      name: chartOfAccountsTable.name,
      companyId: chartOfAccountsTable.companyId,
      isActive: chartOfAccountsTable.isActive,
    })
    .from(chartOfAccountsTable)
    .where(
      and(
        or(
          like(chartOfAccountsTable.code, "1-101%"),
          like(chartOfAccountsTable.code, "1-102%"),
        ),
        or(
          eq(chartOfAccountsTable.companyId, companyId),
          isNull(chartOfAccountsTable.companyId),
        ),
      ),
    )
    .orderBy(chartOfAccountsTable.code);

  const result = rows.map((r) => ({
    id: r.id,
    code: r.code,
    name: r.name,
    account_class: r.code.startsWith("1-101") ? "kas" : "bank",
  }));

  return res.json(result);
});

// ── Helpers ──
function serializeCategory(c: any) {
  return {
    id: c.id,
    name: c.name,
    code: c.code,
    expenseAccountId: c.expense_account_id ?? c.expenseAccountId ?? null,
    payableAccountId: c.payable_account_id ?? c.payableAccountId ?? null,
    defaultTaxId: c.default_tax_id ?? c.defaultTaxId ?? null,
    defaultAmount: c.default_amount ?? c.defaultAmount ?? null,
    defaultCoaId: c.default_coa_id ?? c.defaultCoaId ?? null,
    requiresAttachment: c.requires_attachment ?? c.requiresAttachment ?? false,
    isActive: c.is_active ?? c.isActive ?? true,
    categoryType: c.category_type ?? c.categoryType ?? "both",
    createdAt: c.created_at ?? c.createdAt ?? null,
  };
}

function serializeExpense(e: any) {
  return {
    id: Number(e.id),
    companyId: e.company_id ?? e.companyId ?? null,
    expenseNumber: e.expense_number ?? e.expenseNumber,
    date: e.date,
    vendorEmployee: e.vendor_employee ?? e.vendorEmployee ?? null,
    expenseType: e.expense_type ?? e.expenseType ?? "vendor_bill",
    transactionType: e.transaction_type ?? e.transactionType ?? "expense",
    salesDocId: e.sales_doc_id ?? e.salesDocId ?? null,
    shipmentId: e.shipment_id ?? e.shipmentId ?? null,
    categoryId: e.category_id ?? e.categoryId ?? null,
    description: e.description ?? null,
    qty: Number(e.qty ?? 1),
    unit: e.unit ?? null,
    unitPrice: Number(e.unit_price ?? e.unitPrice ?? 0),
    subtotal: Number(e.subtotal ?? 0),
    taxRateId: e.tax_rate_id ?? e.taxRateId ?? null,
    taxAmount: Number(e.tax_amount ?? e.taxAmount ?? 0),
    total: Number(e.total ?? 0),
    currency: e.currency ?? "IDR",
    status: e.status ?? "draft",
    notes: e.notes ?? null,
    entryId: e.entry_id ?? e.entryId ?? null,
    expenseAccountId: e.expense_account_id ?? e.expenseAccountId ?? null,
    payableAccountId: e.payable_account_id ?? e.payableAccountId ?? null,
    sourceAccountId: e.source_account_id ?? e.sourceAccountId ?? null,
    vendorId: e.vendor_id ?? e.vendorId ?? null,
    userId: e.user_id ?? e.userId ?? null,
    rejectionReason: e.rejection_reason ?? e.rejectionReason ?? null,
    createdById: e.created_by_id ?? e.createdById ?? null,
    createdAt: e.created_at ?? e.createdAt,
    updatedAt: e.updated_at ?? e.updatedAt,
  };
}

async function nextExpenseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ count: cnt }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(expensesTable)
    .where(like(expensesTable.expenseNumber, `EXP/${year}/%`));
  const seq = (Number(cnt) + 1).toString().padStart(5, "0");
  return `EXP/${year}/${seq}`;
}

// ── Expense Categories CRUD ──
router.get("/categories", async (req, res) => {
  const { type } = req.query as Record<string, string>;
  const rows = await db.execute(sql.raw(
    `SELECT * FROM expense_categories ORDER BY name`
  ));
  let cats = rows.rows.map(serializeCategory);
  if (type === "income") {
    cats = cats.filter((c) => c.categoryType === "income" || c.categoryType === "both");
  } else if (type === "expense") {
    cats = cats.filter((c) => c.categoryType === "expense" || c.categoryType === "both");
  }
  return res.json(cats);
});

router.post("/categories", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, code, expenseAccountId, payableAccountId, defaultTaxId, defaultAmount, defaultCoaId, requiresAttachment, isActive, categoryType } = req.body ?? {};
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
    } as any)
    .returning();

  if (categoryType && ["expense", "income", "both"].includes(categoryType)) {
    await db.execute(sql.raw(`UPDATE expense_categories SET category_type = '${categoryType}' WHERE id = ${(created as any).id}`));
  }

  const row = (await db.execute(sql.raw(`SELECT * FROM expense_categories WHERE id = ${(created as any).id}`))).rows[0];
  return res.status(201).json(serializeCategory(row));
});

// Seed preset kategori rutin (idempotent by code)
const PRESET_ROUTINE_CATEGORIES = [
  { code: "ENTERTAINMENT", name: "Entertainment" },
  { code: "MAKAN_MINUM", name: "Makan & Minum" },
  { code: "SEWA_KANTOR", name: "Sewa Kantor" },
  { code: "UTILITAS", name: "Utilitas" },
  { code: "PERALATAN", name: "Peralatan & ATK" },
  { code: "LAIN_LAIN", name: "Lain-lain" },
];

router.post("/seed-categories", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const existing = await db.execute(sql.raw(`SELECT code FROM expense_categories`));
  const existingCodes = new Set(
    (existing.rows as any[]).map((r) => String(r.code ?? "").toUpperCase()),
  );

  const toCreate = PRESET_ROUTINE_CATEGORIES.filter(
    (c) => !existingCodes.has(c.code),
  );

  let seeded = 0;
  for (const cat of toCreate) {
    const [created] = await db
      .insert(expenseCategoriesTable)
      .values({
        name: cat.name,
        code: cat.code,
        isActive: true,
      } as any)
      .returning();
    await db.execute(
      sql.raw(
        `UPDATE expense_categories SET category_type = 'expense' WHERE id = ${(created as any).id}`,
      ),
    );
    seeded += 1;
  }

  return res.json({ seeded, total: PRESET_ROUTINE_CATEGORIES.length });
});

router.patch("/categories/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const { name, code, expenseAccountId, payableAccountId, defaultTaxId, defaultAmount, defaultCoaId, requiresAttachment, isActive, categoryType } = req.body ?? {};
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

  if (Object.keys(update).length > 0) {
    const [updated] = await db.update(expenseCategoriesTable).set(update as any).where(eq(expenseCategoriesTable.id, id)).returning();
    if (!updated) return res.status(404).json({ message: "Not found" });
  }

  if (categoryType && ["expense", "income", "both"].includes(categoryType)) {
    await db.execute(sql.raw(`UPDATE expense_categories SET category_type = '${categoryType}' WHERE id = ${id}`));
  }

  const row = (await db.execute(sql.raw(`SELECT * FROM expense_categories WHERE id = ${id}`))).rows[0];
  if (!row) return res.status(404).json({ message: "Not found" });
  return res.json(serializeCategory(row));
});

router.delete("/categories/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  await db.delete(expenseCategoriesTable).where(eq(expenseCategoriesTable.id, id));
  return res.json({ message: "Deleted" });
});

// ── Expenses CRUD ──
router.get("/", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const { status, categoryId, expenseType, transactionType, salesDocId, shipmentId, search, from, to } = req.query as Record<string, string>;

  const whereParts: string[] = [`e.company_id = ${companyId}`];
  if (status) whereParts.push(`e.status = '${status.replace(/'/g, "''")}'`);
  if (categoryId) whereParts.push(`e.category_id = ${Number(categoryId)}`);
  if (expenseType) whereParts.push(`e.expense_type = '${expenseType.replace(/'/g, "''")}'`);
  if (transactionType) whereParts.push(`e.transaction_type = '${transactionType.replace(/'/g, "''")}'`);
  if (salesDocId) whereParts.push(`e.sales_doc_id = ${Number(salesDocId)}`);
  if (shipmentId) whereParts.push(`e.shipment_id = ${Number(shipmentId)}`);
  if (from) whereParts.push(`e.date >= '${from}'`);
  if (to) whereParts.push(`e.date <= '${to}'`);

  const result = await db.execute(sql.raw(`
    SELECT e.*,
      ec.name   AS category_name,
      coa.name  AS source_account_name,
      coa.code  AS source_account_code,
      sup.name  AS vendor_name,
      u.name    AS user_name,
      u.email   AS user_email
    FROM expenses e
    LEFT JOIN expense_categories ec  ON e.category_id      = ec.id
    LEFT JOIN chart_of_accounts coa  ON e.source_account_id = coa.id
    LEFT JOIN suppliers sup          ON e.vendor_id         = sup.id
    LEFT JOIN users u                ON e.user_id           = u.id
    WHERE ${whereParts.join(" AND ")}
    ORDER BY e.date DESC, e.id DESC
    LIMIT 500
  `));

  let rows = result.rows as any[];

  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter(
      (r) =>
        (r.expense_number ?? "").toLowerCase().includes(q) ||
        (r.vendor_employee ?? "").toLowerCase().includes(q) ||
        (r.vendor_name ?? "").toLowerCase().includes(q) ||
        (r.user_name ?? "").toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
    );
  }

  return res.json(rows.map((r) => ({
    ...serializeExpense(r),
    categoryName: r.category_name ?? null,
    sourceAccountName: r.source_account_name ?? null,
    vendor: r.vendor_id ? { id: Number(r.vendor_id), name: r.vendor_name } : null,
    user: r.user_id ? { id: r.user_id, name: r.user_name, email: r.user_email } : null,
    sourceAccount: r.source_account_id ? { id: Number(r.source_account_id), name: r.source_account_name, code: r.source_account_code } : null,
    category: r.category_id ? { id: Number(r.category_id), name: r.category_name } : null,
  })));
});

router.post("/", async (req, res) => {
  const { date, categoryId, description, qty, unitPrice, taxRateId, expenseAccountId, sourceAccountId, vendorId, userId, expenseType, transactionType, unit, currency, notes, payableAccountId, salesDocId, shipmentId, vendorEmployee } = req.body ?? {};
  if (!date) return res.status(400).json({ message: "date required" });
  if (!categoryId) return res.status(400).json({ message: "Kategori wajib dipilih." });

  const qtyN = Number(qty ?? 1);
  const upN = Number(unitPrice ?? 0);
  const subtotal = Math.round(qtyN * upN * 100) / 100;

  let taxAmountN = 0;
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
  }
  const total = subtotal + taxAmountN;

  const companyIdForInsert = resolveCompanyId(req as Request);
  const expenseNumber = await nextExpenseNumber();
  const txType = (transactionType === "income" ? "income" : "expense");

  const [created] = await db
    .insert(expensesTable)
    .values({
      companyId: companyIdForInsert,
      expenseNumber,
      date: String(date),
      categoryId: Number(categoryId),
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
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      vendorId: vendorId ? Number(vendorId) : null,
      userId: userId ? String(userId) : null,
      vendorEmployee: vendorEmployee ? String(vendorEmployee) : null,
      expenseType: expenseType ? String(expenseType) : "vendor_bill",
      salesDocId: salesDocId ? Number(salesDocId) : null,
      shipmentId: shipmentId ? Number(shipmentId) : null,
      status: "draft",
      createdById: (req as { userId?: string }).userId ?? null,
    } as any)
    .returning();

  if (txType !== "expense") {
    await db.execute(sql.raw(`UPDATE expenses SET transaction_type = '${txType}' WHERE id = ${(created as any).id}`));
  }

  if (taxAmountN > 0) {
    import("../lib/taxAutoService.js").then(({ recordTransactionTax }) => {
      void recordTransactionTax({
        companyId: companyIdForInsert ?? 1,
        transactionType: "expense",
        transactionId: (created as any).id,
        transactionRef: (created as any).expenseNumber,
        baseAmount: subtotal,
        taxAmount: taxAmountN,
      });
    }).catch(() => {/* ignore */});
  }

  auditFromReq(req as Request, {
    action: "create",
    module: "expense",
    referenceId: String((created as any).id),
    newData: { expenseNumber: (created as any).expenseNumber, total: String(total), status: "draft", transactionType: txType },
  });

  return res.status(201).json(serializeExpense({ ...(created as any), transaction_type: txType }));
});

router.patch("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const [existing] = await db.execute(sql.raw(`SELECT * FROM expenses WHERE id = ${id}`)).then((r) => r.rows);
  if (!existing) return res.status(404).json({ message: "Not found" });
  const exp = existing as any;
  if (exp.status !== "draft" && exp.status !== "rejected") {
    return res.status(400).json({ message: "Hanya expense berstatus draft atau rejected yang bisa diedit." });
  }

  const {
    date, categoryId, description, qty, unitPrice, taxRateId,
    expenseAccountId, payableAccountId, sourceAccountId,
    vendorId, userId, vendorEmployee, expenseType, transactionType,
    unit, currency, notes, salesDocId, shipmentId,
  } = req.body ?? {};

  const qtyN = qty !== undefined ? Number(qty) : Number(exp.qty ?? 1);
  const upN = unitPrice !== undefined ? Number(unitPrice) : Number(exp.unit_price ?? 0);
  const subtotal = Math.round(qtyN * upN * 100) / 100;

  const taxId = taxRateId !== undefined ? (taxRateId ? Number(taxRateId) : null) : (exp.tax_rate_id ? Number(exp.tax_rate_id) : null);
  let taxAmountN = 0;
  if (taxId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, taxId));
    if (tax) taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
  }
  const total = subtotal + taxAmountN;

  const sets: string[] = [
    `date = '${(date ?? exp.date).toString().replace(/'/g, "''")}'`,
    `qty = ${qtyN}`,
    `unit_price = ${upN}`,
    `subtotal = ${subtotal}`,
    `tax_amount = ${taxAmountN}`,
    `total = ${total}`,
    `updated_at = NOW()`,
  ];
  if (categoryId !== undefined) sets.push(`category_id = ${categoryId ? Number(categoryId) : "NULL"}`);
  if (description !== undefined) sets.push(`description = ${description ? `'${String(description).replace(/'/g, "''")}'` : "NULL"}`);
  if (taxId !== null) sets.push(`tax_rate_id = ${taxId}`);
  else if (taxRateId !== undefined) sets.push(`tax_rate_id = NULL`);
  if (expenseAccountId !== undefined) sets.push(`expense_account_id = ${expenseAccountId ? Number(expenseAccountId) : "NULL"}`);
  if (payableAccountId !== undefined) sets.push(`payable_account_id = ${payableAccountId ? Number(payableAccountId) : "NULL"}`);
  if (sourceAccountId !== undefined) sets.push(`source_account_id = ${sourceAccountId ? Number(sourceAccountId) : "NULL"}`);
  if (vendorId !== undefined) sets.push(`vendor_id = ${vendorId ? Number(vendorId) : "NULL"}`);
  if (userId !== undefined) sets.push(`user_id = ${userId ? `'${String(userId).replace(/'/g, "''")}'` : "NULL"}`);
  if (vendorEmployee !== undefined) sets.push(`vendor_employee = ${vendorEmployee ? `'${String(vendorEmployee).replace(/'/g, "''")}'` : "NULL"}`);
  if (expenseType !== undefined) sets.push(`expense_type = '${String(expenseType).replace(/'/g, "''")}'`);
  if (transactionType !== undefined && ["expense", "income"].includes(transactionType)) sets.push(`transaction_type = '${transactionType}'`);
  if (unit !== undefined) sets.push(`unit = ${unit ? `'${String(unit).replace(/'/g, "''")}'` : "NULL"}`);
  if (currency !== undefined) sets.push(`currency = '${String(currency).replace(/'/g, "''")}'`);
  if (notes !== undefined) sets.push(`notes = ${notes ? `'${String(notes).replace(/'/g, "''")}'` : "NULL"}`);
  if (salesDocId !== undefined) sets.push(`sales_doc_id = ${salesDocId ? Number(salesDocId) : "NULL"}`);
  if (shipmentId !== undefined) sets.push(`shipment_id = ${shipmentId ? Number(shipmentId) : "NULL"}`);

  await db.execute(sql.raw(`UPDATE expenses SET ${sets.join(", ")} WHERE id = ${id}`));

  const row = (await db.execute(sql.raw(`SELECT * FROM expenses WHERE id = ${id}`))).rows[0];

  auditFromReq(req as Request, {
    action: "update",
    module: "expense",
    referenceId: String(id),
    newData: { total: String(total), status: (row as any)?.status },
  });

  return res.json(serializeExpense(row));
});

// ─── Missing journals: list ────────────────────────────────────────────────
router.get("/missing-journals", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db.execute(sql.raw(`
    SELECT e.id, e.expense_number, e.date, e.description, e.total, e.transaction_type, e.status,
           ec.name AS category_name
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.status = 'active' AND e.entry_id IS NULL
      ${companyId ? `AND e.company_id = ${companyId}` : ""}
    ORDER BY e.date DESC, e.id DESC
    LIMIT 500
  `));
  return res.json({ count: rows.rows.length, items: rows.rows });
});

// ─── Re-post jurnal: single expense ────────────────────────────────────────
router.post("/:id/repost-journal", async (req: Request, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  try {
    const entry = await postQuickExpenseJournal(id);
    return res.json({ success: true, entryId: entry.id });
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message });
  }
});

// ─── Re-post jurnal: bulk (semua yang missing) ─────────────────────────────
router.post("/bulk-repost", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db.execute(sql.raw(`
    SELECT id FROM expenses
    WHERE status = 'active' AND entry_id IS NULL
      ${companyId ? `AND company_id = ${companyId}` : ""}
    ORDER BY date, id
    LIMIT 500
  `));
  const ids = (rows.rows as any[]).map((r) => Number(r.id));
  const results: { id: number; success: boolean; entryId?: number; error?: string }[] = [];
  for (const id of ids) {
    try {
      const entry = await postQuickExpenseJournal(id);
      results.push({ id, success: true, entryId: entry.id });
    } catch (e: any) {
      results.push({ id, success: false, error: e.message });
    }
  }
  const succeeded = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  return res.json({ total: ids.length, succeeded, failed, results });
});

// ─── Helper: post journal untuk expense / penerimaan lain ────────────────────
export async function postQuickExpenseJournal(expId: number) {
  const result = await db.execute(sql.raw(`
    SELECT e.*, ec.expense_account_id AS cat_expense_account_id
    FROM expenses e
    LEFT JOIN expense_categories ec ON ec.id = e.category_id
    WHERE e.id = ${expId}
  `));
  const e = result.rows[0] as any;
  if (!e) throw new Error("Expense tidak ditemukan");

  const companyId: number | null = Number(e.company_id) || null;
  const settings = await ensureAccountingSettings(companyId);
  const txType: string = e.transaction_type ?? "expense";
  const amountN = Number(e.total ?? 0);
  // Pisahkan PPN Masukan agar masuk ke akun COA tersendiri (bukan digabung ke akun beban)
  const taxAmountN = Math.round(Number(e.tax_amount ?? 0) * 100) / 100;
  const netAmountN = Math.round((amountN - taxAmountN) * 100) / 100;
  const ppnInputAcctId: number | null =
    taxAmountN > 0 ? (Number(e.ppn_input_account_id) || settings.ppnInputAccountId || null) : null;

  // Resolve akun beban/pendapatan — dari expense itu sendiri, fallback ke kategori
  const expenseAccountId: number | null =
    Number(e.expense_account_id) || Number(e.cat_expense_account_id) || null;
  if (!expenseAccountId)
    throw new Error(
      "Akun beban/pendapatan belum diset. Harap pilih akun COA di form expense atau kategori."
    );

  // Resolve akun sumber (kas/bank/hutang)
  //   expense → credit ke sourceAccountId atau payableAccountId (hutang usaha)
  //   income  → debit ke sourceAccountId (kas/bank penerimaan)
  const sourceAccountId: number | null =
    Number(e.source_account_id) || null;
  const payableAccountId: number | null =
    Number(e.payable_account_id) || null;
  const counterAccountId: number | null =
    sourceAccountId ??
    payableAccountId ??
    settings.defaultBankAccountId ??
    settings.defaultCashAccountId ??
    null;

  if (!counterAccountId)
    throw new Error(
      "Akun kas/bank/hutang belum diset. Harap pilih akun sumber di form expense."
    );

  // Cari jurnal umum (general) sebagai wadah; fallback ke jurnal apapun
  let journal = (
    await db
      .select()
      .from(accountingJournalsTable)
      .where(eq(accountingJournalsTable.type, "general" as any))
      .limit(1)
  )[0];
  if (!journal)
    journal = (await db.select().from(accountingJournalsTable).limit(1))[0];
  if (!journal) throw new Error("Jurnal tidak ditemukan di database.");

  const label = e.description ?? e.expense_number;
  const counterLabel = sourceAccountId
    ? "Kas/Bank"
    : payableAccountId
    ? "Hutang Usaha"
    : "Kas/Bank";

  const lines =
    txType === "income"
      ? [
          // Penerimaan lain: Debit Kas/Bank → Credit Pendapatan
          { accountId: counterAccountId, debit: amountN, credit: 0, description: `Penerimaan — ${label}` },
          { accountId: expenseAccountId, debit: 0, credit: amountN, description: label },
        ]
      : ppnInputAcctId && taxAmountN > 0
        ? [
            // Expense kena PPN: Debit Beban (DPP) + Debit PPN Masukan → Credit Kas/Bank/Hutang (total)
            { accountId: expenseAccountId, debit: netAmountN, credit: 0, description: label },
            { accountId: ppnInputAcctId, debit: taxAmountN, credit: 0, description: `PPN Masukan — ${label}` },
            { accountId: counterAccountId, debit: 0, credit: amountN, description: counterLabel },
          ]
        : [
            // Expense tanpa PPN: Debit Beban → Credit Kas/Bank atau Hutang
            { accountId: expenseAccountId, debit: amountN, credit: 0, description: label },
            { accountId: counterAccountId, debit: 0, credit: amountN, description: counterLabel },
          ];

  const entry = await postEntry(
    {
      journalId: journal.id,
      date: new Date(String(e.date)),
      ref: e.expense_number,
      description: `${e.expense_number} — ${label}`,
      source: "manual",
      companyId,
      lines,
    },
    journal.code
  );

  await db.execute(
    sql.raw(
      `UPDATE expenses SET entry_id = ${entry.id}, status = 'active', updated_at = NOW() WHERE id = ${expId}`
    )
  );
  return entry;
}

// ── Export router ──
export default router;
