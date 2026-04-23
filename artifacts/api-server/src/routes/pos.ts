import { Router } from "express";
import { db, transactionsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

// GET /api/pos/transactions
router.get("/transactions", async (_req, res) => {
  const transactions = await db.select().from(transactionsTable).orderBy(transactionsTable.createdAt);
  return res.json(transactions.map(t => ({
    ...t,
    unitPrice: Number(t.unitPrice),
    totalPrice: Number(t.totalPrice),
    createdAt: t.createdAt.toISOString(),
  })));
});

// POST /api/pos/transactions
router.post("/transactions", async (req, res) => {
  const { userId } = getAuth(req);
  const { productName, quantity, unitPrice, totalPrice, paymentMethod } = req.body;
  const [transaction] = await db.insert(transactionsTable).values({
    productName, quantity, unitPrice: String(unitPrice), totalPrice: String(totalPrice),
    paymentMethod, cashierId: userId || undefined
  }).returning();
  return res.status(201).json({
    ...transaction,
    unitPrice: Number(transaction.unitPrice),
    totalPrice: Number(transaction.totalPrice),
    createdAt: transaction.createdAt.toISOString(),
  });
});

// GET /api/pos/summary
router.get("/summary", async (_req, res) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [todayStats] = await db.select({
    total: sql<number>`coalesce(sum(total_price), 0)`,
    count: sql<number>`count(*)`
  }).from(transactionsTable).where(sql`created_at >= ${today.toISOString()}`);

  const [monthStats] = await db.select({
    total: sql<number>`coalesce(sum(total_price), 0)`,
    count: sql<number>`count(*)`
  }).from(transactionsTable).where(sql`created_at >= ${monthStart.toISOString()}`);

  const [topProduct] = await db.select({
    name: transactionsTable.productName,
    total: sql<number>`sum(total_price)`
  }).from(transactionsTable)
    .where(sql`created_at >= ${monthStart.toISOString()}`)
    .groupBy(transactionsTable.productName)
    .orderBy(sql`sum(total_price) desc`)
    .limit(1);

  return res.json({
    todayTotal: Number(todayStats.total),
    todayCount: Number(todayStats.count),
    monthTotal: Number(monthStats.total),
    monthCount: Number(monthStats.count),
    topProduct: topProduct?.name || null,
  });
});

export default router;
