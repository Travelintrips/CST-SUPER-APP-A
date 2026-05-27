import { Router, type Request } from "express";
import {
  db,
  chartOfAccountsTable,
  accountingJournalsTable,
  accountingTaxesTable,
  accountingEntriesTable,
  accountingEntryLinesTable,
  accountingSettingsTable,
  accountingPaymentsTable,
  salesDocumentsTable,
  purchaseDocumentsTable,
  companiesTable,
} from "@workspace/db";
import {
  eq,
  ne,
  desc,
  and,
  or,
  isNull,
  gte,
  lte,
  sql,
  inArray,
  ilike,
  type SQL,
} from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { resolveCompanyId, resolveCompanyScope } from "../lib/resolveCompany.js";
import {
  ensureAccountingSettings,
  seedAccountingDefaults,
} from "../lib/accountingSeed.js";
import { logger } from "../lib/logger.js";
import { postEntry, type PostingLine } from "../lib/accounting.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";

function serializeCompany(c: typeof companiesTable.$inferSelect) {
  return { ...c, createdAt: c.createdAt.toISOString() };
}

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


function parseDateRange(req: {
  query: Record<string, unknown>;
}):
  | { from: Date | null; to: Date | null; error: null }
  | { from: null; to: null; error: string } {
  const fromStr =
    typeof req.query["from"] === "string"
      ? (req.query["from"] as string)
      : null;
  const toStr =
    typeof req.query["to"] === "string" ? (req.query["to"] as string) : null;
  let from: Date | null = null;
  let to: Date | null = null;
  if (fromStr) {
    from = new Date(fromStr);
    if (Number.isNaN(from.getTime()))
      return { from: null, to: null, error: "Invalid 'from' date" };
  }
  if (toStr) {
    to = new Date(toStr);
    if (Number.isNaN(to.getTime()))
      return { from: null, to: null, error: "Invalid 'to' date" };
  }
  return { from, to, error: null };
}

// ============ Companies ============
router.get("/companies", async (_req, res) => {
  const rows = await db
    .select()
    .from(companiesTable)
    .orderBy(companiesTable.companyName);
  return res.json(rows.map(serializeCompany));
});

router.post("/companies", async (req, res) => {
  const {
    name,
    code,
    isHolding,
    parentCompanyId,
    address,
    npwp,
    logoUrl,
    isActive,
  } = req.body ?? {};
  if (!name || !code)
    return res.status(400).json({ message: "name and code required" });
  try {
    const [created] = await db
      .insert(companiesTable)
      .values({
        companyName: name,
        companyCode: code,
        isHolding: isHolding ?? false,
        parentCompanyId: parentCompanyId ?? null,
        address,
        npwp,
        logoUrl,
        isActive: isActive ?? true,
      })
      .returning();
    // Seed default CoA for the new company (fire-and-forget)
    seedAccountingDefaults(created!.id).catch((e) =>
      logger.warn({ err: e }, "Company CoA seed failed"),
    );
    return res.status(201).json(serializeCompany(created!));
  } catch {
    return res.status(409).json({ message: "Company code already exists" });
  }
});

router.patch("/companies/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const patch: Record<string, unknown> = {};
  for (const k of [
    "name",
    "code",
    "isHolding",
    "parentCompanyId",
    "address",
    "npwp",
    "logoUrl",
    "isActive",
  ]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  await db.update(companiesTable).set(patch).where(eq(companiesTable.id, id));
  const [updated] = await db
    .select()
    .from(companiesTable)
    .where(eq(companiesTable.id, id));
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeCompany(updated));
});

router.delete("/companies/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  await db.delete(companiesTable).where(eq(companiesTable.id, id));
  return res.json({ message: "Deleted", id });
});

// ============ Chart of Accounts ============
router.get("/accounts/check-code", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const code = String(req.query.code ?? "").trim();
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
  if (!code) return res.json({ taken: false });
  const conditions: SQL[] = [
    or(isNull(chartOfAccountsTable.companyId), eq(chartOfAccountsTable.companyId, companyId))!,
    eq(chartOfAccountsTable.code, code),
  ];
  if (excludeId && !Number.isNaN(excludeId)) conditions.push(ne(chartOfAccountsTable.id, excludeId));
  const rows = await db
    .select({ id: chartOfAccountsTable.id })
    .from(chartOfAccountsTable)
    .where(and(...conditions))
    .limit(1);
  return res.json({ taken: rows.length > 0 });
});

router.get("/accounts", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db
    .select()
    .from(chartOfAccountsTable)
    .where(
      or(
        isNull(chartOfAccountsTable.companyId),
        eq(chartOfAccountsTable.companyId, companyId),
      ),
    )
    .orderBy(chartOfAccountsTable.code);
  return res.json(rows.map(serializeAccount));
});

router.post("/accounts", async (req, res) => {
  const { code, name, type, parentId, isActive } = req.body ?? {};
  const companyId = resolveCompanyId(req);
  if (!code || !name || !type)
    return res.status(400).json({ message: "code, name, type required" });
  const validTypes = ["asset", "liability", "equity", "revenue", "expense"];
  if (!validTypes.includes(type))
    return res.status(400).json({ message: "Invalid type" });
  try {
    const [created] = await db
      .insert(chartOfAccountsTable)
      .values({
        companyId,
        code,
        name,
        type,
        parentId: parentId ?? null,
        isActive: isActive ?? true,
      })
      .returning();
    return res.status(201).json(serializeAccount(created!));
  } catch (err: unknown) {
    return res
      .status(409)
      .json({
        message: "Account code already exists for this company",
        error: String((err as Error)?.message ?? err),
      });
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
  await db
    .update(chartOfAccountsTable)
    .set(patch)
    .where(eq(chartOfAccountsTable.id, id));
  const [updated] = await db
    .select()
    .from(chartOfAccountsTable)
    .where(eq(chartOfAccountsTable.id, id));
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
    return res
      .status(409)
      .json({
        message:
          "Akun sudah dipakai di jurnal, tidak bisa dihapus. Set non-aktif saja.",
      });
  }
  await db.delete(chartOfAccountsTable).where(eq(chartOfAccountsTable.id, id));
  return res.json({ message: "Deleted", id });
});

// ============ Journals ============
router.get("/journals", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.companyId, companyId))
    .orderBy(accountingJournalsTable.code);
  return res.json(rows.map(serializeJournal));
});

router.post("/journals", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const {
    code,
    name,
    type,
    defaultDebitAccountId,
    defaultCreditAccountId,
    isActive,
  } = req.body ?? {};
  if (!code || !name || !type)
    return res.status(400).json({ message: "code, name, type required" });
  const validTypes = ["sales", "purchase", "bank", "cash", "general"];
  if (!validTypes.includes(type))
    return res.status(400).json({ message: "Invalid type" });
  try {
    const [created] = await db
      .insert(accountingJournalsTable)
      .values({
        code,
        name,
        type,
        companyId,
        defaultDebitAccountId: defaultDebitAccountId ?? null,
        defaultCreditAccountId: defaultCreditAccountId ?? null,
        isActive: isActive ?? true,
      })
      .returning();
    return res.status(201).json(serializeJournal(created!));
  } catch (err) {
    return res
      .status(409)
      .json({
        message: "Journal code already exists for this company",
        error: String((err as Error)?.message ?? err),
      });
  }
});

router.patch("/journals/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const patch: Record<string, unknown> = {};
  for (const k of [
    "code",
    "name",
    "type",
    "defaultDebitAccountId",
    "defaultCreditAccountId",
    "isActive",
  ]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  await db
    .update(accountingJournalsTable)
    .set(patch)
    .where(eq(accountingJournalsTable.id, id));
  const [updated] = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.id, id));
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeJournal(updated));
});

// ============ Taxes ============
router.get("/taxes", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const rows = await db
    .select()
    .from(accountingTaxesTable)
    .where(eq(accountingTaxesTable.companyId, companyId))
    .orderBy(accountingTaxesTable.id);
  return res.json(rows.map(serializeTax));
});

router.post("/taxes", async (req, res) => {
  const { name, rate, kind, accountId, isActive } = req.body ?? {};
  const companyId = resolveCompanyId(req);
  if (!name || rate === undefined || !kind || !accountId)
    return res
      .status(400)
      .json({ message: "name, rate, kind, accountId required" });
  if (!["sale", "purchase", "withholding"].includes(kind))
    return res
      .status(400)
      .json({ message: "kind must be 'sale', 'purchase', or 'withholding'" });
  const [created] = await db
    .insert(accountingTaxesTable)
    .values({
      companyId,
      name,
      rate: String(rate),
      kind,
      accountId: Number(accountId),
      isActive: isActive ?? true,
    })
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
  if (req.body?.accountId !== undefined)
    patch["accountId"] = Number(req.body.accountId);
  if (req.body?.isActive !== undefined) patch["isActive"] = req.body.isActive;
  await db
    .update(accountingTaxesTable)
    .set(patch)
    .where(eq(accountingTaxesTable.id, id));
  const [updated] = await db
    .select()
    .from(accountingTaxesTable)
    .where(eq(accountingTaxesTable.id, id));
  if (!updated) return res.status(404).json({ message: "Not found" });
  return res.json(serializeTax(updated));
});

// ============ Journal Entries ============
router.get("/entries", async (req, res) => {
  const scope = resolveCompanyScope(req);
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const conds: SQL<unknown>[] = [];
  if (scope !== "all") {
    conds.push(eq(accountingEntriesTable.companyId, scope));
  }
  if (range.from)
    conds.push(
      gte(accountingEntriesTable.date, range.from.toISOString().split("T")[0]!),
    );
  if (range.to)
    conds.push(
      lte(accountingEntriesTable.date, range.to.toISOString().split("T")[0]!),
    );
  const journalId = req.query["journalId"]
    ? Number(req.query["journalId"])
    : null;
  if (journalId && !Number.isNaN(journalId))
    conds.push(eq(accountingEntriesTable.journalId, journalId));
  const rows = await db
    .select()
    .from(accountingEntriesTable)
    .where(and(...conds))
    .orderBy(desc(accountingEntriesTable.date), desc(accountingEntriesTable.id))
    .limit(500);
  return res.json(rows.map(serializeEntry));
});

