import { Router, type Request, type Response } from "express";
import { createHmac, timingSafeEqual } from "crypto";
import multer from "multer";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  posCashiersTable, posProductsTable, posOrdersTable,
  posOrderItemsTable, posStockItemsTable, posStockAdjustmentsTable,
  posBranchesTable, posSettingsTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import bcrypt from "bcryptjs";
import { ObjectStorageService } from "../lib/objectStorage.js";

// ── POS image upload (Replit Object Storage) ──────────────────────────────────
const posImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Hanya file gambar yang diperbolehkan"));
  },
});

const objectStorageService = new ObjectStorageService();

const router = Router();

// ── Token secret ─────────────────────────────────────────────────────────────
// Security: tokens are HMAC-SHA256 signed (not plain base64). The secret is
// required at startup — server refuses to start without it. This prevents the
// previous vulnerability where any base64-encoded JSON was accepted as valid.

const _rawSecret = process.env.CASHIER_TOKEN_SECRET;
if (!_rawSecret || _rawSecret.length < 32) {
  throw new Error("[POS] CASHIER_TOKEN_SECRET harus di-set minimal 32 karakter. Server tidak dapat berjalan tanpa secret ini.");
}
const TOKEN_SECRET: string = _rawSecret;

// ── Auth helper ──────────────────────────────────────────────────────────────

const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function makeCashierToken(id: number, email: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = Buffer.from(JSON.stringify({ id, email, exp })).toString("base64url");
  const sig = createHmac("sha256", TOKEN_SECRET).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function parseCashierToken(token: string): { id: number; email: string; exp: number } | null {
  const dot = token.lastIndexOf(".");
  if (dot === -1) return null;
  const payloadPart = token.slice(0, dot);
  const sigPart = token.slice(dot + 1);
  const expectedSig = createHmac("sha256", TOKEN_SECRET).update(payloadPart).digest("base64url");
  try {
    const sigBuf = Buffer.from(sigPart, "base64url");
    const expBuf = Buffer.from(expectedSig, "base64url");
    if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  } catch {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf-8")) as { id: number; email: string; exp: number };
    if (typeof parsed.exp !== "number") return null;
    if (Date.now() > parsed.exp) return null;
    return { id: parsed.id, email: parsed.email, exp: parsed.exp };
  } catch {
    return null;
  }
}

async function requireCashierAuth(req: Request, res: Response): Promise<{ id: number; name: string; email: string; branchId?: number | null } | null> {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const token = auth.slice(7);
  const payload = parseCashierToken(token);
  if (!payload) {
    res.status(401).json({ message: "Token tidak valid" });
    return null;
  }

  const [cashier] = await db.select().from(posCashiersTable).where(eq(posCashiersTable.id, payload.id));
  if (!cashier || cashier.status !== "approved" || cashier.email !== payload.email) {
    res.status(403).json({ message: "Akun kasir belum disetujui atau tidak ditemukan" });
    return null;
  }
  return { id: cashier.id, name: cashier.name, email: cashier.email, branchId: cashier.branchId };
}

// Helper: ubah snake_case row dari raw SQL jadi camelCase untuk response
function camelizeStockRow(row: Record<string, unknown>) {
  return {
    id: row.id,
    name: row.name,
    unit: row.unit,
    currentStock: row.current_stock,
    minStock: row.min_stock,
    note: row.note,
    branchId: row.branch_id,
    updatedAt: row.updated_at,
  };
}

function orderNumber(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `TT/${y}${m}${d}/${rand}`;
}

// ── POS Image Upload ──────────────────────────────────────────────────────────

// POST /api/pos-kasir/admin/upload-image  (admin only)
router.post("/admin/upload-image", (req: Request, res: Response, next: import("express").NextFunction) => {
  posImageUpload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message ?? "Gagal memproses file" });
    }
    if (!(await requireClerkUser(req, res))) return;
    if (!req.file) return res.status(400).json({ message: "Tidak ada file yang diupload" });
    try {
      const objectId = randomUUID();
      const url = await objectStorageService.uploadPublicAsset(req.file.buffer, objectId, req.file.mimetype);
      return res.json({ url, objectPath: url });
    } catch (uploadErr) {
      return res.status(500).json({ message: "Gagal menyimpan gambar ke storage" });
    }
  });
});

