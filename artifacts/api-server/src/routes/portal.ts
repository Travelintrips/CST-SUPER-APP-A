import { Router, type Request, type Response, type NextFunction } from "express";
import { db, productsTable, productCategoryMapTable, productCategoriesTable, portalCustomersTable, portalCustomerServicesTable, portalContentTable, accountingSettingsTable, salesDocumentsTable, salesDocumentLinesTable, customersTable, logisticOrdersTable, suppliersTable, logisticOrderRfqsTable, logisticOrderQuotesTable, quoteRequestsTable, userProfilesTable, identityDocumentsTable, ocrResultsTable, vendorProfilesTable, driverProfilesTable, employeeProfilesTable, onboardingApprovalsTable, waOtpCodesTable, trustedDevicesTable, vendorMiniFormLinksTable, vendorMiniFormSubmissionsTable } from "@workspace/db";
import { invalidateTokenCache, SERVICE_SCHEMAS } from "./vendorMiniForm";
import { eq, inArray, and, sql, desc, gte, lte, ilike, or } from "drizzle-orm";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { sendWhatsApp } from "../lib/fonnte";
import { getAdminWa } from "../lib/adminWa.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer";
import { requirePortalAuth, requirePortalAdmin, type PortalAuthReq } from "../lib/supabaseAuth";
import { requireClerkUser } from "../lib/requireAdmin";
import { broadcastToAdmins } from "../lib/sseManager";
import { saveAndBroadcast } from "../lib/notificationStore";
import multer from "multer";
import { randomUUID } from "crypto";
import { compressImageBuffer } from "../lib/imageCompress.js";
import bcrypt from "bcryptjs";
import { signPortalJwt } from "../lib/portalJwt.js";
import OpenAI from "openai";

const router = Router();

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

// ── In-memory cache for company settings (5 min TTL) ─────────────────────────
let _companyCache: { data: object; expiresAt: number } | null = null;
const COMPANY_TTL_MS = 5 * 60 * 1000;

// GET /api/portal/company
router.get("/company", async (_req, res) => {
  if (_companyCache && Date.now() < _companyCache.expiresAt) {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(_companyCache.data);
  }
  const [settings] = await db.select().from(accountingSettingsTable).limit(1);
  const adminWa = await getAdminWa();
  const data = {
    name: settings?.companyName ?? "PT. Cahaya Sejati Teknologi",
    tagline: "Solusi Logistik Terintegrasi & Berbasis Teknologi",
    logoUrl: settings?.companyLogoUrl ?? null,
    address: settings?.companyAddress ?? null,
    email: null,
    phone: adminWa || null,
  };
  _companyCache = { data, expiresAt: Date.now() + COMPANY_TTL_MS };
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
  return res.json(data);
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
      subcategory: p.subcategory ?? null,
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

// ── Routes khusus untuk /logistic-admin (auth: portal admin JWT) ─────────────
// Security: these routes previously checked x-admin-password against a hardcoded
// fallback of "admin123" which was also embedded in the customer portal JS bundle.
// All /logistic-admin/* routes now require requirePortalAdmin — a Supabase Bearer
// token that belongs to an email on the server-side PORTAL_ADMIN_EMAILS allowlist.
// No shared secret is shipped to the browser.

// GET /api/portal/logistic-admin/services — semua jasa (incl. inactive)
router.get("/logistic-admin/services", requirePortalAdmin, async (_req, res) => {
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
router.post("/logistic-admin/services", requirePortalAdmin, async (req, res) => {
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
router.put("/logistic-admin/services/:id", requirePortalAdmin, async (req, res) => {
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
router.delete("/logistic-admin/services/:id", requirePortalAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ ok: true });
});

// Emails yang otomatis mendapat role admin saat login (comma-separated)
const PORTAL_ADMIN_EMAILS = [
  "admcst001@gmail.com",
  "wangsamasindo@gmail.com",
  ...(process.env.PORTAL_ADMIN_EMAILS ?? "").split(","),
]
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

// POST /api/portal/auth/login — email/password login (non-Supabase)
router.post("/auth/login", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) {
    return res.status(400).json({ message: "Email dan password diperlukan." });
  }
  const [customer] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.email, String(email).toLowerCase().trim()));
  if (!customer || !customer.passwordHash) {
    return res.status(401).json({ message: "Email atau password salah." });
  }
  const valid = await bcrypt.compare(String(password), customer.passwordHash);
  if (!valid) {
    return res.status(401).json({ message: "Email atau password salah." });
  }
  const token = await signPortalJwt({
    sub: String(customer.id),
    email: customer.email,
    customerId: customer.id,
    role: customer.role,
  });
  return res.json({
    token,
    user: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      company: customer.company,
      role: customer.role,
    },
  });
});

// ─── WA OTP REGISTRATION ──────────────────────────────────────────────
function normalizePhoneID(raw: string): string {
  let p = String(raw).replace(/[^\d+]/g, "");
  if (p.startsWith("+")) p = p.slice(1);
  if (p.startsWith("0")) p = "62" + p.slice(1);
  if (!p.startsWith("62")) p = "62" + p;
  return p;
}

function genOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// POST /api/portal/auth/wa-otp/send — kirim OTP via WhatsApp
router.post("/auth/wa-otp/send", async (req, res) => {
  const isDev = process.env.NODE_ENV !== "production";
  const hasFonnte = !!process.env.FONNTE_TOKEN;

  const { phone } = req.body ?? {};
  if (!phone) return res.status(400).json({ message: "Nomor HP diperlukan." });
  const normalized = normalizePhoneID(String(phone));
  if (normalized.length < 10) return res.status(400).json({ message: "Nomor HP tidak valid." });

  // Rate limit: max 3 OTP per phone in last 10 minutes
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
  const recent = await db
    .select({ id: waOtpCodesTable.id })
    .from(waOtpCodesTable)
    .where(and(eq(waOtpCodesTable.phone, normalized), gte(waOtpCodesTable.createdAt, tenMinAgo)));
  if (recent.length >= 3) {
    return res.status(429).json({ message: "Terlalu banyak permintaan OTP. Coba lagi nanti." });
  }

  const code = genOtp();
  const codeHash = await bcrypt.hash(code, 10);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 menit

  await db.insert(waOtpCodesTable).values({
    phone: normalized,
    codeHash,
    purpose: "login",
    expiresAt,
  });

  if (hasFonnte) {
    try {
      await sendWhatsApp(
        normalized,
        `*Kode Verifikasi BizPortal*\n\nKode OTP Anda: *${code}*\n\nBerlaku 5 menit. Jangan bagikan kode ini ke siapapun.`
      );
    } catch (err) {
      req.log?.error({ err }, "wa-otp send failed");
      return res.status(500).json({ message: "Gagal mengirim OTP via WhatsApp." });
    }
    return res.json({ message: "OTP dikirim ke WhatsApp.", phone: normalized });
  }

  // Dev mode: Fonnte tidak dikonfigurasi — kembalikan kode langsung (jangan di production)
  if (isDev) {
    req.log?.warn({ normalized }, "wa-otp dev mode: FONNTE_TOKEN not set, returning _dev_code");
    return res.json({
      message: "Dev mode: OTP tidak dikirim via WA (FONNTE_TOKEN belum diset).",
      phone: normalized,
      _dev_code: code,
    });
  }

  return res.status(503).json({ message: "Layanan OTP WhatsApp belum dikonfigurasi. Hubungi admin." });
});

// POST /api/portal/auth/wa-otp/verify — verifikasi OTP, return verifyToken
router.post("/auth/wa-otp/verify", async (req, res) => {
  const { phone, code } = req.body ?? {};
  if (!phone || !code) return res.status(400).json({ message: "Nomor HP dan kode diperlukan." });
  const normalized = normalizePhoneID(String(phone));

  const [otp] = await db
    .select()
    .from(waOtpCodesTable)
    .where(and(eq(waOtpCodesTable.phone, normalized), eq(waOtpCodesTable.verified, false)))
    .orderBy(desc(waOtpCodesTable.createdAt))
    .limit(1);

  if (!otp) return res.status(400).json({ message: "OTP tidak ditemukan. Minta OTP baru." });
  if (otp.expiresAt < new Date()) return res.status(400).json({ message: "OTP kadaluarsa. Minta OTP baru." });
  if (otp.attempts >= 5) return res.status(429).json({ message: "Terlalu banyak percobaan. Minta OTP baru." });

  const valid = await bcrypt.compare(String(code), otp.codeHash);
  if (!valid) {
    await db.update(waOtpCodesTable).set({ attempts: otp.attempts + 1 }).where(eq(waOtpCodesTable.id, otp.id));
    return res.status(400).json({ message: "Kode OTP salah." });
  }

  const verifyToken = randomUUID();
  await db
    .update(waOtpCodesTable)
    .set({ verified: true, verifyToken, expiresAt: new Date(Date.now() + 15 * 60 * 1000) })
    .where(eq(waOtpCodesTable.id, otp.id));

  return res.json({ verifyToken, phone: normalized });
});

