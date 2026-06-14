import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { notifySyncError } from "./sportSyncNotifier.js";

const PREFIX = "[SportSync]";

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function retry<T>(fn: () => Promise<T>, attempts = 3, delayMs = 800): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) {
        console.warn(`${PREFIX} attempt ${i + 1} gagal, retry dalam ${delayMs * (i + 1)}ms...`, err);
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

export interface BookingRow {
  id: number;
  booking_number: string;
  customer_name: string;
  customer_id?: number | null;
  customer_email?: string | null;
  customer_phone?: string | null;
  facility_id?: number | null;
  facility_name: string;
  booking_date: string;
  start_time: string;
  end_time: string;
  duration_hours?: number;
  base_amount?: number;
  total_amount?: number;
  status: string;
  payment_status?: string;
  notes?: string | null;
  company_id?: number | null;
  checked_in_at?: string | null;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  created_at?: string;
  updated_at?: string;
}

function facilityCode(id: number) {
  return `facility_${id}`;
}

async function writeSyncLog(opts: {
  entity: "facility" | "booking";
  action: "upsert" | "delete" | "resync";
  entityId: number | null;
  status: "ok" | "error";
  detail?: string;
  companyId?: number | null;
}) {
  try {
    await db.execute(sql`
      INSERT INTO sport_sync_logs (entity, action, entity_id, status, detail, company_id)
      VALUES (${opts.entity}, ${opts.action}, ${opts.entityId ?? null}, ${opts.status}, ${opts.detail ?? null}, ${opts.companyId ?? null})
    `);
  } catch {
  }
}

function getSupabaseClient() {
  try {
    const { getSportCenterSupabaseClient } = require("../../lib/supabaseAdminSportCenter.js");
    return getSportCenterSupabaseClient() as import("@supabase/supabase-js").SupabaseClient | null;
  } catch {
    return null;
  }
}

async function syncToServicesViaClient(row: FacilityRow): Promise<void> {
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }

  const code = facilityCode(row.id);
  const payload = {
    code,
    name: row.name,
    category: row.type ?? "court",
    description: row.description ?? null,
    price_per_hour: Math.round(Number(row.price_per_hour ?? 0)),
    capacity: Number(row.capacity ?? 1),
    is_active: row.is_active ?? true,
    sort_order: row.sort_order ?? 0,
    image_url: row.image_url ?? null,
    updated_at: new Date().toISOString(),
  };

  if (client) {
    await retry(async () => {
      const { error } = await (client as any)
        .from("sport_center_services")
        .upsert(payload, { onConflict: "code" });
      if (error) throw new Error(error.message);
    });
  } else {
    await retry(async () => {
      await db.execute(sql`
        INSERT INTO sport_center_services (code, name, category, description, price_per_hour, capacity, is_active, sort_order, image_url, updated_at)
        VALUES (${payload.code}, ${payload.name}, ${payload.category}, ${payload.description}, ${payload.price_per_hour}, ${payload.capacity}, ${payload.is_active}, ${payload.sort_order}, ${payload.image_url}, NOW())
        ON CONFLICT (code) DO UPDATE SET
          name           = EXCLUDED.name,
          category       = EXCLUDED.category,
          description    = EXCLUDED.description,
          price_per_hour = EXCLUDED.price_per_hour,
          capacity       = EXCLUDED.capacity,
          is_active      = EXCLUDED.is_active,
          sort_order     = EXCLUDED.sort_order,
          image_url      = EXCLUDED.image_url,
          updated_at     = NOW()
      `);
    });
  }
  console.log(`${PREFIX} sport_center_services upsert OK → code=${code} name="${row.name}"`);
}

async function syncToFacilitiesViaClient(row: FacilityRow): Promise<void> {
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }

  if (!client) {
    console.warn(`${PREFIX} syncToFacilitiesViaClient: client tidak tersedia, skip`);
    return;
  }

  const payload = {
    name: row.name,
    category: row.type ?? "court",
    description: row.description ?? null,
    price_per_hour: Math.round(Number(row.price_per_hour ?? 0)),
    updated_at: new Date().toISOString(),
  };

  await retry(async () => {
    const { error } = await (client as any)
      .schema("sport_center")
      .from("facilities")
      .upsert(payload, { onConflict: "name" });
    if (error) throw new Error(error.message);
  });
  console.log(`${PREFIX} sport_center.facilities upsert OK → name="${row.name}"`);
}

