import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { seedDefaultTaxRules } from "../lib/taxRulesMigration.js";
import { logger } from "../lib/logger.js";
import { audit } from "../lib/unifiedAudit.js";
import { validateNpwp, formatNpwp, stripNpwp } from "../lib/npwpValidator.js";
import { validateFakturPajak, formatFaktur } from "../lib/fakturPajakValidator.js";
import { calculatePph21, calculatePph21NonPegawai, PTKP_OPTIONS, type PtkpStatus } from "../lib/pph21Calculator.js";

const router = Router();

router.use(async (req, res, next) => {
  const ok = await requireAdmin(req, res);
  if (ok) next();
});

function resolveCompanyId(req: any): number {
  return Number(req.query.companyId ?? req.body?.companyId ?? 1) || 1;
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── GET /api/tax/dashboard ───────────────────────────────────────────────────
router.get("/dashboard", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const period = (req.query.period as string) || currentPeriod();

  await seedDefaultTaxRules(companyId);

  const [ppnOut, ppnIn, pphRows, pendingCount, noNpwpCount, noInvoiceCount] = await Promise.all([
    db.execute(sql`
      SELECT COALESCE(SUM(tax_amount), 0)::numeric AS total
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period = ${period}
        AND (tax_name ILIKE '%ppn%' OR tax_name ILIKE '%vat%')
        AND (direction = 'output' OR direction IS NULL)
    `),
    db.execute(sql`
      SELECT COALESCE(SUM(tax_amount), 0)::numeric AS total
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period = ${period}
        AND (tax_name ILIKE '%ppn%masukan%' OR tax_name ILIKE '%vat%input%')
        AND direction = 'input'
    `),
    db.execute(sql`
      SELECT tax_name, COALESCE(SUM(tax_amount),0)::numeric AS total, COUNT(*)::int AS cnt
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period = ${period}
        AND tax_name NOT ILIKE '%ppn%'
      GROUP BY tax_name
      ORDER BY total DESC
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period = ${period} AND status = 'pending'
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period = ${period} AND npwp IS NULL
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS cnt
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period = ${period}
        AND (tax_name ILIKE '%ppn%') AND tax_invoice_number IS NULL
    `),
  ]);

  const ppnKeluaran = Number((ppnOut.rows[0] as any).total);
  const ppnMasukan = Number((ppnIn.rows[0] as any).total);
  const ppnKurangBayar = ppnKeluaran - ppnMasukan;

  return res.json({
    period,
    ppnKeluaran,
    ppnMasukan,
    ppnKurangBayar,
    pphRows: pphRows.rows.map((r: any) => ({
      taxName: r.tax_name,
      total: Number(r.total),
      count: Number(r.cnt),
    })),
    pendingCount: Number((pendingCount.rows[0] as any).cnt),
    noNpwpCount: Number((noNpwpCount.rows[0] as any).cnt),
    noInvoiceCount: Number((noInvoiceCount.rows[0] as any).cnt),
  });
});

// ── GET /api/tax/rules ───────────────────────────────────────────────────────
router.get("/rules", async (req, res) => {
  const companyId = resolveCompanyId(req);
  await seedDefaultTaxRules(companyId);
  const rows = await db.execute(sql`
    SELECT * FROM tax_rules WHERE company_id = ${companyId} ORDER BY is_active DESC, transaction_type, name
  `);
  return res.json({ data: rows.rows });
});

// ── POST /api/tax/rules ──────────────────────────────────────────────────────
router.post("/rules", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { name, transaction_type, module_source, tax_type, tax_rate, tax_base_type, direction, is_active, effective_from, effective_to, notes } = req.body;
  if (!name || !transaction_type || !tax_type) {
    return res.status(400).json({ message: "name, transaction_type, tax_type wajib diisi" });
  }
  const [row] = (await db.execute(sql`
    INSERT INTO tax_rules (company_id, name, transaction_type, module_source, tax_type, tax_rate, tax_base_type, direction, is_active, effective_from, effective_to, notes)
    VALUES (
      ${companyId}, ${name}, ${transaction_type}, ${module_source ?? "all"}, ${tax_type},
      ${Number(tax_rate ?? 0)}, ${tax_base_type ?? "dpp"}, ${direction ?? "output"},
      ${is_active !== false}, ${effective_from ?? null}, ${effective_to ?? null}, ${notes ?? null}
    )
    RETURNING *
  `)).rows;
  audit(req, { action: "create", module: "tax", resourceId: String((row as any)?.id ?? "?"), after: row as Record<string, unknown>, companyId });
  return res.json({ ok: true, data: row });
});

