import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "../lib/supabaseAdmin";
import { getSessionId, getSession } from "../lib/auth";

declare global {
  namespace Express {
    interface User extends AuthUser {}

    interface Request {
      isAuthenticated(): this is AuthedRequest;

      user?: User | undefined;

      /**
       * True only when the user was authenticated via an internal BizPortal
       * session cookie (Google OAuth / Replit OIDC).  Bearer-token requests
       * from the customer portal or mobile app will have this set to false,
       * which prevents them from being treated as internal staff.
       */
      isInternalSession?: boolean;
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

  req.isInternalSession = false;

  // ── 1. Session cookie (Google OAuth / Replit OIDC) ──────────────────────────
  const sid = getSessionId(req);
  if (sid && !req.headers.authorization?.startsWith("Bearer ")) {
    const session = await getSession(sid);
    if (session?.user) {
      req.user = {
        id: session.user.id,
        email: session.user.email ?? null,
        firstName: session.user.firstName ?? null,
        lastName: session.user.lastName ?? null,
        profileImageUrl: session.user.profileImageUrl ?? null,
      };
      req.isInternalSession = true;
      next();
      return;
    }
  }

  // ── 2. Supabase Bearer token (portal / mobile only) ──────────────────────────
  // NOTE: bearer-token users are NOT considered internal staff.  They can only
  // access routes that explicitly use requirePortalAuth / requirePortalAdmin.
  // requireClerkUser() rejects requests where isInternalSession is false.
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    const supabaseUser = await verifySupabaseToken(token);
    if (supabaseUser?.email) {
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
            role: isAdmin ? "admin" : "ecommerce",
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
        // isInternalSession remains false — bearer token users are portal/mobile
      }
    }
    return next();
  }

  next();
}
