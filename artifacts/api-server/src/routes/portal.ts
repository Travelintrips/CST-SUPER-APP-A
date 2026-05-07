import { Router, type Request, type Response, type NextFunction } from "express";
import { db, productsTable, productCategoryMapTable, productCategoriesTable, portalCustomersTable, portalCustomerServicesTable, portalContentTable, accountingSettingsTable, salesDocumentsTable, salesDocumentLinesTable, customersTable, logisticOrdersTable, suppliersTable, logisticOrderRfqsTable, logisticOrderQuotesTable } from "@workspace/db";
import { eq, inArray, and, sql, desc } from "drizzle-orm";
import crypto from "crypto";
import { ObjectStorageService } from "../lib/objectStorage";
import { sendWhatsApp } from "../lib/fonnte";
import { getAdminWa } from "../lib/adminWa.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer";

const router = Router();

const JWT_SECRET = process.env.SESSION_SECRET ?? "portal-dev-secret";

function hashPassword(password: string): string {
  return crypto.createHmac("sha256", JWT_SECRET).update(password).digest("hex");
}

function signToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const body = Buffer.from(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30 })).toString("base64url");
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const [header, body, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
    if (sig !== expected) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Record<string, unknown>;
    if (typeof payload.exp === "number" && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

type PortalAuthReq = Request & { portalCustomerId: number; portalRole: string };

function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload || typeof payload.customerId !== "number") {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }
  (req as PortalAuthReq).portalCustomerId = payload.customerId;
  (req as PortalAuthReq).portalRole = (payload.role as string) ?? "customer";
  next();
}

function requirePortalAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers["authorization"];
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const token = auth.slice(7);
  const payload = verifyToken(token);
  if (!payload || typeof payload.customerId !== "number") {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }
  if (payload.role !== "admin") {
    res.status(403).json({ message: "Akses admin diperlukan" });
    return;
  }
  (req as PortalAuthReq).portalCustomerId = payload.customerId;
  (req as PortalAuthReq).portalRole = "admin";
  next();
}

async function getServiceIds(customerId: number): Promise<number[]> {
  const rows = await db.select().from(portalCustomerServicesTable).where(eq(portalCustomerServicesTable.customerId, customerId));
  return rows.map((r) => r.serviceId);
}

async function getProductCategories(productIds: number[]): Promise<Record<number, string[]>> {
  if (productIds.length === 0) return {};
  const rows = await db
    .select({ productId: productCategoryMapTable.productId, name: productCategoriesTable.name })
    .from(productCategoryMapTable)
    .innerJoin(productCategoriesTable, eq(productCategoryMapTable.categoryId, productCategoriesTable.id))
    .where(inArray(productCategoryMapTable.productId, productIds));
  const map: Record<number, string[]> = {};
  for (const r of rows) {
    if (!map[r.productId]) map[r.productId] = [];
    map[r.productId].push(r.name);
  }
  return map;
}

// GET /api/portal/company
router.get("/company", async (_req, res) => {
  const [settings] = await db.select().from(accountingSettingsTable).limit(1);
  const adminWa = await getAdminWa();
  return res.json({
    name: settings?.companyName ?? "PT. Cahaya Sejati Teknologi",
    tagline: "Solusi Logistik Terintegrasi & Berbasis Teknologi",
    logoUrl: settings?.companyLogoUrl ?? null,
    address: settings?.companyAddress ?? null,
    email: null,
    phone: adminWa || null,
  });
});

async function listByType(type: string) {
  const rows = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.isActive, true), eq(productsTable.itemType, type)));
  const ids = rows.map((p) => p.id);
  const catMap = await getProductCategories(ids);
  return rows.map((p) => {
    let mediaItems: Array<{ type: string; url: string }> = [];
    try { mediaItems = JSON.parse(p.mediaItems ?? "[]"); } catch { /* empty */ }
    let unitOptions: string[] = [];
    try { unitOptions = JSON.parse(p.unitOptions ?? "[]"); } catch { /* empty */ }
    return {
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      price: Number(p.price),
      stock: p.stock ?? 0,
      unit: p.unit,
      unitOptions,
      imageUrl: p.imageUrl ?? null,
      mediaItems,
      categories: catMap[p.id] ?? [],
    };
  });
}

// GET /api/portal/services  — item_type = 'jasa' (active only, public)
router.get("/services", async (_req, res) => {
  return res.json(await listByType("jasa"));
});

// GET /api/portal/products  — item_type = 'barang'
router.get("/products", async (_req, res) => {
  return res.json(await listByType("barang"));
});

// ── Admin jasa management (protected by X-Admin-Password header) ──────────
const LOGISTIC_ADMIN_PASSWORD = process.env.LOGISTIC_ADMIN_PASSWORD ?? "admin123";

function requireLogisticAdmin(req: Request, res: Response, next: NextFunction) {
  const pw = req.headers["x-admin-password"];
  if (!pw || pw !== LOGISTIC_ADMIN_PASSWORD) {
    res.status(403).json({ message: "Akses admin diperlukan" });
    return;
  }
  next();
}

// ── Routes khusus untuk /logistic-admin (auth: X-Admin-Password) ──────────

// GET /api/portal/logistic-admin/services — semua jasa (incl. inactive)
router.get("/logistic-admin/services", requireLogisticAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.itemType, "jasa"))
    .orderBy(productsTable.id);
  return res.json(rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: Number(p.price),
    subcategory: p.subcategory ?? null,
    unit: p.unit,
    description: p.description ?? null,
    isActive: p.isActive,
  })));
});

// POST /api/portal/logistic-admin/services — tambah jasa baru
router.post("/logistic-admin/services", requireLogisticAdmin, async (req, res) => {
  const { name, sku, price, subcategory, unit, description } = req.body ?? {};
  if (!name || !sku) return res.status(400).json({ message: "Nama dan SKU wajib diisi" });
  const [inserted] = await db.insert(productsTable).values({
    name: String(name),
    sku: String(sku),
    price: String(Number(price) || 0),
    stock: 0,
    itemType: "jasa",
    unit: String(unit || "pcs"),
    subcategory: subcategory ? String(subcategory) : null,
    description: description ? String(description) : null,
    isActive: true,
    createdAt: new Date(),
  }).returning();
  return res.status(201).json(inserted);
});