export async function syncFacilityUpsert(row: FacilityRow): Promise<void> {
  const ops = [syncToServicesViaClient(row), syncToFacilitiesViaClient(row)];
  const results = await Promise.allSettled(ops);
  const hasError = results.some(r => r.status === "rejected");
  const errorMessages: string[] = [];
  for (const r of results) {
    if (r.status === "rejected") {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`${PREFIX} facility upsert gagal setelah retry:`, r.reason);
      errorMessages.push(msg);
    }
  }
  void writeSyncLog({
    entity: "facility",
    action: "upsert",
    entityId: row.id,
    status: hasError ? "error" : "ok",
    detail: hasError ? errorMessages[0] ?? "partial failure" : undefined,
    companyId: row.company_id,
  });
  if (hasError) {
    void notifySyncError([{
      entity: "facility",
      entityId: row.id,
      entityName: row.name,
      action: "upsert",
      error: errorMessages.join("; "),
    }]);
  }
}

export async function syncFacilityDelete(id: number, name: string, companyId?: number | null): Promise<void> {
  const code = facilityCode(id);
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }

  const ops = [
    retry(async () => {
      if (client) {
        const { error } = await (client as any)
          .from("sport_center_services")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("code", code);
        if (error) throw new Error(error.message);
      } else {
        await db.execute(sql`UPDATE sport_center_services SET is_active = false, updated_at = NOW() WHERE code = ${code}`);
      }
      console.log(`${PREFIX} sport_center_services soft-delete OK → code=${code}`);
    }),
    retry(async () => {
      if (client) {
        const { error } = await (client as any)
          .from("sport_center_facilities")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("name", name);
        if (error) throw new Error(error.message);
      } else {
        await db.execute(sql`UPDATE sport_center_facilities SET is_active = false, updated_at = NOW() WHERE name = ${name}`);
      }
      console.log(`${PREFIX} sport_center_facilities soft-delete OK → name="${name}"`);
    }),
  ];

  const results = await Promise.allSettled(ops);
  const hasError = results.some(r => r.status === "rejected");
  const errorMessages: string[] = [];
  for (const r of results) {
    if (r.status === "rejected") {
      const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
      console.error(`${PREFIX} facility delete sync gagal:`, r.reason);
      errorMessages.push(msg);
    }
  }
  void writeSyncLog({
    entity: "facility", action: "delete", entityId: id,
    status: hasError ? "error" : "ok",
    detail: hasError ? errorMessages[0] ?? "delete failure" : undefined,
    companyId,
  });
  if (hasError) {
    void notifySyncError([{
      entity: "facility",
      entityId: id,
      entityName: name,
      action: "delete",
      error: errorMessages.join("; "),
    }]);
  }
}

// Cache facility name → id di Supabase agar tidak perlu fetch tiap booking
let _facilityIdCache: Map<string, number> | null = null;
let _facilityIdCacheExpiry = 0;

async function getFacilityIdMap(client: import("@supabase/supabase-js").SupabaseClient | null): Promise<Map<string, number>> {
  const now = Date.now();
  if (_facilityIdCache && now < _facilityIdCacheExpiry) return _facilityIdCache;
  const map = new Map<string, number>();
  try {
    if (client) {
      const { data } = await (client as any)
        .from("sport_center_facilities")
        .select("id, name")
        .limit(200);
      for (const r of (data ?? [])) {
        map.set((r.name as string).trim().toLowerCase(), r.id as number);
      }
    } else {
      // fallback: lookup dari local DB
      const res = await db.execute(sql`SELECT id, name FROM sport_facilities ORDER BY id`);
      for (const r of res.rows as { id: number; name: string }[]) {
        map.set(r.name.trim().toLowerCase(), r.id);
      }
    }
  } catch { /* biarkan map kosong jika gagal */ }
  _facilityIdCache = map;
  _facilityIdCacheExpiry = now + 5 * 60 * 1000; // cache 5 menit
  return map;
}

