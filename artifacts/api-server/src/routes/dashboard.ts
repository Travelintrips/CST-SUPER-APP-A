import { Router } from "express";
import { db, ordersTable, shipmentsTable, stocksTable, transactionsTable, productsTable, freightShipmentsTable, apiResponseTimesTable, salesDocumentsTable, companiesTable } from "@workspace/db";
import { sql, and, ne, eq, gte, lt, isNull, inArray } from "drizzle-orm";
import { getRecentResponseTimesFromDb } from "../lib/responseTimeLog";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// Resolve company scope from query params.
// ?companyId=N  → single company mode
// ?consolidated=true → all companies aggregate mode
// Returns null companyId for consolidated, or a validated number.
function resolveCompanyScope(query: Record<string, unknown>): { consolidated: boolean; companyId: number | null } {
  if (query["consolidated"] === "true") return { consolidated: true, companyId: null };
  const raw = query["companyId"];
  if (raw && typeof raw === "string") {
    const n = Number(raw);
    if (!Number.isNaN(n) && n > 0) return { consolidated: false, companyId: n };
  }
  return { consolidated: false, companyId: null };
}

// GET /api/dashboard/summary
router.get("/summary", async (req, res) => {
  const { consolidated, companyId } = resolveCompanyScope(req.query as Record<string, unknown>);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = startOfThisMonth;

  // Company filter for sales_documents
  const salesCompanyFilter = (!consolidated && companyId !== null)
    ? eq(salesDocumentsTable.companyId, companyId)
    : undefined;

  // Company filter for freight_shipments
  const freightCompanyFilter = (!consolidated && companyId !== null)
    ? eq(freightShipmentsTable.companyId, companyId)
    : undefined;

  const [
    [orderCount],
    [revenue],
    [shipmentCount],
    [stockValue],
    [todayTx],
    [lowStock],
    [activeFreight],
    [awaitingQuote],
    [inTransit],
    [salesRevenueThisMonth],
    [salesRevenuePrevMonth],
    [salesOrdersThisMonth],
    [salesOrdersPrevMonth],
    [quotesActive],
    [salesOrdersConfirmed],
    monthlyTrend,
  ] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(ordersTable),
    db.select({ total: sql<number>`coalesce(sum(total_amount), 0)` }).from(ordersTable),
    db.select({ count: sql<number>`count(*)` }).from(shipmentsTable),
    db.select({ total: sql<number>`coalesce(sum(cost_price * quantity), 0)` }).from(stocksTable),
    db.select({ count: sql<number>`count(*)` }).from(transactionsTable)
      .where(sql`created_at >= ${today.toISOString()}`),
    db.select({ count: sql<number>`count(*)` }).from(productsTable)
      .where(sql`stock < 10`),
    db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
      .where(and(
        ne(freightShipmentsTable.status, "cancelled"),
        ne(freightShipmentsTable.status, "completed"),
        freightCompanyFilter,
      )),
    db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
      .where(and(eq(freightShipmentsTable.status, "rfq_sent"), freightCompanyFilter)),
    db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
      .where(and(eq(freightShipmentsTable.status, "in_transit"), freightCompanyFilter)),
    // Revenue sales bulan ini
    db.select({ total: sql<number>`coalesce(sum(grand_total), 0)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfThisMonth),
        salesCompanyFilter,
      )),
    // Revenue sales bulan lalu
    db.select({ total: sql<number>`coalesce(sum(grand_total), 0)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfPrevMonth),
        lt(salesDocumentsTable.createdAt, endOfPrevMonth),
        salesCompanyFilter,
      )),
    // Jumlah order bulan ini
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfThisMonth),
        salesCompanyFilter,
      )),
    // Jumlah order bulan lalu
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfPrevMonth),
        lt(salesDocumentsTable.createdAt, endOfPrevMonth),
        salesCompanyFilter,
      )),
    // Quotation aktif
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "quote"),
        sql`status IN ('draft','sent')`,
        salesCompanyFilter,
      )),
    // Sales orders confirmed
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        eq(salesDocumentsTable.status, "confirmed"),
        salesCompanyFilter,
      )),
    // Tren revenue 6 bulan
    companyId !== null && !consolidated
      ? db.execute<{ month: string; revenue: string }>(sql`
          SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                 coalesce(sum(grand_total), 0)::text AS revenue
          FROM sales_documents
          WHERE kind = 'order'
            AND status IN ('confirmed','done')
            AND created_at >= date_trunc('month', now()) - INTERVAL '5 months'
            AND company_id = ${companyId}
          GROUP BY date_trunc('month', created_at)
          ORDER BY 1
        `)
      : db.execute<{ month: string; revenue: string }>(sql`
          SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
                 coalesce(sum(grand_total), 0)::text AS revenue
          FROM sales_documents
          WHERE kind = 'order'
            AND status IN ('confirmed','done')
            AND created_at >= date_trunc('month', now()) - INTERVAL '5 months'
          GROUP BY date_trunc('month', created_at)
          ORDER BY 1
        `),
  ]);

  const trend = monthlyTrend.rows.map((r) => ({
    month: r.month,
    revenue: Number(r.revenue),
  }));

  // Per-company breakdown for consolidated mode
  let perCompany: Array<{ companyId: number; companyName: string; companyCode: string; revenueThisMonth: number; ordersThisMonth: number; contribution: number }> = [];
  if (consolidated) {
    const breakdown = await db.execute<{ company_id: string; company_name: string; company_code: string; revenue: string; orders: string }>(sql`
      SELECT
        c.id::text AS company_id,
        c.company_name,
        c.company_code,
        coalesce(sum(CASE WHEN sd.kind = 'order' AND sd.status IN ('confirmed','done') AND sd.created_at >= date_trunc('month', now()) THEN sd.grand_total ELSE 0 END), 0)::text AS revenue,
        coalesce(count(CASE WHEN sd.kind = 'order' AND sd.status IN ('confirmed','done') AND sd.created_at >= date_trunc('month', now()) THEN 1 END), 0)::text AS orders
      FROM companies c
      LEFT JOIN sales_documents sd ON sd.company_id = c.id
      WHERE c.is_active = true AND c.is_holding = false
      GROUP BY c.id, c.company_name, c.company_code
      ORDER BY revenue DESC
    `);
    const totalRev = breakdown.rows.reduce((s, r) => s + Number(r.revenue), 0);
    perCompany = breakdown.rows.map((r) => ({
      companyId: Number(r.company_id),
      companyName: r.company_name,
      companyCode: r.company_code,
      revenueThisMonth: Number(r.revenue),
      ordersThisMonth: Number(r.orders),
      contribution: totalRev > 0 ? Math.round((Number(r.revenue) / totalRev) * 100) : 0,
    }));
  }

  return res.json({
    totalOrders: Number(orderCount.count),
    totalRevenue: Number(revenue.total),
    totalShipments: Number(shipmentCount.count),
    totalStockValue: Number(stockValue.total),
    todayTransactions: Number(todayTx.count),
    lowStockCount: Number(lowStock.count),
    activeFreightCount: Number(activeFreight.count),
    awaitingQuoteCount: Number(awaitingQuote.count),
    inTransitCount: Number(inTransit.count),
    salesRevenueThisMonth: Number(salesRevenueThisMonth.total),
    salesRevenuePrevMonth: Number(salesRevenuePrevMonth.total),
    salesOrdersThisMonth: Number(salesOrdersThisMonth.count),
    salesOrdersPrevMonth: Number(salesOrdersPrevMonth.count),
    quotesActive: Number(quotesActive.count),
    salesOrdersConfirmed: Number(salesOrdersConfirmed.count),
    monthlyRevenueTrend: trend,
    // Company scope metadata
    consolidated,
    companyId: companyId ?? null,
    perCompany,
  });
});

