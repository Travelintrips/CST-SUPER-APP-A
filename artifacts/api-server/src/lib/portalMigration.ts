import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Idempotent migration untuk fitur admin portal.
 * Aman dijalankan berkali-kali — hanya menambahkan kolom/tabel yang belum ada.
 */
export async function runPortalMigration(): Promise<void> {
  try {
    // Tambah kolom role ke portal_customers jika belum ada
    await db.execute(sql`
      ALTER TABLE portal_customers
        ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer'
    `);

    // Buat tabel portal_content jika belum ada
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS portal_content (
        id         SERIAL PRIMARY KEY,
        key        TEXT NOT NULL UNIQUE,
        value      TEXT NOT NULL DEFAULT '',
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // Auto-promote semua email yang ada di PORTAL_ADMIN_EMAILS
    const adminEmails = (process.env.PORTAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    for (const email of adminEmails) {
      await db.execute(sql`
        UPDATE portal_customers
           SET role = 'admin'
         WHERE LOWER(email) = ${email}
           AND role <> 'admin'
      `);
    }

    logger.info("Portal migration: selesai (role column + portal_content table + admin email promotion)");
  } catch (err) {
    logger.error({ err }, "Portal migration gagal");
  }
}
