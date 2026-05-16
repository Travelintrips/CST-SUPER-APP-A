/**
 * /api/thai-tea — Manajemen Bahan Thai Tea & Inventori CST
 *
 * GET  /products          — daftar produk bahan thai tea
 * POST /products          — tambah produk bahan thai tea
 * PUT  /products/:id      — update produk
 * DELETE /products/:id    — hapus produk
 * GET  /purchases         — daftar PO yang berisi bahan thai tea
 * GET  /stock             — stok CST (wh_stock) untuk bahan thai tea
 * POST /seed              — seed bahan default thai tea
 */
import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db, productsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();
router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

const SUBCATEGORY = "bahan_thai_tea";

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
// List purchase documents (orders) yang mengandung bahan thai tea

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
// Stok CST (wh_stock) untuk bahan thai tea

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

// ── POST /seed ───────────────────────────────────────────────────────────────
// Seed bahan default Thai tea (skip jika SKU sudah ada)

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

// ── GET /warehouses ──────────────────────────────────────────────────────────
// Daftar gudang CST (pos_warehouses) aktif

router.get("/warehouses", async (_req: Request, res: Response) => {
  const rows = await db.execute(sql`
    SELECT pw.id, pw.name, pw.type, pw.is_active, pb.name AS branch_name
    FROM pos_warehouses pw
    LEFT JOIN pos_branches pb ON pb.id = pw.branch_id
    WHERE pw.is_active = TRUE
    ORDER BY pw.name
  `);
  res.json(rows.rows);
});

export default router;
