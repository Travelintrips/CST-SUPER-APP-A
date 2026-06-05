/**
 * fetchSportCenterData — ambil data dari Supabase untuk Sport Center Dashboard.
 *
 * Tabel Supabase:
 *   sport_center_bookings  — booking_code, customer_name, customer_phone, facility_name, date, status, payment_status, total_price, created_at
 *   sport_center_services  — id, name, category, price_per_hour, is_active
 *   sport_center_facilities — id, name, usage_count, revenue_total
 */
import { supabase } from "./supabaseClient";

export interface SupabaseBooking {
  booking_code: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  facility_name: string | null;
  date: string | null;
  status: string | null;
  payment_status: string | null;
  total_price: number | null;
  created_at: string | null;
}

export interface SupabaseService {
  id: number;
  name: string | null;
  category: string | null;
  price_per_hour: number | null;
  is_active: boolean | null;
}

export interface SupabaseFacility {
  id: number;
  name: string | null;
  usage_count: number | null;
  revenue_total: number | null;
}

export interface SportCenterSupabaseData {
  totalBookings: number;
  pendingPayment: number;
  uniqueCustomers: number;
  activeServices: number;
  totalRevenue: number;
  monthRevenue: number;
  byStatus: { status: string; count: string }[];
  topFacilities: { facility_name: string; bookings: string; revenue: string }[];
  recentBookings: Record<string, unknown>[];
}

export class SportCenterFetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SportCenterFetchError";
  }
}

export async function fetchSportCenterData(): Promise<SportCenterSupabaseData> {
  if (!supabase) {
    throw new SportCenterFetchError("Supabase tidak dikonfigurasi (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing)");
  }

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  // Fetch 3 tabel secara parallel
  const [bookingsRes, servicesRes, facilitiesRes] = await Promise.all([
    supabase
      .from("sport_center_bookings")
      .select("booking_code, customer_name, customer_phone, facility_name, date, status, payment_status, total_price, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("sport_center_services")
      .select("id, name, category, price_per_hour, is_active"),
    supabase
      .from("sport_center_facilities")
      .select("id, name, usage_count, revenue_total")
      .order("usage_count", { ascending: false }),
  ]);

  // Jika semua tabel gagal → lempar error agar isError terpicu
  const allFailed = bookingsRes.error && servicesRes.error && facilitiesRes.error;
  if (allFailed) {
    const errMsg = bookingsRes.error?.message ?? "Gagal memuat data dari Supabase";
    console.error("[sportCenterSupabase] semua fetch gagal:", errMsg);
    throw new SportCenterFetchError(`Gagal memuat data dari Supabase: ${errMsg}`);
  }

  // Log error per tabel jika ada
  if (bookingsRes.error)   console.error("[sportCenterSupabase] bookings error:", bookingsRes.error.message);
  if (servicesRes.error)   console.error("[sportCenterSupabase] services error:", servicesRes.error.message);
  if (facilitiesRes.error) console.error("[sportCenterSupabase] facilities error:", facilitiesRes.error.message);

  const bookings: SupabaseBooking[]    = (bookingsRes.data   ?? []) as SupabaseBooking[];
  const services: SupabaseService[]    = (servicesRes.data   ?? []) as SupabaseService[];
  const facilities: SupabaseFacility[] = (facilitiesRes.data ?? []) as SupabaseFacility[];

  // ── Metrics ────────────────────────────────────────────────────────────────
  const totalBookings = bookings.length;

  const pendingPayment = bookings.filter((b) =>
    ["pending", "pending_payment"].includes(b.status?.toLowerCase() ?? ""),
  ).length;

  // Pelanggan Unik — DISTINCT berdasarkan customer_phone (fallback ke customer_name)
  const uniqueCustomers = new Set(
    bookings.map((b) => b.customer_phone?.trim() ?? b.customer_name?.trim() ?? "").filter(Boolean),
  ).size;

  // Layanan Aktif — dari sport_center_services.is_active = true
  const activeServices = services.filter((s) => s.is_active === true).length;

  // Revenue
  const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total_price ?? 0), 0);
  const monthRevenue = bookings
    .filter((b) => b.date != null && b.date >= monthStart)
    .reduce((sum, b) => sum + Number(b.total_price ?? 0), 0);

  // ── Booking per Status ──────────────────────────────────────────────────────
  const statusMap: Record<string, number> = {};
  for (const b of bookings) {
    const s = b.status ?? "unknown";
    statusMap[s] = (statusMap[s] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusMap)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count: String(count) }));

  // ── Top Fasilitas ───────────────────────────────────────────────────────────
  let topFacilities: { facility_name: string; bookings: string; revenue: string }[];

  if (facilities.length > 0) {
    // sport_center_facilities punya usage_count & revenue_total langsung
    topFacilities = facilities.slice(0, 5).map((f) => ({
      facility_name: f.name ?? "-",
      bookings: String(f.usage_count ?? 0),
      revenue: String(f.revenue_total ?? 0),
    }));
  } else {
    // Fallback: aggregate dari bookings
    const fMap: Record<string, { count: number; revenue: number }> = {};
    for (const b of bookings) {
      const name = b.facility_name?.trim() ?? "Unknown";
      if (!fMap[name]) fMap[name] = { count: 0, revenue: 0 };
      fMap[name].count  += 1;
      fMap[name].revenue += Number(b.total_price ?? 0);
    }
    topFacilities = Object.entries(fMap)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, data]) => ({
        facility_name: name,
        bookings: String(data.count),
        revenue: String(data.revenue),
      }));
  }

  // ── Booking Terbaru — 5 terbaru ─────────────────────────────────────────────
  const recentBookings: Record<string, unknown>[] = bookings.slice(0, 20).map((b) => ({
    id: b.booking_code ?? "-",
    booking_number:  b.booking_code ?? "-",
    customer_name:   b.customer_name ?? "-",
    facility_name:   b.facility_name ?? "-",
    booking_date:    b.date ?? "-",
    status:          b.status ?? "-",
    payment_status:  b.payment_status ?? "unpaid",
    total_amount:    Number(b.total_price ?? 0),
  }));

  // ── Console log untuk verifikasi ───────────────────────────────────────────
  console.log("[sportCenterSupabase] ✅ Fetch sukses:", {
    totalBookings,
    totalRevenue,
    monthRevenue,
    pendingPayment,
    uniqueCustomers,
    activeServices,
    byStatus,
    topFacilitiesCount: topFacilities.length,
  });

  return {
    totalBookings,
    pendingPayment,
    uniqueCustomers,
    activeServices,
    totalRevenue,
    monthRevenue,
    byStatus,
    topFacilities,
    recentBookings,
  };
}

export function emptySupabaseData(): SportCenterSupabaseData {
  return {
    totalBookings: 0, pendingPayment: 0, uniqueCustomers: 0, activeServices: 0,
    totalRevenue: 0, monthRevenue: 0, byStatus: [], topFacilities: [], recentBookings: [],
  };
}
