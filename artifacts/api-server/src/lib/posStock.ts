/**
 * POS Stock Helper — single source of truth via inventory_stock + stock_movements.
 *
 * Gudang diselesaikan dari warehouses.branch_id = pos_branches.id
 * Tidak ada lagi sistem dual-stock / thai_tea_warehouse_links.
 *
 * Product types:
 *   STOCK   — deduct inventory_stock untuk linked_product_id
 *   RECIPE  — deduct inventory_stock untuk setiap ingredient
 *   SERVICE — tidak ada deduction stok
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { postStockOut, postStockIn } from "./inventoryStock.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductType = "STOCK" | "RECIPE" | "SERVICE";

export interface PosProductStock {
  productId: number;
  productName: string;
  productType: ProductType;
  linkedProductId: number | null;
  qty: number;
}

export interface StockShortage {
  productName: string;
  ingredientName: string;
  unit: string;
  required: number;
  available: number;
}

// ── Warehouse resolution ───────────────────────────────────────────────────────

/** Resolve warehouse_id dari warehouses berdasarkan branch_id POS */
export async function getWarehouseForBranch(branchId: number): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT id FROM warehouses
    WHERE branch_id = ${branchId} AND is_active = TRUE
    ORDER BY id ASC LIMIT 1
  `);
  return (rows.rows[0] as { id: number } | undefined)?.id ?? null;
}

// ── Stock reader ──────────────────────────────────────────────────────────────

async function getInvStock(productId: number, warehouseId: number): Promise<number> {
  const rows = await db.execute(sql`
    SELECT stock_available::float FROM inventory_stock
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    LIMIT 1
  `);
  return Number((rows.rows[0] as { stock_available: number } | undefined)?.stock_available ?? 0);
}

// ── Check availability (no write) ─────────────────────────────────────────────

export async function checkPosStock(
  items: PosProductStock[],
  branchId: number,
): Promise<StockShortage[]> {
  const warehouseId = await getWarehouseForBranch(branchId);
  if (!warehouseId) return [];

  const shortages: StockShortage[] = [];

  for (const item of items) {
    if (item.productType === "SERVICE") continue;

    if (item.productType === "STOCK") {
      if (!item.linkedProductId) continue;
      const available = await getInvStock(item.linkedProductId, warehouseId);
      if (available < item.qty) {
        const prodRow = (await db.execute(sql`
          SELECT name, unit FROM products WHERE id = ${item.linkedProductId}
        `)).rows[0] as { name: string; unit: string } | undefined;
        shortages.push({
          productName: item.productName,
          ingredientName: prodRow?.name ?? `Produk #${item.linkedProductId}`,
          unit: prodRow?.unit ?? "pcs",
          required: item.qty,
          available,
        });
      }
      continue;
    }

    if (item.productType === "RECIPE") {
      const recipeRow = (await db.execute(sql`
        SELECT id FROM product_recipes
        WHERE product_id = ${item.linkedProductId ?? -1} AND is_active = TRUE
        LIMIT 1
      `)).rows[0] as { id: number } | undefined;

      if (!recipeRow) continue;

      const ingredients = (await db.execute(sql`
        SELECT ri.ingredient_product_id, ri.qty::float, ri.unit,
               p.name AS ingredient_name
        FROM product_recipe_items ri
        JOIN products p ON p.id = ri.ingredient_product_id
        WHERE ri.recipe_id = ${recipeRow.id}
      `)).rows as Array<{
        ingredient_product_id: number;
        qty: number;
        unit: string;
        ingredient_name: string;
      }>;

      for (const ing of ingredients) {
        const required = ing.qty * item.qty;
        const available = await getInvStock(ing.ingredient_product_id, warehouseId);
        if (available < required) {
          shortages.push({
            productName: item.productName,
            ingredientName: ing.ingredient_name,
            unit: ing.unit,
            required: Math.round(required * 1000) / 1000,
            available: Math.round(available * 1000) / 1000,
          });
        }
      }
    }
  }

  return shortages;
}

