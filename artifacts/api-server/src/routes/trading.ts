import { Router } from "express";
import { db, stocksTable, suppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/trading/stocks
router.get("/stocks", async (_req, res) => {
  const stocks = await db.select().from(stocksTable).orderBy(stocksTable.createdAt);
  const suppliers = await db.select().from(suppliersTable);
  const supplierMap = Object.fromEntries(suppliers.map(s => [s.id, s.name]));

  return res.json(stocks.map(s => ({
    ...s,
    costPrice: Number(s.costPrice),
    supplierName: s.supplierId ? supplierMap[s.supplierId] || null : null,
    createdAt: s.createdAt.toISOString(),
  })));
});

// POST /api/trading/stocks
router.post("/stocks", async (req, res) => {
  const { productName, sku, quantity, unit, costPrice, supplierId, hsCode } = req.body;
  const [stock] = await db.insert(stocksTable).values({
    productName, sku, quantity, unit, costPrice: String(costPrice), supplierId, hsCode
  }).returning();
  return res.status(201).json({ ...stock, costPrice: Number(stock.costPrice), createdAt: stock.createdAt.toISOString() });
});

// GET /api/trading/suppliers
router.get("/suppliers", async (_req, res) => {
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.createdAt);
  return res.json(suppliers.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })));
});

// POST /api/trading/suppliers
router.post("/suppliers", async (req, res) => {
  const { name, country, contactEmail, phone, address } = req.body;
  const [supplier] = await db.insert(suppliersTable).values({
    name, country, contactEmail, phone, address
  }).returning();
  return res.status(201).json({ ...supplier, createdAt: supplier.createdAt.toISOString() });
});

export default router;
