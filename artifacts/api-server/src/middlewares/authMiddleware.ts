import { type Request, type Response, type NextFunction } from "express";
import type { AuthUser } from "../lib/auth";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { verifySupabaseToken } from "../lib/supabaseAdmin";
import { getSessionId, getSession } from "../lib/auth";

// ── In-memory cache: userId → { companyId, role } — TTL 5 min ────────────────
const _userCtxCache = new Map<string, { companyId: number | null; role: string | null; cachedAt: number }>();
const _USER_CTX_TTL = 5 * 60 * 1000;

async function _loadUserCtx(userId: string): Promise<{ companyId: number | null; role: string | null }> {
  const now = Date.now();
  const cached = _userCtxCache.get(userId);
  if (cached && now - cached.cachedAt < _USER_CTX_TTL) {
    return { companyId: cached.companyId, role: cached.role };
  }
  const [u] = await db
    .select({ companyId: usersTable.companyId, role: usersTable.role })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const result = { companyId: u?.companyId ?? null, role: u?.role ?? null };
  _userCtxCache.set(userId, { ...result, cachedAt: now });
  return result;
}

/** Call after updating a user's company or role in the DB to force a cache refresh. */
export function invalidateUserCtxCache(userId: string): void {
  _userCtxCache.delete(userId);
}

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
    try {
      const session = await getSession(sid);
      if (session?.user) {
        // Load DB context (role, companyId). On transient DB failure, fall back
        // to values stored in the session so the user stays authenticated.
        let ctx: { companyId: number | null; role: string | null };
        try {
          ctx = await _loadUserCtx(session.user.id);
        } catch (ctxErr) {
          const msg = ctxErr instanceof Error ? ctxErr.message : String(ctxErr);
          req.log?.warn?.({ sid: sid.slice(0, 8) + "...", err: msg }, "[authMiddleware] _loadUserCtx DB error, falling back to session data");
          ctx = {
            role: (session.user as { role?: string | null }).role ?? null,
            companyId: (session.user as { companyId?: number | null }).companyId ?? null,
          };
        }
        req.user = {
          id: session.user.id,
          email: session.user.email ?? null,
          firstName: session.user.firstName ?? null,
          lastName: session.user.lastName ?? null,
          profileImageUrl: session.user.profileImageUrl ?? null,
          role: ctx.role,
          companyId: ctx.companyId,
        };
        req.isInternalSession = true;
        next();
        return;
      }
    } catch (err) {
      // DB transient error reading the session itself — log and continue unauthenticated.
      const msg = err instanceof Error ? err.message : String(err);
      req.log?.warn?.({ sid: sid.slice(0, 8) + "...", err: msg }, "[authMiddleware] getSession failed, treating as unauthenticated");
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

        // Security: role is NEVER derived from user_metadata (client-controlled).
        // New bearer-token users are always provisioned as "ecommerce" unless their
        // email is on the server-side ADMIN_EMAIL allowlist. This prevents any
        // Supabase portal/mobile user from self-elevating to ERP admin by obtaining
        // a valid bearer token.
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
          companyId: dbUser.companyId ?? null,
        };
        // isInternalSession remains false — bearer token users are portal/mobile
      }
    }
    return next();
  }

  next();
}