// ── Branches (public read) ────────────────────────────────────────────────────

// GET /api/pos-kasir/branches  — public
router.get("/branches", async (_req, res) => {
  const rows = await db.select().from(posBranchesTable)
    .where(eq(posBranchesTable.isActive, true))
    .orderBy(posBranchesTable.name);
  return res.json(rows);
});

// ── Kasir Auth ────────────────────────────────────────────────────────────────

// POST /api/pos-kasir/register
router.post("/register", async (req, res) => {
  const { name, email, password, phone, branchId } = req.body ?? {};
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
    branchId: branchId ? Number(branchId) : null,
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

  // Load branch info
  let branchName: string | null = null;
  if (cashier.branchId) {
    const [branch] = await db.select().from(posBranchesTable).where(eq(posBranchesTable.id, cashier.branchId));
    branchName = branch?.name ?? null;
  }

  const token = makeCashierToken(cashier.id, cashier.email);
  return res.json({
    token,
    cashier: {
      id: cashier.id,
      name: cashier.name,
      email: cashier.email,
      branchId: cashier.branchId,
      branchName,
    },
  });
});

// GET /api/pos-kasir/me
router.get("/me", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  let branchName: string | null = null;
  if (cashier.branchId) {
    const [branch] = await db.select().from(posBranchesTable).where(eq(posBranchesTable.id, cashier.branchId));
    branchName = branch?.name ?? null;
  }
  return res.json({ ...cashier, branchName });
});

// ── Products (public read, admin write) ─────────────────────────────────────

// GET /api/pos-kasir/products
router.get("/products", async (_req, res) => {
  const rows = await db.select().from(posProductsTable)
    .where(eq(posProductsTable.isActive, true))
    .orderBy(posProductsTable.sortOrder, posProductsTable.name);
  return res.json(rows);
});

// GET /api/pos-kasir/products/all  (admin)
router.get("/products/all", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const rows = await db.select().from(posProductsTable).orderBy(posProductsTable.sortOrder, posProductsTable.name);
  return res.json(rows);
});

// POST /api/pos-kasir/products
router.post("/products", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { name, description, price, category, imageUrl, isActive, sortOrder, stockItemId, stockUsagePerUnit } = req.body ?? {};
  if (!name || price == null) return res.status(400).json({ message: "name dan price wajib" });
  const extraFields = {
    stockItemId: stockItemId ? Number(stockItemId) : null,
    stockUsagePerUnit: stockUsagePerUnit != null ? String(stockUsagePerUnit) : "1",
  };
  const [created] = await db.insert(posProductsTable).values({
    name: String(name), description: description ?? null,
    price: String(price), category: category ?? "minuman",
    imageUrl: imageUrl ?? null, isActive: isActive ?? true,
    sortOrder: sortOrder ?? 0,
    ...extraFields,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any).returning();
  return res.status(201).json(created);
});

