import { Router } from "express";
import { db, stocksTable, suppliersTable, vendorCatalogItemsTable, productsTable, productCategoryMapTable, productCategoriesTable } from "@workspace/db";
import { eq, and, or, isNull, sql } from "drizzle-orm";
import { resolveCompanyId, resolveCompanyScope } from "../lib/resolveCompany.js";
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

  const scope = resolveCompanyScope(req);

  let suppliers: (typeof suppliersTable.$inferSelect)[];
  if (scope === "all") {
    suppliers = await db.select().from(suppliersTable)
      .orderBy(suppliersTable.createdAt)
      .limit(limit)
      .offset(offset);
  } else {
    // Vendor visible jika:
    // 1. Tidak ada assignment sama sekali (global vendor), ATAU
    // 2. Ada assignment untuk company ini
    suppliers = await db.select().from(suppliersTable)
      .where(sql`(
        NOT EXISTS (
          SELECT 1 FROM vendor_company_assignments
          WHERE vendor_id = ${suppliersTable.id}
        )
        OR EXISTS (
          SELECT 1 FROM vendor_company_assignments
          WHERE vendor_id = ${suppliersTable.id}
            AND company_id = ${scope}
        )
      )`)
      .orderBy(suppliersTable.createdAt)
      .limit(limit)
      .offset(offset);
  }

  if (suppliers.length === 0) {
    return res.json([]);
  }

  // Fetch all company assignments for the returned vendors
  const vendorIds = suppliers.map(s => s.id);
  const assignments = await db.execute(
    sql.raw(`SELECT vendor_id, company_id FROM vendor_company_assignments WHERE vendor_id = ANY(ARRAY[${vendorIds.join(",")}]::int[])`)
  );
  const assignmentMap: Record<number, number[]> = {};
  for (const row of assignments.rows as { vendor_id: number; company_id: number }[]) {
    if (!assignmentMap[row.vendor_id]) assignmentMap[row.vendor_id] = [];
    assignmentMap[row.vendor_id].push(row.company_id);
  }

  return res.json(suppliers.map(s => ({
    ...s,
    fee: Number(s.fee ?? 0),
    createdAt: s.createdAt.toISOString(),
    assignedCompanyIds: assignmentMap[s.id] ?? [],
  })));
});

// GET /api/trading/suppliers/:id/companies — list assigned company IDs
router.get("/suppliers/:id/companies", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const rows = await db.execute(sql`
    SELECT company_id FROM vendor_company_assignments WHERE vendor_id = ${id}
  `);
  return res.json({ vendorId: id, companyIds: (rows.rows as { company_id: number }[]).map(r => r.company_id) });
});

// PUT /api/trading/suppliers/:id/companies — replace all company assignments (admin only)
router.put("/suppliers/:id/companies", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });

  const [vendor] = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!vendor) return res.status(404).json({ message: "Vendor not found" });

  const { companyIds } = req.body as { companyIds: number[] };
  if (!Array.isArray(companyIds)) return res.status(400).json({ message: "companyIds must be an array" });

  const ids = companyIds.map(Number).filter(n => !Number.isNaN(n) && n > 0);

  // Replace all assignments atomically
  await db.execute(sql`DELETE FROM vendor_company_assignments WHERE vendor_id = ${id}`);
  if (ids.length > 0) {
    for (const cid of ids) {
      await db.execute(sql`
        INSERT INTO vendor_company_assignments (vendor_id, company_id)
        VALUES (${id}, ${cid})
        ON CONFLICT (vendor_id, company_id) DO NOTHING
      `);
    }
  }

  return res.json({ vendorId: id, companyIds: ids });
});

// POST /api/trading/suppliers/bulk-assign-company — bulk update company_id on multiple vendors
router.post("/suppliers/bulk-assign-company", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { vendorIds, companyId } = req.body as { vendorIds: unknown; companyId: unknown };
  if (!Array.isArray(vendorIds)) return res.status(400).json({ message: "vendorIds must be an array" });
  const ids = (vendorIds as unknown[]).map(Number).filter(n => !Number.isNaN(n) && n > 0);
  if (ids.length === 0) return res.status(400).json({ message: "No valid vendorIds provided" });
  const cid = companyId != null && companyId !== "" ? Number(companyId) : null;
  await db.execute(sql`UPDATE suppliers SET company_id = ${cid} WHERE id = ANY(${ids})`);
  return res.json({ updated: ids.length, companyId: cid });
});

