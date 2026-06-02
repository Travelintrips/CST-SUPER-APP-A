import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";

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

    logger.info("Sport Center migration: selesai");
  } catch (err) {
    logger.error({ err }, "Sport Center migration: gagal");
    throw err;
  }
}