// POST /api/portal/auth/wa-register — lengkapi profil & buat akun
router.post("/auth/wa-register", async (req, res) => {
  const { verifyToken, name, role: requestedRole, company, serviceIds, email, rememberDays } = req.body ?? {};
  if (!verifyToken || !name) return res.status(400).json({ message: "Token verifikasi dan nama diperlukan." });

  const [otp] = await db
    .select()
    .from(waOtpCodesTable)
    .where(and(eq(waOtpCodesTable.verifyToken, String(verifyToken)), eq(waOtpCodesTable.verified, true)))
    .limit(1);

  if (!otp) return res.status(400).json({ message: "Token verifikasi tidak valid." });
  if (otp.expiresAt < new Date()) return res.status(400).json({ message: "Token kadaluarsa. Verifikasi ulang OTP." });

  const phone = otp.phone;
  const ALLOWED_ROLES = ["customer", "vendor"];
  const role = ALLOWED_ROLES.includes(String(requestedRole)) ? String(requestedRole) : "customer";

  // Cek apakah phone sudah terdaftar
  const [existingByPhone] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.phone, phone))
    .limit(1);
  if (existingByPhone) {
    return res.status(409).json({ message: "Nomor HP sudah terdaftar. Silakan login." });
  }

  const finalEmail = email ? String(email).toLowerCase().trim() : `${phone}@wa.local`;

  // Cek email duplicate jika user provide
  if (email) {
    const [existingEmail] = await db
      .select({ id: portalCustomersTable.id })
      .from(portalCustomersTable)
      .where(eq(portalCustomersTable.email, finalEmail))
      .limit(1);
    if (existingEmail) return res.status(409).json({ message: "Email sudah terdaftar." });
  }

  const [created] = await db
    .insert(portalCustomersTable)
    .values({
      name: String(name),
      email: finalEmail,
      passwordHash: "",
      phone,
      company: company ? String(company) : null,
      role,
    })
    .returning();

  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    await db
      .insert(portalCustomerServicesTable)
      .values((serviceIds as number[]).map((sid) => ({ customerId: created.id, serviceId: Number(sid) })))
      .onConflictDoNothing();
  }

  // Invalidate token
  await db.update(waOtpCodesTable).set({ verifyToken: null }).where(eq(waOtpCodesTable.id, otp.id));

  const token = await signPortalJwt({
    sub: String(created.id),
    email: created.email,
    customerId: created.id,
    role: created.role,
  });

  let deviceToken: string | undefined;
  const days = typeof rememberDays === "number" && rememberDays > 0 && rememberDays <= 90 ? rememberDays : null;
  if (days && created.phone) {
    deviceToken = randomUUID();
    const expiresAt = new Date(Date.now() + days * 86400_000);
    await db.insert(trustedDevicesTable).values({ phone: created.phone, deviceToken, expiresAt });
  }

  return res.status(201).json({
    token,
    deviceToken,
    user: {
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      company: created.company,
      role: created.role,
    },
  });
});

// POST /api/portal/auth/wa-login — login pakai phone + OTP
router.post("/auth/wa-login", async (req, res) => {
  const { verifyToken, rememberDays } = req.body ?? {};
  if (!verifyToken) return res.status(400).json({ message: "Token verifikasi diperlukan." });

  const [otp] = await db
    .select()
    .from(waOtpCodesTable)
    .where(and(eq(waOtpCodesTable.verifyToken, String(verifyToken)), eq(waOtpCodesTable.verified, true)))
    .limit(1);

  if (!otp) return res.status(400).json({ message: "Token verifikasi tidak valid." });
  if (otp.expiresAt < new Date()) return res.status(400).json({ message: "Token kadaluarsa." });

  const matches = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.phone, otp.phone))
    .limit(2);

  if (matches.length === 0) return res.status(404).json({ message: "Nomor HP belum terdaftar.", notRegistered: true, phone: otp.phone });
  if (matches.length > 1) {
    req.log?.error({ phone: otp.phone }, "wa-login: multiple accounts share phone — refusing login");
    return res.status(409).json({ message: "Akun ambigu untuk nomor ini. Hubungi admin." });
  }
  const user = matches[0];

  await db.update(waOtpCodesTable).set({ verifyToken: null }).where(eq(waOtpCodesTable.id, otp.id));

  const token = await signPortalJwt({
    sub: String(user.id),
    email: user.email,
    customerId: user.id,
    role: user.role,
  });

  let deviceToken: string | undefined;
  const days = typeof rememberDays === "number" && rememberDays > 0 && rememberDays <= 90 ? rememberDays : null;
  if (days) {
    deviceToken = randomUUID();
    const expiresAt = new Date(Date.now() + days * 86400_000);
    await db.insert(trustedDevicesTable).values({ phone: otp.phone, deviceToken, expiresAt });
  }

  return res.json({
    token,
    deviceToken,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      company: user.company,
      role: user.role,
    },
  });
});

// POST /api/portal/auth/wa-trusted-login — login tanpa OTP pakai device token tersimpan
router.post("/auth/wa-trusted-login", async (req, res) => {
  const { phone, deviceToken } = req.body ?? {};
  if (!phone || !deviceToken) return res.status(400).json({ message: "phone dan deviceToken diperlukan." });

  const [device] = await db
    .select()
    .from(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.deviceToken, String(deviceToken)), eq(trustedDevicesTable.phone, String(phone))))
    .limit(1);

  if (!device) return res.status(401).json({ message: "Perangkat tidak dikenali." });
  if (device.expiresAt < new Date()) {
    await db.delete(trustedDevicesTable).where(eq(trustedDevicesTable.id, device.id));
    return res.status(401).json({ message: "Sesi perangkat kadaluarsa.", expired: true });
  }

  const matches = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.phone, device.phone))
    .limit(2);

  if (matches.length !== 1) return res.status(401).json({ message: "Akun tidak ditemukan." });
  const user = matches[0];

  // Sliding expiry: perpanjang masa berlaku 30 hari dari sekarang
  const newExpiresAt = new Date(Date.now() + 30 * 86400_000);
  await db
    .update(trustedDevicesTable)
    .set({ expiresAt: newExpiresAt })
    .where(eq(trustedDevicesTable.id, device.id));

  const token = await signPortalJwt({
    sub: String(user.id),
    email: user.email,
    customerId: user.id,
    role: user.role,
  });

  return res.json({
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      company: user.company,
      role: user.role,
    },
  });
});

// GET /api/portal/auth/trusted-devices — daftar perangkat terpercaya milik user saat ini
router.get("/auth/trusted-devices", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const [customer] = await db
    .select({ phone: portalCustomersTable.phone })
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.id, customerId))
    .limit(1);
  if (!customer?.phone) return res.json([]);

  const devices = await db
    .select({
      id: trustedDevicesTable.id,
      createdAt: trustedDevicesTable.createdAt,
      expiresAt: trustedDevicesTable.expiresAt,
    })
    .from(trustedDevicesTable)
    .where(eq(trustedDevicesTable.phone, customer.phone))
    .orderBy(trustedDevicesTable.createdAt);

  return res.json(devices);
});

