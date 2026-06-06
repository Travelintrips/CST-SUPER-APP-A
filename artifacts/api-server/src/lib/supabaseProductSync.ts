/**
 * Supabase Product Sync
 * Mirrors product data from Replit PostgreSQL → Supabase DB table `bizportal_products`.
 * Product images are already stored in Supabase Storage (via ObjectStorageService).
 * All operations are fire-and-forget: failures are logged but never throw.
 */

const PREFIX = "[ProductSync]";

const TABLE = "bizportal_products";

export interface ProductSyncRow {
  id: number;
  sku: string;
  name: string;
  description: string | null;
  price: number;
  costPrice: number;
  stock: number;
  unit: string;
  itemType: string;
  subcategory: string | null;
  isActive: boolean;
  imageUrl: string | null;
  mediaItems: string;
  categories: string[];
  companyId: number | null;
  currencyCode: string;
  createdAt: string;
}

function getClient() {
  try {
    const mod = require("./supabaseAdmin.js");
    return mod.supabaseAdmin as import("@supabase/supabase-js").SupabaseClient | null;
  } catch {
    return null;
  }
}

async function getClientAsync(): Promise<import("@supabase/supabase-js").SupabaseClient | null> {
  try {
    const { supabaseAdmin } = await import("./supabaseAdmin.js");
    return supabaseAdmin as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch {
    return null;
  }
}

function buildPayload(row: ProductSyncRow) {
  return {
    id:            row.id,
    sku:           row.sku,
    name:          row.name,
    description:   row.description ?? null,
    price:         row.price,
    cost_price:    row.costPrice,
    stock:         row.stock,
    unit:          row.unit,
    item_type:     row.itemType,
    subcategory:   row.subcategory ?? null,
    is_active:     row.isActive,
    image_url:     row.imageUrl ?? null,
    media_items:   row.mediaItems,
    categories:    row.categories,
    company_id:    row.companyId ?? null,
    currency_code: row.currencyCode,
    synced_at:     new Date().toISOString(),
  };
}

/** Upsert satu produk ke Supabase DB (fire-and-forget). */
export async function syncProductToSupabase(row: ProductSyncRow): Promise<void> {
  try {
    const client = await getClientAsync();
    if (!client) return;
    const payload = buildPayload(row);
    const { error } = await (client as any)
      .from(TABLE)
      .upsert(payload, { onConflict: "id" });
    if (error) {
      if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
        console.warn(`${PREFIX} Tabel "${TABLE}" belum ada di Supabase. Jalankan SQL setup di dashboard Supabase. id=${row.id}`);
      } else {
        console.warn(`${PREFIX} upsert error id=${row.id}:`, error.message);
      }
    } else {
      console.log(`${PREFIX} synced id=${row.id} sku="${row.sku}"`);
    }
  } catch (err) {
    console.warn(`${PREFIX} syncProductToSupabase error:`, err instanceof Error ? err.message : err);
  }
}

/** Soft-delete produk di Supabase (set is_active=false). */
export async function deleteProductFromSupabase(id: number): Promise<void> {
  try {
    const client = await getClientAsync();
    if (!client) return;
    const { error } = await (client as any)
      .from(TABLE)
      .update({ is_active: false, synced_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.warn(`${PREFIX} soft-delete error id=${id}:`, error.message);
    } else {
      console.log(`${PREFIX} soft-deleted id=${id}`);
    }
  } catch (err) {
    console.warn(`${PREFIX} deleteProductFromSupabase error:`, err instanceof Error ? err.message : err);
  }
}

/** Bulk sync semua produk. Panggil dari endpoint admin. */
export async function syncAllProductsToSupabase(
  rows: ProductSyncRow[],
): Promise<{ synced: number; errors: number; total: number }> {
  const client = await getClientAsync();
  if (!client) {
    console.warn(`${PREFIX} Supabase client tidak tersedia, skip bulk sync`);
    return { synced: 0, errors: rows.length, total: rows.length };
  }

  let synced = 0;
  let errors = 0;

  // Batch upsert dalam chunk 50 agar tidak hit payload limit
  const CHUNK = 50;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const payloads = chunk.map(buildPayload);
    try {
      const { error } = await (client as any)
        .from(TABLE)
        .upsert(payloads, { onConflict: "id" });
      if (error) {
        if (error.message?.includes("does not exist") || error.message?.includes("relation")) {
          console.warn(`${PREFIX} Tabel "${TABLE}" belum ada di Supabase. Jalankan SQL setup dulu.`);
          errors += chunk.length;
          break;
        }
        console.warn(`${PREFIX} bulk upsert error (chunk ${i}–${i + chunk.length}):`, error.message);
        errors += chunk.length;
      } else {
        synced += chunk.length;
        console.log(`${PREFIX} bulk synced chunk ${i}–${i + chunk.length} OK`);
      }
    } catch (err) {
      console.warn(`${PREFIX} bulk chunk error:`, err instanceof Error ? err.message : err);
      errors += chunk.length;
    }
  }

  console.log(`${PREFIX} bulk sync selesai: ${synced} OK, ${errors} error dari ${rows.length} total`);
  return { synced, errors, total: rows.length };
}

/** SQL yang harus dijalankan satu kali di Supabase Dashboard → SQL Editor. */
export const SETUP_SQL = `
-- Jalankan sekali di Supabase Dashboard → SQL Editor
CREATE TABLE IF NOT EXISTS ${TABLE} (
  id            INTEGER PRIMARY KEY,
  sku           TEXT UNIQUE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  price         NUMERIC(12,2) NOT NULL DEFAULT 0,
  cost_price    NUMERIC(12,2) DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  unit          TEXT NOT NULL DEFAULT 'pcs',
  item_type     TEXT NOT NULL DEFAULT 'barang',
  subcategory   TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  image_url     TEXT,
  media_items   TEXT DEFAULT '[]',
  categories    TEXT[] DEFAULT '{}',
  company_id    INTEGER,
  currency_code TEXT NOT NULL DEFAULT 'IDR',
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS (read-only untuk publik, write via service role saja)
ALTER TABLE ${TABLE} ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "allow_public_read" ON ${TABLE}
  FOR SELECT USING (true);
`.trim();
