import * as oidc from "openid-client";
import { OAuth2Client } from "google-auth-library";
import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "crypto";
import {
  GetCurrentAuthUserResponse,
  ExchangeMobileAuthorizationCodeBody,
  ExchangeMobileAuthorizationCodeResponse,
  LogoutMobileSessionResponse,
} from "@workspace/api-zod";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { and, eq, ne } from "drizzle-orm";
import { saveOauthState, consumeOauthState } from "../lib/oauthStateMigration";
import {
  clearSession,
  getOidcConfig,
  getSessionId,
  createSession,
  deleteSession,
  SESSION_COOKIE,
  SESSION_TTL,
  ISSUER_URL,
  type SessionData,
} from "../lib/auth";
import { writeAuditLog, extractRequestMeta } from "../lib/auditLog.js";
import { verifySupabaseToken } from "../lib/supabaseAdmin";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;

// Startup diagnostic — shows secret length & suffix to verify correct value is loaded
console.log(
  `[Google OAuth] client_id suffix: ...${(GOOGLE_CLIENT_ID ?? "").slice(-20)}` +
  ` | secret length: ${(GOOGLE_CLIENT_SECRET ?? "").length}` +
  ` | secret suffix: ...${(GOOGLE_CLIENT_SECRET ?? "").slice(-4)}`
);

function getGoogleOAuthClient(redirectUri: string) {
  return new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

const OIDC_COOKIE_TTL = 10 * 60 * 1000;

const router: IRouter = Router();

function getOrigin(req: Request): string {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host =
    req.headers["x-forwarded-host"] || req.headers["host"] || "localhost";
  return `${proto}://${host}`;
}

function getGoogleOrigin(req: Request): string {
  // In Replit dev (NOT deployed), always prefer the stable dev domain.
  // REPLIT_DEPLOYMENT=1 is injected by Replit in deployed environments only.
  // This check must come FIRST so global secrets (APP_URL, etc.) don't
  // accidentally force dev logins to redirect to the production domain.
  if (process.env.REPLIT_DEV_DOMAIN && !process.env.REPLIT_DEPLOYMENT) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  // Explicit override for production (set GOOGLE_REDIRECT_BASE_URL in secrets)
  const override = process.env.GOOGLE_REDIRECT_BASE_URL || process.env.GOOGLE_CALLBACK_ORIGIN;
  if (override) {
    return override.replace(/\/$/, "");
  }
  // Use APP_URL if set (e.g. https://cstlogistic.co.id)
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, "");
  }
  return getOrigin(req);
}

function setSessionCookie(res: Response, sid: string) {
  // In the Replit dev environment the BizPortal frontend runs inside a
  // cross-site iframe (top-level: replit.com, API/app: *.replit.dev).
  // SameSite=Lax blocks cookies on cross-site fetch requests, which makes
  // /api/auth/user always return {user:null} inside the preview pane.
  // We use SameSite=None (which still requires Secure=true) so the session
  // cookie is included in credentialed fetch calls from the iframe.
  // In production (REPLIT_DEPLOYMENT=1) we revert to Lax for CSRF safety.
  const isReplitDev = !!process.env.REPLIT_DEV_DOMAIN && !process.env.REPLIT_DEPLOYMENT;
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    sameSite: isReplitDev ? "none" : "lax",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

function setOidcCookie(res: Response, name: string, value: string) {
  res.cookie(name, value, {
    httpOnly: true,
    secure: true,
    // Same reasoning as setSessionCookie above. The OIDC state/nonce cookies
    // are consumed by the Google callback (a top-level GET navigation) which
    // "lax" permits.
    sameSite: "lax",
    path: "/",
    maxAge: OIDC_COOKIE_TTL,
  });
}

function getSafeReturnTo(value: unknown): string {
  if (value === "popup") return "popup";
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }
  return value;
}

