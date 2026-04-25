import { Router } from "express";
import { db, ordersTable, shipmentsTable, stocksTable, transactionsTable, productsTable, freightShipmentsTable } from "@workspace/db";
import { sql, and, ne, eq } from "drizzle-orm";

const router = Router();

// GET /api/dashboard/summary
router.get("/summary", async (req, res) => {
  const [orderCount] = await db.select({ count: sql<number>`count(*)` }).from(ordersTable);
  const [revenue] = await db.select({ total: sql<number>`coalesce(sum(total_amount), 0)` }).from(ordersTable);
  const [shipmentCount] = await db.select({ count: sql<number>`count(*)` }).from(shipmentsTable);
  const [stockValue] = await db.select({ total: sql<number>`coalesce(sum(cost_price * quantity), 0)` }).from(stocksTable);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [todayTx] = await db.select({ count: sql<number>`count(*)` }).from(transactionsTable)
    .where(sql`created_at >= ${today.toISOString()}`);

  const [lowStock] = await db.select({ count: sql<number>`count(*)` }).from(productsTable)
    .where(sql`stock < 10`);

  const [activeFreight] = await db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
    .where(and(ne(freightShipmentsTable.status, "cancelled"), ne(freightShipmentsTable.status, "completed")));

  const [awaitingQuote] = await db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
    .where(eq(freightShipmentsTable.status, "rfq_sent"));

  const [inTransit] = await db.select({ count: sql<number>`count(*)` }).from(freightShipmentsTable)
    .where(eq(freightShipmentsTable.status, "in_transit"));

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

export default router;
