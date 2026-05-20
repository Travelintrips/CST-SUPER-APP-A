import { Router, type Request, type Response } from "express";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { createHmac, timingSafeEqual } from "crypto";
import multer from "multer";
import { randomUUID } from "crypto";
import { db } from "@workspace/db";
import {
  posCashiersTable, posProductsTable, posOrdersTable,
  posOrderItemsTable, posStockItemsTable, posStockAdjustmentsTable,
  posBranchesTable, posSettingsTable, posQrOrdersTable,
} from "@workspace/db";
import { eq, desc, and, gte, lte, sql, inArray } from "drizzle-orm";
import { registerPosKasirConnection, unregisterPosKasirConnection, broadcastToPosKasirBranch } from "../lib/sseManager.js";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { checkPosStock, deductPosStock, checkPosBomStock, deductPosBomStock, type PosProductStock, type ProductType } from "../lib/posStock.js";
import { postPosTransaction, postPosCogs } from "../lib/accounting.js";
import bcrypt from "bcryptjs";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { writeAuditLog } from "../lib/auditLog.js";

/** Blokir role gudang dari semua route admin POS (PATCH/POST/DELETE) */
function assertNotGudangAdmin(req: Request, res: Response): boolean {
  const role = (req.user as { role?: string | null } | undefined)?.role ?? "";
  if (role === "gudang") {
    res.status(403).json({ message: "Petugas gudang tidak diizinkan mengakses administrasi POS" });
    return false;
  }
  return true;
}

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

interface CashierContext {
  id: number;
  name: string;
  email: string;
  branchId: number | null;
  companyId: number | null;
  posRole: string;
}

async function requireCashierAuth(req: Request, res: Response): Promise<CashierContext | null> {
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
  return {
    id: cashier.id,
    name: cashier.name,
    email: cashier.email,
    branchId: cashier.branchId ?? null,
    companyId: cashier.companyId ?? null,
    posRole: cashier.posRole ?? "kasir",
  };
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
  // Audit log: POS kasir login berhasil
  const ipAddress = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
  const userAgent = (req.headers["user-agent"] as string) ?? "unknown";
  writeAuditLog({
    companyId: cashier.companyId ?? null,
    branchId: cashier.branchId ?? null,
    userId: String(cashier.id),
    userEmail: cashier.email,
    action: "login",
    module: "pos",
    referenceId: `kasir-${cashier.id}`,
    newData: { email: cashier.email, branchId: cashier.branchId, branchName },
    ipAddress,
    userAgent,
  });
  return res.json({
    token,
    cashier: {
      id: cashier.id,
      name: cashier.name,
      email: cashier.email,
      branchId: cashier.branchId,
      branchName,
      companyId: cashier.companyId ?? null,
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

// GET /api/pos-kasir/products — requires cashier auth; company isolated to cashier's company
router.get("/products", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const companyId = cashier.companyId ?? resolveCompanyId(req);
  const rows = await db.execute(sql`
    SELECT * FROM pos_products
    WHERE is_active = TRUE AND company_id = ${companyId}
    ORDER BY sort_order ASC, name ASC
  `);
  return res.json(rows.rows);
});

// GET /api/pos-kasir/products/all  (admin)
router.get("/products/all", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const companyId = resolveCompanyId(req);
  const result = await db.execute(sql`SELECT * FROM pos_products WHERE company_id = ${companyId} ORDER BY sort_order ASC, name ASC`);
  return res.json(result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id, name: row.name, description: row.description,
      price: row.price, category: row.category,
      imageUrl: row.image_url, isActive: row.is_active, sortOrder: row.sort_order,
      stock: row.stock, stockUnit: row.stock_unit,
      stockItemId: row.stock_item_id, stockUsagePerUnit: row.stock_usage_per_unit,
      productType: row.product_type ?? "STOCK",
      linkedProductId: row.linked_product_id ?? null,
      createdAt: row.created_at,
    };
  }));
});

