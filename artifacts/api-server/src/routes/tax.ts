import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { seedDefaultTaxRules } from "../lib/taxRulesMigration.js";
import { logger } from "../lib/logger.js";

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
  return res.json({ ok: true, data: row });
});

// ── PUT /api/tax/rules/:id ────────────────────────────────────────────────────
router.put("/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, transaction_type, module_source, tax_type, tax_rate, tax_base_type, direction, is_active, effective_from, effective_to, notes } = req.body;
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
  return res.json({ ok: true, data: row });
});

// ── DELETE /api/tax/rules/:id ─────────────────────────────────────────────────
router.delete("/rules/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.execute(sql`DELETE FROM tax_rules WHERE id = ${id}`);
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
  await db.execute(sql`
    UPDATE transaction_taxes SET
      npwp = ${npwp ?? null},
      tax_invoice_number = ${taxInvoiceNumber ?? null},
      partner_name = ${partnerName ?? null},
      updated_at = NOW()
    WHERE id = ${id}
  `);
  return res.json({ ok: true });
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

export default router;
