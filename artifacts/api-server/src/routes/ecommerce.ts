import { Router } from "express";
import { db, productsTable, ordersTable, productCategoriesTable, productCategoryMapTable } from "@workspace/db";
import { eq, count, inArray, and, ilike, or, type SQL } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { postEcommerceOrder } from "../lib/accounting.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";

const router = Router();
const objectStorageService = new ObjectStorageService();

function normalizeImage(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  // Allow external HTTP/HTTPS URLs to pass through as-is
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
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
  let unitOptions: string[] = [];
  try { unitOptions = JSON.parse(p.unitOptions ?? "[]"); } catch { /* empty */ }
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
    categories,
    itemType: p.itemType,
    unit: p.unit,
    unitOptions,
    subcategory: p.subcategory ?? null,
    isActive: p.isActive,
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
router.get("/products", async (req, res) => {
  const conds: SQL<unknown>[] = [];
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : null;
  if (search) conds.push(or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.sku, `%${search}%`))!);
  const itemType = typeof req.query["itemType"] === "string" ? req.query["itemType"] : null;
  if (itemType) conds.push(eq(productsTable.itemType, itemType));
  const subcategory = typeof req.query["subcategory"] === "string" ? req.query["subcategory"] : null;
  if (subcategory) conds.push(eq(productsTable.subcategory, subcategory));
  const activeFilter = req.query["isActive"];
  if (activeFilter === "true") conds.push(eq(productsTable.isActive, true));
  if (activeFilter === "false") conds.push(eq(productsTable.isActive, false));

  const products = await db
    .select()
    .from(productsTable)
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(productsTable.name);
  const categoryMap = await getProductCategories(products.map((p) => p.id));
  return res.json(products.map((p) => serializeProduct(p, resolveCategories(p, categoryMap))));
});