// POST /api/pos-kasir/products
router.post("/products", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { name, description, price, category, imageUrl, isActive, sortOrder, productType, linkedProductId, stockItemId, stockUsagePerUnit, stock, stockUnit } = req.body ?? {};
  if (!name || price == null) return res.status(400).json({ message: "name dan price wajib" });
  const companyId = resolveCompanyId(req);
  const r = await db.execute(sql`
    INSERT INTO pos_products
      (company_id, name, description, price, category, image_url, is_active, sort_order,
       product_type, linked_product_id,
       stock_item_id, stock_usage_per_unit, stock, stock_unit)
    VALUES
      (${companyId}, ${String(name)}, ${description ?? null}, ${String(price)}, ${category ?? "minuman"},
       ${imageUrl ?? null}, ${isActive ?? true}, ${sortOrder ?? 0},
       ${productType ?? "STOCK"},
       ${linkedProductId ? Number(linkedProductId) : null},
       ${stockItemId ? Number(stockItemId) : null},
       ${stockUsagePerUnit != null ? String(stockUsagePerUnit) : "1"},
       ${stock != null && stock !== "" ? String(stock) : null},
       ${stockUnit ?? "pcs"})
    RETURNING *
  `);
  return res.status(201).json(r.rows[0]);
});

// PATCH /api/pos-kasir/products/:id
router.patch("/products/:id", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const body = req.body ?? {};

  // Baca existing dulu agar kolom yang tidak dikirim tetap memakai nilai lama
  const [existing] = (await db.execute(sql`SELECT * FROM pos_products WHERE id = ${id}`)).rows as Array<Record<string, unknown>>;
  if (!existing) return res.status(404).json({ message: "Produk tidak ditemukan" });
  const ex = existing;

  const stockItemId = body.stockItemId !== undefined
    ? (body.stockItemId === null || body.stockItemId === "" ? null : Number(body.stockItemId))
    : ex.stock_item_id;
  const stockUsagePerUnit = body.stockUsagePerUnit !== undefined
    ? (body.stockUsagePerUnit === null || body.stockUsagePerUnit === "" ? "1" : String(body.stockUsagePerUnit))
    : (ex.stock_usage_per_unit ?? "1");

  // Satu raw SQL UPDATE — tidak pakai Drizzle set() agar tidak ada masalah mapping
  await db.execute(sql`
    UPDATE pos_products SET
      name                = ${body.name !== undefined ? String(body.name) : ex.name},
      description         = ${body.description !== undefined ? (body.description || null) : ex.description},
      price               = ${body.price !== undefined ? String(body.price) : ex.price},
      category            = ${body.category !== undefined ? String(body.category) : ex.category},
      image_url           = ${body.imageUrl !== undefined ? (body.imageUrl || null) : ex.image_url},
      is_active           = ${body.isActive !== undefined ? Boolean(body.isActive) : ex.is_active},
      sort_order          = ${body.sortOrder !== undefined ? Number(body.sortOrder) : ex.sort_order},
      stock               = ${body.stock !== undefined ? (body.stock === null || body.stock === "" ? null : String(body.stock)) : ex.stock},
      stock_unit          = ${body.stockUnit !== undefined ? String(body.stockUnit) : ex.stock_unit},
      stock_item_id       = ${stockItemId},
      stock_usage_per_unit = ${stockUsagePerUnit},
      linked_product_id   = ${
        body.linkedProductId !== undefined
          ? (body.linkedProductId === null || body.linkedProductId === "" ? null : Number(body.linkedProductId))
          : (ex.linked_product_id ?? null)
      },
      product_type        = ${body.productType !== undefined ? String(body.productType) : (ex.product_type ?? "STOCK")}
    WHERE id = ${id}
  `);

  const [updated] = (await db.execute(sql`SELECT * FROM pos_products WHERE id = ${id}`)).rows as Array<Record<string, unknown>>;
  return res.json({
    id: updated.id,
    name: updated.name,
    description: updated.description,
    price: updated.price,
    category: updated.category,
    imageUrl: updated.image_url,
    isActive: updated.is_active,
    sortOrder: updated.sort_order,
    productType: updated.product_type ?? "STOCK",
    stock: updated.stock,
    stockUnit: updated.stock_unit,
    stockItemId: updated.stock_item_id,
    stockUsagePerUnit: updated.stock_usage_per_unit,
    linkedProductId: updated.linked_product_id ?? null,
    createdAt: updated.created_at,
  });
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

  // branchId WAJIB dari cashier record — tidak bisa di-override dari body
  if (!cashier.branchId) {
    return res.status(403).json({ message: "Kasir belum memiliki cabang. Hubungi admin untuk mengatur cabang." });
  }
  const effectiveBranchId = cashier.branchId;
  const effectiveCompanyId = cashier.companyId ?? resolveCompanyId(req);

  const { items, discount, note } = req.body ?? {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Items tidak boleh kosong" });
  }

  const productIds: number[] = items.map((i: { productId: number }) => Number(i.productId));

  // Load products — sekaligus validasi company_id agar kasir tidak bisa order produk perusahaan lain
  const posProds = (await db.execute(sql`
    SELECT id, name, price, is_active, product_type, linked_product_id, company_id
    FROM pos_products WHERE id = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]::int[]`)})
      AND company_id = ${effectiveCompanyId}
      AND is_active = TRUE
  `)).rows as Array<{
    id: number; name: string; price: string; is_active: boolean;
    product_type: string | null; linked_product_id: number | null; company_id: number;
  }>;
  const productMap = new Map(posProds.map((p) => [p.id, p]));

  let subtotal = 0;
  const lineItems: Array<{ productId: number; productName: string; price: string; qty: number; subtotal: string }> = [];
  const stockItems: PosProductStock[] = [];

  for (const item of items as Array<{ productId: number; qty: number }>) {
    const p = productMap.get(Number(item.productId));
    if (!p) return res.status(400).json({ message: `Produk ID ${item.productId} tidak ditemukan atau tidak aktif` });
    const price = Number(p.price);
    const qty = Number(item.qty) || 1;
    const sub = price * qty;
    subtotal += sub;
    lineItems.push({ productId: p.id, productName: p.name, price: String(price), qty, subtotal: String(sub) });
    stockItems.push({
      productId: p.id,
      productName: p.name,
      productType: (p.product_type ?? "STOCK") as ProductType,
      linkedProductId: p.linked_product_id,
      qty,
    });
  }

  // Cek ketersediaan stok sebelum membuat order (gunakan cabang kasir)
  const shortages = await checkPosStock(stockItems, effectiveBranchId);
  if (shortages.length > 0) {
    return res.status(422).json({
      message: "Stok tidak cukup untuk menyelesaikan order.",
      shortages,
    });
  }

  const discountAmt = Number(discount) || 0;
  const total = subtotal - discountAmt;

  const [order] = await db.insert(posOrdersTable).values({
    companyId: effectiveCompanyId,
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

  const ipPOS = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
  writeAuditLog({
    companyId: effectiveCompanyId ?? null,
    branchId: effectiveBranchId ?? null,
    userId: String(cashier.id),
    userEmail: cashier.email,
    action: "create",
    module: "pos",
    referenceId: order!.orderNumber,
    newData: { orderNumber: order!.orderNumber, total: order!.total, itemCount: lineItems.length },
    ipAddress: ipPOS,
    userAgent: (req.headers["user-agent"] as string) ?? "unknown",
  });
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
  // Validasi branch: order harus dari cabang yang sama dengan kasir
  if (cashier.branchId && order.branchId && order.branchId !== cashier.branchId) {
    return res.status(403).json({ message: "Order bukan dari cabang Anda" });
  }
  if (order.status !== "open") return res.status(400).json({ message: "Order sudah diproses" });

  const orderItems = await db.select().from(posOrderItemsTable).where(eq(posOrderItemsTable.orderId, id));
  const productIds = orderItems.map((i) => i.productId);

  // Load product_type + linked_product_id for each item
  const posProds = productIds.length > 0
    ? (await db.execute(sql`
        SELECT id, product_type, linked_product_id
        FROM pos_products WHERE id = ANY(${sql.raw(`ARRAY[${productIds.join(",")}]::int[]`)})
      `)).rows as Array<{ id: number; product_type: string | null; linked_product_id: number | null }>
    : [];
  const prodMeta = new Map(posProds.map((p) => [p.id, p]));

  const stockItems: PosProductStock[] = orderItems.map((item) => {
    const meta = prodMeta.get(item.productId);
    return {
      productId: item.productId,
      productName: item.productName,
      productType: (meta?.product_type ?? "STOCK") as ProductType,
      linkedProductId: meta?.linked_product_id ?? null,
      qty: item.qty,
    };
  });

  // ── Cek stok SEKALI LAGI tepat sebelum bayar (race-condition guard) ──────────
  if (cashier.branchId) {
    const shortages = await checkPosStock(stockItems, cashier.branchId);
    if (shortages.length > 0) {
      return res.status(422).json({
        message: "Stok tidak cukup untuk menyelesaikan transaksi.",
        shortages,
      });
    }
  }

  // ── Cek stok bahan baku BOM (pos_recipes) sebelum bayar ───────────────────────
  const bomItems = orderItems.map((i) => ({
    productId: i.productId,
    productName: i.productName,
    qty: i.qty,
  }));
  if (cashier.branchId) {
    const bomShortages = await checkPosBomStock(bomItems, cashier.branchId);
    if (bomShortages.length > 0) {
      return res.status(422).json({
        message: "Stok bahan baku tidak cukup untuk menyelesaikan transaksi.",
        shortages: bomShortages,
      });
    }
  }

  const paid = Number(amountPaid) || Number(order.total);
  const change = paid - Number(order.total);

  // ── Update order status + deduct BOM stock (1 transaksi atomik) ───────────────
  // Jika deduction BOM gagal (misal race condition), order update ikut dibatalkan.
  let updated: typeof posOrdersTable.$inferSelect | undefined;
  try {
    await db.transaction(async (tx) => {
      const [upd] = await tx
        .update(posOrdersTable)
        .set({
          status: "paid",
          paymentMethod,
          amountPaid: String(paid),
          change: String(Math.max(0, change)),
          paidAt: new Date(),
        })
        .where(eq(posOrdersTable.id, id))
        .returning();
      updated = upd;

      // Deduct bahan baku via pos_inventory_stocks + pos_stock_mutations
      if (cashier.branchId && bomItems.length > 0) {
        await deductPosBomStock(bomItems, cashier.branchId, order.id, tx);
      }
    });
  } catch (txErr) {
    return res.status(422).json({
      message: `Checkout gagal: ${(txErr as Error).message}`,
    });
  }

  if (!updated) return res.status(500).json({ message: "Order update gagal" });

  // ── Deduct stok via wh_stock + wh_movements (existing POS stock logic) ────────
  if (cashier.branchId && stockItems.length > 0) {
    const { warnings } = await deductPosStock(
      stockItems,
      cashier.branchId,
      order.id,
      order.orderNumber,
    );
    if (warnings.length > 0) {
      console.warn("[pos-stock] deduction warnings:", warnings);
    }
  }

  // ── Post accounting journal: DR Kas/Bank / CR Pendapatan POS ─────────────────
  await postPosTransaction({
    transactionId: order.id,
    productName: `POS Order #${order.orderNumber}`,
    totalPrice: Number(order.total),
    paymentMethod: paymentMethod as string,
    createdById: null,
    companyId: order.companyId ?? null,
  });

  // ── Post POS COGS: DR HPP / CR Persediaan (untuk item dengan linked inventory product) ──
  try {
    const itemsWithLinked = orderItems.filter((i) => {
      const meta = prodMeta.get(i.productId);
      return meta?.linked_product_id != null;
    });
    if (itemsWithLinked.length > 0) {
      const linkedIds = itemsWithLinked.map((i) => prodMeta.get(i.productId)!.linked_product_id!);
      // Fetch cost prices from wh_stock using linked product IDs
      const costRows = (await db.execute(sql`
        SELECT product_id, AVG(cost_price::numeric) as avg_cost
        FROM wh_stock
        WHERE product_id = ANY(${sql.raw(`ARRAY[${linkedIds.join(",")}]::int[]`)})
        GROUP BY product_id
      `)).rows as Array<{ product_id: number; avg_cost: string }>;
      const costByProductId = new Map(costRows.map((r) => [r.product_id, Number(r.avg_cost)]));

      const cogsItems = itemsWithLinked.map((i) => {
        const linkedId = prodMeta.get(i.productId)!.linked_product_id!;
        const costPrice = costByProductId.get(linkedId) ?? 0;
        return { name: i.productName, qty: i.qty, costPrice };
      }).filter((x) => x.costPrice > 0);

      if (cogsItems.length > 0) {
        await postPosCogs({
          orderId: order.id,
          orderNumber: order.orderNumber,
          items: cogsItems,
          companyId: order.companyId ?? null,
        });
      }
    }
  } catch (e) { console.error("[pos-cogs]", e); }

  const ipPay = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown";
  writeAuditLog({
    companyId: order.companyId ?? null,
    branchId: cashier.branchId ?? null,
    userId: String(cashier.id),
    userEmail: cashier.email,
    action: "pay",
    module: "pos",
    referenceId: order.orderNumber,
    newData: { orderNumber: order.orderNumber, total: order.total, paymentMethod, amountPaid: paid, change: Math.max(0, change) },
    ipAddress: ipPay,
    userAgent: (req.headers["user-agent"] as string) ?? "unknown",
  });
  return res.json({ ...updated, items: orderItems });
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