// ── PUT /api/tax/rules/:id ────────────────────────────────────────────────────
router.put("/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, transaction_type, module_source, tax_type, tax_rate, tax_base_type, direction, is_active, effective_from, effective_to, notes } = req.body;
  const [before] = (await db.execute(sql`SELECT * FROM tax_rules WHERE id = ${id}`)).rows;
  const [row] = (await db.execute(sql`
    UPDATE tax_rules SET
      name = COALESCE(${name ?? null}, name),
      transaction_type = COALESCE(${transaction_type ?? null}, transaction_type),
      module_source = COALESCE(${module_source ?? null}, module_source),
      tax_type = COALESCE(${tax_type ?? null}, tax_type),
      tax_rate = COALESCE(${tax_rate != null ? Number(tax_rate) : null}, tax_rate),
      tax_base_type = COALESCE(${tax_base_type ?? null}, tax_base_type),
      direction = COALESCE(${direction ?? null}, direction),
      is_active = COALESCE(${is_active}, is_active),
      effective_from = ${effective_from ?? null},
      effective_to = ${effective_to ?? null},
      notes = ${notes ?? null},
      updated_at = NOW()
    WHERE id = ${id}
    RETURNING *
  `)).rows;
  if (!row) return res.status(404).json({ message: "Rule tidak ditemukan" });
  audit(req, { action: "update", module: "tax", resourceId: String(id), before: before as Record<string, unknown>, after: row as Record<string, unknown> });
  return res.json({ ok: true, data: row });
});

// ── DELETE /api/tax/rules/:id ─────────────────────────────────────────────────
router.delete("/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [before] = (await db.execute(sql`SELECT * FROM tax_rules WHERE id = ${id}`)).rows;
  await db.execute(sql`DELETE FROM tax_rules WHERE id = ${id}`);
  audit(req, { action: "delete", module: "tax", resourceId: String(id), before: before as Record<string, unknown> });
  return res.json({ ok: true });
});

// ── GET /api/tax/transactions ─────────────────────────────────────────────────
router.get("/transactions", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { period, status, tax_type, search, page = "1", limit = "50" } = req.query as Record<string, string>;
  const pageN = Math.max(1, parseInt(page) || 1);
  const limitN = Math.min(200, parseInt(limit) || 50);
  const offset = (pageN - 1) * limitN;

  const whereParts = [`company_id = ${companyId}`];
  if (period) whereParts.push(`period = '${period.replace(/'/g, "''")}'`);
  if (status) whereParts.push(`status = '${status.replace(/'/g, "''")}'`);
  if (tax_type) whereParts.push(`tax_name ILIKE '%${tax_type.replace(/'/g, "''")}%'`);
  if (search) whereParts.push(`(transaction_ref ILIKE '%${search.replace(/'/g, "''")}%' OR partner_name ILIKE '%${search.replace(/'/g, "''")}%')`);
  const where = whereParts.join(" AND ");

  const [rows, countRow] = await Promise.all([
    db.execute(sql.raw(`
      SELECT * FROM transaction_taxes WHERE ${where}
      ORDER BY created_at DESC LIMIT ${limitN} OFFSET ${offset}
    `)),
    db.execute(sql.raw(`SELECT COUNT(*)::int AS cnt FROM transaction_taxes WHERE ${where}`)),
  ]);

  return res.json({
    data: rows.rows.map((r: any) => ({
      ...r,
      baseAmount: Number(r.base_amount),
      taxAmount: Number(r.tax_amount),
      taxRate: Number(r.tax_rate),
    })),
    total: Number((countRow.rows[0] as any).cnt),
    page: pageN,
    limit: limitN,
  });
});

// ── GET /api/tax/ppn ──────────────────────────────────────────────────────────
router.get("/ppn", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { period_from, period_to, period } = req.query as Record<string, string>;

  const periodCond = period
    ? `AND period = '${period}'`
    : period_from && period_to
    ? `AND period >= '${period_from}' AND period <= '${period_to}'`
    : "";

  const [keluaran, masukan] = await Promise.all([
    db.execute(sql.raw(`
      SELECT period, transaction_type, transaction_ref, partner_name, npwp, tax_invoice_number,
             base_amount::numeric, tax_amount::numeric, tax_rate::numeric, status, created_at
      FROM transaction_taxes
      WHERE company_id = ${companyId}
        AND (tax_name ILIKE '%ppn%' OR tax_name ILIKE '%vat%')
        AND (direction = 'output' OR direction IS NULL)
        ${periodCond}
      ORDER BY period DESC, created_at DESC
      LIMIT 500
    `)),
    db.execute(sql.raw(`
      SELECT period, transaction_type, transaction_ref, partner_name, npwp, tax_invoice_number,
             base_amount::numeric, tax_amount::numeric, tax_rate::numeric, status, created_at
      FROM transaction_taxes
      WHERE company_id = ${companyId}
        AND tax_name ILIKE '%masukan%'
        AND direction = 'input'
        ${periodCond}
      ORDER BY period DESC, created_at DESC
      LIMIT 500
    `)),
  ]);

  return res.json({ keluaran: keluaran.rows, masukan: masukan.rows });
});

