import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin";

const router = Router();

router.use(requireAdmin);

// ── Shared UNION ALL helper SQL fragments ──────────────────────────────────
//
// Portal Product Order margin formula (per sprint spec):
//   Product Revenue  = COALESCE(product_price, subtotal)
//   Product Cost     = COALESCE(vendor_quoted_price, 0)
//   Shipment Revenue = COALESCE(shipment_cost, 0)
//   Shipment Cost    = COALESCE(truck_cost, 0)
//   Order Gross Margin = (Product Revenue - Product Cost)
//                      + (Shipment Revenue - Shipment Cost)
//   Margin %         = Order Gross Margin / grand_total * 100
//
// Simplification: since grand_total ≈ product_revenue + shipment_revenue,
//   gross_margin = grand_total - vendor_quoted_price - truck_cost
//   which is the same pattern as logistic_orders.

// ── Per Order ─────────────────────────────────────────────────────────────
// GET /api/analytics/profitability/orders?limit=50&offset=0&search=&dateFrom=&dateTo=&companyId=
router.get("/orders", async (req, res) => {
  const limit     = Math.min(Number(req.query.limit ?? 50), 200);
  const offset    = Number(req.query.offset ?? 0);
  const search    = String(req.query.search ?? "").trim();
  const dateFrom  = req.query.dateFrom ? new Date(String(req.query.dateFrom)) : null;
  const dateTo    = req.query.dateTo   ? new Date(String(req.query.dateTo))   : null;
  const companyId = req.query.companyId && req.query.companyId !== "all"
    ? Number(req.query.companyId) : null;

  try {
    const rows = await db.execute<{
      id: string; order_number: string; customer_name: string;
      created_at: string; status: string; source_type: string;
      origin: string; destination: string;
      revenue: string; vendor_cost: string; truck_cost: string; tax: string;
      gross_margin: string; margin_pct: string;
      opex_cost: string; purchase_cost: string;
      net_margin: string; net_margin_pct: string;
      vendor_name: string | null;
    }>(sql`
      WITH src AS (
        -- Logistic Orders
        SELECT
          lo.id::text                                                         AS id,
          lo.order_number,
          lo.customer_name,
          lo.created_at                                                       AS created_at_ts,
          lo.status,
          'logistic_order'::text                                              AS source_type,
          COALESCE(lo.origin, '')                                             AS origin,
          COALESCE(lo.destination, '')                                        AS destination,
          lo.grand_total::numeric                                             AS revenue,
          COALESCE(loq_agg.vendor_cost, 0)::numeric                          AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax,
          (lo.grand_total::numeric
            - COALESCE(loq_agg.vendor_cost, 0)
            - COALESCE(lo.truck_price::numeric, 0))                          AS gross_margin,
          COALESCE(opex_agg.opex_cost, 0)                                   AS opex_cost,
          COALESCE(po_agg.purchase_cost, 0)                                  AS purchase_cost,
          s.name                                                              AS vendor_name,
          lo.company_id                                                       AS company_id
        FROM logistic_orders lo
        LEFT JOIN (
          SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
          FROM logistic_order_quotes GROUP BY order_id
        ) loq_agg ON loq_agg.order_id = lo.id
        LEFT JOIN (
          SELECT logistic_order_id, SUM(total::numeric) AS opex_cost
          FROM expenses WHERE status = 'active' AND logistic_order_id IS NOT NULL
          GROUP BY logistic_order_id
        ) opex_agg ON opex_agg.logistic_order_id = lo.id
        LEFT JOIN (
          SELECT logistic_order_id, SUM(grand_total::numeric) AS purchase_cost
          FROM purchase_documents WHERE kind = 'order' AND logistic_order_id IS NOT NULL
          GROUP BY logistic_order_id
        ) po_agg ON po_agg.logistic_order_id = lo.id
        LEFT JOIN suppliers s ON s.id = lo.approved_vendor_id
        WHERE lo.status NOT IN ('Cancelled','cancelled')

        UNION ALL

        -- Portal Product Orders (MCT Orders)
        SELECT
          ppo.id::text,
          ppo.order_number,
          ppo.customer_name,
          ppo.created_at,
          ppo.status,
          'portal_product_order'::text,
          COALESCE(ppo.pickup_location, '')                                   AS origin,
          COALESCE(ppo.shipping_address, '')                                  AS destination,
          ppo.grand_total::numeric                                            AS revenue,
          COALESCE(ppo.vendor_quoted_price::numeric, 0)                      AS vendor_cost,
          COALESCE(ppo.truck_cost::numeric, 0)                               AS truck_cost,
          0::numeric                                                          AS tax,
          (ppo.grand_total::numeric
            - COALESCE(ppo.vendor_quoted_price::numeric, 0)
            - COALESCE(ppo.truck_cost::numeric, 0))                          AS gross_margin,
          0::numeric                                                          AS opex_cost,
          0::numeric                                                          AS purchase_cost,
          ppo.vendor_name_selected                                            AS vendor_name,
          ppo.company_id                                                      AS company_id
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
      )
      SELECT
        id,
        order_number,
        customer_name,
        created_at_ts::text                                                   AS created_at,
        status,
        source_type,
        origin,
        destination,
        revenue,
        vendor_cost,
        truck_cost,
        tax,
        gross_margin,
        CASE WHEN revenue > 0
          THEN ROUND(gross_margin / revenue * 100, 1)
          ELSE 0
        END                                                                   AS margin_pct,
        opex_cost,
        purchase_cost,
        (gross_margin - opex_cost)                                            AS net_margin,
        CASE WHEN revenue > 0
          THEN ROUND((gross_margin - opex_cost) / revenue * 100, 1)
          ELSE 0
        END                                                                   AS net_margin_pct,
        vendor_name
      FROM src
      WHERE TRUE
        ${companyId !== null ? sql`AND (company_id = ${companyId} OR (source_type = 'portal_product_order' AND company_id IS NULL))` : sql``}
        ${search ? sql`AND (order_number ILIKE ${'%' + search + '%'} OR customer_name ILIKE ${'%' + search + '%'})` : sql``}
        ${dateFrom ? sql`AND created_at_ts >= ${dateFrom}` : sql``}
        ${dateTo   ? sql`AND created_at_ts <= ${dateTo}`   : sql``}
      ORDER BY created_at_ts DESC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const countRes = await db.execute<{ cnt: string }>(sql`
      SELECT COUNT(*)::text AS cnt FROM (
        SELECT lo.id, lo.company_id, 'logistic_order'::text AS source_type, lo.created_at AS ts, lo.order_number, lo.customer_name
        FROM logistic_orders lo WHERE lo.status NOT IN ('Cancelled','cancelled')
        UNION ALL
        SELECT ppo.id, ppo.company_id, 'portal_product_order'::text, ppo.created_at, ppo.order_number, ppo.customer_name
        FROM portal_product_orders ppo WHERE ppo.status NOT IN ('Cancelled','cancelled')
      ) combined
      WHERE TRUE
        ${companyId !== null ? sql`AND (company_id = ${companyId} OR (source_type = 'portal_product_order' AND company_id IS NULL))` : sql``}
        ${search ? sql`AND (order_number ILIKE ${'%' + search + '%'} OR customer_name ILIKE ${'%' + search + '%'})` : sql``}
        ${dateFrom ? sql`AND ts >= ${dateFrom}` : sql``}
        ${dateTo   ? sql`AND ts <= ${dateTo}`   : sql``}
    `);

    return res.json({
      rows: rows.rows.map(r => ({
        id:           Number(r.id),
        orderNumber:  r.order_number,
        customerName: r.customer_name,
        createdAt:    r.created_at,
        status:       r.status,
        sourceType:   r.source_type,
        origin:       r.origin,
        destination:  r.destination,
        revenue:      Number(r.revenue),
        vendorCost:   Number(r.vendor_cost),
        truckCost:    Number(r.truck_cost),
        tax:          Number(r.tax),
        grossMargin:  Number(r.gross_margin),
        margin:       Number(r.gross_margin),
        marginPct:    Number(r.margin_pct),
        opexCost:     Number(r.opex_cost),
        purchaseCost: Number(r.purchase_cost),
        netMargin:    Number(r.net_margin),
        netMarginPct: Number(r.net_margin_pct),
        vendorName:   r.vendor_name ?? null,
      })),
      total:  Number((countRes.rows[0] as { cnt: string } | undefined)?.cnt ?? 0),
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
      WITH src AS (
        SELECT
          lo.customer_name,
          lo.grand_total::numeric                                             AS grand_total,
          lo.status,
          COALESCE(loq_agg.vendor_cost, 0)::numeric                          AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax,
          lo.company_id,
          'logistic_order'::text                                              AS source_type
        FROM logistic_orders lo
        LEFT JOIN (
          SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
          FROM logistic_order_quotes GROUP BY order_id
        ) loq_agg ON loq_agg.order_id = lo.id
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
          0::numeric                                                          AS tax,
          ppo.company_id,
          'portal_product_order'::text
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      )
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
      FROM src
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
// (Vendor analytics: spend, win rate, performance — logistic_orders only)
router.get("/vendors", async (req, res) => {
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
// Portal orders use product_category as commodity
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
      WITH src AS (
        SELECT
          COALESCE(NULLIF(TRIM(lo.commodity), ''), '(tidak diisi)')          AS commodity,
          lo.grand_total::numeric                                             AS grand_total,
          COALESCE(loq_agg.vendor_cost, 0)::numeric                          AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax,
          lo.company_id,
          'logistic_order'::text                                              AS source_type
        FROM logistic_orders lo
        LEFT JOIN (
          SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
          FROM logistic_order_quotes GROUP BY order_id
        ) loq_agg ON loq_agg.order_id = lo.id
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
          0::numeric,
          ppo.company_id,
          'portal_product_order'::text
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      )
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
      FROM src
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
// Portal orders use pickup_location as origin, shipping_address as destination
router.get("/routes", async (req, res) => {
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
      WITH src AS (
        SELECT
          COALESCE(NULLIF(TRIM(lo.origin), ''), '(tidak diisi)')             AS origin,
          COALESCE(NULLIF(TRIM(lo.destination), ''), '(tidak diisi)')        AS destination,
          lo.grand_total::numeric                                             AS grand_total,
          COALESCE(loq_agg.vendor_cost, 0)::numeric                          AS vendor_cost,
          COALESCE(lo.truck_price::numeric, 0)                               AS truck_cost,
          COALESCE(lo.tax::numeric, 0)                                       AS tax,
          lo.company_id,
          'logistic_order'::text                                              AS source_type
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

        UNION ALL

        SELECT
          COALESCE(NULLIF(TRIM(ppo.pickup_location), ''), '(tidak diisi)')   AS origin,
          COALESCE(NULLIF(TRIM(ppo.shipping_address), ''), '(tidak diisi)')  AS destination,
          ppo.grand_total::numeric,
          COALESCE(ppo.vendor_quoted_price::numeric, 0),
          COALESCE(ppo.truck_cost::numeric, 0),
          0::numeric,
          ppo.company_id,
          'portal_product_order'::text
        FROM portal_product_orders ppo
        WHERE ppo.status NOT IN ('Cancelled','cancelled')
          AND NULLIF(TRIM(ppo.pickup_location), '') IS NOT NULL
          AND NULLIF(TRIM(ppo.shipping_address), '') IS NOT NULL
          ${companyId !== null ? sql`AND (ppo.company_id = ${companyId} OR ppo.company_id IS NULL)` : sql``}
          ${dateFrom ? sql`AND ppo.created_at >= ${dateFrom}` : sql``}
          ${dateTo   ? sql`AND ppo.created_at <= ${dateTo}`   : sql``}
      )
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
      FROM src
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