// PATCH /api/pos-kasir/products/:id
router.patch("/products/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "description", "price", "category", "imageUrl", "isActive", "sortOrder", "stockItemId", "stockUsagePerUnit"]) {
    if (req.body?.[k] !== undefined) {
      if (k === "stockItemId") patch[k] = req.body[k] === null || req.body[k] === "" ? null : Number(req.body[k]);
      else patch[k] = req.body[k];
    }
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

// POST /api/pos-kasir/orders
router.post("/orders", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const { items, discount, note, branchId } = req.body ?? {};
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
  const effectiveBranchId = branchId ? Number(branchId) : (cashier.branchId ?? null);

  const [order] = await db.insert(posOrdersTable).values({
    orderNumber: orderNumber(),
    cashierId: cashier.id,
    branchId: effectiveBranchId,
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

  // ── Auto-deduct stok bahan berbasis cabang kasir ──────────────────────────
  // Strategi: ambil stockItemId dari produk → cari nama bahan → cari stok dengan
  // nama yang sama di cabang kasir → kurangi stok cabang tersebut.
  // Fallback: jika tidak ada stok di cabang kasir, gunakan stockItemId langsung.
  const productIds = items.map((i) => i.productId);
  if (productIds.length > 0) {
    const products = await db.select().from(posProductsTable).where(inArray(posProductsTable.id, productIds));
    const productMap = new Map(products.map((p) => [p.id, p]));

    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) continue;
      const stockItemId = (product as { stockItemId?: number | null }).stockItemId;
      const usagePerUnit = Number((product as { stockUsagePerUnit?: string | number }).stockUsagePerUnit ?? 1);
      if (!stockItemId) continue;

      const totalUsage = item.qty * usagePerUnit;

      // Cari stok dengan nama sama di cabang kasir (per-branch isolation)
      let targetStockId = stockItemId;
      if (cashier.branchId) {
        const [refStock] = (await db.execute(sql`SELECT name FROM pos_stock_items WHERE id = ${stockItemId}`)).rows as Array<{ name: string }>;
        if (refStock?.name) {
          const [branchStock] = (await db.execute(sql`
            SELECT id FROM pos_stock_items
            WHERE LOWER(name) = LOWER(${refStock.name}) AND branch_id = ${cashier.branchId}
            LIMIT 1
          `)).rows as Array<{ id: number }>;
          if (branchStock) targetStockId = branchStock.id;
        }
      }

      await db.execute(sql`
        UPDATE pos_stock_items SET current_stock = current_stock - ${totalUsage}, updated_at = NOW()
        WHERE id = ${targetStockId}
      `);
      await db.insert(posStockAdjustmentsTable).values({
        stockItemId: targetStockId,
        cashierId: cashier.id,
        delta: String(-totalUsage),
        reason: `auto:order:${order.orderNumber}:${item.productName}×${item.qty}`,
      });
    }
  }

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

// GET /api/pos-kasir/orders/today
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
// Security: ownership check (IDOR fix) — rejects orders not belonging to the
// authenticated cashier, preventing cross-cashier data access by ID guessing.
router.get("/orders/:id", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  const [order] = await db.select().from(posOrdersTable).where(eq(posOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });
  if (order.cashierId !== cashier.id) return res.status(403).json({ message: "Bukan order Anda" });
  const items = await db.select().from(posOrderItemsTable).where(eq(posOrderItemsTable.orderId, id));
  return res.json({ ...order, items });
});

// ── Stock ─────────────────────────────────────────────────────────────────────

// GET /api/pos-kasir/stock
// Kasir hanya melihat stok cabangnya sendiri (filter branch_id via raw SQL)
router.get("/stock", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const result = cashier.branchId
    ? await db.execute(sql`SELECT * FROM pos_stock_items WHERE branch_id = ${cashier.branchId} ORDER BY name`)
    : await db.execute(sql`SELECT * FROM pos_stock_items ORDER BY name`);
  return res.json(result.rows.map(camelizeStockRow));
});

// POST /api/pos-kasir/stock/adjust
// Kasir hanya bisa adjust stok cabangnya sendiri
router.post("/stock/adjust", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const { stockItemId, delta, reason } = req.body ?? {};
  if (!stockItemId || delta == null) return res.status(400).json({ message: "stockItemId dan delta wajib" });

  const [row] = (await db.execute(sql`SELECT * FROM pos_stock_items WHERE id = ${Number(stockItemId)}`)).rows;
  if (!row) return res.status(404).json({ message: "Item stok tidak ditemukan" });
  const itemRow = row as Record<string, unknown>;
  if (cashier.branchId && itemRow.branch_id != null && Number(itemRow.branch_id) !== cashier.branchId) {
    return res.status(403).json({ message: "Tidak dapat mengubah stok cabang lain" });
  }

  await db.execute(sql`UPDATE pos_stock_items SET current_stock = current_stock + ${Number(delta)}, updated_at = NOW() WHERE id = ${Number(stockItemId)}`);
  await db.insert(posStockAdjustmentsTable).values({
    stockItemId: Number(stockItemId), cashierId: cashier.id,
    delta: String(delta), reason: reason ?? null,
  });

  const [updated] = (await db.execute(sql`SELECT * FROM pos_stock_items WHERE id = ${Number(stockItemId)}`)).rows;
  return res.json(camelizeStockRow(updated as Record<string, unknown>));
});

// ── Admin — Branches ──────────────────────────────────────────────────────────

