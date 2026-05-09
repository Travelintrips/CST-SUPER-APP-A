import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_EMAILS = (process.env["ADMIN_EMAILS"] ?? "divatranssoetta@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ADMIN_EMAIL_DOMAINS = (process.env["ADMIN_EMAIL_DOMAINS"] ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function emailIsAdmin(email: string): boolean {
  const lower = email.toLowerCase();
  if (ADMIN_EMAILS.includes(lower)) return true;
  const domain = lower.split("@")[1] ?? "";
  return !!domain && ADMIN_EMAIL_DOMAINS.includes(domain);
}

const PORTAL_ADMIN_KEY = process.env["PORTAL_ADMIN_KEY"] ?? "";

/** Any authenticated user — used for BizPortal staff operations */
export async function requireClerkUser(req: Request, res: Response): Promise<boolean> {
  if (PORTAL_ADMIN_KEY && req.headers["x-admin-key"] === PORTAL_ADMIN_KEY) {
    return true;
  }
  if (!req.isAuthenticated()) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  return true;
}

export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  if (PORTAL_ADMIN_KEY && req.headers["x-admin-key"] === PORTAL_ADMIN_KEY) {
    return true;
  }

  if (!req.isAuthenticated()) {
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