// ── GET /api/tax/pph ──────────────────────────────────────────────────────────
router.get("/pph", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { period } = req.query as Record<string, string>;
  const periodCond = period ? `AND period = '${period}'` : "";

  const rows = await db.execute(sql.raw(`
    SELECT period, tax_name, transaction_type, transaction_ref, partner_name, npwp,
           base_amount::numeric, tax_amount::numeric, tax_rate::numeric,
           direction, status, created_at
    FROM transaction_taxes
    WHERE company_id = ${companyId}
      AND tax_name NOT ILIKE '%ppn%'
      AND direction = 'withholding'
      ${periodCond}
    ORDER BY period DESC, tax_name, created_at DESC
    LIMIT 1000
  `));

  const grouped: Record<string, any> = {};
  for (const r of rows.rows as any[]) {
    const key = r.tax_name;
    if (!grouped[key]) grouped[key] = { taxName: key, rows: [], total: 0, count: 0 };
    grouped[key].rows.push(r);
    grouped[key].total += Number(r.tax_amount);
    grouped[key].count += 1;
  }
  return res.json({ groups: Object.values(grouped) });
});

// ── GET /api/tax/spt ──────────────────────────────────────────────────────────
router.get("/spt", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { year } = req.query as Record<string, string>;
  const y = year ?? new Date().getFullYear().toString();

  const rows = await db.execute(sql.raw(`
    SELECT
      period,
      tax_name,
      direction,
      COUNT(*)::int AS cnt,
      COALESCE(SUM(base_amount),0)::numeric AS total_base,
      COALESCE(SUM(tax_amount),0)::numeric AS total_tax,
      SUM(CASE WHEN status = 'paid' THEN tax_amount ELSE 0 END)::numeric AS paid,
      SUM(CASE WHEN status = 'reported' THEN tax_amount ELSE 0 END)::numeric AS reported,
      SUM(CASE WHEN status = 'pending' THEN tax_amount ELSE 0 END)::numeric AS pending
    FROM transaction_taxes
    WHERE company_id = ${companyId} AND period LIKE '${y}%'
    GROUP BY period, tax_name, direction
    ORDER BY period, tax_name
  `));

  return res.json({ year: y, data: rows.rows });
});

