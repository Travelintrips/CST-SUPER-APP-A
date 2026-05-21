import { Router, type Request, type Response, type NextFunction } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";

const router = Router();

router.use((req: Request, res: Response, next: NextFunction) => {
  requireClerkUser(req, res).then((ok) => { if (ok) next(); }).catch(next);
});

// ── helpers ──────────────────────────────────────────────────────────────────

function makeOpnameNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const ms = now.getTime().toString().slice(-5);
  return `OPN/${y}${m}${d}/${ms}`;
}

function makeTransferNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const ms = now.getTime().toString().slice(-5);
  return `TRF/${y}${m}${d}/${ms}`;
}

function makeReturnNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const ms = now.getTime().toString().slice(-5);
  return `RTN/${y}${m}${d}/${ms}`;
}

function makeLossNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const ms = now.getTime().toString().slice(-5);
  return `LSS/${y}${m}${d}/${ms}`;
}

// ── helpers user context ─────────────────────────────────────────────────────

function getReqCompanyId(req: Request): number | null {
  const user = req.user as { companyId?: number | null } | undefined;
  return user?.companyId ?? null;
}

function isReqAdmin(req: Request): boolean {
  const user = req.user as { role?: string | null } | undefined;
  return user?.role === "admin";
}

// ── CABANG ───────────────────────────────────────────────────────────────────
// P3 (Audit K5/R2): company_id filter diterapkan di semua route branches.
// Non-admin hanya melihat/mengubah cabang milik companyId mereka sendiri.
// Data lama dengan company_id = NULL tetap terlihat (backward compat) tapi
// insert baru selalu menyertakan company_id.

router.get("/branches", async (req: Request, res: Response) => {
  const businessUnit = req.query.businessUnit as string | undefined;
  const companyId = getReqCompanyId(req);
  const admin = isReqAdmin(req);

  let query = sql`SELECT * FROM pos_branches WHERE 1=1`;
  if (!admin && companyId !== null) {
    query = sql`${query} AND (company_id = ${companyId} OR company_id IS NULL)`;
  }
  if (businessUnit && businessUnit !== "all") {
    if (businessUnit === "none") {
      query = sql`${query} AND (business_unit IS NULL OR business_unit = '')`;
    } else {
      query = sql`${query} AND business_unit = ${businessUnit}`;
    }
  }
  query = sql`${query} ORDER BY name ASC`;
  const rows = await db.execute(query);
  res.json(rows.rows);
});

router.post("/branches", async (req: Request, res: Response) => {
  const { name, address, phone, isActive, businessUnit } = req.body as { name: string; address?: string; phone?: string; isActive?: boolean; businessUnit?: string };
  if (!name) { res.status(400).json({ message: "name wajib diisi" }); return; }
  const companyId = getReqCompanyId(req);
  const result = await db.execute(sql`
    INSERT INTO pos_branches (name, address, phone, is_active, business_unit, company_id)
    VALUES (${name}, ${address ?? null}, ${phone ?? null}, ${isActive ?? true}, ${businessUnit ?? null}, ${companyId})
    RETURNING *
  `);
  res.json(result.rows[0]);
});

router.put("/branches/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, address, phone, isActive, businessUnit } = req.body as { name?: string; address?: string; phone?: string; isActive?: boolean; businessUnit?: string | null };
  const companyId = getReqCompanyId(req);
  const admin = isReqAdmin(req);
  // Pastikan non-admin hanya mengubah cabang miliknya
  if (!admin && companyId !== null) {
    const check = await db.execute(sql`SELECT id FROM pos_branches WHERE id = ${id} AND (company_id = ${companyId} OR company_id IS NULL)`);
    if (check.rows.length === 0) { res.status(403).json({ message: "Akses ditolak: cabang bukan milik perusahaan Anda" }); return; }
  }
  await db.execute(sql`
    UPDATE pos_branches
    SET name = COALESCE(${name ?? null}, name),
        address = COALESCE(${address ?? null}, address),
        phone = COALESCE(${phone ?? null}, phone),
        is_active = COALESCE(${isActive ?? null}, is_active),
        business_unit = CASE WHEN ${businessUnit !== undefined} THEN ${businessUnit ?? null} ELSE business_unit END
    WHERE id = ${id}
  `);
  const result = await db.execute(sql`SELECT * FROM pos_branches WHERE id = ${id}`);
  res.json(result.rows[0]);
});

