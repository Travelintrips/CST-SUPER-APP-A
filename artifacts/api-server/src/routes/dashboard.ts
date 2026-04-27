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

// GET /api/dashboard/response-time-stats?path=<path-fragment>
// Returns per-path aggregate stats (count, min, max, avg, p95) from persisted history.
// Optional ?path filter narrows rows to paths containing the fragment (LIKE %fragment%).
router.get("/response-time-stats", async (req, res) => {
  try {
    const pathFilter = typeof req.query["path"] === "string" ? req.query["path"] : undefined;
    const rows = pathFilter
      ? await db
          .select()
          .from(apiResponseTimesTable)
          .where(sql`path LIKE ${"%" + pathFilter + "%"}`)
          .orderBy(sql`id DESC`)
          .limit(2000)
      : await db
          .select()
          .from(apiResponseTimesTable)
          .orderBy(sql`id DESC`)
          .limit(2000);

    const byPath: Record<string, number[]> = {};
    for (const row of rows) {
      if (!byPath[row.path]) byPath[row.path] = [];
      byPath[row.path]!.push(row.durationMs);
    }

    const stats = Object.entries(byPath).map(([path, durations]) => {
      const sorted = [...durations].sort((a, b) => a - b);
      const count = sorted.length;
      const minMs = sorted[0]!;
      const maxMs = sorted[count - 1]!;
      const avgMs = Math.round(sorted.reduce((s, v) => s + v, 0) / count);
      const p95Ms = sorted[Math.min(Math.ceil(count * 0.95) - 1, count - 1)]!;
      return { path, count, minMs, maxMs, avgMs, p95Ms };
    });

    stats.sort((a, b) => b.count - a.count);
    return res.json({ stats });
  } catch {
    return res.json({ stats: [] });
  }
});

export default router;
