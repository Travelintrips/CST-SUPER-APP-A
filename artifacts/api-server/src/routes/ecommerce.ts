import { Router } from "express";
import { db, productsTable, ordersTable, productCategoriesTable, productCategoryMapTable } from "@workspace/db";
import { eq, ne, count, inArray, and, ilike, or, type SQL } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage";
import { postEcommerceOrder } from "../lib/accounting.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { saveAndBroadcast } from "../lib/notificationStore.js";
import { registerPortalConnection, unregisterPortalConnection, broadcastToPortal } from "../lib/sseManager.js";
import { requireClerkUser } from "../lib/requireAdmin.js";

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
  let mediaItems: Array<{ type: string; url: string }> = [];
  try { mediaItems = JSON.parse(p.mediaItems ?? "[]"); } catch { /* empty */ }
  return {
    ...p,
    price: Number(p.price),
    createdAt: p.createdAt.toISOString(),
    categories,
    itemType: p.itemType,
    unit: p.unit,
    unitOptions,
    mediaItems,
    subcategory: p.subcategory ?? null,
    isActive: p.isActive,
    imageUrl: p.imageUrl ?? null,
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
  broadcastToPortal("price_sync", { ts: Date.now() });
  return res.json({ message: "Category deleted" });
});

// GET /api/ecommerce/products/check-sku
router.get("/products/check-sku", async (req, res) => {
  const sku = String(req.query.sku ?? "").trim();
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
  if (!sku) return res.json({ taken: false });
  const conds: SQL[] = [eq(productsTable.sku, sku)];
  if (excludeId && !Number.isNaN(excludeId)) conds.push(ne(productsTable.id, excludeId));
  const rows = await db
    .select({ id: productsTable.id })
    .from(productsTable)
    .where(and(...conds))
    .limit(1);
  return res.json({ taken: rows.length > 0 });
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

// POST /api/ecommerce/products/bulk-import
router.post("/products/bulk-import", async (req, res) => {
  const rows: unknown[] = Array.isArray(req.body.rows) ? req.body.rows : [];
  if (rows.length === 0) return res.status(400).json({ message: "rows array is required and must not be empty" });
  if (rows.length > 500) return res.status(400).json({ message: "Maksimum 500 baris per import" });

  const allCats = await db.select().from(productCategoriesTable);
  const catByName = new Map(allCats.map((c) => [c.name.toLowerCase(), c]));

  const skus = rows.map((r) => String((r as Record<string, unknown>).sku ?? "").trim()).filter(Boolean);
  const existingProducts = skus.length > 0
    ? await db.select().from(productsTable).where(inArray(productsTable.sku, skus))
    : [];
  const existingBySku = new Map(existingProducts.map((p) => [p.sku, p]));

  const results: Array<{ row: number; sku?: string; name?: string; status: string; message?: string }> = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i] as Record<string, unknown>;
    try {
      const name = String(row.nama ?? row.name ?? "").trim();
      const sku = String(row.sku ?? "").trim();
      const itemType = String(row.tipe ?? row.itemType ?? "barang").toLowerCase() === "jasa" ? "jasa" : "barang";
      const priceRaw = String(row.harga ?? row.price ?? "0").replace(/[^0-9.,-]/g, "").replace(",", ".");
      const price = parseFloat(priceRaw) || 0;
      const stockRaw = String(row.stok ?? row.stock ?? "0").replace(/[^0-9]/g, "");
      const stock = parseInt(stockRaw, 10) || 0;
      const unit = String(row.satuan ?? row.unit ?? "pcs").trim() || "pcs";
      const description = row.deskripsi != null ? String(row.deskripsi) : (row.description != null ? String(row.description) : null);
      const subcategory = row.subkategori != null ? String(row.subkategori).trim() || null : (row.subcategory != null ? String(row.subcategory).trim() || null : null);
      const isActiveRaw = String(row.aktif ?? row.isActive ?? "ya").toLowerCase().trim();
      const isActive = !(isActiveRaw === "false" || isActiveRaw === "tidak" || isActiveRaw === "0" || isActiveRaw === "no");
      const categoryStr = String(row.kategori ?? row.categories ?? "").trim();
      const categoryNames = categoryStr.split(";").map((c) => c.trim()).filter(Boolean);

      if (!name) { results.push({ row: i + 1, status: "error", message: "Nama produk wajib diisi" }); continue; }
      if (!sku) { results.push({ row: i + 1, status: "error", message: "SKU wajib diisi" }); continue; }
      if (price < 0) { results.push({ row: i + 1, sku, status: "error", message: "Harga tidak boleh negatif" }); continue; }
      if (categoryNames.length === 0) { results.push({ row: i + 1, sku, status: "error", message: "Kategori wajib diisi" }); continue; }

      const validCats = categoryNames.map((n) => catByName.get(n.toLowerCase())).filter(Boolean) as typeof allCats;
      if (validCats.length !== categoryNames.length) {
        const invalid = categoryNames.filter((n) => !catByName.has(n.toLowerCase()));
        results.push({ row: i + 1, sku, status: "error", message: `Kategori tidak ditemukan: ${invalid.join(", ")}` });
        continue;
      }

      const existing = existingBySku.get(sku);
      if (existing) {
        await db.transaction(async (tx) => {
          await tx.update(productsTable).set({
            name, price: String(price), stock, description: description ?? null,
            itemType, unit, subcategory, isActive,
          }).where(eq(productsTable.sku, sku));
          await tx.delete(productCategoryMapTable).where(eq(productCategoryMapTable.productId, existing.id));
          if (validCats.length > 0) {
            await tx.insert(productCategoryMapTable).values(validCats.map((c) => ({ productId: existing.id, categoryId: c.id })));
          }
        });
        results.push({ row: i + 1, sku, name, status: "updated" });
      } else {
        await db.transaction(async (tx) => {
          const [p] = await tx.insert(productsTable).values({
            name, sku, price: String(price), stock, description: description ?? null,
            imageUrl: null, mediaItems: "[]", itemType, unit,
            unitOptions: "[]", subcategory, isActive,
          }).returning();
          if (validCats.length > 0) {
            await tx.insert(productCategoryMapTable).values(validCats.map((c) => ({ productId: p.id, categoryId: c.id })));
          }
        });
        results.push({ row: i + 1, sku, name, status: "created" });
      }
    } catch (err: unknown) {
      results.push({ row: i + 1, status: "error", message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  // Notify Customer Portal: satu atau lebih produk baru/diperbarui via bulk-import.
  // Listener: products.tsx (invalidates ["portal-products"]),
  //           jasa.tsx (invalidates ["listPortalServicesJasa"])
  broadcastToPortal("price_sync", { ts: Date.now() });
  return res.json({ results });
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
  const requestedNames: string[] = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];

  // If categories not provided or empty, preserve the existing categories from DB
  let categoryNames: string[] = requestedNames;
  let validCats: { id: number; name: string; createdAt: Date }[] = [];

  if (requestedNames.length === 0) {
    // Preserve existing categories
    const existing = await db
      .select({ name: productCategoriesTable.name })
      .from(productCategoryMapTable)
      .innerJoin(productCategoriesTable, eq(productCategoryMapTable.categoryId, productCategoriesTable.id))
      .where(eq(productCategoryMapTable.productId, id));
    categoryNames = existing.map((r) => r.name);
    if (categoryNames.length > 0) {
      validCats = await db.select().from(productCategoriesTable).where(inArray(productCategoriesTable.name, categoryNames));
    }
  } else {
    validCats = await db
      .select()
      .from(productCategoriesTable)
      .where(inArray(productCategoriesTable.name, requestedNames));
    if (validCats.length !== requestedNames.length) {
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
    if (requestedNames.length > 0) {
      // Only update category map if caller explicitly sent categories
      await tx.delete(productCategoryMapTable).where(eq(productCategoryMapTable.productId, id));
      if (validCats.length > 0) {
        await tx.insert(productCategoryMapTable).values(
          validCats.map((c) => ({ productId: id, categoryId: c.id }))
        );
      }
    }
    return p;
  });

  if (!product) return res.status(404).json({ message: "Product not found" });
  // Notify Customer Portal: harga/data produk berubah via BizPortal admin.
  // Listener: products.tsx (invalidates ["portal-products"]),
  //           jasa.tsx (invalidates ["listPortalServicesJasa"])
  broadcastToPortal("price_sync", { ts: Date.now() });
  return res.json(serializeProduct(product, categoryNames));
});

// DELETE /api/ecommerce/products/:id
router.delete("/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  // Notify Customer Portal: produk dihapus — hapus dari listing.
  // Listener: products.tsx (invalidates ["portal-products"]),
  //           jasa.tsx (invalidates ["listPortalServicesJasa"])
  broadcastToPortal("price_sync", { ts: Date.now() });
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

  // Simpan ke DB + broadcast SSE realtime ke admin
  const itemCount = parsedLineItems?.length ?? (legacyItems ? 1 : 0);
  saveAndBroadcast("new_ecommerce_order", {
    type: "ecommerce",
    orderId: order.id,
    orderNumber: `ECO-${String(order.id).padStart(6, "0")}`,
    customerName: order.customerName,
    companyName: null,
    grandTotal: grand,
    itemCount,
  }).catch(() => {});

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

// GET /api/ecommerce/events — SSE stream for customer portal (live price sync)
router.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(": connected\n\n");

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch { clearInterval(keepAlive); }
  }, 25_000);

  registerPortalConnection(res);

  req.on("close", () => {
    clearInterval(keepAlive);
    unregisterPortalConnection(res);
  });
});

