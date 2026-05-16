/**
 * /api/thai-tea — Manajemen Bahan Thai Tea & Inventori CST
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
 * GET  /stock             — stok CST (wh_stock) untuk bahan thai tea
 * POST /receive           — terima bahan thai tea → update wh_stock + inventory_stock + stock_movements
 *
 * Recipes / BOM:
 * GET  /recipes           — daftar recipe bahan thai tea (product_recipes)
 * POST /recipes           — upsert recipe untuk produk Thai Tea
 * DELETE /recipes/:id     — hapus recipe
 *
 * Warehouse Links:
 * GET  /warehouse-links   — mapping pos_warehouse ↔ erp_warehouse untuk Thai Tea
 * POST /warehouse-links   — buat/update mapping
 * DELETE /warehouse-links/:id — hapus mapping
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

/** Tambah stok ke wh_stock (POS system) + wh_movements */
async function addWhStock(
  productId: number,
  posWarehouseId: number,
  qty: number,
  unitCost: number,
  refType: string,
  refId: number | null,
  note: string,
): Promise<void> {
  const cur = (await db.execute(sql`
    SELECT id, qty::float, cost_price::float FROM wh_stock
    WHERE product_id = ${productId} AND warehouse_id = ${posWarehouseId}
    FOR UPDATE
  `)).rows[0] as { id: number; qty: number; cost_price: number } | undefined;

  const prevQty = Number(cur?.qty ?? 0);
  const newQty = prevQty + qty;
  // Weighted average cost
  const prevCost = Number(cur?.cost_price ?? 0);
  const newCost = newQty > 0 ? (prevQty * prevCost + qty * unitCost) / newQty : unitCost;

  if (cur) {
    await db.execute(sql`
      UPDATE wh_stock
      SET qty = ${String(newQty)}, cost_price = ${String(newCost)}, updated_at = NOW()
      WHERE id = ${cur.id}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO wh_stock (product_id, warehouse_id, qty, cost_price, updated_at)
      VALUES (${productId}, ${posWarehouseId}, ${String(newQty)}, ${String(newCost)}, NOW())
    `);
  }

  await db.execute(sql`
    INSERT INTO wh_movements
      (product_id, warehouse_id, type, qty, qty_before, qty_after, cost_price, ref_type, ref_id, note, created_at)
    VALUES
      (${productId}, ${posWarehouseId}, 'po_receipt', ${String(qty)},
       ${String(prevQty)}, ${String(newQty)}, ${String(unitCost)},
       ${refType}, ${refId}, ${note}, NOW())
  `);
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

router.get("/stock", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      p.unit,
      COALESCE(SUM(ws.qty::float), 0) AS total_qty,
      AVG(ws.cost_price::float) AS avg_cost,
      COUNT(DISTINCT ws.warehouse_id) AS warehouse_count,
      json_agg(
        json_build_object(
          'warehouse_id', pw.id,
          'warehouse_name', pw.name,
          'branch_name', pb.name,
          'qty', ws.qty::float,
          'cost_price', ws.cost_price::float
        ) ORDER BY pw.name
      ) FILTER (WHERE ws.id IS NOT NULL) AS warehouses
    FROM products p
    LEFT JOIN wh_stock ws ON ws.product_id = p.id
    LEFT JOIN pos_warehouses pw ON pw.id = ws.warehouse_id
    LEFT JOIN pos_branches pb ON pb.id = pw.branch_id
    WHERE p.subcategory = ${SUBCATEGORY} AND p.is_active = TRUE
    GROUP BY p.id, p.name, p.sku, p.unit
    ORDER BY p.name
  `);
  res.json(rows.rows);
});

// ── GET /inventory-stock ──────────────────────────────────────────────────────
// Stok dari sisi ERP (inventory_stock) untuk bahan thai tea

router.get("/inventory-stock", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT
      p.id AS product_id,
      p.name AS product_name,
      p.sku,
      p.unit,
      COALESCE(SUM(ist.stock_on_hand::float), 0) AS total_on_hand,
      COALESCE(SUM(ist.stock_available::float), 0) AS total_available,
      AVG(ist.average_cost::float) AS avg_cost,
      json_agg(
        json_build_object(
          'warehouse_id', w.id,
          'warehouse_name', w.warehouse_name,
          'warehouse_code', w.warehouse_code,
          'stock_on_hand', ist.stock_on_hand::float,
          'stock_available', ist.stock_available::float
        ) ORDER BY w.warehouse_name
      ) FILTER (WHERE ist.id IS NOT NULL) AS erp_warehouses
    FROM products p
    LEFT JOIN inventory_stock ist ON ist.product_id = p.id
    LEFT JOIN warehouses w ON w.id = ist.warehouse_id
    WHERE p.subcategory = ${SUBCATEGORY} AND p.is_active = TRUE
    GROUP BY p.id, p.name, p.sku, p.unit
    ORDER BY p.name
  `);
  res.json(rows.rows);
});