export async function syncBookingUpsert(row: BookingRow): Promise<void> {
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }

  const facilityMap = await getFacilityIdMap(client);
  const facilityId = facilityMap.get((row.facility_name ?? "").trim().toLowerCase()) ?? null;

  const payload: Record<string, unknown> = {
    booking_code: row.booking_number,
    customer_name: row.customer_name,
    customer_email: row.customer_email ?? "",   // Supabase column is NOT NULL; use empty string as fallback
    customer_phone: row.customer_phone ?? null,
    facility_name: row.facility_name,
    date: row.booking_date,
    start_time: row.start_time,
    end_time: row.end_time,
    total_hours: Number(row.duration_hours ?? 1),
    total_price: Number(row.total_amount ?? 0),
    status: row.status,
    payment_status: row.payment_status ?? "unpaid",
    notes: row.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (facilityId !== null) payload.facility_id = facilityId;

  try {
    await retry(async () => {
      if (client) {
        const { error } = await (client as any)
          .from("sport_center_bookings")
          .upsert(payload, { onConflict: "booking_code" });
        if (error) throw new Error(error.message);
      } else {
        await db.execute(sql`
          INSERT INTO sport_center_bookings
            (booking_code, customer_name, customer_email, customer_phone, facility_name, date, start_time, end_time, total_hours, total_price, status, payment_status, notes, updated_at)
          VALUES
            (${payload.booking_code}, ${payload.customer_name}, ${payload.customer_email}, ${payload.customer_phone}, ${payload.facility_name}, ${payload.date}::date, ${payload.start_time}::time, ${payload.end_time}::time, ${payload.total_hours}, ${payload.total_price}, ${payload.status}, ${payload.payment_status}, ${payload.notes}, NOW())
          ON CONFLICT (booking_code) DO UPDATE SET
            customer_name  = EXCLUDED.customer_name,
            customer_email = EXCLUDED.customer_email,
            customer_phone = EXCLUDED.customer_phone,
            facility_name  = EXCLUDED.facility_name,
            date           = EXCLUDED.date,
            start_time     = EXCLUDED.start_time,
            end_time       = EXCLUDED.end_time,
            total_hours    = EXCLUDED.total_hours,
            total_price    = EXCLUDED.total_price,
            status         = EXCLUDED.status,
            payment_status = EXCLUDED.payment_status,
            notes          = EXCLUDED.notes,
            updated_at     = NOW()
        `);
      }
      console.log(`${PREFIX} sport_center_bookings upsert OK → booking_code=${row.booking_number} status=${row.status}`);
    });
    void writeSyncLog({ entity: "booking", action: "upsert", entityId: row.id, status: "ok", companyId: row.company_id });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.error(`${PREFIX} booking upsert gagal:`, err);
    void writeSyncLog({ entity: "booking", action: "upsert", entityId: row.id, status: "error", detail: errMsg, companyId: row.company_id });
    void notifySyncError([{
      entity: "booking",
      entityId: row.id,
      entityName: `${row.booking_number} — ${row.customer_name} (${row.facility_name})`,
      action: "upsert",
      error: errMsg,
    }]);
  }
}

