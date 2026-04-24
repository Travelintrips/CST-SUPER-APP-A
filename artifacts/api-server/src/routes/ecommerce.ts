import { Router } from "express";
import { db, productsTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

// GET /api/ecommerce/products
router.get("/products", async (_req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);
  return res.json(products.map(p => ({
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
  })));
});

// POST /api/ecommerce/products
router.post("/products", async (req, res) => {
  const { name, sku, price, stock, category, description } = req.body;
  const [product] = await db.insert(productsTable).values({
    name, sku, price: String(price), stock: stock ?? 0, category, description
  }).returning();
  return res.status(201).json({ ...product, price: Number(product.price), createdAt: product.createdAt.toISOString() });
});

// GET /api/ecommerce/products/:id
router.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json({ ...product, price: Number(product.price), createdAt: product.createdAt.toISOString() });
});

// PUT /api/ecommerce/products/:id
router.put("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, sku, price, stock, category, description } = req.body;
  const [product] = await db.update(productsTable).set({
    name, sku, price: String(price), stock, category, description
  }).where(eq(productsTable.id, id)).returning();
  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json({ ...product, price: Number(product.price), createdAt: product.createdAt.toISOString() });
});

// DELETE /api/ecommerce/products/:id
router.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ message: "Product deleted" });
});

// GET /api/ecommerce/orders
router.get("/orders", async (_req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(ordersTable.createdAt);
  return res.json(orders.map(o => ({
    ...o,
    totalAmount: Number(o.totalAmount),
    createdAt: o.createdAt.toISOString(),
  })));
});

// POST /api/ecommerce/orders
router.post("/orders", async (req, res) => {
  const { customerName, customerEmail, items, totalAmount } = req.body;
  const [order] = await db.insert(ordersTable).values({
    customerName, customerEmail, items, totalAmount: String(totalAmount), status: "pending"
  }).returning();
  return res.status(201).json({ ...order, totalAmount: Number(order.totalAmount), createdAt: order.createdAt.toISOString() });
});

// PUT /api/ecommerce/orders/:id
router.put("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { customerName, customerEmail, items, totalAmount, status } = req.body;
  const [order] = await db.update(ordersTable).set({
    customerName, customerEmail, items, totalAmount: String(totalAmount), status,
  }).where(eq(ordersTable.id, id)).returning();
  if (!order) return res.status(404).json({ message: "Order not found" });
  return res.json({ ...order, totalAmount: Number(order.totalAmount), createdAt: order.createdAt.toISOString() });
});

// DELETE /api/ecommerce/orders/:id
router.delete("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(ordersTable).where(eq(ordersTable.id, id));
  return res.json({ message: "Order deleted" });
});

export default router;
