import { Router, type Request } from "express";
import { eq, desc, and, sql } from "drizzle-orm";
import multer from "multer";
import {
  db, cashAdvancesTable, cashAdvanceRepaymentsTable,
  chartOfAccountsTable, accountingJournalsTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postEntry } from "../lib/accounting.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { auditFromReq } from "../lib/auditLog.js";
import { getOpenAI } from "../lib/openaiClient.js";
import { Client as ObjectStorageClient } from "@replit/object-storage";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

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
  await db.execute(sql.raw(`
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS rejection_reason TEXT;
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS approval_request_id INTEGER;
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS vendor_id INTEGER;
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS user_id TEXT;
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS category TEXT;
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS receipt_url TEXT;
    ALTER TABLE cash_advances ADD COLUMN IF NOT EXISTS ocr_raw_data TEXT;
  `));
}
ensureTables().catch(console.error);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function serializeAdv(r: any) {
  return {
    ...r,
    id: Number(r.id),
    amount: Number(r.amount),
    paidAmount: Number(r.paid_amount ?? r.paidAmount ?? 0),
    remainingAmount: Number(r.remaining_amount ?? r.remainingAmount ?? 0),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : r.created_at ?? r.createdAt,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : r.updated_at ?? r.updatedAt,
    ocrRawData: r.ocr_raw_data ? (() => { try { return JSON.parse(r.ocr_raw_data); } catch { return null; } })() : null,
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

// ─── Helper: post journal for cash advance ────────────────────────────────────
export async function postCashAdvanceJournal(advId: number) {
  const result = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${advId}`));
  const r = result.rows[0] as any;
  if (!r) throw new Error("Kasbon tidak ditemukan");

  const companyId: number | null = r.company_id ?? null;
  const settings = await ensureAccountingSettings(companyId);
  const receivableAccountId: number = r.receivable_account_id;
  const cashBankAccountId: number = r.cash_bank_account_id ?? await resolveCashBankAccount(r.payment_method, settings);

  if (!receivableAccountId || !cashBankAccountId)
    throw new Error("Akun piutang/kas tidak ditemukan");

  const journalType = (r.payment_method ?? "bank") === "cash" ? "cash" : "bank";
  const [journal] = await db.select().from(accountingJournalsTable)
    .where(eq(accountingJournalsTable.type, journalType as any)).limit(1);
  const fallback = !journal
    ? (await db.select().from(accountingJournalsTable).limit(1))[0]
    : null;
  const j = journal ?? fallback;
  if (!j) throw new Error("Jurnal kas/bank tidak ditemukan");

  const typeLabel = r.type === "kasbon" ? "Kasbon" : "Dana Talangan";
  const amountN = Number(r.amount);
  const entry = await postEntry({
    journalId: j.id,
    date: new Date(r.date),
    ref: r.advance_number,
    description: `${r.advance_number} — ${typeLabel} ${r.party_name}`,
    source: "manual",
    companyId,
    lines: [
      { accountId: receivableAccountId, debit: amountN, credit: 0, description: `${typeLabel} — ${r.party_name}` },
      { accountId: cashBankAccountId, debit: 0, credit: amountN, description: r.payment_method === "cash" ? "Kas" : "Bank" },
    ],
  }, j.code);

  await db.execute(sql.raw(
    `UPDATE cash_advances SET entry_id = ${entry.id}, status = 'active', updated_at = NOW() WHERE id = ${advId}`
  ));
  return entry;
}

// ─── Check approval limit ──────────────────────────────────────────────────────
async function checkApprovalLimit(type: string, companyId: number | null, amount: number) {
  const result = await db.execute(sql.raw(`
    SELECT * FROM expense_approval_limits
    WHERE category = '${type}'
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

// ─── List ──────────────────────────────────────────────────────────────────────
router.get("/", async (req: Request, res) => {
  const companyId = resolveCompanyId(req);
  const { type, status, from, to } = req.query as Record<string, string>;
  const whereParts: string[] = [`ca.company_id = ${companyId}`];
  if (type) whereParts.push(`ca.type = '${type.replace(/'/g, "''")}'`);
  if (status) whereParts.push(`ca.status = '${status.replace(/'/g, "''")}'`);
  if (from) whereParts.push(`ca.date >= '${from}'`);
  if (to) whereParts.push(`ca.date <= '${to}'`);

  const result = await db.execute(sql.raw(`
    SELECT ca.*,
      coa.code AS cash_bank_account_code,
      coa.name AS cash_bank_account_name,
      sup.name AS vendor_name
    FROM cash_advances ca
    LEFT JOIN chart_of_accounts coa ON ca.cash_bank_account_id = coa.id
    LEFT JOIN suppliers sup ON ca.vendor_id = sup.id
    WHERE ${whereParts.join(" AND ")}
    ORDER BY ca.date DESC, ca.id DESC
    LIMIT 500
  `));

  return res.json((result.rows as any[]).map((r) => ({
    ...serializeAdv(r),
    cashBankAccount: r.cash_bank_account_id
      ? { id: r.cash_bank_account_id, code: r.cash_bank_account_code, name: r.cash_bank_account_name }
      : null,
    vendor: r.vendor_id ? { id: r.vendor_id, name: r.vendor_name } : null,
  })));
});

// ─── Detail ────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const result = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${id}`));
  const adv = result.rows[0] as any;
  if (!adv) return res.status(404).json({ message: "Not found" });
  const repayments = await db
    .select().from(cashAdvanceRepaymentsTable)
    .where(eq(cashAdvanceRepaymentsTable.advanceId, id))
    .orderBy(desc(cashAdvanceRepaymentsTable.date), desc(cashAdvanceRepaymentsTable.id));
  const approvalResult = await db.execute(sql.raw(
    `SELECT * FROM expense_approval_requests WHERE ref_type IN ('kasbon','talangan') AND ref_id = ${id} ORDER BY id DESC LIMIT 1`
  ));
  // Audit logs
  const auditResult = await db.execute(sql.raw(`
    SELECT action, module, new_data, created_at, user_email
    FROM erp_audit_logs
    WHERE module = 'kasbon' AND reference_id = '${id}'
    ORDER BY created_at DESC LIMIT 20
  `)).catch(() => ({ rows: [] }));

  return res.json({
    ...serializeAdv(adv),
    repayments: repayments.map(serializeRep),
    approvalRequest: approvalResult.rows[0] ?? null,
    auditLogs: auditResult.rows ?? [],
  });
});

// ─── Create ────────────────────────────────────────────────────────────────────
router.post("/", async (req: Request, res) => {
  const { type, partyName, amount, paymentMethod, date, notes, vendorId, sourceAccountId, category } = req.body ?? {};
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
    return res.status(400).json({ message: `Akun piutang (${type === "kasbon" ? "1-1032" : "1-1033"}) belum ada di COA.` });

  const resolvedCashBank = sourceAccountId
    ? Number(sourceAccountId)
    : await resolveCashBankAccount(paymentMethod ?? "bank", settings);
  const cashBankAccountId = resolvedCashBank;
  if (!cashBankAccountId)
    return res.status(400).json({ message: "Akun Kas/Bank default belum dikonfigurasi." });

  const { needsApproval, limit } = await checkApprovalLimit(type, companyId, amountN);
  const advanceNumber = await nextAdvanceNumber(type);
  const userId = (req as any).userId ?? null;
  const categoryVal = category ? String(category).trim() : null;

  if (needsApproval && limit) {
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
      status: "pending_approval",
      receivableAccountId,
      cashBankAccountId,
      vendorId: vendorId ? Number(vendorId) : null,
      userId,
      createdById: userId,
    }).returning();

    // Set category via raw SQL (column added via migration)
    if (categoryVal) {
      await db.execute(sql.raw(`UPDATE cash_advances SET category = '${categoryVal.replace(/'/g, "''")}' WHERE id = ${adv!.id}`));
    }

    let requesterName: string | null = null;
    if (userId) {
      const ur = await db.execute(sql.raw(`SELECT name FROM users WHERE id = '${userId}' LIMIT 1`));
      requesterName = (ur.rows[0] as any)?.name ?? null;
    }
    let l1Name: string | null = null, l2Name: string | null = null;
    if (limit.l1_approver_id) {
      const r = await db.execute(sql.raw(`SELECT name FROM users WHERE id = '${limit.l1_approver_id}' LIMIT 1`));
      l1Name = (r.rows[0] as any)?.name ?? null;
    }
    if (limit.l2_approver_id) {
      const r = await db.execute(sql.raw(`SELECT name FROM users WHERE id = '${limit.l2_approver_id}' LIMIT 1`));
      l2Name = (r.rows[0] as any)?.name ?? null;
    }

    const typeLabel = type === "kasbon" ? "Kasbon" : "Dana Talangan";
    const desc = `${typeLabel} ${partyName} — ${new Intl.NumberFormat("id-ID").format(amountN)}`;

    const arResult = await db.execute(sql.raw(`
      INSERT INTO expense_approval_requests
        (company_id, ref_type, ref_id, description, amount, requester_id, requester_name,
         status, l1_approver_id, l1_approver_name, l1_status,
         l2_approver_id, l2_approver_name, l2_status)
      VALUES
        (${companyId ?? "NULL"}, '${type}', ${adv!.id},
         '${desc.replace(/'/g, "''")}', ${amountN},
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
    const arId = (arResult.rows[0] as any)?.id;
    if (arId) {
      await db.execute(sql.raw(`UPDATE cash_advances SET approval_request_id = ${arId} WHERE id = ${adv!.id}`));
    }

    try {
      const { getAdminGroupWa } = await import("../lib/adminWa.js");
      const { sendWhatsApp } = await import("../lib/fonnte.js");
      const adminGroup = await getAdminGroupWa();
      if (adminGroup) {
        const approverInfo = l1Name ? `Menunggu persetujuan: *${l1Name}*` : "Tidak ada approver yang dikonfigurasi";
        const msg = `🔔 *Permintaan ${typeLabel} Baru*\n\nNo: ${advanceNumber}\nNama: ${partyName}\nKategori: ${categoryVal ?? "-"}\nNominal: Rp ${new Intl.NumberFormat("id-ID").format(amountN)}\n${approverInfo}`;
        sendWhatsApp(adminGroup, msg, { context: "expense_approval_request", refId: String(arId) }).catch(() => {});
      }
    } catch { /* non-fatal */ }

    auditFromReq(req, {
      action: "kasbon_created",
      module: "kasbon",
      referenceId: String(adv!.id),
      newData: { advanceNumber, partyName, amount: amountN, status: "pending_approval", category: categoryVal },
    });

    return res.status(201).json({
      ...serializeAdv(adv!),
      needsApproval: true,
      approvalRequestId: arId ?? null,
      message: `${typeLabel} menunggu persetujuan (melebihi limit auto-approve).`,
    });
  }

  // ── Tidak perlu approval — buat langsung dengan jurnal ──────────────────────
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
    vendorId: vendorId ? Number(vendorId) : null,
    userId,
    createdById: userId,
  }).returning();

  if (categoryVal) {
    await db.execute(sql.raw(`UPDATE cash_advances SET category = '${categoryVal.replace(/'/g, "''")}' WHERE id = ${adv!.id}`));
  }

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

  auditFromReq(req, {
    action: "kasbon_created",
    module: "kasbon",
    referenceId: String(adv!.id),
    newData: { advanceNumber, partyName, amount: amountN, status: "active", category: categoryVal },
  });

  return res.status(201).json({ ...serializeAdv({ ...adv!, entryId: entry.id }), needsApproval: false });
});

