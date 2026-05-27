import { type Request, type Response, type NextFunction } from "express";
import { db, portalCustomersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "./supabaseAdmin";
import { verifyPortalJwt } from "./portalJwt";
import { createHmac } from "crypto";

// No default: if DEV_PORTAL_SECRET is not explicitly set, dev tokens are inoperable.
const DEV_SECRET = process.env.DEV_PORTAL_SECRET ?? "";
const IS_PROD =
  process.env.REPLIT_DEPLOYMENT === "1" || process.env.NODE_ENV === "production";

export function signDevToken(payload: object): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", DEV_SECRET).update(b64).digest("hex");
  return `devportal.${b64}.${sig}`;
}

function verifyDevToken(token: string): { id: number; email: string; role: string } | null {
  if (IS_PROD) return null;
  if (!DEV_SECRET) return null; // explicitly unset → dev bypass disabled
  if (!token.startsWith("devportal.")) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, b64, sig] = parts;
  const expected = createHmac("sha256", DEV_SECRET).update(b64).digest("hex");
  if (sig !== expected) return null;
  try {
    const payload = JSON.parse(Buffer.from(b64, "base64url").toString("utf-8"));
    if (payload.exp && payload.exp < Date.now()) return null;
    return payload as { id: number; email: string; role: string };
  } catch { return null; }
}

export type PortalAuthReq = Request & { portalCustomerId: number; portalRole: string };

const PORTAL_ADMIN_EMAILS = [
  "admcst001@gmail.com",
  "wangsamasindo@gmail.com",
  ...(process.env.PORTAL_ADMIN_EMAILS ?? "").split(","),
]
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);

  // 1) Dev token bypass (non-production only)
  const devPayload = verifyDevToken(token);
  if (devPayload) {
    const [customer] = await db
      .select()
      .from(portalCustomersTable)
      .where(eq(portalCustomersTable.id, devPayload.id));
    if (!customer) { res.status(401).json({ message: "Dev user not found" }); return; }
    (req as PortalAuthReq).portalCustomerId = customer.id;
    (req as PortalAuthReq).portalRole = customer.role;
    next();
    return;
  }

  // 2) Our own portal JWT
  const portalPayload = await verifyPortalJwt(token);
  if (portalPayload) {
    const [customer] = await db
      .select()
      .from(portalCustomersTable)
      .where(eq(portalCustomersTable.id, portalPayload.customerId));
    if (!customer) { res.status(401).json({ message: "Customer not found" }); return; }
    (req as PortalAuthReq).portalCustomerId = customer.id;
    (req as PortalAuthReq).portalRole = customer.role;
    next();
    return;
  }

  // 3) Supabase token fallback
  const supabaseUser = await verifySupabaseToken(token);
  if (!supabaseUser?.email) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  let [customer] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.email, supabaseUser.email));

  if (!customer) {
    const meta = supabaseUser.user_metadata ?? {};
    const isAdmin = PORTAL_ADMIN_EMAILS.includes(supabaseUser.email.toLowerCase());
    const role = isAdmin ? "admin" : "customer";
    const [created] = await db
      .insert(portalCustomersTable)
      .values({
        name: (meta.name as string) || (meta.full_name as string) || supabaseUser.email.split("@")[0],
        email: supabaseUser.email,
        passwordHash: "",
        phone: (meta.phone as string) || null,
        company: (meta.company as string) || null,
        role,
      })
      .returning();
    customer = created;
  } else {
    const emailLower = supabaseUser.email.toLowerCase();
    if (PORTAL_ADMIN_EMAILS.includes(emailLower) && customer.role !== "admin") {
      await db.update(portalCustomersTable).set({ role: "admin" }).where(eq(portalCustomersTable.id, customer.id));
      customer = { ...customer, role: "admin" };
    }
  }

  (req as PortalAuthReq).portalCustomerId = customer.id;
  (req as PortalAuthReq).portalRole = customer.role;
  next();
}

export async function requirePortalAdmin(req: Request, res: Response, next: NextFunction) {
  // Allow BizPortal internal staff session (cookie-based) as admin too
  if (req.isAuthenticated && req.isAuthenticated() && (req as Request & { isInternalSession?: boolean }).isInternalSession) {
    const u = req.user as { id?: string; role?: string | null } | undefined;
    if (u && (u.role === "admin" || u.role === "owner" || u.role === "staff" || u.role === "manager")) {
      (req as PortalAuthReq).portalCustomerId = 0;
      (req as PortalAuthReq).portalRole = "admin";
      next();
      return;
    }
  }

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);

  // 1) Dev token bypass
  const devPayload = verifyDevToken(token);
  if (devPayload) {
    const [customer] = await db
      .select()
      .from(portalCustomersTable)
      .where(eq(portalCustomersTable.id, devPayload.id));
    if (!customer || customer.role !== "admin") {
      res.status(403).json({ message: "Akses admin diperlukan" });
      return;
    }
    (req as PortalAuthReq).portalCustomerId = customer.id;
    (req as PortalAuthReq).portalRole = customer.role;
    next();
    return;
  }

  // 2) Our own portal JWT
  const portalPayload = await verifyPortalJwt(token);
  if (portalPayload) {
    const [customer] = await db
      .select()
      .from(portalCustomersTable)
      .where(eq(portalCustomersTable.id, portalPayload.customerId));
    if (!customer || customer.role !== "admin") {
      res.status(403).json({ message: "Akses admin diperlukan" });
      return;
    }
    (req as PortalAuthReq).portalCustomerId = customer.id;
    (req as PortalAuthReq).portalRole = customer.role;
    next();
    return;
  }

  // 3) Supabase token fallback
  const supabaseUser = await verifySupabaseToken(token);
  if (!supabaseUser?.email) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  const emailLower = supabaseUser.email.toLowerCase();
  const adminListConfigured = PORTAL_ADMIN_EMAILS.length > 0;
  if (adminListConfigured && !PORTAL_ADMIN_EMAILS.includes(emailLower)) {
    res.status(403).json({ message: "Akses admin diperlukan" });
    return;
  }

  const [customer] = await db
    .select()
    .from(portalCustomersTable)
    .where(eq(portalCustomersTable.email, supabaseUser.email));

  if (!customer || customer.role !== "admin") {
    res.status(403).json({ message: "Akses admin diperlukan" });
    return;
  }

  (req as PortalAuthReq).portalCustomerId = customer.id;
  (req as PortalAuthReq).portalRole = customer.role;
  next();
}
