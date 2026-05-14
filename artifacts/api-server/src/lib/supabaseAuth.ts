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
    // Never trust client-supplied role from user_metadata — always default to "customer".
    // Admin elevation is handled exclusively via the PORTAL_ADMIN_EMAILS allowlist.
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
  } else if (PORTAL_ADMIN_EMAILS.includes(supabaseUser.email.toLowerCase()) && customer.role !== "admin") {
    await db
      .update(portalCustomersTable)
      .set({ role: "admin" })
      .where(eq(portalCustomersTable.id, customer.id));
    customer = { ...customer, role: "admin" };
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
