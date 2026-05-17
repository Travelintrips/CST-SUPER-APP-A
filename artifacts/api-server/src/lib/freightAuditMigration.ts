import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runFreightAuditMigration(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS freight_shipment_audit_logs (
      id          SERIAL PRIMARY KEY,
      shipment_id INTEGER NOT NULL REFERENCES freight_shipments(id) ON DELETE CASCADE,
      shipment_number TEXT NOT NULL,
      from_status TEXT,
      to_status   TEXT NOT NULL,
      changed_by  TEXT NOT NULL,
      changed_by_id TEXT,
      notes       TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS freight_audit_logs_shipment_id_idx
      ON freight_shipment_audit_logs(shipment_id)
  `);
  logger.info("Freight audit log migration: ok");
}