// DELETE /api/portal/auth/trusted-devices/:id — cabut perangkat terpercaya
router.delete("/auth/trusted-devices/:id", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const deviceId = parseInt(String(req.params.id), 10);
  if (isNaN(deviceId)) return res.status(400).json({ message: "ID tidak valid." });

  const [customer] = await db
    .select({ phone: portalCustomersTable.phone })
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.id, customerId))
    .limit(1);
  if (!customer?.phone) return res.status(404).json({ message: "User tidak ditemukan." });

  const [device] = await db
    .select({ id: trustedDevicesTable.id })
    .from(trustedDevicesTable)
    .where(and(eq(trustedDevicesTable.id, deviceId), eq(trustedDevicesTable.phone, customer.phone)))
    .limit(1);

  if (!device) return res.status(404).json({ message: "Perangkat tidak ditemukan." });

  await db.delete(trustedDevicesTable).where(eq(trustedDevicesTable.id, deviceId));
  return res.json({ message: "Perangkat berhasil dicabut." });
});

// DELETE /api/portal/auth/trusted-devices — cabut semua perangkat
router.delete("/auth/trusted-devices", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const [customer] = await db
    .select({ phone: portalCustomersTable.phone })
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.id, customerId))
    .limit(1);
  if (!customer?.phone) return res.status(404).json({ message: "User tidak ditemukan." });

  await db.delete(trustedDevicesTable).where(eq(trustedDevicesTable.phone, customer.phone));
  return res.json({ message: "Semua perangkat berhasil dicabut." });
});

// POST /api/portal/auth/signup — standalone register (non-Supabase)
router.post("/auth/signup", async (req, res) => {
  const { name, email, password, phone, company, role: requestedRole, serviceIds } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nama, email, dan password diperlukan." });
  }
  const emailLower = String(email).toLowerCase().trim();
  const [existing] = await db
    .select({ id: portalCustomersTable.id })
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.email, emailLower));
  if (existing) {
    return res.status(409).json({ message: "Email sudah terdaftar." });
  }
  const normalizedPhone = phone ? normalizePhoneID(String(phone)) : null;
  if (normalizedPhone) {
    const [phoneExisting] = await db
      .select({ id: portalCustomersTable.id })
      .from(portalCustomersTable)
      .where(eq(portalCustomersTable.phone, normalizedPhone));
    if (phoneExisting) return res.status(409).json({ message: "Nomor HP sudah terdaftar." });
  }
  const ALLOWED_ROLES = ["customer", "vendor"];
  const role = ALLOWED_ROLES.includes(String(requestedRole)) ? String(requestedRole) : "customer";
  const passwordHash = await bcrypt.hash(String(password), 12);
  const [created] = await db
    .insert(portalCustomersTable)
    .values({ name: String(name), email: emailLower, passwordHash, phone: normalizedPhone, company: company ? String(company) : null, role })
    .returning();
  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    await db.insert(portalCustomerServicesTable).values(
      (serviceIds as number[]).map((sid) => ({ customerId: created.id, serviceId: Number(sid) }))
    ).onConflictDoNothing();
  }
  const token = await signPortalJwt({
    sub: String(created.id),
    email: created.email,
    customerId: created.id,
    role: created.role,
  });
  return res.status(201).json({
    token,
    user: {
      id: created.id,
      name: created.name,
      email: created.email,
      phone: created.phone,
      company: created.company,
      role: created.role,
    },
  });
});

// POST /api/portal/auth/dev-login — hanya tersedia di non-production (dev & staging)
// Membuat/menemukan dev user dan mengembalikan signed dev token untuk testing tanpa Supabase.
router.post("/auth/dev-login", async (req, res) => {
  if (process.env.NODE_ENV === "production") {
    res.status(404).json({ message: "Not found" });
    return;
  }
  const { signDevToken } = await import("../lib/supabaseAuth.js");
  const { role } = req.body ?? {};
  const allowedRoles = ["customer", "admin", "vendor"] as const;
  type DevRole = typeof allowedRoles[number];
  const safeRole: DevRole = allowedRoles.includes(role) ? role : "customer";

  const devEmail = `dev-${safeRole}@dev.local`;
  const devName = `Dev ${safeRole.charAt(0).toUpperCase() + safeRole.slice(1)}`;

  let [customer] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.email, devEmail));

  if (!customer) {
    [customer] = await db
      .insert(portalCustomersTable)
      .values({ name: devName, email: devEmail, passwordHash: "", role: safeRole })
      .returning();
  } else if (customer.role !== safeRole) {
    [customer] = await db
      .update(portalCustomersTable)
      .set({ role: safeRole })
      .where(eq(portalCustomersTable.id, customer.id))
      .returning();
  }

  const token = signDevToken({
    id: customer.id,
    email: customer.email,
    role: customer.role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 hari
  });

  return res.json({
    token,
    profile: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      role: customer.role,
    },
  });
});

// POST /api/portal/auth/register — sync profil ke DB setelah supabase.auth.signUp
router.post("/auth/register", requirePortalAuth, async (req, res) => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const { name, phone, company, role: requestedRole, serviceIds } = req.body ?? {};

  const patch: Record<string, unknown> = {};
  if (name) patch.name = String(name);
  if (phone !== undefined) patch.phone = phone ? String(phone) : null;
  if (company !== undefined) patch.company = company ? String(company) : null;
  const ALLOWED_ROLES = ["customer", "vendor"];
  if (requestedRole && ALLOWED_ROLES.includes(String(requestedRole))) patch.role = String(requestedRole);

  if (Object.keys(patch).length > 0) {
    await db.update(portalCustomersTable).set(patch).where(eq(portalCustomersTable.id, customerId));
  }

  if (Array.isArray(serviceIds)) {
    await db.delete(portalCustomerServicesTable).where(eq(portalCustomerServicesTable.customerId, customerId));
    if (serviceIds.length > 0) {
      await db.insert(portalCustomerServicesTable).values(
        (serviceIds as number[]).map((sid) => ({ customerId, serviceId: Number(sid) }))
      ).onConflictDoNothing();
    }
  }

  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
  const finalServiceIds = await getServiceIds(customerId);
  return res.json({
    id: customer!.id,
    name: customer!.name,
    email: customer!.email,
    phone: customer!.phone,
    company: customer!.company,
    role: customer!.role,
    serviceIds: finalServiceIds,
  });
});

// POST /api/portal/auth/otp/request — kirim kode OTP ke email (passwordless login)
router.post("/auth/otp/request", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ message: "Email diperlukan." });
  const emailLower = String(email).toLowerCase().trim();

  let [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.email, emailLower));
  if (!customer) {
    const [created] = await db.insert(portalCustomersTable).values({
      name: emailLower.split("@")[0],
      email: emailLower,
      passwordHash: "",
      role: "customer",
    }).returning();
    customer = created;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiry = new Date(Date.now() + 10 * 60 * 1000);
  await db.update(portalCustomersTable)
    .set({ resetPasswordToken: `otp:${code}`, resetPasswordExpiry: expiry })
    .where(eq(portalCustomersTable.id, customer.id));

  const smtpOk = isSmtpConfigured();
  if (smtpOk) {
    try {
      await sendMail({
        to: emailLower,
        subject: "Kode Login CST Portal",
        html: `<p>Kode login Anda: <strong style="font-size:24px;letter-spacing:4px">${code}</strong></p><p>Berlaku 10 menit.</p>`,
        text: `Kode login Anda: ${code}\nBerlaku 10 menit.`,
      });
    } catch (err) {
      req.log?.warn({ err }, "OTP email failed");
    }
  }

  const isDev = process.env.NODE_ENV !== "production";
  return res.json({
    sent: smtpOk,
    ...(isDev ? { _dev_code: code } : {}),
    message: smtpOk ? "Kode OTP telah dikirim ke email Anda." : `Kode OTP: ${code} (SMTP tidak dikonfigurasi)`,
  });
});

// POST /api/portal/auth/otp/verify — verifikasi kode OTP dan login
router.post("/auth/otp/verify", async (req, res) => {
  const { email, code } = req.body ?? {};
  if (!email || !code) return res.status(400).json({ message: "Email dan kode diperlukan." });
  const emailLower = String(email).toLowerCase().trim();

  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.email, emailLower));
  if (!customer) return res.status(401).json({ message: "Email tidak terdaftar." });

  const stored = customer.resetPasswordToken;
  const expiry = customer.resetPasswordExpiry;
  if (!stored?.startsWith("otp:") || stored.slice(4) !== String(code).trim()) {
    return res.status(401).json({ message: "Kode OTP salah." });
  }
  if (!expiry || expiry < new Date()) {
    return res.status(401).json({ message: "Kode OTP sudah kadaluarsa." });
  }

  await db.update(portalCustomersTable)
    .set({ resetPasswordToken: null, resetPasswordExpiry: null })
    .where(eq(portalCustomersTable.id, customer.id));

  const token = await signPortalJwt({ sub: String(customer.id), email: customer.email, customerId: customer.id, role: customer.role });
  return res.json({
    token,
    user: { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone, company: customer.company, role: customer.role },
  });
});