// PUT /api/portal/logistic-admin/services/:id
router.put("/logistic-admin/services/:id", requireLogisticAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const { name, price, subcategory, unit, description, isActive } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (price !== undefined) updates.price = String(Number(price));
  if (subcategory !== undefined) updates.subcategory = subcategory ? String(subcategory) : null;
  if (unit !== undefined) updates.unit = String(unit);
  if (description !== undefined) updates.description = description ? String(description) : null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Tidak ada data yang diupdate" });
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Jasa tidak ditemukan" });
  return res.json(updated);
});

// DELETE /api/portal/logistic-admin/services/:id
router.delete("/logistic-admin/services/:id", requireLogisticAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ ok: true });
});

// Emails yang otomatis mendapat role admin saat login (comma-separated)
const PORTAL_ADMIN_EMAILS = (process.env.PORTAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// POST /api/portal/auth/login
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password wajib diisi" });
  }
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.email, String(email)));
  if (!customer || customer.passwordHash !== hashPassword(String(password))) {
    return res.status(401).json({ message: "Email atau password tidak valid" });
  }

  // Auto-promote ke admin jika email ada di daftar PORTAL_ADMIN_EMAILS
  let effectiveRole = customer.role;
  if (PORTAL_ADMIN_EMAILS.includes(String(email).toLowerCase()) && customer.role !== "admin") {
    await db.update(portalCustomersTable).set({ role: "admin" }).where(eq(portalCustomersTable.id, customer.id));
    effectiveRole = "admin";
  }

  const serviceIds = await getServiceIds(customer.id);
  const token = signToken({ customerId: customer.id, role: effectiveRole });
  return res.json({
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      company: customer.company,
      role: effectiveRole,
      serviceIds,
      createdAt: customer.createdAt.toISOString(),
    },
  });
});

// POST /api/portal/auth/register
router.post("/auth/register", async (req, res) => {
  const { name, email, password, phone, company, serviceIds, role: requestedRole } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi" });
  }
  const existing = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.email, String(email)));
  if (existing.length > 0) {
    return res.status(409).json({ message: "Email sudah terdaftar" });
  }
  // Role priority: admin email list > requested role (customer/vendor) > default customer
  let initialRole = "customer";
  if (PORTAL_ADMIN_EMAILS.includes(String(email).toLowerCase())) {
    initialRole = "admin";
  } else if (requestedRole === "vendor") {
    initialRole = "vendor";
  }

  const [customer] = await db.insert(portalCustomersTable).values({
    name: String(name),
    email: String(email),
    passwordHash: hashPassword(String(password)),
    phone: phone ? String(phone) : null,
    company: company ? String(company) : null,
    role: initialRole,
  }).returning();
  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    await db.insert(portalCustomerServicesTable).values(
      (serviceIds as number[]).map((sid) => ({ customerId: customer!.id, serviceId: Number(sid) }))
    );
  }
  const selectedServiceIds = Array.isArray(serviceIds) ? (serviceIds as number[]).map(Number) : [];
  const token = signToken({ customerId: customer!.id, role: customer!.role });
  return res.status(201).json({
    token,
    customer: {
      id: customer!.id,
      name: customer!.name,
      email: customer!.email,
      phone: customer!.phone,
      company: customer!.company,
      role: customer!.role,
      serviceIds: selectedServiceIds,
      createdAt: customer!.createdAt.toISOString(),
    },
  });
});

// POST /api/portal/auth/forgot-password
router.post("/auth/forgot-password", async (req, res) => {
  const genericMsg = { message: "Jika email terdaftar, link reset password telah dikirim." };
  const { email } = req.body ?? {};
  if (!email || typeof email !== "string" || !email.includes("@")) return res.json(genericMsg);

  const [customer] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.email, email.toLowerCase().trim()));
  if (!customer) return res.json(genericMsg);

  const token = crypto.randomBytes(32).toString("hex");
  const expiry = new Date(Date.now() + 30 * 60 * 1000);
  await db
    .update(portalCustomersTable)
    .set({ resetPasswordToken: token, resetPasswordExpiry: expiry })
    .where(eq(portalCustomersTable.id, customer.id));

  const appUrl =
    process.env.APP_URL ??
    `https://${(process.env.REPLIT_DOMAINS ?? "localhost").split(",")[0]}`;
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  if (isSmtpConfigured()) {
    sendMail({
      to: customer.email,
      subject: "Reset Password — CST Logistics",
      text: `Halo ${customer.name},\n\nKlik link berikut untuk reset password Anda (berlaku 30 menit):\n\n${resetUrl}\n\nJika Anda tidak meminta reset password, abaikan email ini.`,
      html: `<p>Halo <strong>${customer.name}</strong>,</p>
<p>Klik link berikut untuk reset password Anda (berlaku <strong>30 menit</strong>):</p>
<p><a href="${resetUrl}" style="background:#0ea5e9;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;">Reset Password</a></p>
<p style="color:#888;font-size:12px;">Atau salin link ini: ${resetUrl}</p>
<p style="color:#888;font-size:12px;">Jika Anda tidak meminta reset password, abaikan email ini.</p>`,
    }).catch((err: unknown) => {
      req.log.error({ err, email: customer.email }, "Failed to send reset password email");
    });
  } else {
    req.log.warn("SMTP not configured — reset password email not sent");
  }

  return res.json(genericMsg);
});

// POST /api/portal/auth/reset-password
router.post("/auth/reset-password", async (req, res) => {
  const { token, password } = req.body ?? {};
  if (!token || !password) {
    return res.status(400).json({ message: "Token dan password wajib diisi" });
  }
  if (typeof password !== "string" || password.length < 8) {
    return res.status(400).json({ message: "Password minimal 8 karakter" });
  }

  const [customer] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.resetPasswordToken, String(token)));

  if (!customer || !customer.resetPasswordExpiry || customer.resetPasswordExpiry < new Date()) {
    return res.status(400).json({ message: "Token tidak valid atau sudah kedaluwarsa" });
  }

  await db
    .update(portalCustomersTable)
    .set({
      passwordHash: hashPassword(String(password)),
      resetPasswordToken: null,
      resetPasswordExpiry: null,
    })
    .where(eq(portalCustomersTable.id, customer.id));

  return res.json({ message: "Password berhasil diubah. Silakan login kembali." });
});

