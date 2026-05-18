/**
 * /api/thai-tea — Manajemen Bahan Thai Tea & Inventori CST
 *
 * Sistem gudang telah dimerge: semua stok memakai warehouses (ERP) + inventory_stock.
 * Tidak ada lagi dual-stock sync / thai_tea_warehouse_links.
 *
 * Products:
 * GET  /products          — daftar produk bahan thai tea
 * POST /products          — tambah produk bahan thai tea
 * PUT  /products/:id      — update produk
 * DELETE /products/:id    — hapus produk
 * POST /seed              — seed bahan default thai tea
 *
 * Stock & Purchase:
 * GET  /purchases         — daftar PO yang berisi bahan thai tea
 * GET  /stock             — stok bahan thai tea dari inventory_stock (sistem tunggal)
 * POST /receive           — terima bahan thai tea → update inventory_stock + stock_movements
 *
 * Recipes / BOM:
 * GET  /recipes           — daftar recipe bahan thai tea
 * POST /recipes           — upsert recipe
 * DELETE /recipes/:id     — hapus recipe
 *
 * Warehouses:
 * GET  /warehouses        — daftar gudang ERP (warehouses) aktif
 */
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { postStockIn } from "../lib/inventoryStock.js";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

const SUBCATEGORY = "bahan_thai_tea";
const BUSINESS_UNIT = "THAI_TEA";

const DEFAULT_BAHAN: Array<{ name: string; sku: string; unit: string; price: number; description: string }> = [
  { name: "Teh Hitam CTC", sku: "BTT-TEH-001", unit: "kg", price: 85000, description: "Teh hitam grade CTC untuk thai tea" },
  { name: "Teh Hitam Premium", sku: "BTT-TEH-002", unit: "kg", price: 120000, description: "Teh hitam premium blend Thai" },
  { name: "Gula Pasir", sku: "BTT-GUL-001", unit: "kg", price: 15000, description: "Gula pasir putih" },
  { name: "Susu Kental Manis Putih", sku: "BTT-SKM-001", unit: "kaleng", price: 14000, description: "Susu kental manis putih 390gr" },
  { name: "Susu Kental Manis Coklat", sku: "BTT-SKM-002", unit: "kaleng", price: 14500, description: "Susu kental manis coklat 390gr" },
  { name: "Creamer Bubuk", sku: "BTT-CRM-001", unit: "kg", price: 55000, description: "Non-dairy creamer bubuk" },
  { name: "Es Batu", sku: "BTT-ICE-001", unit: "kg", price: 3000, description: "Es batu kristal" },
  { name: "Susu Full Cream", sku: "BTT-SUF-001", unit: "liter", price: 18000, description: "Susu full cream segar" },
  { name: "Bubble Tapioka", sku: "BTT-BBL-001", unit: "kg", price: 32000, description: "Bubble boba tapioka hitam" },
  { name: "Sirup Gula Aren", sku: "BTT-SRP-001", unit: "liter", price: 28000, description: "Sirup gula aren untuk campuran" },
  { name: "Vanilla Syrup", sku: "BTT-SRP-002", unit: "liter", price: 45000, description: "Sirup vanilla premium" },
  { name: "Taro Powder", sku: "BTT-POW-001", unit: "kg", price: 95000, description: "Taro powder untuk varian taro" },
  { name: "Matcha Powder", sku: "BTT-POW-002", unit: "kg", price: 180000, description: "Matcha powder grade premium" },
  { name: "Brown Sugar", sku: "BTT-GUL-002", unit: "kg", price: 22000, description: "Gula cokelat / gula merah kristal" },
  { name: "Gelas Plastik 16oz", sku: "BTT-PKG-001", unit: "pcs", price: 850, description: "Gelas plastik cup 16oz" },
  { name: "Gelas Plastik 22oz", sku: "BTT-PKG-002", unit: "pcs", price: 1100, description: "Gelas plastik cup 22oz" },
  { name: "Sedotan", sku: "BTT-PKG-003", unit: "pcs", price: 150, description: "Sedotan boba diameter besar" },
  { name: "Plastik Sealer Roll", sku: "BTT-PKG-004", unit: "roll", price: 45000, description: "Plastik sealer untuk mesin cup sealer" },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function grnNo(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  return `BTT-GRN/${ymd}/${now.getTime().toString().slice(-5)}`;
}

// ── GET /products ────────────────────────────────────────────────────────────

router.get("/products", async (_req: Request, res: Response) => {
  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.subcategory, SUBCATEGORY))
    .orderBy(productsTable.name);
  res.json(rows);
});