// POST /api/portal/auth/forgot-password — deprecated, gunakan Supabase resetPasswordForEmail
router.post("/auth/forgot-password", (_req, res) => {
  res.status(410).json({ message: "Gunakan Supabase Auth resetPasswordForEmail dari frontend." });
});

// POST /api/portal/auth/reset-password — deprecated, gunakan Supabase updateUser
router.post("/auth/reset-password", (_req, res) => {
  res.status(410).json({ message: "Gunakan Supabase Auth updateUser dari frontend." });
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
// ── In-memory cache for portal content (5 min TTL) ───────────────────────────
let _contentCache: { data: Record<string, string>; expiresAt: number } | null = null;
const CONTENT_TTL_MS = 5 * 60 * 1000;

export function invalidateContentCache() {
  _contentCache = null;
}

// GET /api/portal/content
router.get("/content", async (_req, res) => {
  if (_contentCache && Date.now() < _contentCache.expiresAt) {
    res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
    return res.json(_contentCache.data);
  }
  const rows = await db.select().from(portalContentTable);
  const content: Record<string, string> = {};
  for (const r of rows) content[r.key] = r.value;
  _contentCache = { data: content, expiresAt: Date.now() + CONTENT_TTL_MS };
  res.setHeader("Cache-Control", "public, max-age=300, stale-while-revalidate=60");
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
  return res.json({ role: "admin" });
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
  _contentCache = null;
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
  const { name, description, price, imageUrl, mediaItems } = req.body ?? {};
  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = String(name);
  if (description !== undefined) updates.description = sanitizeText(description);
  if (price !== undefined) updates.price = parseFloat(String(price)).toFixed(2);
  if (imageUrl !== undefined) updates.imageUrl = sanitizeText(imageUrl);
  if (mediaItems !== undefined) updates.mediaItems = JSON.stringify(Array.isArray(mediaItems) ? mediaItems : []);
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

// GET /api/portal/admin/products  — semua produk aktif (admin only, semua item_type)
router.get("/admin/products", requirePortalAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(productsTable)
    .where(eq(productsTable.isActive, true))
    .orderBy(productsTable.id);
  const ids = rows.map((p) => p.id);
  const catMap = await getProductCategories(ids);
  return res.json(rows.map((p) => {
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
      itemType: p.itemType,
      categories: catMap[p.id] ?? [],
    };
  }));
});

// GET /api/portal/admin/product-categories
router.get("/admin/product-categories", requirePortalAdmin, async (_req, res) => {
  const cats = await db
    .select({ id: productCategoriesTable.id, name: productCategoriesTable.name })
    .from(productCategoriesTable)
    .orderBy(productCategoriesTable.name);
  return res.json(cats);
});

// POST /api/portal/admin/products  — create a new product (admin only)
router.post("/admin/products", requirePortalAdmin, async (req, res) => {
  const { name, description, price, imageUrl, mediaItems, unit, unitOptions, categories } = req.body ?? {};
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
  const catNames: string[] = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];
  const created = await db.transaction(async (tx) => {
    const [p] = await tx
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
    if (catNames.length > 0) {
      const validCats = await tx.select().from(productCategoriesTable).where(inArray(productCategoriesTable.name, catNames));
      if (validCats.length > 0) {
        await tx.insert(productCategoryMapTable).values(validCats.map((c) => ({ productId: p.id, categoryId: c.id })));
      }
    }
    return { ...p, categories: catNames };
  });
  return res.status(201).json(created);
});

// PUT /api/portal/admin/products/:id  — update product (admin only)
router.put("/admin/products/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, description, price, stock, imageUrl, mediaItems, unit, unitOptions, categories } = req.body ?? {};
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
  const catNames: string[] = Array.isArray(categories) ? categories.map(String).filter(Boolean) : [];
  const hasProductUpdates = Object.keys(updates).length > 0;
  const hasCategoryUpdate = categories !== undefined;
  if (!hasProductUpdates && !hasCategoryUpdate) return res.status(400).json({ message: "Tidak ada field yang diubah" });
  const result = await db.transaction(async (tx) => {
    let updated = hasProductUpdates
      ? (await tx.update(productsTable).set(updates).where(eq(productsTable.id, id)).returning())[0]
      : (await tx.select().from(productsTable).where(eq(productsTable.id, id)))[0];
    if (hasCategoryUpdate) {
      await tx.delete(productCategoryMapTable).where(eq(productCategoryMapTable.productId, id));
      if (catNames.length > 0) {
        const validCats = await tx.select().from(productCategoriesTable).where(inArray(productCategoriesTable.name, catNames));
        if (validCats.length > 0) {
          await tx.insert(productCategoryMapTable).values(validCats.map((c) => ({ productId: id, categoryId: c.id })));
        }
      }
    }
    const catMap = await getProductCategories([id]);
    return { ...updated, categories: catMap[id] ?? [] };
  });
  return res.json(result);
});

// DELETE /api/portal/admin/products/:id — hapus produk (admin only)
router.delete("/admin/products/:id", requirePortalAdmin, async (req, res) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  await db.delete(productsTable).where(eq(productsTable.id, id));
  return res.json({ ok: true });
});

// POST /api/portal/admin/upload  — direct image upload, returns { url } (admin only)
const _objectStorage = new ObjectStorageService();
const _multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

router.post("/admin/upload", requirePortalAdmin, _multerUpload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ message: "File gambar wajib diisi" });
  if (!file.mimetype.startsWith("image/")) return res.status(415).json({ message: "Hanya file gambar yang diizinkan" });
  try {
    const { buffer, contentType } = await compressImageBuffer(file.buffer, file.mimetype, "photo");
    const objectId = randomUUID();
    const url = await _objectStorage.uploadPublicAsset(buffer, objectId, contentType);
    return res.json({ url });
  } catch (err) {
    return res.status(500).json({ message: "Gagal mengunggah gambar" });
  }
});

// Per-customer rate limit for portal order uploads: 20 per customer per hour.
// Portal customers are self-registered (public sign-up); keying by customer ID
// (not IP) prevents bypass via proxy / shared NAT.
interface _RateEntry { count: number; resetAt: number }
const _PORTAL_UPLOAD_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const _PORTAL_UPLOAD_LIMIT = 20;
const _portalUploadCustomerMap = new Map<number, _RateEntry>();

function _checkPortalUploadLimit(customerId: number): boolean {
  const now = Date.now();
  let entry = _portalUploadCustomerMap.get(customerId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + _PORTAL_UPLOAD_WINDOW_MS };
  }
  if (entry.count >= _PORTAL_UPLOAD_LIMIT) return false;
  entry.count += 1;
  _portalUploadCustomerMap.set(customerId, entry);
  return true;
}

const _portalUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB hard cap enforced by multer/server
});

const _PORTAL_ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// POST /api/portal/order-upload
// Server-side proxy upload: file goes through the API server so multer enforces
// the 20 MB size limit before any byte reaches object storage.  This replaces
// the old presigned-URL flow (/order-upload-url) which issued unconstrained GCS
// PUT URLs that bypassed all server-side size limits.
router.post("/order-upload", requirePortalAuth, (req, res, next) => {
  _portalUpload.single("file")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ message: "Ukuran file melebihi batas 20 MB." }); return;
      }
      res.status(400).json({ message: "Upload gagal: " + (err as Error).message }); return;
    }
    next();
  });
}, async (req, res) => {
  const portalReq = req as unknown as PortalAuthReq;
  const customerId = portalReq.portalCustomerId;

  if (!_checkPortalUploadLimit(customerId)) {
    return res.status(429).json({ message: "Terlalu banyak upload. Coba lagi dalam 1 jam." });
  }

  if (!req.file) return res.status(400).json({ message: "File wajib diunggah" });

  const mime = req.file.mimetype;
  if (!_PORTAL_ALLOWED_MIME.has(mime) && !mime.startsWith("image/")) {
    return res.status(415).json({ message: "Tipe file tidak diizinkan" });
  }

  try {
    const objectPath = await _objectStorage.uploadPrivateEntity(req.file.buffer, mime);
    return res.json({ objectPath });
  } catch (_err) {
    return res.status(500).json({ message: "Gagal mengunggah file" });
  }
});

