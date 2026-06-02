import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const PREFIX = "[SportSync]";

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 1000): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.warn(`${PREFIX} attempt ${i + 1} gagal, retry dalam ${delayMs}ms...`, err);
        await sleep(delayMs * (i + 1));
      }
    }
  }
  throw lastErr;
}

export interface FacilityRow {
  id: number;
  name: string;
  type?: string;
  description?: string | null;
  capacity?: number;
  price_per_hour?: number;
  is_active?: boolean;
  sort_order?: number;
  image_url?: string | null;
  company_id?: number | null;
}

function facilityCode(id: number) {
  return `facility_${id}`;
}

/**
 * Upsert ke sport_center_services (katalog layanan customer portal).
 * Gunakan `code = 'facility_<id>'` sebagai kunci idempoten.
 */
async function syncToServices(row: FacilityRow) {
  const code = facilityCode(row.id);
  const category = row.type ?? "court";
  const price = Math.round(Number(row.price_per_hour ?? 0));
  const cap = Number(row.capacity ?? 1);

  await retry(async () => {
    await db.execute(sql`
      INSERT INTO sport_center_services (code, name, category, description, price_per_hour, capacity, is_active, sort_order, image_url, updated_at)
      VALUES (
        ${code},
        ${row.name},
        ${category},
        ${row.description ?? null},
        ${price},
        ${cap},
        ${row.is_active ?? true},
        ${row.sort_order ?? 0},
        ${row.image_url ?? null},
        NOW()
      )
      ON CONFLICT (code) DO UPDATE SET
        name          = EXCLUDED.name,
        category      = EXCLUDED.category,
        description   = EXCLUDED.description,
        price_per_hour= EXCLUDED.price_per_hour,
        capacity      = EXCLUDED.capacity,
        is_active     = EXCLUDED.is_active,
        sort_order    = EXCLUDED.sort_order,
        image_url     = EXCLUDED.image_url,
        updated_at    = NOW()
    `);
  });

  console.log(`${PREFIX} sport_center_services upsert OK → code=${code} name="${row.name}"`);
}

/**
 * Upsert ke sport_center_facilities (dashboard / top fasilitas).
 * Gunakan `name` sebagai kunci idempoten (unique constraint sudah ada).
 * usage_count & revenue_total TIDAK disentuh saat update — dikelola trigger booking.
 */
async function syncToFacilities(row: FacilityRow) {
  const category = row.type ?? "court";
  const price = Math.round(Number(row.price_per_hour ?? 0));
  const cap = Number(row.capacity ?? 1);

  await retry(async () => {
    await db.execute(sql`
      INSERT INTO sport_center_facilities (name, category, description, price_per_hour, capacity, is_active, sort_order, updated_at)
      VALUES (
        ${row.name},
        ${category},
        ${row.description ?? null},
        ${price},
        ${cap},
        ${row.is_active ?? true},
        ${row.sort_order ?? 0},
        NOW()
      )
      ON CONFLICT (name) DO UPDATE SET
        category      = EXCLUDED.category,
        description   = EXCLUDED.description,
        price_per_hour= EXCLUDED.price_per_hour,
        capacity      = EXCLUDED.capacity,
        is_active     = EXCLUDED.is_active,
        sort_order    = EXCLUDED.sort_order,
        updated_at    = NOW()
    `);
  });

  console.log(`${PREFIX} sport_center_facilities upsert OK → name="${row.name}"`);
}

/**
 * Sinkron INSERT/UPDATE facility ke kedua tabel Supabase.
 * Fire-and-forget safe: semua error dicatch dan dilog, tidak throw ke caller.
 */
export async function syncFacilityUpsert(row: FacilityRow): Promise<void> {
  const ops = [syncToServices(row), syncToFacilities(row)];
  const results = await Promise.allSettled(ops);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`${PREFIX} sinkronisasi gagal setelah 3 retry:`, r.reason);
    }
  }
}

/**
 * Sinkron DELETE: set is_active=false di kedua tabel (soft delete).
 * Jika row belum ada, tidak error.
 */
export async function syncFacilityDelete(id: number, name: string): Promise<void> {
  const code = facilityCode(id);

  const ops = [
    retry(async () => {
      await db.execute(sql`
        UPDATE sport_center_services SET is_active = false, updated_at = NOW()
        WHERE code = ${code}
      `);
      console.log(`${PREFIX} sport_center_services soft-delete OK → code=${code}`);
    }),
    retry(async () => {
      await db.execute(sql`
        UPDATE sport_center_facilities SET is_active = false, updated_at = NOW()
        WHERE name = ${name}
      `);
      console.log(`${PREFIX} sport_center_facilities soft-delete OK → name="${name}"`);
    }),
  ];

  const results = await Promise.allSettled(ops);
  for (const r of results) {
    if (r.status === "rejected") {
      console.error(`${PREFIX} delete sync gagal setelah 3 retry:`, r.reason);
    }
  }
}

/**
 * Sinkron SEMUA baris dari sport_facilities ke kedua tabel Supabase.
 * Dipakai untuk initial sync / resync manual via endpoint admin.
 */
export async function syncAllFacilities(): Promise<{ synced: number; errors: number }> {
  const result = await db.execute(sql`SELECT * FROM sport_facilities ORDER BY id ASC`);
  const rows = result.rows as FacilityRow[];

  let synced = 0;
  let errors = 0;

  for (const row of rows) {
    try {
      await syncFacilityUpsert(row);
      synced++;
    } catch {
      errors++;
    }
  }

  console.log(`${PREFIX} full sync selesai: ${synced} OK, ${errors} gagal dari ${rows.length} total`);
  return { synced, errors };
}
