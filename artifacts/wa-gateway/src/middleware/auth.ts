import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { waApiKeys, waAccounts } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.WA_GATEWAY_JWT_SECRET ?? "wa-gateway-secret-change-in-prod";

export interface AuthPayload {
  accountId: number;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthPayload;
      apiKeyDeviceId?: number | null;
    }
  }
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function requireJwt(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    req.auth = jwt.verify(token, JWT_SECRET) as AuthPayload;
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

export async function requireApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!raw) {
    res.status(401).json({ error: "API key required" });
    return;
  }

  if (!raw.startsWith("wag_")) {
    res.status(401).json({ error: "Invalid API key format" });
    return;
  }

  const prefix = raw.slice(0, 12);
  const keys = await db.select().from(waApiKeys).where(eq(waApiKeys.keyPrefix, prefix));

  for (const key of keys) {
    const valid = await bcrypt.compare(raw, key.keyHash);
    if (valid) {
      req.auth = { accountId: key.accountId, email: "" };
      req.apiKeyDeviceId = key.deviceId ?? null;
      await db.update(waApiKeys).set({ lastUsedAt: new Date() }).where(eq(waApiKeys.id, key.id));
      next();
      return;
    }
  }

  res.status(401).json({ error: "Invalid API key" });
}

export async function requireJwtOrApiKey(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization ?? "";
  const raw = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!raw) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  if (raw.startsWith("wag_")) {
    return requireApiKey(req, res, next);
  }

  return requireJwt(req, res, next);
}