// POST /api/portal/order-upload-url  — DEPRECATED, kept for backward compat.
// Returns 410 Gone so old clients fail visibly rather than silently.
router.post("/order-upload-url", requirePortalAuth, (_req, res) => {
  return res.status(410).json({ message: "Endpoint ini sudah tidak aktif. Gunakan /api/portal/order-upload (multipart/form-data)." });
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

  // Real-time SSE: notify BizPortal admins immediately (persisted to DB)
  saveAndBroadcast("new_order", {
    type: "portal_sales",
    orderId: doc!.id,
    orderNumber: doc!.docNumber,
    customerName: portalCustomer.name,
    companyName: portalCustomer.company ?? null,
    grandTotal: Number(doc!.grandTotal),
    itemCount: orderItems.length,
    createdAt: (doc!.createdAt as Date).toISOString(),
  }).catch(() => {});

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

// POST /api/portal/request-quote — public, no auth required
router.post("/request-quote", async (req, res) => {
  const {
    name, email, whatsapp, service, origin, destination,
    weight, length, width, height, incoterms, insurance, express, result,
  } = req.body as {
    name: string; email?: string; whatsapp: string;
    service: string; origin: string; destination: string;
    weight?: string; length?: string; width?: string; height?: string;
    incoterms?: string; insurance?: boolean; express?: boolean;
    result?: {
      baseCost?: number; weightCost?: number; handlingFee?: number;
      customsFee?: number; insuranceFee?: number; expressFee?: number;
      total?: number; chargeableWeight?: number; cbm?: number;
    };
  };

  if (!name?.trim() || !whatsapp?.trim()) {
    return res.status(400).json({ error: "Nama dan WhatsApp wajib diisi" });
  }

  const fmt = (n?: number) =>
    n ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n) : "-";

  const serviceLabels: Record<string, string> = {
    seaFreight: "Sea Freight 🚢", airFreight: "Air Freight ✈️",
    customs: "Bea Cukai 📦", domestic: "Domestik/Trucking 🚚",
    warehousing: "Gudang/Warehousing 🏠", projectCargo: "Project Cargo 🌐",
  };
  const svcLabel = serviceLabels[service] ?? service;
  const ts = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" });

  const waLines = [
    `🚢 *REQUEST QUOTE BARU — CST Logistics*`,
    `───────────────────────────`,
    `👤 *Nama:* ${name}`,
    `📧 *Email:* ${email || "-"}`,
    `📱 *WhatsApp:* ${whatsapp}`,
    `───────────────────────────`,
    `📦 *Layanan:* ${svcLabel}`,
    `🌍 *Rute:* ${origin} → ${destination}`,
    weight ? `⚖️ *Berat:* ${weight} kg` : null,
    (length && width && height) ? `📐 *Dimensi:* ${length}×${width}×${height} cm` : null,
    incoterms ? `📋 *Incoterms:* ${incoterms}` : null,
    insurance ? `🛡️ *Asuransi:* Ya` : null,
    express ? `⚡ *Express:* Ya` : null,
    `───────────────────────────`,
    result?.total ? `💰 *Estimasi Total:* ${fmt(result.total)}` : null,
    result?.chargeableWeight != null ? `  • Chargeable: ${result.chargeableWeight} kg` : null,
    result?.cbm != null ? `  • Volume: ${result.cbm} CBM` : null,
    result?.baseCost ? `  • Biaya Dasar: ${fmt(result.baseCost)}` : null,
    result?.weightCost ? `  • Biaya Berat/CBM: ${fmt(result.weightCost)}` : null,
    result?.handlingFee ? `  • Handling: ${fmt(result.handlingFee)}` : null,
    result?.customsFee ? `  • Bea Cukai: ${fmt(result.customsFee)}` : null,
    result?.insuranceFee ? `  • Asuransi: ${fmt(result.insuranceFee)}` : null,
    result?.expressFee ? `  • Express: ${fmt(result.expressFee)}` : null,
    `───────────────────────────`,
    `🕐 ${ts}`,
    ``,
    `_Segera tindaklanjuti permintaan ini._`,
  ].filter(Boolean).join("\n");

  const errors: string[] = [];

  // WhatsApp ke admin
  try {
    const adminTarget = await getAdminWa();
    if (adminTarget) await sendWhatsApp(adminTarget, waLines);
  } catch (err) {
    errors.push("WA-admin: " + String(err));
  }

  // WhatsApp konfirmasi ke customer
  try {
    if (whatsapp?.trim()) {
      const confirmLines = [
        `✅ *Halo ${name}!*`,
        ``,
        `Terima kasih telah menghubungi *CST Logistics*.`,
        `Tim kami telah menerima permintaan penawaran Anda:`,
        ``,
        `📦 *Layanan:* ${svcLabel}`,
        `🌍 *Rute:* ${origin} → ${destination}`,
        result?.total ? `💰 *Estimasi:* ${fmt(result.total)}` : null,
        ``,
        `Kami akan menghubungi Anda dalam *1×24 jam kerja* untuk konfirmasi dan penawaran resmi.`,
        ``,
        `_Salam,_`,
        `_Tim CST Logistics 🚢_`,
      ].filter(Boolean).join("\n");
      await sendWhatsApp(whatsapp, confirmLines);
    }
  } catch (err) {
    errors.push("WA-customer: " + String(err));
  }

  // Email ke admin
  try {
    const adminEmail = process.env.ADMIN_EMAIL?.split(",")[0]?.trim();
    if (adminEmail && isSmtpConfigured()) {
      const row = (c: string, v: string) =>
        `<tr><td style="color:#64748B;padding:4px 0;width:140px;font-size:12px;">${c}</td><td style="font-weight:600;color:#1E293B;font-size:12px;">${v}</td></tr>`;

      const emailHtml = `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;background:#F8FAFC;padding:20px;border-radius:12px;">
          <div style="background:linear-gradient(135deg,#0B3D6B,#1A73D4);padding:18px 22px;border-radius:10px 10px 0 0;">
            <h2 style="color:white;margin:0;font-size:17px;">🚢 Request Quote Baru</h2>
            <p style="color:rgba(255,255,255,0.70);margin:3px 0 0;font-size:11px;">${ts}</p>
          </div>
          <div style="background:white;padding:18px 22px;border-radius:0 0 10px 10px;border:1px solid #E2E8F0;border-top:none;">
            <h4 style="color:#0B3D6B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Kontak</h4>
            <table style="width:100%;border-collapse:collapse;">
              ${row("Nama", name)}
              ${row("Email", email || "-")}
              ${row("WhatsApp", whatsapp)}
            </table>
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:14px 0;">
            <h4 style="color:#0B3D6B;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Detail Pengiriman</h4>
            <table style="width:100%;border-collapse:collapse;">
              ${row("Layanan", svcLabel)}
              ${row("Rute", `${origin} → ${destination}`)}
              ${weight ? row("Berat", `${weight} kg`) : ""}
              ${length && width && height ? row("Dimensi", `${length} × ${width} × ${height} cm`) : ""}
              ${incoterms ? row("Incoterms", incoterms) : ""}
              ${insurance ? row("Asuransi", "✅ Ya") : ""}
              ${express ? row("Express", "✅ Ya") : ""}
            </table>
            ${result?.total ? `
            <hr style="border:none;border-top:1px solid #E2E8F0;margin:14px 0;">
            <h4 style="color:#1D4ED8;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 10px;">Estimasi Biaya</h4>
            <table style="width:100%;border-collapse:collapse;">
              ${result.chargeableWeight != null ? row("Chargeable", `${result.chargeableWeight} kg`) : ""}
              ${result.cbm != null ? row("Volume", `${result.cbm} CBM`) : ""}
              ${result.baseCost ? row("Biaya Dasar", fmt(result.baseCost)) : ""}
              ${result.weightCost ? row("Berat/CBM", fmt(result.weightCost)) : ""}
              ${result.handlingFee ? row("Handling", fmt(result.handlingFee)) : ""}
              ${result.customsFee ? row("Bea Cukai", fmt(result.customsFee)) : ""}
              ${result.insuranceFee ? row("Asuransi", fmt(result.insuranceFee)) : ""}
              ${result.expressFee ? row("Express", fmt(result.expressFee)) : ""}
            </table>
            <div style="margin-top:12px;padding:12px 14px;background:#EFF6FF;border-radius:8px;border:1px solid #BFDBFE;display:flex;justify-content:space-between;align-items:center;">
              <span style="font-weight:700;color:#1D4ED8;font-size:12px;">TOTAL ESTIMASI</span>
              <span style="font-weight:800;color:#0B3D6B;font-size:20px;">${fmt(result.total)}</span>
            </div>` : ""}
            <div style="margin-top:18px;padding:10px 14px;background:#F1F5F9;border-radius:8px;text-align:center;font-size:10px;color:#94A3B8;">
              CST Logistics — Sistem Manajemen Logistik Terintegrasi
            </div>
          </div>
        </div>`;

      await sendMail({
        to: adminEmail,
        subject: `[Request Quote] ${svcLabel.replace(/[^\w\s→/-]/g, "").trim()} — ${name} — ${origin} → ${destination}`,
        html: emailHtml,
        text: waLines,
      });
    }
  } catch (err) {
    errors.push("Email: " + String(err));
  }

  // Simpan ke database
  try {
    await db.insert(quoteRequestsTable).values({
      name: name.trim(),
      email: email?.trim() || null,
      whatsapp: whatsapp.trim(),
      service,
      origin: origin.trim(),
      destination: destination.trim(),
      weight: weight ?? null,
      length: length ?? null,
      width: width ?? null,
      height: height ?? null,
      incoterms: incoterms ?? null,
      insurance: insurance ?? false,
      express: express ?? false,
      estimatedTotal: result?.total != null ? String(result.total) : null,
      estimatedCbm: result?.cbm != null ? String(result.cbm) : null,
      estimatedChargeableWeight: result?.chargeableWeight != null ? String(result.chargeableWeight) : null,
      status: "new",
    });
  } catch (err) {
    errors.push("DB-save: " + String(err));
  }

  return res.json({ ok: true, warnings: errors.length ? errors : undefined });
});

// GET /api/portal/quote-requests — daftar semua request quote (BizPortal admin)
router.get("/quote-requests", async (req, res) => {
  if (!(await requireClerkUser(req, res))) return;
  const status = req.query.status as string | undefined;
  const conditions = status ? [eq(quoteRequestsTable.status, status)] : [];
  const items = await db
    .select()
    .from(quoteRequestsTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(quoteRequestsTable.createdAt));
  res.json({ items, total: items.length });
});

// PATCH /api/portal/quote-requests/:id — update status/notes/handledBy (BizPortal admin)
router.patch("/quote-requests/:id", async (req, res): Promise<void> => {
  if (!(await requireClerkUser(req, res))) return;
  const id = Number(req.params.id);
  if (!id) { res.status(400).json({ error: "invalid id" }); return; }
  const { status, notes, handledBy } = req.body ?? {};
  await db
    .update(quoteRequestsTable)
    .set({
      ...(status != null ? { status } : {}),
      ...(notes != null ? { notes } : {}),
      ...(handledBy != null ? { handledBy } : {}),
      updatedAt: new Date(),
    })
    .where(eq(quoteRequestsTable.id, id));
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════════════════
// ONBOARDING ROUTES
// ════════════════════════════════════════════════════════════════════════════

const onboardingUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

function getOnboardingOpenAI(): OpenAI {
  const apiKey = process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI API key not configured.");
  return new OpenAI({ apiKey, baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL });
}

// GET /api/portal/onboarding/status
router.get("/onboarding/status", requirePortalAuth, async (req, res): Promise<void> => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const [profile] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.customerId, customerId));
  if (!profile) {
    res.json({ status: "incomplete", accountType: null, hasProfile: false });
    return;
  }
  const rejectionReason = profile.status === "rejected" ? profile.rejectionReason : undefined;
  res.json({
    hasProfile: true,
    status: profile.status,
    accountType: profile.accountType,
    ...(rejectionReason ? { rejectionReason } : {}),
    profile: {
      fullName: profile.fullName,
      phone: profile.phone,
      address: profile.address,
      ktpUrl: profile.ktpUrl,
    },
  });
});