async function upsertUser(claims: Record<string, unknown>) {
  const id = claims.sub as string;
  const email = (claims.email as string) || "";
  const firstName = (claims.first_name as string) || null;
  const lastName = (claims.last_name as string) || null;
  const profileImageUrl = ((claims.profile_image_url || claims.picture) as string) || null;
  const name = [firstName, lastName].filter(Boolean).join(" ") || email.split("@")[0] || id;

  // Remove any stale user rows with the same email but a different id
  // (e.g. leftover Clerk users after migration). No FK constraints on users.id
  // so this is safe.
  if (email) {
    await db
      .delete(usersTable)
      .where(and(eq(usersTable.email, email), ne(usersTable.id, id)));
  }

  // Auto-promote to admin if email matches hardcoded list or ADMIN_EMAIL/ADMIN_EMAILS env var
  const adminEmails = [
    "admcst001@gmail.com",
    "divatranssoetta@gmail.com",
    ...(process.env.ADMIN_EMAIL ?? "").split(","),
    ...(process.env.ADMIN_EMAILS ?? "").split(","),
  ]
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.includes(email.toLowerCase());

  const [user] = await db
    .insert(usersTable)
    .values({
      id,
      email,
      name,
      firstName,
      lastName,
      profileImageUrl,
      role: isAdmin ? ("admin" as const) : ("ecommerce" as const),
    })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: {
        email,
        name,
        firstName,
        lastName,
        profileImageUrl,
        updatedAt: new Date(),
        // Promote to admin if configured, but never demote existing role
        ...(isAdmin ? { role: "admin" as const } : {}),
      },
    })
    .returning();
  return user;
}

router.get("/auth/user", (req: Request, res: Response) => {
  res.json(
    GetCurrentAuthUserResponse.parse({
      user: req.isAuthenticated() ? req.user : null,
    }),
  );
});

router.get("/login", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const returnTo = getSafeReturnTo(req.query.returnTo);

  const state = oidc.randomState();
  const nonce = oidc.randomNonce();
  const codeVerifier = oidc.randomPKCECodeVerifier();
  const codeChallenge = await oidc.calculatePKCECodeChallenge(codeVerifier);

  const redirectTo = oidc.buildAuthorizationUrl(config, {
    redirect_uri: callbackUrl,
    scope: "openid email profile offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    prompt: "login consent",
    state,
    nonce,
  });

  setOidcCookie(res, "code_verifier", codeVerifier);
  setOidcCookie(res, "nonce", nonce);
  setOidcCookie(res, "state", state);
  setOidcCookie(res, "return_to", returnTo);

  res.redirect(redirectTo.href);
});

// Query params are not validated because the OIDC provider may include
// parameters not expressed in the schema.
router.get("/callback", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const callbackUrl = `${getOrigin(req)}/api/callback`;

  const codeVerifier = req.cookies?.code_verifier;
  const nonce = req.cookies?.nonce;
  const expectedState = req.cookies?.state;

  if (!codeVerifier || !expectedState) {
    res.redirect("/api/login");
    return;
  }

  const currentUrl = new URL(
    `${callbackUrl}?${new URL(req.url, `http://${req.headers.host}`).searchParams}`,
  );

  let tokens: oidc.TokenEndpointResponse & oidc.TokenEndpointResponseHelpers;
  try {
    tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
      pkceCodeVerifier: codeVerifier,
      expectedNonce: nonce,
      expectedState,
      idTokenExpected: true,
    });
  } catch {
    res.redirect("/api/login");
    return;
  }

  const returnTo = getSafeReturnTo(req.cookies?.return_to);

  res.clearCookie("code_verifier", { path: "/" });
  res.clearCookie("nonce", { path: "/" });
  res.clearCookie("state", { path: "/" });
  res.clearCookie("return_to", { path: "/" });

  const claims = tokens.claims();
  if (!claims) {
    res.redirect("/api/login");
    return;
  }

  const dbUser = await upsertUser(
    claims as unknown as Record<string, unknown>,
  );

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.redirect(returnTo);
});

// ─── Supabase Token Exchange → Session Cookie ─────────────────────────────────
// BizPortal frontend melakukan Supabase Google OAuth via popup, lalu POST token
// ke sini untuk mendapat session cookie (supaya semua API call tetap pakai cookie).

router.post("/auth/supabase-exchange", async (req: Request, res: Response) => {
  const { access_token } = req.body as { access_token?: string };
  if (!access_token || typeof access_token !== "string") {
    res.status(400).json({ error: "access_token required" });
    return;
  }

  const supabaseUser = await verifySupabaseToken(access_token);
  if (!supabaseUser?.email) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  // Cari user di DB berdasarkan email (handle migrasi dari id "google_<sub>")
  let [dbUser] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, supabaseUser.email));

  if (!dbUser) {
    const meta = supabaseUser.user_metadata ?? {};
    const adminEmails = (process.env.ADMIN_EMAIL ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isAdmin = adminEmails.includes(supabaseUser.email.toLowerCase());

    const firstName =
      (meta.given_name as string) ||
      (meta.full_name as string)?.split(" ")[0] ||
      null;
    const lastName =
      (meta.family_name as string) ||
      (meta.full_name as string)?.split(" ").slice(1).join(" ") ||
      null;
    const profileImageUrl =
      (meta.avatar_url as string) || (meta.picture as string) || null;

    try {
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
        .returning();
      dbUser = created;
    } catch {
      // Race condition — coba select lagi
      const [retry] = await db
        .select()
        .from(usersTable)
        .where(eq(usersTable.email, supabaseUser.email));
      if (!retry) {
        res.status(500).json({ error: "Failed to create user" });
        return;
      }
      dbUser = retry;
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
    },
    access_token,
    expires_at: now + 3600,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);

  const _meta = extractRequestMeta(req);
  writeAuditLog({
    companyId: dbUser.companyId ?? null,
    userId: dbUser.id,
    userEmail: dbUser.email ?? null,
    action: "login",
    module: "auth",
    referenceId: "supabase-exchange",
    newData: { email: dbUser.email, role: dbUser.role },
    ipAddress: _meta.ipAddress,
    userAgent: _meta.userAgent,
  });

  res.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: dbUser.role,
    },
  });
});

