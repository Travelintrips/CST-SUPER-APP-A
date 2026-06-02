import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function runCustomerQuoteFlowMigration(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_quote_links (
      id                    SERIAL PRIMARY KEY,
      rfq_id                INTEGER REFERENCES logistic_order_rfqs(id) ON DELETE CASCADE,
      order_id              INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
      token                 TEXT NOT NULL UNIQUE,
      status                TEXT NOT NULL DEFAULT 'pending',
      eta_final             TEXT,
      terms_conditions      TEXT,
      quote_notes           TEXT,
      final_customer_price  NUMERIC(14,2),
      vendor_cost           NUMERIC(14,2),
      margin                NUMERIC(14,2),
      valid_until           TIMESTAMP,
      opened_at             TIMESTAMP,
      responded_at          TIMESTAMP,
      sent_at               TIMESTAMP DEFAULT NOW(),
      created_at            TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_quote_responses (
      id               SERIAL PRIMARY KEY,
      rfq_id           INTEGER,
      order_id         INTEGER REFERENCES logistic_orders(id) ON DELETE CASCADE,
      token            TEXT NOT NULL,
      response         TEXT NOT NULL,
      revision_notes   TEXT,
      rejection_reason TEXT,
      responded_at     TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_task_links (
      id          SERIAL PRIMARY KEY,
      order_id    INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
      vendor_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
      driver_id   INTEGER,
      token       TEXT NOT NULL UNIQUE,
      role_type   TEXT NOT NULL DEFAULT 'vendor',
      label       TEXT,
      status      TEXT NOT NULL DEFAULT 'active',
      expired_at  TIMESTAMP,
      opened_at   TIMESTAMP,
      created_at  TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS order_updates (
      id             SERIAL PRIMARY KEY,
      order_id       INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
      actor_type     TEXT NOT NULL DEFAULT 'admin',
      actor_id       TEXT,
      actor_name     TEXT,
      status         TEXT,
      notes          TEXT,
      attachment_url TEXT,
      is_public      BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS customer_order_links (
      id         SERIAL PRIMARY KEY,
      order_id   INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
      token      TEXT NOT NULL UNIQUE,
      status     TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);

  // Add new columns to logistic_orders
  // ── Product Template Engine columns for customer_quote_links (Step 3) ────────
  await db.execute(sql`ALTER TABLE customer_quote_links ADD COLUMN IF NOT EXISTS category_key TEXT;`);
  await db.execute(sql`ALTER TABLE customer_quote_links ADD COLUMN IF NOT EXISTS template_id TEXT;`);
  await db.execute(sql`ALTER TABLE customer_quote_links ADD COLUMN IF NOT EXISTS template_version TEXT;`);
  await db.execute(sql`ALTER TABLE customer_quote_links ADD COLUMN IF NOT EXISTS template_snapshot JSONB;`);

  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='customer_quote_status') THEN
        ALTER TABLE logistic_orders ADD COLUMN customer_quote_status TEXT;
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='eta_final') THEN
        ALTER TABLE logistic_orders ADD COLUMN eta_final TEXT;
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='terms_conditions') THEN
        ALTER TABLE logistic_orders ADD COLUMN terms_conditions TEXT;
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='quote_notes') THEN
        ALTER TABLE logistic_orders ADD COLUMN quote_notes TEXT;
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='vendor_cost') THEN
        ALTER TABLE logistic_orders ADD COLUMN vendor_cost NUMERIC(14,2);
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='order_margin') THEN
        ALTER TABLE logistic_orders ADD COLUMN order_margin NUMERIC(14,2);
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='selected_vendor_link_id') THEN
        ALTER TABLE logistic_orders ADD COLUMN selected_vendor_link_id INTEGER;
      END IF;
    END $$;
  `);

  logger.info("Customer quote flow migration: ok");
}
