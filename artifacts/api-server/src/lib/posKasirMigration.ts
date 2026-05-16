import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runPosKasirMigration(): Promise<void> {
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kasir_status') THEN
        CREATE TYPE kasir_status AS ENUM ('pending', 'approved', 'rejected');
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_order_status') THEN
        CREATE TYPE pos_order_status AS ENUM ('open', 'paid', 'cancelled');
      END IF;
    END $$;
  `);
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_payment_method') THEN
        CREATE TYPE pos_payment_method AS ENUM ('cash', 'qris', 'debit', 'credit', 'transfer');
      END IF;
    END $$;
  `);

  // Branches table (must exist before cashiers)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_branches (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      address TEXT,
      phone TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_cashiers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      phone TEXT,
      status kasir_status NOT NULL DEFAULT 'pending',
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Add branch_id to pos_cashiers if not exists
  await db.execute(sql`
    ALTER TABLE pos_cashiers
      ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES pos_branches(id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      price NUMERIC(12,2) NOT NULL DEFAULT 0,
      category TEXT NOT NULL DEFAULT 'minuman',
      image_url TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Kolom baru: relasi produk → stok bahan (opsional, untuk auto-deduct stok saat bayar)
  await db.execute(sql`
    ALTER TABLE pos_products
      ADD COLUMN IF NOT EXISTS stock_item_id INTEGER REFERENCES pos_stock_items(id) ON DELETE SET NULL
  `);
  await db.execute(sql`
    ALTER TABLE pos_products
      ADD COLUMN IF NOT EXISTS stock_usage_per_unit NUMERIC(12,3) NOT NULL DEFAULT 1
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT NOT NULL UNIQUE,
      cashier_id INTEGER NOT NULL REFERENCES pos_cashiers(id),
      status pos_order_status NOT NULL DEFAULT 'open',
      payment_method pos_payment_method,
      subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
      discount NUMERIC(12,2) NOT NULL DEFAULT 0,
      total NUMERIC(12,2) NOT NULL DEFAULT 0,
      amount_paid NUMERIC(12,2),
      change NUMERIC(12,2),
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      paid_at TIMESTAMP
    )
  `);

  // Add branch_id to pos_orders if not exists
  await db.execute(sql`
    ALTER TABLE pos_orders
      ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES pos_branches(id)
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_order_items (
      id SERIAL PRIMARY KEY,
      order_id INTEGER NOT NULL REFERENCES pos_orders(id) ON DELETE CASCADE,
      product_id INTEGER NOT NULL REFERENCES pos_products(id),
      product_name TEXT NOT NULL,
      price NUMERIC(12,2) NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      subtotal NUMERIC(12,2) NOT NULL
    )
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      unit TEXT NOT NULL DEFAULT 'pcs',
      current_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      note TEXT,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Tambah branch_id ke pos_stock_items (stok per-cabang)
  await db.execute(sql`
    ALTER TABLE pos_stock_items
      ADD COLUMN IF NOT EXISTS branch_id INTEGER REFERENCES pos_branches(id) ON DELETE SET NULL
  `);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_adjustments (
      id SERIAL PRIMARY KEY,
      stock_item_id INTEGER NOT NULL REFERENCES pos_stock_items(id),
      cashier_id INTEGER REFERENCES pos_cashiers(id),
      delta NUMERIC(12,3) NOT NULL,
      reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // Seed default branch "Pusat" if no branches exist
  const branchCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_branches`);
  const bCnt = Number((branchCount.rows[0] as { cnt: string }).cnt);
  if (bCnt === 0) {
    await db.execute(sql`
      INSERT INTO pos_branches (name, is_active) VALUES ('Pusat', TRUE)
    `);
  }

  // Seed produk default Thai Tea CST jika tabel masih kosong
  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_products`);
  const cnt = Number((existing.rows[0] as { cnt: string }).cnt);
  if (cnt === 0) {
    await db.execute(sql`
      INSERT INTO pos_products (name, description, price, category, sort_order) VALUES
        ('Thai Tea Original', 'Thai tea klasik dengan susu kental manis', 12000, 'minuman', 1),
        ('Thai Tea Cheese', 'Thai tea dengan topping keju gurih', 15000, 'minuman', 2),
        ('Thai Tea Brown Sugar', 'Thai tea dengan brown sugar caramel', 14000, 'minuman', 3),
        ('Thai Tea Taro', 'Thai tea rasa taro ungu', 14000, 'minuman', 4),
        ('Thai Tea Matcha', 'Perpaduan matcha dan thai tea', 15000, 'minuman', 5),
        ('Thai Tea Pandan', 'Thai tea dengan aroma pandan segar', 13000, 'minuman', 6),
        ('Milk Tea Original', 'Milk tea klasik tanpa boba', 11000, 'minuman', 7),
        ('Boba Thai Tea', 'Thai tea dengan boba pearl', 16000, 'minuman', 8),
        ('Thai Tea Large', 'Ukuran 500ml, porsi jumbo', 18000, 'minuman', 9),
        ('Snack Roti Bakar', 'Roti bakar dengan selai coklat', 8000, 'makanan', 10)
    `);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  logger.info("POS Kasir migration: selesai (+ cabang + settings)");
}
