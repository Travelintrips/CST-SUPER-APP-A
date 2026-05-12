import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "../lib/supabaseAdmin";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;
    }

    export interface AuthedRequest {
      user: User;
    }
  }
}

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  req.isAuthenticated = function (this: Request) {
    return this.user != null;
  } as Request["isAuthenticated"];

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    next();
    return;
  }

  const token = auth.slice(7);
  const supabaseUser = await verifySupabaseToken(token);
  if (!supabaseUser?.email) {
    next();
    return;
  }

  let [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, supabaseUser.email));

  if (!dbUser) {
    const meta = supabaseUser.user_metadata ?? {};
    const firstName =
      (meta.given_name as string) ||
      (meta.full_name as string)?.split(" ")[0] ||
      null;
    const lastName =
      (meta.family_name as string) ||
      (meta.full_name as string)?.split(" ").slice(1).join(" ") ||
      null;
    const profileImageUrl = (meta.avatar_url as string) || null;

    const adminEmails = (process.env.ADMIN_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = adminEmails.includes(supabaseUser.email.toLowerCase());

    const [created] = await db
      .insert(usersTable)
      .values({
        id: supabaseUser.id,
        email: supabaseUser.email,
        firstName,
        lastName,
        profileImageUrl,
        role: isAdmin ? "admin" : "admin",
      })
      .onConflictDoNothing()
      .returning();

    dbUser = created;
  }

  if (dbUser) {
    req.user = {
      id: dbUser.id,
      email: dbUser.email ?? supabaseUser.email,
      firstName: dbUser.firstName ?? null,
      lastName: dbUser.lastName ?? null,
      profileImageUrl: dbUser.profileImageUrl ?? null,
      role: dbUser.role ?? null,
    };
  }

  next();
}