router.delete("/branches/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const companyId = getReqCompanyId(req);
  const admin = isReqAdmin(req);
  if (!admin && companyId !== null) {
    const check = await db.execute(sql`SELECT id FROM pos_branches WHERE id = ${id} AND (company_id = ${companyId} OR company_id IS NULL)`);
    if (check.rows.length === 0) { res.status(403).json({ message: "Akses ditolak: cabang bukan milik perusahaan Anda" }); return; }
  }
  await db.execute(sql`DELETE FROM pos_branches WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── GUDANG ───────────────────────────────────────────────────────────────────

router.get("/warehouses", async (req: Request, res: Response) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const businessUnit = req.query.businessUnit as string | undefined;
  const companyId = getReqCompanyId(req);
  const admin = isReqAdmin(req);

  let query = sql`
    SELECT w.*, b.name as branch_name, b.business_unit
    FROM pos_warehouses w
    JOIN pos_branches b ON b.id = w.branch_id
    WHERE 1=1
  `;
  if (!admin && companyId !== null) {
    query = sql`${query} AND (b.company_id = ${companyId} OR b.company_id IS NULL)`;
  }
  if (branchId) query = sql`${query} AND w.branch_id = ${branchId}`;
  if (businessUnit && businessUnit !== "all") {
    if (businessUnit === "none") {
      query = sql`${query} AND (b.business_unit IS NULL OR b.business_unit = '')`;
    } else {
      query = sql`${query} AND b.business_unit = ${businessUnit}`;
    }
  }
  query = sql`${query} ORDER BY b.name, w.id ASC`;
  const rows = await db.execute(query);
  res.json(rows.rows);
});

router.post("/warehouses", async (req: Request, res: Response) => {
  const { name, branchId, type, isActive } = req.body as { name: string; branchId: number; type?: string; isActive?: boolean };
  if (!name || !branchId) { res.status(400).json({ message: "name dan branchId wajib diisi" }); return; }
  const result = await db.execute(sql`
    INSERT INTO pos_warehouses (name, branch_id, type, is_active)
    VALUES (${name}, ${branchId}, ${type ?? "umum"}, ${isActive ?? true})
    RETURNING *
  `);
  res.json(result.rows[0]);
});

router.put("/warehouses/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, type, isActive } = req.body as { name?: string; type?: string; isActive?: boolean };
  await db.execute(sql`
    UPDATE pos_warehouses
    SET name = COALESCE(${name ?? null}, name),
        type = COALESCE(${type ?? null}, type),
        is_active = COALESCE(${isActive ?? null}, is_active)
    WHERE id = ${id}
  `);
  const result = await db.execute(sql`SELECT * FROM pos_warehouses WHERE id = ${id}`);
  res.json(result.rows[0]);
});

router.delete("/warehouses/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await db.execute(sql`DELETE FROM pos_warehouses WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── RAK ──────────────────────────────────────────────────────────────────────

router.get("/racks", async (req: Request, res: Response) => {
  const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : null;
  const rows = warehouseId
    ? await db.execute(sql`
        SELECT r.*, w.name as warehouse_name, b.name as branch_name
        FROM pos_racks r
        JOIN pos_warehouses w ON w.id = r.warehouse_id
        JOIN pos_branches b ON b.id = w.branch_id
        WHERE r.warehouse_id = ${warehouseId}
        ORDER BY r.code ASC
      `)
    : await db.execute(sql`
        SELECT r.*, w.name as warehouse_name, b.name as branch_name
        FROM pos_racks r
        JOIN pos_warehouses w ON w.id = r.warehouse_id
        JOIN pos_branches b ON b.id = w.branch_id
        ORDER BY b.name, w.name, r.code ASC
      `);
  res.json(rows.rows);
});

router.get("/racks/check-code", async (req: Request, res: Response) => {
  const code = String(req.query.code ?? "").trim().toUpperCase();
  const excludeId = req.query.excludeId ? Number(req.query.excludeId) : null;
  if (!code) { res.json({ taken: false }); return; }
  const result = await db.execute(sql`
    SELECT id FROM pos_racks
    WHERE UPPER(code) = ${code}
    ${excludeId && !Number.isNaN(excludeId) ? sql`AND id != ${excludeId}` : sql``}
    LIMIT 1
  `);
  res.json({ taken: result.rows.length > 0 });
});

router.post("/racks", async (req: Request, res: Response) => {
  const { code, name, warehouseId, isActive } = req.body as { code: string; name: string; warehouseId: number; isActive?: boolean };
  if (!code || !name || !warehouseId) { res.status(400).json({ message: "code, name, warehouseId wajib diisi" }); return; }
  const result = await db.execute(sql`
    INSERT INTO pos_racks (code, name, warehouse_id, is_active)
    VALUES (${code}, ${name}, ${warehouseId}, ${isActive ?? true})
    RETURNING *
  `);
  res.json(result.rows[0]);
});

router.put("/racks/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { code, name, isActive } = req.body as { code?: string; name?: string; isActive?: boolean };
  await db.execute(sql`
    UPDATE pos_racks
    SET code = COALESCE(${code ?? null}, code),
        name = COALESCE(${name ?? null}, name),
        is_active = COALESCE(${isActive ?? null}, is_active)
    WHERE id = ${id}
  `);
  const result = await db.execute(sql`SELECT * FROM pos_racks WHERE id = ${id}`);
  res.json(result.rows[0]);
});

router.delete("/racks/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await db.execute(sql`DELETE FROM pos_racks WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── INVENTORY ITEMS (BAHAN BAKU) ─────────────────────────────────────────────

router.get("/inventory-items", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT * FROM pos_inventory_items ORDER BY name ASC
  `);
  res.json(rows.rows);
});

router.post("/inventory-items", async (req: Request, res: Response) => {
  const { name, sku, unit, minStock, costPrice, note, isActive } = req.body as {
    name: string; sku: string; unit?: string; minStock?: number; costPrice?: number; note?: string; isActive?: boolean;
  };
  if (!name || !sku) { res.status(400).json({ message: "name dan sku wajib diisi" }); return; }
  const result = await db.execute(sql`
    INSERT INTO pos_inventory_items (name, sku, unit, min_stock, cost_price, note, is_active)
    VALUES (${name}, ${sku}, ${unit ?? "pcs"}, ${minStock ?? 0}, ${costPrice ?? 0}, ${note ?? null}, ${isActive ?? true})
    RETURNING *
  `);
  res.json(result.rows[0]);
});

router.put("/inventory-items/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { name, sku, unit, minStock, costPrice, note, isActive } = req.body as {
    name?: string; sku?: string; unit?: string; minStock?: number; costPrice?: number; note?: string; isActive?: boolean;
  };
  await db.execute(sql`
    UPDATE pos_inventory_items
    SET name = COALESCE(${name ?? null}, name),
        sku = COALESCE(${sku ?? null}, sku),
        unit = COALESCE(${unit ?? null}, unit),
        min_stock = COALESCE(${minStock ?? null}, min_stock),
        cost_price = COALESCE(${costPrice ?? null}, cost_price),
        note = COALESCE(${note ?? null}, note),
        is_active = COALESCE(${isActive ?? null}, is_active),
        updated_at = NOW()
    WHERE id = ${id}
  `);
  const result = await db.execute(sql`SELECT * FROM pos_inventory_items WHERE id = ${id}`);
  res.json(result.rows[0]);
});

router.delete("/inventory-items/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await db.execute(sql`DELETE FROM pos_inventory_items WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── INVENTORY STOCKS ──────────────────────────────────────────────────────────

router.get("/inventory-stocks", async (req: Request, res: Response) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const warehouseId = req.query.warehouseId ? Number(req.query.warehouseId) : null;
  const businessUnit = req.query.businessUnit as string | undefined;
  const companyId = getReqCompanyId(req);
  const admin = isReqAdmin(req);

  let query = sql`
    SELECT s.*,
           i.name as item_name, i.sku, i.unit, i.min_stock,
           b.name as branch_name, b.business_unit,
           w.name as warehouse_name,
           r.code as rack_code, r.name as rack_name
    FROM pos_inventory_stocks s
    JOIN pos_inventory_items i ON i.id = s.item_id
    JOIN pos_branches b ON b.id = s.branch_id
    LEFT JOIN pos_warehouses w ON w.id = s.warehouse_id
    LEFT JOIN pos_racks r ON r.id = s.rack_id
    WHERE 1=1
  `;

  if (!admin && companyId !== null) {
    query = sql`${query} AND (b.company_id = ${companyId} OR b.company_id IS NULL)`;
  }
  if (branchId) query = sql`${query} AND s.branch_id = ${branchId}`;
  if (warehouseId) query = sql`${query} AND s.warehouse_id = ${warehouseId}`;
  if (businessUnit && businessUnit !== "all") {
    if (businessUnit === "none") {
      query = sql`${query} AND (b.business_unit IS NULL OR b.business_unit = '')`;
    } else {
      query = sql`${query} AND b.business_unit = ${businessUnit}`;
    }
  }
  query = sql`${query} ORDER BY b.name, i.name ASC`;

  const rows = await db.execute(query);
  res.json(rows.rows);
});

router.post("/inventory-stocks/adjust", async (req: Request, res: Response) => {
  const { itemId, branchId, warehouseId, rackId, qty, note, type } = req.body as {
    itemId: number; branchId: number; warehouseId?: number; rackId?: number; qty: number; note?: string; type?: string;
  };
  if (!itemId || !branchId || qty === undefined) { res.status(400).json({ message: "itemId, branchId, qty wajib diisi" }); return; }

  const existing = await db.execute(sql`
    SELECT * FROM pos_inventory_stocks
    WHERE item_id = ${itemId} AND branch_id = ${branchId}
      AND warehouse_id IS NOT DISTINCT FROM ${warehouseId ?? null}
      AND rack_id IS NOT DISTINCT FROM ${rackId ?? null}
  `);

  const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
  const qtyAfter = qtyBefore + qty;

  if (existing.rows.length > 0) {
    await db.execute(sql`
      UPDATE pos_inventory_stocks
      SET qty = ${qtyAfter}, updated_at = NOW()
      WHERE item_id = ${itemId} AND branch_id = ${branchId}
        AND warehouse_id IS NOT DISTINCT FROM ${warehouseId ?? null}
        AND rack_id IS NOT DISTINCT FROM ${rackId ?? null}
    `);
  } else {
    await db.execute(sql`
      INSERT INTO pos_inventory_stocks (item_id, branch_id, warehouse_id, rack_id, qty)
      VALUES (${itemId}, ${branchId}, ${warehouseId ?? null}, ${rackId ?? null}, ${qtyAfter})
    `);
  }

  await db.execute(sql`
    INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, rack_id, type, qty, qty_before, qty_after, ref_type, note)
    VALUES (${itemId}, ${branchId}, ${warehouseId ?? null}, ${rackId ?? null}, ${type ?? "adjustment"}, ${qty}, ${qtyBefore}, ${qtyAfter}, 'manual', ${note ?? null})
  `);

  res.json({ ok: true, qtyBefore, qtyAfter });
});

// ── RESEP / BOM ───────────────────────────────────────────────────────────────

router.get("/recipes", async (_req: Request, res: Response) => {
  const recipes = await db.execute(sql`
    SELECT r.*, p.name as product_name
    FROM pos_recipes r
    JOIN pos_products p ON p.id = r.product_id
    ORDER BY p.name ASC
  `);

  const result = [];
  for (const recipe of recipes.rows as { id: number; product_id: number; product_name: string; note: string | null }[]) {
    const items = await db.execute(sql`
      SELECT ri.*, i.name as item_name, i.unit, i.sku
      FROM pos_recipe_items ri
      JOIN pos_inventory_items i ON i.id = ri.item_id
      WHERE ri.recipe_id = ${recipe.id}
      ORDER BY ri.id ASC
    `);
    result.push({ ...recipe, items: items.rows });
  }
  res.json(result);
});

router.get("/recipes/by-product/:productId", async (req: Request, res: Response) => {
  const productId = Number(req.params.productId);
  const recipe = await db.execute(sql`
    SELECT r.*, p.name as product_name
    FROM pos_recipes r
    JOIN pos_products p ON p.id = r.product_id
    WHERE r.product_id = ${productId}
  `);
  if (recipe.rows.length === 0) { res.json(null); return; }
  const r = recipe.rows[0] as { id: number };
  const items = await db.execute(sql`
    SELECT ri.*, i.name as item_name, i.unit, i.sku
    FROM pos_recipe_items ri
    JOIN pos_inventory_items i ON i.id = ri.item_id
    WHERE ri.recipe_id = ${r.id}
    ORDER BY ri.id ASC
  `);
  res.json({ ...r, items: items.rows });
});

router.post("/recipes", async (req: Request, res: Response) => {
  const { productId, recipeName, yieldQty, yieldUnit, isActive, note, items } = req.body as {
    productId: number;
    recipeName?: string;
    yieldQty?: number;
    yieldUnit?: string;
    isActive?: boolean;
    note?: string;
    items: { itemId: number; qty: number; wastePct?: number | null; notes?: string | null }[];
  };
  if (!productId) { res.status(400).json({ message: "productId wajib diisi" }); return; }

  const existing = await db.execute(sql`SELECT id FROM pos_recipes WHERE product_id = ${productId}`);
  let recipeId: number;

  if (existing.rows.length > 0) {
    recipeId = (existing.rows[0] as { id: number }).id;
    await db.execute(sql`
      UPDATE pos_recipes
      SET note = ${note ?? null},
          recipe_name = ${recipeName ?? null},
          yield_qty = ${yieldQty ?? 1},
          yield_unit = ${yieldUnit ?? "pcs"},
          is_active = ${isActive ?? true},
          updated_at = NOW()
      WHERE id = ${recipeId}
    `);
    await db.execute(sql`DELETE FROM pos_recipe_items WHERE recipe_id = ${recipeId}`);
  } else {
    const ins = await db.execute(sql`
      INSERT INTO pos_recipes (product_id, recipe_name, yield_qty, yield_unit, is_active, note)
      VALUES (${productId}, ${recipeName ?? null}, ${yieldQty ?? 1}, ${yieldUnit ?? "pcs"}, ${isActive ?? true}, ${note ?? null})
      RETURNING id
    `);
    recipeId = (ins.rows[0] as { id: number }).id;
  }

  for (const item of items ?? []) {
    await db.execute(sql`
      INSERT INTO pos_recipe_items (recipe_id, item_id, qty, waste_pct, notes)
      VALUES (${recipeId}, ${item.itemId}, ${item.qty}, ${item.wastePct ?? null}, ${item.notes ?? null})
    `);
  }

  const result = await db.execute(sql`SELECT * FROM pos_recipes WHERE id = ${recipeId}`);
  const recipeItems = await db.execute(sql`
    SELECT ri.*, i.name as item_name, i.unit FROM pos_recipe_items ri
    JOIN pos_inventory_items i ON i.id = ri.item_id WHERE ri.recipe_id = ${recipeId}
    ORDER BY ri.id ASC
  `);
  res.json({ ...result.rows[0], items: recipeItems.rows });
});

router.delete("/recipes/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  await db.execute(sql`DELETE FROM pos_recipes WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── TRANSFER STOK ─────────────────────────────────────────────────────────────

router.get("/stock-transfers", async (req: Request, res: Response) => {
  const status = req.query.status as string | undefined;
  let q = sql`
    SELECT t.*,
           fb.name as from_branch_name,
           tb.name as to_branch_name
    FROM pos_stock_transfers t
    JOIN pos_branches fb ON fb.id = t.from_branch_id
    JOIN pos_branches tb ON tb.id = t.to_branch_id
    WHERE 1=1
  `;
  if (status) q = sql`${q} AND t.status = ${status}`;
  q = sql`${q} ORDER BY t.created_at DESC`;
  const rows = await db.execute(q);
  res.json(rows.rows);
});

router.get("/stock-transfers/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const transfer = await db.execute(sql`
    SELECT t.*, fb.name as from_branch_name, tb.name as to_branch_name
    FROM pos_stock_transfers t
    JOIN pos_branches fb ON fb.id = t.from_branch_id
    JOIN pos_branches tb ON tb.id = t.to_branch_id
    WHERE t.id = ${id}
  `);
  if (transfer.rows.length === 0) { res.status(404).json({ message: "Transfer tidak ditemukan" }); return; }
  const items = await db.execute(sql`
    SELECT ti.*, i.name as item_name, i.unit,
           fw.name as from_warehouse_name, tw.name as to_warehouse_name
    FROM pos_stock_transfer_items ti
    JOIN pos_inventory_items i ON i.id = ti.item_id
    LEFT JOIN pos_warehouses fw ON fw.id = ti.from_warehouse_id
    LEFT JOIN pos_warehouses tw ON tw.id = ti.to_warehouse_id
    WHERE ti.transfer_id = ${id}
  `);
  res.json({ ...transfer.rows[0], items: items.rows });
});

router.post("/stock-transfers", async (req: Request, res: Response) => {
  const { fromBranchId, toBranchId, note, items } = req.body as {
    fromBranchId: number; toBranchId: number; note?: string;
    items: { itemId: number; qty: number; fromWarehouseId?: number; toWarehouseId?: number }[];
  };
  if (!fromBranchId || !toBranchId) { res.status(400).json({ message: "fromBranchId dan toBranchId wajib diisi" }); return; }
  if (!items || items.length === 0) { res.status(400).json({ message: "items wajib diisi" }); return; }

  const transferNumber = makeTransferNumber();
  const result = await db.execute(sql`
    INSERT INTO pos_stock_transfers (transfer_number, from_branch_id, to_branch_id, note, status)
    VALUES (${transferNumber}, ${fromBranchId}, ${toBranchId}, ${note ?? null}, 'draft')
    RETURNING *
  `);
  const transfer = result.rows[0] as { id: number };

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO pos_stock_transfer_items (transfer_id, item_id, qty, from_warehouse_id, to_warehouse_id)
      VALUES (${transfer.id}, ${item.itemId}, ${item.qty}, ${item.fromWarehouseId ?? null}, ${item.toWarehouseId ?? null})
    `);
  }

  res.json(result.rows[0]);
});

