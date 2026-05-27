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
  if (taxRateId) {
    const [tax] = await db.select().from(accountingTaxesTable).where(eq(accountingTaxesTable.id, Number(taxRateId)));
    if (tax) taxAmountN = Math.round(subtotal * Number(tax.rate) / 100 * 100) / 100;
  }
  const total = Math.round((subtotal + taxAmountN) * 100) / 100;

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
        companyId: expenseCompanyId,
        lines,
      },
      journal.code,
    );

    await db.update(expensesTable)
      .set({ status: "posted", entryId: entry.id, updatedAt: new Date() })
      .where(eq(expensesTable.id, id));
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