// GET /api/portal/auth/me
router.get("/auth/me", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  const serviceIds = await getServiceIds(customer.id);
  return res.json({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    role: customer.role,
    serviceIds,
    createdAt: customer.createdAt.toISOString(),
  });
});

// ── VENDOR PORTAL ─────────────────────────────────────────────────────────
// GET /api/portal/vendor/profile — returns linked supplier + RFQs + quotes for a vendor user
router.get("/vendor/profile", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
  if (!customer) return res.status(401).json({ message: "Tidak ditemukan" });

  // Try to find linked supplier by email or phone match
  const allSuppliers = await db.select().from(suppliersTable);
  const normalizePhone = (p: string | null) => p ? p.replace(/[^\d]/g, "").replace(/^0/, "62") : null;
  const customerPhone = normalizePhone(customer.phone);
  const linkedSupplier = allSuppliers.find(
    (s) =>
      (s.contactEmail && s.contactEmail.toLowerCase() === customer.email.toLowerCase()) ||
      (s.email && s.email.toLowerCase() === customer.email.toLowerCase()) ||
      (customerPhone && normalizePhone(s.phone) === customerPhone)
  ) ?? null;

  let rfqs: {
    id: number; rfqNumber: string; orderId: number; status: string;
    orderNumber: string; origin: string; destination: string; shipmentType: string;
    commodity: string | null; createdAt: string;
  }[] = [];
  let quotes: {
    id: number; rfqId: number; orderId: number; orderNumber: string;
    rfqNumber: string; vendorPrice: number; sellingPrice: number | null;
    estimatedPickup: string | null; estimatedDelivery: string | null;
    vendorNotes: string | null; quoteStatus: string; replySource: string | null;
    createdAt: string;
  }[] = [];

  if (linkedSupplier) {
    // All open/recent RFQs where this supplier is included
    const allRfqs = await db.select().from(logisticOrderRfqsTable)
      .orderBy(desc(logisticOrderRfqsTable.createdAt));
    const relevantRfqs = allRfqs.filter((r) =>
      (r.vendorIds as number[]).includes(linkedSupplier.id)
    ).slice(0, 20);

    if (relevantRfqs.length > 0) {
      const orderIds = [...new Set(relevantRfqs.map((r) => r.orderId))];
      const orders = await db.select().from(logisticOrdersTable).where(inArray(logisticOrdersTable.id, orderIds));
      const orderMap = Object.fromEntries(orders.map((o) => [o.id, o]));

      rfqs = relevantRfqs.map((r) => {
        const o = orderMap[r.orderId];
        return {
          id: r.id,
          rfqNumber: r.rfqNumber,
          orderId: r.orderId,
          status: r.status,
          orderNumber: o?.orderNumber ?? String(r.orderId),
          origin: o?.origin ?? "",
          destination: o?.destination ?? "",
          shipmentType: o?.shipmentType ?? "",
          commodity: o?.commodity ?? null,
          createdAt: r.createdAt.toISOString(),
        };
      });

      // Quotes submitted by this supplier
      const allQuotes = await db.select().from(logisticOrderQuotesTable)
        .where(eq(logisticOrderQuotesTable.vendorId, linkedSupplier.id))
        .orderBy(desc(logisticOrderQuotesTable.createdAt));

      const rfqMap = Object.fromEntries(relevantRfqs.map((r) => [r.id, r]));
      quotes = allQuotes.map((q) => {
        const rfq = rfqMap[q.rfqId];
        const order = orderMap[q.orderId];
        return {
          id: q.id,
          rfqId: q.rfqId,
          orderId: q.orderId,
          orderNumber: order?.orderNumber ?? String(q.orderId),
          rfqNumber: rfq?.rfqNumber ?? String(q.rfqId),
          vendorPrice: Number(q.vendorPrice),
          sellingPrice: q.sellingPrice != null ? Number(q.sellingPrice) : null,
          estimatedPickup: q.estimatedPickup,
          estimatedDelivery: q.estimatedDelivery,
          vendorNotes: q.vendorNotes,
          quoteStatus: q.quoteStatus,
          replySource: q.replySource,
          createdAt: q.createdAt.toISOString(),
        };
      });
    }
  }

  return res.json({
    portalCustomer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      company: customer.company,
      role: customer.role,
    },
    supplier: linkedSupplier ? {
      id: linkedSupplier.id,
      name: linkedSupplier.name,
      phone: linkedSupplier.phone,
      contactEmail: linkedSupplier.contactEmail,
      serviceType: linkedSupplier.serviceType,
      isActive: linkedSupplier.isActive,
    } : null,
    rfqs,
    quotes,
  });
});

