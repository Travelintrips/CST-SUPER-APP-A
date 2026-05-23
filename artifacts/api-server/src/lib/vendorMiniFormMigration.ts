import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runVendorMiniFormMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_mini_form_links (
        id          SERIAL PRIMARY KEY,
        token       TEXT NOT NULL UNIQUE,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        service_type TEXT NOT NULL,
        title       TEXT,
        notes       TEXT,
        expires_at  TIMESTAMP,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by  TEXT
      )
    `);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_mini_form_submissions (
        id             SERIAL PRIMARY KEY,
        link_id        INTEGER REFERENCES vendor_mini_form_links(id) ON DELETE SET NULL,
        token          TEXT NOT NULL,
        supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        service_type   TEXT NOT NULL,
        vendor_name    TEXT,
        contact_person TEXT,
        contact_phone  TEXT,
        form_data      JSONB NOT NULL DEFAULT '{}',
        submitted_at   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vmfl_token_idx ON vendor_mini_form_links(token);
      CREATE INDEX IF NOT EXISTS vmfs_token_idx ON vendor_mini_form_submissions(token);
      CREATE INDEX IF NOT EXISTS vmfs_link_id_idx ON vendor_mini_form_submissions(link_id);
    `);
    await db.execute(sql`
      ALTER TABLE vendor_mini_form_links
        ADD COLUMN IF NOT EXISTS short_url TEXT;
    `);
    logger.info("Vendor mini form migration: ok");
  } catch (err) {
    logger.error({ err }, "Vendor mini form migration failed");
  }
}