// ── GET /api/tax/export ───────────────────────────────────────────────────────
router.get("/export", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { period, period_from, period_to, type } = req.query as Record<string, string>;

  const whereParts = [`company_id = ${companyId}`];
  if (period) whereParts.push(`period = '${period}'`);
  if (period_from) whereParts.push(`period >= '${period_from}'`);
  if (period_to) whereParts.push(`period <= '${period_to}'`);
  if (type) whereParts.push(`tax_name ILIKE '%${type.replace(/'/g, "''")}%'`);
  const where = whereParts.join(" AND ");

  const rows = await db.execute(sql.raw(`
    SELECT * FROM transaction_taxes WHERE ${where} ORDER BY period, created_at
  `));

  const header = "Periode,Jenis Transaksi,Referensi,Partner,NPWP,No. Faktur Pajak,Nama Pajak,Tarif (%),DPP,Pajak,Arah,Status,Tanggal";
  const lines = (rows.rows as any[]).map((r) =>
    [
      r.period, r.transaction_type, r.transaction_ref ?? "", r.partner_name ?? "",
      r.npwp ?? "", r.tax_invoice_number ?? "", r.tax_name,
      Number(r.tax_rate).toFixed(3), Number(r.base_amount).toFixed(2),
      Number(r.tax_amount).toFixed(2), r.direction ?? "output", r.status,
      new Date(r.created_at).toISOString().slice(0, 10),
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","),
  );

  const csv = [header, ...lines].join("\n");
  const filename = `tax-export-${period ?? period_from ?? "all"}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  return res.send("\uFEFF" + csv);
});

// ── GET /api/tax/reconciliation ───────────────────────────────────────────────
router.get("/reconciliation", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { year } = req.query as Record<string, string>;
  const y = year ?? new Date().getFullYear().toString();

  const [summary, gaps, byPeriod] = await Promise.all([
    // Summary tahunan per jenis pajak
    db.execute(sql.raw(`
      SELECT
        tax_name,
        direction,
        COUNT(*)::int                                              AS total_tx,
        COALESCE(SUM(base_amount),0)::numeric                     AS total_dpp,
        COALESCE(SUM(tax_amount),0)::numeric                      AS total_tax,
        SUM(CASE WHEN status='paid'     THEN tax_amount ELSE 0 END)::numeric AS paid,
        SUM(CASE WHEN status='reported' THEN tax_amount ELSE 0 END)::numeric AS reported,
        SUM(CASE WHEN status='pending'  THEN tax_amount ELSE 0 END)::numeric AS pending,
        SUM(CASE WHEN npwp IS NULL OR npwp='' THEN 1 ELSE 0 END)::int       AS missing_npwp,
        SUM(CASE WHEN tax_invoice_number IS NULL OR tax_invoice_number='' THEN 1 ELSE 0 END)::int AS missing_faktur
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period LIKE '${y}%'
      GROUP BY tax_name, direction
      ORDER BY tax_name, direction
    `)),
    // Baris yang belum lengkap (missing NPWP atau faktur, masih pending)
    db.execute(sql.raw(`
      SELECT id, period, tax_name, direction, transaction_type, transaction_ref,
             partner_name, npwp, tax_invoice_number,
             base_amount::numeric, tax_amount::numeric, status, created_at
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period LIKE '${y}%'
        AND status = 'pending'
        AND (npwp IS NULL OR npwp = '' OR tax_invoice_number IS NULL OR tax_invoice_number = '')
      ORDER BY period DESC, tax_name, created_at DESC
      LIMIT 200
    `)),
    // Monthly breakdown per jenis pajak
    db.execute(sql.raw(`
      SELECT
        period,
        tax_name,
        direction,
        COUNT(*)::int                                              AS total_tx,
        COALESCE(SUM(tax_amount),0)::numeric                      AS total_tax,
        SUM(CASE WHEN status='paid'     THEN tax_amount ELSE 0 END)::numeric AS paid,
        SUM(CASE WHEN status='reported' THEN tax_amount ELSE 0 END)::numeric AS reported,
        SUM(CASE WHEN status='pending'  THEN tax_amount ELSE 0 END)::numeric AS pending,
        SUM(CASE WHEN npwp IS NULL OR npwp='' THEN 1 ELSE 0 END)::int       AS missing_npwp,
        SUM(CASE WHEN tax_invoice_number IS NULL OR tax_invoice_number='' THEN 1 ELSE 0 END)::int AS missing_faktur
      FROM transaction_taxes
      WHERE company_id = ${companyId} AND period LIKE '${y}%'
      GROUP BY period, tax_name, direction
      ORDER BY period DESC, tax_name
    `)),
  ]);

  return res.json({
    year: y,
    summary: summary.rows,
    gaps: gaps.rows,
    byPeriod: byPeriod.rows,
  });
});

// ── PATCH /api/tax/reconciliation/bulk-status ──────────────────────────────────
router.patch("/reconciliation/bulk-status", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { period, taxName, status } = req.body as {
    period?: string;
    taxName?: string;
    status: "pending" | "paid" | "reported";
  };

  if (!["pending", "paid", "reported"].includes(status)) {
    return res.status(400).json({ message: "status harus pending / paid / reported" });
  }

  const conds = [`company_id = ${companyId}`];
  if (period) conds.push(`period = '${period.replace(/'/g, "''")}'`);
  if (taxName) conds.push(`tax_name ILIKE '${taxName.replace(/'/g, "''")}%'`);

  const paidAtSet = status === "paid"     ? `, paid_at = NOW()`     : status === "reported" ? `, reported_at = NOW()` : "";
  const result = await db.execute(sql.raw(`
    UPDATE transaction_taxes
    SET status = '${status}', updated_at = NOW()${paidAtSet}
    WHERE ${conds.join(" AND ")}
    RETURNING id
  `));

  logger.info({ companyId, period, taxName, status, count: result.rows.length }, "[tax] bulk-status updated");
  return res.json({ ok: true, updated: result.rows.length });
});