// GET /api/pos-kasir/admin/branches
router.get("/admin/branches", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const rows = await db.select().from(posBranchesTable).orderBy(posBranchesTable.name);
  return res.json(rows);
});

// POST /api/pos-kasir/admin/branches
router.post("/admin/branches", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { name, address, phone, isActive } = req.body ?? {};
  if (!name?.trim()) return res.status(400).json({ message: "Nama cabang wajib diisi" });
  const [created] = await db.insert(posBranchesTable).values({
    name: String(name).trim(),
    address: address ?? null,
    phone: phone ?? null,
    isActive: isActive !== false,
  }).returning();
  return res.status(201).json(created);
});

// PATCH /api/pos-kasir/admin/branches/:id
router.patch("/admin/branches/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const patch: Record<string, unknown> = {};
  for (const k of ["name", "address", "phone", "isActive"]) {
    if (req.body?.[k] !== undefined) patch[k] = req.body[k];
  }
  const [updated] = await db.update(posBranchesTable).set(patch).where(eq(posBranchesTable.id, id)).returning();
  return res.json(updated);
});

// DELETE /api/pos-kasir/admin/branches/:id
router.delete("/admin/branches/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  // Cek apakah ada kasir terkait
  const [linked] = await db.select({ id: posCashiersTable.id }).from(posCashiersTable).where(eq(posCashiersTable.branchId, id));
  if (linked) return res.status(409).json({ message: "Cabang masih digunakan oleh kasir, tidak bisa dihapus" });
  await db.delete(posBranchesTable).where(eq(posBranchesTable.id, id));
  return res.json({ message: "Cabang dihapus" });
});

// ── Admin — Cashiers ──────────────────────────────────────────────────────────

// GET /api/pos-kasir/admin/cashiers
router.get("/admin/cashiers", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const rows = await db.select({
    id: posCashiersTable.id,
    name: posCashiersTable.name,
    email: posCashiersTable.email,
    phone: posCashiersTable.phone,
    status: posCashiersTable.status,
    branchId: posCashiersTable.branchId,
    branchName: posBranchesTable.name,
    createdAt: posCashiersTable.createdAt,
  }).from(posCashiersTable)
    .leftJoin(posBranchesTable, eq(posCashiersTable.branchId, posBranchesTable.id))
    .orderBy(desc(posCashiersTable.createdAt));
  return res.json(rows);
});

// PATCH /api/pos-kasir/admin/cashiers/:id
router.patch("/admin/cashiers/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (req.body?.status !== undefined) {
    if (!["approved", "rejected", "pending"].includes(req.body.status)) {
      return res.status(400).json({ message: "Status tidak valid" });
    }
    patch.status = req.body.status;
  }
  if (req.body?.branchId !== undefined) {
    patch.branchId = req.body.branchId === null ? null : Number(req.body.branchId);
  }
  const [updated] = await db.update(posCashiersTable)
    .set(patch)
    .where(eq(posCashiersTable.id, id))
    .returning();
  return res.json(updated);
});

// ── Admin — Report ────────────────────────────────────────────────────────────

// GET /api/pos-kasir/admin/report
router.get("/admin/report", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { from, to, cashierId, branchId } = req.query;
  const start = from ? new Date(String(from)) : (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(0,0,0,0); return d; })();
  const end = to ? new Date(String(to)) : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();

  const conds = [eq(posOrdersTable.status, "paid"), gte(posOrdersTable.paidAt, start), lte(posOrdersTable.paidAt, end)];
  if (cashierId) conds.push(eq(posOrdersTable.cashierId, Number(cashierId)));
  if (branchId) conds.push(eq(posOrdersTable.branchId, Number(branchId)));

  const orders = await db.select({
    id: posOrdersTable.id,
    orderNumber: posOrdersTable.orderNumber,
    cashierId: posOrdersTable.cashierId,
    cashierName: posCashiersTable.name,
    branchId: posOrdersTable.branchId,
    branchName: posBranchesTable.name,
    total: posOrdersTable.total,
    paymentMethod: posOrdersTable.paymentMethod,
    paidAt: posOrdersTable.paidAt,
  }).from(posOrdersTable)
    .leftJoin(posCashiersTable, eq(posOrdersTable.cashierId, posCashiersTable.id))
    .leftJoin(posBranchesTable, eq(posOrdersTable.branchId, posBranchesTable.id))
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

