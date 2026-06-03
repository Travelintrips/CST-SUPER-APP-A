import { Router } from "express";
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

function parseDateRange(req: { query: Record<string, unknown> }) {
  const from = req.query["from"] as string | undefined;
  const to = req.query["to"] as string | undefined;
  const fromD = from ? new Date(from) : null;
  const toD = to ? new Date(to) : null;
  if (fromD && isNaN(fromD.getTime())) return { error: "Invalid from date" };
  if (toD && isNaN(toD.getTime())) return { error: "Invalid to date" };
  return { from: fromD, to: toD, error: null };
}

/**
 * GET /api/executive/summary?from=&to=
 *
 * Sections covered:
 *   B  — consolidated KPI (revenue_total, expense_total, profit_total, cash_position)
 *   C  — company performance (group by company_id)
 *   D  — cost center performance (group by cost_center_id)
 *   E  — top 5 company, top/bottom 5 cost center
 *   F  — cash position per company + consolidated
 *   H  — validation: sum per company == consolidated
 */
router.get("/summary", requireAdmin, async (req, res) => {
  try {
    const range = parseDateRange(req);
    if (range.error) return res.status(400).json({ message: range.error });

    const dateFilter =
      range.from && range.to
        ? sql`AND ae.date BETWEEN ${range.from.toISOString().slice(0, 10)} AND ${range.to.toISOString().slice(0, 10)}`
        : range.from
          ? sql`AND ae.date >= ${range.from.toISOString().slice(0, 10)}`
          : range.to
            ? sql`AND ae.date <= ${range.to.toISOString().slice(0, 10)}`
            : sql``;

    const [companiesRes, companyPerfRes, costCenterPerfRes, cashRes, costCentersRes] =
      await Promise.all([
        // All active companies
        db.execute(sql`
          SELECT id, company_name, company_code, is_active, is_holding, parent_company_id
          FROM companies
          WHERE is_active = true
          ORDER BY company_code
        `),

        // Section C: Revenue/Expense per company (P&L filter by date)
        db.execute(sql`
          SELECT
            ae.company_id,
            COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN ael.credit - ael.debit ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN ael.debit - ael.credit ELSE 0 END), 0) AS expense
          FROM accounting_entries ae
          JOIN accounting_entry_lines ael ON ael.entry_id = ae.id
          JOIN chart_of_accounts coa ON coa.id = ael.account_id
          WHERE ae.status = 'posted'
            ${dateFilter}
          GROUP BY ae.company_id
        `),

        // Section D: Revenue/Expense per cost center (P&L filter by date)
        db.execute(sql`
          SELECT
            ae.cost_center_id,
            COALESCE(SUM(CASE WHEN coa.type = 'revenue' THEN ael.credit - ael.debit ELSE 0 END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN coa.type = 'expense' THEN ael.debit - ael.credit ELSE 0 END), 0) AS expense
          FROM accounting_entries ae
          JOIN accounting_entry_lines ael ON ael.entry_id = ae.id
          JOIN chart_of_accounts coa ON coa.id = ael.account_id
          WHERE ae.status = 'posted'
            ${dateFilter}
          GROUP BY ae.cost_center_id
        `),

        // Section F: Cash position per company (all time — no date filter for balance)
        db.execute(sql`
          SELECT
            ae.company_id,
            COALESCE(SUM(
              CASE WHEN coa.type = 'asset'
                AND (lower(coa.name) LIKE '%kas%' OR lower(coa.name) LIKE '%cash%' OR lower(coa.name) LIKE '%bank%')
              THEN ael.debit - ael.credit ELSE 0 END
            ), 0) AS cash_balance
          FROM accounting_entries ae
          JOIN accounting_entry_lines ael ON ael.entry_id = ae.id
          JOIN chart_of_accounts coa ON coa.id = ael.account_id
          WHERE ae.status = 'posted'
          GROUP BY ae.company_id
        `),

        // All active cost centers
        db.execute(sql`
          SELECT cc.id, cc.code, cc.name, cc.company_id, c.company_name
          FROM cost_centers cc
          LEFT JOIN companies c ON c.id = cc.company_id
          WHERE cc.is_active = true
          ORDER BY cc.code
        `),
      ]);

    type CompanyRow = { id: number; company_name: string; company_code: string; is_holding: boolean; parent_company_id: number | null };
    type PerfRow = { company_id: number | null; revenue: string; expense: string };
    type CcPerfRow = { cost_center_id: number | null; revenue: string; expense: string };
    type CashRow = { company_id: number | null; cash_balance: string };
    type CcRow = { id: number; code: string; name: string; company_id: number | null; company_name: string | null };

    const companies = companiesRes.rows as CompanyRow[];
    const perfRows = companyPerfRes.rows as PerfRow[];
    const ccPerfRows = costCenterPerfRes.rows as CcPerfRow[];
    const cashRows = cashRes.rows as CashRow[];
    const costCenters = costCentersRes.rows as CcRow[];

    // Build cash map per company
    const cashMap = new Map<number, number>();
    for (const r of cashRows) {
      if (r.company_id != null) cashMap.set(r.company_id, Number(r.cash_balance));
    }

    // Section C: Company performance
    const companyPerf = companies.map((c) => {
      const row = perfRows.find((r) => r.company_id === c.id);
      const revenue = Math.round(Number(row?.revenue ?? 0) * 100) / 100;
      const expense = Math.round(Number(row?.expense ?? 0) * 100) / 100;
      const profit = Math.round((revenue - expense) * 100) / 100;
      const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;
      const cash = Math.round((cashMap.get(c.id) ?? 0) * 100) / 100;
      return {
        company_id: c.id,
        company_name: c.company_name,
        company_code: c.company_code,
        is_holding: c.is_holding,
        revenue,
        expense,
        profit,
        profit_margin_pct: margin,
        cash_balance: cash,
      };
    });

    // Section D: Cost center performance
    const costCenterPerf = costCenters.map((cc) => {
      const row = ccPerfRows.find((r) => r.cost_center_id === cc.id);
      const revenue = Math.round(Number(row?.revenue ?? 0) * 100) / 100;
      const expense = Math.round(Number(row?.expense ?? 0) * 100) / 100;
      const profit = Math.round((revenue - expense) * 100) / 100;
      return {
        cost_center_id: cc.id,
        code: cc.code,
        name: cc.name,
        company_id: cc.company_id,
        company_name: cc.company_name ?? null,
        revenue,
        expense,
        profit,
      };
    });

    // Section B: Consolidated KPI (sum per company, excludes holding co to avoid double-count)
    const operatingCompanies = companyPerf.filter((c) => !c.is_holding);
    const revenue_total = Math.round(
      operatingCompanies.reduce((s, c) => s + c.revenue, 0) * 100,
    ) / 100;
    const expense_total = Math.round(
      operatingCompanies.reduce((s, c) => s + c.expense, 0) * 100,
    ) / 100;
    const profit_total = Math.round((revenue_total - expense_total) * 100) / 100;
    const cash_position = Math.round(
      operatingCompanies.reduce((s, c) => s + c.cash_balance, 0) * 100,
    ) / 100;

    // Section E: Top / bottom ranking
    const sorted = [...companyPerf].sort((a, b) => b.profit - a.profit);
    const top_companies = sorted.slice(0, 5);
    const ccSorted = [...costCenterPerf].sort((a, b) => b.profit - a.profit);
    const top_cost_centers = ccSorted.slice(0, 5);
    const bottom_cost_centers = ccSorted.slice(-5).reverse();

    // Section F: Cash per company detail + consolidated
    const cash_per_company = companyPerf.map((c) => ({
      company_id: c.company_id,
      company_name: c.company_name,
      company_code: c.company_code,
      cash_balance: c.cash_balance,
    }));

    // Section H: Validation — sum per company vs consolidated
    const sumPerCompany = Math.round(
      operatingCompanies.reduce((s, c) => s + c.profit, 0) * 100,
    ) / 100;
    const validation_match = Math.abs(sumPerCompany - profit_total) < 0.02;

    return res.json({
      // Section A keys
      companies,
      cost_centers: costCenters,
      // Section B
      revenue_total,
      expense_total,
      profit_total,
      cash_position,
      top_company: top_companies[0] ?? null,
      top_cost_center: top_cost_centers[0] ?? null,
      // Section C
      company_performance: companyPerf,
      // Section D
      cost_center_performance: costCenterPerf,
      // Section E
      top_companies,
      top_cost_centers,
      bottom_cost_centers,
      // Section F
      cash_per_company,
      // Section H
      validation: {
        sum_per_company: sumPerCompany,
        consolidated: profit_total,
        match: validation_match,
      },
    });
  } catch (err: unknown) {
    console.error("[executive/summary]", err);
    return res.status(500).json({ message: "Gagal memuat executive summary" });
  }
});

export default router;
