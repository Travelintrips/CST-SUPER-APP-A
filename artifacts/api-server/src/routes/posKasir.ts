import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  posCashiersTable, posProductsTable, posOrdersTable,
  posOrderItemsTable, posStockItemsTable, posStockAdjustmentsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import bcrypt from "bcryptjs";

const router = Router();

// ── Auth helper ──────────────────────────────────────────────────────────────

async function requireCashierAuth(req: Request, res: Response): Promise<{ id: number; name: string; email: string } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const token = auth.slice(7);
  let payload: { id: number; email: string } | null = null;
  try {
    const decoded = Buffer.from(token, "base64").toString("utf-8");
    payload = JSON.parse(decoded) as { id: number; email: string };
  } catch {
    res.status(401).json({ message: "Token tidak valid" });
    return null;
  }
  const [cashier] = await db.select().from(posCashiersTable).where(eq(posCashiersTable.id, payload.id));
  if (!cashier || cashier.status !== "approved") {
    res.status(403).json({ message: "Akun kasir belum disetujui atau tidak ditemukan" });
    return null;
  }
  return { id: cashier.id, name: cashier.name, email: cashier.email };
}

function makeCashierToken(id: number, email: string): string {
  return Buffer.from(JSON.stringify({ id, email })).toString("base64");
}

function orderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TT/${y}${m}${d}/${rand}`;
}

// ── Kasir Auth ────────────────────────────────────────────────────────────────

// POST /api/pos-kasir/register
router.post("/register", async (req, res) => {
  const { name, email, password, phone } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi" });
  }
  const emailLc = String(email).toLowerCase().trim();
  const [existing] = await db.select({ id: posCashiersTable.id }).from(posCashiersTable).where(eq(posCashiersTable.email, emailLc));
  if (existing) return res.status(409).json({ message: "Email sudah terdaftar" });
  const passwordHash = await bcrypt.hash(String(password), 10);
  const [created] = await db.insert(posCashiersTable).values({
    name: String(name).trim(),
    email: emailLc,
    passwordHash,
    phone: phone ? String(phone).trim() : null,
    status: "pending",
  }).returning();
  return res.status(201).json({ message: "Pendaftaran berhasil, menunggu persetujuan admin", id: created!.id });
});

// POST /api/pos-kasir/login
router.post("/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ message: "Email dan password wajib diisi" });
  const emailLc = String(email).toLowerCase().trim();
  const [cashier] = await db.select().from(posCashiersTable).where(eq(posCashiersTable.email, emailLc));
  if (!cashier) return res.status(401).json({ message: "Email atau password salah" });
  const valid = await bcrypt.compare(String(password), cashier.passwordHash);
  if (!valid) return res.status(401).json({ message: "Email atau password salah" });
  if (cashier.status === "pending") return res.status(403).json({ message: "Akun sedang menunggu persetujuan admin" });
  if (cashier.status === "rejected") return res.status(403).json({ message: "Akun ditolak, hubungi admin" });
  const token = makeCashierToken(cashier.id, cashier.email);
  return res.json({ token, cashier: { id: cashier.id, name: cashier.name, email: cashier.email } });
});

// GET /api/pos-kasir/me
router.get("/me", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  return res.json(cashier);
});

// ── Products (public read, admin write) ─────────────────────────────────────

// GET /api/pos-kasir/products
router.get("/products", async (_req, res) => {
  const rows = await db.select().from(posProductsTable)
    .where(eq(posProductsTable.isActive, true))
    .orderBy(posProductsTable.sortOrder, posProductsTable.name);
  return res.json(rows);
});

// GET /api/pos-kasir/products/all  (admin — semua termasuk non-aktif)
router.get("/products/all", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const rows = await db.select().from(posProductsTable).orderBy(posProductsTable.sortOrder, posProductsTable.name);
  return res.json(rows);
});

// POST /api/pos-kasir/products
router.post("/products", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { name, description, price, category, imageUrl, isActive, sortOrder } = req.body ?? {};
  if (!name || price == null) return res.status(400).json({ message: "name dan price wajib" });
  const [created] = await db.insert(posProductsTable).values({
    name: String(name), description: description ?? null,
    price: String(price), category: category ?? "minuman",
    imageUrl: imageUrl ?? null, isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
  }).returning();
  return res.status(201).json(created);
});

// PATCH /api/pos-kasir/products/:id
router.patch("/products/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "description", "price", "category", "imageUrl", "isActive", "sortOrder"]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  await db.update(posProductsTable).set(patch).where(eq(posProductsTable.id, id));
  const [updated] = await db.select().from(posProductsTable).where(eq(posProductsTable.id, id));
  return res.json(updated);
});

// DELETE /api/pos-kasir/products/:id
router.delete("/products/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  await db.delete(posProductsTable).where(eq(posProductsTable.id, id));
  return res.json({ message: "Deleted" });
});

// ── Orders ───────────────────────────────────────────────────────────────────

// POST /api/pos-kasir/orders  (buat order baru)
router.post("/orders", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const { items, discount, note } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Items tidak boleh kosong" });
  }

  const productIds: number[] = items.map((i: { productId: number }) => i.productId);
  const products = await db.select().from(posProductsTable).where(inArray(posProductsTable.id, productIds));
  const productMap = new Map(products.map((p) => [p.id, p]));

  let subtotal = 0;
  const lineItems: Array<{ productId: number; productName: string; price: string; qty: number; subtotal: string }> = [];
  for (const item of items as Array<{ productId: number; qty: number }>) {
    const p = productMap.get(item.productId);
    if (!p) return res.status(400).json({ message: `Produk ID ${item.productId} tidak ditemukan` });
    const price = Number(p.price);
    const qty = Number(item.qty) || 1;
    const sub = price * qty;
    subtotal += sub;
    lineItems.push({ productId: p.id, productName: p.name, price: String(price), qty, subtotal: String(sub) });
  }

  const discountAmt = Number(discount) || 0;
  const total = subtotal - discountAmt;

  const [order] = await db.insert(posOrdersTable).values({
    orderNumber: orderNumber(),
    cashierId: cashier.id,
    status: "open",
    subtotal: String(subtotal),
    discount: String(discountAmt),
    total: String(total),
    note: note ?? null,
  }).returning();

  await db.insert(posOrderItemsTable).values(
    lineItems.map((l) => ({ ...l, orderId: order!.id }))
  );

  return res.status(201).json({ ...order, items: lineItems });
});

// PATCH /api/pos-kasir/orders/:id/pay
router.patch("/orders/:id/pay", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  const { paymentMethod, amountPaid } = req.body ?? {};
  if (!paymentMethod) return res.status(400).json({ message: "paymentMethod wajib" });

  const [order] = await db.select().from(posOrdersTable).where(eq(posOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });
  if (order.cashierId !== cashier.id) return res.status(403).json({ message: "Bukan order Anda" });
  if (order.status !== "open") return res.status(400).json({ message: "Order sudah diproses" });

  const paid = Number(amountPaid) || Number(order.total);
  const change = paid - Number(order.total);

  const [updated] = await db.update(posOrdersTable).set({
    status: "paid",
    paymentMethod,
    amountPaid: String(paid),
    change: String(Math.max(0, change)),
    paidAt: new Date(),
  }).where(eq(posOrdersTable.id, id)).returning();

  const items = await db.select().from(posOrderItemsTable).where(eq(posOrderItemsTable.orderId, id));
  return res.json({ ...updated, items });
});

// PATCH /api/pos-kasir/orders/:id/cancel
router.patch("/orders/:id/cancel", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  const [order] = await db.select().from(posOrdersTable).where(eq(posOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });
  if (order.cashierId !== cashier.id) return res.status(403).json({ message: "Bukan order Anda" });
  if (order.status !== "open") return res.status(400).json({ message: "Order sudah diproses" });
  await db.update(posOrdersTable).set({ status: "cancelled" }).where(eq(posOrdersTable.id, id));
  return res.json({ message: "Order dibatalkan" });
});

// GET /api/pos-kasir/orders/today  (untuk kasir yang sedang login)
router.get("/orders/today", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const orders = await db.select().from(posOrdersTable)
    .where(and(eq(posOrdersTable.cashierId, cashier.id), gte(posOrdersTable.createdAt, start), lte(posOrdersTable.createdAt, end)))
    .orderBy(desc(posOrdersTable.createdAt));
  return res.json(orders);
});

// GET /api/pos-kasir/orders/:id
router.get("/orders/:id", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  const [order] = await db.select().from(posOrdersTable).where(eq(posOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });
  const items = await db.select().from(posOrderItemsTable).where(eq(posOrderItemsTable.orderId, id));
  return res.json({ ...order, items });
});

// ── Stock ─────────────────────────────────────────────────────────────────────

// GET /api/pos-kasir/stock
router.get("/stock", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const rows = await db.select().from(posStockItemsTable).orderBy(posStockItemsTable.name);
  return res.json(rows);
});

// POST /api/pos-kasir/stock/adjust
router.post("/stock/adjust", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const { stockItemId, delta, reason } = req.body ?? {};
  if (!stockItemId || delta == null) return res.status(400).json({ message: "stockItemId dan delta wajib" });

  await db.update(posStockItemsTable)
    .set({ currentStock: sql`current_stock + ${Number(delta)}`, updatedAt: new Date() })
    .where(eq(posStockItemsTable.id, Number(stockItemId)));

  await db.insert(posStockAdjustmentsTable).values({
    stockItemId: Number(stockItemId),
    cashierId: cashier.id,
    delta: String(delta),
    reason: reason ?? null,
  });

  const [updated] = await db.select().from(posStockItemsTable).where(eq(posStockItemsTable.id, Number(stockItemId)));
  return res.json(updated);
});

// ── Admin (BizPortal) endpoints ──────────────────────────────────────────────

// GET /api/pos-kasir/admin/cashiers  (daftar semua kasir)
router.get("/admin/cashiers", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const rows = await db.select({
    id: posCashiersTable.id,
    name: posCashiersTable.name,
    email: posCashiersTable.email,
    phone: posCashiersTable.phone,
    status: posCashiersTable.status,
    createdAt: posCashiersTable.createdAt,
  }).from(posCashiersTable).orderBy(desc(posCashiersTable.createdAt));
  return res.json(rows);
});

// PATCH /api/pos-kasir/admin/cashiers/:id  (setujui/tolak)
router.patch("/admin/cashiers/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  const { status } = req.body ?? {};
  if (!["approved", "rejected", "pending"].includes(status)) {
    return res.status(400).json({ message: "Status tidak valid" });
  }
  const [updated] = await db.update(posCashiersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(posCashiersTable.id, id))
    .returning();
  return res.json(updated);
});

// GET /api/pos-kasir/admin/report  (laporan penjualan)
router.get("/admin/report", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { from, to, cashierId } = req.query;
  const start = from ? new Date(String(from)) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
  const end = to ? new Date(String(to)) : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();

  const conds = [eq(posOrdersTable.status, "paid"), gte(posOrdersTable.paidAt, start), lte(posOrdersTable.paidAt, end)];
  if (cashierId) conds.push(eq(posOrdersTable.cashierId, Number(cashierId)));

  const orders = await db.select({
    id: posOrdersTable.id,
    orderNumber: posOrdersTable.orderNumber,
    cashierId: posOrdersTable.cashierId,
    cashierName: posCashiersTable.name,
    total: posOrdersTable.total,
    paymentMethod: posOrdersTable.paymentMethod,
    paidAt: posOrdersTable.paidAt,
  }).from(posOrdersTable)
    .leftJoin(posCashiersTable, eq(posOrdersTable.cashierId, posCashiersTable.id))
    .where(and(...conds))
    .orderBy(desc(posOrdersTable.paidAt));

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total), 0);
  const byMethod: Record<string, number> = {};
  for (const o of orders) {
    const m = o.paymentMethod ?? "unknown";
    byMethod[m] = (byMethod[m] ?? 0) + Number(o.total);
  }

  return res.json({ orders, totalRevenue, byMethod, count: orders.length });
});

// GET /api/pos-kasir/admin/report/daily  (laporan harian ringkasan)
router.get("/admin/report/daily", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const result = await db.execute(sql`
    SELECT
      DATE(paid_at) as date,
      COUNT(*) as order_count,
      SUM(total) as revenue
    FROM pos_orders
    WHERE status = 'paid' AND paid_at IS NOT NULL
    GROUP BY DATE(paid_at)
    ORDER BY date DESC
    LIMIT 30
  `);
  return res.json(result.rows);
});

// GET /api/pos-kasir/admin/stock
router.get("/admin/stock", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const rows = await db.select().from(posStockItemsTable).orderBy(posStockItemsTable.name);
  return res.json(rows);
});

// POST /api/pos-kasir/admin/stock
router.post("/admin/stock", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { name, unit, currentStock, minStock, note } = req.body ?? {};
  if (!name) return res.status(400).json({ message: "name wajib" });
  const [created] = await db.insert(posStockItemsTable).values({
    name: String(name), unit: unit ?? "pcs",
    currentStock: String(currentStock ?? 0),
    minStock: String(minStock ?? 0),
    note: note ?? null,
  }).returning();
  return res.status(201).json(created);
});

// PATCH /api/pos-kasir/admin/stock/:id
router.patch("/admin/stock/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const k of ["name", "unit", "currentStock", "minStock", "note"]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  const [updated] = await db.update(posStockItemsTable).set(patch).where(eq(posStockItemsTable.id, id)).returning();
  return res.json(updated);
});

// DELETE /api/pos-kasir/admin/stock/:id
router.delete("/admin/stock/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  await db.delete(posStockItemsTable).where(eq(posStockItemsTable.id, id));
  return res.json({ message: "Deleted" });
});

export default router;
