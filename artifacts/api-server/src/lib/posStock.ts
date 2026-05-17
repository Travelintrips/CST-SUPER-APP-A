/**
 * POS Stock Helper — single source of truth via wh_stock + wh_movements.
 *
 * Product types:
 *   STOCK   — deduct wh_stock for linked_product_id
 *   RECIPE  — deduct wh_stock for each ingredient in product_recipes
 *   SERVICE — no stock deduction
 *
 * ERP Sync (always):
 *   Every successful wh_stock deduction is ALSO synced to inventory_stock +
 *   stock_movements. ERP warehouse is resolved in order:
 *     1. thai_tea_warehouse_links for the pos_warehouse
 *     2. warehouses.company_id = pos_branches.company_id (first active)
 *     3. First active warehouse (global fallback)
 *
 *   STOCK items → movement type POS_SALE
 *   RECIPE ingredients → movement type RECIPE_CONSUMPTION
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { postStockOut, postStockIn } from "./inventoryStock.js";

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

/** Resolve ERP warehouse_id for sync:
 *  1. Thai Tea link  2. Branch company  3. Global fallback */
export async function getErpWarehouseIdForBranch(
  posWarehouseId: number,
  branchId: number,
): Promise<number | null> {
  // 1. Thai Tea warehouse link
  const ttRows = await db.execute(sql`
    SELECT erp_warehouse_id FROM thai_tea_warehouse_links
    WHERE pos_warehouse_id = ${posWarehouseId} AND is_active = TRUE
    LIMIT 1
  `);
  const ttLink = (ttRows.rows[0] as { erp_warehouse_id: number } | undefined)?.erp_warehouse_id ?? null;
  if (ttLink) return ttLink;

  // 2. ERP warehouse matching branch's companyId
  const branchRow = (await db.execute(sql`
    SELECT company_id FROM pos_branches WHERE id = ${branchId} LIMIT 1
  `)).rows[0] as { company_id: number | null } | undefined;

  if (branchRow?.company_id) {
    const whRow = (await db.execute(sql`
      SELECT id FROM warehouses
      WHERE company_id = ${branchRow.company_id} AND is_active = TRUE
      ORDER BY id ASC LIMIT 1
    `)).rows[0] as { id: number } | undefined;
    if (whRow) return whRow.id;
  }

  // 3. Global fallback: first active ERP warehouse
  const fallback = (await db.execute(sql`
    SELECT id FROM warehouses WHERE is_active = TRUE ORDER BY id ASC LIMIT 1
  `)).rows[0] as { id: number } | undefined;
  return fallback?.id ?? null;
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
  if (!warehouseId) return [];

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
  const cur = (await tx.execute(sql`
    SELECT id, qty::float, cost_price::float FROM wh_stock
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    FOR UPDATE
  `)).rows[0] as { id: number; qty: number; cost_price: number } | undefined;

  const qtyBefore = Number(cur?.qty ?? 0);
  const qtyAfter = Math.max(0, qtyBefore - qty);
  const costPrice = Number(cur?.cost_price ?? 0);

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

// ── Add stock back (for POS returns) ─────────────────────────────────────────

async function addWhStock(
  tx: typeof db,
  productId: number,
  warehouseId: number,
  qty: number,
  orderId: number,
  note: string,
): Promise<{ qtyAfter: number; costPrice: number }> {
  const cur = (await tx.execute(sql`
    SELECT id, qty::float, cost_price::float FROM wh_stock
    WHERE product_id = ${productId} AND warehouse_id = ${warehouseId}
    FOR UPDATE
  `)).rows[0] as { id: number; qty: number; cost_price: number } | undefined;

  const qtyBefore = Number(cur?.qty ?? 0);
  const qtyAfter = qtyBefore + qty;
  const costPrice = Number(cur?.cost_price ?? 0);

  if (cur) {
    await tx.execute(sql`
      UPDATE wh_stock SET qty = ${String(qtyAfter)}, updated_at = NOW()
      WHERE id = ${cur.id}
    `);
  } else {
    await tx.execute(sql`
      INSERT INTO wh_stock (product_id, warehouse_id, qty, cost_price, updated_at)
      VALUES (${productId}, ${warehouseId}, ${qty}, 0, NOW())
    `);
  }

  await tx.execute(sql`
    INSERT INTO wh_movements
      (product_id, warehouse_id, type, qty, qty_before, qty_after, cost_price, ref_type, ref_id, note, created_at)
    VALUES
      (${productId}, ${warehouseId}, 'return_in', ${String(qty)},
       ${String(qtyBefore)}, ${String(qtyAfter)}, ${costPrice},
       'pos_order', ${orderId}, ${note}, NOW())
  `);

  return { qtyAfter, costPrice };
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

  const erpWarehouseId = await getErpWarehouseIdForBranch(warehouseId, branchId);

  const warnings: string[] = [];

  const erpDeductions: Array<{
    productId: number;
    qty: number;
    costPrice: number;
    note: string;
    movementType: "POS_SALE" | "RECIPE_CONSUMPTION";
  }> = [];

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
        erpDeductions.push({
          productId: item.linkedProductId,
          qty: item.qty,
          costPrice: result.costPrice,
          note: `POS ${orderNumber} — ${item.productName}×${item.qty}`,
          movementType: "POS_SALE",
        });
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
          erpDeductions.push({
            productId: ing.ingredient_product_id,
            qty: required,
            costPrice: result.costPrice,
            note: `POS ${orderNumber} — recipe ${item.productName}×${item.qty}`,
            movementType: "RECIPE_CONSUMPTION",
          });
        }
      }
    }
  });

  // Sync to inventory_stock + stock_movements (ERP)
  if (erpWarehouseId && erpDeductions.length > 0) {
    for (const ded of erpDeductions) {
      try {
        await postStockOut({
          productId: ded.productId,
          warehouseId: erpWarehouseId,
          qty: ded.qty,
          unitCost: ded.costPrice,
          movementType: ded.movementType,
          referenceType: "POS_SESSION",
          referenceId: orderId,
          notes: ded.note,
          strict: false,
        });
      } catch (e) {
        warnings.push(`Sync inventory_stock gagal untuk produk #${ded.productId}: ${(e as Error).message}`);
      }
    }
  }

  return { warnings };
}

