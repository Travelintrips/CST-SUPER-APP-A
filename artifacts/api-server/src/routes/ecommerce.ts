import { Router } from "express";
import { db, productsTable, ordersTable, productCategoriesTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
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

// GET /api/ecommerce/product-categories
router.get("/product-categories", async (_req, res) => {
  const categories = await db
    .select({
      id: productCategoriesTable.id,
      name: productCategoriesTable.name,
      createdAt: productCategoriesTable.createdAt,
      productCount: count(productsTable.id),
    })
    .from(productCategoriesTable)
    .leftJoin(productsTable, eq(productsTable.category, productCategoriesTable.name))
    .groupBy(productCategoriesTable.id, productCategoriesTable.name, productCategoriesTable.createdAt)
    .orderBy(productCategoriesTable.name);
  return res.json(categories.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })));
});

// POST /api/ecommerce/product-categories
router.post("/product-categories", async (req, res) => {
  const name = (req.body.name ?? "").toString().trim();
  if (!name) return res.status(400).json({ message: "Name is required" });
  try {
    const [category] = await db.insert(productCategoriesTable).values({ name }).returning();
    return res.status(201).json({ ...category, createdAt: category.createdAt.toISOString(), productCount: 0 });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique constraint")) {
      return res.status(409).json({ message: "Category name already exists" });
    }
    throw err;
  }
});

// PUT /api/ecommerce/product-categories/:id
router.put("/product-categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid category id" });
  const name = (req.body.name ?? "").toString().trim();
  if (!name) return res.status(400).json({ message: "Name is required" });
  try {
    const [existing] = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.id, id));
    if (!existing) return res.status(404).json({ message: "Category not found" });
    const oldName = existing.name;
    const category = await db.transaction(async (tx) => {
      const [updated] = await tx.update(productCategoriesTable).set({ name }).where(eq(productCategoriesTable.id, id)).returning();
      if (oldName !== name) {
        await tx.update(productsTable).set({ category: name }).where(eq(productsTable.category, oldName));
      }
      return updated;
    });
    const [{ value: productCount }] = await db.select({ value: count() }).from(productsTable).where(eq(productsTable.category, category.name));
    return res.json({ ...category, createdAt: category.createdAt.toISOString(), productCount });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("unique constraint")) {
      return res.status(409).json({ message: "Category name already exists" });
    }
    throw err;
  }
});

// DELETE /api/ecommerce/product-categories/:id
router.delete("/product-categories/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid category id" });
  const [existing] = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.id, id));
  if (!existing) return res.status(404).json({ message: "Category not found" });
  const [{ value: usageCount }] = await db.select({ value: count() }).from(productsTable).where(eq(productsTable.category, existing.name));
  if (usageCount > 0) {
    return res.status(409).json({ message: `Kategori ini digunakan oleh ${usageCount} produk. Ubah kategori produk tersebut terlebih dahulu.` });
  }
  await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, id));
  return res.json({ message: "Category deleted" });
});

// GET /api/ecommerce/products
router.get("/products", async (_req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);
  return res.json(products.map(serializeProduct));
});

// POST /api/ecommerce/products
router.post("/products", async (req, res) => {
  const { name, sku, price, stock, category, description, imageUrl, defaultSalesTaxId, defaultPurchaseTaxId } = req.body;
  const categoryName = (category ?? "").toString().trim();
  if (!categoryName) return res.status(400).json({ message: "Category is required" });
  const [validCat] = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.name, categoryName));
  if (!validCat) return res.status(400).json({ message: "Category does not exist in the predefined list" });
  const [product] = await db.insert(productsTable).values({
    name, sku, price: String(price), stock: stock ?? 0, category: categoryName, description,
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
  const categoryName = (category ?? "").toString().trim();
  if (!categoryName) return res.status(400).json({ message: "Category is required" });
  const [validCat] = await db.select().from(productCategoriesTable).where(eq(productCategoriesTable.name, categoryName));
  if (!validCat) return res.status(400).json({ message: "Category does not exist in the predefined list" });
  const [product] = await db.update(productsTable).set({
    name, sku, price: String(price), stock, category: categoryName, description,
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