// ─── Approve (BD) ──────────────────────────────────────────────────────────────
router.patch("/:id/approve", async (req: Request, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const result = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${id}`));
  const adv = result.rows[0] as any;
  if (!adv) return res.status(404).json({ message: "Kasbon tidak ditemukan." });
  if (adv.status !== "pending_approval")
    return res.status(400).json({ message: `Kasbon status '${adv.status}' tidak bisa di-approve.` });

  // Post jurnal dan set status → active
  try {
    await postCashAdvanceJournal(id);
  } catch (e: any) {
    return res.status(400).json({ message: `Gagal posting jurnal: ${e.message}` });
  }

  // Update approval request
  await db.execute(sql.raw(`
    UPDATE expense_approval_requests
    SET l1_status = 'approved', status = 'approved', updated_at = NOW()
    WHERE ref_type IN ('kasbon','talangan') AND ref_id = ${id}
  `)).catch(() => {});

  auditFromReq(req, {
    action: "kasbon_approved",
    module: "kasbon",
    referenceId: String(id),
    newData: { advanceNumber: adv.advance_number, partyName: adv.party_name, amount: Number(adv.amount) },
  });

  const updated = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${id}`));
  return res.json({ ...serializeAdv(updated.rows[0] as any), message: "Kasbon disetujui dan jurnal telah diposting." });
});