router.get("/entries/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [entry] = await db
    .select()
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.id, id));
  if (!entry) return res.status(404).json({ message: "Not found" });
  const lines = await db
    .select()
    .from(accountingEntryLinesTable)
    .where(eq(accountingEntryLinesTable.entryId, id));
  return res.json({
    ...serializeEntry(entry),
    lines: lines.map(serializeEntryLine),
  });
});

router.post("/entries", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { journalId, date: dateStr, ref, description, lines } = req.body ?? {};
  if (!journalId || !dateStr || !Array.isArray(lines))
    return res
      .status(400)
      .json({ message: "journalId, date, lines[] required" });
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime()))
    return res.status(400).json({ message: "Invalid date" });
  const [journal] = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.id, Number(journalId)));
  if (!journal) return res.status(404).json({ message: "Journal not found" });

  const postingLines: PostingLine[] = lines.map(
    (l: {
      accountId: number;
      debit?: number;
      credit?: number;
      description?: string;
    }) => ({
      accountId: Number(l.accountId),
      debit: Number(l.debit ?? 0),
      credit: Number(l.credit ?? 0),
      description: l.description ?? null,
    }),
  );
  try {
    const entry = await postEntry(
      {
        journalId: journal.id,
        date,
        ref: ref ?? null,
        description: description ?? null,
        source: "manual",
        lines: postingLines,
        companyId,
      },
      journal.code,
    );
    const fullLines = await db
      .select()
      .from(accountingEntryLinesTable)
      .where(eq(accountingEntryLinesTable.entryId, entry.id));
    return res
      .status(201)
      .json({
        ...serializeEntry(entry),
        lines: fullLines.map(serializeEntryLine),
      });
  } catch (err) {
    return res
      .status(400)
      .json({ message: String((err as Error)?.message ?? err) });
  }
});

// GET /accounting/entry-lines — list journal line items with joined entry info
router.get("/entry-lines", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const conds: SQL<unknown>[] = [
    eq(accountingEntriesTable.companyId, companyId),
  ];
  if (range.from)
    conds.push(
      gte(accountingEntriesTable.date, range.from.toISOString().split("T")[0]!),
    );
  if (range.to)
    conds.push(
      lte(accountingEntriesTable.date, range.to.toISOString().split("T")[0]!),
    );
  const journalId = req.query["journalId"]
    ? Number(req.query["journalId"])
    : null;
  if (journalId && !Number.isNaN(journalId))
    conds.push(eq(accountingEntriesTable.journalId, journalId));
  const accountId = req.query["accountId"]
    ? Number(req.query["accountId"])
    : null;
  if (accountId && !Number.isNaN(accountId))
    conds.push(eq(accountingEntryLinesTable.accountId, accountId));
  const entryId = req.query["entryId"] ? Number(req.query["entryId"]) : null;
  if (entryId && !Number.isNaN(entryId))
    conds.push(eq(accountingEntryLinesTable.entryId, entryId));

  const rows = await db
    .select({
      id: accountingEntryLinesTable.id,
      entryId: accountingEntryLinesTable.entryId,
      accountId: accountingEntryLinesTable.accountId,
      description: accountingEntryLinesTable.description,
      debit: accountingEntryLinesTable.debit,
      credit: accountingEntryLinesTable.credit,
      entryNumber: accountingEntriesTable.entryNumber,
      entryDate: accountingEntriesTable.date,
      entrySource: accountingEntriesTable.source,
      journalId: accountingEntriesTable.journalId,
      ref: accountingEntriesTable.ref,
    })
    .from(accountingEntryLinesTable)
    .innerJoin(
      accountingEntriesTable,
      eq(accountingEntryLinesTable.entryId, accountingEntriesTable.id),
    )
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(
      desc(accountingEntriesTable.date),
      desc(accountingEntriesTable.id),
      accountingEntryLinesTable.id,
    )
    .limit(1000);

  return res.json(
    rows.map((r) => ({
      ...r,
      debit: Number(r.debit),
      credit: Number(r.credit),
    })),
  );
});

// ============ Payments & Receipts ============
function serializePayment(p: typeof accountingPaymentsTable.$inferSelect) {
  return {
    ...p,
    amount: Number(p.amount),
    createdAt: p.createdAt.toISOString(),
    voidReason: p.voidReason ?? null,
  };
}

router.get("/payments", async (req, res) => {
  const scope = resolveCompanyScope(req);
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const conds: SQL<unknown>[] = [];
  if (scope !== "all") {
    conds.push(eq(accountingPaymentsTable.companyId, scope));
  }
  if (range.from)
    conds.push(
      gte(
        accountingPaymentsTable.date,
        range.from.toISOString().split("T")[0]!,
      ),
    );
  if (range.to)
    conds.push(
      lte(accountingPaymentsTable.date, range.to.toISOString().split("T")[0]!),
    );
  const typeFilter =
    typeof req.query["paymentType"] === "string"
      ? req.query["paymentType"]
      : null;
  if (typeFilter === "inbound" || typeFilter === "outbound") {
    conds.push(eq(accountingPaymentsTable.paymentType, typeFilter));
  }
  const sourceTypeFilter =
    typeof req.query["sourceType"] === "string"
      ? req.query["sourceType"]
      : null;
  const sourceDocIdFilter = req.query["sourceDocId"]
    ? Number(req.query["sourceDocId"])
    : null;
  const refDocNumberFilter =
    typeof req.query["refDocNumber"] === "string" && req.query["refDocNumber"].trim()
      ? req.query["refDocNumber"].trim()
      : null;
  if (sourceTypeFilter) {
    conds.push(eq(accountingPaymentsTable.sourceType, sourceTypeFilter));
  }
  if (sourceDocIdFilter && !Number.isNaN(sourceDocIdFilter)) {
    conds.push(eq(accountingPaymentsTable.sourceDocId, sourceDocIdFilter));
  }
  if (refDocNumberFilter) {
    conds.push(ilike(accountingPaymentsTable.ref, `%${refDocNumberFilter}%`));
  }
  const rows = await db
    .select()
    .from(accountingPaymentsTable)
    .where(and(...conds))
    .orderBy(
      desc(accountingPaymentsTable.date),
      desc(accountingPaymentsTable.id),
    )
    .limit(500);
  return res.json(rows.map(serializePayment));
});

router.get("/payments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [payment] = await db
    .select()
    .from(accountingPaymentsTable)
    .where(eq(accountingPaymentsTable.id, id));
  if (!payment) return res.status(404).json({ message: "Not found" });
  let entry = null;
  if (payment.entryId) {
    const [e] = await db
      .select()
      .from(accountingEntriesTable)
      .where(eq(accountingEntriesTable.id, payment.entryId));
    if (e) {
      const lines = await db
        .select()
        .from(accountingEntryLinesTable)
        .where(eq(accountingEntryLinesTable.entryId, e.id));
      entry = { ...serializeEntry(e), lines: lines.map(serializeEntryLine) };
    }
  }
  return res.json({ ...serializePayment(payment), entry });
});