// POST /api/portal/vendor/quotes — submit or update a quote for an open RFQ
router.post("/vendor/quotes", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
  if (!customer) return res.status(401).json({ message: "Tidak ditemukan" });

  const { rfqId, vendorPrice, estimatedPickup, estimatedDelivery, estimatedDays, vendorNotes } = req.body as {
    rfqId: number; vendorPrice: number; estimatedPickup?: string; estimatedDelivery?: string;
    estimatedDays?: number; vendorNotes?: string;
  };
  if (!rfqId || !vendorPrice || Number(vendorPrice) <= 0) {
    return res.status(400).json({ message: "rfqId dan vendorPrice wajib diisi" });
  }

  // Resolve linked supplier
  const allSuppliers = await db.select().from(suppliersTable);
  const normalizePhone = (p: string | null) => p ? p.replace(/[^\d]/g, "").replace(/^0/, "62") : null;
  const customerPhone = normalizePhone(customer.phone);
  const linkedSupplier = allSuppliers.find(
    (s) =>
      (s.contactEmail && s.contactEmail.toLowerCase() === customer.email.toLowerCase()) ||
      (s.email && s.email.toLowerCase() === customer.email.toLowerCase()) ||
      (customerPhone && normalizePhone(s.phone) === customerPhone)
  ) ?? null;
  if (!linkedSupplier) return res.status(403).json({ message: "Akun belum terhubung ke data vendor" });

  // Validate RFQ exists and includes this supplier
  const [rfq] = await db.select().from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.id, rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });
  if (!(rfq.vendorIds as number[]).includes(linkedSupplier.id)) {
    return res.status(403).json({ message: "RFQ ini bukan untuk vendor Anda" });
  }
  if (rfq.status !== "open") {
    return res.status(400).json({ message: "RFQ sudah tidak open" });
  }

  // Upsert: update existing quote or insert new one
  const [existing] = await db.select().from(logisticOrderQuotesTable)
    .where(and(eq(logisticOrderQuotesTable.rfqId, rfqId), eq(logisticOrderQuotesTable.vendorId, linkedSupplier.id)));

  const now = new Date();
  if (existing) {
    await db.update(logisticOrderQuotesTable).set({
      vendorPrice: String(vendorPrice),
      estimatedPickup: estimatedPickup ?? null,
      estimatedDelivery: estimatedDelivery ?? null,
      estimatedDays: estimatedDays ?? null,
      vendorNotes: vendorNotes ?? null,
      replySource: "portal",
      replyTimestamp: now,
    }).where(eq(logisticOrderQuotesTable.id, existing.id));
    return res.json({ success: true, quoteId: existing.id, action: "updated" });
  } else {
    const [inserted] = await db.insert(logisticOrderQuotesTable).values({
      rfqId,
      orderId: rfq.orderId,
      vendorId: linkedSupplier.id,
      vendorPrice: String(vendorPrice),
      estimatedPickup: estimatedPickup ?? null,
      estimatedDelivery: estimatedDelivery ?? null,
      estimatedDays: estimatedDays ?? null,
      vendorNotes: vendorNotes ?? null,
      markupType: "percentage",
      markupPercentage: "0",
      quoteStatus: "pending",
      replySource: "portal",
      replyTimestamp: now,
    }).returning();
    return res.json({ success: true, quoteId: inserted.id, action: "created" });
  }
});

// ── PORTAL CONTENT (Public) ───────────────────────────────────────────────
// GET /api/portal/content
router.get("/content", async (_req, res) => {
  const rows = await db.select().from(portalContentTable);
  const content: Record<string, string> = {};
  for (const r of rows) content[r.key] = r.value;
  return res.json(content);
});

// ── PORTAL ADMIN ENDPOINTS ─────────────────────────────────────────────────
const PORTAL_ADMIN_KEY = process.env.PORTAL_ADMIN_KEY ?? "";

// POST /api/portal/admin/claim  — claim admin role using secret key
router.post("/admin/claim", requirePortalAuth, async (req, res) => {
  const { key } = req.body ?? {};
  if (!PORTAL_ADMIN_KEY || String(key) !== PORTAL_ADMIN_KEY) {
    return res.status(403).json({ message: "Kunci admin tidak valid" });
  }
  const customerId = (req as PortalAuthReq).portalCustomerId;
  await db.update(portalCustomersTable).set({ role: "admin" }).where(eq(portalCustomersTable.id, customerId));
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
  const token = signToken({ customerId: customer!.id, role: "admin" });
  return res.json({ token, role: "admin" });
});

// PUT /api/portal/admin/content  — update CMS content (admin only)
router.put("/admin/content", requirePortalAdmin, async (req, res) => {
  const updates = req.body as Record<string, string>;
  if (!updates || typeof updates !== "object") {
    return res.status(400).json({ message: "Body harus berupa objek key-value" });
  }
  for (const [key, value] of Object.entries(updates)) {
    await db
      .insert(portalContentTable)
      .values({ key, value: String(value), updatedAt: new Date() })
      .onConflictDoUpdate({ target: portalContentTable.key, set: { value: String(value), updatedAt: new Date() } });
  }
  return res.json({ ok: true });
});

function sanitizeText(val: unknown): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s === "" || s === "null" ? null : s;
}

// PUT /api/portal/admin/services/:id  — update service (admin only)
router.put("/admin/services/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, description, price, imageUrl } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = sanitizeText(description);
  if (price !== undefined) updates.price = parseFloat(String(price)).toFixed(2);
  if (imageUrl !== undefined) updates.imageUrl = sanitizeText(imageUrl);
  if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Tidak ada field yang diubah" });
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  return res.json(updated);
});

// POST /api/portal/admin/services — tambah jasa baru (JWT admin)
router.post("/admin/services", requirePortalAdmin, async (req, res) => {
  const { name, description, price, imageUrl, subcategory, unit } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Nama layanan harus diisi" });
  }
  const parsedPrice = price !== undefined ? parseFloat(String(price)) : 0;
  const year = new Date().getFullYear();
  const [maxRow] = await db.select({ maxId: sql<number>`COALESCE(MAX(id), 0)` }).from(productsTable);
  const nextId = (Number(maxRow?.maxId ?? 0) + 1);
  const autoSku = `SVC-${year}-${String(nextId).padStart(4, "0")}`;
  const [created] = await db.insert(productsTable).values({
    name: name.trim(),
    sku: autoSku,
    description: description ? String(description).trim() : null,
    price: parsedPrice.toFixed(2),
    imageUrl: imageUrl ? String(imageUrl).trim() : null,
    mediaItems: "[]",
    itemType: "jasa",
    unit: unit ? String(unit) : "pcs",
    subcategory: subcategory ? String(subcategory) : null,
    isActive: true,
  }).returning();
  return res.status(201).json(created);
});

// DELETE /api/portal/admin/services/:id — hapus jasa (JWT admin)
router.delete("/admin/services/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ ok: true });
});

