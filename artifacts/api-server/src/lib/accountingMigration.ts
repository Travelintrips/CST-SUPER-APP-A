import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

/**
 * Idempotent migration untuk fitur accounting automation.
 * Aman dijalankan berkali-kali — hanya menambahkan kolom yang belum ada.
 */
export async function runAccountingMigration(): Promise<void> {
  try {
    // ── sales_documents ──────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE sales_documents
        ADD COLUMN IF NOT EXISTS invoice_number   TEXT,
        ADD COLUMN IF NOT EXISTS invoice_date     DATE,
        ADD COLUMN IF NOT EXISTS due_date         DATE,
        ADD COLUMN IF NOT EXISTS payment_term_days INTEGER DEFAULT 30,
        ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMP
    `);

    // ── purchase_documents ───────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE purchase_documents
        ADD COLUMN IF NOT EXISTS bill_number      TEXT,
        ADD COLUMN IF NOT EXISTS bill_date        TEXT,
        ADD COLUMN IF NOT EXISTS due_date         TEXT,
        ADD COLUMN IF NOT EXISTS payment_term_days INTEGER DEFAULT 30,
        ADD COLUMN IF NOT EXISTS cancelled_at     TIMESTAMP
    `);

    // ── accounting_payments ──────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE accounting_payments
        ADD COLUMN IF NOT EXISTS payment_number TEXT
    `);

    // ── accounting_entry_source enum: tambahkan 'reversal' jika belum ada ──
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum
          WHERE enumlabel = 'reversal'
            AND enumtypid = 'accounting_entry_source'::regtype
        ) THEN
          ALTER TYPE accounting_entry_source ADD VALUE 'reversal';
        END IF;
      END $$
    `);

    // ── chart_of_accounts: tambah company_id ────────────────────────────────
    await db.execute(sql`
      ALTER TABLE chart_of_accounts
        ADD COLUMN IF NOT EXISTS company_id integer
    `);

    logger.info("Accounting migration: selesai (invoice/bill/payment numbering + due date columns + reversal enum)");
  } catch (err) {
    logger.error({ err }, "Accounting migration error");
    throw err;
  }
}