// ── POST /receive ─────────────────────────────────────────────────────────────
// Terima bahan Thai Tea: update wh_stock (POS) + inventory_stock (ERP) + movements

router.post("/receive", async (req: Request, res: Response) => {
  const { posWarehouseId, erpWarehouseId, poId, notes, receivedBy, lines } = req.body as {
    posWarehouseId: number;
    erpWarehouseId: number;
    poId?: number | null;
    notes?: string;
    receivedBy?: string;
    lines: Array<{
      productId: number;
      qty: number;
      unitCost: number;
    }>;
  };

  if (!posWarehouseId || !erpWarehouseId || !lines?.length) {
    res.status(400).json({ message: "posWarehouseId, erpWarehouseId, dan lines wajib diisi" });
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

  const receiptNo = grnNo();
  const results: Array<{ productId: number; productName: string; qty: number; whStockAfter: number; erpStockAfter: number }> = [];

  await db.transaction(async (tx) => {
    for (const line of validLines) {
      const prodRow = (await tx.execute(sql`SELECT name, unit FROM products WHERE id = ${line.productId}`)).rows[0] as { name: string; unit: string };

      // 1. Update wh_stock (POS system)
      const whCur = (await tx.execute(sql`
        SELECT id, qty::float, cost_price::float FROM wh_stock
        WHERE product_id = ${line.productId} AND warehouse_id = ${posWarehouseId}
        FOR UPDATE
      `)).rows[0] as { id: number; qty: number; cost_price: number } | undefined;

      const whPrev = Number(whCur?.qty ?? 0);
      const whNew = whPrev + line.qty;
      const prevCost = Number(whCur?.cost_price ?? 0);
      const newCost = whNew > 0 ? (whPrev * prevCost + line.qty * line.unitCost) / whNew : line.unitCost;

      if (whCur) {
        await tx.execute(sql`
          UPDATE wh_stock
          SET qty = ${String(whNew)}, cost_price = ${String(newCost)}, updated_at = NOW()
          WHERE id = ${whCur.id}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO wh_stock (product_id, warehouse_id, qty, cost_price, updated_at)
          VALUES (${line.productId}, ${posWarehouseId}, ${String(whNew)}, ${String(newCost)}, NOW())
        `);
      }

      // 2. Log wh_movements
      await tx.execute(sql`
        INSERT INTO wh_movements
          (product_id, warehouse_id, type, qty, qty_before, qty_after, cost_price,
           ref_type, ref_id, note, created_at)
        VALUES
          (${line.productId}, ${posWarehouseId}, 'po_receipt', ${String(line.qty)},
           ${String(whPrev)}, ${String(whNew)}, ${String(line.unitCost)},
           ${'thai_tea_receive'}, ${poId ?? null},
           ${`${receiptNo} — ${prodRow.name}`}, NOW())
      `);

      results.push({
        productId: line.productId,
        productName: prodRow.name,
        qty: line.qty,
        whStockAfter: whNew,
        erpStockAfter: 0,
      });
    }
  });

  // 3. Update inventory_stock + stock_movements (ERP system) — setelah transaksi wh agar tidak nested
  for (const line of validLines) {
    const prodRow = (await db.execute(sql`SELECT name FROM products WHERE id = ${line.productId}`)).rows[0] as { name: string };
    const r = await postStockIn({
      productId: line.productId,
      warehouseId: erpWarehouseId,
      qty: line.qty,
      unitCost: line.unitCost,
      movementType: "PURCHASE_RECEIPT",
      referenceType: poId ? "PURCHASE_ORDER" : "MANUAL",
      referenceId: poId ?? null,
      notes: `${receiptNo} — Thai Tea — ${prodRow.name} — ${notes ?? ""}`.trim(),
      createdBy: receivedBy ?? null,
    });
    const entry = results.find(x => x.productId === line.productId);
    if (entry) entry.erpStockAfter = r.balanceAfter;
  }

  res.status(201).json({
    receiptNo,
    businessUnit: BUSINESS_UNIT,
    posWarehouseId,
    erpWarehouseId,
    lines: results,
    message: `${validLines.length} item berhasil diterima ke gudang Thai Tea`,
  });
});

// ── GET /warehouses ───────────────────────────────────────────────────────────

router.get("/warehouses", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT pw.id, pw.name, pw.type, pw.is_active, pb.name AS branch_name, pb.business_unit
    FROM pos_warehouses pw
    LEFT JOIN pos_branches pb ON pb.id = pw.branch_id
    WHERE pw.is_active = TRUE
    ORDER BY pw.name
  `);
  res.json(rows.rows);
});

// ── GET /erp-warehouses ───────────────────────────────────────────────────────

router.get("/erp-warehouses", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT id, warehouse_code, warehouse_name, warehouse_type
    FROM warehouses WHERE is_active = TRUE ORDER BY warehouse_name
  `);
  res.json(rows.rows);
});