// ── PATCH /api/tax/transactions/:id/npwp ──────────────────────────────────────
router.patch("/transactions/:id/npwp", async (req, res) => {
  const id = Number(req.params.id);
  const { npwp, taxInvoiceNumber, partnerName } = req.body;

  // Validasi format NPWP jika diisi
  if (npwp && npwp.trim()) {
    const npwpResult = validateNpwp(npwp);
    if (!npwpResult.valid) {
      return res.status(400).json({
        message: `NPWP tidak valid: ${npwpResult.error}`,
        field: "npwp",
        validation: npwpResult,
      });
    }
    // Normalisasi ke format standar XX.XXX.XXX.X-XXX.XXX
    req.body.npwp = npwpResult.formatted;
  }

  // Validasi format nomor faktur pajak jika diisi
  if (taxInvoiceNumber && taxInvoiceNumber.trim()) {
    const fakturResult = validateFakturPajak(taxInvoiceNumber);
    if (!fakturResult.valid) {
      return res.status(400).json({
        message: `Nomor faktur tidak valid: ${fakturResult.error}`,
        field: "taxInvoiceNumber",
        validation: fakturResult,
      });
    }
    // Normalisasi ke format standar KKK.SSS-TT.SSSSSSSS
    req.body.taxInvoiceNumber = fakturResult.formatted;
  }

  const normalizedNpwp = req.body.npwp ?? null;
  const normalizedFaktur = req.body.taxInvoiceNumber ?? null;

  const [before] = (await db.execute(sql`SELECT npwp, tax_invoice_number, partner_name FROM transaction_taxes WHERE id = ${id}`)).rows;
  await db.execute(sql`
    UPDATE transaction_taxes SET
      npwp = ${normalizedNpwp},
      tax_invoice_number = ${normalizedFaktur},
      partner_name = ${partnerName ?? null},
      updated_at = NOW()
    WHERE id = ${id}
  `);
  audit(req, {
    action: "update",
    module: "tax",
    resourceId: String(id),
    before: before as Record<string, unknown>,
    after: { npwp: normalizedNpwp, taxInvoiceNumber: normalizedFaktur, partnerName: partnerName ?? null },
  });
  return res.json({ ok: true, npwp: normalizedNpwp, taxInvoiceNumber: normalizedFaktur });
});

// ── POST /api/tax/validate/npwp ───────────────────────────────────────────────
router.post("/validate/npwp", (req, res) => {
  const { npwp, loose = false } = req.body;
  if (!npwp) return res.status(400).json({ message: "npwp wajib diisi" });

  const result = loose
    ? (() => {
        const digits = stripNpwp(String(npwp));
        if (digits.length !== 15)
          return { valid: false, formatted: null, normalized: digits.length > 0 ? digits : null, error: `NPWP harus 15 digit (ditemukan ${digits.length} digit)` };
        return { valid: true, formatted: formatNpwp(digits), normalized: digits };
      })()
    : validateNpwp(String(npwp));

  return res.json(result);
});

// ── POST /api/tax/validate/faktur ─────────────────────────────────────────────
router.post("/validate/faktur", (req, res) => {
  const { faktur } = req.body;
  if (!faktur) return res.status(400).json({ message: "faktur wajib diisi" });
  const result = validateFakturPajak(String(faktur));
  return res.json(result);
});

// ── POST /api/tax/pph21/calculate ─────────────────────────────────────────────
router.post("/pph21/calculate", (req, res) => {
  const {
    grossMonthly, ptkpStatus = "TK/0", useTer = false, nonPegawai = false,
    grossAmount, hasNpwp,
  } = req.body;

  if (nonPegawai) {
    if (!grossAmount) return res.status(400).json({ message: "grossAmount wajib untuk non-pegawai" });
    return res.json(calculatePph21NonPegawai({ grossAmount: Number(grossAmount), hasNpwp: hasNpwp !== false }));
  }

  if (grossMonthly == null) return res.status(400).json({ message: "grossMonthly wajib diisi" });
  const result = calculatePph21({
    grossMonthly: Number(grossMonthly),
    ptkpStatus: ptkpStatus as PtkpStatus,
    useTer: Boolean(useTer),
  });
  return res.json(result);
});

// ── GET /api/tax/pph21/ptkp-options ──────────────────────────────────────────
router.get("/pph21/ptkp-options", (_req, res) => {
  return res.json({ data: PTKP_OPTIONS });
});