// ── POST /products ───────────────────────────────────────────────────────────

router.post("/products", async (req: Request, res: Response) => {
  const { name, sku, unit, price, description } = req.body as {
    name: string; sku: string; unit?: string; price?: number; description?: string;
  };
  if (!name || !sku) {
    res.status(400).json({ message: "name dan sku wajib diisi" });
    return;
  }
  const [row] = await db.insert(productsTable).values({
    name,
    sku: sku.toUpperCase(),
    unit: unit ?? "kg",
    price: String(price ?? 0),
    description: description ?? null,
    subcategory: SUBCATEGORY,
    itemType: "barang",
    isActive: true,
  }).returning();
  res.status(201).json(row);
});

// ── PUT /products/:id ────────────────────────────────────────────────────────

router.put("/products/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  const { name, sku, unit, price, description, isActive } = req.body as {
    name?: string; sku?: string; unit?: string; price?: number;
    description?: string; isActive?: boolean;
  };
  const patch: Record<string, unknown> = {};
  if (name !== undefined) patch.name = name;
  if (sku !== undefined) patch.sku = sku.toUpperCase();
  if (unit !== undefined) patch.unit = unit;
  if (price !== undefined) patch.price = String(price);
  if (description !== undefined) patch.description = description;
  if (isActive !== undefined) patch.isActive = isActive;

  const [row] = await db.update(productsTable).set(patch).where(eq(productsTable.id, id)).returning();
  if (!row) { res.status(404).json({ message: "Produk tidak ditemukan" }); return; }
  res.json(row);
});

// ── DELETE /products/:id ─────────────────────────────────────────────────────

router.delete("/products/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  await db.delete(productsTable).where(eq(productsTable.id, id));
  res.json({ ok: true });
});

// ── POST /seed ────────────────────────────────────────────────────────────────

router.post("/seed", async (_req: Request, res: Response) => {
  const existing = await db.select({ id: productsTable.id }).from(productsTable).where(eq(productsTable.subcategory, SUBCATEGORY));
  if (existing.length > 0) {
    res.json({ message: `${existing.length} bahan sudah ada, seed dilewati`, seeded: 0 });
    return;
  }
  const rows = await db.insert(productsTable).values(
    DEFAULT_BAHAN.map((b) => ({
      name: b.name,
      sku: b.sku,
      unit: b.unit,
      price: String(b.price),
      description: b.description,
      subcategory: SUBCATEGORY,
      itemType: "barang" as const,
      isActive: true,
    }))
  ).returning();
  res.status(201).json({ message: `${rows.length} bahan berhasil di-seed`, seeded: rows.length });
});

// ── GET /purchases ───────────────────────────────────────────────────────────

router.get("/purchases", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT DISTINCT
      pd.id, pd.doc_number, pd.kind, pd.status, pd.receive_status,
      pd.bill_status, pd.supplier_name,
      pd.total_amount::float, pd.grand_total::float,
      pd.expected_date, pd.confirmed_at, pd.created_at
    FROM purchase_documents pd
    JOIN purchase_document_lines pdl ON pdl.document_id = pd.id
    JOIN products p ON p.id = pdl.product_id
    WHERE p.subcategory = ${SUBCATEGORY}
    ORDER BY pd.created_at DESC
    LIMIT 200
  `);
  res.json(rows.rows);
});

// ── GET /stock ───────────────────────────────────────────────────────────────
// Stok dari inventory_stock (sistem gudang tunggal)

router.get("/stock", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      p.unit,
      COALESCE(SUM(ist.stock_on_hand::float), 0) AS total_qty,
      COALESCE(SUM(ist.stock_available::float), 0) AS total_available,
      AVG(ist.average_cost::float) AS avg_cost,
      COUNT(DISTINCT ist.warehouse_id) AS warehouse_count,
      json_agg(
        json_build_object(
          'warehouse_id', w.id,
          'warehouse_name', w.warehouse_name,
          'warehouse_code', w.warehouse_code,
          'branch_name', pb.name,
          'stock_on_hand', ist.stock_on_hand::float,
          'stock_available', ist.stock_available::float,
          'average_cost', ist.average_cost::float
        ) ORDER BY w.warehouse_name
      ) FILTER (WHERE ist.id IS NOT NULL) AS warehouses
    FROM products p
    LEFT JOIN inventory_stock ist ON ist.product_id = p.id
    LEFT JOIN warehouses w ON w.id = ist.warehouse_id
    LEFT JOIN pos_branches pb ON pb.id = w.branch_id
    WHERE p.subcategory = ${SUBCATEGORY} AND p.is_active = TRUE
    GROUP BY p.id, p.name, p.sku, p.unit
    ORDER BY p.name
  `);
  res.json(rows.rows);
});