// ── Deduct stock ──────────────────────────────────────────────────────────────

export async function deductPosStock(
  items: PosProductStock[],
  branchId: number,
  orderId: number,
  orderNumber: string,
): Promise<{ warnings: string[] }> {
  const warehouseId = await getWarehouseForBranch(branchId);
  if (!warehouseId) {
    return { warnings: ["Tidak ada gudang aktif untuk cabang ini — stok tidak dikurangi"] };
  }

  const warnings: string[] = [];

  for (const item of items) {
    if (item.productType === "SERVICE") continue;

    if (item.productType === "STOCK") {
      if (!item.linkedProductId) {
        warnings.push(`${item.productName}: tidak ada linked_product_id, stok tidak dikurangi`);
        continue;
      }
      try {
        await postStockOut({
          productId: item.linkedProductId,
          warehouseId,
          qty: item.qty,
          movementType: "POS_SALE",
          referenceType: "POS_SESSION",
          referenceId: orderId,
          notes: `POS ${orderNumber} — ${item.productName}×${item.qty}`,
          strict: false,
        });
      } catch (e) {
        warnings.push(`${item.productName}: gagal kurangi stok — ${(e as Error).message}`);
      }
      continue;
    }

    if (item.productType === "RECIPE") {
      const linkedId = item.linkedProductId;
      if (!linkedId) {
        warnings.push(`${item.productName}: tidak ada linked_product_id untuk recipe, stok tidak dikurangi`);
        continue;
      }

      const recipeRow = (await db.execute(sql`
        SELECT id FROM product_recipes
        WHERE product_id = ${linkedId} AND is_active = TRUE
        LIMIT 1
      `)).rows[0] as { id: number } | undefined;

      if (!recipeRow) {
        warnings.push(`${item.productName}: recipe tidak ditemukan atau tidak aktif`);
        continue;
      }

      const ingredients = (await db.execute(sql`
        SELECT ingredient_product_id, qty::float
        FROM product_recipe_items
        WHERE recipe_id = ${recipeRow.id}
      `)).rows as Array<{ ingredient_product_id: number; qty: number }>;

      for (const ing of ingredients) {
        const required = ing.qty * item.qty;
        if (required <= 0) continue;
        try {
          await postStockOut({
            productId: ing.ingredient_product_id,
            warehouseId,
            qty: required,
            movementType: "RECIPE_CONSUMPTION",
            referenceType: "POS_SESSION",
            referenceId: orderId,
            notes: `POS ${orderNumber} — recipe ${item.productName}×${item.qty}`,
            strict: false,
          });
        } catch (e) {
          warnings.push(`Recipe ${item.productName} bahan #${ing.ingredient_product_id}: ${(e as Error).message}`);
        }
      }
    }
  }

  return { warnings };
}

// ── POS Warehouse resolution (pos_branches → pos_warehouses) ─────────────────

async function getPosWarehouseForBranch(branchId: number): Promise<number | null> {
  // Coba default_warehouse_id di cabang dulu
  const branchRow = (await db.execute(sql`
    SELECT default_warehouse_id FROM pos_branches WHERE id = ${branchId}
  `)).rows[0] as { default_warehouse_id: number | null } | undefined;
  const defWh = branchRow?.default_warehouse_id;
  if (defWh) return defWh;
  // Fallback: gudang aktif pertama untuk cabang ini
  const whRow = (await db.execute(sql`
    SELECT id FROM pos_warehouses WHERE branch_id = ${branchId} AND is_active = TRUE
    ORDER BY id ASC LIMIT 1
  `)).rows[0] as { id: number } | undefined;
  return whRow?.id ?? null;
}

// ── POS BOM stock check (pos_recipes + pos_inventory_stocks) ──────────────────

