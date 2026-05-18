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
