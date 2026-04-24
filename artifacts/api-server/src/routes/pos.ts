import { Router } from "express";
import { db, transactionsTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorageService = new ObjectStorageService();

function safeNormalizeDoc(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  try {
    return objectStorageService.normalizeObjectEntityPath(value);
  } catch {
    return null;
  }
}

function serializeTransaction(t: typeof transactionsTable.$inferSelect) {
  return {
    ...t,
    unitPrice: Number(t.unitPrice),
    totalPrice: Number(t.totalPrice),
    createdAt: t.createdAt.toISOString(),
  };
}

// GET /api/pos/transactions
router.get("/transactions", async (_req, res) => {
  const transactions = await db.select().from(transactionsTable).orderBy(transactionsTable.createdAt);
  return res.json(transactions.map(serializeTransaction));
});

// POST /api/pos/transactions
router.post("/transactions", async (req, res) => {
  const { userId } = getAuth(req);
  const { productName, quantity, unitPrice, totalPrice, paymentMethod, documentUrl } = req.body;
  const normalizedDoc = safeNormalizeDoc(documentUrl);
  const [transaction] = await db.insert(transactionsTable).values({
    productName, quantity, unitPrice: String(unitPrice), totalPrice: String(totalPrice),
    paymentMethod, cashierId: userId || undefined,
    documentUrl: normalizedDoc,
  }).returning();
  return res.status(201).json(serializeTransaction(transaction));
});

// PATCH /api/pos/transactions/:id/document
router.patch("/transactions/:id/document", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const { documentUrl } = req.body;
  const normalized = safeNormalizeDoc(documentUrl);
  const [transaction] = await db.update(transactionsTable)
    .set({ documentUrl: normalized })
    .where(eq(transactionsTable.id, id))
    .returning();
  if (!transaction) return res.status(404).json({ error: "Transaction not found" });
  return res.json(serializeTransaction(transaction));
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