// ── POST /receive ─────────────────────────────────────────────────────────────
// Terima bahan Thai Tea → update inventory_stock + stock_movements

router.post("/receive", async (req: Request, res: Response) => {
  const { warehouseId, poId, notes, receivedBy, lines } = req.body as {
    warehouseId: number;
    poId?: number | null;
    notes?: string;
    receivedBy?: string;
    lines: Array<{
      productId: number;
      qty: number;
      unitCost: number;
    }>;
  };

  if (!warehouseId || !lines?.length) {
    res.status(400).json({ message: "warehouseId dan lines wajib diisi" });
    return;
  }

  const validLines = lines.filter(l => l.qty > 0 && l.productId);
  if (!validLines.length) {
    res.status(400).json({ message: "Minimal satu item dengan qty > 0" });
    return;
  }

  // Validasi: semua produk harus bahan_thai_tea
  for (const line of validLines) {
    const prodRow = (await db.execute(sql`
      SELECT subcategory FROM products WHERE id = ${line.productId}
    `)).rows[0] as { subcategory: string | null } | undefined;
    if (!prodRow) {
      res.status(400).json({ message: `Produk #${line.productId} tidak ditemukan` });
      return;
    }
    if (prodRow.subcategory !== SUBCATEGORY) {
      res.status(400).json({ message: `Produk #${line.productId} bukan bahan thai tea` });
      return;
    }
  }

  // Validasi gudang
  const whRow = (await db.execute(sql`SELECT id, warehouse_name FROM warehouses WHERE id = ${warehouseId} AND is_active = TRUE`)).rows[0] as { id: number; warehouse_name: string } | undefined;
  if (!whRow) {
    res.status(400).json({ message: `Gudang #${warehouseId} tidak ditemukan atau tidak aktif` });
    return;
  }

  const receiptNo = grnNo();
  const results: Array<{ productId: number; productName: string; qty: number; stockAfter: number }> = [];

  for (const line of validLines) {
    const prodRow = (await db.execute(sql`SELECT name FROM products WHERE id = ${line.productId}`)).rows[0] as { name: string };
    const r = await postStockIn({
      productId: line.productId,
      warehouseId,
      qty: line.qty,
      unitCost: line.unitCost,
      movementType: "PURCHASE_RECEIPT",
      referenceType: poId ? "PURCHASE_ORDER" : "MANUAL",
      referenceId: poId ?? null,
      notes: `${receiptNo} — Thai Tea — ${prodRow.name}${notes ? ` — ${notes}` : ""}`,
      createdBy: receivedBy ?? null,
    });
    results.push({
      productId: line.productId,
      productName: prodRow.name,
      qty: line.qty,
      stockAfter: r.balanceAfter,
    });
  }

  res.status(201).json({
    receiptNo,
    businessUnit: BUSINESS_UNIT,
    warehouseId,
    warehouseName: whRow.warehouse_name,
    lines: results,
    message: `${validLines.length} item berhasil diterima ke gudang Thai Tea`,
  });
});

// ── GET /warehouses ───────────────────────────────────────────────────────────
// Daftar gudang ERP aktif (sistem gudang tunggal)

