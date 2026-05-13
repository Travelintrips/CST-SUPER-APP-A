import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Idempotent migration untuk fitur Holding / Consolidated Accounting.
 * Aman dijalankan berkali-kali.
 */
export async function runHoldingMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS holding_groups (
        id               SERIAL PRIMARY KEY,
        holding_name     TEXT NOT NULL,
        holding_code     TEXT NOT NULL UNIQUE,
        description      TEXT,
        created_at       TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS company_holding_members (
        id                   SERIAL PRIMARY KEY,
        holding_group_id     INTEGER REFERENCES holding_groups(id),
        company_id           INTEGER NOT NULL,
        ownership_percentage NUMERIC(5,2) DEFAULT 100.00,
        consolidation_method TEXT DEFAULT 'full',
        created_at           TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    const existing = await db.execute(sql`
      SELECT id FROM holding_groups WHERE holding_code = 'CST-GROUP' LIMIT 1
    `);

    if (existing.rows.length === 0) {
      const inserted = await db.execute(sql`
        INSERT INTO holding_groups (holding_name, holding_code, description)
        VALUES ('CST Group', 'CST-GROUP', 'Holding group PT Cahaya Sejati Teknologi dan entitas anak')
        RETURNING id
      `);
      const holdingId = (inserted.rows[0] as { id: number }).id;

      const companies = await db.execute(sql`
        SELECT id FROM companies ORDER BY id LIMIT 4
      `);

      for (const row of companies.rows) {
        const companyId = (row as { id: number }).id;
        await db.execute(sql`
          INSERT INTO company_holding_members (holding_group_id, company_id, ownership_percentage, consolidation_method)
          VALUES (${holdingId}, ${companyId}, 100.00, 'full')
          ON CONFLICT DO NOTHING
        `);
      }

      logger.info("Holding: CST-GROUP seeded with all companies");
    } else {
      logger.info("Holding: CST-GROUP already exists, skip seed");
    }

    logger.info("Holding migration completed");
  } catch (err) {
    logger.error({ err }, "Holding migration failed");
    throw err;
  }
}