// POST /api/portal/admin/products  — create a new product (admin only)
router.post("/admin/products", requirePortalAdmin, async (req, res) => {
  const { name, description, price, imageUrl, mediaItems, unit, unitOptions } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ message: "Nama produk harus diisi" });
  }
  const parsedPrice = price !== undefined ? parseFloat(String(price)) : 0;
  const year = new Date().getFullYear();
  const [maxRow] = await db
    .select({ maxId: sql<number>`COALESCE(MAX(id), 0)` })
    .from(productsTable);
  const nextId = (Number(maxRow?.maxId ?? 0) + 1);
  const autoSku = `PRD-${year}-${String(nextId).padStart(4, "0")}`;
  const [created] = await db
    .insert(productsTable)
    .values({
      name: name.trim(),
      sku: autoSku,
      description: description ? String(description).trim() : null,
      price: parsedPrice.toFixed(2),
      imageUrl: imageUrl ? String(imageUrl).trim() : null,
      mediaItems: mediaItems ? JSON.stringify(mediaItems) : "[]",
      itemType: "barang",
      unit: unit ? String(unit).trim() : "pcs",
      unitOptions: Array.isArray(unitOptions) ? JSON.stringify(unitOptions) : (unitOptions ? JSON.stringify(String(unitOptions).split(",").map((s: string) => s.trim()).filter(Boolean)) : "[]"),
      isActive: true,
    })
    .returning();
  return res.status(201).json(created);
});

// PUT /api/portal/admin/products/:id  — update product (admin only)
router.put("/admin/products/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, description, price, stock, imageUrl, mediaItems, unit, unitOptions } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = sanitizeText(description);
  if (price !== undefined) updates.price = parseFloat(String(price)).toFixed(2);
  if (stock !== undefined) updates.stock = Math.max(0, parseInt(String(stock), 10) || 0);
  if (imageUrl !== undefined) updates.imageUrl = sanitizeText(imageUrl);
  if (mediaItems !== undefined) updates.mediaItems = JSON.stringify(mediaItems);
  if (unit !== undefined) updates.unit = String(unit).trim() || "pcs";
  if (unitOptions !== undefined) {
    updates.unitOptions = Array.isArray(unitOptions)
      ? JSON.stringify(unitOptions)
      : JSON.stringify(String(unitOptions).split(",").map((s: string) => s.trim()).filter(Boolean));
  }
  if (Object.keys(updates).length === 0) return res.status(400).json({ message: "Tidak ada field yang diubah" });
  const [updated] = await db.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning();
  return res.json(updated);
});

// DELETE /api/portal/admin/products/:id — hapus produk (admin only)
router.delete("/admin/products/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ ok: true });
});

// POST /api/portal/admin/upload-url  — get presigned upload URL (admin only)
const _objectStorage = new ObjectStorageService();
router.post("/admin/upload-url", requirePortalAdmin, async (req, res) => {
  const { contentType } = req.body ?? {};
  if (!contentType) return res.status(400).json({ message: "contentType wajib diisi" });
  if (!contentType.startsWith("image/") && !contentType.startsWith("video/"))
    return res.status(415).json({ message: "Hanya file gambar atau video yang diizinkan" });
  try {
    const uploadURL = await _objectStorage.getObjectEntityUploadURL();
    const objectPath = _objectStorage.normalizeObjectEntityPath(uploadURL);
    return res.json({ uploadURL, objectPath });
  } catch (_err) {
    return res.status(500).json({ message: "Gagal membuat URL upload" });
  }
});

