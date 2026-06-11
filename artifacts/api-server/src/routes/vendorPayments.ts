import { Router, type Request } from "express";
import { sql } from "drizzle-orm";
import { db, chartOfAccountsTable } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postEntry } from "../lib/accounting.js";
import { ensureAccountingSettings } from "../lib/accountingSeed.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { audit } from "../lib/unifiedAudit.js";
import { recalculateVendorDocPaymentStatus } from "../lib/vendorPaymentRecalc.js";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// ─── Inline migration ─────────────────────────────────────────────────────────
let migrationPromise: Promise<void> | null = null;
function runMigration(): Promise<void> {
  if (!migrationPromise) {
    migrationPromise = db.execute(sql.raw(`
      CREATE TABLE IF NOT EXISTS vendor_payments (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        payment_number TEXT NOT NULL UNIQUE,
        supplier_id INTEGER,
        vendor_name TEXT NOT NULL,
        payment_date DATE NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        payment_method TEXT NOT NULL DEFAULT 'bank',
        reference TEXT,
        purchase_document_id INTEGER,
        bank_account_id INTEGER,
        status TEXT NOT NULL DEFAULT 'paid',
        journal_entry_id INTEGER,
        notes TEXT,
        created_by_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
      ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS wht_amount NUMERIC(14,2) NOT NULL DEFAULT 0;
      ALTER TABLE vendor_payments ADD COLUMN IF NOT EXISTS wht_account_id INTEGER;
      CREATE INDEX IF NOT EXISTS vendor_payments_company_idx ON vendor_payments(company_id);
      CREATE INDEX IF NOT EXISTS vendor_payments_supplier_idx ON vendor_payments(supplier_id);
    `)).then(() => undefined);
  }
  return migrationPromise;
}

async function nextPaymentNumber(companyId: number | null, offset = 0): Promise<string> {
  const prefix = "VPY";
  const year = new Date().getFullYear();
  const co = companyId ? String(companyId).padStart(2, "0") : "00";
  const pattern = `${prefix}/${year}/${co}/%`;
  const rows = await db.execute(sql.raw(
    `SELECT COALESCE(MAX(CAST(SPLIT_PART(payment_number, '/', 4) AS INTEGER)), 0) AS max_seq
     FROM vendor_payments WHERE payment_number LIKE '${pattern}'`
  ));
  const maxSeq = Number((rows.rows[0] as any)?.max_seq ?? 0);
  const seq = maxSeq + 1 + offset;
  return `${prefix}/${year}/${co}/${String(seq).padStart(5, "0")}`;
}

// ─── GET /api/vendor-payments ─────────────────────────────────────────────────
router.get("/", async (req: Request, res) => {
  await runMigration();
  const companyId = await resolveCompanyId(req);
  const { supplierId, from, to } = req.query as Record<string, string>;

  let where = companyId ? `WHERE company_id = ${companyId}` : "WHERE TRUE";
  if (supplierId) where += ` AND supplier_id = ${parseInt(supplierId)}`;
  if (from) where += ` AND payment_date >= '${from}'`;
  if (to)   where += ` AND payment_date <= '${to}'`;

  const rows = await db.execute(sql.raw(
    `SELECT vp.*, s.name AS supplier_name_ref
     FROM vendor_payments vp
     LEFT JOIN suppliers s ON s.id = vp.supplier_id
     ${where} ORDER BY vp.id DESC LIMIT 500`
  ));
  return res.json(rows.rows);
});

// ─── GET /api/vendor-payments/summary ────────────────────────────────────────
router.get("/summary", async (req: Request, res) => {
  await runMigration();
  const companyId = await resolveCompanyId(req);
  const where = companyId ? `WHERE company_id = ${companyId}` : "";
  const rows = await db.execute(sql.raw(`
    SELECT
      COUNT(*) AS total_count,
      COALESCE(SUM(amount), 0) AS total_amount,
      COUNT(*) FILTER (WHERE payment_method = 'bank') AS bank_count,
      COUNT(*) FILTER (WHERE payment_method = 'cash') AS cash_count,
      COUNT(*) FILTER (WHERE payment_date >= DATE_TRUNC('month', NOW())) AS this_month_count,
      COALESCE(SUM(amount) FILTER (WHERE payment_date >= DATE_TRUNC('month', NOW())), 0) AS this_month_amount
    FROM vendor_payments ${where}
  `));
  return res.json(rows.rows[0] ?? {});
});