// GET /api/dashboard/response-times?path=<path-fragment>
router.get("/response-times", async (req, res) => {
  const pathFilter = typeof req.query["path"] === "string" ? req.query["path"] : undefined;
  const entries = await getRecentResponseTimesFromDb(pathFilter);
  return res.json({ entries });
});

// GET /api/dashboard/response-time-stats?path=<fragment>&window=<24h|7d|30d>
const WINDOW_INTERVALS: Record<string, string> = {
  "24h": "24 hours",
  "7d":  "7 days",
  "30d": "30 days",
};

router.get("/response-time-stats", async (req, res) => {
  try {
    const windowParam = typeof req.query["window"] === "string" ? req.query["window"] : "24h";
    if (!(windowParam in WINDOW_INTERVALS)) {
      return res.status(400).json({ error: "Invalid window. Allowed: 24h, 7d, 30d" });
    }
    const intervalStr = WINDOW_INTERVALS[windowParam]!;
    const pathFilter = typeof req.query["path"] === "string" ? req.query["path"] : undefined;

    const result = await db.execute<{
      path: string;
      count: string;
      min_ms: string;
      max_ms: string;
      avg_ms: string;
      p95_ms: string;
    }>(
      pathFilter
        ? sql`
            SELECT path,
                   COUNT(*)                                                        AS count,
                   MIN(duration_ms)                                               AS min_ms,
                   MAX(duration_ms)                                               AS max_ms,
                   ROUND(AVG(duration_ms))                                        AS avg_ms,
                   PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)     AS p95_ms
            FROM api_response_times
            WHERE timestamp >= NOW() - ${intervalStr}::interval
              AND path LIKE ${`%${pathFilter}%`}
            GROUP BY path
            ORDER BY count DESC`
        : sql`
            SELECT path,
                   COUNT(*)                                                        AS count,
                   MIN(duration_ms)                                               AS min_ms,
                   MAX(duration_ms)                                               AS max_ms,
                   ROUND(AVG(duration_ms))                                        AS avg_ms,
                   PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration_ms)     AS p95_ms
            FROM api_response_times
            WHERE timestamp >= NOW() - ${intervalStr}::interval
            GROUP BY path
            ORDER BY count DESC`,
    );

    const stats = result.rows.map((row) => ({
      path: row.path,
      count: Number(row.count),
      minMs: Number(row.min_ms),
      maxMs: Number(row.max_ms),
      avgMs: Number(row.avg_ms),
      p95Ms: Math.round(Number(row.p95_ms)),
    }));

    return res.json({ stats });
  } catch {
    return res.json({ stats: [] });
  }
});

export default router;