// ── GET /api/tax/reconciliation/unmatched ─────────────────────────────────────
router.get("/reconciliation/unmatched", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { year, period } = req.query as Record<string, string>;
  const y = year ?? new Date().getFullYear().toString();
  const periodFilter = period ? `AND tt.period = '${period}'` : `AND tt.period LIKE '${y}%'`;

  const [orphaned, staleOpen, unmatchedEntries] = await Promise.all([

    // 1. transaction_taxes yang module_source-nya bukan 'manual'
    //    tetapi source_id tidak ada di tabel asal (orphaned)
    db.execute(sql.raw(`
      SELECT tt.id, tt.period, tt.tax_name, tt.direction,
             tt.transaction_type, tt.transaction_ref, tt.partner_name,
             tt.base_amount::numeric, tt.tax_amount::numeric, tt.status,
             tt.created_at,
             'orphaned' AS issue_type,
             'Transaksi sumber tidak ditemukan' AS issue_desc
      FROM transaction_taxes tt
      WHERE tt.company_id = ${companyId}
        ${periodFilter}
        AND tt.status = 'pending'
        AND tt.transaction_type = 'expense'
        AND NOT EXISTS (
          SELECT 1 FROM expenses e WHERE e.id = tt.source_id
        )
        AND tt.source_id IS NOT NULL
      LIMIT 100
    `)),

    // 2. transaction_taxes pending lebih dari 60 hari tanpa update
    db.execute(sql.raw(`
      SELECT tt.id, tt.period, tt.tax_name, tt.direction,
             tt.transaction_type, tt.transaction_ref, tt.partner_name,
             tt.base_amount::numeric, tt.tax_amount::numeric, tt.status,
             tt.created_at,
             'stale_pending' AS issue_type,
             'Pending > 60 hari tanpa update' AS issue_desc
      FROM transaction_taxes tt
      WHERE tt.company_id = ${companyId}
        ${periodFilter}
        AND tt.status = 'pending'
        AND tt.created_at < NOW() - INTERVAL '60 days'
      ORDER BY tt.created_at ASC
      LIMIT 200
    `)),

    // 3. accounting entry lines ke akun PPN/PPh (COA code 2-10xx atau 1-13xx)
    //    yang tidak punya transaction_taxes record dengan matching ref
    db.execute(sql.raw(`
      SELECT
        ae.id AS entry_id,
        ae.entry_number,
        ae.date::date,
        ae.description,
        ae.ref,
        ae.source,
        COALESCE(SUM(CASE WHEN ael.debit  > 0 THEN ael.debit  ELSE 0 END), 0)::numeric AS debit_total,
        COALESCE(SUM(CASE WHEN ael.credit > 0 THEN ael.credit ELSE 0 END), 0)::numeric AS credit_total,
        'unmatched_entry' AS issue_type,
        'Jurnal ke akun pajak tanpa transaction_taxes record' AS issue_desc
      FROM accounting_entries ae
      JOIN accounting_entry_lines ael ON ael.entry_id = ae.id
      JOIN chart_of_accounts coa ON coa.id = ael.account_id
      WHERE ae.company_id = ${companyId}
        AND ae.date >= '${y}-01-01'
        AND ae.date <  '${parseInt(y) + 1}-01-01'
        AND ae.status != 'voided'
        AND (coa.code LIKE '2-1030%' OR coa.code LIKE '2-1040%')
        AND NOT EXISTS (
          SELECT 1 FROM transaction_taxes tt
          WHERE tt.company_id = ${companyId}
            AND tt.transaction_ref = ae.ref
            AND tt.period LIKE '${y}%'
        )
      GROUP BY ae.id, ae.entry_number, ae.date, ae.description, ae.ref, ae.source
      ORDER BY ae.date DESC
      LIMIT 100
    `)),
  ]);

  const totalIssues =
    (orphaned.rows as unknown[]).length +
    (staleOpen.rows as unknown[]).length +
    (unmatchedEntries.rows as unknown[]).length;

  return res.json({
    year: y,
    totalIssues,
    orphaned: orphaned.rows,
    stalePending: staleOpen.rows,
    unmatchedEntries: unmatchedEntries.rows,
  });
});

// ── POST /api/tax/transactions/calculate ──────────────────────────────────────
router.post("/transactions/calculate", async (req, res) => {
  const companyId = resolveCompanyId(req);
  const { transactionType, baseAmount, moduleSource } = req.body;
  if (!transactionType || !baseAmount) {
    return res.status(400).json({ message: "transactionType dan baseAmount wajib diisi" });
  }

  const rules = await db.execute(sql.raw(`
    SELECT * FROM tax_rules
    WHERE company_id = ${companyId}
      AND is_active = true
      AND transaction_type = '${String(transactionType).replace(/'/g, "''")}'
    ORDER BY id
  `));

  const results = (rules.rows as any[]).map((rule) => ({
    ruleName: rule.name,
    taxType: rule.tax_type,
    taxRate: Number(rule.tax_rate),
    direction: rule.direction,
    taxBase: Number(baseAmount),
    taxAmount: Math.round(Number(baseAmount) * Number(rule.tax_rate)) / 100,
  }));

  return res.json({ results, totalTax: results.reduce((s, r) => s + r.taxAmount, 0) });
});


