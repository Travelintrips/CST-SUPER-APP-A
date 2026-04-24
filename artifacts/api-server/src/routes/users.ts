import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth, clerkClient } from "@clerk/express";

const router = Router();

const ADMIN_EMAILS = (process.env["ADMIN_EMAILS"] ?? "divatranssoetta@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const ALLOWED_ROLES = ["admin", "ecommerce", "trading", "logistics", "pos"] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

async function fetchClerkEmail(userId: string): Promise<{ email: string; name: string; verified: boolean } | null> {
  try {
    const u = await clerkClient.users.getUser(userId);
    const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
    const chosen = primary ?? u.emailAddresses[0];
    const email = chosen?.emailAddress ?? null;
    if (!email) return null;
    const verified = chosen?.verification?.status === "verified";
    const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.username || email;
    return { email, name, verified };
  } catch {
    return null;
  }
}

async function ensureUserRecord(userId: string) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const clerkInfo = await fetchClerkEmail(userId);
  // Only auto-promote to admin when the Clerk email is verified AND in the allowlist.
  const isAdminEmail = !!clerkInfo
    && clerkInfo.verified
    && ADMIN_EMAILS.includes(clerkInfo.email.toLowerCase());

  if (existing.length === 0) {
    await db.insert(usersTable).values({
      id: userId,
      email: clerkInfo?.email ?? `${userId}@unknown.com`,
      name: clerkInfo?.name ?? "User",
      role: isAdminEmail ? "admin" : "ecommerce",
    }).onConflictDoNothing();
  } else {
    const cur = existing[0];
    const patch: Partial<typeof cur> = {};
    if (clerkInfo) {
      if (cur.email !== clerkInfo.email) patch.email = clerkInfo.email;
      if (!cur.name || cur.name === "User") patch.name = clerkInfo.name;
    }
    if (isAdminEmail && cur.role !== "admin") patch.role = "admin";
    if (Object.keys(patch).length > 0) {
      await db.update(usersTable).set(patch).where(eq(usersTable.id, userId));
    }
  }

  const final = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return final[0];
}

async function requireAdmin(req: any, res: any): Promise<boolean> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  // Provision the user record (and apply admin allowlist) before checking the role.
  // This avoids a first-login race where /api/users is hit before /api/users/me has provisioned.
  const u = await ensureUserRecord(userId);
  if (!u || u.role !== "admin") {
    res.status(403).json({ message: "Forbidden: admin only" });
    return false;
  }
  return true;
}

// GET /api/users/me
router.get("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) return res.status(401).json({ message: "Unauthorized" });

  const u = await ensureUserRecord(userId);
  return res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    division: u.division,
  });
});

// GET /api/users — admin only
router.get("/", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const all = await db.select().from(usersTable);
  return res.json(all.map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    division: u.division,
  })));
});

// PUT /api/users/:id — admin only
router.put("/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { id } = req.params;
  const { role, division, name } = req.body as { role: AllowedRole; division?: string | null; name?: string };

  if (!role || !ALLOWED_ROLES.includes(role)) {
    return res.status(400).json({ message: "Invalid role" });
  }

  const patch: Record<string, unknown> = { role };
  if (division !== undefined) patch["division"] = division;
  if (typeof name === "string" && name.trim()) patch["name"] = name.trim();

  const [updated] = await db.update(usersTable).set(patch).where(eq(usersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "User not found" });

  return res.json({
    id: updated.id,
    email: updated.email,
    name: updated.name,
    role: updated.role,
    division: updated.division,
  });
});

export default router;