// ─── Dev Login Bypass (dev only, disabled in production) ──────────────────────

router.post("/auth/dev-login", async (req: Request, res: Response) => {
  if (process.env.REPLIT_DEPLOYMENT) {
    res.status(403).json({ error: "Not available in production" });
    return;
  }

  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "email wajib diisi" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();

  const adminEmails = (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const isAdmin = adminEmails.length === 0 || adminEmails.includes(normalizedEmail);
  const parts = normalizedEmail.split("@")[0].split(".");
  const firstName = parts[0] ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) : "Dev";
  const lastName = parts[1] ? parts[1].charAt(0).toUpperCase() + parts[1].slice(1) : "User";

  // Build a synthetic user as fallback when DB is unavailable
  const syntheticUser = {
    id: `dev_${crypto.randomBytes(8).toString("hex")}`,
    email: normalizedEmail,
    name: `${firstName} ${lastName}`.trim(),
    firstName,
    lastName,
    role: isAdmin ? "admin" : "ecommerce",
    profileImageUrl: null as string | null,
    companyId: null as number | null,
  };

  let dbUser: typeof syntheticUser;
  try {
    let [found] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
    if (!found) {
      try {
        const [created] = await db.insert(usersTable).values({
          id: syntheticUser.id,
          email: normalizedEmail,
          name: syntheticUser.name,
          firstName,
          lastName,
          role: syntheticUser.role,
        }).returning();
        found = created;
      } catch {
        const [retry] = await db.select().from(usersTable).where(eq(usersTable.email, normalizedEmail));
        found = retry;
      }
    }
    // Jika email ada di ADMIN_EMAIL tapi role di DB bukan admin, update sekarang
    if (found && isAdmin && found.role !== "admin") {
      const [updated] = await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, found.id)).returning();
      if (updated) found = updated;
    }
    dbUser = found ?? syntheticUser;
  } catch {
    // DB unavailable — use synthetic user (session stored in memory)
    dbUser = syntheticUser;
  }

  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: dbUser.role,
    },
    access_token: `dev_${crypto.randomBytes(16).toString("hex")}`,
    expires_at: Math.floor(Date.now() / 1000) + SESSION_TTL / 1000,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  res.json({
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: dbUser.role,
    },
  });
});

// ─── Google OAuth ─────────────────────────────────────────────────────────────

router.get("/login/google", async (req: Request, res: Response) => {
  const redirectUri = `${getGoogleOrigin(req)}/api/callback/google`;
  const returnTo = getSafeReturnTo(req.query.returnTo);
  const state = crypto.randomBytes(16).toString("hex");

  req.log.info({ redirectUri }, "[Google OAuth] initiating login, redirect_uri");

  // Store state in DB (domain-agnostic — avoids cross-subdomain cookie issues)
  await saveOauthState(state, returnTo);

  const client = getGoogleOAuthClient(redirectUri);
  const authUrl = client.generateAuthUrl({
    access_type: "offline",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });

  res.redirect(authUrl);
});

