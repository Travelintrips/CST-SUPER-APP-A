import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabaseClient";
import {
  CalendarDays, Users, DollarSign, Clock, TrendingUp,
  Activity, AlertCircle, Building2, Wifi, WifiOff,
} from "lucide-react";
import { fetchSportCenterData, type SportCenterSupabaseData } from "@/lib/sportCenterSupabase";
import { supabase } from "@/lib/supabaseClient";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | undefined | null) => {
  if (!d) return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
  } catch {
    return d;
  }
const fmtDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Menunggu Bayar",
  confirmed: "Konfirmasi",
  checked_in: "Check-In",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-900/40 text-yellow-300 border-yellow-600",
  pending_payment: "bg-orange-900/40 text-orange-300 border-orange-600",
  confirmed: "bg-blue-900/40 text-blue-300 border-blue-600",
  checked_in: "bg-purple-900/40 text-purple-300 border-purple-600",
  completed: "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  cancelled: "bg-red-900/40 text-red-300 border-red-600",
};

interface LocalDashboardData {
  totalBookings: number; todayBookings: number; pendingPayment: number;
  totalRevenue: number; monthRevenue: number; totalMembers: number;
interface Booking {
  id: number;
  booking_code: string;
  facility_name: string;
  customer_name: string;
  date: string;
  status: string;
  total_price: number;
  created_at: string;
}

interface DashboardData {
  totalBookings: number;
  todayBookings: number;
  pendingPayment: number;
  totalRevenue: number;
  monthRevenue: number;
  totalCustomers: number;
  byStatus: { status: string; count: string }[];
  topFacilities: { facility_name: string; bookings: string; revenue: string }[];
  recentBookings: Booking[];
}

async function fetchSportCenterData(): Promise<DashboardData> {
  if (!supabase) throw new Error("Supabase belum dikonfigurasi");

  const { data: bookings, error } = await supabase
    .from("sport_center_bookings")
    .select("id, booking_code, facility_name, customer_name, date, status, total_price, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[SportCenter] Gagal fetch bookings:", error.message);
    throw error;
  }

  const rows: Booking[] = bookings ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const totalBookings = rows.length;
  const todayBookings = rows.filter((b) => b.date === today).length;
  const pendingPayment = rows.filter((b) =>
    ["pending", "pending_payment"].includes(b.status),
  ).length;
  const totalRevenue = rows.reduce((sum, b) => sum + (b.total_price ?? 0), 0);
  const monthRevenue = rows
    .filter((b) => new Date(b.date) >= monthStart)
    .reduce((sum, b) => sum + (b.total_price ?? 0), 0);
  const totalCustomers = new Set(rows.map((b) => b.customer_name?.trim().toLowerCase()).filter(Boolean)).size;

  const statusMap: Record<string, number> = {};
  for (const b of rows) {
    statusMap[b.status] = (statusMap[b.status] ?? 0) + 1;
  }
  const byStatus = Object.entries(statusMap)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({ status, count: String(count) }));

  const facilityMap: Record<string, { count: number; revenue: number }> = {};
  for (const b of rows) {
    if (!b.facility_name) continue;
    if (!facilityMap[b.facility_name]) facilityMap[b.facility_name] = { count: 0, revenue: 0 };
    facilityMap[b.facility_name].count += 1;
    facilityMap[b.facility_name].revenue += b.total_price ?? 0;
  }
  const topFacilities = Object.entries(facilityMap)
    .sort((a, b) => b[1].revenue - a[1].revenue)
    .slice(0, 5)
    .map(([facility_name, { count, revenue }]) => ({
      facility_name,
      bookings: String(count),
      revenue: String(revenue),
    }));

  const recentBookings = rows.slice(0, 5);

  console.log("[SportCenter] fetchSportCenterData: success", {
    totalBookings,
    totalRevenue,
    byStatus,
    topFacilities: topFacilities.length,
  });

  return {
    totalBookings,
    todayBookings,
    pendingPayment,
    totalRevenue,
    monthRevenue,
    totalCustomers,
    byStatus,
    topFacilities,
    recentBookings,
  };
}