/** Cek ketersediaan bahan baku berdasarkan pos_recipes. Tidak melakukan deduction. */
export async function checkPosBomStock(
  orderItems: Array<{ productId: number; productName: string; qty: number }>,
  branchId: number,
): Promise<StockShortage[]> {
  const warehouseId = await getPosWarehouseForBranch(branchId);
  if (!warehouseId) return [];

  // Gabungkan kebutuhan bahan yang sama dari berbagai produk
  const requiredMap = new Map<number, {
    required: number; itemName: string; unit: string; productName: string;
  }>();

  for (const item of orderItems) {
    const recipeRow = (await db.execute(sql`
      SELECT id FROM pos_recipes
      WHERE product_id = ${item.productId} AND is_active = TRUE
      LIMIT 1
    `)).rows[0] as { id: number } | undefined;
    if (!recipeRow) continue;

    const riRows = (await db.execute(sql`
      SELECT ri.item_id,
             ri.qty::float                            AS qty,
             COALESCE(ri.waste_pct, 0)::float         AS waste_pct,
             ii.name                                  AS item_name,
             ii.unit
      FROM pos_recipe_items ri
      JOIN pos_inventory_items ii ON ii.id = ri.item_id
      WHERE ri.recipe_id = ${recipeRow.id}
    `)).rows as Array<{
      item_id: number; qty: number; waste_pct: number; item_name: string; unit: string;
    }>;

    for (const ri of riRows) {
      const needed = ri.qty * item.qty * (1 + ri.waste_pct / 100);
      const prev = requiredMap.get(ri.item_id);
      if (prev) {
        prev.required += needed;
      } else {
        requiredMap.set(ri.item_id, {
          required: needed,
          itemName: ri.item_name,
          unit: ri.unit,
          productName: item.productName,
        });
      }
    }
  }

  const shortages: StockShortage[] = [];
  for (const [itemId, { required, itemName, unit, productName }] of requiredMap) {
    const stockRow = (await db.execute(sql`
      SELECT COALESCE(qty, 0)::float AS qty
      FROM pos_inventory_stocks
      WHERE item_id = ${itemId}
        AND branch_id = ${branchId}
        AND warehouse_id = ${warehouseId}
      LIMIT 1
    `)).rows[0] as { qty: number } | undefined;
    const available = Number(stockRow?.qty ?? 0);
    if (available < required) {
      shortages.push({
        productName,
        ingredientName: itemName,
        unit,
        required: Math.round(required * 1000) / 1000,
        available: Math.round(available * 1000) / 1000,
      });
    }
  }

  return shortages;
}

// ── POS BOM stock deduction (pos_inventory_stocks + pos_stock_mutations) ──────