// ─── Reject (BD) ───────────────────────────────────────────────────────────────
router.patch("/:id/reject", async (req: Request, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { reason } = req.body ?? {};

  const result = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${id}`));
  const adv = result.rows[0] as any;
  if (!adv) return res.status(404).json({ message: "Kasbon tidak ditemukan." });
  if (adv.status !== "pending_approval")
    return res.status(400).json({ message: `Kasbon status '${adv.status}' tidak bisa ditolak.` });

  const reasonSafe = reason ? String(reason).replace(/'/g, "''") : "";
  await db.execute(sql.raw(`
    UPDATE cash_advances
    SET status = 'rejected', rejection_reason = '${reasonSafe}', updated_at = NOW()
    WHERE id = ${id}
  `));

  await db.execute(sql.raw(`
    UPDATE expense_approval_requests
    SET l1_status = 'rejected', l1_notes = '${reasonSafe}', status = 'rejected', updated_at = NOW()
    WHERE ref_type IN ('kasbon','talangan') AND ref_id = ${id}
  `)).catch(() => {});

  auditFromReq(req, {
    action: "kasbon_rejected",
    module: "kasbon",
    referenceId: String(id),
    newData: { advanceNumber: adv.advance_number, reason },
  });

  const updated = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${id}`));
  return res.json({ ...serializeAdv(updated.rows[0] as any), message: "Kasbon ditolak." });
});