// POST /api/portal/order-upload-url  — get presigned URL for order document uploads (customer auth)
router.post("/order-upload-url", requirePortalAuth, async (req, res) => {
  const { contentType } = req.body ?? {};
  if (!contentType) return res.status(400).json({ message: "contentType wajib diisi" });
  const allowed = ["application/pdf", "image/jpeg", "image/png", "image/webp", "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  if (!allowed.includes(contentType) && !contentType.startsWith("image/"))
    return res.status(415).json({ message: "Tipe file tidak diizinkan" });
  try {
    const uploadURL = await _objectStorage.getObjectEntityUploadURL();
    const objectPath = _objectStorage.normalizeObjectEntityPath(uploadURL);
    return res.json({ uploadURL, objectPath });
  } catch (_err) {
    return res.status(500).json({ message: "Gagal membuat URL upload" });
  }
});

// Shared helper: find or create CRM customer by email
async function findOrCreateCrmCustomer(portalCustomer: { name: string; email: string; phone: string | null; company: string | null }) {
  const [existing] = await db.select().from(customersTable).where(eq(customersTable.email, portalCustomer.email));
  if (existing) return existing;
  const [created] = await db.insert(customersTable).values({
    name: portalCustomer.company ? `${portalCustomer.name} (${portalCustomer.company})` : portalCustomer.name,
    email: portalCustomer.email,
    phone: portalCustomer.phone,
  }).returning();
  return created!;
}

// Generate portal order number: PO/YYYY/NNNNN
async function nextPortalOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `PO/${year}/%`;
  const [row] = await db
    .select({ maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(doc_number, '/', 3) AS int)), 0)` })
    .from(salesDocumentsTable)
    .where(sql`doc_number LIKE ${pattern}`);
  const seq = (Number(row?.maxSeq ?? 0) + 1).toString().padStart(5, "0");
  return `PO/${year}/${seq}`;
}

// GET /api/portal/orders  — returns sales orders linked to the portal customer via email → customers table
router.get("/orders", requirePortalAuth, async (req, res) => {
  const portalCustId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, portalCustId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  const [crmCustomer] = await db.select().from(customersTable).where(eq(customersTable.email, customer.email));
  if (!crmCustomer) return res.json([]);
  const orders = await db
    .select()
    .from(salesDocumentsTable)
    .where(eq(salesDocumentsTable.customerId, crmCustomer.id));
  return res.json(
    orders.map((o) => ({
      id: o.id,
      docNumber: o.docNumber,
      status: o.status,
      grandTotal: Number(o.grandTotal ?? 0),
      createdAt: o.createdAt.toISOString(),
    }))
  );
});

// GET /api/portal/logistic-orders — returns logistic orders for the authenticated portal customer (by email)
router.get("/logistic-orders", requirePortalAuth, async (req, res) => {
  const portalCustId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, portalCustId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  const orders = await db
    .select()
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.email, customer.email))
    .orderBy(sql`${logisticOrdersTable.createdAt} DESC`);
  return res.json(
    orders.map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      grandTotal: parseFloat(o.grandTotal),
      createdAt: o.createdAt.toISOString(),
      shipmentType: o.shipmentType,
      origin: o.origin,
      destination: o.destination,
    }))
  );
});

// POST /api/portal/orders  — place a new order from the portal
router.post("/orders", requirePortalAuth, async (req, res) => {
  const portalCustId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const [portalCustomer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, portalCustId));
  if (!portalCustomer) return res.status(401).json({ message: "Customer not found" });

  const { items, notes, expectedDate, paymentType } = req.body ?? {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Pesanan harus memiliki minimal satu item" });
  }

  type OrderItem = { productId?: number; name: string; quantity: number; unitPrice: number };
  const orderItems = items as OrderItem[];

  // Validate items
  for (const item of orderItems) {
    if (!item.name || typeof item.quantity !== "number" || item.quantity <= 0) {
      return res.status(400).json({ message: "Setiap item harus memiliki nama dan jumlah yang valid" });
    }
  }

  // Find or create CRM customer
  const crmCustomer = await findOrCreateCrmCustomer(portalCustomer);

  // Generate doc number
  const docNumber = await nextPortalOrderNumber();

  // Calculate totals
  const totalAmount = orderItems.reduce((sum, item) => sum + item.quantity * (item.unitPrice ?? 0), 0);

  // Create sales document
  const [doc] = await db
    .insert(salesDocumentsTable)
    .values({
      docNumber,
      kind: "order",
      status: "draft",
      customerId: crmCustomer.id,
      customerName: crmCustomer.name,
      totalAmount: totalAmount.toFixed(2),
      grandTotal: totalAmount.toFixed(2),
      taxAmount: "0",
      notes: notes ? String(notes) : null,
      expectedDate: expectedDate ? new Date(String(expectedDate)) : null,
      paymentType: paymentType ? String(paymentType) : null,
      createdById: `portal:${portalCustomer.id}`,
    })
    .returning();

  // Create lines
  if (doc) {
    await db.insert(salesDocumentLinesTable).values(
      orderItems.map((item) => ({
        documentId: doc.id,
        productId: item.productId ?? null,
        name: item.name,
        quantity: item.quantity.toFixed(2),
        unitPrice: (item.unitPrice ?? 0).toFixed(2),
        subtotal: (item.quantity * (item.unitPrice ?? 0)).toFixed(2),
      }))
    );
  }

  const totalFmt = Number(doc!.grandTotal ?? 0).toLocaleString("id-ID");
  const itemList = orderItems.map((i) => `• ${i.name} (${i.quantity}x)`).join("\n");

  // Notify customer via WhatsApp (fire-and-forget)
  if (portalCustomer.phone) {
    const customerMsg =
      `🎉 *Pesanan Diterima!*\n` +
      `No. Pesanan: *${doc!.docNumber}*\n\n` +
      `Halo ${portalCustomer.name},\n` +
      `Pesanan Anda telah kami terima dan sedang diproses.\n\n` +
      `🛒 *Detail Pesanan:*\n` +
      `${itemList}\n` +
      `Total: Rp ${totalFmt}\n\n` +
      `Tim kami akan segera menghubungi Anda untuk konfirmasi lebih lanjut.\n` +
      `Terima kasih telah menggunakan layanan CST Logistics. 🚢`;
    sendWhatsApp(portalCustomer.phone, customerMsg).catch((err: unknown) => {
      req.log.error({ err, phone: portalCustomer.phone }, "sendWhatsApp to customer failed (portal order)");
    });
  }

  // Notify admin via WhatsApp (fire-and-forget)
  getAdminWa().then((adminWa) => {
    if (!adminWa) return;
    const msg =
      `🛒 *Order Portal Baru*\n` +
      `No: ${doc!.docNumber}\n` +
      `Customer: ${portalCustomer.name}${portalCustomer.company ? ` (${portalCustomer.company})` : ""}\n` +
      `Email: ${portalCustomer.email}\n` +
      `Total: Rp ${totalFmt}\n` +
      `Item: ${orderItems.length} produk/jasa`;
    return sendWhatsApp(adminWa, msg);
  }).catch(() => undefined);

  return res.status(201).json({
    id: doc!.id,
    docNumber: doc!.docNumber,
    status: doc!.status,
    grandTotal: Number(doc!.grandTotal),
    createdAt: doc!.createdAt.toISOString(),
  });
});

// PATCH /api/portal/orders/:id/cancel — cancel a portal sales order (owning customer only)
router.patch("/orders/:id/cancel", requirePortalAuth, async (req, res) => {
  const portalCustId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const id = Number(req.params.id);
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, portalCustId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  const [crmCustomer] = await db.select().from(customersTable).where(eq(customersTable.email, customer.email));
  if (!crmCustomer) return res.status(403).json({ message: "Forbidden" });
  const [doc] = await db
    .select()
    .from(salesDocumentsTable)
    .where(and(eq(salesDocumentsTable.id, id), eq(salesDocumentsTable.customerId, crmCustomer.id)));
  if (!doc) return res.status(404).json({ message: "Order not found" });
  if (doc.status === "cancelled" || doc.status === "done") {
    return res.status(400).json({ message: "Order cannot be cancelled" });
  }
  const [updated] = await db
    .update(salesDocumentsTable)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(salesDocumentsTable.id, id))
    .returning();
  return res.json({
    id: updated.id,
    docNumber: updated.docNumber,
    status: updated.status,
    grandTotal: Number(updated.grandTotal ?? 0),
    createdAt: updated.createdAt.toISOString(),
  });
});

// PATCH /api/portal/logistic-orders/:id/cancel — cancel a portal logistic order (owning customer only)
router.patch("/logistic-orders/:id/cancel", requirePortalAuth, async (req, res) => {
  const portalCustId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const id = Number(req.params.id);
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, portalCustId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  const [order] = await db
    .select()
    .from(logisticOrdersTable)
    .where(and(eq(logisticOrdersTable.id, id), eq(logisticOrdersTable.email, customer.email)));
  if (!order) return res.status(404).json({ message: "Order not found" });
  if (order.status === "Cancelled" || order.status === "Completed") {
    return res.status(400).json({ message: "Order cannot be cancelled" });
  }
  const [updated] = await db
    .update(logisticOrdersTable)
    .set({ status: "Cancelled" })
    .where(eq(logisticOrdersTable.id, id))
    .returning();
  return res.json({
    id: updated.id,
    orderNumber: updated.orderNumber,
    status: updated.status,
    grandTotal: parseFloat(updated.grandTotal),
    createdAt: updated.createdAt.toISOString(),
    shipmentType: updated.shipmentType,
    origin: updated.origin,
    destination: updated.destination,
  });
});

// ── Delivery Vendors ────────────────────────────────────────────────────────

const DEFAULT_VENDORS = [
  { name: "JNE REG",       logo: "📦", eta: "2-3 hari",  fee: "15000", note: null, sortOrder: 1 },
  { name: "JNE YES",       logo: "⚡", eta: "1 hari",    fee: "35000", note: null, sortOrder: 2 },
  { name: "J&T Express",   logo: "📫", eta: "2-3 hari",  fee: "14000", note: null, sortOrder: 3 },
  { name: "SiCepat REG",   logo: "🚀", eta: "2-3 hari",  fee: "13000", note: null, sortOrder: 4 },
  { name: "AnterAja",      logo: "🏃", eta: "2-4 hari",  fee: "12000", note: null, sortOrder: 5 },
  { name: "Pos Indonesia", logo: "📮", eta: "3-5 hari",  fee: "10000", note: null, sortOrder: 6 },
  { name: "GoSend",        logo: "🛵", eta: "Same day",  fee: "25000", note: null, sortOrder: 7 },
  { name: "Grab Express",  logo: "🟢", eta: "Same day",  fee: "28000", note: null, sortOrder: 8 },
  { name: "CST Logistics", logo: "🚢", eta: "1-2 hari",  fee: "0",     note: "Harga nego", sortOrder: 9 },
];

async function ensureDefaultVendors() {
  const [existing] = await db.select({ id: suppliersTable.id }).from(suppliersTable)
    .where(eq(suppliersTable.name, "JNE REG")).limit(1);
  if (!existing) {
    await db.insert(suppliersTable).values(
      DEFAULT_VENDORS.map((v) => ({ ...v, isActive: true }))
    );
  }
}

function toVendorResponse(v: typeof suppliersTable.$inferSelect) {
  return {
    id: v.id,
    name: v.name,
    logo: v.logo,
    eta: v.eta,
    fee: Number(v.fee ?? 0),
    note: v.note,
    isActive: v.isActive,
    sortOrder: v.sortOrder,
    phone: v.phone ?? null,
    email: v.contactEmail ?? null,
    serviceType: v.serviceType ?? null,
  };
}

// GET /api/portal/delivery-vendors — public: return active vendors (sorted)
router.get("/delivery-vendors", async (_req, res) => {
  await ensureDefaultVendors();
  const vendors = await db
    .select()
    .from(suppliersTable)
    .where(eq(suppliersTable.isActive, true))
    .orderBy(suppliersTable.sortOrder, suppliersTable.id);
  return res.json(vendors.map(toVendorResponse));
});

// GET /api/portal/admin/delivery-vendors — admin: return ALL vendors
router.get("/admin/delivery-vendors", requirePortalAdmin, async (_req, res) => {
  await ensureDefaultVendors();
  const vendors = await db
    .select()
    .from(suppliersTable)
    .orderBy(suppliersTable.sortOrder, suppliersTable.id);
  return res.json(vendors.map(toVendorResponse));
});

// POST /api/portal/admin/delivery-vendors — create vendor
router.post("/admin/delivery-vendors", requirePortalAdmin, async (req, res) => {
  const { name, logo, eta, fee, note, phone, email, serviceType } = req.body ?? {};
  if (!name || typeof name !== "string" || !name.trim())
    return res.status(400).json({ message: "Nama vendor harus diisi" });
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` })
    .from(suppliersTable);
  const nextSort = Number(maxRow?.max ?? 0) + 1;
  const [created] = await db.insert(suppliersTable).values({
    name: name.trim(),
    logo: logo ? String(logo).trim() : "📦",
    eta: eta ? String(eta).trim() : "2-3 hari",
    fee: fee !== undefined ? String(parseFloat(String(fee)) || 0) : "0",
    note: note ? String(note).trim() : null,
    isActive: true,
    sortOrder: nextSort,
    phone: phone ? String(phone).trim() : null,
    contactEmail: email ? String(email).trim() : null,
    serviceType: serviceType ? String(serviceType).trim() : null,
  }).returning();
  return res.status(201).json(toVendorResponse(created));
});