router.post("/payments", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const {
    paymentType,
    amount,
    journalId,
    partnerName,
    date: dateStr,
    ref,
    memo,
    sourceType,
    sourceDocId,
  } = req.body ?? {};
  if (!paymentType || !amount || !journalId || !dateStr)
    return res
      .status(400)
      .json({ message: "paymentType, amount, journalId, date required" });
  if (paymentType !== "inbound" && paymentType !== "outbound")
    return res
      .status(400)
      .json({ message: "paymentType must be 'inbound' or 'outbound'" });
  const amt = Number(amount);
  if (Number.isNaN(amt) || amt <= 0)
    return res
      .status(400)
      .json({ message: "amount must be a positive number" });
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime()))
    return res.status(400).json({ message: "Invalid date" });

  const [journal] = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.id, Number(journalId)));
  if (!journal) return res.status(404).json({ message: "Journal not found" });
  if (journal.type !== "bank" && journal.type !== "cash")
    return res
      .status(400)
      .json({ message: "Journal must be of type bank or cash" });

  const settings = await ensureAccountingSettings(companyId);

  // Determine bank/cash account: prefer journal's default accounts, fall back to settings
  const bankCashAccountId =
    journal.defaultDebitAccountId ??
    (journal.type === "cash"
      ? settings.defaultCashAccountId
      : settings.defaultBankAccountId) ??
    settings.defaultBankAccountId;

  if (!bankCashAccountId)
    return res
      .status(400)
      .json({
        message:
          "No bank/cash account configured. Set a default in accounting settings or journal defaults.",
      });

  let lines: PostingLine[];
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const partner = partnerName ? String(partnerName) : "Mitra";

  if (paymentType === "inbound") {
    if (!settings.arAccountId)
      return res
        .status(400)
        .json({ message: "AR account not configured in accounting settings." });
    lines = [
      {
        accountId: bankCashAccountId,
        debit: round2(amt),
        credit: 0,
        description: `Penerimaan dari ${partner}${ref ? ` (${ref})` : ""}`,
      },
      {
        accountId: settings.arAccountId,
        debit: 0,
        credit: round2(amt),
        description: `Pelunasan piutang ${partner}${ref ? ` - ${ref}` : ""}`,
      },
    ];
  } else {
    if (!settings.apAccountId)
      return res
        .status(400)
        .json({ message: "AP account not configured in accounting settings." });
    lines = [
      {
        accountId: settings.apAccountId,
        debit: round2(amt),
        credit: 0,
        description: `Pelunasan hutang ${partner}${ref ? ` - ${ref}` : ""}`,
      },
      {
        accountId: bankCashAccountId,
        debit: 0,
        credit: round2(amt),
        description: `Pembayaran ke ${partner}${ref ? ` (${ref})` : ""}`,
      },
    ];
  }

  try {
    const entry = await postEntry(
      {
        journalId: journal.id,
        date,
        ref: ref ?? null,
        description:
          memo ??
          `Pembayaran ${paymentType === "inbound" ? "masuk" : "keluar"} - ${partner}`,
        source: "manual_payment",
        companyId,
        lines,
      },
      journal.code,
    );

    const parsedSourceDocId = sourceDocId ? Number(sourceDocId) : null;
    const validSourceType =
      sourceType === "sales_order" || sourceType === "purchase_order"
        ? sourceType
        : null;

    // Auto-numbering: PAY/YYYY/NNNN
    const payYear = new Date().getFullYear();
    const [{ payCount }] = await db
      .select({ payCount: sql<number>`cast(count(*) as int)` })
      .from(accountingPaymentsTable);
    const paySeq = (Number(payCount) + 1).toString().padStart(4, "0");
    const paymentNumber = `PAY/${payYear}/${paySeq}`;

    const [payment] = await db
      .insert(accountingPaymentsTable)
      .values({
        companyId,
        paymentNumber,
        paymentType,
        amount: String(round2(amt)),
        journalId: journal.id,
        partnerName: partnerName ?? null,
        date: date.toISOString().split("T")[0]!,
        ref: ref ?? null,
        memo: memo ?? null,
        entryId: entry.id,
        sourceType: validSourceType,
        sourceDocId:
          parsedSourceDocId && !Number.isNaN(parsedSourceDocId)
            ? parsedSourceDocId
            : null,
        createdById: null,
      })
      .returning();

    // Update payment settlement on the linked document (unpaid → partial → paid)
    if (
      validSourceType &&
      parsedSourceDocId &&
      !Number.isNaN(parsedSourceDocId)
    ) {
      // Sum all non-voided payments (including the one just created) for this document
      const allLinked = await db
        .select({
          amount: accountingPaymentsTable.amount,
          status: accountingPaymentsTable.status,
        })
        .from(accountingPaymentsTable)
        .where(
          and(
            eq(accountingPaymentsTable.sourceType, validSourceType),
            eq(accountingPaymentsTable.sourceDocId, parsedSourceDocId),
          ),
        );
      const totalPaid = allLinked
        .filter((r) => r.status !== "voided")
        .reduce((s, r) => s + Number(r.amount), 0);

      if (validSourceType === "sales_order") {
        const [doc] = await db
          .select({ grandTotal: salesDocumentsTable.grandTotal, docNumber: salesDocumentsTable.docNumber })
          .from(salesDocumentsTable)
          .where(eq(salesDocumentsTable.id, parsedSourceDocId));
        const grandTotal = Number(doc?.grandTotal ?? 0);
        const newStatus =
          totalPaid >= grandTotal && grandTotal > 0
            ? "paid"
            : totalPaid > 0
              ? "partial"
              : "unpaid";
        await db
          .update(salesDocumentsTable)
          .set({
            paymentStatus: newStatus,
            amountPaid: String(round2(totalPaid)),
            updatedAt: new Date(),
          })
          .where(eq(salesDocumentsTable.id, parsedSourceDocId));

        // WA notification to admin — fire-and-forget
        const fmtIdr = (n: number) =>
          `Rp ${Math.round(n).toLocaleString("id-ID")}`;
        const statusLabel =
          newStatus === "paid"
            ? "✅ *LUNAS*"
            : `⏳ Sebagian (sisa ${fmtIdr(Math.max(0, grandTotal - totalPaid))})`;
        const waMsg = [
          `💰 *Pembayaran Masuk Dicatat*`,
          ``,
          `No: ${payment!.paymentNumber}`,
          `SO: ${doc?.docNumber ?? `#${parsedSourceDocId}`}`,
          `Customer: ${partner}`,
          `Jumlah: ${fmtIdr(amt)}`,
          ref ? `Ref: ${ref}` : null,
          `Tanggal: ${String(dateStr)}`,
          `Status: ${statusLabel}`,
        ]
          .filter((l) => l !== null)
          .join("\n");
        getAdminWa()
          .then((adminWa) => {
            if (adminWa)
              sendWhatsApp(adminWa, waMsg, {
                context: "payment_recorded",
                refType: "sales_order",
                refId: doc?.docNumber ?? String(parsedSourceDocId),
              }).catch((e: unknown) =>
                logger.error({ e }, "WA admin payment notif failed"),
              );
          })
          .catch((e: unknown) =>
            logger.error({ e }, "getAdminWa payment notif failed"),
          );
      } else if (validSourceType === "purchase_order") {
        const [doc] = await db
          .select({ grandTotal: purchaseDocumentsTable.grandTotal, docNumber: purchaseDocumentsTable.docNumber })
          .from(purchaseDocumentsTable)
          .where(eq(purchaseDocumentsTable.id, parsedSourceDocId));
        const grandTotal = Number(doc?.grandTotal ?? 0);
        const newStatus =
          totalPaid >= grandTotal && grandTotal > 0
            ? "paid"
            : totalPaid > 0
              ? "partial"
              : "unpaid";
        await db
          .update(purchaseDocumentsTable)
          .set({
            paymentStatus: newStatus,
            amountPaid: String(round2(totalPaid)),
            updatedAt: new Date(),
          })
          .where(eq(purchaseDocumentsTable.id, parsedSourceDocId));

        // WA notification to admin — fire-and-forget
        const fmtIdr = (n: number) =>
          `Rp ${Math.round(n).toLocaleString("id-ID")}`;
        const statusLabel =
          newStatus === "paid"
            ? "✅ *LUNAS*"
            : `⏳ Sebagian (sisa ${fmtIdr(Math.max(0, grandTotal - totalPaid))})`;
        const waMsg = [
          `🏦 *Pembayaran Keluar Dicatat*`,
          ``,
          `No: ${payment!.paymentNumber}`,
          `PO: ${doc?.docNumber ?? `#${parsedSourceDocId}`}`,
          `Vendor: ${partner}`,
          `Jumlah: ${fmtIdr(amt)}`,
          ref ? `Ref: ${ref}` : null,
          `Tanggal: ${String(dateStr)}`,
          `Status: ${statusLabel}`,
        ]
          .filter((l) => l !== null)
          .join("\n");
        getAdminWa()
          .then((adminWa) => {
            if (adminWa)
              sendWhatsApp(adminWa, waMsg, {
                context: "payment_recorded",
                refType: "purchase_order",
                refId: doc?.docNumber ?? String(parsedSourceDocId),
              }).catch((e: unknown) =>
                logger.error({ e }, "WA admin purchase payment notif failed"),
              );
          })
          .catch((e: unknown) =>
            logger.error({ e }, "getAdminWa purchase payment notif failed"),
          );
      }
    }

    const entryLines = await db
      .select()
      .from(accountingEntryLinesTable)
      .where(eq(accountingEntryLinesTable.entryId, entry.id));
    return res.status(201).json({
      ...serializePayment(payment!),
      entry: {
        ...serializeEntry(entry),
        lines: entryLines.map(serializeEntryLine),
      },
    });
  } catch (err) {
    return res
      .status(400)
      .json({ message: String((err as Error)?.message ?? err) });
  }
});

// ============ Partner Balances ============
router.get("/partner-balances", async (_req, res) => {
  // Document-level query: each open invoice/bill is a separate entry.
  // Uses grandTotal - amountPaid so settled docs naturally disappear
  // (amountPaid is kept void-safe by the payment void handler).
  const THRESHOLD = 0.005;

  // Filter: invoiced/billed status ensures the AR/AP journal entry has been posted
  // (mark_invoiced posts the sales_invoice entry; mark_billed posts the purchase_bill entry).
  // paymentStatus != 'paid' excludes fully settled documents.
  // amountPaid is void-safe (void handler recalculates it excluding voided payments).
  const [arDocs, apDocs] = await Promise.all([
    db
      .select({
        id: salesDocumentsTable.id,
        docNumber: salesDocumentsTable.docNumber,
        partnerName: salesDocumentsTable.customerName,
        grandTotal: salesDocumentsTable.grandTotal,
        amountPaid: salesDocumentsTable.amountPaid,
        confirmedAt: salesDocumentsTable.confirmedAt,
        createdAt: salesDocumentsTable.createdAt,
      })
      .from(salesDocumentsTable)
      .where(
        and(
          eq(salesDocumentsTable.kind, "order"),
          eq(salesDocumentsTable.invoiceStatus, "invoiced"),
          ne(salesDocumentsTable.paymentStatus, "paid"),
        ),
      ),
    db
      .select({
        id: purchaseDocumentsTable.id,
        docNumber: purchaseDocumentsTable.docNumber,
        partnerName: purchaseDocumentsTable.supplierName,
        grandTotal: purchaseDocumentsTable.grandTotal,
        amountPaid: purchaseDocumentsTable.amountPaid,
        confirmedAt: purchaseDocumentsTable.confirmedAt,
        createdAt: purchaseDocumentsTable.createdAt,
      })
      .from(purchaseDocumentsTable)
      .where(
        and(
          eq(purchaseDocumentsTable.kind, "order"),
          eq(purchaseDocumentsTable.billStatus, "billed"),
          ne(purchaseDocumentsTable.paymentStatus, "paid"),
        ),
      ),
  ]);

  const ar = arDocs
    .map((d) => ({
      partnerName: d.partnerName,
      balance: Math.max(0, Number(d.grandTotal) - Number(d.amountPaid)),
      docNumber: d.docNumber,
      sourceType: "sales_order",
      sourceDocId: d.id,
      date: (d.confirmedAt ?? d.createdAt).toISOString(),
    }))
    .filter((e) => e.balance > THRESHOLD)
    .sort((a, b) => b.balance - a.balance);

  const ap = apDocs
    .map((d) => ({
      partnerName: d.partnerName,
      balance: Math.max(0, Number(d.grandTotal) - Number(d.amountPaid)),
      docNumber: d.docNumber,
      sourceType: "purchase_order",
      sourceDocId: d.id,
      date: (d.confirmedAt ?? d.createdAt).toISOString(),
    }))
    .filter((e) => e.balance > THRESHOLD)
    .sort((a, b) => b.balance - a.balance);

  const totalAr = Math.round(ar.reduce((s, r) => s + r.balance, 0) * 100) / 100;
  const totalAp = Math.round(ap.reduce((s, r) => s + r.balance, 0) * 100) / 100;

  return res.json({ ar, ap, totalAr, totalAp });
});