// POST /api/ecommerce/sync-prices — broadcast price_sync to all portal tabs (staff only)
router.post("/sync-prices", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  broadcastToPortal("price_sync", { ts: Date.now() });
  return res.json({ ok: true, message: "Price sync broadcasted to all portal tabs" });
});

// ── USD/IDR exchange rate — server-side cache (H6) ────────────────────────
// Fetches from open.er-api.com and caches for 5 minutes so the browser
// never calls external APIs directly and stale localStorage values are avoided.
const _USD_IDR_FALLBACK = 16_300;
const _USD_IDR_CACHE_MS = 5 * 60 * 1000;
let _usdIdrCache: { rate: number; fetchedAt: number } | null = null;

// GET /api/ecommerce/usd-idr-rate — public (used by customer portal)
router.get("/usd-idr-rate", async (_req, res) => {
  const now = Date.now();
  if (_usdIdrCache && now - _usdIdrCache.fetchedAt < _USD_IDR_CACHE_MS) {
    return res.json({ rate: _usdIdrCache.rate, source: "cache" });
  }
  try {
    const resp = await fetch("https://open.er-api.com/v6/latest/USD");
    const data = await resp.json() as { rates?: { IDR?: number } };
    const idr = data?.rates?.IDR;
    if (idr && idr > 1000) {
      _usdIdrCache = { rate: idr, fetchedAt: now };
      return res.json({ rate: idr, source: "live" });
    }
  } catch { /* fall through to cached/fallback */ }
  const rate = _usdIdrCache?.rate ?? _USD_IDR_FALLBACK;
  return res.json({ rate, source: "fallback" });
});

export default router;
