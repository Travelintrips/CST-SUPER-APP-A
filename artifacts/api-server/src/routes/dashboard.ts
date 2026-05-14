import { Router } from "express";
import { db, ordersTable, shipmentsTable, stocksTable, transactionsTable, productsTable, freightShipmentsTable, apiResponseTimesTable, salesDocumentsTable } from "@workspace/db";
import { sql, and, ne, eq, gte, lt } from "drizzle-orm";
import { getRecentResponseTimesFromDb } from "../lib/responseTimeLog";

const router = Router();

// GET /api/dashboard/summary
router.get("/summary", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const now = new Date();
  const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfPrevMonth = startOfThisMonth;

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
    // Sales metrics
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
      .where(and(ne(freightShipmentsTable.status, "cancelled"), ne(freightShipmentsTable.status, "completed"))),
    db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
      .where(eq(freightShipmentsTable.status, "rfq_sent")),
    db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
      .where(eq(freightShipmentsTable.status, "in_transit")),
    // Revenue dari sales orders bulan ini (confirmed/done)
    db.select({ total: sql<number>`coalesce(sum(grand_total), 0)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfThisMonth),
      )),
    // Revenue dari sales orders bulan lalu
    db.select({ total: sql<number>`coalesce(sum(grand_total), 0)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfPrevMonth),
        lt(salesDocumentsTable.createdAt, endOfPrevMonth),
      )),
    // Jumlah order bulan ini
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfThisMonth),
      )),
    // Jumlah order bulan lalu
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        sql`status IN ('confirmed','done')`,
        gte(salesDocumentsTable.createdAt, startOfPrevMonth),
        lt(salesDocumentsTable.createdAt, endOfPrevMonth),
      )),
    // Quotation aktif (draft/sent)
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "quote"),
        sql`status IN ('draft','sent')`,
      )),
    // Sales orders confirmed (all time, belum done)
    db.select({ count: sql<number>`count(*)` })
      .from(salesDocumentsTable)
      .where(and(
        eq(salesDocumentsTable.kind, "order"),
        eq(salesDocumentsTable.status, "confirmed"),
      )),
    // Tren revenue 6 bulan terakhir
    db.execute<{ month: string; revenue: string }>(sql`
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
    // Sales metrics
    salesRevenueThisMonth: Number(salesRevenueThisMonth.total),
    salesRevenuePrevMonth: Number(salesRevenuePrevMonth.total),
    salesOrdersThisMonth: Number(salesOrdersThisMonth.count),
    salesOrdersPrevMonth: Number(salesOrdersPrevMonth.count),
    quotesActive: Number(quotesActive.count),
    salesOrdersConfirmed: Number(salesOrdersConfirmed.count),
    monthlyRevenueTrend: trend,
  });
});

// GET /api/dashboard/response-times?path=<path-fragment>
// Returns the rolling log of response times, optionally filtered by path.
router.get("/response-times", async (req, res) => {
  const pathFilter = typeof req.query["path"] === "string" ? req.query["path"] : undefined;
  const entries = await getRecentResponseTimesFromDb(pathFilter);
  return res.json({ entries });
});

// GET /api/dashboard/response-time-stats?path=<fragment>&window=<24h|7d|30d>
// Returns per-path aggregate stats (count, min, max, avg, p95) computed in the DB.
// ?window limits results to the last 24h / 7d / 30d (default: 24h; returns 400 for
// unknown values so the client can catch misconfiguration early).
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

    // Aggregate in the DB — no row-cap issue, parameterised interval (no sql.raw)
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