router.post("/payments/:id/void", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const reason: string | null =
    typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : null;

  const [payment] = await db
    .select()
    .from(accountingPaymentsTable)
    .where(eq(accountingPaymentsTable.id, id));
  if (!payment) return res.status(404).json({ message: "Not found" });
  if (payment.status === "voided")
    return res
      .status(400)
      .json({ message: "Pembayaran sudah dibatalkan sebelumnya." });

  if (!payment.entryId)
    return res
      .status(400)
      .json({
        message: "Tidak ada jurnal yang terkait dengan pembayaran ini.",
      });

  const [origEntry] = await db
    .select()
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.id, payment.entryId));
  if (!origEntry)
    return res.status(400).json({ message: "Jurnal asli tidak ditemukan." });

  const origLines = await db
    .select()
    .from(accountingEntryLinesTable)
    .where(eq(accountingEntryLinesTable.entryId, origEntry.id));

  const [journal] = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.id, payment.journalId));
  if (!journal)
    return res.status(400).json({ message: "Jurnal tidak ditemukan." });

  const reversalLines: PostingLine[] = origLines.map((l) => ({
    accountId: l.accountId,
    debit: Number(l.credit),
    credit: Number(l.debit),
    description: `[VOID] ${l.description ?? ""}`.trim(),
  }));

  const baseDescription = `[VOID] ${origEntry.description ?? `Pembayaran #${payment.id}`}`;
  const voidDescription = reason
    ? `${baseDescription} — Alasan: ${reason}`
    : baseDescription;

  try {
    const voidEntry = await postEntry(
      {
        journalId: payment.journalId,
        date: new Date(),
        ref: payment.ref ?? null,
        description: voidDescription,
        source: "manual",
        lines: reversalLines,
      },
      journal.code,
    );

    await db
      .update(accountingPaymentsTable)
      .set({ status: "voided", voidEntryId: voidEntry.id, voidReason: reason })
      .where(eq(accountingPaymentsTable.id, id));

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const validSourceType =
      payment.sourceType === "sales_order" ||
      payment.sourceType === "purchase_order"
        ? payment.sourceType
        : null;

    if (validSourceType && payment.sourceDocId) {
      const allLinked = await db
        .select({
          amount: accountingPaymentsTable.amount,
          status: accountingPaymentsTable.status,
        })
        .from(accountingPaymentsTable)
        .where(
          and(
            eq(accountingPaymentsTable.sourceType, validSourceType),
            eq(accountingPaymentsTable.sourceDocId, payment.sourceDocId),
          ),
        );
      const totalPaid = allLinked
        .filter((r) => r.status !== "voided")
        .reduce((s, r) => s + Number(r.amount), 0);

      if (validSourceType === "sales_order") {
        const [doc] = await db
          .select({ grandTotal: salesDocumentsTable.grandTotal })
          .from(salesDocumentsTable)
          .where(eq(salesDocumentsTable.id, payment.sourceDocId));
        const grandTotal = Number(doc?.grandTotal ?? 0);
        const newStatus =
          totalPaid >= grandTotal && grandTotal > 0
            ? "paid"
            : totalPaid > 0
              ? "partial"
              : "unpaid";
        await db
          .update(salesDocumentsTable)
          .set({
            paymentStatus: newStatus,
            amountPaid: String(round2(totalPaid)),
            updatedAt: new Date(),
          })
          .where(eq(salesDocumentsTable.id, payment.sourceDocId));
      } else if (validSourceType === "purchase_order") {
        const [doc] = await db
          .select({ grandTotal: purchaseDocumentsTable.grandTotal })
          .from(purchaseDocumentsTable)
          .where(eq(purchaseDocumentsTable.id, payment.sourceDocId));
        const grandTotal = Number(doc?.grandTotal ?? 0);
        const newStatus =
          totalPaid >= grandTotal && grandTotal > 0
            ? "paid"
            : totalPaid > 0
              ? "partial"
              : "unpaid";
        await db
          .update(purchaseDocumentsTable)
          .set({
            paymentStatus: newStatus,
            amountPaid: String(round2(totalPaid)),
            updatedAt: new Date(),
          })
          .where(eq(purchaseDocumentsTable.id, payment.sourceDocId));
      }
    }

    const [updated] = await db
      .select()
      .from(accountingPaymentsTable)
      .where(eq(accountingPaymentsTable.id, id));
    const voidLines = await db
      .select()
      .from(accountingEntryLinesTable)
      .where(eq(accountingEntryLinesTable.entryId, voidEntry.id));
    return res.json({
      ...serializePayment(updated!),
      entry: {
        ...serializeEntry(voidEntry),
        lines: voidLines.map(serializeEntryLine),
      },
    });
  } catch (err) {
    return res
      .status(400)
      .json({ message: String((err as Error)?.message ?? err) });
  }
});

// ============ Journal Entry Locking (Reverse / Reset-Draft / Cancel) ============

/** POST /accounting/entries/:id/reverse — buat jurnal pembalik untuk entry yang sudah diposting */
router.post("/entries/:id/reverse", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const [entry] = await db
    .select()
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.id, id));
  if (!entry) return res.status(404).json({ message: "Entri tidak ditemukan" });
  if (entry.status !== "posted")
    return res
      .status(400)
      .json({ message: "Hanya entri berstatus 'posted' yang bisa dibalik" });
  if (entry.source === "reversal")
    return res
      .status(400)
      .json({ message: "Entri pembalik tidak bisa dibalik lagi" });

  const origLines = await db
    .select()
    .from(accountingEntryLinesTable)
    .where(eq(accountingEntryLinesTable.entryId, id));
  if (origLines.length === 0)
    return res
      .status(400)
      .json({ message: "Entri tidak memiliki baris jurnal" });

  const [journal] = await db
    .select()
    .from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.id, entry.journalId));
  if (!journal)
    return res.status(400).json({ message: "Jurnal tidak ditemukan" });

  const reversalLines: PostingLine[] = origLines.map((l) => ({
    accountId: l.accountId,
    debit: Number(l.credit),
    credit: Number(l.debit),
    description: `[PEMBALIK] ${l.description ?? ""}`.trim(),
  }));

  const reverseReason =
    typeof req.body?.reason === "string" && req.body.reason.trim()
      ? req.body.reason.trim()
      : null;
  const desc = reverseReason
    ? `[PEMBALIK] ${entry.description ?? `Entri #${entry.id}`} — ${reverseReason}`
    : `[PEMBALIK] ${entry.description ?? `Entri #${entry.id}`}`;

  try {
    const reversalEntry = await postEntry(
      {
        journalId: entry.journalId,
        date: new Date(),
        ref: entry.ref ?? null,
        description: desc,
        source: "reversal" as "manual",
        sourceId: entry.id,
        lines: reversalLines,
      },
      journal.code,
    );

    const fullLines = await db
      .select()
      .from(accountingEntryLinesTable)
      .where(eq(accountingEntryLinesTable.entryId, reversalEntry.id));
    return res
      .status(201)
      .json({
        ...serializeEntry(reversalEntry),
        lines: fullLines.map(serializeEntryLine),
      });
  } catch (err) {
    return res
      .status(400)
      .json({ message: String((err as Error)?.message ?? err) });
  }
});

/** PATCH /accounting/entries/:id/status — reset ke draft atau cancel (hanya manual entry) */
router.patch("/entries/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const { status } = req.body ?? {};
  if (status !== "draft" && status !== "cancelled") {
    return res
      .status(400)
      .json({ message: "status harus 'draft' atau 'cancelled'" });
  }

  const [entry] = await db
    .select()
    .from(accountingEntriesTable)
    .where(eq(accountingEntriesTable.id, id));
  if (!entry) return res.status(404).json({ message: "Entri tidak ditemukan" });

  // Hanya manual entry yang bisa di-reset (auto-posted entries dikunci)
  if (entry.source !== "manual") {
    return res
      .status(400)
      .json({
        message:
          "Hanya jurnal manual yang bisa di-reset. Jurnal otomatis harus dibalik menggunakan endpoint /reverse.",
      });
  }
  if ((entry.status as string) === "cancelled") {
    return res.status(400).json({ message: "Entri ini sudah dibatalkan" });
  }

  const [updated] = await db
    .update(accountingEntriesTable)
    .set({ status })
    .where(eq(accountingEntriesTable.id, id))
    .returning();

  const lines = await db
    .select()
    .from(accountingEntryLinesTable)
    .where(eq(accountingEntryLinesTable.entryId, id));
  return res.json({
    ...serializeEntry(updated!),
    lines: lines.map(serializeEntryLine),
  });
});

// ============ Settings ============
router.get("/settings", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const s = await ensureAccountingSettings(companyId);
  return res.json(serializeSettings(s));
});

router.patch("/settings", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const s = await ensureAccountingSettings(companyId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of [
    "arAccountId",
    "apAccountId",
    "salesIncomeAccountId",
    "purchaseExpenseAccountId",
    "defaultBankAccountId",
    "defaultCashAccountId",
    "ppnOutputAccountId",
    "ppnInputAccountId",
    "salesJournalId",
    "purchaseJournalId",
    "bankJournalId",
    "cashJournalId",
    "defaultSalesTaxId",
    "defaultPurchaseTaxId",
    "inventoryAccountId",
    "cogsAccountId",
  ]) {
    if (req.body?.[k] !== undefined)
      patch[k] = req.body[k] === null ? null : Number(req.body[k]);
  }
  for (const k of [
    "companyName",
    "companyAddress",
    "companyNpwp",
    "companyLogoUrl",
  ]) {
    if (req.body?.[k] !== undefined)
      patch[k] = req.body[k] === null ? null : String(req.body[k]);
  }
  await db
    .update(accountingSettingsTable)
    .set(patch)
    .where(eq(accountingSettingsTable.id, s.id));
  const [updated] = await db
    .select()
    .from(accountingSettingsTable)
    .where(eq(accountingSettingsTable.id, s.id));
  return res.json(serializeSettings(updated!));
});

