import type { Request, Response } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";

const ADMIN_EMAILS = (process.env["ADMIN_EMAILS"] ?? "divatranssoetta@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

async function fetchClerkEmail(userId: string) {
  try {
    const u = await clerkClient.users.getUser(userId);
    const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
    const chosen = primary ?? u.emailAddresses[0];
    const email = chosen?.emailAddress ?? null;
    if (!email) return null;
    const verified = chosen?.verification?.status === "verified";
    return { email, verified };
  } catch {
    return null;
  }
}

export async function requireAdmin(req: Request, res: Response): Promise<boolean> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  let rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (rows.length === 0) {
    const info = await fetchClerkEmail(userId);
    const isAdmin = !!info && info.verified && ADMIN_EMAILS.includes(info.email.toLowerCase());
    await db.insert(usersTable).values({
      id: userId,
      email: info?.email ?? `${userId}@unknown.com`,
      name: "User",
      role: isAdmin ? "admin" : "ecommerce",
    }).onConflictDoNothing();
    rows = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  }
  const u = rows[0];
  if (!u || u.role !== "admin") {
    res.status(403).json({ message: "Forbidden: admin only" });
    return false;
  }
  return true;
}