// ── GET /warehouse-links ──────────────────────────────────────────────────────

router.get("/warehouse-links", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT
      ttl.id, ttl.pos_warehouse_id, ttl.erp_warehouse_id, ttl.is_active, ttl.note,
      pw.name AS pos_warehouse_name,
      pb.name AS branch_name, pb.business_unit,
      w.warehouse_name AS erp_warehouse_name, w.warehouse_code
    FROM thai_tea_warehouse_links ttl
    JOIN pos_warehouses pw ON pw.id = ttl.pos_warehouse_id
    LEFT JOIN pos_branches pb ON pb.id = pw.branch_id
    JOIN warehouses w ON w.id = ttl.erp_warehouse_id
    ORDER BY ttl.id
  `);
  res.json(rows.rows);
});

// ── POST /warehouse-links ─────────────────────────────────────────────────────

router.post("/warehouse-links", async (req: Request, res: Response) => {
  const { posWarehouseId, erpWarehouseId, note } = req.body as {
    posWarehouseId: number; erpWarehouseId: number; note?: string;
  };
  if (!posWarehouseId || !erpWarehouseId) {
    res.status(400).json({ message: "posWarehouseId dan erpWarehouseId wajib diisi" });
    return;
  }

  // Upsert by pos_warehouse_id
  const existing = (await db.execute(sql`
    SELECT id FROM thai_tea_warehouse_links WHERE pos_warehouse_id = ${posWarehouseId}
  `)).rows[0] as { id: number } | undefined;

  if (existing) {
    await db.execute(sql`
      UPDATE thai_tea_warehouse_links
      SET erp_warehouse_id = ${erpWarehouseId}, note = ${note ?? null}, is_active = TRUE
      WHERE id = ${existing.id}
    `);
    const row = (await db.execute(sql`SELECT * FROM thai_tea_warehouse_links WHERE id = ${existing.id}`)).rows[0];
    res.json(row);
  } else {
    const row = (await db.execute(sql`
      INSERT INTO thai_tea_warehouse_links (pos_warehouse_id, erp_warehouse_id, is_active, note)
      VALUES (${posWarehouseId}, ${erpWarehouseId}, TRUE, ${note ?? null})
      RETURNING *
    `)).rows[0];
    res.status(201).json(row);
  }
});

// ── DELETE /warehouse-links/:id ───────────────────────────────────────────────

router.delete("/warehouse-links/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  await db.execute(sql`DELETE FROM thai_tea_warehouse_links WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── GET /recipes ──────────────────────────────────────────────────────────────
// Daftar product_recipes untuk produk yang menggunakan bahan_thai_tea

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
// Upsert recipe untuk produk Thai Tea (product_type = RECIPE)

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

  // Validasi: semua ingredients harus bahan_thai_tea
  for (const ing of ingredients) {
    if (!ing.qty || ing.qty <= 0) {
      res.status(400).json({ message: "qty ingredient harus > 0" });
      return;
    }
    const ingRow = (await db.execute(sql`
      SELECT subcategory FROM products WHERE id = ${ing.ingredientProductId}
    `)).rows[0] as { subcategory: string | null } | undefined;
    if (!ingRow) {
      res.status(400).json({ message: `Ingredient #${ing.ingredientProductId} tidak ditemukan` });
      return;
    }
    if (ingRow.subcategory !== SUBCATEGORY) {
      res.status(400).json({ message: `Ingredient #${ing.ingredientProductId} bukan bahan thai tea` });
      return;
    }
  }

  const existing = (await db.execute(sql`
    SELECT id FROM product_recipes WHERE product_id = ${productId}
  `)).rows[0] as { id: number } | undefined;

  let recipeId: number;
  if (existing) {
    await db.execute(sql`
      UPDATE product_recipes
      SET yield_qty = ${String(yieldQty ?? 1)}, yield_unit = ${yieldUnit ?? "cup"},
          note = ${note ?? null}, is_active = ${isActive !== false},
          updated_at = NOW()
      WHERE id = ${existing.id}
    `);
    recipeId = existing.id;
    await db.execute(sql`DELETE FROM product_recipe_items WHERE recipe_id = ${recipeId}`);
  } else {
    const r = (await db.execute(sql`
      INSERT INTO product_recipes (product_id, yield_qty, yield_unit, note, is_active)
      VALUES (${productId}, ${String(yieldQty ?? 1)}, ${yieldUnit ?? "cup"}, ${note ?? null}, ${isActive !== false})
      RETURNING id
    `)).rows[0] as { id: number };
    recipeId = r.id;
  }

  for (const ing of ingredients) {
    await db.execute(sql`
      INSERT INTO product_recipe_items (recipe_id, ingredient_product_id, qty, unit, note)
      VALUES (${recipeId}, ${ing.ingredientProductId}, ${String(ing.qty)}, ${ing.unit}, ${ing.note ?? null})
    `);
  }

  // Tandai produk sebagai RECIPE di pos_products (jika ada linked product)
  await db.execute(sql`
    UPDATE pos_products
    SET product_type = 'RECIPE', linked_product_id = ${productId}
    WHERE linked_product_id = ${productId}
  `);

  const result = (await db.execute(sql`
    SELECT
      pr.id, pr.product_id, p.name AS product_name,
      pr.yield_qty::float, pr.yield_unit, pr.note, pr.is_active,
      json_agg(
        json_build_object(
          'id', ri.id, 'ingredient_product_id', ri.ingredient_product_id,
          'ingredient_name', ip.name, 'unit', ri.unit, 'qty', ri.qty::float
        )
      ) AS ingredients
    FROM product_recipes pr
    JOIN products p ON p.id = pr.product_id
    LEFT JOIN product_recipe_items ri ON ri.recipe_id = pr.id
    LEFT JOIN products ip ON ip.id = ri.ingredient_product_id
    WHERE pr.id = ${recipeId}
    GROUP BY pr.id, pr.product_id, p.name, pr.yield_qty, pr.yield_unit, pr.note, pr.is_active
  `)).rows[0];

  res.status(existing ? 200 : 201).json(result);
});

