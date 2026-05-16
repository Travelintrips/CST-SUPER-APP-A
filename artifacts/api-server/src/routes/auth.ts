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
  res.cookie(SESSION_COOKIE, sid, {
    httpOnly: true,
    secure: true,
    // "lax" prevents the browser from including the session cookie in
    // cross-site sub-resource requests (fetch/XHR with credentials, form POST
    // from a third-party page). Top-level GET navigations (e.g. the Google
    // OAuth callback redirect) still carry the cookie. The API and BizPortal
    // share the same eTLD+1 (cstlogistic.co.id / replit.dev in dev), so
    // same-site requests are unaffected.
    sameSite: "lax",
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
      ...(isAdmin ? { role: "admin" as const } : {}),
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
        // Promote to admin if configured, but never demote
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
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) throw new Error("No id_token");

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
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
      access_token: tokens.access_token || "",
      refresh_token: tokens.refresh_token || undefined,
      expires_at: tokens.expiry_date ? Math.floor(tokens.expiry_date / 1000) : now + 3600,
    };

    const sid = await createSession(sessionData);
    setSessionCookie(res, sid);
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

router.post("/dev-login", async (req: Request, res: Response) => {
  if (process.env.NODE_ENV !== "development") {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const { email } = req.body as { email?: string };
  if (!email || typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "Valid email required" });
    return;
  }

  const id = `dev_${email.replace(/[^a-z0-9]/gi, "_")}`;
  const claims: Record<string, unknown> = {
    sub: id,
    email,
    first_name: email.split("@")[0],
    last_name: null,
    picture: null,
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
    access_token: "dev",
    refresh_token: undefined,
    expires_at: now + 86400,
  };

  const sid = await createSession(sessionData);
  setSessionCookie(res, sid);
  req.log.info({ email }, "[Dev Login] session created");
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