/**
 * Kurangi stok bahan baku berdasarkan pos_recipes.
 *
 * @param tx  Drizzle transaction client (opsional). Jika diberikan, deduction
 *            berjalan dalam satu transaksi bersama operasi lain (misal order
 *            update). Jika tidak diberikan, fungsi membuat transaksinya sendiri.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function deductPosBomStock(
  orderItems: Array<{ productId: number; productName: string; qty: number }>,
  branchId: number,
  saleId: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx?: any,
): Promise<void> {
  const warehouseId = await getPosWarehouseForBranch(branchId);
  if (!warehouseId) return;

  // Bangun peta deduction (gabungkan bahan yang sama)
  const deductMap = new Map<number, { requiredQty: number; note: string; itemName: string }>();

  for (const item of orderItems) {
    const recipeRow = (await db.execute(sql`
      SELECT id FROM pos_recipes
      WHERE product_id = ${item.productId} AND is_active = TRUE
      LIMIT 1
    `)).rows[0] as { id: number } | undefined;
    if (!recipeRow) continue;

    const riRows = (await db.execute(sql`
      SELECT ri.item_id,
             ri.qty::float                           AS qty,
             COALESCE(ri.waste_pct, 0)::float        AS waste_pct,
             ii.name                                 AS item_name
      FROM pos_recipe_items ri
      JOIN pos_inventory_items ii ON ii.id = ri.item_id
      WHERE ri.recipe_id = ${recipeRow.id}
    `)).rows as Array<{ item_id: number; qty: number; waste_pct: number; item_name: string }>;

    for (const ri of riRows) {
      const needed = ri.qty * item.qty * (1 + ri.waste_pct / 100);
      if (needed <= 0) continue;
      const prev = deductMap.get(ri.item_id);
      if (prev) {
        prev.requiredQty += needed;
      } else {
        deductMap.set(ri.item_id, {
          requiredQty: needed,
          note: `POS Sale #${saleId} — ${item.productName}×${item.qty}`,
          itemName: ri.item_name,
        });
      }
    }
  }

  if (deductMap.size === 0) return;

  const runDeductions = async (client: typeof db | NonNullable<typeof tx>) => {
    for (const [itemId, d] of deductMap) {
      // Kunci baris, baca qty terkini (FOR UPDATE)
      const lockRow = (await client.execute(sql`
        SELECT id, qty::float AS qty
        FROM pos_inventory_stocks
        WHERE item_id      = ${itemId}
          AND branch_id    = ${branchId}
          AND warehouse_id = ${warehouseId}
        FOR UPDATE
        LIMIT 1
      `)).rows[0] as { id: number; qty: number } | undefined;

      if (!lockRow) {
        throw new Error(`Stok bahan "${d.itemName}" tidak ditemukan di gudang ini`);
      }
      const qtyBefore = Number(lockRow.qty);
      if (qtyBefore < d.requiredQty) {
        throw new Error(
          `Stok "${d.itemName}" tidak cukup: butuh ${d.requiredQty.toFixed(3)}, tersedia ${qtyBefore.toFixed(3)}`,
        );
      }
      const qtyAfter = qtyBefore - d.requiredQty;

      await client.execute(sql`
        UPDATE pos_inventory_stocks
        SET qty = ${String(qtyAfter)}, updated_at = NOW()
        WHERE id = ${lockRow.id}
      `);

      await client.execute(sql`
        INSERT INTO pos_stock_mutations
          (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after,
           ref_type, ref_id, note, created_at)
        VALUES
          (${itemId}, ${branchId}, ${warehouseId},
           'sale',
           ${String(-d.requiredQty)}, ${String(qtyBefore)}, ${String(qtyAfter)},
           'sales', ${saleId}, ${d.note}, NOW())
      `);
    }
  };

  if (tx) {
    // Gunakan tx yang diberikan caller (sudah dalam satu transaksi dengan order update)
    await runDeductions(tx);
  } else {
    // Buat transaksi sendiri
    await db.transaction(async (innerTx) => {
      await runDeductions(innerTx);
    });
  }
}

// ── Add stock back (for POS returns) ─────────────────────────────────────────

export async function returnPosStock(
  items: Array<{ productId: number; qty: number; note: string }>,
  branchId: number,
  orderId: number,
): Promise<{ warnings: string[] }> {
  const warehouseId = await getWarehouseForBranch(branchId);
  if (!warehouseId) {
    return { warnings: ["Tidak ada gudang aktif untuk cabang ini"] };
  }

  const warnings: string[] = [];

  for (const item of items) {
    try {
      const costRow = (await db.execute(sql`
        SELECT average_cost::float FROM inventory_stock
        WHERE product_id = ${item.productId} AND warehouse_id = ${warehouseId}
        LIMIT 1
      `)).rows[0] as { average_cost: number } | undefined;
      const unitCost = Number(costRow?.average_cost ?? 0);

      await postStockIn({
        productId: item.productId,
        warehouseId,
        qty: item.qty,
        unitCost,
        movementType: "RETURN_IN",
        referenceType: "RETURN",
        referenceId: orderId,
        notes: item.note,
      });
    } catch (e) {
      warnings.push(`Return stok gagal untuk produk #${item.productId}: ${(e as Error).message}`);
    }
  }

  return { warnings };
}
