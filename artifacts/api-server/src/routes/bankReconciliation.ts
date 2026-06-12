import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { audit } from "../lib/unifiedAudit.js";
import { logger } from "../lib/logger.js";
import * as xlsx from "xlsx";
import multer from "multer";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// ─── Inline migration ─────────────────────────────────────────────────────────
let migrated = false;
async function runMigration() {
  if (migrated) return;
  await db.execute(sql.raw(`
    CREATE TABLE IF NOT EXISTS bank_mutations (
      id SERIAL PRIMARY KEY,
      bank_account_id INTEGER,
      transaction_date DATE NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      credit_amount NUMERIC(16,2) NOT NULL DEFAULT 0,
      debit_amount  NUMERIC(16,2) NOT NULL DEFAULT 0,
      amount        NUMERIC(16,2) NOT NULL DEFAULT 0,
      direction     TEXT NOT NULL DEFAULT 'IN',
      mutation_key  TEXT NOT NULL,
      normalized_description TEXT NOT NULL DEFAULT '',
      provider_name  TEXT,
      provider_order_id TEXT,
      raw_payload   JSONB,
      status        TEXT NOT NULL DEFAULT 'unmatched',
      matched_payment_id INTEGER,
      matched_order_id   INTEGER,
      uploaded_proof_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bank_reconciliation_matches (
      id SERIAL PRIMARY KEY,
      mutation_id   INTEGER NOT NULL REFERENCES bank_mutations(id) ON DELETE CASCADE,
      candidate_type TEXT NOT NULL,
      candidate_id   INTEGER NOT NULL,
      match_score    INTEGER NOT NULL DEFAULT 0,
      match_reason   TEXT NOT NULL DEFAULT '',
      amount_match   BOOLEAN NOT NULL DEFAULT FALSE,
      date_match     BOOLEAN NOT NULL DEFAULT FALSE,
      name_match     BOOLEAN NOT NULL DEFAULT FALSE,
      order_id_match BOOLEAN NOT NULL DEFAULT FALSE,
      proof_match    BOOLEAN NOT NULL DEFAULT FALSE,
      status         TEXT NOT NULL DEFAULT 'candidate',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS bank_reconciliation_audit (
      id SERIAL PRIMARY KEY,
      mutation_id  INTEGER,
      action       TEXT NOT NULL,
      actor        TEXT,
      meta         JSONB,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS bm_mutation_key_idx  ON bank_mutations(mutation_key);
    CREATE INDEX IF NOT EXISTS bm_status_idx        ON bank_mutations(status);
    CREATE INDEX IF NOT EXISTS bm_date_idx          ON bank_mutations(transaction_date);
    CREATE INDEX IF NOT EXISTS brm_mutation_idx     ON bank_reconciliation_matches(mutation_id);
  `));
  migrated = true;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDescription(raw: string): string {
  return (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GOPAY_ORDER_RE = /\b(ID\d{12,20}[A-Z]{0,4})\b/gi;

function extractProviderOrderId(desc: string): string | null {
  const m = GOPAY_ORDER_RE.exec(desc);
  GOPAY_ORDER_RE.lastIndex = 0;
  return m ? m[1].toUpperCase() : null;
}

function detectProvider(desc: string): string | null {
  const d = desc.toUpperCase();
  if (d.includes("DOMPET ANAK BANGSA") || d.includes("GOPAY") || d.includes("PT DOMPET")) return "GOPAY";
  if (d.includes("OVO")) return "OVO";
  if (d.includes("DANA")) return "DANA";
  if (d.includes("LINKAJA") || d.includes("LINK AJA")) return "LINKAJA";
  if (d.includes("SHOPEE")) return "SHOPEEPAY";
  if (d.includes("QRIS")) return "QRIS";
  return null;
}

function buildMutationKey(dateStr: string, amount: number, direction: "IN" | "OUT"): string {
  const d = new Date(dateStr);
  const yyyymmdd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  return `${yyyymmdd}_${Math.round(amount)}_${direction}`;
}

function parseAmount(val: unknown): number {
  if (!val && val !== 0) return 0;
  const s = String(val).replace(/[^0-9.,\-]/g, "").replace(/\./g, "").replace(",", ".");
  return Math.abs(parseFloat(s) || 0);
}

interface ParsedRow {
  transaction_date: string;
  description: string;
  credit_amount: number;
  debit_amount: number;
  amount: number;
  direction: "IN" | "OUT";
  mutation_key: string;
  normalized_description: string;
  provider_name: string | null;
  provider_order_id: string | null;
}

function parseRows(rows: Record<string, unknown>[]): ParsedRow[] {
  return rows.map((row) => {
    const keys = Object.keys(row).map((k) => k.toLowerCase().trim());
    const get = (candidates: string[]) => {
      for (const c of candidates) {
        const k = keys.find((k) => k.includes(c));
        if (k) return String(row[Object.keys(row)[keys.indexOf(k)]] ?? "").trim();
      }
      return "";
    };

    const rawDate   = get(["tanggal", "date", "tgl"]);
    const rawDesc   = get(["keterangan", "description", "desc", "ket", "narasi"]);
    const rawCredit = get(["kredit", "credit", "masuk", "cr", "in"]);
    const rawDebit  = get(["debit", "keluar", "db", "out"]);
    const rawAmt    = get(["nominal", "amount", "jumlah"]);

    let parsedDate = rawDate;
    try {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) parsedDate = d.toISOString().split("T")[0];
    } catch {}

    const credit = parseAmount(rawCredit);
    const debit  = parseAmount(rawDebit);
    let amount = credit || debit;
    if (!amount) amount = parseAmount(rawAmt);
    const direction: "IN" | "OUT" = credit > 0 ? "IN" : "OUT";

    return {
      transaction_date: parsedDate,
      description: rawDesc,
      credit_amount: credit,
      debit_amount: debit,
      amount,
      direction,
      mutation_key: buildMutationKey(parsedDate, amount, direction),
      normalized_description: normalizeDescription(rawDesc),
      provider_name: detectProvider(rawDesc),
      provider_order_id: extractProviderOrderId(rawDesc),
    };
  }).filter((r) => r.transaction_date && r.amount > 0);
}

async function auditLog(mutationId: number | null, action: string, actor: string, meta: object) {
  try {
    await db.execute(sql.raw(
      `INSERT INTO bank_reconciliation_audit(mutation_id,action,actor,meta) VALUES(${mutationId ?? "NULL"},'${action.replace(/'/g, "''")}','${actor.replace(/'/g, "''")}','${JSON.stringify(meta).replace(/'/g, "''")}')`,
    ));
  } catch (e) {
    logger.warn({ err: e }, "[bankRecon] auditLog failed");
  }
}

// ─── Matching Engine ──────────────────────────────────────────────────────────

interface MatchCandidate {
  id: number;
  type: "payment" | "order" | "invoice" | "expense";
  amount: number;
  date: string;
  name: string;
  ref: string | null;
  proof_ref: string | null;
}

async function fetchCandidates(mutation: ParsedRow & { id: number }): Promise<MatchCandidate[]> {
  const candidates: MatchCandidate[] = [];

  // ── payments (accounting_payments) ──
  try {
    const { rows: payments } = await db.execute(sql.raw(`
      SELECT ap.id, ap.amount, ap.payment_date::text as date,
             COALESCE(c.name, s.name, ap.notes, '') as name,
             ap.reference as ref, NULL as proof_ref
      FROM   accounting_payments ap
      LEFT JOIN customers c ON c.id = ap.customer_id
      LEFT JOIN suppliers s ON s.id = ap.supplier_id
      WHERE  ABS(ap.amount - ${mutation.amount}) < 0.01
         AND ap.payment_date BETWEEN '${mutation.transaction_date}'::date - 3 AND '${mutation.transaction_date}'::date + 3
    `));
    for (const p of payments as any[]) {
      candidates.push({ id: p.id, type: "payment", amount: Number(p.amount), date: p.date, name: p.name ?? "", ref: p.ref, proof_ref: p.proof_ref });
    }
  } catch {}

  // ── orders (logistic_orders) ──
  try {
    const { rows: orders } = await db.execute(sql.raw(`
      SELECT lo.id, lo.total_price as amount, lo.created_at::date::text as date,
             COALESCE(lo.sender_name, '') as name,
             lo.order_number as ref, NULL as proof_ref
      FROM   logistic_orders lo
      WHERE  ABS(lo.total_price - ${mutation.amount}) < 0.01
         AND lo.created_at::date BETWEEN '${mutation.transaction_date}'::date - 3 AND '${mutation.transaction_date}'::date + 3
    `));
    for (const o of orders as any[]) {
      candidates.push({ id: o.id, type: "order", amount: Number(o.amount), date: o.date, name: o.name ?? "", ref: o.ref, proof_ref: o.proof_ref });
    }
  } catch {}

  // ── invoices (sales_documents where type=invoice) ──
  try {
    const { rows: invoices } = await db.execute(sql.raw(`
      SELECT sd.id, sd.total_amount as amount, sd.issue_date::text as date,
             COALESCE(c.name, '') as name, sd.doc_number as ref, NULL as proof_ref
      FROM   sales_documents sd
      LEFT JOIN customers c ON c.id = sd.customer_id
      WHERE  sd.doc_type = 'invoice'
         AND ABS(sd.total_amount - ${mutation.amount}) < 0.01
         AND sd.issue_date BETWEEN '${mutation.transaction_date}'::date - 3 AND '${mutation.transaction_date}'::date + 3
    `));
    for (const i of invoices as any[]) {
      candidates.push({ id: i.id, type: "invoice", amount: Number(i.amount), date: i.date, name: i.name ?? "", ref: i.ref, proof_ref: i.proof_ref });
    }
  } catch {}

  // ── expenses ──
  try {
    const { rows: exps } = await db.execute(sql.raw(`
      SELECT e.id, e.amount, e.expense_date::text as date,
             COALESCE(e.description, '') as name, e.reference_number as ref, NULL as proof_ref
      FROM   expenses e
      WHERE  ABS(e.amount - ${mutation.amount}) < 0.01
         AND e.expense_date BETWEEN '${mutation.transaction_date}'::date - 3 AND '${mutation.transaction_date}'::date + 3
    `));
    for (const e of exps as any[]) {
      candidates.push({ id: e.id, type: "expense", amount: Number(e.amount), date: e.date, name: e.name ?? "", ref: e.ref, proof_ref: e.proof_ref });
    }
  } catch {}

  return candidates;
}

interface ScoredMatch {
  candidate: MatchCandidate;
  score: number;
  reason: string[];
  amount_match: boolean;
  date_match: boolean;
  name_match: boolean;
  order_id_match: boolean;
  proof_match: boolean;
}

function scoreCandidate(mutation: ParsedRow & { id: number }, cand: MatchCandidate): ScoredMatch {
  let score = 0;
  const reason: string[] = [];
  const nd = mutation.normalized_description;

  const amountMatch = Math.abs(cand.amount - mutation.amount) < 0.01;
  if (amountMatch) { score += 40; reason.push("nominal sama"); }

  const mDate = new Date(mutation.transaction_date).getTime();
  const cDate = new Date(cand.date).getTime();
  const diffDays = Math.abs(mDate - cDate) / 86400000;
  const dateMatch = diffDays === 0;
  if (diffDays === 0)       { score += 30; reason.push("tanggal sama"); }
  else if (diffDays <= 1)   { score += 20; reason.push("tanggal beda 1 hari"); }
  else if (diffDays <= 3)   { score += 10; reason.push("tanggal beda ≤3 hari"); }

  const nameMatch = cand.name && nd.includes(normalizeDescription(cand.name));
  if (nameMatch) { score += 15; reason.push(`nama "${cand.name}" cocok di keterangan`); }

  let orderIdMatch = false;
  if (mutation.provider_order_id && cand.ref) {
    const candRefNorm = cand.ref.toUpperCase();
    if (candRefNorm === mutation.provider_order_id || candRefNorm.includes(mutation.provider_order_id)) {
      orderIdMatch = true; score += 20; reason.push("Order ID cocok");
    }
  }
  if (mutation.provider_order_id && cand.proof_ref) {
    const proofNorm = cand.proof_ref.toUpperCase();
    if (proofNorm.includes(mutation.provider_order_id)) {
      orderIdMatch = true; score += 15; reason.push("Order ID cocok di bukti transfer");
    }
  }

  let proofMatch = false;
  if (cand.proof_ref && nd.includes(normalizeDescription(cand.proof_ref))) {
    proofMatch = true; score += 10; reason.push("referensi bukti transfer cocok");
  }

  return {
    candidate: cand,
    score,
    reason,
    amount_match: amountMatch,
    date_match: dateMatch,
    name_match: !!nameMatch,
    order_id_match: orderIdMatch,
    proof_match: proofMatch,
  };
}

async function runMatchingForMutation(mutation: ParsedRow & { id: number }, actor: string) {
  const candidates = await fetchCandidates(mutation);
  if (!candidates.length) return;

  const scored: ScoredMatch[] = candidates.map((c) => scoreCandidate(mutation, c));
  scored.sort((a, b) => b.score - a.score);

  let newStatus = "unmatched";
  let autoApproved = false;

  for (const s of scored) {
    const reasonStr = s.reason.join("; ");
    await db.execute(sql.raw(`
      INSERT INTO bank_reconciliation_matches
        (mutation_id, candidate_type, candidate_id, match_score, match_reason,
         amount_match, date_match, name_match, order_id_match, proof_match, status)
      VALUES
        (${mutation.id}, '${s.candidate.type}', ${s.candidate.id}, ${s.score},
         '${reasonStr.replace(/'/g, "''")}',
         ${s.amount_match}, ${s.date_match}, ${s.name_match}, ${s.order_id_match}, ${s.proof_match},
         'candidate')
      ON CONFLICT DO NOTHING
    `));
  }

  const best = scored[0];
  if (best) {
    if (best.score >= 95) {
      newStatus = "matched";
      autoApproved = true;
      await db.execute(sql.raw(`
        UPDATE bank_reconciliation_matches
        SET status = 'approved'
        WHERE mutation_id = ${mutation.id}
          AND candidate_type = '${best.candidate.type}'
          AND candidate_id = ${best.candidate.id}
      `));
    } else if (best.score >= 80) {
      newStatus = "matched";
    }
  }

  await db.execute(sql.raw(`
    UPDATE bank_mutations SET status = '${newStatus}', updated_at = NOW() WHERE id = ${mutation.id}
  `));

  await auditLog(mutation.id, autoApproved ? "auto_match" : "candidates_found", actor, {
    count: scored.length, best_score: best?.score, best_type: best?.candidate.type,
  });
}

// ─── Multer setup ─────────────────────────────────────────────────────────────
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// ─── POST /api/bank-reconciliation/import ─────────────────────────────────────
router.post("/import", upload.single("file"), async (req, res) => {
  await runMigration();
  try {
    let rows: Record<string, unknown>[] = [];

    if (req.file) {
      // Excel / CSV upload
      const wb = xlsx.read(req.file.buffer, { type: "buffer", cellDates: true });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = xlsx.utils.sheet_to_json(ws, { defval: "" }) as Record<string, unknown>[];
    } else if (req.body?.rows && Array.isArray(req.body.rows)) {
      // JSON payload from Google Sheets integration
      rows = req.body.rows;
    } else {
      return res.status(400).json({ error: "Kirim file (Excel/CSV) atau rows JSON dari Google Sheet" });
    }

    const parsed = parseRows(rows);
    if (!parsed.length) return res.status(400).json({ error: "Tidak ada baris valid ditemukan" });

    let imported = 0, duplicates = 0;

    for (const p of parsed) {
      // Check duplicate key
      const { rows: existing } = await db.execute(sql.raw(
        `SELECT id FROM bank_mutations WHERE mutation_key = '${p.mutation_key.replace(/'/g, "''")}'`
      ));

      if (existing.length > 0) {
        // Duplicate: mark both as duplicate_need_review
        await db.execute(sql.raw(
          `UPDATE bank_mutations SET status = 'duplicate_need_review', updated_at = NOW() WHERE mutation_key = '${p.mutation_key.replace(/'/g, "''")}'`
        ));
        await auditLog(Number((existing[0] as any).id), "duplicate_detected", (req as any).user?.email ?? "system", { key: p.mutation_key });
        duplicates++;
      }

      const { rows: inserted } = await db.execute(sql.raw(`
        INSERT INTO bank_mutations
          (transaction_date, description, credit_amount, debit_amount, amount, direction,
           mutation_key, normalized_description, provider_name, provider_order_id,
           status, raw_payload)
        VALUES (
          '${p.transaction_date}', '${p.description.replace(/'/g, "''")}',
          ${p.credit_amount}, ${p.debit_amount}, ${p.amount}, '${p.direction}',
          '${p.mutation_key}', '${p.normalized_description.replace(/'/g, "''")}',
          ${p.provider_name ? `'${p.provider_name}'` : "NULL"},
          ${p.provider_order_id ? `'${p.provider_order_id}'` : "NULL"},
          '${existing.length > 0 ? "duplicate_need_review" : "unmatched"}',
          '${JSON.stringify(p).replace(/'/g, "''")}'
        )
        RETURNING id
      `));

      imported++;
      if (inserted[0] && existing.length === 0) {
        await auditLog(Number((inserted[0] as any).id), "import", (req as any).user?.email ?? "system", { key: p.mutation_key });
      }
    }

    audit(req, { action: "import", module: "accounting", resourceId: `bank-recon-${Date.now()}`, after: { imported, duplicates } });
    return res.json({ ok: true, imported, duplicates, total: parsed.length });
  } catch (e: any) {
    logger.error({ err: e }, "[bankRecon] import error");
    return res.status(500).json({ error: e.message });
  }
});

// ─── GET /api/bank-reconciliation/mutations ───────────────────────────────────
router.get("/mutations", async (req, res) => {
  await runMigration();
  const { status, from, to, direction, provider, search, limit = "100", offset = "0" } = req.query as Record<string, string>;

  let where = "WHERE 1=1";
  if (status && status !== "all")     where += ` AND bm.status = '${status}'`;
  if (direction && direction !== "all") where += ` AND bm.direction = '${direction}'`;
  if (provider && provider !== "all")  where += ` AND bm.provider_name = '${provider}'`;
  if (from)  where += ` AND bm.transaction_date >= '${from}'`;
  if (to)    where += ` AND bm.transaction_date <= '${to}'`;
  if (search) {
    const s = search.replace(/'/g, "''");
    where += ` AND (bm.description ILIKE '%${s}%' OR bm.normalized_description ILIKE '%${s}%' OR bm.provider_order_id ILIKE '%${s}%' OR bm.mutation_key ILIKE '%${s}%')`;
  }

  const { rows } = await db.execute(sql.raw(`
    SELECT bm.*,
      (SELECT json_agg(m ORDER BY m.match_score DESC)
       FROM bank_reconciliation_matches m
       WHERE m.mutation_id = bm.id
      ) as candidates
    FROM bank_mutations bm
    ${where}
    ORDER BY bm.transaction_date DESC, bm.id DESC
    LIMIT ${parseInt(limit)} OFFSET ${parseInt(offset)}
  `));

  const { rows: countRows } = await db.execute(sql.raw(
    `SELECT COUNT(*) as total FROM bank_mutations bm ${where}`
  ));

  return res.json({ mutations: rows, total: Number((countRows[0] as any)?.total ?? 0) });
});

// ─── GET /api/bank-reconciliation/matches/:mutationId ────────────────────────
router.get("/matches/:mutationId", async (req, res) => {
  await runMigration();
  const { rows } = await db.execute(sql.raw(
    `SELECT * FROM bank_reconciliation_matches WHERE mutation_id = ${parseInt(req.params.mutationId)} ORDER BY match_score DESC`
  ));
  return res.json({ matches: rows });
});

// ─── POST /api/bank-reconciliation/:mutationId/approve ───────────────────────
router.post("/:mutationId/approve", async (req, res) => {
  await runMigration();
  const mutId = parseInt(req.params.mutationId);
  const { match_id, candidate_type, candidate_id, note } = req.body;
  const actor = (req as any).user?.email ?? "admin";

  await db.execute(sql.raw(
    `UPDATE bank_mutations SET status = 'approved', updated_at = NOW() WHERE id = ${mutId}`
  ));

  if (match_id) {
    await db.execute(sql.raw(
      `UPDATE bank_reconciliation_matches SET status = 'approved' WHERE id = ${match_id}`
    ));
  } else if (candidate_type && candidate_id) {
    // Manual assign — upsert a match record
    await db.execute(sql.raw(`
      INSERT INTO bank_reconciliation_matches
        (mutation_id, candidate_type, candidate_id, match_score, match_reason, status)
      VALUES (${mutId}, '${candidate_type}', ${candidate_id}, 100, 'manual approve', 'approved')
    `));
  }

  await auditLog(mutId, "approve", actor, { match_id, candidate_type, candidate_id, note });
  audit(req, { action: "approve", module: "accounting", resourceId: `bank-mutation-${mutId}` });
  return res.json({ ok: true });
});

// ─── POST /api/bank-reconciliation/:mutationId/reject ───────────────────────
router.post("/:mutationId/reject", async (req, res) => {
  await runMigration();
  const mutId = parseInt(req.params.mutationId);
  const { note } = req.body;
  const actor = (req as any).user?.email ?? "admin";

  await db.execute(sql.raw(
    `UPDATE bank_mutations SET status = 'rejected', updated_at = NOW() WHERE id = ${mutId}`
  ));
  await db.execute(sql.raw(
    `UPDATE bank_reconciliation_matches SET status = 'rejected' WHERE mutation_id = ${mutId} AND status = 'candidate'`
  ));

  await auditLog(mutId, "reject", actor, { note });
  audit(req, { action: "reject", module: "accounting", resourceId: `bank-mutation-${mutId}` });
  return res.json({ ok: true });
});

// ─── POST /api/bank-reconciliation/run-matching ───────────────────────────────
router.post("/run-matching", async (req, res) => {
  await runMigration();
  const actor = (req as any).user?.email ?? "system";
  const { ids } = req.body as { ids?: number[] };

  let whereClause = "status = 'unmatched'";
  if (ids?.length) whereClause = `id = ANY(ARRAY[${ids.join(",")}])`;

  const { rows: mutations } = await db.execute(sql.raw(
    `SELECT * FROM bank_mutations WHERE ${whereClause} ORDER BY transaction_date DESC LIMIT 500`
  ));

  let processed = 0;
  for (const m of mutations as any[]) {
    try {
      await runMatchingForMutation({
        id: m.id, transaction_date: m.transaction_date, description: m.description,
        credit_amount: Number(m.credit_amount), debit_amount: Number(m.debit_amount),
        amount: Number(m.amount), direction: m.direction,
        mutation_key: m.mutation_key, normalized_description: m.normalized_description,
        provider_name: m.provider_name, provider_order_id: m.provider_order_id,
      }, actor);
      processed++;
    } catch (e) {
      logger.warn({ err: e, id: m.id }, "[bankRecon] matching error for mutation");
    }
  }

  return res.json({ ok: true, processed });
});

// ─── GET /api/bank-reconciliation/summary ────────────────────────────────────
router.get("/summary", async (req, res) => {
  await runMigration();
  const { rows } = await db.execute(sql.raw(`
    SELECT status, COUNT(*) as count, SUM(amount) as total_amount
    FROM bank_mutations
    GROUP BY status
  `));
  return res.json({ summary: rows });
});

// ─── DELETE /api/bank-reconciliation/:mutationId ──────────────────────────────
router.delete("/:mutationId", async (req, res) => {
  await runMigration();
  const mutId = parseInt(req.params.mutationId);
  const actor = (req as any).user?.email ?? "admin";
  await db.execute(sql.raw(`DELETE FROM bank_mutations WHERE id = ${mutId}`));
  await auditLog(mutId, "delete", actor, {});
  return res.json({ ok: true });
});

export { router as bankReconciliationRouter };