// PUT /api/portal/admin/delivery-vendors/:id — update vendor
router.put("/admin/delivery-vendors/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, logo, eta, fee, note, isActive, sortOrder, phone, email, serviceType } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name).trim();
  if (logo !== undefined) updates.logo = String(logo).trim();
  if (eta !== undefined) updates.eta = String(eta).trim();
  if (fee !== undefined) updates.fee = String(parseFloat(String(fee)) || 0);
  if (note !== undefined) updates.note = note ? String(note).trim() : null;
  if (isActive !== undefined) updates.isActive = Boolean(isActive);
  if (sortOrder !== undefined) updates.sortOrder = parseInt(String(sortOrder)) || 0;
  if (phone !== undefined) updates.phone = phone ? String(phone).trim() : null;
  if (email !== undefined) updates.contactEmail = email ? String(email).trim() : null;
  if (serviceType !== undefined) updates.serviceType = serviceType ? String(serviceType).trim() : null;
  if (Object.keys(updates).length === 0)
    return res.status(400).json({ message: "Tidak ada field yang diubah" });
  const [updated] = await db.update(suppliersTable).set(updates).where(eq(suppliersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Vendor tidak ditemukan" });
  return res.json(toVendorResponse(updated));
});

// DELETE /api/portal/admin/delivery-vendors/:id — delete vendor
router.delete("/admin/delivery-vendors/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  await db.delete(suppliersTable).where(eq(suppliersTable.id, id));
  return res.json({ ok: true });
});

// ---- Pricing Rates (Trucking & Freight) ----
const TRUCKING_RATES_KEY = "logistic_trucking_rates";
const FREIGHT_RATES_KEY  = "logistic_freight_rates";

