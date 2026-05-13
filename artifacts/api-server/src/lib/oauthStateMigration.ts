import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runOauthStateMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS oauth_states (
        token       TEXT PRIMARY KEY,
        return_to   TEXT NOT NULL DEFAULT '/',
        expires_at  BIGINT NOT NULL
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS oauth_states_expires_at_idx ON oauth_states (expires_at)
    `);
    logger.info("OAuth state migration: ok (oauth_states table ready)");
  } catch (err) {
    logger.error({ err }, "OAuth state migration failed");
    throw err;
  }
}

export async function saveOauthState(token: string, returnTo: string): Promise<void> {
  const expiresAt = Date.now() + 10 * 60 * 1000;
  await db.execute(sql`
    INSERT INTO oauth_states (token, return_to, expires_at)
    VALUES (${token}, ${returnTo}, ${expiresAt})
    ON CONFLICT (token) DO NOTHING
  `);
  // Clean expired states while we're here (best-effort)
  db.execute(sql`DELETE FROM oauth_states WHERE expires_at < ${Date.now()}`).catch(() => {});
}

export async function consumeOauthState(token: string): Promise<string | null> {
  const result = await db.execute(sql`
    DELETE FROM oauth_states
    WHERE token = ${token} AND expires_at > ${Date.now()}
    RETURNING return_to
  `);
  const row = (result as unknown as { rows: Array<{ return_to: string }> }).rows?.[0]
    ?? (result as unknown as Array<{ return_to: string }>)[0];
  return row?.return_to ?? null;
}