// ============ Reports ============
async function buildLedgerWindow(
  from: Date | null,
  to: Date | null,
  companyScope: number | "all" = 1,
) {
  const conds: SQL<unknown>[] = [
    eq(accountingEntriesTable.status, "posted"),
  ];
  if (companyScope !== "all") {
    conds.push(eq(accountingEntriesTable.companyId, companyScope));
  }
  if (from)
    conds.push(
      gte(accountingEntriesTable.date, from.toISOString().split("T")[0]!),
    );
  if (to)
    conds.push(
      lte(accountingEntriesTable.date, to.toISOString().split("T")[0]!),
    );
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
  const scope = resolveCompanyScope(req);
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const accounts = await db
    .select()
    .from(chartOfAccountsTable)
    .orderBy(chartOfAccountsTable.code);
  const { lines } = await buildLedgerWindow(range.from, range.to, scope);
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
  const scope = resolveCompanyScope(req);
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const accountId = req.query["accountId"]
    ? Number(req.query["accountId"])
    : null;
  const accounts = await db
    .select()
    .from(chartOfAccountsTable)
    .orderBy(chartOfAccountsTable.code);
  const { entries, lines } = await buildLedgerWindow(
    range.from,
    range.to,
    scope,
  );
  const entryById = new Map(entries.map((e) => [e.id, e]));
  const filtered = accountId
    ? lines.filter((l) => l.accountId === accountId)
    : lines;
  const grouped = new Map<
    number,
    {
      account: (typeof accounts)[number];
      rows: Array<{
        date: string;
        entryNumber: string;
        ref: string | null;
        description: string | null;
        debit: number;
        credit: number;
        balance: number;
      }>;
      totalDebit: number;
      totalCredit: number;
    }
  >();
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
    grp.rows.sort((a, b) =>
      a.date === b.date
        ? a.entryNumber.localeCompare(b.entryNumber)
        : a.date.localeCompare(b.date),
    );
    const isDebitNormal =
      grp.account.type === "asset" || grp.account.type === "expense";
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
  const scope = resolveCompanyScope(req);
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const accounts = await db
    .select()
    .from(chartOfAccountsTable)
    .orderBy(chartOfAccountsTable.code);
  const { lines } = await buildLedgerWindow(range.from, range.to, scope);
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
    .map((a) => ({
      accountId: a.id,
      code: a.code,
      name: a.name,
      amount: Math.round((totals.get(a.id) ?? 0) * 100) / 100,
    }))
    .filter((r) => r.amount !== 0);
  const expenses = accounts
    .filter((a) => a.type === "expense")
    .map((a) => ({
      accountId: a.id,
      code: a.code,
      name: a.name,
      amount: Math.round(-(totals.get(a.id) ?? 0) * 100) / 100,
    }))
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
  const scope = resolveCompanyScope(req);
  // Balance sheet is "as of" date — use 'to' as cutoff, ignore 'from'
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const asOf = range.to;
  const accounts = await db
    .select()
    .from(chartOfAccountsTable)
    .orderBy(chartOfAccountsTable.code);
  const { lines } = await buildLedgerWindow(null, asOf, scope);
  const totals = new Map<number, number>();
  for (const l of lines) {
    const acc = accounts.find((a) => a.id === l.accountId);
    if (!acc) continue;
    const isDebitNormal = acc.type === "asset" || acc.type === "expense";
    const v = isDebitNormal
      ? Number(l.debit) - Number(l.credit)
      : Number(l.credit) - Number(l.debit);
    totals.set(l.accountId, (totals.get(l.accountId) ?? 0) + v);
  }
  const mapAccs = (type: string) =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({
        accountId: a.id,
        code: a.code,
        name: a.name,
        amount: Math.round((totals.get(a.id) ?? 0) * 100) / 100,
      }))
      .filter((r) => r.amount !== 0);
  const assets = mapAccs("asset");
  const liabilities = mapAccs("liability");
  const equity = mapAccs("equity");
  // Net income (revenue - expense) gets added to equity for current period
  const revenueTotal = accounts
    .filter((a) => a.type === "revenue")
    .reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
  const expenseTotal = accounts
    .filter((a) => a.type === "expense")
    .reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
  const netIncome = Math.round((revenueTotal - expenseTotal) * 100) / 100;
  const totalAssets =
    Math.round(assets.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const totalLiabilities =
    Math.round(liabilities.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const totalEquity =
    Math.round((equity.reduce((s, a) => s + a.amount, 0) + netIncome) * 100) /
    100;
  return res.json({
    asOf: asOf?.toISOString() ?? new Date().toISOString(),
    assets,
    liabilities,
    equity,
    netIncomeYTD: netIncome,
    totalAssets,
    totalLiabilities,
    totalEquity,
    totalLiabilitiesAndEquity:
      Math.round((totalLiabilities + totalEquity) * 100) / 100,
  });
});

// ============ Freight Profitability Report ============

/**
 * GET /accounting/reports/freight-profitability
 * Laporan profitabilitas per shipment VMF:
 * Revenue (SO.grand_total) vs Biaya Vendor (approved quote vendor_price) = Gross Margin
 */
router.get("/reports/freight-profitability", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;

  const fromStr = req.query.from as string | undefined;
  const toStr   = req.query.to   as string | undefined;
  const companyParam = req.query.company as string | undefined;

  const fromDate = fromStr ? new Date(fromStr) : null;
  const toDate   = toStr   ? new Date(toStr)   : null;

  // Build dynamic WHERE clauses
  const conditions: string[] = [
    "sd.logistic_order_id IS NOT NULL",
    "sd.status != 'cancelled'",
  ];
  if (fromDate && !isNaN(fromDate.getTime())) conditions.push(`sd.created_at >= '${fromDate.toISOString()}'`);
  if (toDate   && !isNaN(toDate.getTime()))   conditions.push(`sd.created_at <= '${toDate.toISOString()}'`);
  if (companyParam && companyParam !== "all" && !isNaN(Number(companyParam))) {
    conditions.push(`sd.company_id = ${Number(companyParam)}`);
  }

  const where = conditions.join(" AND ");

  const rows = await db.execute(sql.raw(`
    SELECT
      sd.id                                        AS so_id,
      sd.doc_number                                AS so_number,
      sd.status                                    AS so_status,
      sd.customer_name,
      sd.grand_total                               AS revenue,
      sd.created_at,
      lo.order_number,
      lo.origin,
      lo.destination,
      lo.shipment_type,
      lo.transport_mode,
      COALESCE(loq.vendor_price, 0)                AS vendor_cost,
      s.name                                       AS vendor_name
    FROM sales_documents sd
    JOIN logistic_orders lo ON lo.id = sd.logistic_order_id
    LEFT JOIN logistic_order_quotes loq ON loq.id = lo.approved_quote_id
    LEFT JOIN suppliers s ON s.id = loq.vendor_id
    WHERE ${where}
    ORDER BY sd.created_at DESC
    LIMIT 500
  `));

  type Row = {
    so_id: number; so_number: string; so_status: string;
    customer_name: string; revenue: string; created_at: string;
    order_number: string; origin: string; destination: string;
    shipment_type: string; transport_mode: string | null;
    vendor_cost: string; vendor_name: string | null;
  };

  const items = (rows.rows as Row[]).map((r) => {
    const revenue    = Math.round(Number(r.revenue    ?? 0) * 100) / 100;
    const vendorCost = Math.round(Number(r.vendor_cost ?? 0) * 100) / 100;
    const margin     = Math.round((revenue - vendorCost) * 100) / 100;
    const marginPct  = revenue > 0 ? Math.round((margin / revenue) * 10000) / 100 : 0;
    return {
      soId: Number(r.so_id),
      soNumber: r.so_number,
      soStatus: r.so_status,
      customerName: r.customer_name,
      orderNumber: r.order_number,
      origin: r.origin,
      destination: r.destination,
      shipmentType: r.shipment_type,
      transportMode: r.transport_mode ?? null,
      vendorName: r.vendor_name ?? null,
      revenue,
      vendorCost,
      margin,
      marginPct,
      createdAt: r.created_at,
    };
  });

  const totalRevenue    = Math.round(items.reduce((s, r) => s + r.revenue,    0) * 100) / 100;
  const totalVendorCost = Math.round(items.reduce((s, r) => s + r.vendorCost, 0) * 100) / 100;
  const totalMargin     = Math.round((totalRevenue - totalVendorCost) * 100) / 100;
  const totalMarginPct  = totalRevenue > 0 ? Math.round((totalMargin / totalRevenue) * 10000) / 100 : 0;

  return res.json({
    from: fromDate?.toISOString() ?? null,
    to:   toDate?.toISOString()   ?? null,
    summary: { totalRevenue, totalVendorCost, totalMargin, totalMarginPct, count: items.length },
    items,
  });
});

// ============ Holding / Consolidated View ============

/** GET /accounting/holding/groups — daftar holding group beserta member companies */
router.get("/holding/groups", async (_req, res) => {
  const groups = await db.execute(sql`
    SELECT
      hg.id,
      hg.holding_name,
      hg.holding_code,
      hg.description,
      hg.created_at,
      json_agg(
        json_build_object(
          'memberId', chm.id,
          'companyId', chm.company_id,
          'companyName', c.company_name,
          'companyCode', c.company_code,
          'ownershipPercentage', chm.ownership_percentage,
          'consolidationMethod', chm.consolidation_method
        ) ORDER BY c.company_code
      ) AS members
    FROM holding_groups hg
    LEFT JOIN company_holding_members chm ON chm.holding_group_id = hg.id
    LEFT JOIN companies c ON c.id = chm.company_id
    GROUP BY hg.id
    ORDER BY hg.holding_code
  `);
  return res.json(groups.rows);
});