// POST /api/trading/suppliers
router.post("/suppliers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, country, contactEmail, contactPerson, phone, address, taxId, defaultPurchaseTaxId,
    serviceType, isActive, logo, eta, fee, note, sortOrder, hasInternalTruck, internalTruckPrice } = req.body;
  const companyId = resolveCompanyId(req);
  const [supplier] = await db.insert(suppliersTable).values({
    companyId,
    name, country: country ?? null, contactEmail: contactEmail ?? null,
    contactPerson: contactPerson ?? null,
    phone: phone ?? null, address: address ?? null,
    taxId: taxId ?? null, defaultPurchaseTaxId: defaultPurchaseTaxId ?? null,
    serviceType: serviceType ?? null,
    isActive: isActive !== undefined ? Boolean(isActive) : true,
    logo: logo ?? "📦",
    eta: eta ?? null,
    fee: fee !== undefined ? String(parseFloat(String(fee)) || 0) : "0",
    note: note ?? null,
    sortOrder: sortOrder !== undefined ? Number(sortOrder) : 0,
    hasInternalTruck: hasInternalTruck ? Boolean(hasInternalTruck) : false,
    internalTruckPrice: internalTruckPrice != null ? String(parseFloat(String(internalTruckPrice)) || 0) : null,
  } as any).returning();
  return res.status(201).json({ ...supplier, fee: Number(supplier.fee ?? 0), createdAt: supplier.createdAt.toISOString() });
});

// PUT /api/trading/suppliers/:id
router.put("/suppliers/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const companyId = resolveCompanyId(req);
  const [target] = await db.select({ id: suppliersTable.id, companyId: suppliersTable.companyId })
    .from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!target) return res.status(404).json({ message: "Supplier not found" });
  if (target.companyId !== null && target.companyId !== companyId) {
    return res.status(403).json({ message: "Akses ditolak: supplier bukan milik perusahaan ini" });
  }
  const { name, country, contactEmail, contactPerson, phone, address, taxId, defaultPurchaseTaxId,
    serviceType, isActive, logo, eta, fee, note, sortOrder, hasInternalTruck, internalTruckPrice } = req.body;
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
  if (note !== undefined) patch["note"] = note || null;
  if (sortOrder !== undefined) patch["sortOrder"] = Number(sortOrder);
  if (hasInternalTruck !== undefined) patch["hasInternalTruck"] = Boolean(hasInternalTruck);
  if (internalTruckPrice !== undefined) patch["internalTruckPrice"] = internalTruckPrice != null && internalTruckPrice !== "" ? String(parseFloat(String(internalTruckPrice)) || 0) : null;

  const [updated] = await db.update(suppliersTable).set(patch).where(eq(suppliersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Supplier not found" });
  return res.json({ ...updated, fee: Number(updated.fee ?? 0), createdAt: updated.createdAt.toISOString() });
});

// DELETE /api/trading/suppliers/:id
router.delete("/suppliers/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "Invalid id" });
  const companyId = resolveCompanyId(req);

  const [target] = await db.select({ id: suppliersTable.id, companyId: suppliersTable.companyId })
    .from(suppliersTable).where(eq(suppliersTable.id, id));
  if (!target) return res.status(404).json({ message: "Supplier not found" });
  if (target.companyId !== null && target.companyId !== companyId) {
    return res.status(403).json({ message: "Akses ditolak: supplier bukan milik perusahaan ini" });
  }
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

  if (Object.keys(patch).length === 0) {
    return res.json(toItem(current));
  }
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

// ─── Vendor Drivers ─────────────────────────────────────────────────────────

// GET /api/trading/suppliers/:id/drivers
router.get("/suppliers/:id/drivers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const supplierId = Number(req.params.id);
  if (Number.isNaN(supplierId)) return res.status(400).json({ message: "Invalid id" });
  const rows = await db.execute(sql`
    SELECT id, supplier_id AS "supplierId", name, phone,
           vehicle_plate AS "vehiclePlate", vehicle_type AS "vehicleType",
           is_active AS "isActive", created_at AS "createdAt"
    FROM vendor_drivers
    WHERE supplier_id = ${supplierId}
    ORDER BY name ASC
  `);
  return res.json({ drivers: rows.rows });
});

