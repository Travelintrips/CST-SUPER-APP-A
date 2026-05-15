import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Authenticated internal BizPortal user with one of the specified roles.
 *
 * Same session-only restriction as requireAdmin().
 */
export async function requireRole(req: Request, res: Response, roles: string[]): Promise<boolean> {
  if (!req.isAuthenticated() || !req.isInternalSession) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }

  const userId = (req.user as { id: string }).id;
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const u = rows[0];
  if (!u || !roles.includes(u.role ?? "")) {
    res.status(403).json({ message: "Forbidden: insufficient role" });
    return false;
  }
  return true;
}

/**
 * Any authenticated **internal** BizPortal staff user.
 *
 * "Internal" means the request was authenticated via a BizPortal session
 * cookie (Google OAuth / Replit OIDC).  Customer-portal and mobile bearer
 * tokens set req.isInternalSession = false and are explicitly rejected here,
 * even though authMiddleware may have resolved req.user for them.
 *
 * NOTE: x-admin-key / PORTAL_ADMIN_KEY is intentionally NOT accepted here.
 * That secret is scoped to the customer-portal bootstrap workflow only and
 * must not be used as a universal bypass for internal staff routes.
 */
export async function requireClerkUser(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated() || !req.isInternalSession) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  if ((req.user as { role?: string | null }).role === "ecommerce") {
    res.status(403).json({ message: "Forbidden: staff access only" });
    return false;
  }
  return true;
}

/**
 * Authenticated internal BizPortal user with role = "admin".
 *
 * Same session-only restriction as requireClerkUser().
 * x-admin-key is NOT accepted — see note above.
 */
export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated() || !req.isInternalSession) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }

  const userId = (req.user as { id: string }).id;
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const u = rows[0];
  if (!u || u.role !== "admin") {
    res.status(403).json({ message: "Forbidden: admin only" });
    return false;
  }
  return true;
}
