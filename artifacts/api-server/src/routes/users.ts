import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

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

const ALLOWED_ROLES = ["admin", "ecommerce", "trading", "logistics", "pos"] as const;
type AllowedRole = typeof ALLOWED_ROLES[number];

async function ensureUserRecord(userId: string, email?: string | null, name?: string | null) {
  const existing = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const isAdminEmail = !!email && emailIsAdmin(email);

  if (existing.length === 0) {
    await db.insert(usersTable).values({
      id: userId,
      email: email ?? `${userId}@unknown.com`,
      name: name ?? "User",
      role: isAdminEmail ? "admin" : "ecommerce",
    }).onConflictDoNothing();
  } else {
    const cur = existing[0];
    const patch: Partial<typeof cur> = {};
    if (email && cur.email !== email) patch.email = email;
    if (name && (!cur.name || cur.name === "User")) patch.name = name;
    if (isAdminEmail && cur.role !== "admin") patch.role = "admin";
    if (Object.keys(patch).length > 0) {
      await db.update(usersTable).set(patch).where(eq(usersTable.id, userId));
    }
  }

  const final = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  return final[0];
}

async function requireAdmin(req: any, res: any): Promise<boolean> {
  if (!req.isAuthenticated()) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  const u = await ensureUserRecord(req.user.id, req.user.email, [req.user.firstName, req.user.lastName].filter(Boolean).join(" ") || null);
  if (!u || u.role !== "admin") {
    res.status(403).json({ message: "Forbidden: admin only" });
    return false;
  }
  return true;
}

// GET /api/users/me
router.get("/me", async (req, res) => {
  if (!req.isAuthenticated()) return res.status(401).json({ message: "Unauthorized" });

  const authUser = req.user;
  const fullName = [authUser.firstName, authUser.lastName].filter(Boolean).join(" ") || null;
  await ensureUserRecord(authUser.id, authUser.email, fullName);

  // Use raw SQL to join custom_roles (not in Drizzle schema)
  const { sql } = await import("drizzle-orm");
  const rows = await db.execute(sql`
    SELECT u.id, u.email, u.name, u.role, u.division,
           cr.id AS custom_role_id, cr.name AS custom_role_name, cr.permissions AS custom_role_permissions
    FROM users u
    LEFT JOIN custom_roles cr ON cr.id = u.custom_role_id
    WHERE u.id = ${authUser.id}
  `);
  const u = rows.rows[0] as any;
  if (!u) return res.status(500).json({ message: "Failed to retrieve user record" });

  let customRolePermissions: string[] | null = null;
  if (u.custom_role_permissions != null) {
    customRolePermissions = Array.isArray(u.custom_role_permissions)
      ? u.custom_role_permissions
      : JSON.parse(u.custom_role_permissions);
  }

  return res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    division: u.division,
    customRoleId: u.custom_role_id ?? null,
    customRoleName: u.custom_role_name ?? null,
    customRolePermissions,
  });
});

// GET /api/users — admin only
router.get("/", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const { sql: rawSql } = await import("drizzle-orm");
  const rows = await db.execute(rawSql`
    SELECT u.id, u.email, u.name, u.role, u.division,
           cr.id   AS custom_role_id,
           cr.name AS custom_role_name,
           cr.color AS custom_role_color
    FROM users u
    LEFT JOIN custom_roles cr ON cr.id = u.custom_role_id
    ORDER BY u.name
  `);
  return res.json(rows.rows.map((u: any) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    division: u.division,
    customRoleId: u.custom_role_id ?? null,
    customRoleName: u.custom_role_name ?? null,
    customRoleColor: u.custom_role_color ?? null,
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
