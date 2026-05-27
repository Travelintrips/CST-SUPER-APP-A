import { Router } from "express";
import { db, stocksTable, suppliersTable, vendorCatalogItemsTable, productsTable, productCategoryMapTable, productCategoriesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { postStockReceived } from "../lib/accounting.js";
import { deleteFromSupabase } from "../lib/supabaseStorage.js";
import { requireClerkUser, requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

// [C1-FIX] All trading routes require authenticated internal BizPortal staff.
// Portal/mobile bearer-token users (isInternalSession=false) are rejected.
router.use(async (req, res, next) => {
  if (!(await requireClerkUser(req, res))) return;
  next();
});

const toItem = (i: typeof vendorCatalogItemsTable.$inferSelect) => ({
  ...i,
  masterItemId: i.masterItemId ?? null,
  kategori: i.kategori ?? null,
  priceBase: Number(i.priceBase ?? 0),
  markupPct: Number(i.markupPct ?? 0),
  createdAt: i.createdAt.toISOString(),
});

// GET /api/trading/stocks
router.get("/stocks", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const offset = Math.max(Number(req.query["offset"] ?? 0), 0);

  const [stocks, suppliers] = await Promise.all([
    db.select().from(stocksTable).orderBy(stocksTable.createdAt).limit(limit).offset(offset),
    db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable),
  ]);
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
  if (!(await requireAdmin(req, res))) return;
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
  if (!(await requireAdmin(req, res))) return;
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
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db.delete(stocksTable).where(eq(stocksTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Stock item not found" });
  return res.json({ message: "Deleted", id });
});

// GET /api/trading/suppliers
router.get("/suppliers", async (req, res) => {
  const limit = Math.min(Number(req.query["limit"] ?? 200), 1000);
  const offset = Math.max(Number(req.query["offset"] ?? 0), 0);
  const suppliers = await db.select().from(suppliersTable).orderBy(suppliersTable.createdAt).limit(limit).offset(offset);
  return res.json(suppliers.map(s => ({ ...s, fee: Number(s.fee ?? 0), markup: Number(s.markup ?? 0), createdAt: s.createdAt.toISOString() })));
});

// POST /api/trading/suppliers
router.post("/suppliers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, country, contactEmail, contactPerson, phone, address, taxId, defaultPurchaseTaxId,
    serviceType, isActive, logo, eta, fee, markup, note, sortOrder } = req.body;
  const [supplier] = await db.insert(suppliersTable).values({
    name, country: country ?? null, contactEmail: contactEmail ?? null,
    contactPerson: contactPerson ?? null,
    phone: phone ?? null, address: address ?? null,
    taxId: taxId ?? null, defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
    serviceType: serviceType ?? null,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    logo: logo ?? "📦",
    eta: eta ?? null,
    fee: fee !== undefined ? String(parseFloat(String(fee)) || 0) : "0",
    markup: markup !== undefined ? String(parseFloat(String(markup)) || 0) : "0",
    note: note ?? null,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
  }).returning();
  return res.status(201).json({ ...supplier, fee: Number(supplier.fee ?? 0), markup: Number(supplier.markup ?? 0), createdAt: supplier.createdAt.toISOString() });
});

// PUT /api/trading/suppliers/:id
router.put("/suppliers/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const { name, country, contactEmail, contactPerson, phone, address, taxId, defaultPurchaseTaxId,
    serviceType, isActive, logo, eta, fee, markup, note, sortOrder } = req.body;
  const patch: Record<string, unknown> = {};
  if (typeof name === "string") patch["name"] = name;
  if (country !== undefined) patch["country"] = country || null;
  if (contactEmail !== undefined) patch["contactEmail"] = contactEmail || null;
  if (contactPerson !== undefined) patch["contactPerson"] = contactPerson || null;
  if (phone !== undefined) patch["phone"] = phone || null;
  if (address !== undefined) patch["address"] = address || null;
  if (taxId !== undefined) patch["taxId"] = taxId || null;
  if (defaultPurchaseTaxId !== undefined) patch["defaultPurchaseTaxId"] = defaultPurchaseTaxId;
  if (serviceType !== undefined) patch["serviceType"] = serviceType || null;
  if (isActive !== undefined) patch["isActive"] = Boolean(isActive);
  if (logo !== undefined) patch["logo"] = logo || "📦";
  if (eta !== undefined) patch["eta"] = eta || null;
  if (fee !== undefined) patch["fee"] = String(parseFloat(String(fee)) || 0);
  if (markup !== undefined) patch["markup"] = String(parseFloat(String(markup)) || 0);
  if (note !== undefined) patch["note"] = note || null;
  if (sortOrder !== undefined) patch["sortOrder"] = Number(sortOrder);

  const [updated] = await db.update(suppliersTable).set(patch).where(eq(suppliersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Supplier not found" });
  return res.json({ ...updated, fee: Number(updated.fee ?? 0), markup: Number(updated.markup ?? 0), createdAt: updated.createdAt.toISOString() });
});