// ─── GET /api/vendor-payments/:id ────────────────────────────────────────────
router.get("/:id", async (req: Request, res) => {
  await runMigration();
  const id = parseInt(req.params.id);
  const result = await db.execute(sql.raw(`
    SELECT vp.*, s.name AS supplier_name_ref, s.contact_email AS supplier_email
    FROM vendor_payments vp
    LEFT JOIN suppliers s ON s.id = vp.supplier_id
    WHERE vp.id = ${id}
  `));
  const row = result.rows[0];
  if (!row) return res.status(404).json({ message: "Pembayaran tidak ditemukan." });
  return res.json(row);
});

// ─── POST /api/vendor-payments ────────────────────────────────────────────────
router.post("/", async (req: Request, res) => {
  await runMigration();
  const companyId = await resolveCompanyId(req);
  const userId = (req as any).userId ?? null;
  const {
    vendorName, supplierId, paymentDate, amount, paymentMethod = "bank",
    reference, purchaseDocumentId, notes,
    whtAmount: whtAmountRaw,
  } = req.body;

  if (!vendorName?.trim()) return res.status(400).json({ message: "Nama vendor wajib diisi." });
  const amt = parseFloat(amount);
  if (!amt || amt <= 0) return res.status(400).json({ message: "Nominal harus lebih dari 0." });
  if (!paymentDate) return res.status(400).json({ message: "Tanggal pembayaran wajib diisi." });

  const whtAmt = Math.round(parseFloat(whtAmountRaw ?? "0") * 100) / 100 || 0;
  const netBankAmt = Math.round((amt - whtAmt) * 100) / 100;

  const escName = vendorName.replace(/'/g, "''");
  const escRef  = reference ? `'${String(reference).replace(/'/g, "''")}'` : "NULL";
  const escNotes = notes ? `'${String(notes).replace(/'/g, "''")}'` : "NULL";

  // ── Phase 1: INSERT dengan retry untuk nomor unik ─────────────────────────
  let inserted: Awaited<ReturnType<typeof db.execute>> | null = null;
  let paymentNumber = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    paymentNumber = await nextPaymentNumber(companyId, attempt);
    try {
      inserted = await db.execute(sql.raw(`
        INSERT INTO vendor_payments
          (company_id, payment_number, supplier_id, vendor_name, payment_date, amount,
           payment_method, reference, purchase_document_id, status, notes,
           wht_amount, created_by_id)
        VALUES
          (${companyId ?? "NULL"}, '${paymentNumber}',
           ${supplierId ? parseInt(supplierId) : "NULL"},
           '${escName}', '${paymentDate}', ${amt},
           '${paymentMethod}', ${escRef},
           ${purchaseDocumentId ? parseInt(purchaseDocumentId) : "NULL"},
           'paid', ${escNotes},
           ${whtAmt},
           ${userId ? `'${userId}'` : "NULL"})
        RETURNING *
      `));
      break;
    } catch (e: any) {
      const isUnique = e?.code === "23505" || String(e?.message ?? e).includes("unique");
      if (isUnique && attempt < 4) continue;
      throw e;
    }
  }
  if (!inserted) throw new Error("Gagal menyimpan pembayaran vendor setelah 5 percobaan");
  const payId = (inserted.rows[0] as any).id as number;

  // ── Phase 2: Post jurnal dengan paymentNumber yang sudah pasti ────────────
  // DR Hutang Usaha (AP) / CR Bank (net) [/ CR WHT Payable jika ada WHT]
  let journalEntryId: number | null = null;
  let whtAccountId: number | null = null;
  try {
    // AP account (2-1010)
    const apCoa = await db.select().from(chartOfAccountsTable)
      .where(sql`code LIKE '2-1010%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1);
    // Bank or Cash
    const paymentCoa = paymentMethod === "cash"
      ? await db.select().from(chartOfAccountsTable)
          .where(sql`code LIKE '1-1010%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1)
      : await db.select().from(chartOfAccountsTable)
          .where(sql`code LIKE '1-1020%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1);
    // WHT Payable account (2-1030 — Hutang Pajak Lainnya)
    const whtCoa = whtAmt > 0
      ? await db.select().from(chartOfAccountsTable)
          .where(sql`code LIKE '2-1030%' AND (company_id = ${companyId} OR company_id IS NULL)`).limit(1)
      : [];
    whtAccountId = whtCoa[0]?.id ?? null;

    if (apCoa[0] && paymentCoa[0]) {
      const bankJournal = paymentMethod === "cash"
        ? await db.execute(sql.raw(`SELECT id FROM accounting_journals WHERE type='cash' AND (company_id=${companyId} OR code LIKE '%CST%') LIMIT 1`))
        : await db.execute(sql.raw(`SELECT id FROM accounting_journals WHERE type='bank' AND (company_id=${companyId} OR code LIKE '%CST%') LIMIT 1`));
      const journalId = (bankJournal.rows[0] as any)?.id;

      if (journalId) {
        const lines: Array<{ accountId: number; debit: number; credit: number; description: string }> = [
          { accountId: apCoa[0].id,      debit: amt,        credit: 0,          description: `Hutang ${vendorName}` },
          { accountId: paymentCoa[0].id, debit: 0,          credit: netBankAmt, description: paymentMethod === "cash" ? "Kas" : "Bank" },
        ];
        // WHT split: CR WHT Payable untuk PPh yang dipotong di sumber
        if (whtAmt > 0 && whtAccountId) {
          lines.push({ accountId: whtAccountId, debit: 0, credit: whtAmt, description: `WHT Payable — ${vendorName}` });
        }
        const entry = await postEntry(
          {
            journalId,
            date: new Date(paymentDate),
            ref: paymentNumber,
            description: `Pembayaran Vendor ${vendorName} — ${paymentNumber}${whtAmt > 0 ? ` (WHT: ${whtAmt.toLocaleString("id-ID")})` : ""}`,
            source: "purchase_payment",
            companyId: companyId ?? 1,
            lines,
          },
          paymentMethod === "cash" ? "KAS" : "BNK",
        );
        journalEntryId = entry.id;
      }
    }
    // Patch journal_entry_id + wht_account_id ke record yang sudah di-INSERT
    if (journalEntryId || whtAccountId) {
      await db.execute(sql.raw(`
        UPDATE vendor_payments
        SET journal_entry_id = ${journalEntryId ?? "NULL"},
            wht_account_id   = ${whtAccountId ?? "NULL"}
        WHERE id = ${payId}
      `));
    }
  } catch {}

  // Ambil row final setelah patch
  const finalRow = await db.execute(sql.raw(`SELECT * FROM vendor_payments WHERE id = ${payId}`));
  const row = (finalRow.rows[0] ?? inserted.rows[0]) as Record<string, unknown>;
  audit(req as Request, {
    action: "payment",
    module: "payment",
    resourceId: paymentNumber,
    after: row,
    companyId: companyId ?? null,
  });

  // Auto-update purchase_documents.payment_status jika terhubung ke PO
  if (purchaseDocumentId) {
    void recalculateVendorDocPaymentStatus(parseInt(purchaseDocumentId)).catch(() => {});
  }

  return res.status(201).json(row);
});

// ─── DELETE /api/vendor-payments/:id ─────────────────────────────────────────
router.delete("/:id", async (req: Request, res) => {
  await runMigration();
  const id = parseInt(req.params.id);
  const result = await db.execute(sql.raw(`SELECT * FROM vendor_payments WHERE id = ${id}`));
  if (!result.rows[0]) return res.status(404).json({ message: "Pembayaran tidak ditemukan." });
  const before = result.rows[0] as Record<string, unknown>;
  await db.execute(sql.raw(`DELETE FROM vendor_payments WHERE id = ${id}`));
  audit(req as Request, {
    action: "delete",
    module: "payment",
    resourceId: String((before.payment_number as string | undefined) ?? id),
    before,
  });

  // Re-recalculate setelah hapus — status mungkin kembali ke partial/unpaid
  const purchaseDocId = before.purchase_document_id as number | null | undefined;
  if (purchaseDocId) {
    void recalculateVendorDocPaymentStatus(purchaseDocId).catch(() => {});
  }

  return res.json({ ok: true });
});

export default router;