// PATCH /api/pos-kasir/products/:id/stock-add — kasir tambah/kurang stok produk
router.patch("/products/:id/stock-add", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { delta } = req.body ?? {};
  if (delta == null || Number.isNaN(Number(delta))) return res.status(400).json({ message: "delta wajib" });
  await db.execute(sql`
    UPDATE pos_products
    SET stock = GREATEST(0, COALESCE(stock, 0) + ${Number(delta)})
    WHERE id = ${id}
  `);
  const [updated] = (await db.execute(sql`SELECT id, name, stock, stock_unit FROM pos_products WHERE id = ${id}`)).rows as Array<Record<string, unknown>>;
  if (!updated) return res.status(404).json({ message: "Produk tidak ditemukan" });
  return res.json({ id: updated.id, name: updated.name, stock: updated.stock, stockUnit: updated.stock_unit });
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
  if (!assertNotGudangAdmin(req, res)) return;
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
  if (!assertNotGudangAdmin(req, res)) return;
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
  if (Number.isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, unit, currentStock, minStock, note, branchId } = req.body ?? {};

  // Baca data existing dulu sebagai fallback untuk kolom yang tidak diubah
  const [existing] = (await db.execute(sql`SELECT * FROM pos_stock_items WHERE id = ${id}`)).rows;
  if (!existing) return res.status(404).json({ message: "Stok tidak ditemukan" });
  const ex = existing as Record<string, unknown>;

  // Gunakan raw SQL template agar mapping kolom dijamin benar (snake_case)
  await db.execute(sql`
    UPDATE pos_stock_items SET
      name          = ${name !== undefined ? String(name) : ex.name},
      unit          = ${unit !== undefined ? String(unit) : ex.unit},
      current_stock = ${currentStock !== undefined ? String(currentStock ?? 0) : ex.current_stock},
      min_stock     = ${minStock !== undefined ? String(minStock ?? 0) : ex.min_stock},
      note          = ${note !== undefined ? (note === "" ? null : note) : ex.note},
      branch_id     = ${branchId !== undefined ? (branchId === null || branchId === "" ? null : Number(branchId)) : ex.branch_id},
      updated_at    = NOW()
    WHERE id = ${id}
  `);
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

// ── Shift Management ──────────────────────────────────────────────────────────

// GET /api/pos-kasir/shifts/current — kasir auth
router.get("/shifts/current", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const result = await db.execute(sql`
    SELECT s.*, b.name as branch_name
    FROM pos_shifts s
    LEFT JOIN pos_branches b ON s.branch_id = b.id
    WHERE s.cashier_id = ${cashier.id} AND s.status = 'open'
    ORDER BY s.opened_at DESC
    LIMIT 1
  `);
  if (result.rows.length === 0) return res.json(null);
  const shift = result.rows[0] as Record<string, unknown>;
  const salesResult = await db.execute(sql`
    SELECT COALESCE(SUM(total), 0) as total_sales, COUNT(*) as order_count
    FROM pos_orders
    WHERE cashier_id = ${cashier.id} AND status = 'paid' AND paid_at >= ${shift.opened_at as Date}
  `);
  const sales = salesResult.rows[0] as Record<string, unknown>;
  return res.json({
    id: shift.id, branchId: shift.branch_id, branchName: shift.branch_name,
    cashierId: shift.cashier_id, openedAt: shift.opened_at,
    openingCash: shift.opening_cash, status: shift.status, notes: shift.notes,
    currentTotalSales: sales.total_sales, currentOrderCount: Number(sales.order_count),
  });
});

