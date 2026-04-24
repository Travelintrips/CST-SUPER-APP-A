import { Router } from "express";
import { db, stocksTable, suppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { postStockReceived } from "../lib/accounting.js";

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
  void postStockReceived({
    stockId: stock.id,
    productName: stock.productName,
    quantity: stock.quantity,
    costPrice: Number(stock.costPrice),
  });
  return res.status(201).json({ ...stock, costPrice: Number(stock.costPrice), createdAt: stock.createdAt.toISOString() });
});

// PUT /api/trading/stocks/:id
router.put("/stocks/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { productName, sku, quantity, unit, costPrice, supplierId, hsCode } = req.body;
  const patch: Record<string, unknown> = {};
  if (typeof productName === "string") patch["productName"] = productName;
  if (typeof sku === "string") patch["sku"] = sku;
  if (typeof quantity === "number") patch["quantity"] = quantity;
  if (typeof unit === "string") patch["unit"] = unit;
  if (typeof costPrice === "number") patch["costPrice"] = String(costPrice);
  if (supplierId !== undefined) patch["supplierId"] = supplierId;
  if (hsCode !== undefined) patch["hsCode"] = hsCode;

  const [updated] = await db.update(stocksTable).set(patch).where(eq(stocksTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Stock item not found" });
  return res.json({ ...updated, costPrice: Number(updated.costPrice), createdAt: updated.createdAt.toISOString() });
});

// DELETE /api/trading/stocks/:id
router.delete("/stocks/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db.delete(stocksTable).where(eq(stocksTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Stock item not found" });
  return res.json({ message: "Deleted", id });
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

// PUT /api/trading/suppliers/:id
router.put("/suppliers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { name, country, contactEmail, phone, address } = req.body;
  const patch: Record<string, unknown> = {};
  if (typeof name === "string") patch["name"] = name;
  if (typeof country === "string") patch["country"] = country;
  if (typeof contactEmail === "string") patch["contactEmail"] = contactEmail;
  if (phone !== undefined) patch["phone"] = phone;
  if (address !== undefined) patch["address"] = address;

  const [updated] = await db.update(suppliersTable).set(patch).where(eq(suppliersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Supplier not found" });
  return res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// DELETE /api/trading/suppliers/:id
router.delete("/suppliers/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Supplier not found" });
  return res.json({ message: "Deleted", id });
});

export default router;