/** GET /accounting/holding/summary?holdingId=&from=&to= — ringkasan konsolidasi */
router.get("/holding/summary", async (req, res) => {
  const holdingId = Number(req.query["holdingId"] ?? 1);
  const dateRange = parseDateRange(req);
  if (dateRange.error)
    return res.status(400).json({ message: dateRange.error });

  const members = await db.execute(sql`
    SELECT company_id FROM company_holding_members WHERE holding_group_id = ${holdingId}
  `);
  if (members.rows.length === 0)
    return res.json({
      revenue: 0,
      expense: 0,
      netPL: 0,
      cashBalance: 0,
      receivable: 0,
      payable: 0,
      companyIds: [],
    });

  const companyIds = (members.rows as { company_id: number }[]).map(
    (r) => r.company_id,
  );
  const companyIdsArr = sql`ARRAY[${sql.join(
    companyIds.map((id) => sql`${id}`),
    sql`, `,
  )}]`;

  const dateFilter =
    dateRange.from && dateRange.to
      ? sql`AND ae.entry_date BETWEEN ${dateRange.from.toISOString().slice(0, 10)} AND ${dateRange.to.toISOString().slice(0, 10)}`
      : dateRange.from
        ? sql`AND ae.entry_date >= ${dateRange.from.toISOString().slice(0, 10)}`
        : dateRange.to
          ? sql`AND ae.entry_date <= ${dateRange.to.toISOString().slice(0, 10)}`
          : sql``;

  const result = await db.execute(sql`
    SELECT
      COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS expense,
      COALESCE(SUM(
        CASE WHEN coa.type = 'asset'
          AND (lower(coa.name) LIKE '%kas%' OR lower(coa.name) LIKE '%cash%' OR lower(coa.name) LIKE '%bank%')
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END
      ), 0) AS cash_balance,
      COALESCE(SUM(
        CASE WHEN lower(coa.name) LIKE '%piutang%' AND coa.type = 'asset'
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END
      ), 0) AS receivable,
      COALESCE(SUM(
        CASE WHEN (lower(coa.name) LIKE '%utang%' OR lower(coa.name) LIKE '%payable%') AND coa.type = 'liability'
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END
      ), 0) AS payable
    FROM accounting_entry_lines ael
    JOIN chart_of_accounts coa ON coa.id = ael.account_id
    JOIN accounting_entries ae ON ae.id = ael.entry_id
    WHERE ae.status = 'posted'
      AND ael.company_id = ANY(${companyIdsArr})
      ${dateFilter}
  `);

  const row = result.rows[0] as
    | {
        revenue: string;
        expense: string;
        cash_balance: string;
        receivable: string;
        payable: string;
      }
    | undefined;
  const revenue = Number(row?.revenue ?? 0);
  const expense = Number(row?.expense ?? 0);
  return res.json({
    revenue,
    expense,
    netPL: revenue - expense,
    cashBalance: Number(row?.cash_balance ?? 0),
    receivable: Number(row?.receivable ?? 0),
    payable: Number(row?.payable ?? 0),
    companyIds,
  });
});

/** GET /accounting/holding/breakdown?holdingId=&from=&to= — breakdown per perusahaan */
router.get("/holding/breakdown", async (req, res) => {
  const holdingId = Number(req.query["holdingId"] ?? 1);
  const dateRange = parseDateRange(req);
  if (dateRange.error)
    return res.status(400).json({ message: dateRange.error });

  const members = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${holdingId}
    ORDER BY c.company_code
  `);
  if (members.rows.length === 0) return res.json([]);

  const companyIds = (members.rows as { company_id: number }[]).map(
    (r) => r.company_id,
  );
  const companyIdsArr = sql`ARRAY[${sql.join(
    companyIds.map((id) => sql`${id}`),
    sql`, `,
  )}]`;

  const dateFilter =
    dateRange.from && dateRange.to
      ? sql`AND ae.entry_date BETWEEN ${dateRange.from.toISOString().slice(0, 10)} AND ${dateRange.to.toISOString().slice(0, 10)}`
      : dateRange.from
        ? sql`AND ae.entry_date >= ${dateRange.from.toISOString().slice(0, 10)}`
        : dateRange.to
          ? sql`AND ae.entry_date <= ${dateRange.to.toISOString().slice(0, 10)}`
          : sql``;

  const result = await db.execute(sql`
    SELECT
      ael.company_id,
      COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS expense,
      COALESCE(SUM(
        CASE WHEN coa.type = 'asset'
          AND (lower(coa.name) LIKE '%kas%' OR lower(coa.name) LIKE '%cash%' OR lower(coa.name) LIKE '%bank%')
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END
      ), 0) AS cash_balance,
      COALESCE(SUM(
        CASE WHEN lower(coa.name) LIKE '%piutang%' AND coa.type = 'asset'
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END
      ), 0) AS receivable,
      COALESCE(SUM(
        CASE WHEN (lower(coa.name) LIKE '%utang%' OR lower(coa.name) LIKE '%payable%') AND coa.type = 'liability'
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END
      ), 0) AS payable
    FROM accounting_entry_lines ael
    JOIN chart_of_accounts coa ON coa.id = ael.account_id
    JOIN accounting_entries ae ON ae.id = ael.entry_id
    WHERE ae.status = 'posted'
      AND ael.company_id = ANY(${companyIdsArr})
      ${dateFilter}
    GROUP BY ael.company_id
  `);

  const byCompanyId = new Map(
    (
      result.rows as {
        company_id: number;
        revenue: string;
        expense: string;
        cash_balance: string;
        receivable: string;
        payable: string;
      }[]
    ).map((r) => [r.company_id, r]),
  );

  const breakdown = (
    members.rows as {
      company_id: number;
      company_name: string;
      company_code: string;
    }[]
  ).map((m) => {
    const r = byCompanyId.get(m.company_id);
    const revenue = Number(r?.revenue ?? 0);
    const expense = Number(r?.expense ?? 0);
    return {
      companyId: m.company_id,
      companyName: m.company_name,
      companyCode: m.company_code,
      revenue,
      expense,
      netPL: revenue - expense,
      cashBalance: Number(r?.cash_balance ?? 0),
      receivable: Number(r?.receivable ?? 0),
      payable: Number(r?.payable ?? 0),
    };
  });

  return res.json(breakdown);
});

/** GET /accounting/holding/entries?holdingId=&from=&to=&companyId= — transaksi gabungan per holding */
router.get("/holding/entries", async (req, res) => {
  const holdingId = Number(req.query["holdingId"] ?? 1);
  const companyIdFilter = req.query["companyId"]
    ? Number(req.query["companyId"])
    : null;
  const dateRange = parseDateRange(req);
  if (dateRange.error)
    return res.status(400).json({ message: dateRange.error });

  const members = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${holdingId}
    ORDER BY c.company_code
  `);
  if (members.rows.length === 0) return res.json([]);

  const companyIds = (members.rows as { company_id: number }[]).map(
    (r) => r.company_id,
  );
  const effectiveIds = companyIdFilter ? [companyIdFilter] : companyIds;
  const companyIdsArr = sql`ARRAY[${sql.join(
    effectiveIds.map((id) => sql`${id}`),
    sql`, `,
  )}]`;

  const dateFilter =
    dateRange.from && dateRange.to
      ? sql`AND ae.entry_date BETWEEN ${dateRange.from.toISOString().slice(0, 10)} AND ${dateRange.to.toISOString().slice(0, 10)}`
      : dateRange.from
        ? sql`AND ae.entry_date >= ${dateRange.from.toISOString().slice(0, 10)}`
        : dateRange.to
          ? sql`AND ae.entry_date <= ${dateRange.to.toISOString().slice(0, 10)}`
          : sql``;

  const result = await db.execute(sql`
    SELECT
      ae.id,
      ae.entry_date,
      ae.description,
      ae.status,
      ae.company_id,
      c.company_name,
      c.company_code,
      COALESCE(SUM(CASE WHEN ael.debit IS NOT NULL AND ael.debit > 0 THEN ael.debit ELSE 0 END), 0) AS total_debit,
      COALESCE(SUM(CASE WHEN ael.credit IS NOT NULL AND ael.credit > 0 THEN ael.credit ELSE 0 END), 0) AS total_credit
    FROM accounting_entries ae
    LEFT JOIN accounting_entry_lines ael ON ael.entry_id = ae.id
    JOIN companies c ON c.id = ae.company_id
    WHERE ae.company_id = ANY(${companyIdsArr})
      ${dateFilter}
    GROUP BY ae.id, ae.entry_date, ae.description, ae.status, ae.company_id, c.company_name, c.company_code
    ORDER BY ae.entry_date DESC, ae.id DESC
    LIMIT 200
  `);

  return res.json(result.rows);
});