// POST /api/portal/onboarding/ktp-ocr — upload KTP image → OCR
router.post("/onboarding/ktp-ocr", requirePortalAuth, onboardingUpload.single("file"), async (req, res): Promise<void> => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  if (!req.file) { res.status(400).json({ ok: false, error: "File tidak ditemukan." }); return; }

  try {
    const openai = getOnboardingOpenAI();
    const base64 = req.file.buffer.toString("base64");
    const mime = req.file.mimetype || "image/jpeg";

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 800,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `Kamu adalah sistem OCR KTP Indonesia. Ekstrak semua field dari KTP ini dan kembalikan HANYA JSON tanpa markdown, format:
{"nik":"...","name":"...","birthPlace":"...","birthDate":"...","address":"...","rt":"...","rw":"...","kelurahan":"...","kecamatan":"...","kabupaten":"...","provinsi":"...","gender":"...","religion":"...","maritalStatus":"...","occupation":"...","nationality":"WNI"}
Isi string kosong jika field tidak terbaca.`,
          },
          { type: "image_url", image_url: { url: `data:${mime};base64,${base64}`, detail: "high" } },
        ],
      }],
    });

    const raw = response.choices[0]?.message?.content ?? "{}";
    const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
    let data: Record<string, string> = {};
    try { data = JSON.parse(cleaned); } catch { /* fallback empty */ }

    // Persist OCR result
    await db.insert(ocrResultsTable).values({
      customerId,
      docType: "ktp",
      nik: data.nik || null,
      name: data.name || null,
      birthPlace: data.birthPlace || null,
      birthDate: data.birthDate || null,
      address: data.address || null,
      rt: data.rt || null,
      rw: data.rw || null,
      kelurahan: data.kelurahan || null,
      kecamatan: data.kecamatan || null,
      kabupaten: data.kabupaten || null,
      provinsi: data.provinsi || null,
      gender: data.gender || null,
      religion: data.religion || null,
      maritalStatus: data.maritalStatus || null,
      occupation: data.occupation || null,
      nationality: data.nationality || null,
      rawJson: JSON.stringify(data),
    }).onConflictDoNothing();

    res.json({ ok: true, data });
  } catch (err) {
    console.error("[ktp-ocr]", err);
    res.status(500).json({ ok: false, error: "OCR gagal. Pastikan OpenAI API key dikonfigurasi." });
  }
});

// POST /api/portal/onboarding/upload-doc — upload any document to object storage
router.post("/onboarding/upload-doc", requirePortalAuth, onboardingUpload.single("file"), async (req, res): Promise<void> => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  if (!req.file) { res.status(400).json({ ok: false, error: "File tidak ditemukan." }); return; }
  const docType = String(req.body?.docType ?? "doc");

  try {
    const ext = req.file.originalname.split(".").pop() ?? "bin";
    const key = `portal/onboarding/${customerId}/${docType}-${randomUUID()}.${ext}`;
    const storage = new ObjectStorageService();
    let buf = req.file.buffer;
    if (req.file.mimetype.startsWith("image/")) {
      try { const c = await compressImageBuffer(buf, req.file.mimetype); buf = c.buffer; } catch { /* use original */ }
    }
    const url = await storage.uploadPublic(key, buf, req.file.mimetype);
    // Record in identity_documents
    await db.insert(identityDocumentsTable).values({ customerId, docType, url, fileName: req.file.originalname });
    res.json({ ok: true, url });
  } catch (err) {
    console.error("[upload-doc]", err);
    res.status(500).json({ ok: false, error: "Gagal upload file." });
  }
});