// DELETE /api/trading/suppliers/:id
router.delete("/suppliers/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Supplier not found" });
  // Cascade storage cleanup — logo (hanya jika berupa URL, bukan emoji)
  if (deleted.logo && (deleted.logo.startsWith("http") || deleted.logo.startsWith("/api/storage"))) {
    deleteFromSupabase(deleted.logo).catch(() => {});
  }
  return res.json({ message: "Deleted", id });
});

// ─── Vendor Catalog (Etalase) ────────────────────────────────────────────────

// GET /api/trading/suppliers/:id/catalog
router.get("/suppliers/:id/catalog", async (req, res) => {
  const vendorId = Number(req.params.id);
  if (Number.isNaN(vendorId)) return res.status(400).json({ message: "Invalid id" });
  const rows = await db
    .select({
      id: vendorCatalogItemsTable.id,
      vendorId: vendorCatalogItemsTable.vendorId,
      masterItemId: vendorCatalogItemsTable.masterItemId,
      type: vendorCatalogItemsTable.type,
      name: vendorCatalogItemsTable.name,
      description: vendorCatalogItemsTable.description,
      unit: vendorCatalogItemsTable.unit,
      kategori: vendorCatalogItemsTable.kategori,
      subcategory: vendorCatalogItemsTable.subcategory,
      priceBase: vendorCatalogItemsTable.priceBase,
      markupPct: vendorCatalogItemsTable.markupPct,
      isActive: vendorCatalogItemsTable.isActive,
      isCommodityTag: vendorCatalogItemsTable.isCommodityTag,
      sortOrder: vendorCatalogItemsTable.sortOrder,
      createdAt: vendorCatalogItemsTable.createdAt,
      masterPrice: productsTable.price,
    })
    .from(vendorCatalogItemsTable)
    .leftJoin(productsTable, eq(vendorCatalogItemsTable.masterItemId, productsTable.id))
    .where(eq(vendorCatalogItemsTable.vendorId, vendorId))
    .orderBy(vendorCatalogItemsTable.sortOrder, vendorCatalogItemsTable.createdAt);
  return res.json(rows.map((row) => {
    const priceBase = Number(row.priceBase ?? 0);
    const priceSell = row.masterPrice != null ? Number(row.masterPrice) : null;
    const profit = priceSell != null ? priceSell - priceBase : null;
    return {
      id: row.id,
      vendorId: row.vendorId,
      masterItemId: row.masterItemId ?? null,
      type: row.type,
      name: row.name,
      description: row.description ?? null,
      unit: row.unit ?? null,
      kategori: row.kategori ?? null,
      subcategory: row.subcategory ?? null,
      priceBase,
      markupPct: Number(row.markupPct ?? 0),
      isActive: row.isActive,
      isCommodityTag: row.isCommodityTag,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt.toISOString(),
      priceSell,
      profit,
    };
  }));
});

// POST /api/trading/suppliers/:id/catalog
// Wajib menyertakan masterItemId — nama, tipe, satuan, deskripsi diambil otomatis dari Master Item
router.post("/suppliers/:id/catalog", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const vendorId = Number(req.params.id);
  if (Number.isNaN(vendorId)) return res.status(400).json({ message: "Invalid id" });

  const masterItemId = req.body.masterItemId != null ? Number(req.body.masterItemId) : null;
  if (!masterItemId || Number.isNaN(masterItemId))
    return res.status(400).json({ message: "masterItemId wajib diisi — pilih item dari Master Item" });

  // Cek master item ada
  const [masterItem] = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.id, masterItemId));
  if (!masterItem)
    return res.status(404).json({ message: "Master Item tidak ditemukan" });

  // Cegah duplikat: satu vendor tidak boleh punya master item yang sama dua kali
  const [existing] = await db
    .select({ id: vendorCatalogItemsTable.id })
    .from(vendorCatalogItemsTable)
    .where(and(
      eq(vendorCatalogItemsTable.vendorId, vendorId),
      eq(vendorCatalogItemsTable.masterItemId, masterItemId),
    ));
  if (existing)
    return res.status(409).json({ message: "Item ini sudah ada di etalase vendor ini" });

  const { isActive, isCommodityTag, sortOrder } = req.body;
  // priceBase = Harga Dasar = harga yang vendor charge ke kita (manual input, default 0)
  const priceBase = req.body.priceBase != null ? String(parseFloat(String(req.body.priceBase)) || 0) : "0";

  // Ambil kategori pertama dari master item
  const categoryMap = await db
    .select({ name: productCategoriesTable.name })
    .from(productCategoryMapTable)
    .innerJoin(productCategoriesTable, eq(productCategoryMapTable.categoryId, productCategoriesTable.id))
    .where(eq(productCategoryMapTable.productId, masterItemId));
  const kategori = categoryMap[0]?.name ?? null;

  const [item] = await db.insert(vendorCatalogItemsTable).values({
    vendorId,
    masterItemId,
    type: masterItem.itemType === "jasa" ? "service" : "product",
    name: masterItem.name,
    description: masterItem.description ?? null,
    unit: masterItem.unit ?? null,
    kategori,
    subcategory: masterItem.subcategory ?? null,
    priceBase,
    markupPct: "0",
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    isCommodityTag: isCommodityTag !== undefined ? Boolean(isCommodityTag) : false,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
  }).returning();
  return res.status(201).json(toItem(item));
});

