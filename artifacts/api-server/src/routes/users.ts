import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";

const router = Router();

// GET /api/users/me
router.get("/me", async (req, res) => {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  let user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  if (user.length === 0) {
    // Auto-create user on first login with default role
    const clerkUser = (req as any).auth?.sessionClaims;
    const email = clerkUser?.email || `${userId}@unknown.com`;
    const name = clerkUser?.name || "User";

    await db.insert(usersTable).values({
      id: userId,
      email,
      name,
      role: "ecommerce",
    }).onConflictDoNothing();

    user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  }

  const u = user[0];
  return res.json({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    division: u.division,
  });
});

export default router;