// POST /api/pos-kasir/shifts/open — kasir auth
router.post("/shifts/open", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const existing = await db.execute(sql`
    SELECT id FROM pos_shifts WHERE cashier_id = ${cashier.id} AND status = 'open' LIMIT 1
  `);
  if (existing.rows.length > 0) return res.status(409).json({ message: "Masih ada shift aktif. Tutup shift dulu." });
  const branchId = cashier.branchId ?? null;
  if (!branchId) return res.status(400).json({ message: "Kasir belum memiliki cabang yang ditentukan." });
  const { openingCash = 0, notes } = req.body ?? {};
  const result = await db.execute(sql`
    INSERT INTO pos_shifts (branch_id, cashier_id, opening_cash, notes, status, opened_at)
    VALUES (${branchId}, ${cashier.id}, ${String(openingCash)}, ${notes ?? null}, 'open', NOW())
    RETURNING *
  `);
  const shift = result.rows[0] as Record<string, unknown>;
  return res.status(201).json({
    id: shift.id, branchId: shift.branch_id, cashierId: shift.cashier_id,
    openedAt: shift.opened_at, openingCash: shift.opening_cash,
    status: shift.status, notes: shift.notes,
  });
});

// POST /api/pos-kasir/shifts/close — kasir auth
router.post("/shifts/close", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const existing = await db.execute(sql`
    SELECT * FROM pos_shifts WHERE cashier_id = ${cashier.id} AND status = 'open'
    ORDER BY opened_at DESC LIMIT 1
  `);
  if (existing.rows.length === 0) return res.status(404).json({ message: "Tidak ada shift aktif" });
  const shift = existing.rows[0] as Record<string, unknown>;
  const { closingCash, notes } = req.body ?? {};
  const salesResult = await db.execute(sql`
    SELECT COALESCE(SUM(total), 0) as total_sales, COUNT(*) as order_count
    FROM pos_orders
    WHERE cashier_id = ${cashier.id} AND status = 'paid' AND paid_at >= ${shift.opened_at as Date}
  `);
  const sales = salesResult.rows[0] as Record<string, unknown>;
  await db.execute(sql`
    UPDATE pos_shifts SET
      status = 'closed', closed_at = NOW(),
      closing_cash = ${closingCash !== undefined && closingCash !== null ? String(closingCash) : null},
      total_sales = ${String(sales.total_sales)},
      order_count = ${Number(sales.order_count)},
      notes = ${notes !== undefined ? notes : (shift.notes ?? null)}
    WHERE id = ${shift.id as number}
  `);
  const updated = (await db.execute(sql`SELECT * FROM pos_shifts WHERE id = ${shift.id as number}`)).rows[0] as Record<string, unknown>;
  return res.json({
    id: updated.id, branchId: updated.branch_id, cashierId: updated.cashier_id,
    openedAt: updated.opened_at, closedAt: updated.closed_at,
    openingCash: updated.opening_cash, closingCash: updated.closing_cash,
    totalSales: updated.total_sales, orderCount: updated.order_count,
    status: updated.status, notes: updated.notes,
  });
});

