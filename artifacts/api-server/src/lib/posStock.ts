/**
 * POS Stock Helper — single source of truth via wh_stock + wh_movements.
 *
 * Product types:
 *   STOCK   — deduct wh_stock for linked_product_id
 *   RECIPE  — deduct wh_stock for each ingredient in product_recipes
 *   SERVICE — no stock deduction
 *
 * Thai Tea Rule (business_unit = THAI_TEA):
 *   RECIPE products deduct ingredients from wh_stock (POS).
 *   If a thai_tea_warehouse_links mapping exists for the pos_warehouse,
 *   also syncs deduction to inventory_stock + stock_movements (ERP).
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { postStockOut } from "./inventoryStock.js";

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

/** Cari ERP warehouse_id yang dilink ke pos_warehouse ini (untuk Thai Tea sync) */
async function getErpWarehouseForPos(posWarehouseId: number): Promise<number | null> {
  const rows = await db.execute(sql`
    SELECT erp_warehouse_id FROM thai_tea_warehouse_links
    WHERE pos_warehouse_id = ${posWarehouseId} AND is_active = TRUE
    LIMIT 1
  `);
  return (rows.rows[0] as { erp_warehouse_id: number } | undefined)?.erp_warehouse_id ?? null;
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
): Promise<{ qtyBefore: number; qtyAfter: number; costPrice: number }> {
  // SELECT FOR UPDATE to prevent concurrent double-deduction
  const cur = (await tx.execute(sql`
    SELECT id, qty::float, cost_price::float FROM wh_stock
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    FOR UPDATE
  `)).rows[0] as { id: number; qty: number; cost_price: number } | undefined;

  const qtyBefore = Number(cur?.qty ?? 0);
  const qtyAfter = Math.max(0, qtyBefore - qty);
  const costPrice = Number(cur?.cost_price ?? 0);
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

  return { qtyBefore, qtyAfter, costPrice };
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

  // Cek apakah ada link ke ERP warehouse (untuk Thai Tea sync)
  const erpWarehouseId = await getErpWarehouseForPos(warehouseId);

  const warnings: string[] = [];

  // Collect ERP deductions to run OUTSIDE the transaction (postStockOut uses its own connection)
  const erpDeductions: Array<{ productId: number; qty: number; costPrice: number; note: string }> = [];

  await db.transaction(async (tx) => {
    for (const item of items) {
      if (item.productType === "SERVICE") continue;

      if (item.productType === "STOCK") {
        if (!item.linkedProductId) {
          warnings.push(`${item.productName}: tidak ada linked_product_id, stok tidak dikurangi`);
          continue;
        }
        const result = await deductWhStock(
          tx as unknown as typeof db,
          item.linkedProductId,
          warehouseId,
          item.qty,
          orderId,
          `POS ${orderNumber} — ${item.productName}×${item.qty}`,
        );
        if (erpWarehouseId) {
          erpDeductions.push({
            productId: item.linkedProductId,
            qty: item.qty,
            costPrice: result.costPrice,
            note: `POS ${orderNumber} — ${item.productName}×${item.qty}`,
          });
        }
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
          const result = await deductWhStock(
            tx as unknown as typeof db,
            ing.ingredient_product_id,
            warehouseId,
            required,
            orderId,
            `POS ${orderNumber} — recipe ${item.productName}×${item.qty}`,
          );
          if (erpWarehouseId) {
            erpDeductions.push({
              productId: ing.ingredient_product_id,
              qty: required,
              costPrice: result.costPrice,
              note: `POS ${orderNumber} — recipe ${item.productName}×${item.qty}`,
            });
          }
        }
      }
    }
  });

  // Sync deductions to inventory_stock + stock_movements (ERP) jika ada Thai Tea warehouse link
  if (erpWarehouseId && erpDeductions.length > 0) {
    for (const ded of erpDeductions) {
      try {
        await postStockOut({
          productId: ded.productId,
          warehouseId: erpWarehouseId,
          qty: ded.qty,
          unitCost: ded.costPrice,
          movementType: "POS_SALE",
          referenceType: "POS_SESSION",
          referenceId: orderId,
          notes: ded.note,
        });
      } catch (e) {
        // Jangan gagalkan transaksi POS karena error sync ERP
        warnings.push(`Sync inventory_stock gagal untuk produk #${ded.productId}: ${(e as Error).message}`);
      }
    }
  }

  return { warnings };
}