// PUT /api/trading/suppliers/catalog/:itemId
// Master-linked items: boleh edit priceBase (Harga Dasar) + isActive/isCommodityTag/sortOrder
// Legacy items (tanpa masterItemId): boleh edit semua field termasuk deskriptif
router.put("/suppliers/catalog/:itemId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const itemId = Number(req.params.itemId);
  if (Number.isNaN(itemId)) return res.status(400).json({ message: "Invalid id" });

  const [current] = await db
    .select()
    .from(vendorCatalogItemsTable)
    .where(eq(vendorCatalogItemsTable.id, itemId));
  if (!current) return res.status(404).json({ message: "Item not found" });

  // ── Khusus: Link legacy item ke master item ───────────────────────────────
  if (req.body.linkMasterItemId != null && !current.masterItemId) {
    const newMasterId = Number(req.body.linkMasterItemId);
    if (Number.isNaN(newMasterId)) return res.status(400).json({ message: "linkMasterItemId tidak valid" });

    const [masterItem] = await db.select().from(productsTable).where(eq(productsTable.id, newMasterId));
    if (!masterItem) return res.status(404).json({ message: "Master Item tidak ditemukan" });

    const [dup] = await db
      .select({ id: vendorCatalogItemsTable.id })
      .from(vendorCatalogItemsTable)
      .where(and(
        eq(vendorCatalogItemsTable.vendorId, current.vendorId),
        eq(vendorCatalogItemsTable.masterItemId, newMasterId),
      ));
    if (dup) return res.status(409).json({ message: "Item ini sudah ada di etalase vendor ini" });

    const categoryMap = await db
      .select({ name: productCategoriesTable.name })
      .from(productCategoryMapTable)
      .innerJoin(productCategoriesTable, eq(productCategoryMapTable.categoryId, productCategoriesTable.id))
      .where(eq(productCategoryMapTable.productId, newMasterId));
    const kategori = categoryMap[0]?.name ?? null;

    const [linked] = await db.update(vendorCatalogItemsTable).set({
      masterItemId: newMasterId,
      name: masterItem.name,
      type: masterItem.itemType === "jasa" ? "service" : "product",
      unit: masterItem.unit ?? null,
      description: masterItem.description ?? null,
      kategori,
      subcategory: masterItem.subcategory ?? null,
    }).where(eq(vendorCatalogItemsTable.id, itemId)).returning();

    return res.json(toItem(linked));
  }

  const { isActive, isCommodityTag, sortOrder } = req.body;
  const patch: Record<string, unknown> = {};

  // Item lama (legacy) tanpa masterItemId — boleh edit field deskriptif
  if (!current.masterItemId) {
    const { type, name, description, unit, kategori, subcategory } = req.body;
    if (type !== undefined) patch["type"] = type;
    if (typeof name === "string") patch["name"] = name;
    if (description !== undefined) patch["description"] = description || null;
    if (unit !== undefined) patch["unit"] = unit || null;
    if (kategori !== undefined) patch["kategori"] = kategori || null;
    if (subcategory !== undefined) patch["subcategory"] = subcategory || null;
  }

  // Harga Dasar (priceBase) — selalu boleh diedit, untuk semua item termasuk yang linked ke master
  if (req.body.priceBase !== undefined) {
    patch["priceBase"] = String(parseFloat(String(req.body.priceBase)) || 0);
  }

  // Status & urutan — selalu boleh diedit
  if (isActive !== undefined) patch["isActive"] = Boolean(isActive);
  if (isCommodityTag !== undefined) patch["isCommodityTag"] = Boolean(isCommodityTag);
  if (sortOrder !== undefined) patch["sortOrder"] = Number(sortOrder);

  const [updated] = await db
    .update(vendorCatalogItemsTable)
    .set(patch)
    .where(eq(vendorCatalogItemsTable.id, itemId))
    .returning();
  if (!updated) return res.status(404).json({ message: "Item not found" });
  return res.json(toItem(updated));
});

// DELETE /api/trading/suppliers/catalog/:itemId
router.delete("/suppliers/catalog/:itemId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const itemId = Number(req.params.itemId);
  if (Number.isNaN(itemId)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db
    .delete(vendorCatalogItemsTable)
    .where(eq(vendorCatalogItemsTable.id, itemId))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Item not found" });
  return res.json({ message: "Deleted", id: itemId });
});

export default router;
