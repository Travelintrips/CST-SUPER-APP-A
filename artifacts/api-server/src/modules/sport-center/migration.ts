import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { pullLegacyBookingsFromSupabase } from "./supabaseSync.js";

export async function runSportCenterMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sport_facilities (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'court',
        description TEXT,
        capacity INTEGER DEFAULT 1,
        price_per_hour NUMERIC(14,2) NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        image_url TEXT,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_customers (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_members (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        customer_id INTEGER REFERENCES sport_customers(id),
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        member_type TEXT NOT NULL DEFAULT 'gym',
        member_number TEXT,
        start_date DATE NOT NULL,
        end_date DATE,
        status TEXT NOT NULL DEFAULT 'active',
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_pricing_rules (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        facility_id INTEGER REFERENCES sport_facilities(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        day_type TEXT NOT NULL DEFAULT 'all',
        time_start TIME,
        time_end TIME,
        price_per_hour NUMERIC(14,2) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_promos (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        discount_type TEXT NOT NULL DEFAULT 'percent',
        discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
        min_amount NUMERIC(14,2) DEFAULT 0,
        max_uses INTEGER,
        used_count INTEGER NOT NULL DEFAULT 0,
        valid_from TIMESTAMPTZ,
        valid_until TIMESTAMPTZ,
        is_active BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_bookings (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        booking_number TEXT NOT NULL,
        customer_id INTEGER REFERENCES sport_customers(id),
        customer_name TEXT NOT NULL,
        customer_phone TEXT,
        facility_id INTEGER REFERENCES sport_facilities(id),
        facility_name TEXT NOT NULL,
        booking_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        duration_hours NUMERIC(5,2) NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'pending',
        payment_status TEXT NOT NULL DEFAULT 'unpaid',
        base_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        total_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
        promo_id INTEGER REFERENCES sport_promos(id),
        promo_code TEXT,
        notes TEXT,
        checked_in_at TIMESTAMPTZ,
        checked_in_by TEXT,
        cancelled_at TIMESTAMPTZ,
        cancelled_reason TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_payments (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        booking_id INTEGER REFERENCES sport_bookings(id) ON DELETE CASCADE,
        payment_number TEXT NOT NULL,
        amount NUMERIC(14,2) NOT NULL,
        method TEXT NOT NULL DEFAULT 'cash',
        status TEXT NOT NULL DEFAULT 'pending',
        paid_at TIMESTAMPTZ,
        notes TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_blocked_schedules (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        facility_id INTEGER REFERENCES sport_facilities(id) ON DELETE CASCADE,
        block_date DATE NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        reason TEXT,
        created_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_notifications (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        entity_type TEXT,
        entity_id INTEGER,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_audit_logs (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        entity_type TEXT NOT NULL,
        entity_id INTEGER,
        action TEXT NOT NULL,
        actor TEXT,
        old_data JSONB,
        new_data JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sport_settings (
        id SERIAL PRIMARY KEY,
        company_id INTEGER UNIQUE,
        center_name TEXT NOT NULL DEFAULT 'Sport Center',
        address TEXT,
        phone TEXT,
        open_time TIME DEFAULT '06:00',
        close_time TIME DEFAULT '22:00',
        booking_advance_days INTEGER DEFAULT 30,
        min_booking_hours NUMERIC(5,2) DEFAULT 1,
        cancellation_hours INTEGER DEFAULT 2,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sport_refunds (
        id SERIAL PRIMARY KEY,
        company_id INTEGER,
        booking_id INTEGER NOT NULL REFERENCES sport_bookings(id) ON DELETE CASCADE,
        payment_id INTEGER REFERENCES sport_payments(id) ON DELETE SET NULL,
        customer_id INTEGER REFERENCES sport_customers(id) ON DELETE SET NULL,
        refund_number TEXT NOT NULL UNIQUE,
        refund_amount NUMERIC(14,2) NOT NULL,
        refund_reason TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        processed_by TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_date ON sport_bookings(booking_date);
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_facility ON sport_bookings(facility_id);
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_status ON sport_bookings(status);
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_company ON sport_bookings(company_id);
      CREATE INDEX IF NOT EXISTS idx_sport_members_type ON sport_members(member_type);
      CREATE INDEX IF NOT EXISTS idx_sport_notifications_read ON sport_notifications(is_read);
      CREATE INDEX IF NOT EXISTS idx_sport_refunds_booking ON sport_refunds(booking_id);
      CREATE INDEX IF NOT EXISTS idx_sport_refunds_status ON sport_refunds(status);
    `);

    // Tambahkan kolom baru ke sport_payments (idempoten)
    await db.execute(sql`
      ALTER TABLE sport_payments
        ADD COLUMN IF NOT EXISTS payment_type TEXT NOT NULL DEFAULT 'booking',
        ADD COLUMN IF NOT EXISTS member_id INTEGER,
        ADD COLUMN IF NOT EXISTS customer_id INTEGER
    `);

    // Fase 3: kolom pajak/PPN pada sport_bookings dan sport_payments (idempoten)
    await db.execute(sql`
      ALTER TABLE sport_bookings
        ADD COLUMN IF NOT EXISTS tax_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0
    `);
    await db.execute(sql`
      ALTER TABLE sport_payments
        ADD COLUMN IF NOT EXISTS tax_rate    NUMERIC(5,2)  NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS tax_amount  NUMERIC(14,2) NOT NULL DEFAULT 0
    `);

    // Fase 3: tabel maintenance request (integrasi Purchase — Fase 4 upgrade)
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sport_maintenance_requests (
        id                      SERIAL PRIMARY KEY,
        company_id              INTEGER,
        facility_id             INTEGER REFERENCES sport_facilities(id) ON DELETE SET NULL,
        facility_name           TEXT,
        item                    TEXT NOT NULL,
        quantity                INTEGER NOT NULL DEFAULT 1,
        vendor                  TEXT,
        notes                   TEXT,
        source                  TEXT NOT NULL DEFAULT 'SPORT_CENTER',
        cost_center             TEXT NOT NULL DEFAULT 'SPORT_CENTER',
        request_type            TEXT NOT NULL DEFAULT 'maintenance',
        status                  TEXT NOT NULL DEFAULT 'pending',
        requested_by            TEXT,
        purchase_request_id     INTEGER,
        purchase_request_number TEXT,
        estimated_cost          NUMERIC(14,2) NOT NULL DEFAULT 0,
        unit                    TEXT NOT NULL DEFAULT 'pcs',
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Fase 4: tambahkan kolom baru jika tabel sudah ada (idempoten)
    await db.execute(sql`ALTER TABLE sport_maintenance_requests ADD COLUMN IF NOT EXISTS cost_center TEXT NOT NULL DEFAULT 'SPORT_CENTER'`);
    await db.execute(sql`ALTER TABLE sport_maintenance_requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'maintenance'`);
    await db.execute(sql`ALTER TABLE sport_maintenance_requests ADD COLUMN IF NOT EXISTS purchase_request_id INTEGER`);
    await db.execute(sql`ALTER TABLE sport_maintenance_requests ADD COLUMN IF NOT EXISTS purchase_request_number TEXT`);
    await db.execute(sql`ALTER TABLE sport_maintenance_requests ADD COLUMN IF NOT EXISTS estimated_cost NUMERIC(14,2) NOT NULL DEFAULT 0`);
    await db.execute(sql`ALTER TABLE sport_maintenance_requests ADD COLUMN IF NOT EXISTS unit TEXT NOT NULL DEFAULT 'pcs'`);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_sport_maint_facility ON sport_maintenance_requests(facility_id);
      CREATE INDEX IF NOT EXISTS idx_sport_maint_status   ON sport_maintenance_requests(status);
    `);

    // Tambahkan nilai enum baru (idempoten — IF NOT EXISTS, PostgreSQL 9.6+)
    await db.execute(sql`
      ALTER TYPE accounting_entry_source ADD VALUE IF NOT EXISTS 'sport_center_refund'
    `);
    await db.execute(sql`
      ALTER TYPE accounting_entry_source ADD VALUE IF NOT EXISTS 'sport_center_membership'
    `);
    await db.execute(sql`
      ALTER TYPE accounting_entry_source ADD VALUE IF NOT EXISTS 'sport_center_booking_refund'
    `);
    await db.execute(sql`
      ALTER TYPE accounting_entry_source ADD VALUE IF NOT EXISTS 'sport_center_operational_expense'
    `);

    // ── Auto-sync: sport_center_services → sport_facilities ──────────────────
    // Setiap kali startup, data dari schema lama (sport_center_services) di-sync
    // ke sport_facilities secara idempoten. Company_id default = 1
    // (PT Cahaya Sejati Teknologi).
    const SPORT_CENTER_COMPANY_ID = 1;

    const legacyCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'sport_center_services'
      ) AS exists
    `);
    const hasLegacy = (legacyCheck.rows[0] as { exists: boolean }).exists;

    if (hasLegacy) {
      // Upsert fasilitas: skip jika nama sudah ada
      await db.execute(sql`
        INSERT INTO sport_facilities
          (company_id, name, type, description, price_per_hour, capacity,
           is_active, image_url, sort_order, created_at, updated_at)
        SELECT
          1,
          s.name,
          COALESCE(s.category, 'court'),
          s.description,
          s.price_per_hour::NUMERIC(14,2),
          COALESCE(s.capacity, 1),
          COALESCE(s.is_active, TRUE),
          s.image_url,
          COALESCE(s.sort_order, 0),
          COALESCE(s.created_at, NOW()),
          COALESCE(s.updated_at, NOW())
        FROM sport_center_services s
        WHERE NOT EXISTS (
          SELECT 1 FROM sport_facilities f WHERE f.name = s.name
        )
        ON CONFLICT DO NOTHING
      `);

      // Upsert customers dari bookings lama
      await db.execute(sql`
        INSERT INTO sport_customers (company_id, name, email, phone, created_at, updated_at)
        SELECT DISTINCT
          1,
          b.customer_name,
          b.customer_email,
          b.customer_phone,
          NOW(), NOW()
        FROM sport_center_bookings b
        WHERE b.customer_phone IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM sport_customers c WHERE c.phone = b.customer_phone
          )
        ON CONFLICT DO NOTHING
      `);

      // Upsert bookings lama
      await db.execute(sql`
        INSERT INTO sport_bookings
          (company_id, booking_number, customer_id, customer_name, customer_phone,
           facility_id, facility_name, booking_date, start_time, end_time,
           duration_hours, base_amount, total_amount, status, payment_status,
           notes, created_at, updated_at)
        SELECT
          1,
          b.booking_code,
          c.id,
          b.customer_name,
          b.customer_phone,
          f.id,
          b.facility_name,
          b.date::DATE,
          b.start_time::TIME,
          b.end_time::TIME,
          COALESCE(b.total_hours, 1)::NUMERIC(5,2),
          COALESCE(b.total_price, 0)::NUMERIC(14,2),
          COALESCE(b.total_price, 0)::NUMERIC(14,2),
          CASE b.status
            WHEN 'confirmed' THEN 'confirmed'
            WHEN 'cancelled' THEN 'cancelled'
            ELSE 'pending'
          END,
          COALESCE(b.payment_status, 'unpaid'),
          b.notes,
          COALESCE(b.created_at, NOW()),
          COALESCE(b.created_at, NOW())
        FROM sport_center_bookings b
        LEFT JOIN sport_customers c ON c.phone = b.customer_phone
        LEFT JOIN sport_facilities f ON (
          f.name = b.facility_name
          OR f.name ILIKE '%' || SPLIT_PART(b.facility_id, '-', 1) || '%'
        )
        WHERE b.booking_code IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM sport_bookings nb WHERE nb.booking_number = b.booking_code
          )
        ON CONFLICT DO NOTHING
      `);

      logger.info("Sport Center migration: legacy sync selesai (sport_center_services → sport_facilities)");
    }

    // Pastikan semua data sport center milik PT Cahaya Sejati Teknologi (company_id = 1)
    await db.execute(sql`
      UPDATE sport_facilities    SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_bookings      SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_customers     SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_members       SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_pricing_rules SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_promos        SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_payments      SET company_id = 1 WHERE company_id IS NULL;
      UPDATE sport_settings      SET company_id = 1 WHERE company_id IS NULL;
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS sport_sync_logs (
        id         SERIAL PRIMARY KEY,
        entity     TEXT NOT NULL,
        action     TEXT NOT NULL,
        entity_id  INTEGER,
        status     TEXT NOT NULL DEFAULT 'ok',
        detail     TEXT,
        company_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_sport_sync_logs_entity ON sport_sync_logs(entity, action);
      CREATE INDEX IF NOT EXISTS idx_sport_sync_logs_created ON sport_sync_logs(created_at DESC);
    `);

    await db.execute(sql`
      ALTER TABLE sport_center_bookings ADD COLUMN IF NOT EXISTS payment_status TEXT NOT NULL DEFAULT 'unpaid';
      ALTER TABLE sport_center_bookings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      ALTER TABLE sport_center_bookings ADD COLUMN IF NOT EXISTS customer_phone TEXT;
    `);

    await db.execute(sql`
      DO $$ BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint
          WHERE conname = 'sport_center_bookings_booking_code_key'
        ) THEN
          ALTER TABLE sport_center_bookings ADD CONSTRAINT sport_center_bookings_booking_code_key UNIQUE (booking_code);
        END IF;
      END $$;
    `);

    // ── FASE 6C: facility_id + expense_category di accounting_entries ──────────
    await db.execute(sql`
      ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS facility_id INTEGER;
      ALTER TABLE accounting_entries ADD COLUMN IF NOT EXISTS expense_category TEXT;
    `);

    // ── FASE 6C: recurring_expenses table ────────────────────────────────────
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS recurring_expenses (
        id          SERIAL PRIMARY KEY,
        company_id  INTEGER,
        facility_id INTEGER,
        name        TEXT NOT NULL,
        description TEXT,
        amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
        frequency   TEXT NOT NULL DEFAULT 'monthly',
        next_run    DATE,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        category    TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_recurring_expenses_company  ON recurring_expenses(company_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_expenses_facility ON recurring_expenses(facility_id);
      CREATE INDEX IF NOT EXISTS idx_recurring_expenses_next_run ON recurring_expenses(next_run) WHERE is_active = TRUE;
    `);

    // Pull semua booking dari Supabase sport_center_bookings → sport_bookings (idempoten via ON CONFLICT)
    try {
      const pullResult = await pullLegacyBookingsFromSupabase();
      logger.info({ ...pullResult }, "Sport Center migration: pull legacy bookings dari Supabase selesai");
    } catch (pullErr) {
      logger.warn({ err: pullErr }, "Sport Center migration: pull legacy bookings gagal (non-fatal)");
    }

    logger.info("Sport Center migration: selesai");
  } catch (err) {
    logger.error({ err }, "Sport Center migration: gagal");
    throw err;
  }
}

/**
 * Koreksi journal entry Sport Center yang salah masuk ke akun 4-1010
 * (Pendapatan Jasa Freight) — pindahkan ke 4-1017 (Pendapatan Booking Sport Center).
 * Idempoten: jika sudah tidak ada baris yang salah, skip.
 */
export async function runSportCenterAccountCorrection(): Promise<void> {
  try {
    const SPORT_CENTER_SOURCES = [
      "sport_center_booking",
      "sport_center_booking_reversal",
      "sport_center_booking_refund",
      "sport_center_booking_refund_direct",
      "sport_center_refund",
    ];

    const result = await db.execute(sql`
      WITH
        acct_freight AS (
          SELECT id, company_id FROM chart_of_accounts WHERE code = '4-1010'
        ),
        acct_sc AS (
          SELECT id, company_id FROM chart_of_accounts WHERE code = '4-1017'
        ),
        bad_lines AS (
          SELECT ael.id AS line_id,
                 asc2.id AS correct_account_id
          FROM accounting_entry_lines ael
          JOIN accounting_entries ae ON ae.id = ael.entry_id
          JOIN acct_freight af
            ON af.id = ael.account_id
               AND (af.company_id = ae.company_id OR af.company_id IS NULL)
          JOIN acct_sc asc2
            ON (asc2.company_id = ae.company_id OR asc2.company_id IS NULL)
          WHERE ae.source::text = ANY(ARRAY[${sql.raw(SPORT_CENTER_SOURCES.map(s => `'${s}'`).join(","))}])
        )
      UPDATE accounting_entry_lines ael
        SET account_id = bad_lines.correct_account_id
      FROM bad_lines
      WHERE ael.id = bad_lines.line_id
    `);

    const affected = (result as { rowCount?: number }).rowCount ?? 0;
    if (affected > 0) {
      logger.info({ affected }, "Sport Center account correction: dipindahkan dari 4-1010 → 4-1017");
    } else {
      logger.info("Sport Center account correction: tidak ada baris yang perlu dikoreksi");
    }
  } catch (err) {
    logger.warn({ err }, "Sport Center account correction: gagal (non-fatal)");
  }
}
