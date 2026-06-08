import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin";

const router = Router();

// ── Per Order ─────────────────────────────────────────────────────────────
// GET /api/analytics/profitability/orders?limit=50&offset=0&search=&dateFrom=&dateTo=&companyId=
//
// Strategy: run logistic_orders and portal_product_orders as separate parallel
// queries (no UNION ALL CTE) to avoid complex query plan on Supabase pooler.
// Results are merged and sorted in JS.
router.get("/orders", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const limit     = Math.min(Number(req.query.limit ?? 50), 200);
  const offset    = Number(req.query.offset ?? 0);
  const search    = String(req.query.search ?? "").trim();
  const dateFrom  = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo    = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const [loResult, ppoResult] = await Promise.all([
      db.execute<{
        id: string; order_number: string; customer_name: string;
        created_at: string; status: string;
        origin: string; destination: string;
        revenue: string; vendor_cost: string; truck_cost: string; tax: string;
        gross_margin: string; opex_cost: string; purchase_cost: string;
        vendor_name: string | null;
      }>(sql`
        SELECT
          lo.id::text                                                    AS id,
          lo.order_number,
          lo.customer_name,
          lo.created_at::text                                            AS created_at,
          lo.status,
          COALESCE(lo.origin, '')                                        AS origin,
          COALESCE(lo.destination, '')                                   AS destination,
          lo.grand_total::numeric                                        AS revenue,
          COALESCE(
            (SELECT MAX(q.vendor_price::numeric)
             FROM logistic_order_quotes q WHERE q.order_id = lo.id), 0) AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                          AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                  AS tax,
          (lo.grand_total::numeric
            - COALESCE(
                (SELECT MAX(q.vendor_price::numeric)
                 FROM logistic_order_quotes q WHERE q.order_id = lo.id), 0)
            - COALESCE(lo.truck_price::numeric, 0))                     AS gross_margin,
          COALESCE(
            (SELECT SUM(e.total::numeric) FROM expenses e
             WHERE e.logistic_order_id = lo.id AND e.status = 'active'), 0) AS opex_cost,
          COALESCE(
            (SELECT SUM(pd.grand_total::numeric) FROM purchase_documents pd
             WHERE pd.logistic_order_id = lo.id AND pd.kind = 'order'), 0) AS purchase_cost,
          s.name                                                         AS vendor_name
        FROM logistic_orders lo
        LEFT JOIN suppliers s ON s.id = lo.approved_vendor_id
        WHERE lo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
          ${search ? sql`AND (lo.order_number ILIKE ${'%' + search + '%'} OR lo.customer_name ILIKE ${'%' + search + '%'})` : sql``}
          ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}
        ORDER BY lo.created_at DESC
      `),
      db.execute<{
        id: string; order_number: string; customer_name: string;
        created_at: string; status: string;
        origin: string; destination: string;
        revenue: string; vendor_cost: string; truck_cost: string;
        gross_margin: string; vendor_name: string | null;
      }>(sql`
        SELECT
          ppo.id::text                                                   AS id,
          ppo.order_number,
          ppo.customer_name,
          ppo.created_at::text                                           AS created_at,
          ppo.status,
          COALESCE(ppo.pickup_location, '')                              AS origin,
          COALESCE(ppo.shipping_address, '')                             AS destination,
          ppo.grand_total::numeric                                       AS revenue,
          COALESCE(ppo.vendor_quoted_price::numeric, 0)                 AS vendor_cost,
          COALESCE(ppo.truck_cost::numeric, 0)                          AS truck_cost,
          (ppo.grand_total::numeric
            - COALESCE(ppo.vendor_quoted_price::numeric, 0)
            - COALESCE(ppo.truck_cost::numeric, 0))                     AS gross_margin,
          ppo.vendor_name_selected                                       AS vendor_name
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${search ? sql`AND (ppo.order_number ILIKE ${'%' + search + '%'} OR ppo.customer_name ILIKE ${'%' + search + '%'})` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
        ORDER BY ppo.created_at DESC
      `),
    ]);

    type MergedRow = {
      id: number; orderNumber: string; customerName: string;
      createdAt: string; status: string; sourceType: string;
      origin: string; destination: string;
      revenue: number; vendorCost: number; truckCost: number; tax: number;
      grossMargin: number; margin: number; marginPct: number;
      opexCost: number; purchaseCost: number;
      netMargin: number; netMarginPct: number;
      vendorName: string | null;
    };

    const loRows: MergedRow[] = loResult.rows.map(r => {
      const revenue    = Number(r.revenue);
      const gm         = Number(r.gross_margin);
      const opex       = Number(r.opex_cost);
      const netMargin  = gm - opex;
      return {
        id:           Number(r.id),
        orderNumber:  r.order_number,
        customerName: r.customer_name,
        createdAt:    r.created_at,
        status:       r.status,
        sourceType:   "logistic_order",
        origin:       r.origin,
        destination:  r.destination,
        revenue,
        vendorCost:   Number(r.vendor_cost),
        truckCost:    Number(r.truck_cost),
        tax:          Number(r.tax),
        grossMargin:  gm,
        margin:       gm,
        marginPct:    revenue > 0 ? Math.round(gm / revenue * 1000) / 10 : 0,
        opexCost:     opex,
        purchaseCost: Number(r.purchase_cost),
        netMargin,
        netMarginPct: revenue > 0 ? Math.round(netMargin / revenue * 1000) / 10 : 0,
        vendorName:   r.vendor_name ?? null,
      };
    });

    const ppoRows: MergedRow[] = ppoResult.rows.map(r => {
      const revenue   = Number(r.revenue);
      const gm        = Number(r.gross_margin);
      return {
        id:           Number(r.id),
        orderNumber:  r.order_number,
        customerName: r.customer_name,
        createdAt:    r.created_at,
        status:       r.status,
        sourceType:   "portal_product_order",
        origin:       r.origin,
        destination:  r.destination,
        revenue,
        vendorCost:   Number(r.vendor_cost),
        truckCost:    Number(r.truck_cost),
        tax:          0,
        grossMargin:  gm,
        margin:       gm,
        marginPct:    revenue > 0 ? Math.round(gm / revenue * 1000) / 10 : 0,
        opexCost:     0,
        purchaseCost: 0,
        netMargin:    gm,
        netMarginPct: revenue > 0 ? Math.round(gm / revenue * 1000) / 10 : 0,
        vendorName:   r.vendor_name ?? null,
      };
    });

    const merged = [...loRows, ...ppoRows]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return res.json({
      rows:   merged.slice(offset, offset + limit),
      total:  merged.length,
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
router.get("/customers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const dateFrom  = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo    = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const rows = await db.execute<{
      customer_name: string; order_count: string; revenue: string;
      outstanding: string; vendor_cost: string; truck_cost: string; tax: string;
      profit: string; profitability_pct: string;
    }>(sql`
      SELECT
        customer_name,
        COUNT(*)::text                                                        AS order_count,
        SUM(grand_total)::text                                               AS revenue,
        SUM(
          CASE WHEN status NOT IN ('Completed','completed','Delivered','delivered','Done','done')
            THEN grand_total ELSE 0 END
        )::text                                                              AS outstanding,
        SUM(vendor_cost)::text                                               AS vendor_cost,
        SUM(truck_cost)::text                                                AS truck_cost,
        SUM(tax)::text                                                       AS tax,
        SUM(grand_total - vendor_cost - truck_cost)::text                    AS profit,
        ROUND(
          CASE WHEN SUM(grand_total) > 0
            THEN SUM(grand_total - vendor_cost - truck_cost) / SUM(grand_total) * 100
            ELSE 0
          END, 1
        )::text                                                              AS profitability_pct
      FROM (
        SELECT
          lo.customer_name,
          lo.grand_total::numeric                                             AS grand_total,
          lo.status,
          COALESCE(
            (SELECT MAX(q.vendor_price::numeric)
             FROM logistic_order_quotes q WHERE q.order_id = lo.id), 0)     AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax
        FROM logistic_orders lo
        WHERE lo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
          ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}

        UNION ALL

        SELECT
          ppo.customer_name,
          ppo.grand_total::numeric,
          ppo.status,
          COALESCE(ppo.vendor_quoted_price::numeric, 0)                      AS vendor_cost,
          COALESCE(ppo.truck_cost::numeric, 0)                               AS truck_cost,
          0::numeric                                                          AS tax
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      ) src
      GROUP BY customer_name
      ORDER BY SUM(grand_total) DESC NULLS LAST
      LIMIT 100
    `);

    return res.json(rows.rows.map(r => ({
      customerName:    r.customer_name || "(tanpa nama)",
      orderCount:      Number(r.order_count),
      revenue:         Number(r.revenue),
      outstanding:     Number(r.outstanding),
      vendorCost:      Number(r.vendor_cost),
      truckCost:       Number(r.truck_cost),
      tax:             Number(r.tax),
      profit:          Number(r.profit),
      profitabilityPct: Number(r.profitability_pct),
    })));
  } catch (e) {
    console.error("[analytics/customers]", e);
    return res.status(500).json({ error: "Gagal memuat data customer" });
  }
});