router.get("/callback/google", async (req: Request, res: Response) => {
  const { code, state, error } = req.query as Record<string, string>;

  req.log.info(
    { hasCode: !!code, hasState: !!state, error: error ?? null },
    "[Google OAuth] callback received"
  );

  if (error || !code || !state) {
    req.log.warn({ error, hasCode: !!code, hasState: !!state }, "[Google OAuth] callback error from Google — redirecting to login");
    res.redirect("/bizportal/");
    return;
  }

  // Look up state from DB (domain-agnostic, no cookie dependency)
  const returnTo = await consumeOauthState(state);

  if (!returnTo) {
    req.log.warn({ stateToken: state }, "[Google OAuth] state not found or expired — redirecting to login");
    res.redirect("/bizportal/");
    return;
  }

  const redirectUri = `${getGoogleOrigin(req)}/api/callback/google`;
  const client = getGoogleOAuthClient(redirectUri);

  try {
    // Manual token exchange — menggunakan fetch + URLSearchParams untuk memastikan
    // code di-encode dengan benar di request body (menghindari bug gaxios v7).
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.json().catch(() => ({})) as Record<string, unknown>;
      req.log.error({ status: tokenRes.status, errBody }, "[Google OAuth] token endpoint error");
      throw new Error(`Token exchange failed: ${errBody.error ?? tokenRes.status}`);
    }

    const tokenData = await tokenRes.json() as {
      id_token?: string;
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokenData.id_token) throw new Error("No id_token in token response");

    const ticket = await client.verifyIdToken({
      idToken: tokenData.id_token,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.sub) throw new Error("Invalid token payload");

    const claims: Record<string, unknown> = {
      sub: `google_${payload.sub}`,
      email: payload.email,
      first_name: payload.given_name || null,
      last_name: payload.family_name || null,
      picture: payload.picture || null,
    };

    const dbUser = await upsertUser(claims);

    const now = Math.floor(Date.now() / 1000);
    const sessionData: SessionData = {
      user: {
        id: dbUser.id,
        email: dbUser.email,
        firstName: dbUser.firstName,
        lastName: dbUser.lastName,
        profileImageUrl: dbUser.profileImageUrl,
      },
      access_token: tokenData.access_token || "",
      refresh_token: tokenData.refresh_token || undefined,
      expires_at: tokenData.expires_in ? now + tokenData.expires_in : now + 3600,
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
    // Audit log: login berhasil via Google OAuth
    const _meta = extractRequestMeta(req);
    writeAuditLog({
      companyId: dbUser.companyId ?? null,
      userId: dbUser.id,
      userEmail: dbUser.email ?? null,
      action: "login",
      module: "auth",
      referenceId: "google-oauth",
      newData: { email: dbUser.email, role: dbUser.role },
      ipAddress: _meta.ipAddress,
      userAgent: _meta.userAgent,
    });
    // If returnTo is the sentinel value "popup", render a page that signals
    // the parent window via postMessage then closes itself.
    if (returnTo === "popup") {
      res.send(`<!DOCTYPE html><html><body><script>
        try { window.opener && window.opener.postMessage("auth:done", "*"); } catch(e){}
        window.close();
      </script><p>Login berhasil. Tutup tab ini jika tidak tertutup otomatis.</p></body></html>`);
      return;
    }
    res.redirect(returnTo);
  } catch (err) {
    req.log.error({ err }, "[Google OAuth] callback token exchange error");
    if (returnTo === "popup") {
      res.send(`<!DOCTYPE html><html><body><script>
        try { window.opener && window.opener.postMessage("auth:error", "*"); } catch(e){}
        window.close();
      </script><p>Login gagal. Tutup tab ini dan coba lagi.</p></body></html>`);
      return;
    }
    res.redirect(returnTo);
  }
});

// ─── Dev Login (development only) ─────────────────────────────────────────────

router.get("/dev-users", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "development") {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const users = await db
    .select({
      id: usersTable.id,
      email: usersTable.email,
      firstName: usersTable.firstName,
      lastName: usersTable.lastName,
      role: usersTable.role,
    })
    .from(usersTable)
    .orderBy(usersTable.role, usersTable.email);
  res.json({ users });
});

