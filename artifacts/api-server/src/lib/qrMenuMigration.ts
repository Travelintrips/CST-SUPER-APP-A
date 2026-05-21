import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runQrMenuMigration(): Promise<void> {
  await db.execute(sql`
    ALTER TABLE pos_orders
      ADD COLUMN IF NOT EXISTS table_number   TEXT,
      ADD COLUMN IF NOT EXISTS source         TEXT NOT NULL DEFAULT 'kasir',
      ADD COLUMN IF NOT EXISTS customer_note  TEXT
  `);
  await db.execute(sql`
    ALTER TABLE pos_orders ALTER COLUMN cashier_id DROP NOT NULL
  `);
  logger.info("QR menu migration: selesai (table_number, source, customer_note on pos_orders; cashier_id nullable)");
}