// GET /api/pos-kasir/admin/report/daily
router.get("/admin/report/daily", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { branchId } = req.query;
  const whereCond = branchId
    ? sql`WHERE status = 'paid' AND paid_at IS NOT NULL AND branch_id = ${Number(branchId)}`
    : sql`WHERE status = 'paid' AND paid_at IS NOT NULL`;
  const result = await db.execute(sql`
    SELECT
      DATE(paid_at) as date,
      COUNT(*) as order_count,
      SUM(total) as revenue
    FROM pos_orders
    ${whereCond}
    GROUP BY DATE(paid_at)
    ORDER BY date DESC
    LIMIT 30
  `);
  return res.json(result.rows);
});

// ── Admin — Stock ─────────────────────────────────────────────────────────────

// GET /api/pos-kasir/admin/stock?branchId=X
router.get("/admin/stock", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { branchId } = req.query;
  const result = branchId
    ? await db.execute(sql`SELECT s.*, b.name as branch_name FROM pos_stock_items s LEFT JOIN pos_branches b ON s.branch_id = b.id WHERE s.branch_id = ${Number(branchId)} ORDER BY s.name`)
    : await db.execute(sql`SELECT s.*, b.name as branch_name FROM pos_stock_items s LEFT JOIN pos_branches b ON s.branch_id = b.id ORDER BY b.name NULLS LAST, s.name`);
  return res.json(result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return { ...camelizeStockRow(row), branchName: row.branch_name };
  }));
});

// POST /api/pos-kasir/admin/stock
router.post("/admin/stock", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { name, unit, currentStock, minStock, note, branchId } = req.body ?? {};
  if (!name) return res.status(400).json({ message: "name wajib" });
  const result = await db.execute(sql`
    INSERT INTO pos_stock_items (name, unit, current_stock, min_stock, note, branch_id)
    VALUES (${String(name)}, ${unit ?? "pcs"}, ${String(currentStock ?? 0)}, ${String(minStock ?? 0)}, ${note ?? null}, ${branchId ? Number(branchId) : null})
    RETURNING *
  `);
  return res.status(201).json(camelizeStockRow(result.rows[0] as Record<string, unknown>));
});

// PATCH /api/pos-kasir/admin/stock/:id
router.patch("/admin/stock/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  const { name, unit, currentStock, minStock, note, branchId } = req.body ?? {};
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (name !== undefined) patch.name = String(name);
  if (unit !== undefined) patch.unit = unit;
  if (currentStock !== undefined) patch.currentStock = String(currentStock);
  if (minStock !== undefined) patch.minStock = String(minStock);
  if (note !== undefined) patch.note = note;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await db.update(posStockItemsTable).set(patch as any).where(eq(posStockItemsTable.id, id));
  if (branchId !== undefined) {
    const bid = (branchId === null || branchId === "") ? null : Number(branchId);
    await db.execute(sql`UPDATE pos_stock_items SET branch_id = ${bid} WHERE id = ${id}`);
  }
  const [updated] = (await db.execute(sql`SELECT * FROM pos_stock_items WHERE id = ${id}`)).rows;
  return res.json(camelizeStockRow(updated as Record<string, unknown>));
});

// DELETE /api/pos-kasir/admin/stock/:id
router.delete("/admin/stock/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  await db.delete(posStockItemsTable).where(eq(posStockItemsTable.id, id));
  return res.json({ message: "Deleted" });
});

// ── Settings ──────────────────────────────────────────────────────────────────

// GET /api/pos-kasir/settings  — public (so kasir page can load logo without auth)
router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(posSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return res.json(settings);
});

// PATCH /api/pos-kasir/admin/settings  — admin only
router.patch("/admin/settings", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const updates = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(updates)) {
    await db.insert(posSettingsTable)
      .values({ key, value, updatedAt: new Date() })
      .onConflictDoUpdate({ target: posSettingsTable.key, set: { value, updatedAt: new Date() } });
  }
  const rows = await db.select().from(posSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return res.json(settings);
});

export default router;
