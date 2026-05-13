import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

const FOUR_COMPANIES = [
  { id: 1, company_name: "PT Cahaya Sejati Teknologi", company_code: "CST", npwp: null },
  { id: 2, company_name: "PT Wangsamas", company_code: "WGS", npwp: null },
  { id: 3, company_name: "PT Diva Servis", company_code: "DVS", npwp: null },
  { id: 4, company_name: "PT Elmira Ratu Abadi", company_code: "ERA", npwp: null },
];

export async function runCompaniesMigration(): Promise<void> {
  try {
    // 1. Create companies table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS companies (
        id           SERIAL PRIMARY KEY,
        company_name TEXT NOT NULL,
        company_code TEXT NOT NULL UNIQUE,
        logo_url     TEXT,
        address      TEXT,
        phone        TEXT,
        email        TEXT,
        npwp         TEXT,
        is_active    BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // 2. Seed 4 companies (idempotent)
    for (const c of FOUR_COMPANIES) {
      await db.execute(sql`
        INSERT INTO companies (id, company_name, company_code, npwp)
        VALUES (${c.id}, ${c.company_name}, ${c.company_code}, ${c.npwp})
        ON CONFLICT (id) DO UPDATE
          SET company_name = EXCLUDED.company_name,
              company_code = EXCLUDED.company_code
      `);
    }
    // Reset sequence to max id
    await db.execute(sql`SELECT setval('companies_id_seq', (SELECT MAX(id) FROM companies))`);

    // 3. Add company_id to accounting tables (idempotent)
    const tables = [
      "accounting_entries",
      "accounting_payments",
      "accounting_settings",
      "expenses",
    ];
    for (const tbl of tables) {
      await db.execute(
        sql.raw(`ALTER TABLE ${tbl} ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL`),
      );
    }

    // 4. Assign existing data to company 1 (PT CST) where untagged
    await db.execute(sql`UPDATE accounting_entries  SET company_id = 1 WHERE company_id IS NULL`);
    await db.execute(sql`UPDATE accounting_payments SET company_id = 1 WHERE company_id IS NULL`);
    await db.execute(sql`UPDATE accounting_settings SET company_id = 1 WHERE company_id IS NULL`);
    await db.execute(sql`UPDATE expenses            SET company_id = 1 WHERE company_id IS NULL`);

    logger.info("Companies migration: selesai (4 perusahaan, company_id columns added)");
  } catch (err) {
    logger.error({ err }, "Companies migration failed");
    throw err;
  }
}
