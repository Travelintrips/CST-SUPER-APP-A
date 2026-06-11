import * as client from "openid-client";
import crypto from "crypto";
import { type Request, type Response } from "express";
import { db, sessionsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
export interface AuthUser {
  id: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  profileImageUrl?: string | null;
  role?: string | null;
  companyId?: number | null;
}

export const ISSUER_URL = process.env.ISSUER_URL ?? "https://replit.com/oidc";
export const SESSION_COOKIE = "sid";
export const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export interface SessionData {
  user: AuthUser;
  access_token: string;
  refresh_token?: string;
  expires_at?: number;
}

// In-memory session store — dev fallback when DB is unavailable
const _memSessions = new Map<string, { data: SessionData; expire: Date }>();

const IS_DEV = !process.env.REPLIT_DEPLOYMENT;

function _memGet(sid: string): SessionData | null {
  const entry = _memSessions.get(sid);
  if (!entry) return null;
  if (entry.expire < new Date()) { _memSessions.delete(sid); return null; }
  return entry.data;
}

function _memSet(sid: string, data: SessionData): void {
  _memSessions.set(sid, { data, expire: new Date(Date.now() + SESSION_TTL) });
}

function _memDelete(sid: string): void {
  _memSessions.delete(sid);
}

let oidcConfig: client.Configuration | null = null;

export async function getOidcConfig(): Promise<client.Configuration> {
  if (!oidcConfig) {
    oidcConfig = await client.discovery(
      new URL(ISSUER_URL),
      process.env.REPL_ID!,
    );
  }
  return oidcConfig;
}

export async function createSession(data: SessionData): Promise<string> {
  const sid = crypto.randomBytes(32).toString("hex");
  if (IS_DEV) {
    try {
      await db.insert(sessionsTable).values({
        sid,
        sess: data as unknown as Record<string, unknown>,
        expire: new Date(Date.now() + SESSION_TTL),
      });
      return sid;
    } catch {
      // DB unavailable — store in memory
      _memSet(sid, data);
      return sid;
    }
  }
  await db.insert(sessionsTable).values({
    sid,
    sess: data as unknown as Record<string, unknown>,
    expire: new Date(Date.now() + SESSION_TTL),
  });
  return sid;
}

export async function getSession(sid: string): Promise<SessionData | null> {
  // Check in-memory store first (populated by dev fallback)
  const memData = _memGet(sid);
  if (memData) return memData;

  const [row] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sid, sid));

  if (!row || row.expire < new Date()) {
    if (row) await deleteSession(sid);
    return null;
  }

  return row.sess as unknown as SessionData;
}

export async function updateSession(
  sid: string,
  data: SessionData,
): Promise<void> {
  if (_memSessions.has(sid)) {
    _memSet(sid, data);
    return;
  }
  try {
    await db
      .update(sessionsTable)
      .set({
        sess: data as unknown as Record<string, unknown>,
        expire: new Date(Date.now() + SESSION_TTL),
      })
      .where(eq(sessionsTable.sid, sid));
  } catch (err) {
    if (IS_DEV) _memSet(sid, data);
    else throw err;
  }
}

export async function deleteSession(sid: string): Promise<void> {
  _memDelete(sid);
  try {
    await db.delete(sessionsTable).where(eq(sessionsTable.sid, sid));
  } catch {
    // ignore — memory already cleared
  }
}

export async function clearSession(
  res: Response,
  sid?: string,
): Promise<void> {
  if (sid) await deleteSession(sid);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
}

export function getSessionId(req: Request): string | undefined {
  const authHeader = req.headers["authorization"];
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return req.cookies?.[SESSION_COOKIE];
}