// GET /api/pos-kasir/admin/shifts — admin auth
router.get("/admin/shifts", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const { branchId, from, to } = req.query;
  const start = from ? new Date(String(from)) : (() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(0,0,0,0); return d; })();
  const end = to ? new Date(String(to) + "T23:59:59") : (() => { const d = new Date(); d.setHours(23,59,59,999); return d; })();
  const result = branchId
    ? await db.execute(sql`
        SELECT s.*, c.name as cashier_name, b.name as branch_name
        FROM pos_shifts s
        LEFT JOIN pos_cashiers c ON s.cashier_id = c.id
        LEFT JOIN pos_branches b ON s.branch_id = b.id
        WHERE s.branch_id = ${Number(branchId)} AND s.opened_at >= ${start} AND s.opened_at <= ${end}
        ORDER BY s.opened_at DESC LIMIT 100
      `)
    : await db.execute(sql`
        SELECT s.*, c.name as cashier_name, b.name as branch_name
        FROM pos_shifts s
        LEFT JOIN pos_cashiers c ON s.cashier_id = c.id
        LEFT JOIN pos_branches b ON s.branch_id = b.id
        WHERE s.opened_at >= ${start} AND s.opened_at <= ${end}
        ORDER BY s.opened_at DESC LIMIT 100
      `);
  return res.json(result.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      id: row.id, branchId: row.branch_id, branchName: row.branch_name,
      cashierId: row.cashier_id, cashierName: row.cashier_name,
      openedAt: row.opened_at, closedAt: row.closed_at,
      openingCash: row.opening_cash, closingCash: row.closing_cash,
      totalSales: row.total_sales, orderCount: row.order_count,
      status: row.status, notes: row.notes,
    };
  }));
});