export default function SportCenterDashboard() {
  const qc = useQueryClient();
  const [realtimeCount, setRealtimeCount] = useState(0);
  const [supabaseConnected, setSupabaseConnected] = useState(false);

  // ── Query 1: data dari API server (PostgreSQL lokal) ──────────────────────
  const { data: localData, isLoading: localLoading } = useQuery<LocalDashboardData>({
    queryKey: ["sport-center-dashboard", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/sport-center/dashboard${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat dashboard");
      return r.json() as Promise<LocalDashboardData>;
    },
  const channelRef = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);

  const { data, isLoading, isError } = useQuery<DashboardData>({
    queryKey: ["sport-center-dashboard-supabase"],
    queryFn: fetchSportCenterData,
    refetchInterval: 60_000,
    retry: 2,
  });

  // ── Query 2: fetchSportCenterData() dari Supabase ─────────────────────────
  const { data: supaData, isLoading: supaLoading, isError: supaError } = useQuery<SportCenterSupabaseData>({
    queryKey: ["sport-center-supabase"],
    queryFn: fetchSportCenterData,
    refetchInterval: 60_000,
    retry: 2,
  });

  // ── Realtime: SSE dari API server ─────────────────────────────────────────
  useEffect(() => {
    const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
    const es = new EventSource(`/api/sport-center/events${qs}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data) as { type?: string; entity?: string };
        if (ev.type === "connected") return;
        if (["booking", "payment", "dashboard"].includes(ev.entity ?? "")) {
          qc.invalidateQueries({ queryKey: ["sport-center-dashboard"] });
          qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
          setRealtimeCount((c) => c + 1);
        }
      } catch { /* ignore */ }
    if (!supabase) return;

    const ch = supabase
      .channel("sport-center-bookings-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sport_center_bookings" },
        (payload) => {
          console.log("[SportCenter] Realtime update:", payload.eventType);
          qc.invalidateQueries({ queryKey: ["sport-center-dashboard-supabase"] });
          setRealtimeCount((c) => c + 1);
        },
      )
      .subscribe((status) => {
        console.log("[SportCenter] Realtime channel:", status);
      });

    channelRef.current = ch;
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  // ── Realtime: Supabase Realtime subscription ──────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("sport-center-changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sport_center_bookings" },
        () => {
          qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
          setRealtimeCount((c) => c + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sport_center_facilities" },
        () => {
          qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
          setRealtimeCount((c) => c + 1);
        },
      )
      .subscribe((status) => {
        setSupabaseConnected(status === "SUBSCRIBED");
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc]);

  // ── Merge data: Supabase jadi sumber utama, lokal sebagai fallback ─────────
  const hasSupaData = (supaData?.totalBookings ?? 0) > 0 ||
    (supaData?.recentBookings?.length ?? 0) > 0 ||
    (supaData?.topFacilities?.length ?? 0) > 0;

  const totalBookings  = hasSupaData ? (supaData?.totalBookings ?? localData?.totalBookings ?? 0) : (localData?.totalBookings ?? 0);
  const totalRevenue   = hasSupaData ? (supaData?.totalRevenue  ?? localData?.totalRevenue  ?? 0) : (localData?.totalRevenue ?? 0);
  const totalMembers   = hasSupaData ? (supaData?.totalMembers  ?? localData?.totalMembers  ?? 0) : (localData?.totalMembers ?? 0);
  const todayBookings  = localData?.todayBookings ?? 0;
  const pendingPayment = localData?.pendingPayment ?? 0;
  const monthRevenue   = localData?.monthRevenue ?? 0;

  const byStatus      = hasSupaData ? (supaData?.byStatus      ?? []) : (localData?.byStatus ?? []);
  const topFacilities = hasSupaData ? (supaData?.topFacilities ?? []) : (localData?.topFacilities ?? []);
  const recentBookings = hasSupaData ? (supaData?.recentBookings ?? []) : (localData?.recentBookings ?? []);

  const isLoading = localLoading && supaLoading;

  const stats = [
    { title: "Total Booking",     value: totalBookings,           icon: CalendarDays, color: "text-blue-400",   bg: "bg-blue-900/20",   sub: "Semua waktu" },
    { title: "Booking Hari Ini",  value: todayBookings,           icon: Clock,        color: "text-purple-400", bg: "bg-purple-900/20", sub: "Aktif hari ini" },
    { title: "Belum Bayar",       value: pendingPayment,          icon: AlertCircle,  color: "text-yellow-400", bg: "bg-yellow-900/20", sub: "Perlu konfirmasi" },
    { title: "Member Aktif",      value: totalMembers,            icon: Users,        color: "text-emerald-400",bg: "bg-emerald-900/20",sub: "Gym & AP" },
    { title: "Revenue Bulan Ini", value: idr(monthRevenue),       icon: TrendingUp,   color: "text-green-400",  bg: "bg-green-900/20",  sub: "Bulan berjalan" },
    { title: "Total Revenue",     value: idr(totalRevenue),       icon: DollarSign,   color: "text-cyan-400",   bg: "bg-cyan-900/20",   sub: "Sepanjang waktu" },
    {
      title: "Total Booking",
      value: data?.totalBookings ?? 0,
      icon: CalendarDays,
      color: "text-blue-400",
      bg: "bg-blue-900/20",
      sub: "Semua waktu",
    },
    {
      title: "Booking Hari Ini",
      value: data?.todayBookings ?? 0,
      icon: Clock,
      color: "text-purple-400",
      bg: "bg-purple-900/20",
      sub: "Aktif hari ini",
    },
    {
      title: "Belum Bayar",
      value: data?.pendingPayment ?? 0,
      icon: AlertCircle,
      color: "text-yellow-400",
      bg: "bg-yellow-900/20",
      sub: "Perlu konfirmasi",
    },
    {
      title: "Pelanggan Unik",
      value: data?.totalCustomers ?? 0,
      icon: Users,
      color: "text-emerald-400",
      bg: "bg-emerald-900/20",
      sub: "Dari data booking",
    },
    {
      title: "Revenue Bulan Ini",
      value: idr(data?.monthRevenue ?? 0),
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-900/20",
      sub: "Bulan berjalan",
    },
    {
      title: "Total Revenue",
      value: idr(data?.totalRevenue ?? 0),
      icon: DollarSign,
      color: "text-cyan-400",
      bg: "bg-cyan-900/20",
      sub: "Sepanjang waktu",
    },
  ];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Sport Center Dashboard</h1>
              <p className="text-sm text-muted-foreground">Overview aktivitas & performa</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {supabaseConnected ? (
              <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
                <Wifi className="h-3 w-3" /> Realtime aktif
              </Badge>
            ) : supaError ? (
              <Badge className="bg-red-900/40 text-red-300 border-red-600 text-xs gap-1">
                <WifiOff className="h-3 w-3" /> Supabase offline
              </Badge>
            ) : null}
            {realtimeCount > 0 && (
              <Badge className="bg-blue-900/40 text-blue-300 border-blue-600 text-xs gap-1">
                <Activity className="h-3 w-3" /> {realtimeCount} update
              </Badge>
            )}
          </div>
          {realtimeCount > 0 && (
            <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
              <Activity className="h-3 w-3" /> Realtime aktif ({realtimeCount})
            </Badge>
          )}
        </div>

        {/* Sumber data indicator */}
        {!isLoading && (
          <p className="text-xs text-muted-foreground">
            Sumber data:{" "}
            {hasSupaData
              ? <span className="text-emerald-400 font-medium">✓ Supabase ({supaData?.totalBookings ?? 0} booking)</span>
              : <span className="text-slate-400">PostgreSQL lokal</span>
            }
            {supaError && !hasSupaData && (
              <span className="text-yellow-400 ml-2">— Belum ada data di Supabase</span>
            )}
          </p>
        )}

        {/* Stats Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-5 h-24" />
              </Card>
            ))}
          </div>
        ) : isError ? (
          <Card className="border-red-800/40 bg-red-900/10">
            <CardContent className="p-5 text-center text-red-400 text-sm">
              Gagal memuat data dari Supabase. Periksa koneksi atau RLS policy.
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {stats.map((s) => (
              <Card key={s.title} className="border-border/60">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{s.title}</p>
                      <p className="text-2xl font-bold text-foreground">{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
                    </div>
                    <div className={`p-2 rounded-lg ${s.bg}`}>
                      <s.icon className={`h-5 w-5 ${s.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Status & Fasilitas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Booking per Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {byStatus.map((s) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <Badge className={`text-xs border ${STATUS_COLOR[s.status] ?? "bg-muted/30 text-muted-foreground border-muted"}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{s.count}</span>
                  </div>
                ))}
                {byStatus.length === 0 && (
                {(data?.byStatus ?? []).length === 0 && !isLoading && (
                  <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <TrendingUp className="h-4 w-4" /> Top Fasilitas
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {topFacilities.map((f, i) => (
                  <div key={f.facility_name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.facility_name}</p>
                      <p className="text-xs text-muted-foreground">{f.bookings} booking</p>
                    </div>
                    <span className="text-sm font-medium text-emerald-400">{idr(Number(f.revenue))}</span>
                  </div>
                ))}
                {topFacilities.length === 0 && (
                {(data?.topFacilities ?? []).length === 0 && !isLoading && (
                  <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Booking Terbaru */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Booking Terbaru
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    {["No. Booking", "Pelanggan", "Fasilitas", "Tanggal", "Status", "Total"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">{h}</th>
                      <th key={h} className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b) => (
                    <tr key={String(b.id)} className="border-b border-border/20 hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                        {String(b.booking_number ?? b.id ?? "-")}
                      </td>
                      <td className="py-2 px-3 text-foreground">{String(b.customer_name ?? "-")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(b.facility_name ?? "-")}</td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {fmtDate(String(b.booking_date ?? ""))}
                      </td>
                      <td className="py-2 px-3">
                        <Badge className={`text-xs border ${STATUS_COLOR[String(b.status ?? "")] ?? "bg-muted text-muted-foreground"}`}>
                          {STATUS_LABEL[String(b.status ?? "")] ?? String(b.status ?? "-")}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-foreground">
                        {idr(Number(b.total_amount ?? b.total ?? 0))}
                      </td>
                    </tr>
                  ))}
                  {recentBookings.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Belum ada data</td>
                  {(data?.recentBookings ?? []).map((b) => (
                    <tr key={b.id} className="border-b border-border/20 hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{b.booking_code}</td>
                      <td className="py-2 px-3 text-foreground">{b.customer_name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{b.facility_name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{fmtDate(b.date)}</td>
                      <td className="py-2 px-3">
                        <Badge className={`text-xs border ${STATUS_COLOR[b.status] ?? "bg-muted/30 text-muted-foreground border-muted"}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-foreground">{idr(b.total_price)}</td>
                    </tr>
                  ))}
                  {(data?.recentBookings ?? []).length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">
                        Belum ada booking
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