router.get("/warehouses", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT w.id, w.warehouse_code, w.warehouse_name, w.warehouse_type, w.is_active,
           pb.id AS branch_id, pb.name AS branch_name, pb.business_unit
    FROM warehouses w
    LEFT JOIN pos_branches pb ON pb.id = w.branch_id
    WHERE w.is_active = TRUE
    ORDER BY w.warehouse_name
  `);
  res.json(rows.rows);
});

// ── GET /recipes ──────────────────────────────────────────────────────────────

router.get("/recipes", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT
      pr.id, pr.product_id, p.name AS product_name, p.sku AS product_sku,
      pr.yield_qty::float, pr.yield_unit, pr.note, pr.is_active,
      pr.created_at, pr.updated_at,
      json_agg(
        json_build_object(
          'id', ri.id,
          'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name,
          'ingredient_sku', ip.sku,
          'unit', ri.unit,
          'qty', ri.qty::float,
          'note', ri.note
        ) ORDER BY ri.id
      ) FILTER (WHERE ri.id IS NOT NULL) AS ingredients
    FROM product_recipes pr
    JOIN products p ON p.id = pr.product_id
    LEFT JOIN product_recipe_items ri ON ri.recipe_id = pr.id
    LEFT JOIN products ip ON ip.id = ri.ingredient_product_id
    WHERE EXISTS (
      SELECT 1 FROM product_recipe_items ri2
      JOIN products ip2 ON ip2.id = ri2.ingredient_product_id
      WHERE ri2.recipe_id = pr.id AND ip2.subcategory = ${SUBCATEGORY}
    )
    GROUP BY pr.id, pr.product_id, p.name, p.sku, pr.yield_qty, pr.yield_unit, pr.note, pr.is_active, pr.created_at, pr.updated_at
    ORDER BY p.name
  `);
  res.json(rows.rows);
});

// ── POST /recipes ─────────────────────────────────────────────────────────────

router.post("/recipes", async (req: Request, res: Response) => {
  const { productId, yieldQty, yieldUnit, note, isActive, ingredients } = req.body as {
    productId: number;
    yieldQty?: number;
    yieldUnit?: string;
    note?: string;
    isActive?: boolean;
    ingredients: Array<{ ingredientProductId: number; qty: number; unit: string; note?: string }>;
  };

  if (!productId || !ingredients?.length) {
    res.status(400).json({ message: "productId dan ingredients wajib diisi" });
    return;
  }

  for (const ing of ingredients) {
    if (!ing.qty || ing.qty <= 0) {
      res.status(400).json({ message: "qty ingredient harus > 0" });
      return;
    }
    const ingRow = (await db.execute(sql`
      SELECT subcategory FROM products WHERE id = ${ing.ingredientProductId}
    `)).rows[0] as { subcategory: string | null } | undefined;
    if (!ingRow) {
      res.status(400).json({ message: `Bahan #${ing.ingredientProductId} tidak ditemukan` });
      return;
    }
    if (ingRow.subcategory !== SUBCATEGORY) {
      res.status(400).json({ message: `Bahan #${ing.ingredientProductId} bukan bahan thai tea` });
      return;
    }
  }

  const existing = (await db.execute(sql`SELECT id FROM product_recipes WHERE product_id = ${productId}`)).rows[0] as { id: number } | undefined;
  let recipeId: number;

  if (existing) {
    recipeId = existing.id;
    await db.execute(sql`
      UPDATE product_recipes
      SET yield_qty = ${yieldQty ?? 1}, yield_unit = ${yieldUnit ?? "pcs"},
          note = ${note ?? null}, is_active = ${isActive ?? true}, updated_at = NOW()
      WHERE id = ${recipeId}
    `);
    await db.execute(sql`DELETE FROM product_recipe_items WHERE recipe_id = ${recipeId}`);
  } else {
    const r = (await db.execute(sql`
      INSERT INTO product_recipes (product_id, yield_qty, yield_unit, note, is_active)
      VALUES (${productId}, ${yieldQty ?? 1}, ${yieldUnit ?? "pcs"}, ${note ?? null}, ${isActive ?? true})
      RETURNING id
    `)).rows[0] as { id: number };
    recipeId = r.id;
  }

  for (const ing of ingredients) {
    await db.execute(sql`
      INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, qty, unit, note)
      VALUES (${recipeId}, ${ing.ingredientProductId}, ${ing.qty}, ${ing.unit}, ${ing.note ?? null})
    `);
  }

  const result = (await db.execute(sql`
    SELECT pr.*, p.name AS product_name,
      (SELECT json_agg(i) FROM (
        SELECT ri.*, ri.qty::float, ip.name AS ingredient_name
        FROM product_recipe_items ri JOIN products ip ON ip.id = ri.ingredient_product_id
        WHERE ri.recipe_id = pr.id
      ) i) AS ingredients
    FROM product_recipes pr JOIN products p ON p.id = pr.product_id
    WHERE pr.id = ${recipeId}
  `)).rows[0];

  res.status(201).json(result);
});

// ── DELETE /recipes/:id ───────────────────────────────────────────────────────

router.delete("/recipes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  await db.execute(sql`DELETE FROM product_recipes WHERE id = ${id}`);
  res.json({ ok: true });
});

export default router;
