import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin";

const router = Router();

router.use(requireAdmin);

// ── Per Order ─────────────────────────────────────────────────────────────
// GET /api/analytics/profitability/orders?limit=50&offset=0&search=&dateFrom=&dateTo=&companyId=
//
// Formula (Phase 1 fix):
//   Revenue      = logistic_orders.grand_total
//   Vendor Cost  = approved vendor quote (logistic_order_quotes.vendor_price via MAX per order)
//   Truck Cost   = logistic_orders.truck_price
//   Tax          = logistic_orders.tax
//   Gross Margin = Revenue - Vendor Cost - Truck Cost
//   Margin %     = Gross Margin / Revenue * 100
router.get("/orders", async (req, res) => {
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const offset = Number(req.query.offset ?? 0);
  const search = String(req.query.search ?? "").trim();
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const rows = await db.execute<{
      id: string; order_number: string; customer_name: string;
      created_at: string; status: string; origin: string; destination: string;
      revenue: string; vendor_cost: string; truck_cost: string; tax: string;
      gross_margin: string; margin_pct: string;
      vendor_name: string | null;
    }>(sql`
      SELECT
        lo.id::text,
        lo.order_number,
        lo.customer_name,
        lo.created_at::text,
        lo.status,
        COALESCE(lo.origin, '')                                                   AS origin,
        COALESCE(lo.destination, '')                                              AS destination,
        lo.grand_total::numeric                                                   AS revenue,
        COALESCE(loq_agg.vendor_cost, 0)::numeric                                AS vendor_cost,
        COALESCE(lo.truck_price::numeric, 0)                                     AS truck_cost,
        COALESCE(lo.tax::numeric, 0)                                             AS tax,
        (lo.grand_total::numeric
          - COALESCE(loq_agg.vendor_cost, 0)
          - COALESCE(lo.truck_price::numeric, 0))                                AS gross_margin,
        CASE WHEN lo.grand_total::numeric > 0
          THEN ROUND(
            (lo.grand_total::numeric
              - COALESCE(loq_agg.vendor_cost, 0)
              - COALESCE(lo.truck_price::numeric, 0))
            / lo.grand_total::numeric * 100, 1)
          ELSE 0
        END                                                                       AS margin_pct,
        s.name                                                                    AS vendor_name
      FROM logistic_orders lo
      LEFT JOIN (
        SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
        FROM logistic_order_quotes
        GROUP BY order_id
      ) loq_agg ON loq_agg.order_id = lo.id
      LEFT JOIN suppliers s ON s.id = lo.approved_vendor_id
      WHERE lo.status NOT IN ('Cancelled','cancelled')
        ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
        ${search ? sql`AND (lo.order_number ILIKE ${'%' + search + '%'} OR lo.customer_name ILIKE ${'%' + search + '%'})` : sql``}
        ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND lo.created_at <= ${dateTo}` : sql``}
      ORDER BY lo.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await db.execute<{ cnt: string }>(sql`
      SELECT count(*)::text AS cnt FROM logistic_orders lo
      WHERE lo.status NOT IN ('Cancelled','cancelled')
        ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
        ${search ? sql`AND (lo.order_number ILIKE ${'%' + search + '%'} OR lo.customer_name ILIKE ${'%' + search + '%'})` : sql``}
        ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND lo.created_at <= ${dateTo}` : sql``}
    `);

    return res.json({
      rows: rows.rows.map(r => ({
        id: Number(r.id),
        orderNumber: r.order_number,
        customerName: r.customer_name,
        createdAt: r.created_at,
        status: r.status,
        origin: r.origin,
        destination: r.destination,
        revenue: Number(r.revenue),
        vendorCost: Number(r.vendor_cost),
        truckCost: Number(r.truck_cost),
        tax: Number(r.tax),
        grossMargin: Number(r.gross_margin),
        // legacy alias kept for backward compat
        margin: Number(r.gross_margin),
        marginPct: Number(r.margin_pct),
        vendorName: r.vendor_name ?? null,
      })),
      total: Number((countRes.rows[0] as { cnt: string } | undefined)?.cnt ?? 0),
      limit,
      offset,
    });
  } catch (e) {
    console.error("[analytics/orders]", e);
    return res.status(500).json({ error: "Gagal memuat data order" });
  }
});

// ── Per Customer ──────────────────────────────────────────────────────────
// GET /api/analytics/profitability/customers?companyId=&dateFrom=&dateTo=
//
// Formula (Phase 1 fix):
//   Profit = SUM(grand_total - vendor_cost - truck_price)
//   Profitability % = Profit / Revenue * 100
router.get("/customers", async (req, res) => {
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const rows = await db.execute<{
      customer_name: string; order_count: string; revenue: string;
      outstanding: string; vendor_cost: string; truck_cost: string; tax: string;
      profit: string; profitability_pct: string;
    }>(sql`
      SELECT
        lo.customer_name,
        COUNT(lo.id)::text                                                                   AS order_count,
        SUM(lo.grand_total::numeric)::text                                                   AS revenue,
        SUM(
          CASE WHEN lo.status NOT IN (
            'Completed','completed','Delivered','delivered','Done','done'
          ) THEN lo.grand_total::numeric ELSE 0 END
        )::text                                                                              AS outstanding,
        SUM(COALESCE(loq_agg.vendor_cost, 0))::text                                         AS vendor_cost,
        SUM(COALESCE(lo.truck_price::numeric, 0))::text                                     AS truck_cost,
        SUM(COALESCE(lo.tax::numeric, 0))::text                                             AS tax,
        SUM(lo.grand_total::numeric
          - COALESCE(loq_agg.vendor_cost, 0)
          - COALESCE(lo.truck_price::numeric, 0))::text                                     AS profit,
        ROUND(
          CASE WHEN SUM(lo.grand_total::numeric) > 0
            THEN SUM(lo.grand_total::numeric
              - COALESCE(loq_agg.vendor_cost, 0)
              - COALESCE(lo.truck_price::numeric, 0))
              / SUM(lo.grand_total::numeric) * 100
            ELSE 0
          END, 1
        )::text                                                                              AS profitability_pct
      FROM logistic_orders lo
      LEFT JOIN (
        SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
        FROM logistic_order_quotes GROUP BY order_id
      ) loq_agg ON loq_agg.order_id = lo.id
      WHERE lo.status NOT IN ('Cancelled','cancelled')
        ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
        ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
        ${dateTo ? sql`AND lo.created_at <= ${dateTo}` : sql``}
      GROUP BY lo.customer_name
      ORDER BY SUM(lo.grand_total::numeric) DESC NULLS LAST
      LIMIT 100
    `);

    return res.json(rows.rows.map(r => ({
      customerName: r.customer_name || "(tanpa nama)",
      orderCount: Number(r.order_count),
      revenue: Number(r.revenue),
      outstanding: Number(r.outstanding),
      vendorCost: Number(r.vendor_cost),
      truckCost: Number(r.truck_cost),
      tax: Number(r.tax),
      profit: Number(r.profit),
      profitabilityPct: Number(r.profitability_pct),
    })));
  } catch (e) {
    console.error("[analytics/customers]", e);
    return res.status(500).json({ error: "Gagal memuat data customer" });
  }
});

// ── Per Vendor ────────────────────────────────────────────────────────────
// GET /api/analytics/profitability/vendors?companyId=&dateFrom=&dateTo=
// (Vendor analytics: spend, win rate, performance — not CST margin)
router.get("/vendors", async (req, res) => {
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo = req.query.dateTo ? new Date(String(req.query.dateTo)) : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const rows = await db.execute<{
      vendor_id: string; vendor_name: string; order_count: string;
      total_spend: string; win_rate: string; total_invites: string; total_wins: string;
      ontime_pct: string; recommendation_score: string; avg_response_min: string;
    }>(sql`
      WITH vendor_orders AS (
        SELECT
          lo.approved_vendor_id AS vendor_id,
          COUNT(lo.id)                                           AS order_count,
          SUM(COALESCE(loq_agg.vendor_cost, 0))                 AS total_spend
        FROM logistic_orders lo
        LEFT JOIN (
          SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
          FROM logistic_order_quotes GROUP BY order_id
        ) loq_agg ON loq_agg.order_id = lo.id
        WHERE lo.approved_vendor_id IS NOT NULL
          AND lo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
          ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
          ${dateTo ? sql`AND lo.created_at <= ${dateTo}` : sql``}
        GROUP BY lo.approved_vendor_id
      ),
      vendor_win AS (
        SELECT
          rvl.vendor_id,
          COUNT(*)                                               AS total_invites,
          COUNT(*) FILTER (WHERE rvl.status = 'selected')       AS total_wins
        FROM rfq_vendor_links rvl
        ${dateFrom ? sql`WHERE rvl.created_at >= ${dateFrom}` : sql`WHERE TRUE`}
        ${dateTo ? sql`AND rvl.created_at <= ${dateTo}` : sql``}
        GROUP BY rvl.vendor_id
      )
      SELECT
        s.id::text                                          AS vendor_id,
        s.name                                             AS vendor_name,
        COALESCE(vo.order_count, 0)::text                  AS order_count,
        COALESCE(vo.total_spend, 0)::text                  AS total_spend,
        ROUND(
          CASE WHEN COALESCE(vw.total_invites, 0) > 0
            THEN vw.total_wins::numeric / vw.total_invites * 100
            ELSE 0
          END, 1
        )::text                                            AS win_rate,
        COALESCE(vw.total_invites, 0)::text                AS total_invites,
        COALESCE(vw.total_wins, 0)::text                   AS total_wins,
        COALESCE(vp.ontime_percentage, 0)::text            AS ontime_pct,
        COALESCE(vp.recommendation_score, 0)::text         AS recommendation_score,
        COALESCE(vp.average_response_minutes, 0)::text     AS avg_response_min
      FROM suppliers s
      LEFT JOIN vendor_orders vo ON vo.vendor_id = s.id
      LEFT JOIN vendor_win vw ON vw.vendor_id = s.id
      LEFT JOIN vendor_performance vp ON vp.vendor_id = s.id
      WHERE s.is_active = true
        AND (vo.order_count > 0 OR vw.total_invites > 0)
      ORDER BY COALESCE(vo.total_spend, 0) DESC NULLS LAST
      LIMIT 100
    `);

    return res.json(rows.rows.map(r => ({
      vendorId: Number(r.vendor_id),
      vendorName: r.vendor_name,
      orderCount: Number(r.order_count),
      totalSpend: Number(r.total_spend),
      winRate: Number(r.win_rate),
      totalInvites: Number(r.total_invites),
      totalWins: Number(r.total_wins),
      ontimePct: Number(r.ontime_pct),
      recommendationScore: Number(r.recommendation_score),
      avgResponseMin: Number(r.avg_response_min),
    })));
  } catch (e) {
    console.error("[analytics/vendors]", e);
    return res.status(500).json({ error: "Gagal memuat data vendor" });
  }
});

// ── Per Commodity ─────────────────────────────────────────────────────────
// GET /api/analytics/profitability/commodities?companyId=&dateFrom=&dateTo=
//
// GROUP BY commodity
// Formula: Gross Margin = Revenue - Vendor Cost - Truck Cost
router.get("/commodities", async (req, res) => {
  const dateFrom  = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo    = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const rows = await db.execute<{
      commodity: string; order_count: string; revenue: string;
      vendor_cost: string; truck_cost: string; tax: string;
      gross_margin: string; margin_pct: string;
    }>(sql`
      SELECT
        COALESCE(NULLIF(TRIM(lo.commodity), ''), '(tidak diisi)')    AS commodity,
        COUNT(lo.id)::text                                            AS order_count,
        SUM(lo.grand_total::numeric)::text                           AS revenue,
        SUM(COALESCE(loq_agg.vendor_cost, 0))::text                 AS vendor_cost,
        SUM(COALESCE(lo.truck_price::numeric, 0))::text             AS truck_cost,
        SUM(COALESCE(lo.tax::numeric, 0))::text                     AS tax,
        SUM(
          lo.grand_total::numeric
          - COALESCE(loq_agg.vendor_cost, 0)
          - COALESCE(lo.truck_price::numeric, 0)
        )::text                                                       AS gross_margin,
        ROUND(
          CASE WHEN SUM(lo.grand_total::numeric) > 0
            THEN SUM(
              lo.grand_total::numeric
              - COALESCE(loq_agg.vendor_cost, 0)
              - COALESCE(lo.truck_price::numeric, 0)
            ) / SUM(lo.grand_total::numeric) * 100
            ELSE 0
          END, 1
        )::text                                                       AS margin_pct
      FROM logistic_orders lo
      LEFT JOIN (
        SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
        FROM logistic_order_quotes GROUP BY order_id
      ) loq_agg ON loq_agg.order_id = lo.id
      WHERE lo.status NOT IN ('Cancelled','cancelled')
        ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
        ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
        ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}
      GROUP BY COALESCE(NULLIF(TRIM(lo.commodity), ''), '(tidak diisi)')
      ORDER BY SUM(lo.grand_total::numeric) DESC NULLS LAST
    `);

    const items = rows.rows.map(r => ({
      commodity:   r.commodity,
      orderCount:  Number(r.order_count),
      revenue:     Number(r.revenue),
      vendorCost:  Number(r.vendor_cost),
      truckCost:   Number(r.truck_cost),
      tax:         Number(r.tax),
      grossMargin: Number(r.gross_margin),
      marginPct:   Number(r.margin_pct),
    }));

    const totalRevenue     = items.reduce((s, r) => s + r.revenue,     0);
    const totalVendorCost  = items.reduce((s, r) => s + r.vendorCost,  0);
    const totalTruckCost   = items.reduce((s, r) => s + r.truckCost,   0);
    const totalTax         = items.reduce((s, r) => s + r.tax,         0);
    const totalGrossMargin = items.reduce((s, r) => s + r.grossMargin, 0);
    const totalOrders      = items.reduce((s, r) => s + r.orderCount,  0);
    const avgMarginPct     = totalRevenue > 0
      ? Math.round(totalGrossMargin / totalRevenue * 1000) / 10 : 0;

    return res.json({
      items,
      total: items.length,
      summary: { totalRevenue, totalVendorCost, totalTruckCost, totalTax, totalGrossMargin, totalOrders, avgMarginPct },
    });
  } catch (e) {
    console.error("[analytics/commodities]", e);
    return res.status(500).json({ error: "Gagal memuat data komoditi" });
  }
});

// ── Per Route ─────────────────────────────────────────────────────────────
// GET /api/analytics/profitability/routes?companyId=&dateFrom=&dateTo=&limit=50&offset=0
//
// GROUP BY origin, destination
// Formula: Gross Margin = Revenue - Vendor Cost - Truck Cost
router.get("/routes", async (req, res) => {
  const dateFrom = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo   = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;
  const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  try {
    const rows = await db.execute<{
      origin: string; destination: string;
      order_count: string; revenue: string;
      vendor_cost: string; truck_cost: string; tax: string;
      gross_margin: string; margin_pct: string;
    }>(sql`
      SELECT
        COALESCE(NULLIF(TRIM(lo.origin), ''), '(tidak diisi)')          AS origin,
        COALESCE(NULLIF(TRIM(lo.destination), ''), '(tidak diisi)')     AS destination,
        COUNT(lo.id)::text                                              AS order_count,
        SUM(lo.grand_total::numeric)::text                              AS revenue,
        SUM(COALESCE(loq_agg.vendor_cost, 0))::text                    AS vendor_cost,
        SUM(COALESCE(lo.truck_price::numeric, 0))::text                AS truck_cost,
        SUM(COALESCE(lo.tax::numeric, 0))::text                        AS tax,
        SUM(
          lo.grand_total::numeric
          - COALESCE(loq_agg.vendor_cost, 0)
          - COALESCE(lo.truck_price::numeric, 0)
        )::text                                                         AS gross_margin,
        ROUND(
          CASE WHEN SUM(lo.grand_total::numeric) > 0
            THEN SUM(
              lo.grand_total::numeric
              - COALESCE(loq_agg.vendor_cost, 0)
              - COALESCE(lo.truck_price::numeric, 0)
            ) / SUM(lo.grand_total::numeric) * 100
            ELSE 0
          END, 1
        )::text                                                         AS margin_pct
      FROM logistic_orders lo
      LEFT JOIN (
        SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
        FROM logistic_order_quotes GROUP BY order_id
      ) loq_agg ON loq_agg.order_id = lo.id
      WHERE lo.status NOT IN ('Cancelled','cancelled')
        AND NULLIF(TRIM(lo.origin), '') IS NOT NULL
        AND NULLIF(TRIM(lo.destination), '') IS NOT NULL
        ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
        ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
        ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}
      GROUP BY
        COALESCE(NULLIF(TRIM(lo.origin), ''), '(tidak diisi)'),
        COALESCE(NULLIF(TRIM(lo.destination), ''), '(tidak diisi)')
      ORDER BY SUM(lo.grand_total::numeric) DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(DISTINCT (TRIM(lo.origin), TRIM(lo.destination)))::text AS cnt
      FROM logistic_orders lo
      WHERE lo.status NOT IN ('Cancelled','cancelled')
        AND NULLIF(TRIM(lo.origin), '') IS NOT NULL
        AND NULLIF(TRIM(lo.destination), '') IS NOT NULL
        ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
        ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
        ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}
    `);

    const items = rows.rows.map(r => ({
      origin:      r.origin,
      destination: r.destination,
      route:       `${r.origin} → ${r.destination}`,
      orderCount:  Number(r.order_count),
      revenue:     Number(r.revenue),
      vendorCost:  Number(r.vendor_cost),
      truckCost:   Number(r.truck_cost),
      tax:         Number(r.tax),
      grossMargin: Number(r.gross_margin),
      marginPct:   Number(r.margin_pct),
    }));

    const totalRevenue    = items.reduce((s, r) => s + r.revenue,    0);
    const totalVendorCost = items.reduce((s, r) => s + r.vendorCost, 0);
    const totalTruckCost  = items.reduce((s, r) => s + r.truckCost,  0);
    const totalTax        = items.reduce((s, r) => s + r.tax,        0);
    const totalGrossMargin = items.reduce((s, r) => s + r.grossMargin, 0);
    const totalOrders     = items.reduce((s, r) => s + r.orderCount, 0);
    const avgMarginPct    = totalRevenue > 0
      ? Math.round(totalGrossMargin / totalRevenue * 1000) / 10 : 0;

    return res.json({
      items,
      total: Number((countRes.rows[0] as { cnt: string } | undefined)?.cnt ?? 0),
      limit,
      offset,
      summary: { totalRevenue, totalVendorCost, totalTruckCost, totalTax, totalGrossMargin, totalOrders, avgMarginPct },
    });
  } catch (e) {
    console.error("[analytics/routes]", e);
    return res.status(500).json({ error: "Gagal memuat data rute" });
  }
});

export default router;