export async function syncAllFacilities(): Promise<{ synced: number; errors: number; total: number }> {
  const result = await db.execute(sql`SELECT * FROM sport_facilities ORDER BY id ASC`);
  const rows = result.rows as FacilityRow[];
  let synced = 0;
  let errors = 0;
  const failedEntries: import("./sportSyncNotifier.js").SyncErrorEntry[] = [];

  for (const row of rows) {
    const ops = [syncToServicesViaClient(row), syncToFacilitiesViaClient(row)];
    const results = await Promise.allSettled(ops);
    const rowHasError = results.some(r => r.status === "rejected");
    const rowErrors = results
      .filter((r): r is PromiseRejectedResult => r.status === "rejected")
      .map(r => r.reason instanceof Error ? r.reason.message : String(r.reason));

    if (rowHasError) {
      errors++;
      failedEntries.push({
        entity: "facility",
        entityId: row.id,
        entityName: row.name,
        action: "resync",
        error: rowErrors.join("; "),
      });
      void writeSyncLog({
        entity: "facility", action: "upsert", entityId: row.id,
        status: "error", detail: rowErrors[0] ?? "sync failure", companyId: row.company_id,
      });
    } else {
      synced++;
    }
  }

  console.log(`${PREFIX} full facility sync: ${synced} OK, ${errors} gagal dari ${rows.length} total`);
  void writeSyncLog({
    entity: "facility", action: "resync", entityId: null,
    status: errors === 0 ? "ok" : "error",
    detail: `${synced}/${rows.length} OK${errors > 0 ? ` — ${errors} gagal` : ""}`,
  });

  // Kirim satu notifikasi WA untuk semua kegagalan (aggregate, dedup via Fonnte)
  if (failedEntries.length > 0) {
    void notifySyncError(failedEntries);
  }

  return { synced, errors, total: rows.length };
}

export async function syncAllBookings(): Promise<{ synced: number; errors: number; total: number }> {
  const result = await db.execute(sql`SELECT * FROM sport_bookings ORDER BY id ASC`);
  const rows = result.rows as BookingRow[];
  let synced = 0;
  let errors = 0;
  const failedEntries: import("./sportSyncNotifier.js").SyncErrorEntry[] = [];

  // ambil client dan facility map sekali di luar loop
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }
  const facilityMap = await getFacilityIdMap(client);

  for (const row of rows) {
    const facilityId = facilityMap.get((row.facility_name ?? "").trim().toLowerCase()) ?? null;

    const payload: Record<string, unknown> = {
      booking_code: row.booking_number,
      customer_name: row.customer_name,
      customer_email: row.customer_email ?? "",   // Supabase column is NOT NULL; use empty string as fallback
      customer_phone: row.customer_phone ?? null,
      facility_name: row.facility_name,
      date: row.booking_date,
      start_time: row.start_time,
      end_time: row.end_time,
      total_hours: Number(row.duration_hours ?? 1),
      total_price: Number(row.total_amount ?? 0),
      status: row.status,
      payment_status: row.payment_status ?? "unpaid",
      notes: row.notes ?? null,
      updated_at: new Date().toISOString(),
    };
    if (facilityId !== null) payload.facility_id = facilityId;

    try {
      await retry(async () => {
        if (client) {
          const { error } = await (client as any)
            .from("sport_center_bookings")
            .upsert(payload, { onConflict: "booking_code" });
          if (error) throw new Error(error.message);
        } else {
          await db.execute(sql`
            INSERT INTO sport_center_bookings
              (booking_code, customer_name, customer_email, customer_phone, facility_name, date, start_time, end_time, total_hours, total_price, status, payment_status, notes, updated_at)
            VALUES
              (${payload.booking_code}, ${payload.customer_name}, ${payload.customer_email}, ${payload.customer_phone}, ${payload.facility_name}, ${payload.date}::date, ${payload.start_time}::time, ${payload.end_time}::time, ${payload.total_hours}, ${payload.total_price}, ${payload.status}, ${payload.payment_status}, ${payload.notes}, NOW())
            ON CONFLICT (booking_code) DO UPDATE SET
              customer_name  = EXCLUDED.customer_name,
              customer_email = EXCLUDED.customer_email,
              facility_name  = EXCLUDED.facility_name,
              status         = EXCLUDED.status,
              payment_status = EXCLUDED.payment_status,
              updated_at     = NOW()
          `);
        }
      });
      void writeSyncLog({ entity: "booking", action: "upsert", entityId: row.id, status: "ok", companyId: row.company_id });
      synced++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      console.error(`${PREFIX} bulk booking upsert gagal id=${row.id}:`, err);
      void writeSyncLog({ entity: "booking", action: "upsert", entityId: row.id, status: "error", detail: errMsg, companyId: row.company_id });
      errors++;
      failedEntries.push({
        entity: "booking",
        entityId: row.id,
        entityName: `${row.booking_number} — ${row.customer_name} (${row.facility_name})`,
        action: "resync",
        error: errMsg,
      });
    }
  }

  console.log(`${PREFIX} full booking sync: ${synced} OK, ${errors} gagal dari ${rows.length} total`);
  void writeSyncLog({
    entity: "booking", action: "resync", entityId: null,
    status: errors === 0 ? "ok" : "error",
    detail: `${synced}/${rows.length} OK${errors > 0 ? ` — ${errors} gagal` : ""}`,
  });

  if (failedEntries.length > 0) {
    void notifySyncError(failedEntries);
  }

  return { synced, errors, total: rows.length };
}