// ─── Upload Receipt + OCR ──────────────────────────────────────────────────────
router.post("/:id/upload-receipt", upload.single("receipt"), async (req: Request, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  if (!req.file) return res.status(400).json({ message: "File receipt wajib diupload." });

  const result = await db.execute(sql.raw(`SELECT * FROM cash_advances WHERE id = ${id}`));
  const adv = result.rows[0] as any;
  if (!adv) return res.status(404).json({ message: "Kasbon tidak ditemukan." });

  const file = req.file;
  const ext = (file.originalname.split(".").pop() ?? "jpg").toLowerCase();
  const allowedExt = ["jpg", "jpeg", "png", "pdf", "webp"];
  if (!allowedExt.includes(ext))
    return res.status(400).json({ message: "Format file tidak didukung. Gunakan JPG, PNG, atau PDF." });

  // ── Upload ke Replit Object Storage ─────────────────────────────────────────
  let receiptUrl: string | null = null;
  try {
    const storageClient = new ObjectStorageClient();
    const key = `receipts/kasbon-${id}-${Date.now()}.${ext}`;
    await storageClient.uploadFromBytes(key, file.buffer, { contentType: file.mimetype });
    receiptUrl = key;
  } catch {
    // Storage optional — OCR masih bisa berjalan
  }

  // ── OCR via OpenAI Vision ────────────────────────────────────────────────────
  let ocrResult: { amount: number | null; date: string | null; partyName: string | null; description: string | null; confidence: string } = {
    amount: null, date: null, partyName: null, description: null, confidence: "low",
  };

  try {
    const openai = getOpenAI();
    const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext);

    let userContent: any[];
    if (isImage) {
      const b64 = file.buffer.toString("base64");
      const mime = file.mimetype as "image/jpeg" | "image/png" | "image/webp";
      userContent = [
        {
          type: "text",
          text: `Ini adalah struk/receipt pembayaran. Ekstrak informasi berikut dalam JSON:
- amount: nominal pembayaran (angka, tanpa tanda titik/koma, tanpa simbol mata uang)
- date: tanggal transaksi (format YYYY-MM-DD)
- partyName: nama vendor/toko/pihak penerima
- description: deskripsi singkat pembelian
- confidence: "high" jika data jelas, "medium" jika ada ketidakpastian, "low" jika tidak bisa dibaca

Kembalikan HANYA JSON valid, tidak ada teks lain.`,
        },
        { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
      ];
    } else {
      // PDF — ekstrak teks dulu
      userContent = [
        {
          type: "text",
          text: `Analisa file PDF berikut (base64): ${file.buffer.toString("base64").slice(0, 2000)}...
Ini adalah struk/receipt pembayaran. Ekstrak dalam JSON: amount (angka), date (YYYY-MM-DD), partyName (nama toko), description (deskripsi pembelian), confidence (high/medium/low).
Kembalikan HANYA JSON valid.`,
        },
      ];
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: userContent }],
      max_tokens: 400,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    ocrResult = {
      amount: parsed.amount ? Number(String(parsed.amount).replace(/[^\d]/g, "")) : null,
      date: parsed.date ?? null,
      partyName: parsed.partyName ?? null,
      description: parsed.description ?? null,
      confidence: parsed.confidence ?? "medium",
    };
  } catch (e) {
    console.error("[OCR] Failed:", e);
  }

  // ── Simpan ke DB ──────────────────────────────────────────────────────────────
  const ocrJson = JSON.stringify(ocrResult).replace(/'/g, "''");
  const receiptUrlSafe = receiptUrl ? `'${receiptUrl}'` : "NULL";
  await db.execute(sql.raw(`
    UPDATE cash_advances
    SET receipt_url = ${receiptUrlSafe}, ocr_raw_data = '${ocrJson}', updated_at = NOW()
    WHERE id = ${id}
  `));

  auditFromReq(req, {
    action: "receipt_uploaded",
    module: "kasbon",
    referenceId: String(id),
    newData: { receiptUrl, ocr: ocrResult },
  });

  return res.json({
    receiptUrl,
    ocr: ocrResult,
    message: "Receipt berhasil diproses.",
  });
});