// ── Settings ──────────────────────────────────────────────────────────────────

// GET /api/pos-kasir/settings  — public (so kasir page can load logo without auth)
router.get("/settings", async (_req, res) => {
  const rows = await db.select().from(posSettingsTable);
  const settings: Record<string, string> = {};
  for (const r of rows) settings[r.key] = r.value;
  return res.json(settings);
});

// ── SSE: real-time notifikasi untuk kasir ─────────────────────────────────────

// GET /api/pos-kasir/events?token=<kasir_token>
router.get("/events", async (req, res) => {
  const { token } = req.query;
  if (!token || typeof token !== "string") return res.status(401).json({ message: "Token diperlukan" });
  const payload = parseCashierToken(token);
  if (!payload) return res.status(401).json({ message: "Token tidak valid" });
  const [cashier] = await db.select().from(posCashiersTable).where(eq(posCashiersTable.id, payload.id));
  if (!cashier || cashier.status !== "approved") return res.status(403).json({ message: "Akun tidak valid" });
  const branchId = cashier.branchId;
  if (!branchId) return res.status(400).json({ message: "Kasir belum memiliki cabang" });

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write(`event: connected\ndata: ${JSON.stringify({ branchId })}\n\n`);

  registerPosKasirConnection(branchId, res);

  const heartbeat = setInterval(() => {
    try { res.write(":ping\n\n"); } catch { clearInterval(heartbeat); }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    unregisterPosKasirConnection(branchId, res);
  });
});