router.post("/dev-login", async (req: Request, res: Response) => {
  if (process.env.REPLIT_DEPLOYMENT === "1") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  // Build synthetic user as fallback when DB is unavailable
  const _nameParts = email.split("@")[0].split(".");
  const _synth = {
    id: `dev_${email.replace(/[^a-z0-9]/gi, "_")}`,
    email,
    firstName: _nameParts[0] ?? "Dev",
    lastName: _nameParts[1] ?? null,
    profileImageUrl: null as string | null,
    role: "admin" as string | null,
    companyId: null as number | null,
  };

  const _adminEmails2 = (process.env.ADMIN_EMAIL ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const _isAdmin2 = _adminEmails2.length === 0 || _adminEmails2.includes(email.trim().toLowerCase());

  let dbUser: typeof _synth;
  try {
    // Kalau user dengan email ini sudah ada di DB (mis. dari OIDC prod), langsung pakai
    // agar tidak trigger DELETE yang bisa gagal karena FK constraint di tabel lain.
    const [existingUser] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (existingUser) {
      dbUser = existingUser;
    } else {
      const claims: Record<string, unknown> = {
        sub: _synth.id,
        email,
        first_name: _synth.firstName,
        last_name: null,
        picture: null,
      };
      dbUser = await upsertUser(claims);
    }
    // Jika email ada di ADMIN_EMAIL tapi role di DB bukan admin, update sekarang
    if (dbUser && _isAdmin2 && dbUser.role !== "admin") {
      const [updated] = await db.update(usersTable).set({ role: "admin" }).where(eq(usersTable.id, dbUser.id)).returning();
      if (updated) dbUser = updated;
    }
  } catch {
    // DB unavailable — use synthetic user (session stored in memory)
    dbUser = _synth;
  }
  const now = Math.floor(Date.now() / 1000);
  const sessionData: SessionData = {
    user: {
      id: dbUser.id,
      email: dbUser.email,
      firstName: dbUser.firstName,
      lastName: dbUser.lastName,
      profileImageUrl: dbUser.profileImageUrl,
      role: dbUser.role,
      companyId: dbUser.companyId,
    },
    access_token: "dev",
    refresh_token: undefined,
    expires_at: now + 86400,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  req.log.info({ email }, "[Dev Login] session created");
  // Audit log: dev login
  const _devMeta = extractRequestMeta(req);
  writeAuditLog({
    companyId: dbUser.companyId ?? null,
    userId: dbUser.id,
    userEmail: dbUser.email ?? null,
    action: "login",
    module: "auth",
    referenceId: "dev-login",
    newData: { email: dbUser.email, role: dbUser.role },
    ipAddress: _devMeta.ipAddress,
    userAgent: _devMeta.userAgent,
  });

  const redirectTo = typeof req.query.redirect === "string" ? req.query.redirect : null;
  if (redirectTo) {
    res.redirect(302, redirectTo);
    return;
  }
  res.json({ ok: true, email: dbUser.email, role: dbUser.role });
});

// ─── Logout ───────────────────────────────────────────────────────────────────

router.get("/logout", async (req: Request, res: Response) => {
  const config = await getOidcConfig();
  const origin = getOrigin(req);
  const redirectPath = (req.query.redirect as string) || "/";
  const postLogoutUri = `${origin}${redirectPath.startsWith("/") ? redirectPath : "/" + redirectPath}`;

  const sid = getSessionId(req);
  await clearSession(res, sid);

  const endSessionUrl = oidc.buildEndSessionUrl(config, {
    client_id: process.env.REPL_ID!,
    post_logout_redirect_uri: postLogoutUri,
  });

  res.redirect(endSessionUrl.href);
});

router.post(
  "/mobile-auth/token-exchange",
  async (req: Request, res: Response) => {
    const parsed = ExchangeMobileAuthorizationCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Missing or invalid required parameters" });
      return;
    }

    const { code, code_verifier, redirect_uri, state, nonce } = parsed.data;

    try {
      const config = await getOidcConfig();

      const callbackUrl = new URL(redirect_uri);
      callbackUrl.searchParams.set("code", code);
      callbackUrl.searchParams.set("state", state);
      callbackUrl.searchParams.set("iss", ISSUER_URL);

      const tokens = await oidc.authorizationCodeGrant(config, callbackUrl, {
        pkceCodeVerifier: code_verifier,
        expectedNonce: nonce ?? undefined,
        expectedState: state,
        idTokenExpected: true,
      });

      const claims = tokens.claims();
      if (!claims) {
        res.status(401).json({ error: "No claims in ID token" });
        return;
      }

      const dbUser = await upsertUser(
        claims as unknown as Record<string, unknown>,
      );

      const now = Math.floor(Date.now() / 1000);
      const sessionData: SessionData = {
        user: {
          id: dbUser.id,
          email: dbUser.email,
          firstName: dbUser.firstName,
          lastName: dbUser.lastName,
          profileImageUrl: dbUser.profileImageUrl,
        },
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: tokens.expiresIn() ? now + tokens.expiresIn()! : claims.exp,
      };

      const sid = await createSession(sessionData);
      res.json(ExchangeMobileAuthorizationCodeResponse.parse({ token: sid }));
    } catch (err) {
      req.log.error({ err }, "Mobile token exchange error");
      res.status(500).json({ error: "Token exchange failed" });
    }
  },
);

router.post("/mobile-auth/logout", async (req: Request, res: Response) => {
  const sid = getSessionId(req);
  if (sid) {
    await deleteSession(sid);
  }
  res.json(LogoutMobileSessionResponse.parse({ success: true }));
});

export default router;