// POST /api/portal/onboarding/complete — submit full profile
router.post("/onboarding/complete", requirePortalAuth, async (req, res): Promise<void> => {
  const customerId = (req as PortalAuthReq).portalCustomerId;
  const { fullName, phone, address, accountType, ktpUrl, ocrData, vendor, driver, employee } = req.body ?? {};

  if (!fullName || !phone || !address || !accountType) {
    res.status(400).json({ ok: false, error: "Data tidak lengkap." });
    return;
  }

  const isCustomer = accountType === "customer";
  const status = isCustomer ? "active" : "pending";
  const now = new Date();

  // Upsert user_profiles
  await db.insert(userProfilesTable).values({
    customerId,
    fullName: String(fullName),
    phone: String(phone),
    address: String(address),
    accountType: String(accountType),
    status,
    ktpUrl: ktpUrl ? String(ktpUrl) : null,
    completedAt: now,
    updatedAt: now,
  }).onConflictDoUpdate({
    target: userProfilesTable.customerId,
    set: {
      fullName: String(fullName),
      phone: String(phone),
      address: String(address),
      accountType: String(accountType),
      status,
      ktpUrl: ktpUrl ? String(ktpUrl) : null,
      completedAt: now,
      updatedAt: now,
    },
  });

  // Update portal_customers role + phone
  try {
    await db.update(portalCustomersTable).set({
      name: String(fullName),
      phone: String(phone),
      role: accountType === "vendor" ? "vendor" : accountType === "driver" ? "driver" : accountType === "employee" ? "employee" : "customer",
    }).where(eq(portalCustomersTable.id, customerId));
  } catch (err: any) {
    if (err?.code === "23505" && err?.constraint?.includes("phone")) {
      res.status(409).json({ ok: false, error: "Nomor telepon sudah digunakan oleh akun lain. Gunakan nomor yang berbeda." });
      return;
    }
    throw err;
  }

  // Update OCR result name if provided
  if (ocrData?.nik) {
    await db.update(ocrResultsTable).set({ name: ocrData.name ?? null, nik: ocrData.nik ?? null }).where(eq(ocrResultsTable.customerId, customerId));
  }

  // Upsert vendor profile
  if (accountType === "vendor" && vendor) {
    await db.insert(vendorProfilesTable).values({
      customerId,
      companyName: vendor.companyName ?? null,
      nib: vendor.nib ?? null,
      npwp: vendor.npwp ?? null,
      serviceType: vendor.serviceType ?? null,
      legalityDocUrl: vendor.legalityDocUrl ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: vendorProfilesTable.customerId,
      set: {
        companyName: vendor.companyName ?? null,
        nib: vendor.nib ?? null,
        npwp: vendor.npwp ?? null,
        serviceType: vendor.serviceType ?? null,
        legalityDocUrl: vendor.legalityDocUrl ?? null,
        updatedAt: now,
      },
    });
  }

  // Upsert driver profile
  if (accountType === "driver" && driver) {
    await db.insert(driverProfilesTable).values({
      customerId,
      licenseNumber: driver.licenseNumber ?? null,
      vehicleType: driver.vehicleType ?? null,
      plateNumber: driver.plateNumber ?? null,
      simUrl: driver.simUrl ?? null,
      stnkUrl: driver.stnkUrl ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: driverProfilesTable.customerId,
      set: {
        licenseNumber: driver.licenseNumber ?? null,
        vehicleType: driver.vehicleType ?? null,
        plateNumber: driver.plateNumber ?? null,
        simUrl: driver.simUrl ?? null,
        stnkUrl: driver.stnkUrl ?? null,
        updatedAt: now,
      },
    });
  }

  // Upsert employee profile
  if (accountType === "employee" && employee) {
    await db.insert(employeeProfilesTable).values({
      customerId,
      companyName: employee.companyName ?? null,
      branch: employee.branch ?? null,
      department: employee.department ?? null,
      division: employee.division ?? null,
      position: employee.position ?? null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: employeeProfilesTable.customerId,
      set: {
        companyName: employee.companyName ?? null,
        branch: employee.branch ?? null,
        department: employee.department ?? null,
        division: employee.division ?? null,
        position: employee.position ?? null,
        updatedAt: now,
      },
    });
  }

  // Create approval request for non-customer accounts
  if (!isCustomer) {
    await db.insert(onboardingApprovalsTable).values({
      customerId,
      accountType: String(accountType),
      status: "pending",
      updatedAt: now,
    }).onConflictDoNothing();

    // Notify admin via WA
    void (async () => {
      try {
        const adminWa = await getAdminWa();
        if (adminWa) {
          const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
          const msg = [
            "🔔 *Permohonan Akun Baru*",
            `👤 Nama   : ${fullName}`,
            `📧 Email  : ${customer?.email ?? "-"}`,
            `📱 HP     : ${phone}`,
            `🏷️ Tipe   : ${accountType}`,
            `🕐 Waktu  : ${new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" })} WIB`,
            ``,
            `Tinjau di panel admin portal.`,
          ].join("\n");
          await sendWhatsApp(adminWa, msg);
        }
      } catch (e) { console.error("[onboarding-notif-wa]", e); }
    })();
  }

  res.json({ ok: true, status });
});

// GET /api/portal/admin/approvals — list approval requests (portal admin)
router.get("/admin/approvals", requirePortalAdmin, async (req, res): Promise<void> => {
  const { status, accountType } = req.query;
  const conds = [];
  if (status) conds.push(eq(onboardingApprovalsTable.status, String(status)));
  if (accountType) conds.push(eq(onboardingApprovalsTable.accountType, String(accountType)));

  const rows = await db
    .select({
      id: onboardingApprovalsTable.id,
      customerId: onboardingApprovalsTable.customerId,
      accountType: onboardingApprovalsTable.accountType,
      status: onboardingApprovalsTable.status,
      adminNote: onboardingApprovalsTable.adminNote,
      reviewedBy: onboardingApprovalsTable.reviewedBy,
      reviewedAt: onboardingApprovalsTable.reviewedAt,
      createdAt: onboardingApprovalsTable.createdAt,
      customerName: portalCustomersTable.name,
      customerEmail: portalCustomersTable.email,
      customerPhone: portalCustomersTable.phone,
    })
    .from(onboardingApprovalsTable)
    .leftJoin(portalCustomersTable, eq(onboardingApprovalsTable.customerId, portalCustomersTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(onboardingApprovalsTable.createdAt));

  // Attach type-specific profiles
  const enriched = await Promise.all(rows.map(async (row) => {
    let typeProfile = null;
    if (row.accountType === "vendor") {
      const [vp] = await db.select().from(vendorProfilesTable).where(eq(vendorProfilesTable.customerId, row.customerId));
      typeProfile = vp ?? null;
    } else if (row.accountType === "driver") {
      const [dp] = await db.select().from(driverProfilesTable).where(eq(driverProfilesTable.customerId, row.customerId));
      typeProfile = dp ?? null;
    } else if (row.accountType === "employee") {
      const [ep] = await db.select().from(employeeProfilesTable).where(eq(employeeProfilesTable.customerId, row.customerId));
      typeProfile = ep ?? null;
    }
    const [up] = await db.select().from(userProfilesTable).where(eq(userProfilesTable.customerId, row.customerId));
    return { ...row, userProfile: up ?? null, typeProfile };
  }));

  res.json(enriched);
});

// PATCH /api/portal/admin/approvals/:id — approve or reject
router.patch("/admin/approvals/:id", requirePortalAdmin, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { status, adminNote, reviewedBy } = req.body ?? {};
  if (!id || !["approved", "rejected"].includes(status)) {
    res.status(400).json({ error: "status must be approved or rejected" });
    return;
  }

  const [approval] = await db.select().from(onboardingApprovalsTable).where(eq(onboardingApprovalsTable.id, id));
  if (!approval) { res.status(404).json({ error: "Not found" }); return; }

  const now = new Date();
  await db.update(onboardingApprovalsTable).set({
    status,
    adminNote: adminNote ?? null,
    reviewedBy: reviewedBy ?? null,
    reviewedAt: now,
    updatedAt: now,
  }).where(eq(onboardingApprovalsTable.id, id));

  const newProfileStatus = status === "approved" ? "active" : "rejected";
  await db.update(userProfilesTable).set({
    status: newProfileStatus,
    rejectionReason: status === "rejected" ? (adminNote ?? "Tidak memenuhi syarat") : null,
    updatedAt: now,
  }).where(eq(userProfilesTable.customerId, approval.customerId));

  // If approved: update portal_customers role
  if (status === "approved") {
    await db.update(portalCustomersTable)
      .set({ role: approval.accountType })
      .where(eq(portalCustomersTable.id, approval.customerId));
  }

  // Notify user via WA
  void (async () => {
    try {
      const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, approval.customerId));
      const adminWa = await getAdminWa();
      if (adminWa && customer) {
        const msg = status === "approved"
          ? `✅ *Akun Anda Disetujui!*\n\nHai ${customer.name}, akun ${approval.accountType} Anda di CST Logistics telah disetujui.\n\nSilakan login kembali untuk mengakses sistem.`
          : `❌ *Akun Anda Ditolak*\n\nHai ${customer.name}, permintaan akun ${approval.accountType} Anda tidak dapat kami setujui.\n\nAlasan: ${adminNote ?? "Tidak memenuhi syarat"}\n\nHubungi kami untuk informasi lebih lanjut.`;
        await sendWhatsApp(adminWa, msg);
      }
    } catch (e) { console.error("[approval-notif-wa]", e); }
  })();

  res.json({ ok: true, status: newProfileStatus });
});

