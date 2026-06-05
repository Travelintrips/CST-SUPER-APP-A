import { Router, type Request } from "express";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { eq, desc, and, gte, lte, like, sql, count, getTableColumns } from "drizzle-orm";
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

// ── Middleware Authentication ──
router.use(async (req, res, next) => {
  if (!(await requireClerkUser(req, res))) return;
  next();
});

// ── Helpers ──
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

async function nextExpenseNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(expensesTable)
    .where(like(expensesTable.expenseNumber, `EXP/${year}/%`));
  const seq = (Number(count) + 1).toString().padStart(5, "0");
  return `EXP/${year}/${seq}`;
}

// ── Expense Categories CRUD ──
router.get("/categories", async (_req, res) => {
  const rows = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
  return res.json(rows.map(serializeCategory));
});

router.post("/categories", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
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
  if (!(await requireAdmin(req, res))) return;
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

  const [updated] = await db.update(expenseCategoriesTable).set(update).where(eq(expenseCategoriesTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeCategory(updated));
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
  const { status, categoryId, expenseType, salesDocId, shipmentId, search, from, to } = req.query as Record<string, string>;

  const whereParts: string[] = [`e.company_id = ${companyId}`];
  if (status) whereParts.push(`e.status = '${status.replace(/'/g, "''")}'`);
  if (categoryId) whereParts.push(`e.category_id = ${Number(categoryId)}`);
  if (expenseType) whereParts.push(`e.expense_type = '${expenseType.replace(/'/g, "''")}'`);
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
    id: Number(r.id),
    companyId: r.company_id,
    expenseNumber: r.expense_number,
    date: r.date,
    vendorEmployee: r.vendor_employee,
    expenseType: r.expense_type,
    salesDocId: r.sales_doc_id,
    shipmentId: r.shipment_id,
    categoryId: r.category_id,
    categoryName: r.category_name ?? null,
    description: r.description,
    qty: Number(r.qty),
    unit: r.unit,
    unitPrice: Number(r.unit_price),
    subtotal: Number(r.subtotal),
    taxRateId: r.tax_rate_id,
    taxAmount: Number(r.tax_amount),
    total: Number(r.total),
    currency: r.currency,
    status: r.status,
    notes: r.notes,
    entryId: r.entry_id,
    expenseAccountId: r.expense_account_id,
    payableAccountId: r.payable_account_id,
    sourceAccountId: r.source_account_id,
    sourceAccountName: r.source_account_name ?? null,
    vendorId: r.vendor_id,
    userId: r.user_id,
    rejectionReason: r.rejection_reason,
    createdById: r.created_by_id,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    vendor: r.vendor_id ? { id: r.vendor_id, name: r.vendor_name } : null,
    user: r.user_id ? { id: r.user_id, name: r.user_name, email: r.user_email } : null,
    sourceAccount: r.source_account_id ? { id: r.source_account_id, name: r.source_account_name, code: r.source_account_code } : null,
    category: r.category_id ? { id: r.category_id, name: r.category_name } : null,
  })));
});

router.post("/", async (req, res) => {
  const { date, categoryId, description, qty, unitPrice, taxRateId, expenseAccountId, sourceAccountId, vendorId, userId } = req.body ?? {};
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

  const [created] = await db
    .insert(expensesTable)
    .values({
      companyId: companyIdForInsert,
      expenseNumber,
      date: String(date),
      categoryId: Number(categoryId),
      description: description ? String(description) : null,
      qty: String(qtyN),
      unitPrice: String(upN),
      subtotal: String(subtotal),
      taxRateId: taxRateId ? Number(taxRateId) : null,
      taxAmount: String(taxAmountN),
      total: String(total),
      expenseAccountId: expenseAccountId ? Number(expenseAccountId) : null,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : null,
      vendorId: vendorId ? Number(vendorId) : null,
      userId: userId ? String(userId) : null,
      status: "draft",
      createdById: (req as { userId?: string }).userId ?? null,
    })
    .returning();

  auditFromReq(req as Request, {
    action: "create",
    module: "expense",
    referenceId: String(created!.id),
    newData: { expenseNumber: created!.expenseNumber, total: String(total), status: "draft" },
  });

  return res.status(201).json(serializeExpense(created!));
});

// ── Export router ──
export default router;