// Draft → Pending (tanpa perubahan stok)
router.patch("/stock-transfers/:id/pending", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const transfer = await db.execute(sql`SELECT * FROM pos_stock_transfers WHERE id = ${id}`);
  if (transfer.rows.length === 0) { res.status(404).json({ message: "Transfer tidak ditemukan" }); return; }
  if ((transfer.rows[0] as { status: string }).status !== "draft") {
    res.status(400).json({ message: "Hanya transfer berstatus draft yang bisa di-pending-kan" }); return;
  }
  await db.execute(sql`UPDATE pos_stock_transfers SET status = 'pending', pending_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

// Draft/Pending → In Transit (stok asal berkurang)
router.patch("/stock-transfers/:id/send", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const transfer = await db.execute(sql`SELECT * FROM pos_stock_transfers WHERE id = ${id}`);
  if (transfer.rows.length === 0) { res.status(404).json({ message: "Transfer tidak ditemukan" }); return; }
  const st = (transfer.rows[0] as { status: string }).status;
  if (st !== "draft" && st !== "pending") {
    res.status(400).json({ message: "Hanya transfer berstatus draft/pending yang bisa dikirim" }); return;
  }

  const items = await db.execute(sql`SELECT * FROM pos_stock_transfer_items WHERE transfer_id = ${id}`);
  const t = transfer.rows[0] as { from_branch_id: number };

  for (const item of items.rows as { item_id: number; qty: string; from_warehouse_id: number | null }[]) {
    const existing = await db.execute(sql`
      SELECT * FROM pos_inventory_stocks
      WHERE item_id = ${item.item_id} AND branch_id = ${t.from_branch_id}
        AND warehouse_id IS NOT DISTINCT FROM ${item.from_warehouse_id ?? null}
    `);
    const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
    const qtyAfter = qtyBefore - Number(item.qty);
    if (existing.rows.length > 0) {
      await db.execute(sql`
        UPDATE pos_inventory_stocks SET qty = ${qtyAfter}, updated_at = NOW()
        WHERE item_id = ${item.item_id} AND branch_id = ${t.from_branch_id}
          AND warehouse_id IS NOT DISTINCT FROM ${item.from_warehouse_id ?? null}
      `);
    }
    await db.execute(sql`
      INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
      VALUES (${item.item_id}, ${t.from_branch_id}, ${item.from_warehouse_id ?? null}, 'TRANSFER_OUT', ${-Number(item.qty)}, ${qtyBefore}, ${qtyAfter}, 'transfer', ${id}, 'Transfer keluar – in transit')
    `);
  }

  await db.execute(sql`UPDATE pos_stock_transfers SET status = 'in_transit', in_transit_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

router.patch("/stock-transfers/:id/receive", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const transfer = await db.execute(sql`SELECT * FROM pos_stock_transfers WHERE id = ${id}`);
  if (transfer.rows.length === 0) { res.status(404).json({ message: "Transfer tidak ditemukan" }); return; }
  if ((transfer.rows[0] as { status: string }).status !== "in_transit") {
    res.status(400).json({ message: "Hanya transfer berstatus in_transit yang bisa diterima" }); return;
  }

  const items = await db.execute(sql`SELECT * FROM pos_stock_transfer_items WHERE transfer_id = ${id}`);
  const t = transfer.rows[0] as { to_branch_id: number };

  for (const item of items.rows as { item_id: number; qty: string; to_warehouse_id: number | null }[]) {
    const existing = await db.execute(sql`
      SELECT * FROM pos_inventory_stocks
      WHERE item_id = ${item.item_id} AND branch_id = ${t.to_branch_id}
        AND warehouse_id IS NOT DISTINCT FROM ${item.to_warehouse_id ?? null}
    `);
    const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
    const qtyAfter = qtyBefore + Number(item.qty);
    if (existing.rows.length > 0) {
      await db.execute(sql`
        UPDATE pos_inventory_stocks SET qty = ${qtyAfter}, updated_at = NOW()
        WHERE item_id = ${item.item_id} AND branch_id = ${t.to_branch_id}
          AND warehouse_id IS NOT DISTINCT FROM ${item.to_warehouse_id ?? null}
      `);
    } else {
      await db.execute(sql`
        INSERT INTO pos_inventory_stocks (item_id, branch_id, warehouse_id, qty)
        VALUES (${item.item_id}, ${t.to_branch_id}, ${item.to_warehouse_id ?? null}, ${qtyAfter})
      `);
    }
    await db.execute(sql`
      INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
      VALUES (${item.item_id}, ${t.to_branch_id}, ${item.to_warehouse_id ?? null}, 'transfer_in', ${Number(item.qty)}, ${qtyBefore}, ${qtyAfter}, 'transfer', ${id}, 'Transfer masuk')
    `);
  }

  await db.execute(sql`UPDATE pos_stock_transfers SET status = 'received', received_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

// Cancel transfer (draft/pending tanpa reversal; in_transit dengan reversal stok asal)
router.patch("/stock-transfers/:id/cancel", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { reason } = req.body as { reason?: string };
  const transfer = await db.execute(sql`SELECT * FROM pos_stock_transfers WHERE id = ${id}`);
  if (transfer.rows.length === 0) { res.status(404).json({ message: "Transfer tidak ditemukan" }); return; }
  const st = (transfer.rows[0] as { status: string }).status;
  if (!["draft", "pending", "in_transit"].includes(st)) {
    res.status(400).json({ message: "Transfer sudah selesai atau dibatalkan" }); return;
  }

  if (st === "in_transit") {
    const items = await db.execute(sql`SELECT * FROM pos_stock_transfer_items WHERE transfer_id = ${id}`);
    const t = transfer.rows[0] as { from_branch_id: number };
    for (const item of items.rows as { item_id: number; qty: string; from_warehouse_id: number | null }[]) {
      const existing = await db.execute(sql`
        SELECT * FROM pos_inventory_stocks
        WHERE item_id = ${item.item_id} AND branch_id = ${t.from_branch_id}
          AND warehouse_id IS NOT DISTINCT FROM ${item.from_warehouse_id ?? null}
      `);
      const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
      const qtyAfter = qtyBefore + Number(item.qty);
      if (existing.rows.length > 0) {
        await db.execute(sql`
          UPDATE pos_inventory_stocks SET qty = ${qtyAfter}, updated_at = NOW()
          WHERE item_id = ${item.item_id} AND branch_id = ${t.from_branch_id}
            AND warehouse_id IS NOT DISTINCT FROM ${item.from_warehouse_id ?? null}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO pos_inventory_stocks (item_id, branch_id, warehouse_id, qty)
          VALUES (${item.item_id}, ${t.from_branch_id}, ${item.from_warehouse_id ?? null}, ${qtyAfter})
        `);
      }
      await db.execute(sql`
        INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
        VALUES (${item.item_id}, ${t.from_branch_id}, ${item.from_warehouse_id ?? null}, 'TRANSFER_CANCEL', ${Number(item.qty)}, ${qtyBefore}, ${qtyAfter}, 'transfer', ${id}, 'Pembatalan transfer – stok dikembalikan')
      `);
    }
  }

  await db.execute(sql`
    UPDATE pos_stock_transfers SET status = 'cancelled', cancelled_at = NOW(), cancelled_reason = ${reason ?? null}
    WHERE id = ${id}
  `);
  res.json({ ok: true });
});

// ── RETUR BARANG ─────────────────────────────────────────────────────────────

router.get("/stock-returns", async (req: Request, res: Response) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  let q = sql`
    SELECT r.*, b.name as branch_name, w.name as warehouse_name
    FROM pos_stock_returns r
    JOIN pos_branches b ON b.id = r.branch_id
    LEFT JOIN pos_warehouses w ON w.id = r.warehouse_id
    WHERE 1=1
  `;
  if (branchId) q = sql`${q} AND r.branch_id = ${branchId}`;
  q = sql`${q} ORDER BY r.created_at DESC`;
  const rows = await db.execute(q);
  res.json(rows.rows);
});

router.get("/stock-returns/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ret = await db.execute(sql`
    SELECT r.*, b.name as branch_name, w.name as warehouse_name
    FROM pos_stock_returns r
    JOIN pos_branches b ON b.id = r.branch_id
    LEFT JOIN pos_warehouses w ON w.id = r.warehouse_id
    WHERE r.id = ${id}
  `);
  if (ret.rows.length === 0) { res.status(404).json({ message: "Retur tidak ditemukan" }); return; }
  const items = await db.execute(sql`
    SELECT ri.*, i.name as item_name, i.unit
    FROM pos_stock_return_items ri
    JOIN pos_inventory_items i ON i.id = ri.item_id
    WHERE ri.return_id = ${id}
  `);
  res.json({ ...ret.rows[0], items: items.rows });
});

router.post("/stock-returns", async (req: Request, res: Response) => {
  const { branchId, warehouseId, returnType, note, items } = req.body as {
    branchId: number; warehouseId?: number; returnType?: string; note?: string;
    items: { itemId: number; qty: number; condition: string; note?: string }[];
  };
  if (!branchId) { res.status(400).json({ message: "branchId wajib diisi" }); return; }
  if (!items || items.length === 0) { res.status(400).json({ message: "items wajib diisi" }); return; }

  const returnNumber = makeReturnNumber();
  const result = await db.execute(sql`
    INSERT INTO pos_stock_returns (return_number, branch_id, warehouse_id, return_type, note, status)
    VALUES (${returnNumber}, ${branchId}, ${warehouseId ?? null}, ${returnType ?? 'customer'}, ${note ?? null}, 'draft')
    RETURNING *
  `);
  const ret = result.rows[0] as { id: number };

  for (const item of items) {
    await db.execute(sql`
      INSERT INTO pos_stock_return_items (return_id, item_id, qty, condition, note)
      VALUES (${ret.id}, ${item.itemId}, ${item.qty}, ${item.condition ?? 'good'}, ${item.note ?? null})
    `);
  }
  res.json(result.rows[0]);
});

router.patch("/stock-returns/:id/approve", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ret = await db.execute(sql`SELECT * FROM pos_stock_returns WHERE id = ${id}`);
  if (ret.rows.length === 0) { res.status(404).json({ message: "Retur tidak ditemukan" }); return; }
  if ((ret.rows[0] as { status: string }).status !== "draft") {
    res.status(400).json({ message: "Hanya retur berstatus draft yang bisa diapprove" }); return;
  }
  const r = ret.rows[0] as { branch_id: number; warehouse_id: number | null };
  const items = await db.execute(sql`SELECT * FROM pos_stock_return_items WHERE return_id = ${id}`);

  for (const item of items.rows as { item_id: number; qty: string; condition: string; note: string | null }[]) {
    if (item.condition === "good") {
      const existing = await db.execute(sql`
        SELECT * FROM pos_inventory_stocks
        WHERE item_id = ${item.item_id} AND branch_id = ${r.branch_id}
          AND warehouse_id IS NOT DISTINCT FROM ${r.warehouse_id ?? null}
      `);
      const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
      const qtyAfter = qtyBefore + Number(item.qty);
      if (existing.rows.length > 0) {
        await db.execute(sql`
          UPDATE pos_inventory_stocks SET qty = ${qtyAfter}, updated_at = NOW()
          WHERE item_id = ${item.item_id} AND branch_id = ${r.branch_id}
            AND warehouse_id IS NOT DISTINCT FROM ${r.warehouse_id ?? null}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO pos_inventory_stocks (item_id, branch_id, warehouse_id, qty)
          VALUES (${item.item_id}, ${r.branch_id}, ${r.warehouse_id ?? null}, ${qtyAfter})
        `);
      }
      await db.execute(sql`
        INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
        VALUES (${item.item_id}, ${r.branch_id}, ${r.warehouse_id ?? null}, 'RETURN_IN', ${Number(item.qty)}, ${qtyBefore}, ${qtyAfter}, 'return', ${id}, 'Retur masuk – kondisi baik')
      `);
    } else {
      // Damaged / Expired → karantina, tidak ubah stok available
      await db.execute(sql`
        INSERT INTO pos_stock_quarantine (item_id, branch_id, warehouse_id, qty, condition, return_id, reason)
        VALUES (${item.item_id}, ${r.branch_id}, ${r.warehouse_id ?? null}, ${Number(item.qty)}, ${item.condition}, ${id}, ${item.note ?? null})
      `);
      const existing = await db.execute(sql`
        SELECT * FROM pos_inventory_stocks
        WHERE item_id = ${item.item_id} AND branch_id = ${r.branch_id}
          AND warehouse_id IS NOT DISTINCT FROM ${r.warehouse_id ?? null}
      `);
      const qtySnapshot = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
      await db.execute(sql`
        INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
        VALUES (${item.item_id}, ${r.branch_id}, ${r.warehouse_id ?? null}, 'RETURN_QUARANTINE', ${Number(item.qty)}, ${qtySnapshot}, ${qtySnapshot}, 'return', ${id}, ${'Retur karantina – kondisi ' + item.condition})
      `);
    }
  }

  await db.execute(sql`UPDATE pos_stock_returns SET status = 'approved', approved_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

router.patch("/stock-returns/:id/cancel", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const ret = await db.execute(sql`SELECT * FROM pos_stock_returns WHERE id = ${id}`);
  if (ret.rows.length === 0) { res.status(404).json({ message: "Retur tidak ditemukan" }); return; }
  if ((ret.rows[0] as { status: string }).status !== "draft") {
    res.status(400).json({ message: "Hanya retur berstatus draft yang bisa dibatalkan" }); return;
  }
  await db.execute(sql`UPDATE pos_stock_returns SET status = 'cancelled', cancelled_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── BARANG RUSAK / HILANG / KADALUARSA ────────────────────────────────────────

router.get("/stock-losses", async (req: Request, res: Response) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  let q = sql`
    SELECT l.*, b.name as branch_name, w.name as warehouse_name, i.name as item_name, i.unit
    FROM pos_stock_losses l
    JOIN pos_branches b ON b.id = l.branch_id
    LEFT JOIN pos_warehouses w ON w.id = l.warehouse_id
    JOIN pos_inventory_items i ON i.id = l.item_id
    WHERE 1=1
  `;
  if (branchId) q = sql`${q} AND l.branch_id = ${branchId}`;
  q = sql`${q} ORDER BY l.created_at DESC LIMIT 200`;
  const rows = await db.execute(q);
  res.json(rows.rows);
});

router.post("/stock-losses", async (req: Request, res: Response) => {
  const { branchId, warehouseId, itemId, qty, lossType, reason } = req.body as {
    branchId: number; warehouseId?: number; itemId: number;
    qty: number; lossType: string; reason: string;
  };
  if (!branchId || !itemId || !qty || !lossType || !reason) {
    res.status(400).json({ message: "branchId, itemId, qty, lossType, reason wajib diisi" }); return;
  }

  const existing = await db.execute(sql`
    SELECT * FROM pos_inventory_stocks
    WHERE item_id = ${itemId} AND branch_id = ${branchId}
      AND warehouse_id IS NOT DISTINCT FROM ${warehouseId ?? null}
  `);
  const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
  const qtyAfter = Math.max(0, qtyBefore - qty);
  if (existing.rows.length > 0) {
    await db.execute(sql`
      UPDATE pos_inventory_stocks SET qty = ${qtyAfter}, updated_at = NOW()
      WHERE item_id = ${itemId} AND branch_id = ${branchId}
        AND warehouse_id IS NOT DISTINCT FROM ${warehouseId ?? null}
    `);
  }

  const lossNumber = makeLossNumber();
  const result = await db.execute(sql`
    INSERT INTO pos_stock_losses (loss_number, branch_id, warehouse_id, item_id, qty, loss_type, reason)
    VALUES (${lossNumber}, ${branchId}, ${warehouseId ?? null}, ${itemId}, ${qty}, ${lossType}, ${reason})
    RETURNING *
  `);

  await db.execute(sql`
    INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
    VALUES (${itemId}, ${branchId}, ${warehouseId ?? null}, ${'LOSS_' + lossType.toUpperCase()}, ${-qty}, ${qtyBefore}, ${qtyAfter}, 'loss', ${(result.rows[0] as { id: number }).id}, ${reason})
  `);

  res.json(result.rows[0]);
});

// ── STOCK OPNAME ─────────────────────────────────────────────────────────────

router.get("/stock-opnames", async (req: Request, res: Response) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  let q = sql`
    SELECT o.*, b.name as branch_name, w.name as warehouse_name
    FROM pos_stock_opnames o
    JOIN pos_branches b ON b.id = o.branch_id
    LEFT JOIN pos_warehouses w ON w.id = o.warehouse_id
    WHERE 1=1
  `;
  if (branchId) q = sql`${q} AND o.branch_id = ${branchId}`;
  q = sql`${q} ORDER BY o.created_at DESC`;
  const rows = await db.execute(q);
  res.json(rows.rows);
});

router.get("/stock-opnames/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const opname = await db.execute(sql`
    SELECT o.*, b.name as branch_name, w.name as warehouse_name
    FROM pos_stock_opnames o
    JOIN pos_branches b ON b.id = o.branch_id
    LEFT JOIN pos_warehouses w ON w.id = o.warehouse_id
    WHERE o.id = ${id}
  `);
  if (opname.rows.length === 0) { res.status(404).json({ message: "Opname tidak ditemukan" }); return; }
  const items = await db.execute(sql`
    SELECT oi.*, i.name as item_name, i.unit, i.sku
    FROM pos_stock_opname_items oi
    JOIN pos_inventory_items i ON i.id = oi.item_id
    WHERE oi.opname_id = ${id}
  `);
  res.json({ ...opname.rows[0], items: items.rows });
});

router.post("/stock-opnames", async (req: Request, res: Response) => {
  const { branchId, warehouseId, note } = req.body as { branchId: number; warehouseId?: number; note?: string };
  if (!branchId) { res.status(400).json({ message: "branchId wajib diisi" }); return; }

  const opnameNumber = makeOpnameNumber();
  const result = await db.execute(sql`
    INSERT INTO pos_stock_opnames (opname_number, branch_id, warehouse_id, note, status)
    VALUES (${opnameNumber}, ${branchId}, ${warehouseId ?? null}, ${note ?? null}, 'draft')
    RETURNING *
  `);
  const opname = result.rows[0] as { id: number };

  let stocksQ = sql`
    SELECT s.*, i.name as item_name, i.unit
    FROM pos_inventory_stocks s
    JOIN pos_inventory_items i ON i.id = s.item_id
    WHERE s.branch_id = ${branchId}
  `;
  if (warehouseId) stocksQ = sql`${stocksQ} AND s.warehouse_id = ${warehouseId}`;

  const stocks = await db.execute(stocksQ);
  for (const stock of stocks.rows as { item_id: number; qty: string }[]) {
    await db.execute(sql`
      INSERT INTO pos_stock_opname_items (opname_id, item_id, system_qty, actual_qty, diff_qty)
      VALUES (${opname.id}, ${stock.item_id}, ${Number(stock.qty)}, ${Number(stock.qty)}, 0)
    `);
  }

  res.json(result.rows[0]);
});

router.put("/stock-opnames/:id/items", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const { items } = req.body as { items: { itemId: number; actualQty: number; note?: string }[] };

  for (const item of items ?? []) {
    const sys = await db.execute(sql`
      SELECT system_qty FROM pos_stock_opname_items WHERE opname_id = ${id} AND item_id = ${item.itemId}
    `);
    const systemQty = sys.rows.length > 0 ? Number((sys.rows[0] as { system_qty: string }).system_qty) : 0;
    const diff = item.actualQty - systemQty;
    await db.execute(sql`
      UPDATE pos_stock_opname_items
      SET actual_qty = ${item.actualQty}, diff_qty = ${diff}, note = ${item.note ?? null}
      WHERE opname_id = ${id} AND item_id = ${item.itemId}
    `);
  }
  res.json({ ok: true });
});

router.patch("/stock-opnames/:id/confirm", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const opname = await db.execute(sql`SELECT * FROM pos_stock_opnames WHERE id = ${id}`);
  if (opname.rows.length === 0) { res.status(404).json({ message: "Opname tidak ditemukan" }); return; }
  if ((opname.rows[0] as { status: string }).status !== "draft") {
    res.status(400).json({ message: "Hanya opname berstatus draft yang bisa dikonfirmasi" }); return;
  }

  const o = opname.rows[0] as { branch_id: number; warehouse_id: number | null };
  const items = await db.execute(sql`SELECT * FROM pos_stock_opname_items WHERE opname_id = ${id}`);

  for (const item of items.rows as { item_id: number; actual_qty: string; system_qty: string; diff_qty: string }[]) {
    if (Number(item.diff_qty) !== 0) {
      const existing = await db.execute(sql`
        SELECT * FROM pos_inventory_stocks
        WHERE item_id = ${item.item_id} AND branch_id = ${o.branch_id}
          AND warehouse_id IS NOT DISTINCT FROM ${o.warehouse_id ?? null}
      `);
      const qtyBefore = existing.rows.length > 0 ? Number((existing.rows[0] as { qty: string }).qty) : 0;
      const qtyAfter = Number(item.actual_qty);
      if (existing.rows.length > 0) {
        await db.execute(sql`
          UPDATE pos_inventory_stocks SET qty = ${qtyAfter}, updated_at = NOW()
          WHERE item_id = ${item.item_id} AND branch_id = ${o.branch_id}
            AND warehouse_id IS NOT DISTINCT FROM ${o.warehouse_id ?? null}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO pos_inventory_stocks (item_id, branch_id, warehouse_id, qty)
          VALUES (${item.item_id}, ${o.branch_id}, ${o.warehouse_id ?? null}, ${qtyAfter})
        `);
      }
      await db.execute(sql`
        INSERT INTO pos_stock_mutations (item_id, branch_id, warehouse_id, type, qty, qty_before, qty_after, ref_type, ref_id, note)
        VALUES (${item.item_id}, ${o.branch_id}, ${o.warehouse_id ?? null}, 'opname', ${Number(item.diff_qty)}, ${qtyBefore}, ${qtyAfter}, 'opname', ${id}, 'Penyesuaian stock opname')
      `);
    }
  }

  await db.execute(sql`UPDATE pos_stock_opnames SET status = 'confirmed', confirmed_at = NOW() WHERE id = ${id}`);
  res.json({ ok: true });
});

// ── MUTASI STOK (LOG) ─────────────────────────────────────────────────────────

router.get("/stock-mutations", async (req: Request, res: Response) => {
  const branchId = req.query.branchId ? Number(req.query.branchId) : null;
  const itemId = req.query.itemId ? Number(req.query.itemId) : null;
  const type = req.query.type as string | undefined;
  const dateFrom = req.query.dateFrom as string | undefined;
  const dateTo = req.query.dateTo as string | undefined;

  let q = sql`
    SELECT m.*,
           i.name as item_name, i.unit, i.sku,
           b.name as branch_name,
           w.name as warehouse_name
    FROM pos_stock_mutations m
    JOIN pos_inventory_items i ON i.id = m.item_id
    JOIN pos_branches b ON b.id = m.branch_id
    LEFT JOIN pos_warehouses w ON w.id = m.warehouse_id
    WHERE 1=1
  `;
  if (branchId) q = sql`${q} AND m.branch_id = ${branchId}`;
  if (itemId) q = sql`${q} AND m.item_id = ${itemId}`;
  if (type) q = sql`${q} AND m.type = ${type}`;
  if (dateFrom) q = sql`${q} AND m.created_at >= ${dateFrom}::timestamptz`;
  if (dateTo) q = sql`${q} AND m.created_at <= ${dateTo}::timestamptz`;
  q = sql`${q} ORDER BY m.created_at DESC LIMIT 500`;

  const rows = await db.execute(q);
  res.json(rows.rows);
});

// ── LAPORAN STOK ──────────────────────────────────────────────────────────────

router.get("/reports/stock-per-branch", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT b.name as branch_name,
           i.name as item_name, i.sku, i.unit, i.min_stock,
           COALESCE(SUM(s.qty), 0) as total_qty,
           CASE WHEN COALESCE(SUM(s.qty), 0) <= i.min_stock THEN true ELSE false END as is_low
    FROM pos_inventory_items i
    CROSS JOIN pos_branches b
    LEFT JOIN pos_inventory_stocks s ON s.item_id = i.id AND s.branch_id = b.id
    WHERE i.is_active = true
    GROUP BY b.id, b.name, i.id, i.name, i.sku, i.unit, i.min_stock
    ORDER BY b.name, i.name
  `);
  res.json(rows.rows);
});

router.get("/reports/low-stock", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT b.name as branch_name,
           i.name as item_name, i.sku, i.unit, i.min_stock,
           COALESCE(SUM(s.qty), 0) as total_qty
    FROM pos_inventory_items i
    CROSS JOIN pos_branches b
    LEFT JOIN pos_inventory_stocks s ON s.item_id = i.id AND s.branch_id = b.id
    WHERE i.is_active = true
    GROUP BY b.id, b.name, i.id, i.name, i.sku, i.unit, i.min_stock
    HAVING COALESCE(SUM(s.qty), 0) <= i.min_stock
    ORDER BY b.name, i.name
  `);
  res.json(rows.rows);
});

// ── SCAN RESULT ENDPOINTS ────────────────────────────────────────────────────

router.get("/scan-result/product/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const item = await db.execute(sql`SELECT * FROM pos_inventory_items WHERE id = ${id}`);
  if (item.rows.length === 0) { res.status(404).json({ message: "Item tidak ditemukan" }); return; }
  const stocks = await db.execute(sql`
    SELECT s.qty, b.name as branch_name, w.name as warehouse_name, r.name as rack_name
    FROM pos_inventory_stocks s
    JOIN pos_branches b ON b.id = s.branch_id
    LEFT JOIN pos_warehouses w ON w.id = s.warehouse_id
    LEFT JOIN pos_racks r ON r.id = s.rack_id
    WHERE s.item_id = ${id}
    ORDER BY b.name, w.name
  `);
  res.json({ item: item.rows[0], stocks: stocks.rows });
});

router.get("/scan-result/rack/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const rack = await db.execute(sql`
    SELECT r.*, w.name as warehouse_name, b.name as branch_name
    FROM pos_racks r
    JOIN pos_warehouses w ON w.id = r.warehouse_id
    JOIN pos_branches b ON b.id = w.branch_id
    WHERE r.id = ${id}
  `);
  if (rack.rows.length === 0) { res.status(404).json({ message: "Rak tidak ditemukan" }); return; }
  const stocks = await db.execute(sql`
    SELECT s.qty, i.name as item_name, i.unit, i.sku
    FROM pos_inventory_stocks s
    JOIN pos_inventory_items i ON i.id = s.item_id
    WHERE s.rack_id = ${id}
    ORDER BY i.name
  `);
  res.json({ rack: rack.rows[0], stocks: stocks.rows });
});

router.get("/scan-result/warehouse/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const wh = await db.execute(sql`
    SELECT w.*, b.name as branch_name FROM pos_warehouses w
    JOIN pos_branches b ON b.id = w.branch_id WHERE w.id = ${id}
  `);
  if (wh.rows.length === 0) { res.status(404).json({ message: "Gudang tidak ditemukan" }); return; }
  const stocks = await db.execute(sql`
    SELECT s.qty, i.name as item_name, i.unit, i.sku, i.min_stock
    FROM pos_inventory_stocks s
    JOIN pos_inventory_items i ON i.id = s.item_id
    WHERE s.warehouse_id = ${id}
    ORDER BY i.name
  `);
  res.json({ warehouse: wh.rows[0], stocks: stocks.rows });
});

router.get("/scan-result/transfer/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const transfer = await db.execute(sql`
    SELECT t.*, fb.name as from_branch_name, tb.name as to_branch_name
    FROM pos_stock_transfers t
    JOIN pos_branches fb ON fb.id = t.from_branch_id
    JOIN pos_branches tb ON tb.id = t.to_branch_id
    WHERE t.id = ${id}
  `);
  if (transfer.rows.length === 0) { res.status(404).json({ message: "Transfer tidak ditemukan" }); return; }
  const items = await db.execute(sql`
    SELECT ti.qty, i.name as item_name, i.unit
    FROM pos_stock_transfer_items ti
    JOIN pos_inventory_items i ON i.id = ti.item_id
    WHERE ti.transfer_id = ${id}
  `);
  res.json({ transfer: transfer.rows[0], items: items.rows });
});

// ── DASHBOARD ─────────────────────────────────────────────────────────────────

router.get("/dashboard", async (_req: Request, res: Response) => {
  const [
    stockByWarehouse,
    lowStockItems,
    transferStats,
    recentLosses,
    recentMutations,
    posOrdersToday,
  ] = await Promise.all([
    db.execute(sql`
      SELECT w.name as warehouse_name, b.name as branch_name,
             COUNT(DISTINCT s.item_id) as item_count,
             COALESCE(SUM(s.qty), 0) as total_qty
      FROM pos_warehouses w
      JOIN pos_branches b ON b.id = w.branch_id
      LEFT JOIN pos_inventory_stocks s ON s.warehouse_id = w.id
      GROUP BY w.id, w.name, b.name
      ORDER BY b.name, w.name
    `),
    db.execute(sql`
      SELECT i.name as item_name, i.sku, i.unit, i.min_stock,
             b.name as branch_name,
             COALESCE(SUM(s.qty), 0) as total_qty,
             i.min_stock - COALESCE(SUM(s.qty), 0) as shortage
      FROM pos_inventory_items i
      CROSS JOIN pos_branches b
      LEFT JOIN pos_inventory_stocks s ON s.item_id = i.id AND s.branch_id = b.id
      WHERE i.is_active = true
      GROUP BY i.id, i.name, i.sku, i.unit, i.min_stock, b.id, b.name
      HAVING COALESCE(SUM(s.qty), 0) <= i.min_stock
      ORDER BY shortage DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT status, COUNT(*) as cnt
      FROM pos_stock_transfers
      GROUP BY status
    `),
    db.execute(sql`
      SELECT l.loss_type, COUNT(*) as cnt,
             SUM(l.qty) as total_qty,
             i.name as item_name, i.unit, b.name as branch_name,
             l.reason, l.created_at
      FROM pos_stock_losses l
      JOIN pos_inventory_items i ON i.id = l.item_id
      JOIN pos_branches b ON b.id = l.branch_id
      WHERE l.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY l.loss_type, i.name, i.unit, b.name, l.reason, l.created_at
      ORDER BY l.created_at DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT m.type, m.qty, m.qty_before, m.qty_after, m.note, m.created_at,
             i.name as item_name, i.unit, b.name as branch_name
      FROM pos_stock_mutations m
      JOIN pos_inventory_items i ON i.id = m.item_id
      JOIN pos_branches b ON b.id = m.branch_id
      ORDER BY m.created_at DESC
      LIMIT 20
    `),
    db.execute(sql`
      SELECT COUNT(*) as cnt, COALESCE(SUM(o.total), 0) as total_revenue
      FROM pos_orders o
      WHERE o.status = 'paid'
        AND DATE(o.paid_at) = CURRENT_DATE
    `),
  ]);

  const transferByStatus: Record<string, number> = {};
  for (const row of transferStats.rows as { status: string; cnt: string }[]) {
    transferByStatus[row.status] = Number(row.cnt);
  }

  res.json({
    stockByWarehouse: stockByWarehouse.rows,
    lowStockItems: lowStockItems.rows,
    transferByStatus,
    recentLosses: recentLosses.rows,
    recentMutations: recentMutations.rows,
    posOrdersToday: posOrdersToday.rows[0],
    summary: {
      lowStockCount: lowStockItems.rows.length,
      pendingTransfers: (transferByStatus["pending"] ?? 0) + (transferByStatus["in_transit"] ?? 0),
      lossCount7d: recentLosses.rows.length,
    },
  });
});

export default router;