// ─────────────────────────────────────────────────────────────────────────────
// COMPLIANCE ENDPOINTS — laporan kepatuhan pajak
// ─────────────────────────────────────────────────────────────────────────────

function resolveCompanyIdAudit(req: import("express").Request): number {
  const q = (req.query as Record<string, string>).companyId;
  return q ? parseInt(q, 10) : 1;
}

// GET /api/tax/npwp-missing?companyId=N&period=YYYY-MM&limit=200
router.get("/npwp-missing", async (req, res) => {
  const companyId = resolveCompanyIdAudit(req);
  const { period, limit: limitQ, direction } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitQ ?? "200", 10), 500);

  try {
    const rows = await db.execute(sql`
      SELECT
        tt.id,
        tt.transaction_type,
        tt.transaction_id,
        tt.transaction_ref,
        tt.tax_name,
        tt.tax_amount::float,
        tt.base_amount::float,
        tt.direction,
        tt.partner_name,
        tt.npwp,
        tt.period,
        tt.status,
        tt.created_at
      FROM transaction_taxes tt
      WHERE tt.company_id = ${companyId}
        AND (tt.npwp IS NULL OR tt.npwp = '')
        ${period ? sql`AND tt.period = ${period}` : sql``}
        ${direction ? sql`AND tt.direction = ${direction}` : sql``}
      ORDER BY tt.created_at DESC
      LIMIT ${limit}
    `);
    return res.json({ total: rows.rows.length, items: rows.rows });
  } catch (err) {
    logger.error({ err }, "tax/npwp-missing: query failed");
    return res.status(500).json({ message: "Gagal memuat transaksi tanpa NPWP" });
  }
});

// GET /api/tax/faktur-missing?companyId=N&period=YYYY-MM&limit=200
// Cek PPN output tanpa faktur pajak, PPh withholding tanpa bukti potong
router.get("/faktur-missing", async (req, res) => {
  const companyId = resolveCompanyIdAudit(req);
  const { period, limit: limitQ } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitQ ?? "200", 10), 500);

  try {
    const [ppnRows, pphRows] = await Promise.all([
      // PPN output tanpa faktur pajak
      db.execute(sql`
        SELECT
          tt.id,
          tt.transaction_type,
          tt.transaction_id,
          tt.transaction_ref,
          tt.tax_name,
          tt.tax_amount::float,
          tt.base_amount::float,
          tt.direction,
          tt.partner_name,
          tt.npwp,
          tt.faktur_pajak_number,
          tt.period,
          tt.status,
          tt.created_at,
          'ppn_output' AS issue_type
        FROM transaction_taxes tt
        WHERE tt.company_id = ${companyId}
          AND tt.direction = 'output'
          AND (tt.faktur_pajak_number IS NULL OR tt.faktur_pajak_number = '')
          ${period ? sql`AND tt.period = ${period}` : sql``}
        ORDER BY tt.created_at DESC
        LIMIT ${limit}
      `),
      // PPh withholding tanpa bukti potong
      db.execute(sql`
        SELECT
          tt.id,
          tt.transaction_type,
          tt.transaction_id,
          tt.transaction_ref,
          tt.tax_name,
          tt.tax_amount::float,
          tt.base_amount::float,
          tt.direction,
          tt.partner_name,
          tt.npwp,
          tt.bukti_potong_number,
          tt.period,
          tt.status,
          tt.created_at,
          'pph_no_bukti_potong' AS issue_type
        FROM transaction_taxes tt
        WHERE tt.company_id = ${companyId}
          AND tt.direction = 'withholding'
          AND (tt.bukti_potong_number IS NULL OR tt.bukti_potong_number = '')
          ${period ? sql`AND tt.period = ${period}` : sql``}
        ORDER BY tt.created_at DESC
        LIMIT ${limit}
      `),
    ]);

    return res.json({
      total: ppnRows.rows.length + pphRows.rows.length,
      ppnOutputMissingFaktur:     ppnRows.rows,
      pphWithholdingMissingBukti: pphRows.rows,
    });
  } catch (err) {
    logger.error({ err }, "tax/faktur-missing: query failed");
    return res.status(500).json({ message: "Gagal memuat transaksi tanpa faktur/bukti potong" });
  }
});

