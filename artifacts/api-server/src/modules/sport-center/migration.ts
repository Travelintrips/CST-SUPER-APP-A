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
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_date ON sport_bookings(booking_date);
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_facility ON sport_bookings(facility_id);
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_status ON sport_bookings(status);
      CREATE INDEX IF NOT EXISTS idx_sport_bookings_company ON sport_bookings(company_id);
      CREATE INDEX IF NOT EXISTS idx_sport_members_type ON sport_members(member_type);
      CREATE INDEX IF NOT EXISTS idx_sport_notifications_read ON sport_notifications(is_read);
    `);

    logger.info("Sport Center migration: selesai");
  } catch (err) {
    logger.error({ err }, "Sport Center migration: gagal");
    throw err;
  }
}