const DEFAULT_TRUCKING_RATES: Record<string, { ratePerKm: number; loadingFee: number }> = {
  CDE:     { ratePerKm: 5000,  loadingFee: 500000 },
  CDD:     { ratePerKm: 7000,  loadingFee: 700000 },
  Fuso:    { ratePerKm: 10000, loadingFee: 1000000 },
  Wingbox: { ratePerKm: 12000, loadingFee: 1200000 },
  Trailer: { ratePerKm: 15000, loadingFee: 1500000 },
};

const DEFAULT_FREIGHT_RATES = {
  seaLcl:          { ratePerCbm: 250000,  label: "Sea Freight LCL (per CBM)" },
  seaFcl20:        { flatRate: 8000000,   label: "Sea Freight FCL 20ft" },
  seaFcl40:        { flatRate: 14000000,  label: "Sea Freight FCL 40ft" },
  air:             { ratePerKg: 50000,    label: "Air Freight (per kg)" },
  customClearance: { flatRate: 2500000,   label: "Custom Clearance" },
};

async function getPricingKey<T>(key: string, def: T): Promise<T> {
  const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, key));
  if (!row) return def;
  try { return JSON.parse(row.value) as T; } catch { return def; }
}

async function setPricingKey(key: string, value: unknown) {
  const json = JSON.stringify(value);
  const existing = await db.select().from(portalContentTable).where(eq(portalContentTable.key, key));
  if (existing.length > 0) {
    await db.update(portalContentTable).set({ value: json }).where(eq(portalContentTable.key, key));
  } else {
    await db.insert(portalContentTable).values({ key, value: json });
  }
}

// GET /api/portal/trucking-rates — public
router.get("/trucking-rates", async (_req, res) => {
  const rates = await getPricingKey(TRUCKING_RATES_KEY, DEFAULT_TRUCKING_RATES);
  return res.json(rates);
});

// GET /api/portal/admin/trucking-rates
router.get("/admin/trucking-rates", requirePortalAdmin, async (_req, res) => {
  const rates = await getPricingKey(TRUCKING_RATES_KEY, DEFAULT_TRUCKING_RATES);
  return res.json(rates);
});

// PUT /api/portal/admin/trucking-rates
router.put("/admin/trucking-rates", requirePortalAdmin, async (req, res) => {
  const rates = req.body as Record<string, { ratePerKm: number; loadingFee: number }>;
  if (!rates || typeof rates !== "object") return res.status(400).json({ message: "Format tidak valid" });
  await setPricingKey(TRUCKING_RATES_KEY, rates);
  return res.json({ ok: true });
});

// GET /api/portal/admin/freight-rates
router.get("/admin/freight-rates", requirePortalAdmin, async (_req, res) => {
  const rates = await getPricingKey(FREIGHT_RATES_KEY, DEFAULT_FREIGHT_RATES);
  return res.json(rates);
});

// PUT /api/portal/admin/freight-rates
router.put("/admin/freight-rates", requirePortalAdmin, async (req, res) => {
  if (!req.body || typeof req.body !== "object") return res.status(400).json({ message: "Format tidak valid" });
  await setPricingKey(FREIGHT_RATES_KEY, req.body);
  return res.json({ ok: true });
});

// POST /api/portal/admin/fix-jasa-names — one-time: strip 'Jasa ' prefix from product names
router.post("/admin/fix-jasa-names", async (req, res) => {
  const key = req.headers["x-admin-key"];
  const adminKey = process.env.PORTAL_ADMIN_KEY ?? "";
  if (!adminKey || key !== adminKey) { res.status(401).json({ message: "Unauthorized" }); return; }
  const rows = await db
    .select({ id: productsTable.id, name: productsTable.name })
    .from(productsTable)
    .where(sql`${productsTable.name} ILIKE 'Jasa %'`);

  const updated: { id: number; oldName: string; newName: string }[] = [];
  for (const row of rows) {
    const newName = row.name.replace(/^Jasa\s+/i, "");
    await db.update(productsTable).set({ name: newName }).where(eq(productsTable.id, row.id));
    updated.push({ id: row.id, oldName: row.name, newName });
  }
  return res.json({ fixed: updated.length, items: updated });
});

// GET /api/portal/cargo-types — public, returns cargo type list
router.get("/cargo-types", async (_req, res) => {
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, "cargo_types"));
    const types = row ? JSON.parse(row.value) : ["Electronics", "Textiles", "Furniture", "Food & Beverage", "Chemicals", "Machinery", "Automotive Parts", "Medical Supplies", "Paper & Printing", "Raw Materials"];
    return res.json(types);
  } catch {
    return res.json(["Electronics", "Textiles", "Furniture", "Food & Beverage", "Chemicals"]);
  }
});

// GET /api/portal/calculator-rates — public, returns current calculator rates
router.get("/calculator-rates", async (_req, res) => {
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, "calculator_rates"));
    const rates = row ? JSON.parse(row.value) : {
      airFreight:  { baseCost: 500000,  ratePerKg: 90000,    handlingPct: 5, customsFee: 1200000 },
      seaFreight:  { baseCost: 750000,  ratePerCbm: 2500000, handlingPct: 5, customsFee: 1500000 },
      customs:     { baseCost: 1500000, ratePerKg: 5000,     handlingFee: 500000, customsPct: 0.5 },
      domestic:    { baseCost: 500000,  ratePerKg: 8500,     handlingPct: 5 },
      warehousing: { baseCost: 5000000, ratePerCbm: 2500000, handlingFee: 500000 },
    };
    return res.json(rates);
  } catch {
    return res.json({
      airFreight:  { baseCost: 500000,  ratePerKg: 90000,    handlingPct: 5, customsFee: 1200000 },
      seaFreight:  { baseCost: 750000,  ratePerCbm: 2500000, handlingPct: 5, customsFee: 1500000 },
      customs:     { baseCost: 1500000, ratePerKg: 5000,     handlingFee: 500000, customsPct: 0.5 },
      domestic:    { baseCost: 500000,  ratePerKg: 8500,     handlingPct: 5 },
      warehousing: { baseCost: 5000000, ratePerCbm: 2500000, handlingFee: 500000 },
    });
  }
});

export default router;