// ── DELETE /recipes/:id ───────────────────────────────────────────────────────

router.delete("/recipes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) { res.status(400).json({ message: "Invalid id" }); return; }
  await db.execute(sql`DELETE FROM product_recipes WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── POST /production ─────────────────────────────────────────────────────────
// Catat produksi/racikan: deduct bahan baku dari wh_stock + inventory_stock (ERP)

router.post("/production", async (req: Request, res: Response) => {
  const { recipeId, qty, posWarehouseId, notes, batchNo } = req.body as {
    recipeId: number;
    qty: number;
    posWarehouseId: number;
    notes?: string;
    batchNo?: string;
  };
  if (!recipeId || !qty || qty <= 0 || !posWarehouseId) {
    res.status(400).json({ message: "recipeId, qty > 0, dan posWarehouseId wajib diisi" });
    return;
  }

  const recipe = (await db.execute(sql`
    SELECT pr.id, pr.yield_qty::float, pr.yield_unit, p.name AS product_name
    FROM product_recipes pr
    JOIN products p ON p.id = pr.product_id
    WHERE pr.id = ${recipeId} AND pr.is_active = TRUE
  `)).rows[0] as { id: number; yield_qty: number; yield_unit: string; product_name: string } | undefined;

  if (!recipe) {
    res.status(404).json({ message: "Recipe tidak ditemukan atau tidak aktif" });
    return;
  }

  const ingredients = (await db.execute(sql`
    SELECT ri.ingredient_product_id, ri.qty::float, ri.unit, p.name AS ingredient_name
    FROM product_recipe_items ri
    JOIN products p ON p.id = ri.ingredient_product_id
    WHERE ri.recipe_id = ${recipeId}
  `)).rows as Array<{ ingredient_product_id: number; qty: number; unit: string; ingredient_name: string }>;

  if (!ingredients.length) {
    res.status(400).json({ message: "Recipe tidak memiliki bahan baku" });
    return;
  }

  // Cek ERP warehouse link untuk pos_warehouse ini
  const erpLink = (await db.execute(sql`
    SELECT erp_warehouse_id FROM thai_tea_warehouse_links
    WHERE pos_warehouse_id = ${posWarehouseId} AND is_active = TRUE
    LIMIT 1
  `)).rows[0] as { erp_warehouse_id: number } | undefined;

  const batchId = batchNo ?? `PROD/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/${Date.now().toString().slice(-5)}`;
  const deductions: Array<{ ingredientName: string; unit: string; requiredQty: number; deductedQty: number; whBefore: number; whAfter: number }> = [];

  await db.transaction(async (tx) => {
    for (const ing of ingredients) {
      const required = ing.qty * qty;

      const cur = (await tx.execute(sql`
        SELECT id, qty::float, cost_price::float FROM wh_stock
        WHERE product_id = ${ing.ingredient_product_id} AND warehouse_id = ${posWarehouseId}
        FOR UPDATE
      `)).rows[0] as { id: number; qty: number; cost_price: number } | undefined;

      const whBefore = Number(cur?.qty ?? 0);
      const whAfter = Math.max(0, whBefore - required);
      const costPrice = Number(cur?.cost_price ?? 0);

      if (cur) {
        await tx.execute(sql`
          UPDATE wh_stock SET qty = ${String(whAfter)}, updated_at = NOW()
          WHERE id = ${cur.id}
        `);
      } else {
        await tx.execute(sql`
          INSERT INTO wh_stock (product_id, warehouse_id, qty, cost_price, updated_at)
          VALUES (${ing.ingredient_product_id}, ${posWarehouseId}, 0, 0, NOW())
        `);
      }

      await tx.execute(sql`
        INSERT INTO wh_movements
          (product_id, warehouse_id, type, qty, qty_before, qty_after, cost_price, ref_type, ref_id, note, created_at)
        VALUES
          (${ing.ingredient_product_id}, ${posWarehouseId}, 'production_consumption',
           ${String(-required)}, ${String(whBefore)}, ${String(whAfter)}, ${String(costPrice)},
           ${'thai_tea_production'}, ${null},
           ${`${batchId} — ${recipe.product_name} ×${qty} — ${notes ?? ""}`}, NOW())
      `);

      deductions.push({
        ingredientName: ing.ingredient_name,
        unit: ing.unit,
        requiredQty: required,
        deductedQty: Math.min(required, whBefore),
        whBefore,
        whAfter,
      });
    }
  });

  // Sync ke ERP inventory_stock
  if (erpLink?.erp_warehouse_id) {
    for (const ing of ingredients) {
      const required = ing.qty * qty;
      try {
        await postStockIn({
          productId: ing.ingredient_product_id,
          warehouseId: erpLink.erp_warehouse_id,
          qty: -required,
          unitCost: 0,
          movementType: "PRODUCTION_CONSUMPTION",
          referenceType: "MANUAL",
          referenceId: null,
          notes: `${batchId} — Thai Tea Produksi — ${recipe.product_name} ×${qty}`,
          createdBy: null,
        });
      } catch (_) { /* non-fatal */ }
    }
  }

  res.status(201).json({
    batchId,
    recipeId,
    productName: recipe.product_name,
    qty,
    posWarehouseId,
    deductions,
    message: `Produksi ${recipe.product_name} ×${qty} berhasil dicatat`,
  });
});

// ── GET /movements ────────────────────────────────────────────────────────────
// Riwayat gerakan stok untuk bahan Thai Tea (wh_movements)

router.get("/movements", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 200), 500);
  const type = req.query.type as string | undefined;
  const productId = req.query.product_id ? Number(req.query.product_id) : undefined;

  const rows = await db.execute(sql`
    SELECT
      wm.id, wm.type, wm.qty::float, wm.qty_before::float, wm.qty_after::float,
      wm.cost_price::float, wm.ref_type, wm.ref_id, wm.note, wm.created_at,
      p.name AS product_name, p.sku AS product_sku, p.unit,
      pw.name AS warehouse_name, pb.name AS branch_name
    FROM wh_movements wm
    JOIN products p ON p.id = wm.product_id
    LEFT JOIN pos_warehouses pw ON pw.id = wm.warehouse_id
    LEFT JOIN pos_branches pb ON pb.id = pw.branch_id
    WHERE p.subcategory = 'bahan_thai_tea'
      ${type ? sql`AND wm.type = ${type}` : sql``}
      ${productId ? sql`AND wm.product_id = ${productId}` : sql``}
    ORDER BY wm.created_at DESC
    LIMIT ${limit}
  `);
  res.json(rows.rows);
});

// ── POST /seed ───────────────────────────────────────────────────────────────

router.post("/seed", async (_req: Request, res: Response) => {
  const seeded: string[] = [];
  const skipped: string[] = [];
  for (const bahan of DEFAULT_BAHAN) {
    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, bahan.sku.toUpperCase()))
      .limit(1);
    if (existing.length > 0) {
      skipped.push(bahan.sku);
      continue;
    }
    await db.insert(productsTable).values({
      name: bahan.name,
      sku: bahan.sku.toUpperCase(),
      unit: bahan.unit,
      price: String(bahan.price),
      description: bahan.description,
      subcategory: SUBCATEGORY,
      itemType: "barang",
      isActive: true,
    });
    seeded.push(bahan.sku);
  }
  res.json({ seeded: seeded.length, skipped: skipped.length, items: seeded });
});

export default router;
