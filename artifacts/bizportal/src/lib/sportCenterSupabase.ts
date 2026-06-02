/**
 * fetchSportCenterData — ambil data dari Supabase untuk Sport Center Dashboard.
 * Tabel: sport_center_bookings, sport_center_facilities, sport_center_customers
 */
import { supabase } from "./supabaseClient";

export interface SupabaseBooking {
  id: number;
  customer_name: string;
  facility_name: string;
  booking_date: string;
  status: string;
  total: number;
}

export interface SupabaseFacility {
  id: number;
  name: string;
  usage_count: number;
  revenue_total: number;
}

export interface SupabaseCustomer {
  id: number;
  name: string;
  membership_status: string | null;
}

export interface SportCenterSupabaseData {
  byStatus: { status: string; count: string }[];
  topFacilities: { facility_name: string; bookings: string; revenue: string }[];
  recentBookings: Record<string, unknown>[];
  totalBookings: number;
  totalRevenue: number;
  totalMembers: number;
}

export async function fetchSportCenterData(): Promise<SportCenterSupabaseData> {
  if (!supabase) {
    console.warn("[sportCenterSupabase] Supabase tidak dikonfigurasi");
    return emptyResult();
  }

  const [bookingsRes, facilitiesRes, customersRes] = await Promise.all([
    supabase
      .from("sport_center_bookings")
      .select("id, customer_name, facility_name, booking_date, status, total")
      .order("id", { ascending: false }),
    supabase
      .from("sport_center_facilities")
      .select("id, name, usage_count, revenue_total")
      .order("usage_count", { ascending: false }),
    supabase
      .from("sport_center_customers")
      .select("id, name, membership_status"),
  ]);

  if (bookingsRes.error) {
    console.error("[sportCenterSupabase] bookings error:", bookingsRes.error.message);
  }
  if (facilitiesRes.error) {
    console.error("[sportCenterSupabase] facilities error:", facilitiesRes.error.message);
  }
  if (customersRes.error) {
    console.error("[sportCenterSupabase] customers error:", customersRes.error.message);
  }

  const bookings: SupabaseBooking[] = (bookingsRes.data ?? []) as SupabaseBooking[];
  const facilities: SupabaseFacility[] = (facilitiesRes.data ?? []) as SupabaseFacility[];
  const customers: SupabaseCustomer[] = (customersRes.data ?? []) as SupabaseCustomer[];

  console.log(`[sportCenterSupabase] fetch sukses — bookings=${bookings.length}, facilities=${facilities.length}, customers=${customers.length}`);

  // Booking per Status
  const statusMap: Record<string, number> = {};
  for (const b of bookings) {
    const s = b.status ?? "unknown";
    statusMap[s] = (statusMap[s] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusMap)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count: String(count) }));

  // Top Fasilitas — dari sport_center_facilities (usage_count + revenue_total)
  const topFacilities = facilities.slice(0, 5).map((f) => ({
    facility_name: f.name,
    bookings: String(f.usage_count ?? 0),
    revenue: String(f.revenue_total ?? 0),
  }));

  // Booking Terbaru — 5 terbaru dari sport_center_bookings
  const recentBookings: Record<string, unknown>[] = bookings.slice(0, 5).map((b) => ({
    id: b.id,
    booking_number: `SCB-${b.id}`,
    customer_name: b.customer_name,
    facility_name: b.facility_name,
    booking_date: formatDate(b.booking_date),
    status: b.status,
    total_amount: Number(b.total ?? 0),
  }));

  // Totals
  const totalBookings = bookings.length;
  const totalRevenue = bookings.reduce((sum, b) => sum + Number(b.total ?? 0), 0);
  const totalMembers = customers.length;

  return { byStatus, topFacilities, recentBookings, totalBookings, totalRevenue, totalMembers };
}

function emptyResult(): SportCenterSupabaseData {
  return { byStatus: [], topFacilities: [], recentBookings: [], totalBookings: 0, totalRevenue: 0, totalMembers: 0 };
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(dateStr));
  } catch {
    return dateStr;
  }
}
