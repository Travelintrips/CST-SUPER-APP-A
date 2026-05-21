import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runUserRoleMigration(): Promise<void> {
  try {
    await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'pos-kasir'`);
    await db.execute(sql`ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'pos-inventory'`);
    logger.info("User role migration: selesai (pos-kasir, pos-inventory ditambahkan ke enum)");
  } catch (err) {
    logger.error({ err }, "User role migration failed");
    throw err;
  }
}
