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

  const conditions: ReturnType<typeof eq>[] = [eq(expensesTable.companyId, companyId)];
  if (status) conditions.push(eq(expensesTable.status, status));
  if (categoryId) conditions.push(eq(expensesTable.categoryId, Number(categoryId)));
  if (expenseType) conditions.push(eq(expensesTable.expenseType, expenseType));
  if (salesDocId) conditions.push(eq(expensesTable.salesDocId, Number(salesDocId)));
  if (shipmentId) conditions.push(eq(expensesTable.shipmentId, Number(shipmentId)));
  if (from) conditions.push(gte(expensesTable.date, from));
  if (to) conditions.push(lte(expensesTable.date, to));

  let rows = await db
    .select({ ...getTableColumns(expensesTable) })
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
        (r.description ?? "").toLowerCase().includes(q)
    );
  }

  return res.json(rows.map((r) => serializeExpense(r as typeof expensesTable.$inferSelect)));
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

  return res.status(201).json(serializeExpense(created!));
});

// ── Export router ──
export default router;