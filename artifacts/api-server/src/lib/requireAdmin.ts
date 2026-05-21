import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

/**
 * Check if a user (by userId) has a given permission string, either via their
 * system role or via a custom_role with the permission in its JSONB array.
 */
export async function hasPermission(userId: string, permission: string): Promise<boolean> {
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const u = rows[0];
  if (!u) return false;

  if (u.role === "admin") return true;

  if (u.customRoleId != null) {
    const result = await db.execute(sql`
      SELECT permissions FROM custom_roles WHERE id = ${u.customRoleId}
    `);
    const crRow = result.rows[0] as { permissions: unknown } | undefined;
    const perms = crRow?.permissions;
    if (Array.isArray(perms)) {
      if ((perms as string[]).includes(permission) || (perms as string[]).includes("admin")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Authenticated internal BizPortal user with one of the specified roles.
 * Also grants access if the user's custom_role has any of the roles (or "admin") in permissions.
 */
export async function requireRole(req: Request, res: Response, roles: string[]): Promise<boolean> {
  if (!req.isAuthenticated() || !req.isInternalSession) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }

  const userId = (req.user as { id: string }).id;
  const rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const u = rows[0];
  if (!u) {
    res.status(403).json({ message: "Forbidden: user not found" });
    return false;
  }

  if (roles.includes(u.role ?? "")) return true;

  if (u.customRoleId != null) {
    const result = await db.execute(sql`
      SELECT permissions FROM custom_roles WHERE id = ${u.customRoleId}
    `);
    const crRow = result.rows[0] as { permissions: unknown } | undefined;
    const perms = crRow?.permissions;
    if (Array.isArray(perms)) {
      const hasMatch = roles.some(
        (r) => (perms as string[]).includes(r) || (perms as string[]).includes("admin"),
      );
      if (hasMatch) return true;
    }
  }

  res.status(403).json({ message: "Forbidden: insufficient role" });
  return false;
}

/**
 * Any authenticated **internal** BizPortal staff user.
 * Rejects customer-portal and mobile bearer tokens (req.isInternalSession = false).
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
 * Authenticated internal BizPortal user with role = "admin",
 * OR a user whose custom_role includes "admin" in its JSONB permissions array.
 */
export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (!req.isAuthenticated() || !req.isInternalSession) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }

  const userId = (req.user as { id: string }).id;
  const allowed = await hasPermission(userId, "admin");
  if (!allowed) {
    res.status(403).json({ message: "Forbidden: admin only" });
    return false;
  }
  return true;
}
