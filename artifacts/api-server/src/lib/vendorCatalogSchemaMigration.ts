import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

/**
 * Vendor Catalog Schema Migration — Fase 2
 *
 * Memperluas tabel vendor_catalog_items agar mendukung:
 * template engine, spec values, pricing (priceBase internal-only),
 * stock, lead time, validity, dokumen, dan lifecycle status.
 *
 * Semua ALTER TABLE memakai ADD COLUMN IF NOT EXISTS → idempotent.
 * priceBase TIDAK pernah dikembalikan ke customer; hanya price_sell yang
 * boleh diekspos ke public/portal API.
 */
export async function runVendorCatalogSchemaMigration(): Promise<void> {
  try {
    // ── Pastikan tabel sudah ada (dibuat oleh Drizzle push/create) ────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_catalog_items (
        id          SERIAL PRIMARY KEY,
        vendor_id   INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    // ── Vendor identity ────────────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS vendor_name TEXT
    `);

    // ── Template engine ────────────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS template_kind TEXT DEFAULT 'service'
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS category_key TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS service_type TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS template_id TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS template_version TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS template_snapshot JSONB
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS spec_values JSONB
    `);

    // ── Pricing ────────────────────────────────────────────────────────────────
    // price_base sudah ada (priceBase). price_sell = harga jual ke customer.
    // priceBase TIDAK boleh diekspos ke portal/customer API.
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS price_sell NUMERIC(15,2)
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'IDR'
    `);

    // ── Stock ──────────────────────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS stock_status TEXT DEFAULT 'available'
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS stock_qty INTEGER
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS moq INTEGER DEFAULT 1
    `);

    // ── Lead time & validity ───────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS lead_time TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS validity_date TIMESTAMP
    `);

    // ── Asal & lokasi ──────────────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS location TEXT
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS origin TEXT
    `);

    // ── Dokumen pendukung ──────────────────────────────────────────────────────
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS documents JSONB NOT NULL DEFAULT '[]'
    `);

    // ── Lifecycle status ───────────────────────────────────────────────────────
    // status: draft | pending_review | published | archived
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS source_submission_id INTEGER
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS published_at TIMESTAMP
    `);
    await db.execute(sql`
      ALTER TABLE vendor_catalog_items
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    `);

    // ── Indexes ────────────────────────────────────────────────────────────────
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vci_vendor_id_idx
        ON vendor_catalog_items(vendor_id)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vci_template_kind_idx
        ON vendor_catalog_items(template_kind)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vci_category_key_idx
        ON vendor_catalog_items(category_key)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vci_status_idx
        ON vendor_catalog_items(status)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vci_is_published_idx
        ON vendor_catalog_items(is_published)
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS vci_source_submission_id_idx
        ON vendor_catalog_items(source_submission_id)
    `);

    logger.info("Vendor catalog schema migration: ok");
  } catch (err) {
    logger.error({ err }, "Vendor catalog schema migration failed");
  }
}