// GET /api/portal/admin/approvals/stats — quick stats for admin dashboard
router.get("/admin/approvals/stats", requirePortalAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ status: onboardingApprovalsTable.status, accountType: onboardingApprovalsTable.accountType })
    .from(onboardingApprovalsTable);
  const stats: Record<string, number> = { pending: 0, approved: 0, rejected: 0, total: rows.length };
  for (const r of rows) {
    stats[r.status] = (stats[r.status] ?? 0) + 1;
  }
  res.json(stats);
});

// GET /api/portal/admin/customers — list all portal customers (with onboarding status)
router.get("/admin/customers", requirePortalAdmin, async (req, res): Promise<void> => {
  const { role, q } = req.query;
  const conds = [];
  if (role) conds.push(eq(portalCustomersTable.role, String(role)));

  const rows = await db
    .select({
      id: portalCustomersTable.id,
      name: portalCustomersTable.name,
      email: portalCustomersTable.email,
      phone: portalCustomersTable.phone,
      company: portalCustomersTable.company,
      role: portalCustomersTable.role,
      oauthProvider: portalCustomersTable.oauthProvider,
      createdAt: portalCustomersTable.createdAt,
      profileStatus: userProfilesTable.status,
      profileAccountType: userProfilesTable.accountType,
      profileFullName: userProfilesTable.fullName,
      profileAddress: userProfilesTable.address,
    })
    .from(portalCustomersTable)
    .leftJoin(userProfilesTable, eq(userProfilesTable.customerId, portalCustomersTable.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(portalCustomersTable.createdAt));

  const search = q ? String(q).toLowerCase().trim() : "";
  const filtered = search
    ? rows.filter((r) =>
        (r.name ?? "").toLowerCase().includes(search) ||
        (r.email ?? "").toLowerCase().includes(search) ||
        (r.phone ?? "").toLowerCase().includes(search) ||
        (r.company ?? "").toLowerCase().includes(search))
    : rows;

  // Derive registration source: WA (email ends with @wa.local), OAuth, or email/password
  const enriched = filtered.map((r) => {
    let source: "wa" | "oauth" | "email" = "email";
    if (r.email && r.email.endsWith("@wa.local")) source = "wa";
    else if (r.oauthProvider) source = "oauth";
    const profileState = r.profileStatus ?? "not_started";
    return {
      id: r.id,
      name: r.name,
      email: r.email,
      phone: r.phone,
      company: r.company,
      role: r.role,
      source,
      createdAt: r.createdAt,
      profileStatus: profileState,
      profileAccountType: r.profileAccountType,
      profileFullName: r.profileFullName,
      profileAddress: r.profileAddress,
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

// GET /api/portal/admin/customers/stats — quick stats
router.get("/admin/customers/stats", requirePortalAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: portalCustomersTable.id,
      role: portalCustomersTable.role,
      email: portalCustomersTable.email,
      profileStatus: userProfilesTable.status,
    })
    .from(portalCustomersTable)
    .leftJoin(userProfilesTable, eq(userProfilesTable.customerId, portalCustomersTable.id));
  const stats = {
    total: rows.length,
    wa: rows.filter((r) => r.email?.endsWith("@wa.local")).length,
    customer: rows.filter((r) => r.role === "customer").length,
    vendor: rows.filter((r) => r.role === "vendor").length,
    profileIncomplete: rows.filter((r) => !r.profileStatus || r.profileStatus === "incomplete" || r.profileStatus === "not_started").length,
    profilePending: rows.filter((r) => r.profileStatus === "pending").length,
    profileActive: rows.filter((r) => r.profileStatus === "active").length,
  };
  res.json(stats);
});

// ════════════════════════════════════════════════════════════════════════════
// VENDOR MINI FORM — portal admin routes
// ════════════════════════════════════════════════════════════════════════════

router.get("/admin/vendor-form/links", requirePortalAdmin, async (_req, res) => {
  try {
    const links = await db
      .select()
      .from(vendorMiniFormLinksTable)
      .orderBy(desc(vendorMiniFormLinksTable.createdAt));
    const vendorIds = links.map(l => l.supplierId).filter(Boolean) as number[];
    let vendorMap: Record<number, string> = {};
    if (vendorIds.length) {
      const vendors = await db.select({ id: suppliersTable.id, name: suppliersTable.name }).from(suppliersTable);
      vendorMap = Object.fromEntries(vendors.map(v => [v.id, v.name]));
    }
    return res.json(links.map(l => ({
      ...l,
      vendorName: l.supplierId ? (vendorMap[l.supplierId] ?? null) : null,
      expiresAt: l.expiresAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })));
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/admin/vendor-form/links", requirePortalAdmin, async (req, res) => {
  try {
    const { serviceType, title, notes, expiresInDays } = req.body as {
      serviceType: string;
      title?: string;
      notes?: string;
      expiresInDays?: number;
    };
    if (!serviceType || !SERVICE_SCHEMAS[serviceType]) {
      return res.status(400).json({ error: "serviceType tidak valid" });
    }
    const { randomBytes } = await import("crypto");
    const token = randomBytes(24).toString("hex");
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;
    const [link] = await db
      .insert(vendorMiniFormLinksTable)
      .values({ token, supplierId: null, serviceType, title: title ?? null, notes: notes ?? null, expiresAt: expiresAt ?? undefined })
      .returning();
    return res.status(201).json({ ...link, expiresAt: link.expiresAt?.toISOString() ?? null, createdAt: link.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "portal admin POST vendor-form/links error");
    return res.status(500).json({ error: "Gagal membuat link" });
  }
});

router.patch("/admin/vendor-form/links/:id", requirePortalAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const { isActive } = req.body as { isActive?: boolean };
    const patch: Record<string, unknown> = {};
    if (typeof isActive === "boolean") patch["isActive"] = isActive;
    const [updated] = await db
      .update(vendorMiniFormLinksTable)
      .set(patch)
      .where(eq(vendorMiniFormLinksTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Link tidak ditemukan" });
    invalidateTokenCache(updated.token);
    return res.json({ ...updated, expiresAt: updated.expiresAt?.toISOString() ?? null, createdAt: updated.createdAt.toISOString() });
  } catch (err) {
    req.log?.error({ err }, "portal admin PATCH vendor-form/links error");
    return res.status(500).json({ error: "Gagal update link" });
  }
});

router.delete("/admin/vendor-form/links/:id", requirePortalAdmin, async (req, res) => {
  const id = Number(req.params["id"]);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [deleted] = await db
      .delete(vendorMiniFormLinksTable)
      .where(eq(vendorMiniFormLinksTable.id, id))
      .returning();
    if (!deleted) return res.status(404).json({ error: "Link tidak ditemukan" });
    invalidateTokenCache(deleted.token);
    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "portal admin DELETE vendor-form/links error");
    return res.status(500).json({ error: "Gagal hapus link" });
  }
});

router.get("/admin/vendor-form/submissions", requirePortalAdmin, async (_req, res) => {
  try {
    const submissions = await db
      .select()
      .from(vendorMiniFormSubmissionsTable)
      .orderBy(desc(vendorMiniFormSubmissionsTable.submittedAt));
    return res.json(submissions.map(s => ({
      ...s,
      submittedAt: s.submittedAt.toISOString(),
    })));
  } catch {
    return res.status(500).json({ error: "Internal server error" });
  }
});

// ════════════════════════════════════════════════════════════════════════════
// CALCULATOR RATES
// ════════════════════════════════════════════════════════════════════════════

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
