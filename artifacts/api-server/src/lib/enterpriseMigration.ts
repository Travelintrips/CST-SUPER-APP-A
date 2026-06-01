import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runEnterpriseMigration(): Promise<void> {
  try {
    // 1. Add response_deadline to logistic_order_rfqs
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_order_rfqs' AND column_name='response_deadline') THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN response_deadline TIMESTAMPTZ;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_order_rfqs' AND column_name='created_by_user_id') THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN created_by_user_id TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_order_rfqs' AND column_name='created_by_user_name') THEN
          ALTER TABLE logistic_order_rfqs ADD COLUMN created_by_user_name TEXT;
        END IF;
      END $$;
    `);

    // 2. Add rank_score and rank_badges to logistic_order_quotes
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_order_quotes' AND column_name='rank_score') THEN
          ALTER TABLE logistic_order_quotes ADD COLUMN rank_score NUMERIC(6,2);
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_order_quotes' AND column_name='rank_badges') THEN
          ALTER TABLE logistic_order_quotes ADD COLUMN rank_badges TEXT[] DEFAULT '{}';
        END IF;
      END $$;
    `);

    // 3. Add operational_status and payment_status to logistic_orders
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='operational_status') THEN
          ALTER TABLE logistic_orders ADD COLUMN operational_status TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='logistic_orders' AND column_name='payment_status') THEN
          ALTER TABLE logistic_orders ADD COLUMN payment_status TEXT NOT NULL DEFAULT 'unpaid';
        END IF;
      END $$;
    `);

    // 4. Add quotation_pdf_url and quotation_number to customer_quote_links
    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_quote_links' AND column_name='quotation_pdf_url') THEN
          ALTER TABLE customer_quote_links ADD COLUMN quotation_pdf_url TEXT;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customer_quote_links' AND column_name='quotation_number') THEN
          ALTER TABLE customer_quote_links ADD COLUMN quotation_number TEXT;
        END IF;
      END $$;
    `);

    // 5. Create margin_rules table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS margin_rules (
        id SERIAL PRIMARY KEY,
        name TEXT NOT NULL,
        service_type TEXT,
        route TEXT,
        customer_type TEXT,
        margin_type TEXT NOT NULL DEFAULT 'percentage',
        margin_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        minimum_margin NUMERIC(14,2),
        is_active BOOLEAN NOT NULL DEFAULT true,
        priority NUMERIC(5,0) NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 6. Create activity_logs table
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id SERIAL PRIMARY KEY,
        rfq_id INTEGER,
        order_id INTEGER,
        actor_type TEXT NOT NULL DEFAULT 'admin',
        actor_id TEXT,
        actor_name TEXT,
        action TEXT NOT NULL,
        old_value JSONB,
        new_value JSONB,
        description TEXT,
        ip_address TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // 7. Index on activity_logs for fast lookup
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS activity_logs_order_idx ON activity_logs(order_id);
      CREATE INDEX IF NOT EXISTS activity_logs_rfq_idx ON activity_logs(rfq_id);
    `);

    // 8. Add missing columns to rfq_vendor_links (idempotent)
    await db.execute(sql`
      ALTER TABLE rfq_vendor_links
        ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS lead_time_days INTEGER,
        ADD COLUMN IF NOT EXISTS stock_availability TEXT DEFAULT 'unknown';
    `);

    // 10. Optimistic locking: version column on logistic_orders
    await db.execute(sql`
      ALTER TABLE logistic_orders
        ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    `);

    // 9. Race-condition / idempotency unique constraints
    //    - logistic_order_quotes: one vendor may submit at most one quote per RFQ
    //    - vendor_responses: one READY/NOT_READY row per order number (upsert target)
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS liq_rfq_vendor_uidx
        ON logistic_order_quotes (rfq_id, vendor_id);
    `);
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS vendor_responses_order_uidx
        ON vendor_responses (order_number);
    `);

    logger.info("Enterprise migration completed successfully");
  } catch (err) {
    logger.error({ err }, "Enterprise migration failed");
    throw err;
  }
}
