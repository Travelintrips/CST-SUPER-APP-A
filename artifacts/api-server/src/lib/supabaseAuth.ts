import { type Request, type Response, type NextFunction } from "express";
import { db, portalCustomersTable, portalCustomerServicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "./supabaseAdmin";

export type PortalAuthReq = Request & { portalCustomerId: number; portalRole: string };

const PORTAL_ADMIN_EMAILS = (process.env.PORTAL_ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requirePortalAuth(req: Request, res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }

  const token = auth.slice(7);
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
    const adminListConfigured = PORTAL_ADMIN_EMAILS.length > 0;

    if (inAdminList && customer.role !== "admin") {
      // Promote to admin — email is in server-side allowlist
      await db
        .update(portalCustomersTable)
        .set({ role: "admin" })
        .where(eq(portalCustomersTable.id, customer.id));
      customer = { ...customer, role: "admin" };
    } else if (!inAdminList && adminListConfigured && customer.role === "admin") {
      // Downgrade: stored role is "admin" but email is NOT in the server-side allowlist.
      // This remediates accounts that were elevated via client-controlled metadata before the fix.
      await db
        .update(portalCustomersTable)
        .set({ role: "customer" })
        .where(eq(portalCustomersTable.id, customer.id));
      customer = { ...customer, role: "customer" };
    }
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