// POST /api/trading/suppliers/:id/drivers
router.post("/suppliers/:id/drivers", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const supplierId = Number(req.params.id);
  if (Number.isNaN(supplierId)) return res.status(400).json({ message: "Invalid id" });
  const { name, phone, vehiclePlate, vehicleType } = req.body as {
    name?: string; phone?: string; vehiclePlate?: string; vehicleType?: string;
  };
  if (!name?.trim()) return res.status(400).json({ message: "Nama driver wajib diisi" });
  const result = await db.execute(sql`
    INSERT INTO vendor_drivers (supplier_id, name, phone, vehicle_plate, vehicle_type)
    VALUES (${supplierId}, ${name.trim()}, ${phone?.trim() || null}, ${vehiclePlate?.trim() || null}, ${vehicleType?.trim() || null})
    RETURNING id, supplier_id AS "supplierId", name, phone,
              vehicle_plate AS "vehiclePlate", vehicle_type AS "vehicleType",
              is_active AS "isActive", created_at AS "createdAt"
  `);
  return res.status(201).json({ driver: result.rows[0] });
});

// PUT /api/trading/suppliers/drivers/:driverId
router.put("/suppliers/drivers/:driverId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const driverId = Number(req.params.driverId);
  if (Number.isNaN(driverId)) return res.status(400).json({ message: "Invalid id" });
  const { name, phone, vehiclePlate, vehicleType, isActive } = req.body as {
    name?: string; phone?: string; vehiclePlate?: string; vehicleType?: string; isActive?: boolean;
  };
  if (name !== undefined && !name.trim()) return res.status(400).json({ message: "Nama driver wajib diisi" });
  const result = await db.execute(sql`
    UPDATE vendor_drivers SET
      name          = COALESCE(${name?.trim() ?? null}, name),
      phone         = CASE WHEN ${phone !== undefined} THEN ${phone?.trim() || null} ELSE phone END,
      vehicle_plate = CASE WHEN ${vehiclePlate !== undefined} THEN ${vehiclePlate?.trim() || null} ELSE vehicle_plate END,
      vehicle_type  = CASE WHEN ${vehicleType !== undefined} THEN ${vehicleType?.trim() || null} ELSE vehicle_type END,
      is_active     = CASE WHEN ${isActive !== undefined} THEN ${isActive ?? true} ELSE is_active END
    WHERE id = ${driverId}
    RETURNING id, supplier_id AS "supplierId", name, phone,
              vehicle_plate AS "vehiclePlate", vehicle_type AS "vehicleType",
              is_active AS "isActive", created_at AS "createdAt"
  `);
  if (!result.rows[0]) return res.status(404).json({ message: "Driver tidak ditemukan" });
  return res.json({ driver: result.rows[0] });
});

// PATCH /api/trading/suppliers/drivers/:driverId/toggle
router.patch("/suppliers/drivers/:driverId/toggle", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const driverId = Number(req.params.driverId);
  if (Number.isNaN(driverId)) return res.status(400).json({ message: "Invalid id" });
  const result = await db.execute(sql`
    UPDATE vendor_drivers SET is_active = NOT is_active
    WHERE id = ${driverId}
    RETURNING id, supplier_id AS "supplierId", name, phone,
              vehicle_plate AS "vehiclePlate", vehicle_type AS "vehicleType",
              is_active AS "isActive", created_at AS "createdAt"
  `);
  if (!result.rows[0]) return res.status(404).json({ message: "Driver tidak ditemukan" });
  return res.json({ driver: result.rows[0] });
});

// DELETE /api/trading/suppliers/drivers/:driverId
router.delete("/suppliers/drivers/:driverId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const driverId = Number(req.params.driverId);
  if (Number.isNaN(driverId)) return res.status(400).json({ message: "Invalid id" });
  const result = await db.execute(sql`
    DELETE FROM vendor_drivers WHERE id = ${driverId} RETURNING id
  `);
  if (!result.rows[0]) return res.status(404).json({ message: "Driver tidak ditemukan" });
  return res.json({ message: "Deleted", id: driverId });
});

export default router;