// ── QR Orders ─────────────────────────────────────────────────────────────────

interface QrOrderItem { productId: number; productName: string; qty: number; price: string; }

// POST /api/pos-kasir/qr-orders  — publik, dikirim dari halaman menu meja
router.post("/qr-orders", async (req, res) => {
  const { branchId, tableNumber, customerName, items, note } = (req.body ?? {}) as {
    branchId?: unknown; tableNumber?: unknown; customerName?: unknown;
    items?: unknown; note?: unknown;
  };
  if (!branchId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "branchId dan items wajib diisi" });
  }
  const [branch] = await db.select().from(posBranchesTable).where(eq(posBranchesTable.id, Number(branchId)));
  if (!branch || !branch.isActive) return res.status(404).json({ message: "Cabang tidak ditemukan" });

  const productIds = (items as { productId: unknown }[]).map((i) => Number(i.productId));
  const posProds = (await db.execute(sql`
    SELECT id, name, price FROM pos_products
    WHERE id = ANY(${productIds}::int[]) AND company_id = ${branch.companyId} AND is_active = TRUE
  `)).rows as Array<{ id: number; name: string; price: string }>;
  const prodMap = new Map(posProds.map((p) => [p.id, p]));

  const enrichedItems: QrOrderItem[] = (items as { productId: unknown; qty: unknown }[]).map((i) => {
    const p = prodMap.get(Number(i.productId));
    if (!p) throw new Error(`Produk ${String(i.productId)} tidak ditemukan`);
    return { productId: p.id, productName: p.name, qty: Math.max(1, Number(i.qty) || 1), price: p.price };
  });

  const [order] = await db.insert(posQrOrdersTable).values({
    branchId: Number(branchId),
    companyId: branch.companyId,
    tableNumber: tableNumber ? String(tableNumber) : null,
    customerName: customerName ? String(customerName).trim().slice(0, 80) : null,
    items: JSON.stringify(enrichedItems),
    note: note ? String(note).trim().slice(0, 300) : null,
    status: "pending",
  }).returning();

  const payload = {
    id: order!.id, branchId: order!.branchId,
    tableNumber: order!.tableNumber, customerName: order!.customerName,
    items: enrichedItems, note: order!.note,
    status: order!.status, createdAt: order!.createdAt,
  };
  broadcastToPosKasirBranch(Number(branchId), "new_qr_order", payload);
  return res.status(201).json({ message: "Pesanan berhasil dikirim", id: order!.id });
});