/** Add stock back for POS return — updates wh_stock + inventory_stock */
export async function returnPosStock(
  items: Array<{ productId: number; qty: number; note: string }>,
  branchId: number,
  orderId: number,
): Promise<{ warnings: string[] }> {
  const warehouseId = await getWarehouseForBranch(branchId);
  if (!warehouseId) {
    return { warnings: ["Tidak ada gudang aktif untuk cabang ini"] };
  }

  const erpWarehouseId = await getErpWarehouseIdForBranch(warehouseId, branchId);
  const warnings: string[] = [];

  await db.transaction(async (tx) => {
    for (const item of items) {
      await addWhStock(
        tx as unknown as typeof db,
        item.productId,
        warehouseId,
        item.qty,
        orderId,
        item.note,
      );
    }
  });

  if (erpWarehouseId) {
    for (const item of items) {
      try {
        const costRow = (await db.execute(sql`
          SELECT average_cost::float FROM inventory_stock
          WHERE product_id = ${item.productId} AND warehouse_id = ${erpWarehouseId}
          LIMIT 1
        `)).rows[0] as { average_cost: number } | undefined;
        const unitCost = Number(costRow?.average_cost ?? 0);

        await postStockIn({
          productId: item.productId,
          warehouseId: erpWarehouseId,
          qty: item.qty,
          unitCost,
          movementType: "RETURN_IN",
          referenceType: "RETURN",
          referenceId: orderId,
          notes: item.note,
        });
      } catch (e) {
        warnings.push(`Sync return inventory_stock gagal untuk produk #${item.productId}: ${(e as Error).message}`);
      }
    }
  }

  return { warnings };
}
