import { Router } from "express";
import { db, stocksTable, suppliersTable, vendorCatalogItemsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { postStockReceived } from "../lib/accounting.js";

const router = Router();

const toItem = (i: typeof vendorCatalogItemsTable.$inferSelect) => ({
  ...i,
  priceBase: Number(i.priceBase ?? 0),
  markupPct: Number(i.markupPct ?? 0),
  createdAt: i.createdAt.toISOString(),
});

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
  return res.json(suppliers.map(s => ({ ...s, fee: Number(s.fee ?? 0), markup: Number(s.markup ?? 0), createdAt: s.createdAt.toISOString() })));
});

// POST /api/trading/suppliers
router.post("/suppliers", async (req, res) => {
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
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Supplier not found" });
  return res.json({ message: "Deleted", id });
});

// ─── Vendor Catalog (Etalase) ────────────────────────────────────────────────

// GET /api/trading/suppliers/:id/catalog
router.get("/suppliers/:id/catalog", async (req, res) => {
  const vendorId = Number(req.params.id);
  if (Number.isNaN(vendorId)) return res.status(400).json({ message: "Invalid id" });
  const items = await db
    .select()
    .from(vendorCatalogItemsTable)
    .where(eq(vendorCatalogItemsTable.vendorId, vendorId))
    .orderBy(vendorCatalogItemsTable.sortOrder, vendorCatalogItemsTable.createdAt);
  return res.json(items.map(toItem));
});

// POST /api/trading/suppliers/:id/catalog
router.post("/suppliers/:id/catalog", async (req, res) => {
  const vendorId = Number(req.params.id);
  if (Number.isNaN(vendorId)) return res.status(400).json({ message: "Invalid id" });
  const { type, name, description, unit, subcategory, priceBase, markupPct, isActive, isCommodityTag, sortOrder } = req.body;
  if (!name || typeof name !== "string")
    return res.status(400).json({ message: "name required" });
  const [item] = await db.insert(vendorCatalogItemsTable).values({
    vendorId,
    type: type ?? "service",
    name,
    description: description ?? null,
    unit: unit ?? null,
    subcategory: subcategory ?? null,
    priceBase: String(parseFloat(String(priceBase ?? 0)) || 0),
    markupPct: String(parseFloat(String(markupPct ?? 0)) || 0),
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    isCommodityTag: isCommodityTag !== undefined ? Boolean(isCommodityTag) : false,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
  }).returning();
  return res.status(201).json(toItem(item));
});

// PUT /api/trading/suppliers/catalog/:itemId
router.put("/suppliers/catalog/:itemId", async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (Number.isNaN(itemId)) return res.status(400).json({ message: "Invalid id" });
  const { type, name, description, unit, subcategory, priceBase, markupPct, isActive, isCommodityTag, sortOrder } = req.body;
  const patch: Record<string, unknown> = {};
  if (type !== undefined) patch["type"] = type;
  if (typeof name === "string") patch["name"] = name;
  if (description !== undefined) patch["description"] = description || null;
  if (unit !== undefined) patch["unit"] = unit || null;
  if (subcategory !== undefined) patch["subcategory"] = subcategory || null;
  if (priceBase !== undefined) patch["priceBase"] = String(parseFloat(String(priceBase)) || 0);
  if (markupPct !== undefined) patch["markupPct"] = String(parseFloat(String(markupPct)) || 0);
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