// ─── Repayment ─────────────────────────────────────────────────────────────────
router.post("/:id/repay", async (req: Request, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [adv] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  if (!adv) return res.status(404).json({ message: "Not found" });
  if (adv.status === "repaid") return res.status(400).json({ message: "Kasbon/Talangan ini sudah lunas." });
  if (adv.status === "pending_approval") return res.status(400).json({ message: "Kasbon masih menunggu approval, belum bisa dicicil." });
  if (adv.status === "rejected") return res.status(400).json({ message: "Kasbon ini ditolak." });

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

  auditFromReq(req, {
    action: "payment_processed",
    module: "kasbon",
    referenceId: String(id),
    newData: { repaymentAmount: amountN, newStatus, newRemaining },
  });

  const [updated] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  return res.status(201).json({ repayment: serializeRep(rep!), advance: serializeAdv(updated!) });
});

// ─── Delete ────────────────────────────────────────────────────────────────────
router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [adv] = await db.select().from(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  if (!adv) return res.status(404).json({ message: "Not found" });
  if (!["active", "pending_approval", "rejected"].includes(adv.status) || Number(adv.paidAmount) > 0)
    return res.status(400).json({ message: "Hanya kasbon yang belum ada cicilan yang bisa dihapus." });
  await db.execute(sql.raw(
    `DELETE FROM expense_approval_requests WHERE ref_type IN ('kasbon','talangan') AND ref_id = ${id}`
  ));
  await db.delete(cashAdvancesTable).where(eq(cashAdvancesTable.id, id));
  return res.json({ message: "Deleted" });
});

export default router;
