import { Router } from "express";
import { eq, desc, and, gte, lte, like, or, sql } from "drizzle-orm";
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

const router = Router();
router.use(requireAdmin);

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

router.get("/categories", async (_req, res) => {
  const rows = await db
    .select()
    .from(expenseCategoriesTable)
    .orderBy(expenseCategoriesTable.name);
  return res.json(rows.map(serializeCategory));
});

router.post("/categories", async (req, res) => {
  const { name, code, expenseAccountId, payableAccountId, requiresAttachment, isActive } = req.body ?? {};
  if (!name || !code) return res.status(400).json({ message: "name and code are required" });
  const [created] = await db
    .insert(expenseCategoriesTable)
    .values({
      name: String(name),
      code: String(code).toUpperCase(),
      expenseAccountId: expenseAccountId ? Number(expenseAccountId) : null,
      payableAccountId: payableAccountId ? Number(payableAccountId) : null,
      requiresAttachment: Boolean(requiresAttachment),
      isActive: isActive !== false,
    })
    .returning();
  return res.status(201).json(serializeCategory(created!));
});

router.patch("/categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { name, code, expenseAccountId, payableAccountId, requiresAttachment, isActive } = req.body ?? {};
  const update: Record<string, unknown> = {};
  if (name !== undefined) update.name = String(name);
  if (code !== undefined) update.code = String(code).toUpperCase();
  if (expenseAccountId !== undefined) update.expenseAccountId = expenseAccountId ? Number(expenseAccountId) : null;
  if (payableAccountId !== undefined) update.payableAccountId = payableAccountId ? Number(payableAccountId) : null;
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

  const CATEGORIES = [
    { name: "Biaya Trucking", code: "TRUCKING" },
    { name: "Biaya Handling", code: "HANDLING" },
    { name: "Biaya Storage", code: "STORAGE" },
    { name: "Biaya Pabean", code: "CUSTOMS" },
    { name: "Biaya Dokumen", code: "DOCUMENT" },
    { name: "Biaya Freight", code: "FREIGHT" },
    { name: "Biaya Container", code: "CONTAINER" },
    { name: "Biaya Operasional", code: "OPERATIONAL" },
    { name: "Reimbursement Karyawan", code: "REIMBURSEMENT", requiresAttachment: true },
    { name: "Biaya Vendor/Subcon", code: "VENDOR" },
  ];

  for (const cat of CATEGORIES) {
    await db
      .insert(expenseCategoriesTable)
      .values({
        name: cat.name,
        code: cat.code,
        expenseAccountId: opex?.id ?? null,
        payableAccountId: ap?.id ?? settings.apAccountId ?? null,
        requiresAttachment: cat.requiresAttachment ?? false,
        isActive: true,
      })
      .onConflictDoNothing({ target: expenseCategoriesTable.code });
  }

  const rows = await db.select().from(expenseCategoriesTable).orderBy(expenseCategoriesTable.name);
  return res.json({ seeded: rows.length, categories: rows.map(serializeCategory) });
});

// ===================== Expenses CRUD =====================

router.get("/", async (req, res) => {
  const conditions: ReturnType<typeof eq>[] = [];
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
    .where(conditions.length ? and(...conditions) : undefined)
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

  const qtyN = Number(qty ?? 1);
  const upN = Number(unitPrice ?? 0);
  const subtotal = Math.round(qtyN * upN * 100) / 100;

  let taxAmountN = 0;
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
  }
  const total = Math.round((subtotal + taxAmountN) * 100) / 100;

  const expenseNumber = await nextExpenseNumber();

  const [created] = await db
    .insert(expensesTable)
    .values({
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
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
  }
  const total = Math.round((subtotal + taxAmountN) * 100) / 100;

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
  await db.delete(expenseAttachmentsTable).where(eq(expenseAttachmentsTable.expenseId, id));
  await db.delete(expensesTable).where(eq(expensesTable.id, id));
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

  if (action === "post") {
    const settings = await ensureAccountingSettings();

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

    const lines = [];
    lines.push({ accountId: resolvedExpenseAccountId, debit: subtotalN, credit: 0, description: expense.description ?? expense.expenseNumber });
    if (taxAmountN > 0 && settings.ppnInputAccountId) {
      lines.push({ accountId: settings.ppnInputAccountId, debit: taxAmountN, credit: 0, description: "PPN Masukan" });
    }
    lines.push({ accountId: resolvedPayableAccountId, debit: 0, credit: totalN, description: expense.vendorEmployee ?? expense.expenseNumber });

    const [journal] = await db.select().from(accountingJournalsTable).where(eq(accountingJournalsTable.type, "purchase")).limit(1);
    if (!journal) return res.status(400).json({ message: "Jurnal pembelian tidak ditemukan." });

    const entry = await postEntry(
      {
        journalId: journal.id,
        date: new Date(expense.date),
        ref: expense.expenseNumber,
        description: `${expense.expenseNumber} — ${expense.description ?? expense.vendorEmployee ?? "Expense"}`,
        source: "manual",
        lines,
      },
      journal.code,
    );

    await db.update(expensesTable)
      .set({ status: "posted", entryId: entry.id, updatedAt: new Date() })
      .where(eq(expensesTable.id, id));
  } else {
    const statusMap: Record<string, string> = {
      submit: "submitted",
      approve: "approved",
      reject: "rejected",
      pay: "paid",
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
  const [att] = await db.insert(expenseAttachmentsTable).values({
    expenseId: id,
    objectPath: String(objectPath),
    fileName: String(fileName),
    contentType: contentType ? String(contentType) : null,
  }).returning();
  return res.status(201).json(att);
});

router.delete("/:id/attachments/:attId", async (req, res) => {
  const attId = Number(req.params.attId);
  if (Number.isNaN(attId)) return res.status(400).json({ message: "Invalid id" });
  await db.delete(expenseAttachmentsTable).where(eq(expenseAttachmentsTable.id, attId));
  return res.json({ message: "Deleted" });
});

export default router;
