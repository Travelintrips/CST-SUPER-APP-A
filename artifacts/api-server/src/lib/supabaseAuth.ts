import { type Request, type Response, type NextFunction } from "express";
import { db, portalCustomersTable, portalCustomerServicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "./supabaseAdmin";
import { createHmac } from "crypto";

const DEV_SECRET = process.env.DEV_PORTAL_SECRET ?? "dev-portal-secret-local-only";
const IS_PROD = process.env.NODE_ENV === "production";

function signDevToken(payload: object): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", DEV_SECRET).update(b64).digest("hex");
  return `devportal.${b64}.${sig}`;
}

function verifyDevToken(token: string): { id: number; email: string; role: string } | null {
  if (IS_PROD) return null;
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

export { signDevToken, verifyDevToken };

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

  // Dev-login bypass — only in non-production
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
    // Security: role is NEVER copied from Supabase user_metadata (client-controlled).
    // An attacker can call supabase.auth.signUp({ options: { data: { role: "admin" } } })
    // to set arbitrary metadata, so we must not consume it for role assignment.
    // Admin elevation uses the server-side PORTAL_ADMIN_EMAILS env-var allowlist only.
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
    const inAdminList = PORTAL_ADMIN_EMAILS.includes(emailLower);

    if (inAdminList && customer.role !== "admin") {
      // Promote to admin — email is in server-side allowlist
      await db
        .update(portalCustomersTable)
        .set({ role: "admin" })
        .where(eq(portalCustomersTable.id, customer.id));
      customer = { ...customer, role: "admin" };
    }
    // Role stored in DB is the source of truth — never auto-downgrade
  }

  (req as PortalAuthReq).portalCustomerId = customer.id;
  (req as PortalAuthReq).portalRole = customer.role;
  next();
}

export async function requirePortalAdmin(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);

  // Dev-login bypass — only in non-production
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

  const supabaseUser = await verifySupabaseToken(token);
  if (!supabaseUser?.email) {
    res.status(401).json({ message: "Invalid or expired token" });
    return;
  }

  const emailLower = supabaseUser.email.toLowerCase();

  // Enforce server-side allowlist when configured.
  // A pre-existing forged "admin" row cannot bypass this check.
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