// ── Per Vendor ────────────────────────────────────────────────────────────
// GET /api/analytics/profitability/vendors?companyId=&dateFrom=&dateTo=
router.get("/vendors", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const dateFrom  = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo    = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
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
          ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}
        GROUP BY lo.approved_vendor_id
      ),
      vendor_win AS (
        SELECT
          rvl.vendor_id,
          COUNT(*)                                               AS total_invites,
          COUNT(*) FILTER (WHERE rvl.status = 'selected')       AS total_wins
        FROM rfq_vendor_links rvl
        WHERE TRUE
          ${dateFrom ? sql`AND rvl.submitted_at >= ${dateFrom}` : sql``}
          ${dateTo ? sql`AND rvl.submitted_at <= ${dateTo}` : sql``}
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
        '0'                                                AS ontime_pct,
        '0'                                                AS recommendation_score,
        '0'                                                AS avg_response_min
      FROM suppliers s
      LEFT JOIN vendor_orders vo ON vo.vendor_id = s.id
      LEFT JOIN vendor_win vw ON vw.vendor_id = s.id
      WHERE s.is_active = true
        AND (vo.order_count > 0 OR vw.total_invites > 0)
      ORDER BY COALESCE(vo.total_spend, 0) DESC NULLS LAST
      LIMIT 100
    `);

    return res.json(rows.rows.map(r => ({
      vendorId:            Number(r.vendor_id),
      vendorName:          r.vendor_name,
      orderCount:          Number(r.order_count),
      totalSpend:          Number(r.total_spend),
      winRate:             Number(r.win_rate),
      totalInvites:        Number(r.total_invites),
      totalWins:           Number(r.total_wins),
      ontimePct:           Number(r.ontime_pct),
      recommendationScore: Number(r.recommendation_score),
      avgResponseMin:      Number(r.avg_response_min),
    })));
  } catch (e) {
    console.error("[analytics/vendors]", e);
    return res.status(500).json({ error: "Gagal memuat data vendor" });
  }
});

// ── Per Commodity ─────────────────────────────────────────────────────────
// GET /api/analytics/profitability/commodities?companyId=&dateFrom=&dateTo=
router.get("/commodities", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
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
        commodity,
        COUNT(*)::text                                                        AS order_count,
        SUM(grand_total)::text                                               AS revenue,
        SUM(vendor_cost)::text                                               AS vendor_cost,
        SUM(truck_cost)::text                                                AS truck_cost,
        SUM(tax)::text                                                       AS tax,
        SUM(grand_total - vendor_cost - truck_cost)::text                    AS gross_margin,
        ROUND(
          CASE WHEN SUM(grand_total) > 0
            THEN SUM(grand_total - vendor_cost - truck_cost) / SUM(grand_total) * 100
            ELSE 0
          END, 1
        )::text                                                              AS margin_pct
      FROM (
        SELECT
          COALESCE(NULLIF(TRIM(lo.commodity), ''), '(tidak diisi)')          AS commodity,
          lo.grand_total::numeric                                             AS grand_total,
          COALESCE(
            (SELECT MAX(q.vendor_price::numeric)
             FROM logistic_order_quotes q WHERE q.order_id = lo.id), 0)     AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax
        FROM logistic_orders lo
        WHERE lo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
          ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}

        UNION ALL

        SELECT
          COALESCE(NULLIF(TRIM(ppo.product_category), ''), '(tidak diisi)') AS commodity,
          ppo.grand_total::numeric,
          COALESCE(ppo.vendor_quoted_price::numeric, 0),
          COALESCE(ppo.truck_cost::numeric, 0),
          0::numeric
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      ) src
      GROUP BY commodity
      ORDER BY SUM(grand_total) DESC NULLS LAST
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
router.get("/routes", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const dateFrom  = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo    = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
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
        origin,
        destination,
        COUNT(*)::text                                                        AS order_count,
        SUM(grand_total)::text                                               AS revenue,
        SUM(vendor_cost)::text                                               AS vendor_cost,
        SUM(truck_cost)::text                                                AS truck_cost,
        SUM(tax)::text                                                       AS tax,
        SUM(grand_total - vendor_cost - truck_cost)::text                    AS gross_margin,
        ROUND(
          CASE WHEN SUM(grand_total) > 0
            THEN SUM(grand_total - vendor_cost - truck_cost) / SUM(grand_total) * 100
            ELSE 0
          END, 1
        )::text                                                              AS margin_pct
      FROM (
        SELECT
          COALESCE(NULLIF(TRIM(lo.origin), ''), '(tidak diisi)')             AS origin,
          COALESCE(NULLIF(TRIM(lo.destination), ''), '(tidak diisi)')        AS destination,
          lo.grand_total::numeric                                             AS grand_total,
          COALESCE(
            (SELECT MAX(q.vendor_price::numeric)
             FROM logistic_order_quotes q WHERE q.order_id = lo.id), 0)     AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax
        FROM logistic_orders lo
        WHERE lo.status NOT IN ('Cancelled','cancelled')
          AND NULLIF(TRIM(lo.origin), '') IS NOT NULL
          AND NULLIF(TRIM(lo.destination), '') IS NOT NULL
          ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
          ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}

        UNION ALL

        SELECT
          COALESCE(NULLIF(TRIM(ppo.pickup_location), ''), '(tidak diisi)')   AS origin,
          COALESCE(NULLIF(TRIM(ppo.shipping_address), ''), '(tidak diisi)')  AS destination,
          ppo.grand_total::numeric,
          COALESCE(ppo.vendor_quoted_price::numeric, 0),
          COALESCE(ppo.truck_cost::numeric, 0),
          0::numeric
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          AND NULLIF(TRIM(ppo.pickup_location), '') IS NOT NULL
          AND NULLIF(TRIM(ppo.shipping_address), '') IS NOT NULL
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      ) src
      GROUP BY origin, destination
      ORDER BY SUM(grand_total) DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(DISTINCT (origin, destination))::text AS cnt FROM (
        SELECT
          COALESCE(NULLIF(TRIM(lo.origin), ''), '(tidak diisi)')    AS origin,
          COALESCE(NULLIF(TRIM(lo.destination), ''), '(tidak diisi)') AS destination
        FROM logistic_orders lo
        WHERE lo.status NOT IN ('Cancelled','cancelled')
          AND NULLIF(TRIM(lo.origin), '') IS NOT NULL
          AND NULLIF(TRIM(lo.destination), '') IS NOT NULL
          ${companyId !== null ? sql`AND lo.company_id = ${companyId}` : sql``}
          ${dateFrom ? sql`AND lo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND lo.created_at <= ${dateTo}`   : sql``}
        UNION ALL
        SELECT
          COALESCE(NULLIF(TRIM(ppo.pickup_location), ''), '(tidak diisi)'),
          COALESCE(NULLIF(TRIM(ppo.shipping_address), ''), '(tidak diisi)')
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          AND NULLIF(TRIM(ppo.pickup_location), '') IS NOT NULL
          AND NULLIF(TRIM(ppo.shipping_address), '') IS NOT NULL
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      ) combined
    `);

    return res.json({
      rows: rows.rows.map(r => ({
        origin:      r.origin,
        destination: r.destination,
        orderCount:  Number(r.order_count),
        revenue:     Number(r.revenue),
        vendorCost:  Number(r.vendor_cost),
        truckCost:   Number(r.truck_cost),
        tax:         Number(r.tax),
        grossMargin: Number(r.gross_margin),
        marginPct:   Number(r.margin_pct),
      })),
      total:  Number((countRes.rows[0] as { cnt: string } | undefined)?.cnt ?? 0),
      limit,
      offset,
    });
  } catch (e) {
    console.error("[analytics/routes]", e);
    return res.status(500).json({ error: "Gagal memuat data rute" });
  }
});

export default router;