// GET /api/pos-kasir/qr-orders/pending  — kasir auth
router.get("/qr-orders/pending", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  if (!cashier.branchId) return res.json([]);
  const rows = await db.select().from(posQrOrdersTable)
    .where(and(eq(posQrOrdersTable.branchId, cashier.branchId), eq(posQrOrdersTable.status, "pending")))
    .orderBy(desc(posQrOrdersTable.createdAt));
  return res.json(rows.map((r) => ({
    id: r.id, branchId: r.branchId,
    tableNumber: r.tableNumber, customerName: r.customerName,
    items: JSON.parse(r.items) as QrOrderItem[],
    note: r.note, status: r.status, createdAt: r.createdAt,
  })));
});

// PATCH /api/pos-kasir/qr-orders/:id/accept  — kasir auth
router.patch("/qr-orders/:id/accept", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  const [qrOrder] = await db.select().from(posQrOrdersTable).where(eq(posQrOrdersTable.id, id));
  if (!qrOrder) return res.status(404).json({ message: "Pesanan tidak ditemukan" });
  if (qrOrder.branchId !== cashier.branchId) return res.status(403).json({ message: "Bukan pesanan cabang Anda" });
  if (qrOrder.status !== "pending") return res.status(400).json({ message: "Pesanan sudah diproses" });
  await db.update(posQrOrdersTable)
    .set({ status: "accepted", reviewedById: cashier.id, reviewedAt: new Date() })
    .where(eq(posQrOrdersTable.id, id));
  return res.json({ message: "Pesanan diterima" });
});

// PATCH /api/pos-kasir/qr-orders/:id/reject  — kasir auth
router.patch("/qr-orders/:id/reject", async (req, res) => {
  const cashier = await requireCashierAuth(req, res);
  if (!cashier) return;
  const id = Number(req.params.id);
  const [qrOrder] = await db.select().from(posQrOrdersTable).where(eq(posQrOrdersTable.id, id));
  if (!qrOrder) return res.status(404).json({ message: "Pesanan tidak ditemukan" });
  if (qrOrder.branchId !== cashier.branchId) return res.status(403).json({ message: "Bukan pesanan cabang Anda" });
  if (qrOrder.status !== "pending") return res.status(400).json({ message: "Pesanan sudah diproses" });
  await db.update(posQrOrdersTable)
    .set({ status: "rejected", reviewedById: cashier.id, reviewedAt: new Date() })
    .where(eq(posQrOrdersTable.id, id));
  return res.json({ message: "Pesanan ditolak" });
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
