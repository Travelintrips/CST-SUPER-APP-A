import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runVendorMiniFormMigration(): Promise<void> {
  try {
    // ── Base tables ────────────────────────────────────────────────────────────
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

    // ── Legacy columns ─────────────────────────────────────────────────────────
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS short_url TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS staff_data JSONB NOT NULL DEFAULT '{}';`);

    // ── Order-based mode for links ─────────────────────────────────────────────
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS mode TEXT NOT NULL DEFAULT 'rate_collection';`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS order_id INTEGER;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS order_number TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS order_item_id INTEGER;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS item_status TEXT DEFAULT 'waiting_vendor';`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS phase TEXT DEFAULT 'quotation';`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS vendor_name TEXT;`);

    // ── Security & limits for links ────────────────────────────────────────────
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS max_submissions INTEGER;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS resubmit_allowed BOOLEAN DEFAULT FALSE;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS admin_notes TEXT;`);

    // ── Order-based mode for submissions ──────────────────────────────────────
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS response_status TEXT DEFAULT 'submitted';`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS vendor_price NUMERIC(14,2);`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'IDR';`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS eta TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS valid_until TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS attachment_url TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS order_id INTEGER;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS order_item_id INTEGER;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS selected_by_admin BOOLEAN DEFAULT FALSE;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS selected_at TIMESTAMP;`);

    // ── Security, revision & lock for submissions ──────────────────────────────
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS submitted_ip TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS submitted_ua TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS revision_count INTEGER DEFAULT 0;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS admin_notes TEXT;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;`);
    await db.execute(sql`ALTER TABLE vendor_mini_form_submissions ADD COLUMN IF NOT EXISTS unlock_reason TEXT;`);

    // ── customer_approvals ─────────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS customer_approvals (
        id              SERIAL PRIMARY KEY,
        token           TEXT NOT NULL UNIQUE,
        order_id        INTEGER,
        order_number    TEXT,
        customer_name   TEXT,
        customer_phone  TEXT,
        customer_email  TEXT,
        offer_summary   JSONB DEFAULT '{}',
        selling_price   NUMERIC(14,2),
        currency        TEXT DEFAULT 'IDR',
        terms_notes     TEXT,
        status          TEXT NOT NULL DEFAULT 'pending',
        approved_at     TIMESTAMP,
        rejected_at     TIMESTAMP,
        notes           TEXT,
        so_id           INTEGER,
        so_number       TEXT,
        created_at      TIMESTAMP NOT NULL DEFAULT NOW(),
        created_by      TEXT,
        expires_at      TIMESTAMP
      )
    `);
    await db.execute(sql`
      ALTER TABLE vendor_mini_form_submissions
        ADD COLUMN IF NOT EXISTS staff_data JSONB NOT NULL DEFAULT '{}'::jsonb;
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ca_token_idx ON customer_approvals(token);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS ca_order_id_idx ON customer_approvals(order_id);`);

    // ── Margin calculator columns for customer_approvals ──────────────────────
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS submission_id INTEGER;`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS vendor_cost NUMERIC(14,2);`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS markup_pct NUMERIC(8,2);`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS markup_nominal NUMERIC(14,2);`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS ppn_pct NUMERIC(5,2) DEFAULT 11;`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS ppn_nominal NUMERIC(14,2);`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS profit_margin_pct NUMERIC(8,2);`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS admin_notes TEXT;`);
    await db.execute(sql`ALTER TABLE customer_approvals ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;`);

    // ── vendor_operational_confirmations ───────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_operational_confirmations (
        id             SERIAL PRIMARY KEY,
        token          TEXT NOT NULL UNIQUE,
        order_id       INTEGER,
        order_number   TEXT,
        order_item_id  INTEGER,
        supplier_id    INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        vendor_name    TEXT,
        service_type   TEXT NOT NULL,
        payload        JSONB NOT NULL DEFAULT '{}',
        status         TEXT NOT NULL DEFAULT 'pending',
        submitted_at   TIMESTAMP,
        instruction    TEXT,
        created_at     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS voc_token_idx ON vendor_operational_confirmations(token);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS voc_order_id_idx ON vendor_operational_confirmations(order_id);`);

    // ── vendor_price_history ───────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_price_history (
        id             SERIAL PRIMARY KEY,
        submission_id  INTEGER REFERENCES vendor_mini_form_submissions(id) ON DELETE CASCADE,
        version_number INTEGER NOT NULL DEFAULT 1,
        old_price      NUMERIC(14,2),
        new_price      NUMERIC(14,2),
        currency       TEXT DEFAULT 'IDR',
        reason         TEXT,
        changed_by     TEXT,
        changed_at     TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS vph_submission_id_idx ON vendor_price_history(submission_id);`);

    // ── vmf_activity_log ───────────────────────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vmf_activity_log (
        id          SERIAL PRIMARY KEY,
        entity_type TEXT NOT NULL,
        entity_id   INTEGER NOT NULL,
        action      TEXT NOT NULL,
        actor       TEXT,
        note        TEXT,
        data        JSONB DEFAULT '{}',
        created_at  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS val_entity_idx ON vmf_activity_log(entity_type, entity_id);`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS val_created_idx ON vmf_activity_log(created_at);`);

    // ── form_target column (vendor | customer | admin) ────────────────────────
    await db.execute(sql`ALTER TABLE vendor_mini_form_links ADD COLUMN IF NOT EXISTS form_target TEXT DEFAULT 'vendor';`);
    await db.execute(sql`UPDATE vendor_mini_form_links SET form_target = 'vendor' WHERE form_target IS NULL;`);

    // ── RC-1 FIX: UNIQUE constraint on vendor_mini_form_submissions.token ─────
    // Prevents race-condition duplicate submissions when vendor double-clicks submit
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS vmf_submissions_token_uidx
      ON vendor_mini_form_submissions(token)
    `);

    logger.info("Vendor mini form migration: ok");
  } catch (err) {
    logger.error({ err }, "Vendor mini form migration failed");
  }
}
