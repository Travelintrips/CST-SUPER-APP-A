/**
 * POS Stock Helper — single source of truth via wh_stock + wh_movements.
 *
 * Product types:
 *   STOCK   — deduct wh_stock for linked_product_id
 *   RECIPE  — deduct wh_stock for each ingredient in product_recipes
 *   SERVICE — no stock deduction
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ProductType = "STOCK" | "RECIPE" | "SERVICE";

export interface PosProductStock {
  productId: number;       // pos_products.id
  productName: string;
  productType: ProductType;
  linkedProductId: number | null; // products.id — for STOCK type
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

export async function getWarehouseForBranch(branchId: number): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT id FROM pos_warehouses
    WHERE branch_id = ${branchId} AND is_active = TRUE
    ORDER BY id ASC LIMIT 1
  `);
  return (rows.rows[0] as { id: number } | undefined)?.id ?? null;
}

// ── Stock reader ──────────────────────────────────────────────────────────────

async function getWhStock(productId: number, warehouseId: number): Promise<number> {
  const rows = await db.execute(sql`
    SELECT qty::float FROM wh_stock
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    LIMIT 1
  `);
  return Number((rows.rows[0] as { qty: number } | undefined)?.qty ?? 0);
}

// ── Check availability (no write) ─────────────────────────────────────────────

export async function checkPosStock(
  items: PosProductStock[],
  branchId: number,
): Promise<StockShortage[]> {
  const warehouseId = await getWarehouseForBranch(branchId);
  if (!warehouseId) return []; // no warehouse configured — allow (warn elsewhere)

  const shortages: StockShortage[] = [];

  for (const item of items) {
    if (item.productType === "SERVICE") continue;

    if (item.productType === "STOCK") {
      if (!item.linkedProductId) continue;
      const available = await getWhStock(item.linkedProductId, warehouseId);
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
        const available = await getWhStock(ing.ingredient_product_id, warehouseId);
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

// ── Deduct stock (inside DB transaction) ─────────────────────────────────────

let _seq = 0;
function movNo(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  _seq = (_seq + 1) % 10000;
  return `POS/${ymd}/${String(_seq).padStart(4, "0")}`;
}

async function deductWhStock(
  tx: typeof db,
  productId: number,
  warehouseId: number,
  qty: number,
  orderId: number,
  note: string,
): Promise<void> {
  // SELECT FOR UPDATE to prevent concurrent double-deduction
  const cur = (await tx.execute(sql`
    SELECT id, qty::float FROM wh_stock
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    FOR UPDATE
  `)).rows[0] as { id: number; qty: number } | undefined;

  const qtyBefore = Number(cur?.qty ?? 0);
  const qtyAfter = Math.max(0, qtyBefore - qty);
  const mNo = movNo();

  if (cur) {
    await tx.execute(sql`
      UPDATE wh_stock SET qty = ${String(qtyAfter)}, updated_at = NOW()
      WHERE id = ${cur.id}
    `);
  } else {
    await tx.execute(sql`
      INSERT INTO wh_stock (product_id, warehouse_id, qty, cost_price, updated_at)
      VALUES (${productId}, ${warehouseId}, 0, 0, NOW())
    `);
  }

  await tx.execute(sql`
    INSERT INTO wh_movements
      (product_id, warehouse_id, type, qty, qty_before, qty_after, cost_price, ref_type, ref_id, note, created_at)
    VALUES
      (${productId}, ${warehouseId}, 'pos_sale', ${String(-qty)},
       ${String(qtyBefore)}, ${String(qtyAfter)}, 0,
       'pos_order', ${orderId}, ${note}, NOW())
  `);
}

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

  await db.transaction(async (tx) => {
    for (const item of items) {
      if (item.productType === "SERVICE") continue;

      if (item.productType === "STOCK") {
        if (!item.linkedProductId) {
          warnings.push(`${item.productName}: tidak ada linked_product_id, stok tidak dikurangi`);
          continue;
        }
        await deductWhStock(
          tx as unknown as typeof db,
          item.linkedProductId,
          warehouseId,
          item.qty,
          orderId,
          `POS ${orderNumber} — ${item.productName}×${item.qty}`,
        );
        continue;
      }

      if (item.productType === "RECIPE") {
        const linkedId = item.linkedProductId;
        if (!linkedId) {
          warnings.push(`${item.productName}: tidak ada linked_product_id untuk recipe, stok tidak dikurangi`);
          continue;
        }

        const recipeRow = (await tx.execute(sql`
          SELECT id FROM product_recipes
          WHERE product_id = ${linkedId} AND is_active = TRUE
          LIMIT 1
        `)).rows[0] as { id: number } | undefined;

        if (!recipeRow) {
          warnings.push(`${item.productName}: recipe tidak ditemukan atau tidak aktif`);
          continue;
        }

        const ingredients = (await tx.execute(sql`
          SELECT ingredient_product_id, qty::float
          FROM product_recipe_items
          WHERE recipe_id = ${recipeRow.id}
        `)).rows as Array<{ ingredient_product_id: number; qty: number }>;

        for (const ing of ingredients) {
          const required = ing.qty * item.qty;
          if (required <= 0) continue;
          await deductWhStock(
            tx as unknown as typeof db,
            ing.ingredient_product_id,
            warehouseId,
            required,
            orderId,
            `POS ${orderNumber} — recipe ${item.productName}×${item.qty}`,
          );
        }
      }
    }
  });

  return { warnings };
}
