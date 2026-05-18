import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Migration: Tambah UNIQUE(company_id, code) pada branches dan sections.
 *
 * Strategi aman:
 * 1. Deduplikasi branches — pertahankan id terkecil (paling awal), hapus sisanya.
 * 2. Deduplikasi sections — tidak ada duplikat, tapi bersihkan jika ada.
 * 3. Hapus constraint sections lama yang salah (hanya pada `code`, bukan per company).
 * 4. Tambah UNIQUE(company_id, code) pada branches dan sections via partial unique index.
 * 5. Perbaiki seed branches agar pakai ON CONFLICT (company_id, code).
 *
 * Semua langkah idempotent — aman dijalankan berulang kali.
 */
export async function runOrgUniqueCodesMigration(): Promise<void> {
  try {
    // ─── 1. Deduplikasi branches ────────────────────────────────────────────
    // Hapus baris duplikat, pertahankan id terkecil per (company_id, code)
    const deduped = await db.execute(sql`
      DELETE FROM branches
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM branches
        WHERE code IS NOT NULL AND code <> ''
        GROUP BY company_id, code
      )
      AND code IS NOT NULL AND code <> ''
    `);
    const deletedBranches = deduped.rowCount ?? 0;
    if (deletedBranches > 0) {
      logger.info(`Org unique codes: hapus ${deletedBranches} baris duplikat branches`);
    }

    // ─── 2. Deduplikasi sections ────────────────────────────────────────────
    const deduped2 = await db.execute(sql`
      DELETE FROM sections
      WHERE id NOT IN (
        SELECT MIN(id)
        FROM sections
        WHERE code IS NOT NULL AND code <> ''
        GROUP BY company_id, code
      )
      AND code IS NOT NULL AND code <> ''
    `);
    const deletedSections = deduped2.rowCount ?? 0;
    if (deletedSections > 0) {
      logger.info(`Org unique codes: hapus ${deletedSections} baris duplikat sections`);
    }

    // ─── 3. Hapus constraint sections lama yang salah (hanya code, bukan per company) ──
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.table_constraints
          WHERE table_name = 'sections'
            AND constraint_name = 'sections_code_unique'
            AND constraint_type = 'UNIQUE'
        ) THEN
          ALTER TABLE sections DROP CONSTRAINT sections_code_unique;
        END IF;
      END$$
    `);

    // ─── 4a. UNIQUE(company_id, code) pada branches ─────────────────────────
    // Gunakan partial unique index (WHERE code IS NOT NULL AND code <> '')
    // agar NULL/kosong tidak conflict satu sama lain.
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS branches_company_code_unique
        ON branches(company_id, code)
        WHERE code IS NOT NULL AND code <> ''
    `);

    // ─── 4b. UNIQUE(company_id, code) pada sections ──────────────────────────
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS sections_company_code_unique
        ON sections(company_id, code)
        WHERE code IS NOT NULL AND code <> ''
    `);

    logger.info("Org unique codes migration: selesai (UNIQUE(company_id,code) pada branches & sections)");
  } catch (err) {
    logger.error({ err }, "Org unique codes migration gagal");
    throw err;
  }
}
