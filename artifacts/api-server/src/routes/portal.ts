import { Router, type Request, type Response, type NextFunction } from "express";
import { db, productsTable, productCategoryMapTable, productCategoriesTable, portalCustomersTable, portalCustomerServicesTable, accountingSettingsTable, salesDocumentsTable, customersTable } from "@workspace/db";
import { eq, inArray, and } from "drizzle-orm";
import crypto from "crypto";

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
  (req as Request & { portalCustomerId: number }).portalCustomerId = payload.customerId;
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
  return res.json({
    name: settings?.companyName ?? "PT. Cahaya Sejati Teknologi",
    tagline: "Solusi Logistik Terintegrasi & Berbasis Teknologi",
    logoUrl: settings?.companyLogoUrl ?? null,
    address: settings?.companyAddress ?? null,
    email: null,
    phone: null,
  });
});

async function listByType(type: string) {
  const rows = await db
    .select()
    .from(productsTable)
    .where(and(eq(productsTable.isActive, true), eq(productsTable.itemType, type)));
  const ids = rows.map((p) => p.id);
  const catMap = await getProductCategories(ids);
  return rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description ?? null,
    price: Number(p.price),
    imageUrl: p.imageUrl ?? null,
    categories: catMap[p.id] ?? [],
  }));
}

// GET /api/portal/services  — item_type = 'jasa'
router.get("/services", async (_req, res) => {
  return res.json(await listByType("jasa"));
});

// GET /api/portal/products  — item_type = 'barang'
router.get("/products", async (_req, res) => {
  return res.json(await listByType("barang"));
});

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
  const serviceIds = await getServiceIds(customer.id);
  const token = signToken({ customerId: customer.id });
  return res.json({
    token,
    customer: {
      id: customer.id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone,
      company: customer.company,
      serviceIds,
      createdAt: customer.createdAt.toISOString(),
    },
  });
});

// POST /api/portal/auth/register
router.post("/auth/register", async (req, res) => {
  const { name, email, password, phone, company, serviceIds } = req.body ?? {};
  if (!name || !email || !password) {
    return res.status(400).json({ message: "Nama, email, dan password wajib diisi" });
  }
  const existing = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.email, String(email)));
  if (existing.length > 0) {
    return res.status(409).json({ message: "Email sudah terdaftar" });
  }
  const [customer] = await db.insert(portalCustomersTable).values({
    name: String(name),
    email: String(email),
    passwordHash: hashPassword(String(password)),
    phone: phone ? String(phone) : null,
    company: company ? String(company) : null,
  }).returning();
  if (Array.isArray(serviceIds) && serviceIds.length > 0) {
    await db.insert(portalCustomerServicesTable).values(
      (serviceIds as number[]).map((sid) => ({ customerId: customer!.id, serviceId: Number(sid) }))
    );
  }
  const selectedServiceIds = Array.isArray(serviceIds) ? (serviceIds as number[]).map(Number) : [];
  const token = signToken({ customerId: customer!.id });
  return res.status(201).json({
    token,
    customer: {
      id: customer!.id,
      name: customer!.name,
      email: customer!.email,
      phone: customer!.phone,
      company: customer!.company,
      serviceIds: selectedServiceIds,
      createdAt: customer!.createdAt.toISOString(),
    },
  });
});

// GET /api/portal/auth/me
router.get("/auth/me", requirePortalAuth, async (req, res) => {
  const customerId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, customerId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  const serviceIds = await getServiceIds(customer.id);
  return res.json({
    id: customer.id,
    name: customer.name,
    email: customer.email,
    phone: customer.phone,
    company: customer.company,
    serviceIds,
    createdAt: customer.createdAt.toISOString(),
  });
});

// GET /api/portal/orders  — returns sales orders linked to the portal customer via email → customers table
router.get("/orders", requirePortalAuth, async (req, res) => {
  const portalCustId = (req as Request & { portalCustomerId: number }).portalCustomerId;
  const [customer] = await db.select().from(portalCustomersTable).where(eq(portalCustomersTable.id, portalCustId));
  if (!customer) return res.status(401).json({ message: "Customer not found" });
  // Find matching CRM customer by email
  const [crmCustomer] = await db.select().from(customersTable).where(eq(customersTable.email, customer.email));
  if (!crmCustomer) return res.json([]);
  const orders = await db.select().from(salesDocumentsTable).where(eq(salesDocumentsTable.customerId, crmCustomer.id));
  return res.json(orders.map((o) => ({
    id: o.id,
    docNumber: o.docNumber,
    status: o.status,
    grandTotal: Number(o.grandTotal ?? 0),
    createdAt: o.createdAt.toISOString(),
  })));
});

export default router;
