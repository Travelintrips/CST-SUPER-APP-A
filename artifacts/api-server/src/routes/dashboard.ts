import { Router } from "express";
import { db, ordersTable, shipmentsTable, stocksTable, transactionsTable, productsTable, freightShipmentsTable, apiResponseTimesTable } from "@workspace/db";
import { sql, and, ne, eq } from "drizzle-orm";
import { getRecentResponseTimesFromDb } from "../lib/responseTimeLog";

const router = Router();

// GET /api/dashboard/summary
router.get("/summary", async (req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

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
  ]);

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
