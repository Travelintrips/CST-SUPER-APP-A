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

  // Kolom tambahan pos_products (tidak ada FK ke tabel lain di sini)
  await db.execute(sql`
    ALTER TABLE pos_products
      ADD COLUMN IF NOT EXISTS stock_usage_per_unit NUMERIC(12,3) NOT NULL DEFAULT 1
  `);
  // Stok langsung per produk (lebih simpel, auto-deduct per transaksi)
  await db.execute(sql`
    ALTER TABLE pos_products
      ADD COLUMN IF NOT EXISTS stock NUMERIC(12,3)
  `);
  await db.execute(sql`
    ALTER TABLE pos_products
      ADD COLUMN IF NOT EXISTS stock_unit TEXT NOT NULL DEFAULT 'pcs'
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

  // FK stock_item_id pada pos_products — harus setelah pos_stock_items dibuat
  await db.execute(sql`
    ALTER TABLE pos_products
      ADD COLUMN IF NOT EXISTS stock_item_id INTEGER REFERENCES pos_stock_items(id) ON DELETE SET NULL
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

  // Seed default branches if no branches exist
  const branchCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_branches`);
  const bCnt = Number((branchCount.rows[0] as { cnt: string }).cnt);
  if (bCnt === 0) {
    await db.execute(sql`
      INSERT INTO pos_branches (name, address, is_active) VALUES
        ('Sport Center Bandara Soekarno Hatta', 'Sport Center, Bandara Soekarno Hatta', TRUE),
        ('TOD M1 Bandara Soekarno Hatta', 'TOD M1, Bandara Soekarno Hatta', TRUE)
    `);
  }

  // Seed produk default Thai Tea CST jika tabel masih kosong
  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_products`);
  const cnt = Number((existing.rows[0] as { cnt: string }).cnt);
  if (cnt === 0) {
    await db.execute(sql`
      INSERT INTO pos_products (name, description, price, category, sort_order, image_url) VALUES
        ('Premium Matcha',    'Matcha premium grade A dengan susu segar',       22000, 'minuman', 1,  '/menu/premium-matcha.png'),
        ('Premium Chocolate', 'Coklat belgia premium dengan susu full cream',    20000, 'minuman', 2,  '/menu/premium-chocolate.png'),
        ('Thai Tea',          'Thai tea klasik dengan susu kental manis',        15000, 'minuman', 3,  '/menu/thai-tea.jpg'),
        ('Matcha',            'Green tea matcha dengan pilihan topping',         16000, 'minuman', 4,  '/menu/matcha.jpg'),
        ('Chocolate',         'Minuman coklat lezat dengan topping pilihan',     14000, 'minuman', 5,  '/menu/chocolate.jpg'),
        ('Cream Cheese',      'Thai tea dengan topping cream cheese gurih',      17000, 'minuman', 6,  '/menu/cream-cheese.jpg'),
        ('Cheese Parut',      'Thai tea dengan taburan keju parut melimpah',     16000, 'minuman', 7,  '/menu/cheese.jpg'),
        ('Bubble',            'Minuman segar dengan boba pearl kenyal',          15000, 'minuman', 9,  '/menu/bubble.jpg'),
        ('Premium Thai Tea',  'Thai tea premium dengan susu fresh grade A',      25000, 'minuman', 11, '/menu/premium-thai-tea.png')
    `);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_shift_status enum
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_shift_status') THEN
        CREATE TYPE pos_shift_status AS ENUM ('open', 'closed');
      END IF;
    END $$;
  `);

  // pos_shifts table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_shifts (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      cashier_id INTEGER NOT NULL REFERENCES pos_cashiers(id),
      opened_at TIMESTAMP NOT NULL DEFAULT NOW(),
      closed_at TIMESTAMP,
      opening_cash NUMERIC(12,2) NOT NULL DEFAULT 0,
      closing_cash NUMERIC(12,2),
      total_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
      order_count INTEGER NOT NULL DEFAULT 0,
      status pos_shift_status NOT NULL DEFAULT 'open',
      notes TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ── MULTI CABANG + GUDANG + RAK MIGRATION ─────────────────────────────────

  // pos_warehouses
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_warehouses (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      type TEXT NOT NULL DEFAULT 'umum',
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_racks
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_racks (
      id SERIAL PRIMARY KEY,
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      warehouse_id INTEGER NOT NULL REFERENCES pos_warehouses(id),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_inventory_items (master bahan baku)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_inventory_items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      sku TEXT NOT NULL UNIQUE,
      unit TEXT NOT NULL DEFAULT 'pcs',
      min_stock NUMERIC(12,3) NOT NULL DEFAULT 0,
      cost_price NUMERIC(12,2) NOT NULL DEFAULT 0,
      note TEXT,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_inventory_stocks
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_inventory_stocks (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      warehouse_id INTEGER REFERENCES pos_warehouses(id),
      rack_id INTEGER REFERENCES pos_racks(id),
      qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_recipes (resep/BOM per menu)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_recipes (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL UNIQUE REFERENCES pos_products(id),
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_recipes: kolom baru (v2)
  await db.execute(sql`ALTER TABLE pos_recipes ADD COLUMN IF NOT EXISTS recipe_name TEXT`);
  await db.execute(sql`ALTER TABLE pos_recipes ADD COLUMN IF NOT EXISTS yield_qty NUMERIC(12,3) NOT NULL DEFAULT 1`);
  await db.execute(sql`ALTER TABLE pos_recipes ADD COLUMN IF NOT EXISTS yield_unit TEXT NOT NULL DEFAULT 'pcs'`);
  await db.execute(sql`ALTER TABLE pos_recipes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE`);

  // pos_recipe_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_recipe_items (
      id SERIAL PRIMARY KEY,
      recipe_id INTEGER NOT NULL REFERENCES pos_recipes(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      qty NUMERIC(12,3) NOT NULL DEFAULT 0
    )
  `);

  // pos_recipe_items: kolom baru (v2)
  await db.execute(sql`ALTER TABLE pos_recipe_items ADD COLUMN IF NOT EXISTS waste_pct NUMERIC(5,2)`);
  await db.execute(sql`ALTER TABLE pos_recipe_items ADD COLUMN IF NOT EXISTS notes TEXT`);

  // pos_stock_transfers
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_transfers (
      id SERIAL PRIMARY KEY,
      transfer_number TEXT NOT NULL UNIQUE,
      from_branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      to_branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      status TEXT NOT NULL DEFAULT 'draft',
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      sent_at TIMESTAMP,
      received_at TIMESTAMP
    )
  `);

  // pos_stock_transfer_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_transfer_items (
      id SERIAL PRIMARY KEY,
      transfer_id INTEGER NOT NULL REFERENCES pos_stock_transfers(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      from_warehouse_id INTEGER REFERENCES pos_warehouses(id),
      to_warehouse_id INTEGER REFERENCES pos_warehouses(id)
    )
  `);

  // pos_stock_mutations (log mutasi stok)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_mutations (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      warehouse_id INTEGER REFERENCES pos_warehouses(id),
      rack_id INTEGER REFERENCES pos_racks(id),
      type TEXT NOT NULL,
      qty NUMERIC(12,3) NOT NULL,
      qty_before NUMERIC(12,3) NOT NULL DEFAULT 0,
      qty_after NUMERIC(12,3) NOT NULL DEFAULT 0,
      ref_type TEXT,
      ref_id INTEGER,
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_stock_opnames
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_opnames (
      id SERIAL PRIMARY KEY,
      opname_number TEXT NOT NULL UNIQUE,
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      warehouse_id INTEGER REFERENCES pos_warehouses(id),
      status TEXT NOT NULL DEFAULT 'draft',
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      confirmed_at TIMESTAMP
    )
  `);

  // pos_stock_opname_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_opname_items (
      id SERIAL PRIMARY KEY,
      opname_id INTEGER NOT NULL REFERENCES pos_stock_opnames(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      system_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      actual_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      diff_qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      note TEXT
    )
  `);

  // Seed gudang default untuk setiap cabang
  const warehouseCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_warehouses`);
  const wCnt = Number((warehouseCount.rows[0] as { cnt: string }).cnt);
  if (wCnt === 0) {
    const branches = await db.execute(sql`SELECT id FROM pos_branches ORDER BY id`);
    for (const branch of branches.rows as { id: number }[]) {
      await db.execute(sql`
        INSERT INTO pos_warehouses (name, branch_id, type, is_active) VALUES
          ('Gudang Utama', ${branch.id}, 'umum', TRUE),
          ('Gudang Produksi', ${branch.id}, 'produksi', TRUE)
      `);
    }
  }

  // Seed bahan baku default
  const invCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_inventory_items`);
  const iCnt = Number((invCount.rows[0] as { cnt: string }).cnt);
  if (iCnt === 0) {
    await db.execute(sql`
      INSERT INTO pos_inventory_items (name, sku, unit, min_stock, cost_price) VALUES
        ('Bubuk Thai Tea',  'SKU-001', 'gram',  500,  80000),
        ('Bubuk Matcha',    'SKU-002', 'gram',  300,  150000),
        ('Susu',            'SKU-003', 'ml',    2000, 18000),
        ('Cup 16oz',        'SKU-004', 'pcs',   200,  1500),
        ('Cheese Cream',    'SKU-005', 'gram',  500,  45000),
        ('Brown Sugar',     'SKU-006', 'gram',  500,  15000),
        ('Bubble Boba',     'SKU-007', 'gram',  500,  25000),
        ('Bubuk Coklat',    'SKU-008', 'gram',  300,  90000),
        ('Sedotan',         'SKU-009', 'pcs',   500,  200),
        ('Plastik Seal',    'SKU-010', 'pcs',   500,  300)
    `);
  }

  // Transfer enhancements (v3) – pending / in_transit / cancelled statuses
  await db.execute(sql`ALTER TABLE pos_stock_transfers ADD COLUMN IF NOT EXISTS pending_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE pos_stock_transfers ADD COLUMN IF NOT EXISTS in_transit_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE pos_stock_transfers ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMP`);
  await db.execute(sql`ALTER TABLE pos_stock_transfers ADD COLUMN IF NOT EXISTS cancelled_reason TEXT`);

  // pos_stock_returns
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_returns (
      id SERIAL PRIMARY KEY,
      return_number TEXT NOT NULL UNIQUE,
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      warehouse_id INTEGER REFERENCES pos_warehouses(id),
      return_type TEXT NOT NULL DEFAULT 'customer',
      status TEXT NOT NULL DEFAULT 'draft',
      note TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      approved_at TIMESTAMP,
      cancelled_at TIMESTAMP
    )
  `);

  // pos_stock_return_items
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_return_items (
      id SERIAL PRIMARY KEY,
      return_id INTEGER NOT NULL REFERENCES pos_stock_returns(id) ON DELETE CASCADE,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      condition TEXT NOT NULL DEFAULT 'good',
      note TEXT
    )
  `);

  // pos_stock_losses (rusak / hilang / kadaluarsa langsung dicatat)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_losses (
      id SERIAL PRIMARY KEY,
      loss_number TEXT NOT NULL UNIQUE,
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      warehouse_id INTEGER REFERENCES pos_warehouses(id),
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      qty NUMERIC(12,3) NOT NULL,
      loss_type TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // pos_stock_quarantine (barang retur kondisi rusak/expired)
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_stock_quarantine (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL REFERENCES pos_inventory_items(id),
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id),
      warehouse_id INTEGER REFERENCES pos_warehouses(id),
      qty NUMERIC(12,3) NOT NULL DEFAULT 0,
      condition TEXT NOT NULL DEFAULT 'damaged',
      return_id INTEGER REFERENCES pos_stock_returns(id),
      reason TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  // ── THAI TEA MIGRATION ────────────────────────────────────────────────────

  // business_unit column di pos_branches (untuk filter per unit bisnis)
  await db.execute(sql`
    ALTER TABLE pos_branches
      ADD COLUMN IF NOT EXISTS business_unit TEXT
  `);

  // ── AUTO-PROVISION WAREHOUSES (ERP) PER POS_BRANCH ───────────────────────
  // Sistem gudang sudah dimerge: setiap pos_branches harus punya entry di warehouses
  // agar POS/stock operations bisa resolve warehouse_id secara langsung.
  const unlinkedBranches = await db.execute(sql`
    SELECT pb.id, pb.name
    FROM pos_branches pb
    WHERE NOT EXISTS (
      SELECT 1 FROM warehouses w WHERE w.branch_id = pb.id
    )
    ORDER BY pb.id
  `);
  for (const branch of unlinkedBranches.rows as { id: number; name: string }[]) {
    await db.execute(sql`
      INSERT INTO warehouses (warehouse_code, warehouse_name, warehouse_type, is_active, branch_id)
      VALUES (
        'WH-BR-' || ${branch.id},
        ${branch.name + ' — Gudang Utama'},
        'BRANCH',
        TRUE,
        ${branch.id}
      )
      ON CONFLICT DO NOTHING
    `);
    logger.info(`Provisioned ERP warehouse for branch #${branch.id}: ${branch.name}`);
  }

  logger.info("POS Kasir migration: selesai (+ multi-cabang + gudang + rak + inventory + unified-warehouse)");

  // ── POS MULTI-BRANCH ACCESS CONTROL MIGRATION ─────────────────────────────

  // pos_role enum
  await db.execute(sql`
    DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'pos_role') THEN
        CREATE TYPE pos_role AS ENUM ('owner', 'admin', 'manager', 'kasir', 'gudang');
      END IF;
    END $$;
  `);

  // pos_roles: definisi role POS dengan permissions
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS pos_roles (
      id SERIAL PRIMARY KEY,
      company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE,
      name pos_role NOT NULL,
      display_name TEXT NOT NULL,
      permissions JSONB NOT NULL DEFAULT '[]',
      is_system_role BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS pos_roles_company_name_unique ON pos_roles(company_id, name)
  `);

  // user_branch_access: cabang mana saja yang bisa diakses user/kasir
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS user_branch_access (
      id SERIAL PRIMARY KEY,
      company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      cashier_id INTEGER,
      user_id TEXT,
      branch_id INTEGER NOT NULL REFERENCES pos_branches(id) ON DELETE CASCADE,
      pos_role pos_role NOT NULL DEFAULT 'kasir',
      is_default BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS uba_company_idx ON user_branch_access(company_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS uba_cashier_idx ON user_branch_access(cashier_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS uba_user_idx ON user_branch_access(user_id)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS uba_branch_idx ON user_branch_access(branch_id)`);

  // Tambah pos_role ke pos_cashiers
  await db.execute(sql`
    ALTER TABLE pos_cashiers
      ADD COLUMN IF NOT EXISTS pos_role pos_role NOT NULL DEFAULT 'kasir'
  `);

  // Tambah default_branch_id ke pos_cashiers
  await db.execute(sql`
    ALTER TABLE pos_cashiers
      ADD COLUMN IF NOT EXISTS default_branch_id INTEGER REFERENCES pos_branches(id)
  `);

  // Tambah company_id ke pos_cashiers
  await db.execute(sql`
    ALTER TABLE pos_cashiers
      ADD COLUMN IF NOT EXISTS company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL
  `);

  // Tambah default_warehouse_id ke pos_branches
  await db.execute(sql`
    ALTER TABLE pos_branches
      ADD COLUMN IF NOT EXISTS default_warehouse_id INTEGER REFERENCES pos_warehouses(id)
  `);

  // Tambah default_branch_id ke users
  await db.execute(sql`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS default_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL
  `);

  // Seed default system roles jika belum ada
  const roleCount = await db.execute(sql`SELECT COUNT(*) as cnt FROM pos_roles WHERE is_system_role = TRUE`);
  const rCnt = Number((roleCount.rows[0] as { cnt: string }).cnt);
  if (rCnt === 0) {
    const ownerPerms = JSON.stringify([
      "pos.*", "pos.orders.*", "pos.reports.*", "pos.inventory.*",
      "pos.settings.*", "pos.users.*", "pos.branches.*", "pos.roles.*"
    ]);
    const adminPerms = JSON.stringify([
      "pos.orders.*", "pos.reports.*", "pos.inventory.*",
      "pos.settings.*", "pos.users.view", "pos.users.manage"
    ]);
    const managerPerms = JSON.stringify([
      "pos.orders.*", "pos.reports.*", "pos.inventory.*", "pos.settings.view"
    ]);
    const kasirPerms = JSON.stringify([
      "pos.orders.create", "pos.orders.view", "pos.orders.cancel"
    ]);
    const gudangPerms = JSON.stringify([
      "pos.inventory.*", "pos.inventory.transfer", "pos.inventory.opname"
    ]);

    await db.execute(sql`
      INSERT INTO pos_roles (company_id, name, display_name, permissions, is_system_role) VALUES
        (NULL, 'owner',   'Owner',   ${ownerPerms}::jsonb,   TRUE),
        (NULL, 'admin',   'Admin',   ${adminPerms}::jsonb,   TRUE),
        (NULL, 'manager', 'Manager', ${managerPerms}::jsonb, TRUE),
        (NULL, 'kasir',   'Kasir',   ${kasirPerms}::jsonb,   TRUE),
        (NULL, 'gudang',  'Gudang',  ${gudangPerms}::jsonb,  TRUE)
      ON CONFLICT DO NOTHING
    `);
    logger.info("POS system roles seeded (Owner, Admin, Manager, Kasir, Gudang)");
  }

  // Auto-populate user_branch_access dari data cashier yang sudah ada
  await db.execute(sql`
    INSERT INTO user_branch_access (company_id, cashier_id, branch_id, pos_role, is_default)
    SELECT
      COALESCE(c.company_id, (SELECT id FROM companies ORDER BY id LIMIT 1)),
      c.id,
      c.branch_id,
      c.pos_role,
      TRUE
    FROM pos_cashiers c
    WHERE c.branch_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM user_branch_access uba
      WHERE uba.cashier_id = c.id AND uba.branch_id = c.branch_id
    )
  `);

  // P6 (Audit Step 2): Tambah kolom erp_branch_id pada pos_branches
  // untuk menghubungkan cabang POS ke cabang ERP utama (akuntansi/reporting).
  await db.execute(sql`
    ALTER TABLE pos_branches
    ADD COLUMN IF NOT EXISTS erp_branch_id INTEGER
  `);

  logger.info("POS Access Control migration: selesai (pos_roles, user_branch_access, new columns, erp_branch_id)");
}
