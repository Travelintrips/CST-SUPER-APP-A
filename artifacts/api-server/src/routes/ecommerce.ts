import { Router } from "express";
import { db, productsTable, ordersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { postEcommerceOrder } from "../lib/accounting.js";

const router = Router();
const objectStorageService = new ObjectStorageService();

function normalizeImage(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  try {
    return objectStorageService.normalizeObjectEntityPath(value);
  } catch {
    return null;
  }
}

function serializeProduct(p: typeof productsTable.$inferSelect) {
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
  };
}

// GET /api/ecommerce/products
router.get("/products", async (_req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);
  return res.json(products.map(serializeProduct));
});

// POST /api/ecommerce/products
router.post("/products", async (req, res) => {
  const { name, sku, price, stock, category, description, imageUrl, defaultSalesTaxId, defaultPurchaseTaxId } = req.body;
  const [product] = await db.insert(productsTable).values({
    name, sku, price: String(price), stock: stock ?? 0, category, description,
    imageUrl: normalizeImage(imageUrl),
    defaultSalesTaxId: defaultSalesTaxId ?? null,
    defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
  }).returning();
  return res.status(201).json(serializeProduct(product));
});

// GET /api/ecommerce/products/:id
router.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json(serializeProduct(product));
});

// PUT /api/ecommerce/products/:id
router.put("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, sku, price, stock, category, description, imageUrl, defaultSalesTaxId, defaultPurchaseTaxId } = req.body;
  const [product] = await db.update(productsTable).set({
    name, sku, price: String(price), stock, category, description,
    imageUrl: normalizeImage(imageUrl),
    defaultSalesTaxId: defaultSalesTaxId ?? null,
    defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
  }).where(eq(productsTable.id, id)).returning();
  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json(serializeProduct(product));
});

// DELETE /api/ecommerce/products/:id
router.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ message: "Product deleted" });
});

function serializeOrder(o: typeof ordersTable.$inferSelect) {
  const totalAmount = Number(o.totalAmount);
  const taxAmount = Number(o.taxAmount ?? 0);
  const grandTotal = Number(o.grandTotal ?? totalAmount);
  return {
    ...o,
    totalAmount,
    taxAmount,
    grandTotal,
    createdAt: o.createdAt.toISOString(),
  };
}

// GET /api/ecommerce/orders
router.get("/orders", async (_req, res) => {
  const orders = await db.select().from(ordersTable).orderBy(ordersTable.createdAt);
  return res.json(orders.map(serializeOrder));
});

// POST /api/ecommerce/orders
router.post("/orders", async (req, res) => {
  const { customerName, customerEmail, items, totalAmount, taxAmount: rawTax } = req.body;
  const subtotal = Number(totalAmount);
  const tax = Number(rawTax ?? 0);
  const grand = subtotal + tax;
  const [order] = await db.insert(ordersTable).values({
    customerName, customerEmail, items,
    totalAmount: String(subtotal),
    taxAmount: String(tax),
    grandTotal: String(grand),
    status: "pending",
  }).returning();
  return res.status(201).json(serializeOrder(order));
});

// PUT /api/ecommerce/orders/:id
router.put("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) return res.status(404).json({ message: "Order not found" });
  const { customerName, customerEmail, items, totalAmount, taxAmount: rawTax, status } = req.body;
  const subtotal = Number(totalAmount);
  const tax = Number(rawTax ?? existing.taxAmount ?? 0);
  const grand = subtotal + tax;
  const [order] = await db.update(ordersTable).set({
    customerName, customerEmail, items,
    totalAmount: String(subtotal),
    taxAmount: String(tax),
    grandTotal: String(grand),
    status,
  }).where(eq(ordersTable.id, id)).returning();
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (status === "delivered" && existing.status !== "delivered") {
    void postEcommerceOrder({
      orderId: order.id,
      customerName: order.customerName,
      totalAmount: Number(order.totalAmount),
      taxAmount: Number(order.taxAmount ?? 0),
      grandTotal: Number(order.grandTotal),
    });
  }
  return res.json(serializeOrder(order));
});

// DELETE /api/ecommerce/orders/:id
router.delete("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(ordersTable).where(eq(ordersTable.id, id));
  return res.json({ message: "Order deleted" });
});

export default router;