// GET /api/tax/unpaid?companyId=N&period=YYYY-MM&direction=output|withholding&limit=200
router.get("/unpaid", async (req, res) => {
  const companyId = resolveCompanyIdAudit(req);
  const { period, direction, limit: limitQ } = req.query as Record<string, string>;
  const limit = Math.min(parseInt(limitQ ?? "200", 10), 500);

  try {
    const rows = await db.execute(sql`
      SELECT
        tt.id,
        tt.transaction_type,
        tt.transaction_id,
        tt.transaction_ref,
        tt.tax_name,
        tt.tax_amount::float,
        tt.base_amount::float,
        tt.direction,
        tt.partner_name,
        tt.npwp,
        tt.period,
        tt.status,
        tt.created_at
      FROM transaction_taxes tt
      WHERE tt.company_id = ${companyId}
        AND tt.status NOT IN ('paid')
        AND tt.paid_at IS NULL
        ${period ? sql`AND tt.period = ${period}` : sql``}
        ${direction ? sql`AND tt.direction = ${direction}` : sql``}
      ORDER BY tt.period DESC, tt.tax_amount DESC
      LIMIT ${limit}
    `);
    return res.json({ total: rows.rows.length, items: rows.rows });
  } catch (err) {
    logger.error({ err }, "tax/unpaid: query failed");
    return res.status(500).json({ message: "Gagal memuat pajak belum dibayar" });
  }
});

// GET /api/tax/compliance-summary?companyId=N&period=YYYY-MM
router.get("/compliance-summary", async (req, res) => {
  const companyId = resolveCompanyIdAudit(req);
  const { period } = req.query as Record<string, string>;
  const periodFilter = period ? sql`AND period = ${period}` : sql``;

  try {
    const [npwpMissing, fakturMissing, buktiMissing, unpaid] = await Promise.all([
      db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM transaction_taxes
        WHERE company_id = ${companyId} AND (npwp IS NULL OR npwp = '') ${periodFilter}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM transaction_taxes
        WHERE company_id = ${companyId} AND direction = 'output'
          AND (faktur_pajak_number IS NULL OR faktur_pajak_number = '') ${periodFilter}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS cnt FROM transaction_taxes
        WHERE company_id = ${companyId} AND direction = 'withholding'
          AND (bukti_potong_number IS NULL OR bukti_potong_number = '') ${periodFilter}
      `),
      db.execute(sql`
        SELECT COUNT(*)::int AS cnt, COALESCE(SUM(tax_amount::numeric),0)::float AS total
        FROM transaction_taxes
        WHERE company_id = ${companyId} AND status != 'paid' AND paid_at IS NULL ${periodFilter}
      `),
    ]);

    const unpaidRow = unpaid.rows[0] as { cnt: number; total: number };
    return res.json({
      companyId,
      period: period ?? "all",
      npwpMissing:          (npwpMissing.rows[0] as { cnt: number }).cnt,
      fakturPajakMissing:   (fakturMissing.rows[0] as { cnt: number }).cnt,
      buktiPotongMissing:   (buktiMissing.rows[0] as { cnt: number }).cnt,
      unpaidCount:          unpaidRow.cnt,
      unpaidTotalAmount:    unpaidRow.total,
    });
  } catch (err) {
    logger.error({ err }, "tax/compliance-summary: query failed");
    return res.status(500).json({ message: "Gagal memuat ringkasan kepatuhan pajak" });
  }
});

// PATCH /api/tax/transactions/:id — update faktur/bukti potong/npwp inline
router.patch("/transactions/:id", async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const { npwp, fakturPajakNumber, buktiPotongNumber, status, notes } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (npwp !== undefined) patch.npwp = npwp;
  if (fakturPajakNumber !== undefined) patch.fakturPajakNumber = fakturPajakNumber;
  if (buktiPotongNumber !== undefined) patch.buktiPotongNumber = buktiPotongNumber;
  if (status !== undefined) patch.status = status;
  if (notes !== undefined) patch.notes = notes;
  if (status === "paid") patch.paidAt = new Date();
  if (status === "reported") patch.reportedAt = new Date();
  if (status === "posted") patch.postedAt = new Date();

  if (Object.keys(patch).length === 1) {
    return res.status(400).json({ message: "Tidak ada field yang diupdate" });
  }

  try {
    const { transactionTaxesTable } = await import("@workspace/db");
    const { eq } = await import("drizzle-orm");
    await db.update(transactionTaxesTable).set(patch as never).where(eq(transactionTaxesTable.id, id));
    return res.json({ message: "Updated", id });
  } catch (err) {
    logger.error({ err }, "tax/transactions PATCH: failed");
    return res.status(500).json({ message: "Gagal update transaksi pajak" });
  }
});

export default router;