// POST /api/ecommerce/products
router.post("/products", async (req, res) => {
  const {
    name, sku, price, stock, categories, description, imageUrl, mediaItems,
    defaultSalesTaxId, defaultPurchaseTaxId,
    itemType, unit, unitOptions, subcategory, isActive,
  } = req.body;
  if (!name || !sku || price == null) return res.status(400).json({ message: "name, sku, price are required" });
  const categoryNames: string[] = Array.isArray(categories) ? categories.map(String) : [];
  if (categoryNames.length === 0) return res.status(400).json({ message: "Produk harus memiliki setidaknya satu kategori" });

  let validCats: { id: number; name: string; createdAt: Date }[] = [];
  if (categoryNames.length > 0) {
    validCats = await db
      .select()
      .from(productCategoriesTable)
      .where(inArray(productCategoriesTable.name, categoryNames));
    if (validCats.length !== categoryNames.length) {
      return res.status(400).json({ message: "One or more categories do not exist in the predefined list" });
    }
  }

  const product = await db.transaction(async (tx) => {
    const [p] = await tx.insert(productsTable).values({
      name, sku, price: String(price), stock: stock ?? 0,
      description: description ?? null,
      imageUrl: normalizeImage(imageUrl),
      mediaItems: Array.isArray(mediaItems) ? JSON.stringify(mediaItems) : "[]",
      defaultSalesTaxId: defaultSalesTaxId ?? null,
      defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
      itemType: itemType ?? "barang",
      unit: unit ?? "pcs",
      unitOptions: Array.isArray(unitOptions) ? JSON.stringify(unitOptions) : "[]",
      subcategory: subcategory ?? null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    }).returning();
    if (validCats.length > 0) {
      await tx.insert(productCategoryMapTable).values(
        validCats.map((c) => ({ productId: p.id, categoryId: c.id }))
      );
    }
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
  const {
    name, sku, price, stock, categories, description, imageUrl, mediaItems,
    defaultSalesTaxId, defaultPurchaseTaxId,
    itemType, unit, unitOptions, subcategory, isActive,
  } = req.body;
  const categoryNames: string[] = Array.isArray(categories) ? categories.map(String) : [];
  if (categoryNames.length === 0) return res.status(400).json({ message: "Produk harus memiliki setidaknya satu kategori" });

  let validCats: { id: number; name: string; createdAt: Date }[] = [];
  if (categoryNames.length > 0) {
    validCats = await db
      .select()
      .from(productCategoriesTable)
      .where(inArray(productCategoriesTable.name, categoryNames));
    if (validCats.length !== categoryNames.length) {
      return res.status(400).json({ message: "One or more categories do not exist in the predefined list" });
    }
  }

  const product = await db.transaction(async (tx) => {
    const [p] = await tx.update(productsTable).set({
      name, sku, price: String(price), stock: stock ?? 0,
      description: description ?? null,
      imageUrl: normalizeImage(imageUrl),
      mediaItems: Array.isArray(mediaItems) ? JSON.stringify(mediaItems) : "[]",
      defaultSalesTaxId: defaultSalesTaxId ?? null,
      defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
      itemType: itemType ?? "barang",
      unit: unit ?? "pcs",
      unitOptions: Array.isArray(unitOptions) ? JSON.stringify(unitOptions) : "[]",
      subcategory: subcategory ?? null,
      isActive: isActive !== undefined ? Boolean(isActive) : true,
    }).where(eq(productsTable.id, id)).returning();
    if (!p) return null;
    await tx.delete(productCategoryMapTable).where(eq(productCategoryMapTable.productId, id));
    if (validCats.length > 0) {
      await tx.insert(productCategoryMapTable).values(
        validCats.map((c) => ({ productId: id, categoryId: c.id }))
      );
    }
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

// POST /api/ecommerce/seed-items — seed initial logistics service items (idempotent)
router.post("/seed-items", async (_req, res) => {
  const LOGISTICS_CATEGORIES = [
    "Udara", "Laut", "Darat", "Pabean", "Handling",
    "Trucking", "Container", "Freight Forwarding", "Lainnya",
  ];

  const seedItems = [
    { name: "Urus Dokumen Pabean", sku: "SVC-PABEAN-001", itemType: "jasa", subcategory: "Pabean", unit: "dokumen", price: "0" },
    { name: "Handling Cargo Udara", sku: "SVC-UDARA-001", itemType: "jasa", subcategory: "Udara", unit: "kg", price: "0" },
    { name: "Handling Cargo Laut", sku: "SVC-LAUT-001", itemType: "jasa", subcategory: "Laut", unit: "cbm", price: "0" },
    { name: "Trucking Dalam Kota", sku: "SVC-TRUCK-001", itemType: "jasa", subcategory: "Trucking", unit: "trip", price: "0" },
    { name: "Sewa Container 20FT", sku: "SVC-CONT-001", itemType: "jasa", subcategory: "Container", unit: "container", price: "0" },
    { name: "Sewa Container 40FT", sku: "SVC-CONT-002", itemType: "jasa", subcategory: "Container", unit: "container", price: "0" },
    { name: "Freight Laut LCL", sku: "SVC-LAUT-002", itemType: "jasa", subcategory: "Laut", unit: "cbm", price: "0" },
    { name: "Freight Laut FCL 20FT", sku: "SVC-LAUT-003", itemType: "jasa", subcategory: "Laut", unit: "container", price: "0" },
    { name: "Freight Udara", sku: "SVC-UDARA-002", itemType: "jasa", subcategory: "Udara", unit: "kg", price: "0" },
    { name: "Biaya Storage", sku: "SVC-HAND-001", itemType: "jasa", subcategory: "Handling", unit: "hari", price: "0" },
  ];

  // Ensure logistics categories exist
  const existingCats = await db.select().from(productCategoriesTable);
  const existingNames = new Set(existingCats.map((c) => c.name));
  for (const catName of LOGISTICS_CATEGORIES) {
    if (!existingNames.has(catName)) {
      await db.insert(productCategoriesTable).values({ name: catName });
    }
  }
  const allCats = await db.select().from(productCategoriesTable);
  const catMap = new Map(allCats.map((c) => [c.name, c.id]));

  const seeded: string[] = [];
  for (const item of seedItems) {
    const existing = await db.select().from(productsTable).where(eq(productsTable.sku, item.sku));
    if (existing.length > 0) continue;
    await db.transaction(async (tx) => {
      const [p] = await tx.insert(productsTable).values({
        name: item.name,
        sku: item.sku,
        price: item.price,
        stock: 0,
        itemType: item.itemType,
        unit: item.unit,
        subcategory: item.subcategory,
        isActive: true,
      }).returning();
      const catId = catMap.get(item.subcategory);
      if (catId) {
        await tx.insert(productCategoryMapTable).values({ productId: p.id, categoryId: catId });
      }
    });
    seeded.push(item.name);
  }
  return res.json({ message: "Seeded", seeded });
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
  const { customerName, customerEmail, customerPhone, items, lineItems, totalAmount, taxAmount: rawTax } = req.body;
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
    customerPhone: customerPhone ?? null,
    items: legacyItems,
    lineItems: parsedLineItems,
    totalAmount: String(subtotal),
    taxAmount: String(tax),
    grandTotal: String(grand),
    status: "pending",
  }).returning();

  // Notify admin via WhatsApp (fire-and-forget)
  getAdminWa().then((adminWa) => {
    if (!adminWa) return;
    const itemSummary = parsedLineItems && parsedLineItems.length > 0
      ? parsedLineItems.slice(0, 3).map((li) => `- ${li.name} (${li.qty}x)`).join("\n") +
        (parsedLineItems.length > 3 ? `\n+ ${parsedLineItems.length - 3} item lainnya` : "")
      : (legacyItems ?? "—");
    const msg =
      `🛒 *E-commerce Order Baru*\n` +
      `Customer: ${customerName}\n` +
      (customerEmail ? `Email: ${customerEmail}\n` : "") +
      `Item:\n${itemSummary}\n` +
      `Total: Rp ${grand.toLocaleString("id-ID")}`;
    return sendWhatsApp(adminWa, msg);
  }).catch(() => undefined);

  return res.status(201).json(serializeOrder(order));
});

// PUT /api/ecommerce/orders/:id
router.put("/orders/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(ordersTable).where(eq(ordersTable.id, id));
  if (!existing) return res.status(404).json({ message: "Order not found" });
  const { customerName, customerEmail, customerPhone, items, lineItems, totalAmount, taxAmount: rawTax, status } = req.body;
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
    ...('customerPhone' in req.body ? { customerPhone: customerPhone ?? null } : {}),
    ...(itemsUpdate !== undefined ? { items: itemsUpdate } : {}),
    ...(lineItemsUpdate !== undefined ? { lineItems: lineItemsUpdate } : {}),
    totalAmount: String(subtotal),
    taxAmount: String(tax),
    grandTotal: String(grand),
    status,
  }).where(eq(ordersTable.id, id)).returning();
  if (!order) return res.status(404).json({ message: "Order not found" });

  // Post journal entry when newly delivered
  if (status === "delivered" && existing.status !== "delivered") {
    void postEcommerceOrder({
      orderId: order.id,
      customerName: order.customerName,
      totalAmount: Number(order.totalAmount),
      taxAmount: Number(order.taxAmount ?? 0),
      grandTotal: Number(order.grandTotal),
    });
  }

  // Notify customer via WhatsApp on status change to processing or delivered (fire-and-forget)
  const notifyStatuses = ["processing", "delivered"] as const;
  type NotifyStatus = typeof notifyStatuses[number];
  const statusLabels: Record<NotifyStatus, string> = {
    processing: "Dikonfirmasi & Diproses ✅",
    delivered: "Terkirim 📦",
  };
  const isNotifyStatus = (s: unknown): s is NotifyStatus =>
    notifyStatuses.includes(s as NotifyStatus);

  if (isNotifyStatus(status) && existing.status !== status) {
    const customerWa = order.customerPhone ?? existing.customerPhone;
    if (customerWa) {
      const label = statusLabels[status];
      const itemSummary = (() => {
        const li = order.lineItems;
        if (Array.isArray(li) && li.length > 0) {
          return li.slice(0, 3).map((l: { name: string; qty: number }) => `- ${l.name} (${l.qty}x)`).join("\n") +
            (li.length > 3 ? `\n+ ${li.length - 3} item lainnya` : "");
        }
        return order.items ?? "—";
      })();
      const msg =
        `🛒 *Update Order Anda*\n` +
        `Halo ${order.customerName},\n` +
        `Status pesanan Anda: *${label}*\n\n` +
        `Item:\n${itemSummary}\n` +
        `Total: Rp ${Number(order.grandTotal).toLocaleString("id-ID")}\n\n` +
        `Terima kasih telah berbelanja! 🙏`;
      sendWhatsApp(customerWa, msg).catch(() => undefined);
    }
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