export async function getLastSyncLogs(limit = 20): Promise<unknown[]> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM sport_sync_logs ORDER BY created_at DESC LIMIT ${limit}
    `);
    return result.rows;
  } catch {
    return [];
  }
}

export async function pullLegacyBookingsFromSupabase(): Promise<{ pulled: number; errors: number; total: number }> {
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }

  if (!client) {
    console.warn(`${PREFIX} pullLegacyBookings: Sport Center Supabase client tidak tersedia, skip`);
    return { pulled: 0, errors: 0, total: 0 };
  }

  // Query sport_center schema (bukan public)
  const { data, error } = await (client as any)
    .schema("sport_center")
    .from("bookings")
    .select("order_number, customer_name, customer_phone, customer_email, facility_id, booking_date, start_time, end_time, duration_hours, total_price, status, payment_status, notes, created_at")
    .order("created_at", { ascending: true });

  if (error) {
    console.error(`${PREFIX} pullLegacyBookings: fetch gagal`, error.message);
    return { pulled: 0, errors: 1, total: 0 };
  }

  const rows = (data ?? []) as Array<{
    order_number: string | null;
    customer_name: string;
    customer_phone?: string | null;
    customer_email?: string | null;
    facility_id?: number | null;
    booking_date: string;
    start_time: string;
    end_time: string;
    duration_hours?: number | null;
    total_price?: number | null;
    status?: string | null;
    payment_status?: string | null;
    notes?: string | null;
    created_at?: string | null;
  }>;

  // Lookup facility names from sport_facilities
  let facilityMap: Record<number, string> = {};
  try {
    const facRes = await (client as any).schema("sport_center").from("facilities").select("id, name");
    if (facRes.data) {
      for (const f of facRes.data) facilityMap[f.id] = f.name;
    }
  } catch { }

  let pulled = 0;
  let errors = 0;

  for (const row of rows) {
    const bookingNumber = row.order_number ?? `LEGACY-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const facilityName = (row.facility_id ? facilityMap[row.facility_id] : null) ?? "Unknown";
    const bookingDate = row.booking_date;
    const startTime = row.start_time?.slice(0, 5) ?? "00:00";
    const endTime = row.end_time?.slice(0, 5) ?? "01:00";
    const durationHours = Number(row.duration_hours ?? 1);
    const totalAmount = Number(row.total_price ?? 0);
    const rawStatus = row.status ?? "pending";
    const mappedStatus = rawStatus === "confirmed" ? "confirmed" : rawStatus === "cancelled" ? "cancelled" : rawStatus === "completed" ? "completed" : "pending";
    const paymentStatus = row.payment_status ?? "unpaid";

    try {
      const existing = await db.execute(sql`SELECT id FROM sport_bookings WHERE booking_number = ${bookingNumber} LIMIT 1`);
      if (existing.rows.length > 0) {
        await db.execute(sql`
          UPDATE sport_bookings SET
            customer_name   = ${row.customer_name},
            customer_phone  = ${row.customer_phone ?? null},
            facility_name   = ${facilityName},
            booking_date    = ${bookingDate}::DATE,
            start_time      = ${startTime}::TIME,
            end_time        = ${endTime}::TIME,
            duration_hours  = ${durationHours},
            base_amount     = ${totalAmount},
            total_amount    = ${totalAmount},
            status          = ${mappedStatus},
            payment_status  = ${paymentStatus},
            notes           = ${row.notes ?? null},
            updated_at      = NOW()
          WHERE booking_number = ${bookingNumber}
        `);
      } else {
        await db.execute(sql`
          INSERT INTO sport_bookings
            (company_id, booking_number, customer_name, customer_phone,
             facility_name, booking_date, start_time, end_time,
             duration_hours, base_amount, total_amount,
             status, payment_status, notes, created_at, updated_at)
          VALUES
            (1, ${bookingNumber}, ${row.customer_name}, ${row.customer_phone ?? null},
             ${facilityName}, ${bookingDate}::DATE, ${startTime}::TIME, ${endTime}::TIME,
             ${durationHours}, ${totalAmount}, ${totalAmount},
             ${mappedStatus}, ${paymentStatus}, ${row.notes ?? null},
             ${row.created_at ?? new Date().toISOString()}::TIMESTAMPTZ, NOW())
        `);
      }
      console.log(`${PREFIX} pull legacy booking OK → ${bookingNumber} (${row.customer_name} / ${facilityName})`);
      pulled++;
    } catch (err) {
      console.error(`${PREFIX} pull legacy booking gagal → ${bookingNumber}:`, err);
      errors++;
    }
  }

  console.log(`${PREFIX} pullLegacyBookings selesai: ${pulled} pulled, ${errors} errors dari ${rows.length} total`);
  return { pulled, errors, total: rows.length };
}