/** GET /accounting/holding/pl-monthly — P&L breakdown per bulan per perusahaan */
router.get("/holding/pl-monthly", async (req, res) => {
  const holdingId = Number(req.query["holdingId"] ?? 1);
  const dateRange = parseDateRange(req);
  if (dateRange.error) return res.status(400).json({ message: dateRange.error });

  const members = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${holdingId}
    ORDER BY c.company_code
  `);
  if (members.rows.length === 0) return res.json({ companies: [], months: [] });

  const companyIds = (members.rows as { company_id: number }[]).map((r) => r.company_id);
  const companyIdsArr = sql`ARRAY[${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)}]`;

  const dateFilter =
    dateRange.from && dateRange.to
      ? sql`AND ae.entry_date BETWEEN ${dateRange.from.toISOString().slice(0, 10)} AND ${dateRange.to.toISOString().slice(0, 10)}`
      : dateRange.from
        ? sql`AND ae.entry_date >= ${dateRange.from.toISOString().slice(0, 10)}`
        : dateRange.to
          ? sql`AND ae.entry_date <= ${dateRange.to.toISOString().slice(0, 10)}`
          : sql``;

  const result = await db.execute(sql`
    SELECT
      TO_CHAR(ae.entry_date, 'YYYY-MM') AS month,
      ael.company_id,
      COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS revenue,
      COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS expense
    FROM accounting_entry_lines ael
    JOIN chart_of_accounts coa ON coa.id = ael.account_id
    JOIN accounting_entries ae ON ae.id = ael.entry_id
    WHERE ae.status = 'posted'
      AND ael.company_id = ANY(${companyIdsArr})
      ${dateFilter}
    GROUP BY month, ael.company_id
    ORDER BY month, ael.company_id
  `);

  type Row = { month: string; company_id: number; revenue: string; expense: string };
  const rows = result.rows as Row[];

  const companiesMeta = (members.rows as { company_id: number; company_name: string; company_code: string }[]);
  const allMonths = [...new Set(rows.map((r) => r.month))].sort();

  const monthData = allMonths.map((month) => {
    const byCompany: Record<number, { revenue: number; expense: number; netPL: number }> = {};
    companiesMeta.forEach((c) => {
      const row = rows.find((r) => r.month === month && r.company_id === c.company_id);
      const revenue = Number(row?.revenue ?? 0);
      const expense = Number(row?.expense ?? 0);
      byCompany[c.company_id] = { revenue, expense, netPL: revenue - expense };
    });
    return { month, byCompany };
  });

  return res.json({
    companies: companiesMeta.map((c) => ({ companyId: c.company_id, companyName: c.company_name, companyCode: c.company_code })),
    months: monthData,
  });
});

/** GET /accounting/holding/cashflow-monthly — arus kas konsolidasi per bulan per perusahaan */
router.get("/holding/cashflow-monthly", async (req, res) => {
  const holdingId = Number(req.query["holdingId"] ?? 1);
  const dateRange = parseDateRange(req);
  if (dateRange.error) return res.status(400).json({ message: dateRange.error });

  const members = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${holdingId}
    ORDER BY c.company_code
  `);
  if (members.rows.length === 0) return res.json({ companies: [], months: [] });

  const companyIds = (members.rows as { company_id: number }[]).map((r) => r.company_id);
  const companyIdsArr = sql`ARRAY[${sql.join(companyIds.map((id) => sql`${id}`), sql`, `)}]`;

  const dateFilter =
    dateRange.from && dateRange.to
      ? sql`AND ae.entry_date BETWEEN ${dateRange.from.toISOString().slice(0, 10)} AND ${dateRange.to.toISOString().slice(0, 10)}`
      : dateRange.from
        ? sql`AND ae.entry_date >= ${dateRange.from.toISOString().slice(0, 10)}`
        : dateRange.to
          ? sql`AND ae.entry_date <= ${dateRange.to.toISOString().slice(0, 10)}`
          : sql``;

  // Cashflow per bulan per perusahaan — klasifikasi berdasarkan tipe & nama COA:
  // Operasi : revenue (credit-debit) & expense (debit-credit)
  // Investasi: fixed asset accounts (aset tetap, peralatan, kendaraan, bangunan, tanah, investasi jangka panjang)
  // Pendanaan: equity & long-term debt (modal, pinjaman, hutang bank)
  // Kas bersih: perubahan saldo akun kas & bank
  const result = await db.execute(sql`
    SELECT
      TO_CHAR(ae.entry_date, 'YYYY-MM') AS month,
      ael.company_id,
      -- Arus Operasi: penerimaan dari pendapatan
      COALESCE(SUM(CASE WHEN coa.type = 'revenue'
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS op_inflow,
      -- Arus Operasi: pembayaran untuk beban
      COALESCE(SUM(CASE WHEN coa.type = 'expense'
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS op_outflow,
      -- Arus Investasi: perubahan aset tetap & investasi
      COALESCE(SUM(CASE
        WHEN coa.type = 'asset' AND (
          lower(coa.name) LIKE '%aset tetap%' OR lower(coa.name) LIKE '%fixed asset%'
          OR lower(coa.name) LIKE '%peralatan%' OR lower(coa.name) LIKE '%kendaraan%'
          OR lower(coa.name) LIKE '%bangunan%' OR lower(coa.name) LIKE '%tanah%'
          OR lower(coa.name) LIKE '%mesin%' OR lower(coa.name) LIKE '%inventaris%'
          OR lower(coa.name) LIKE '%investasi%' OR lower(coa.name) LIKE '%penyertaan%'
        )
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS inv_net,
      -- Arus Pendanaan: perubahan modal & pinjaman jangka panjang
      COALESCE(SUM(CASE
        WHEN (coa.type = 'equity')
          OR (coa.type = 'liability' AND (
            lower(coa.name) LIKE '%pinjaman%' OR lower(coa.name) LIKE '%hutang bank%'
            OR lower(coa.name) LIKE '%utang bank%' OR lower(coa.name) LIKE '%kredit bank%'
            OR lower(coa.name) LIKE '%modal%' OR lower(coa.name) LIKE '%saham%'
          ))
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS fin_net,
      -- Perubahan kas & bank bersih
      COALESCE(SUM(CASE
        WHEN coa.type = 'asset' AND (
          lower(coa.name) LIKE '%kas%' OR lower(coa.name) LIKE '%cash%' OR lower(coa.name) LIKE '%bank%'
        )
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS cash_change
    FROM accounting_entry_lines ael
    JOIN chart_of_accounts coa ON coa.id = ael.account_id
    JOIN accounting_entries ae ON ae.id = ael.entry_id
    WHERE ae.status = 'posted'
      AND ael.company_id = ANY(${companyIdsArr})
      ${dateFilter}
    GROUP BY month, ael.company_id
    ORDER BY month, ael.company_id
  `);

  type Row = {
    month: string;
    company_id: number;
    op_inflow: string;
    op_outflow: string;
    inv_net: string;
    fin_net: string;
    cash_change: string;
  };
  const rows = result.rows as Row[];

  const companiesMeta = members.rows as { company_id: number; company_name: string; company_code: string }[];
  const allMonths = [...new Set(rows.map((r) => r.month))].sort();

  // Hitung kumulatif saldo kas per perusahaan
  const cumulativeCash: Record<number, number> = {};
  companiesMeta.forEach((c) => { cumulativeCash[c.company_id] = 0; });

  const monthData = allMonths.map((month) => {
    const byCompany: Record<number, {
      opInflow: number; opOutflow: number; opNet: number;
      invNet: number; finNet: number; cashChange: number; endingCash: number;
    }> = {};

    companiesMeta.forEach((c) => {
      const row = rows.find((r) => r.month === month && r.company_id === c.company_id);
      const opInflow = Number(row?.op_inflow ?? 0);
      const opOutflow = Number(row?.op_outflow ?? 0);
      const invNet = Number(row?.inv_net ?? 0);
      const finNet = Number(row?.fin_net ?? 0);
      const cashChange = Number(row?.cash_change ?? 0);
      cumulativeCash[c.company_id] = (cumulativeCash[c.company_id] ?? 0) + cashChange;
      byCompany[c.company_id] = {
        opInflow, opOutflow, opNet: opInflow - opOutflow,
        invNet, finNet, cashChange,
        endingCash: cumulativeCash[c.company_id],
      };
    });
    return { month, byCompany };
  });

  return res.json({
    companies: companiesMeta.map((c) => ({
      companyId: c.company_id,
      companyName: c.company_name,
      companyCode: c.company_code,
    })),
    months: monthData,
  });
});


// ── Per-Group Detail Endpoints ───────────────────────────────────────────────

/** GET /accounting/holding/groups/:id — detail grup + members */
router.get("/holding/groups/:id", async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid group id" });
  const result = await db.execute(sql`
    SELECT
      hg.id, hg.holding_name, hg.holding_code, hg.description, hg.created_at,
      json_agg(json_build_object(
        'memberId',             chm.id,
        'companyId',            chm.company_id,
        'companyName',          c.company_name,
        'companyCode',          c.company_code,
        'ownershipPercentage',  chm.ownership_percentage,
        'consolidationMethod',  chm.consolidation_method
      ) ORDER BY c.company_code) AS members
    FROM holding_groups hg
    LEFT JOIN company_holding_members chm ON chm.holding_group_id = hg.id
    LEFT JOIN companies c ON c.id = chm.company_id
    WHERE hg.id = ${id}
    GROUP BY hg.id
  `);
  if (result.rows.length === 0)
    return res.status(404).json({ message: "Holding group tidak ditemukan" });
  return res.json(result.rows[0]);
});

