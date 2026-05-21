import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runSportCenterMigration(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sport_center_bookings (
      id             SERIAL PRIMARY KEY,
      booking_code   TEXT    NOT NULL UNIQUE,
      facility_id    TEXT    NOT NULL,
      facility_name  TEXT    NOT NULL,
      customer_name  TEXT    NOT NULL,
      customer_phone TEXT    NOT NULL,
      customer_email TEXT    NOT NULL DEFAULT '',
      date           TEXT    NOT NULL,
      start_time     TEXT    NOT NULL,
      end_time       TEXT    NOT NULL,
      total_hours    NUMERIC(5,1) NOT NULL DEFAULT 1,
      total_price    INTEGER NOT NULL DEFAULT 0,
      notes          TEXT,
      status         TEXT    NOT NULL DEFAULT 'pending',
      created_at     TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sc_bookings_facility_date_idx
      ON sport_center_bookings (facility_id, date)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sc_bookings_status_idx
      ON sport_center_bookings (status)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS sc_bookings_date_idx
      ON sport_center_bookings (date)
  `);

  // Add payment proof columns if not exist
  await db.execute(sql`
    ALTER TABLE sport_center_bookings
      ADD COLUMN IF NOT EXISTS payment_proof_url  TEXT,
      ADD COLUMN IF NOT EXISTS payment_proof_at   TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payment_status     TEXT NOT NULL DEFAULT 'unpaid'
  `);

  logger.info("Sport Center migration: selesai (sport_center_bookings table ready + payment proof columns)");
}
