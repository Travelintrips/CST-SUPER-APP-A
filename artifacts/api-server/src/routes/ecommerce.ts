import { Router } from "express";
import { db, productsTable, ordersTable, productCategoriesTable, productCategoryMapTable } from "@workspace/db";
import { eq, count, inArray } from "drizzle-orm";
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

async function getProductCategories(productIds: number[]): Promise<Map<number, string[]>> {
  if (productIds.length === 0) return new Map();
  const rows = await db
    .select({
      productId: productCategoryMapTable.productId,
      categoryName: productCategoriesTable.name,
    })
    .from(productCategoryMapTable)
    .innerJoin(productCategoriesTable, eq(productCategoryMapTable.categoryId, productCategoriesTable.id))
    .where(inArray(productCategoryMapTable.productId, productIds));

  const map = new Map<number, string[]>();
  for (const row of rows) {
    if (!map.has(row.productId)) map.set(row.productId, []);
    map.get(row.productId)!.push(row.categoryName);
  }
  return map;
}

function resolveCategories(
  p: typeof productsTable.$inferSelect,
  categoryMap: Map<number, string[]>
): string[] {
  return categoryMap.get(p.id) ?? [];
}

function serializeProduct(
  p: typeof productsTable.$inferSelect,
  categories: string[]
) {
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
    categories,
  };
}

// GET /api/ecommerce/product-categories
router.get("/product-categories", async (_req, res) => {
  const categories = await db
    .select({
      id: productCategoriesTable.id,
      name: productCategoriesTable.name,
      createdAt: productCategoriesTable.createdAt,
      productCount: count(productCategoryMapTable.productId),
    })
    .from(productCategoriesTable)
    .leftJoin(productCategoryMapTable, eq(productCategoryMapTable.categoryId, productCategoriesTable.id))
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
    const [updated] = await db.update(productCategoriesTable).set({ name }).where(eq(productCategoriesTable.id, id)).returning();
    const [{ value: productCount }] = await db
      .select({ value: count() })
      .from(productCategoryMapTable)
      .where(eq(productCategoryMapTable.categoryId, updated.id));
    return res.json({ ...updated, createdAt: updated.createdAt.toISOString(), productCount });
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
  const [{ value: usageCount }] = await db
    .select({ value: count() })
    .from(productCategoryMapTable)
    .where(eq(productCategoryMapTable.categoryId, id));
  if (usageCount > 0) {
    return res.status(409).json({ message: `Kategori ini digunakan oleh ${usageCount} produk. Ubah kategori produk tersebut terlebih dahulu.` });
  }
  await db.delete(productCategoriesTable).where(eq(productCategoriesTable.id, id));
  return res.json({ message: "Category deleted" });
});

// GET /api/ecommerce/products
router.get("/products", async (_req, res) => {
  const products = await db.select().from(productsTable).orderBy(productsTable.createdAt);
  const categoryMap = await getProductCategories(products.map((p) => p.id));
  return res.json(products.map((p) => serializeProduct(p, resolveCategories(p, categoryMap))));
});

// POST /api/ecommerce/products
router.post("/products", async (req, res) => {
  const { name, sku, price, stock, categories, description, imageUrl, defaultSalesTaxId, defaultPurchaseTaxId } = req.body;
  const categoryNames: string[] = Array.isArray(categories) ? categories.map(String) : [];
  if (categoryNames.length === 0) return res.status(400).json({ message: "At least one category is required" });

  const validCats = await db
    .select()
    .from(productCategoriesTable)
    .where(inArray(productCategoriesTable.name, categoryNames));
  if (validCats.length !== categoryNames.length) {
    return res.status(400).json({ message: "One or more categories do not exist in the predefined list" });
  }

  const product = await db.transaction(async (tx) => {
    const [p] = await tx.insert(productsTable).values({
      name, sku, price: String(price), stock: stock ?? 0,
      description,
      imageUrl: normalizeImage(imageUrl),
      defaultSalesTaxId: defaultSalesTaxId ?? null,
      defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
    }).returning();
    await tx.insert(productCategoryMapTable).values(
      validCats.map((c) => ({ productId: p.id, categoryId: c.id }))
    );
    return p;
  });

  return res.status(201).json(serializeProduct(product, categoryNames));
});

// GET /api/ecommerce/products/:id
router.get("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, id));
  if (!product) return res.status(404).json({ message: "Product not found" });
  const categoryMap = await getProductCategories([id]);
  return res.json(serializeProduct(product, resolveCategories(product, categoryMap)));
});

// PUT /api/ecommerce/products/:id
router.put("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { name, sku, price, stock, categories, description, imageUrl, defaultSalesTaxId, defaultPurchaseTaxId } = req.body;
  const categoryNames: string[] = Array.isArray(categories) ? categories.map(String) : [];
  if (categoryNames.length === 0) return res.status(400).json({ message: "At least one category is required" });

  const validCats = await db
    .select()
    .from(productCategoriesTable)
    .where(inArray(productCategoriesTable.name, categoryNames));
  if (validCats.length !== categoryNames.length) {
    return res.status(400).json({ message: "One or more categories do not exist in the predefined list" });
  }

  const product = await db.transaction(async (tx) => {
    const [p] = await tx.update(productsTable).set({
      name, sku, price: String(price), stock,
      description,
      imageUrl: normalizeImage(imageUrl),
      defaultSalesTaxId: defaultSalesTaxId ?? null,
      defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
    }).where(eq(productsTable.id, id)).returning();
    if (!p) return null;
    await tx.delete(productCategoryMapTable).where(eq(productCategoryMapTable.productId, id));
    await tx.insert(productCategoryMapTable).values(
      validCats.map((c) => ({ productId: id, categoryId: c.id }))
    );
    return p;
  });

  if (!product) return res.status(404).json({ message: "Product not found" });
  return res.json(serializeProduct(product, categoryNames));
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
    lineItems: o.lineItems ?? null,
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
  const { customerName, customerEmail, items, lineItems, totalAmount, taxAmount: rawTax } = req.body;
  const parsedLineItems: Array<{ name: string; qty: number; unitPrice: number }> | null =
    Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : null;
  const computedSubtotal = parsedLineItems
    ? parsedLineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0)
    : Number(totalAmount);
  const subtotal = computedSubtotal;
  const tax = Number(rawTax ?? 0);
  const grand = subtotal + tax;
  const legacyItems: string | null = items ?? null;
  const [order] = await db.insert(ordersTable).values({
    customerName, customerEmail,
    items: legacyItems,
    lineItems: parsedLineItems,
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
  const { customerName, customerEmail, items, lineItems, totalAmount, taxAmount: rawTax, status } = req.body;
  const parsedLineItems: Array<{ name: string; qty: number; unitPrice: number }> | null =
    Array.isArray(lineItems) && lineItems.length > 0 ? lineItems : null;
  const computedSubtotal = parsedLineItems
    ? parsedLineItems.reduce((sum, li) => sum + li.qty * li.unitPrice, 0)
    : Number(totalAmount);
  const subtotal = computedSubtotal;
  const tax = Number(rawTax ?? existing.taxAmount ?? 0);
  const grand = subtotal + tax;
  const itemsUpdate = 'items' in req.body ? (items ?? null) : undefined;
  const lineItemsUpdate = 'lineItems' in req.body ? parsedLineItems : undefined;
  const [order] = await db.update(ordersTable).set({
    customerName, customerEmail,
    ...(itemsUpdate !== undefined ? { items: itemsUpdate } : {}),
    ...(lineItemsUpdate !== undefined ? { lineItems: lineItemsUpdate } : {}),
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