/** GET /accounting/holding/groups/:id/pl — konsolidasi laba rugi */
router.get("/holding/groups/:id/pl", async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid group id" });
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });

  const membersResult = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${id}
    ORDER BY c.company_code
  `);
  const members = membersResult.rows as {
    company_id: number; company_name: string; company_code: string;
  }[];
  if (members.length === 0)
    return res.json({ companies: [], perCompany: {}, consolidated: { revenues: [], expenses: [], totalRevenue: 0, totalExpense: 0, netIncome: 0 } });

  const accounts = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);

  type PLRow = { accountId: number; code: string; name: string; amount: number };
  type PLResult = { revenues: PLRow[]; expenses: PLRow[]; totalRevenue: number; totalExpense: number; netIncome: number };
  const perCompanyData: Record<number, PLResult> = {};

  await Promise.all(members.map(async (m) => {
    const { lines } = await buildLedgerWindow(range.from, range.to, m.company_id);
    const totals = new Map<number, number>();
    for (const l of lines) {
      totals.set(l.accountId, (totals.get(l.accountId) ?? 0) + (Number(l.credit) - Number(l.debit)));
    }
    const revenues = accounts
      .filter((a) => a.type === "revenue")
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((totals.get(a.id) ?? 0) * 100) / 100 }))
      .filter((r) => r.amount !== 0);
    const expenses = accounts
      .filter((a) => a.type === "expense")
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round(-(totals.get(a.id) ?? 0) * 100) / 100 }))
      .filter((r) => r.amount !== 0);
    const totalRevenue = revenues.reduce((s, r) => s + r.amount, 0);
    const totalExpense = expenses.reduce((s, r) => s + r.amount, 0);
    perCompanyData[m.company_id] = {
      revenues, expenses,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalExpense: Math.round(totalExpense * 100) / 100,
      netIncome: Math.round((totalRevenue - totalExpense) * 100) / 100,
    };
  }));

  // Consolidated: sum per-account across companies
  const conRevMap = new Map<number, number>();
  const conExpMap = new Map<number, number>();
  for (const d of Object.values(perCompanyData)) {
    for (const r of d.revenues) conRevMap.set(r.accountId, (conRevMap.get(r.accountId) ?? 0) + r.amount);
    for (const e of d.expenses) conExpMap.set(e.accountId, (conExpMap.get(e.accountId) ?? 0) + e.amount);
  }
  const conRevenues = accounts
    .filter((a) => a.type === "revenue")
    .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((conRevMap.get(a.id) ?? 0) * 100) / 100 }))
    .filter((r) => r.amount !== 0);
  const conExpenses = accounts
    .filter((a) => a.type === "expense")
    .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((conExpMap.get(a.id) ?? 0) * 100) / 100 }))
    .filter((r) => r.amount !== 0);
  const conRevTotal = conRevenues.reduce((s, r) => s + r.amount, 0);
  const conExpTotal = conExpenses.reduce((s, r) => s + r.amount, 0);

  return res.json({
    from: range.from?.toISOString() ?? null,
    to: range.to?.toISOString() ?? null,
    companies: members.map((m) => ({ companyId: m.company_id, companyName: m.company_name, companyCode: m.company_code })),
    perCompany: perCompanyData,
    consolidated: {
      revenues: conRevenues, expenses: conExpenses,
      totalRevenue: Math.round(conRevTotal * 100) / 100,
      totalExpense: Math.round(conExpTotal * 100) / 100,
      netIncome: Math.round((conRevTotal - conExpTotal) * 100) / 100,
    },
  });
});

/** GET /accounting/holding/groups/:id/balance-sheet — konsolidasi neraca */
router.get("/holding/groups/:id/balance-sheet", async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid group id" });
  const range = parseDateRange(req);
  if (range.error) return res.status(400).json({ message: range.error });
  const asOf = range.to ?? new Date();

  const membersResult = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${id}
    ORDER BY c.company_code
  `);
  const members = membersResult.rows as {
    company_id: number; company_name: string; company_code: string;
  }[];
  if (members.length === 0)
    return res.json({ companies: [], perCompany: {}, consolidated: {} });

  const accounts = await db.select().from(chartOfAccountsTable).orderBy(chartOfAccountsTable.code);

  type BSRow = { accountId: number; code: string; name: string; amount: number };
  type BSResult = {
    assets: BSRow[]; liabilities: BSRow[]; equity: BSRow[];
    netIncomeYTD: number; totalAssets: number; totalLiabilities: number;
    totalEquity: number; totalLiabilitiesAndEquity: number;
  };
  const perCompanyData: Record<number, BSResult> = {};

  await Promise.all(members.map(async (m) => {
    const { lines } = await buildLedgerWindow(null, asOf, m.company_id);
    const totals = new Map<number, number>();
    for (const l of lines) {
      const acc = accounts.find((a) => a.id === l.accountId);
      if (!acc) continue;
      const isDebitNormal = acc.type === "asset" || acc.type === "expense";
      const v = isDebitNormal
        ? Number(l.debit) - Number(l.credit)
        : Number(l.credit) - Number(l.debit);
      totals.set(l.accountId, (totals.get(l.accountId) ?? 0) + v);
    }
    const mapAccs = (type: string): BSRow[] =>
      accounts
        .filter((a) => a.type === type)
        .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((totals.get(a.id) ?? 0) * 100) / 100 }))
        .filter((r) => r.amount !== 0);
    const assets = mapAccs("asset");
    const liabilities = mapAccs("liability");
    const equity = mapAccs("equity");
    const revenueTotal = accounts.filter((a) => a.type === "revenue").reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
    const expenseTotal = accounts.filter((a) => a.type === "expense").reduce((s, a) => s + (totals.get(a.id) ?? 0), 0);
    const netIncome = Math.round((revenueTotal - expenseTotal) * 100) / 100;
    const totalAssets = Math.round(assets.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const totalLiabilities = Math.round(liabilities.reduce((s, a) => s + a.amount, 0) * 100) / 100;
    const totalEquity = Math.round((equity.reduce((s, a) => s + a.amount, 0) + netIncome) * 100) / 100;
    perCompanyData[m.company_id] = {
      assets, liabilities, equity, netIncomeYTD: netIncome,
      totalAssets, totalLiabilities, totalEquity,
      totalLiabilitiesAndEquity: Math.round((totalLiabilities + totalEquity) * 100) / 100,
    };
  }));

  // Consolidated: sum per-account
  const conMap = new Map<number, number>();
  for (const d of Object.values(perCompanyData)) {
    for (const a of [...d.assets, ...d.liabilities, ...d.equity]) {
      conMap.set(a.accountId, (conMap.get(a.accountId) ?? 0) + a.amount);
    }
  }
  const conNetIncome = Math.round(Object.values(perCompanyData).reduce((s, d) => s + d.netIncomeYTD, 0) * 100) / 100;
  const mapConAccs = (type: string): BSRow[] =>
    accounts
      .filter((a) => a.type === type)
      .map((a) => ({ accountId: a.id, code: a.code, name: a.name, amount: Math.round((conMap.get(a.id) ?? 0) * 100) / 100 }))
      .filter((r) => r.amount !== 0);
  const conAssets = mapConAccs("asset");
  const conLiabilities = mapConAccs("liability");
  const conEquity = mapConAccs("equity");
  const conTotalAssets = Math.round(conAssets.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const conTotalLiabilities = Math.round(conLiabilities.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const conTotalEquity = Math.round((conEquity.reduce((s, a) => s + a.amount, 0) + conNetIncome) * 100) / 100;

  return res.json({
    asOf: asOf.toISOString(),
    companies: members.map((m) => ({ companyId: m.company_id, companyName: m.company_name, companyCode: m.company_code })),
    perCompany: perCompanyData,
    consolidated: {
      assets: conAssets, liabilities: conLiabilities, equity: conEquity,
      netIncomeYTD: conNetIncome, totalAssets: conTotalAssets,
      totalLiabilities: conTotalLiabilities, totalEquity: conTotalEquity,
      totalLiabilitiesAndEquity: Math.round((conTotalLiabilities + conTotalEquity) * 100) / 100,
    },
  });
});

/** GET /accounting/holding/groups/:id/cashflow — arus kas per periode */
router.get("/holding/groups/:id/cashflow", async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid group id" });
  const dateRange = parseDateRange(req);
  if (dateRange.error) return res.status(400).json({ message: dateRange.error });

  const membersResult = await db.execute(sql`
    SELECT chm.company_id, c.company_name, c.company_code
    FROM company_holding_members chm
    JOIN companies c ON c.id = chm.company_id
    WHERE chm.holding_group_id = ${id}
    ORDER BY c.company_code
  `);
  const members = membersResult.rows as {
    company_id: number; company_name: string; company_code: string;
  }[];
  if (members.length === 0)
    return res.json({ companies: [], perCompany: {}, consolidated: { opInflow: 0, opOutflow: 0, opNet: 0, invNet: 0, finNet: 0, cashChange: 0 } });

  const companyIds = members.map((m) => m.company_id);
  const companyIdsArr = sql`ARRAY[${sql.join(companyIds.map((cid) => sql`${cid}`), sql`, `)}]`;
  const dateFilter =
    dateRange.from && dateRange.to
      ? sql`AND ae.entry_date BETWEEN ${dateRange.from.toISOString().slice(0, 10)} AND ${dateRange.to.toISOString().slice(0, 10)}`
      : dateRange.from
        ? sql`AND ae.entry_date >= ${dateRange.from.toISOString().slice(0, 10)}`
        : dateRange.to
          ? sql`AND ae.entry_date <= ${dateRange.to.toISOString().slice(0, 10)}`
          : sql``;

  const rows = await db.execute(sql`
    SELECT
      ae.company_id,
      COALESCE(SUM(CASE WHEN coa.type = 'revenue'
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS op_inflow,
      COALESCE(SUM(CASE WHEN coa.type = 'expense'
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS op_outflow,
      COALESCE(SUM(CASE WHEN coa.type = 'asset'
        AND (lower(coa.name) SIMILAR TO '%(aset tetap|peralatan|kendaraan|bangunan|tanah|mesin|investasi|penyertaan)%')
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS inv_net,
      COALESCE(SUM(CASE WHEN (coa.type = 'equity')
        OR (coa.type = 'liability' AND (lower(coa.name) LIKE '%pinjaman%' OR lower(coa.name) LIKE '%hutang bank%'
          OR lower(coa.name) LIKE '%modal%' OR lower(coa.name) LIKE '%saham%'))
        THEN COALESCE(ael.credit, 0) - COALESCE(ael.debit, 0) ELSE 0 END), 0) AS fin_net,
      COALESCE(SUM(CASE WHEN coa.type = 'asset'
        AND (lower(coa.name) LIKE '%kas%' OR lower(coa.name) LIKE '%cash%' OR lower(coa.name) LIKE '%bank%')
        THEN COALESCE(ael.debit, 0) - COALESCE(ael.credit, 0) ELSE 0 END), 0) AS cash_change
    FROM accounting_entry_lines ael
    JOIN accounting_entries ae ON ae.id = ael.entry_id
    JOIN chart_of_accounts coa ON coa.id = ael.account_id
    WHERE ae.status = 'posted'
      AND ae.company_id = ANY(${companyIdsArr})
      ${dateFilter}
    GROUP BY ae.company_id
  `);

  type CFRow = { opInflow: number; opOutflow: number; opNet: number; invNet: number; finNet: number; cashChange: number };
  const perCompanyData: Record<number, CFRow> = {};
  for (const m of members) {
    const row = (rows.rows as Record<string, unknown>[]).find((r) => r["company_id"] === m.company_id);
    const opInflow = Number(row?.["op_inflow"] ?? 0);
    const opOutflow = Number(row?.["op_outflow"] ?? 0);
    const invNet = Number(row?.["inv_net"] ?? 0);
    const finNet = Number(row?.["fin_net"] ?? 0);
    const cashChange = Number(row?.["cash_change"] ?? 0);
    perCompanyData[m.company_id] = { opInflow, opOutflow, opNet: opInflow - opOutflow, invNet, finNet, cashChange };
  }

  const all = Object.values(perCompanyData);
  const consolidated: CFRow = {
    opInflow: all.reduce((s, d) => s + d.opInflow, 0),
    opOutflow: all.reduce((s, d) => s + d.opOutflow, 0),
    opNet: all.reduce((s, d) => s + d.opNet, 0),
    invNet: all.reduce((s, d) => s + d.invNet, 0),
    finNet: all.reduce((s, d) => s + d.finNet, 0),
    cashChange: all.reduce((s, d) => s + d.cashChange, 0),
  };

  return res.json({
    from: dateRange.from?.toISOString() ?? null,
    to: dateRange.to?.toISOString() ?? null,
    companies: members.map((m) => ({ companyId: m.company_id, companyName: m.company_name, companyCode: m.company_code })),
    perCompany: perCompanyData,
    consolidated,
  });
});

export default router;


