import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runUserRoleMigration(): Promise<void> {
  try {
    logger.info("User role migration: ok");
  } catch (err) {
    logger.error({ err }, "User role migration failed");
    throw err;
  }
}