export async function pullFacilitiesFromSupabase(): Promise<{ pulled: number; skipped: number; errors: number; total: number }> {
  let client: import("@supabase/supabase-js").SupabaseClient | null = null;
  try {
    const { getSportCenterSupabaseClient } = await import("../../lib/supabaseAdminSportCenter.js");
    client = getSportCenterSupabaseClient() as unknown as import("@supabase/supabase-js").SupabaseClient;
  } catch { }

  if (!client) {
    console.warn(`${PREFIX} pullFacilities: Sport Center Supabase client tidak tersedia, skip`);
    return { pulled: 0, skipped: 0, errors: 0, total: 0 };
  }

  const { data, error } = await (client as any)
    .schema("sport_center")
    .from("facilities")
    .select("id, name, category, description, price_per_hour");

  if (error) {
    console.error(`${PREFIX} pullFacilities: fetch gagal`, error.message);
    return { pulled: 0, skipped: 0, errors: 1, total: 0 };
  }

  const rows = (data ?? []) as Array<{
    id: number;
    name: string;
    category?: string | null;
    description?: string | null;
    price_per_hour?: number | null;
  }>;

  let pulled = 0;
  let skipped = 0;
  let errors = 0;

  for (const f of rows) {
    try {
      const existing = await db.execute(sql`SELECT id FROM sport_facilities WHERE name = ${f.name} LIMIT 1`);
      if (existing.rows.length > 0) {
        // Update jika price atau category berubah
        await db.execute(sql`
          UPDATE sport_facilities SET
            type           = ${f.category ?? "court"},
            description    = COALESCE(${f.description ?? null}, description),
            price_per_hour = ${Number(f.price_per_hour ?? 0)},
            updated_at     = NOW()
          WHERE name = ${f.name}
        `);
        skipped++;
      } else {
        await db.execute(sql`
          INSERT INTO sport_facilities
            (company_id, name, type, description, price_per_hour, capacity, is_active, sort_order)
          VALUES
            (1, ${f.name}, ${f.category ?? "court"}, ${f.description ?? null},
             ${Number(f.price_per_hour ?? 0)}, 1, TRUE, 0)
        `);
        pulled++;
      }
      console.log(`${PREFIX} pullFacilities OK → "${f.name}"`);
    } catch (err) {
      console.error(`${PREFIX} pullFacilities gagal → "${f.name}":`, err);
      errors++;
    }
  }

  void writeSyncLog({
    entity: "facility", action: "resync", entityId: null,
    status: errors === 0 ? "ok" : "error",
    detail: `pull: ${pulled} new, ${skipped} updated, ${errors} errors dari ${rows.length} total`,
  });

  console.log(`${PREFIX} pullFacilities selesai: ${pulled} new, ${skipped} updated, ${errors} errors dari ${rows.length} total`);
  return { pulled, skipped, errors, total: rows.length };
}
