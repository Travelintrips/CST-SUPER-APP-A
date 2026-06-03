import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useCompany } from "@/contexts/CompanyContext";
import {
  CalendarDays, Users, DollarSign, Clock, TrendingUp,
  Activity, AlertCircle, Building2, Wifi, WifiOff,
  Dumbbell, ShoppingBag, RefreshCw, CloudUpload, CheckCircle2,
  XCircle, Database, BookOpen, Flame, CheckCheck, BarChart2,
  ArrowDownRight, Zap, Filter,
} from "lucide-react";
import { fetchSportCenterData, type SportCenterSupabaseData } from "@/lib/sportCenterSupabase";
import { supabase } from "@/lib/supabaseClient";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { useSportCostCenter } from "@/hooks/useSportCostCenter";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtDate = (d: string | undefined | null): string => {
  if (!d || d === "-") return "-";
  try {
    return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(d));
  } catch {
    return d;
  }
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  pending_payment: "Menunggu Bayar",
  confirmed: "Konfirmasi",
  checked_in: "Check-In",
  completed: "Selesai",
  cancelled: "Dibatal",
};
const STATUS_COLOR: Record<string, string> = {
  pending:         "bg-yellow-900/40 text-yellow-300 border-yellow-600",
  pending_payment: "bg-orange-900/40 text-orange-300 border-orange-600",
  confirmed:       "bg-blue-900/40 text-blue-300 border-blue-600",
  checked_in:      "bg-purple-900/40 text-purple-300 border-purple-600",
  completed:       "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  cancelled:       "bg-red-900/40 text-red-300 border-red-600",
};

interface LocalDashboardData {
  totalBookings: number; todayBookings: number; pendingPayment: number;
  totalRevenue: number; monthRevenue: number; totalMembers: number;
  byStatus: { status: string; count: string }[];
  topFacilities: { facility_name: string; bookings: string; revenue: string }[];
  recentBookings: Record<string, unknown>[];
}

interface KpiLiveData {
  revenue_today: number;
  bookings_today: number;
  active_bookings_now: number;
  occupancy_today: number;
  occupied_hours_today: number;
  available_hours_today: number;
  checkins_today: number;
  members_active: number;
  refunds_today: number;
  net_profit_today: number;
}

interface HeatmapRow { hour: string; booking_count: number; }

export default function SportCenterDashboard() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const esRef = useRef<EventSource | null>(null);
  const [realtimeCount, setRealtimeCount] = useState(0);
  const [supabaseConnected, setSupabaseConnected] = useState(false);
  const { costCenters, selectedId: costCenterId, setSelectedId: setCostCenterId, selectedLabel: costCenterLabel } = useSportCostCenter();

  // ── Query 0: KPI Live realtime ────────────────────────────────────────────
  const { data: kpiLive, isLoading: kpiLoading } = useQuery<KpiLiveData>({
    queryKey: ["sport-center-kpi-live", activeCompanyId, costCenterId],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (costCenterId) qs.set("costCenterId", String(costCenterId));
      const r = await fetch(`/api/sport-center/kpi-live?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat KPI live");
      return r.json() as Promise<KpiLiveData>;
    },
    refetchInterval: 30_000,
  });

  // ── Query Heatmap: Jam Ramai ──────────────────────────────────────────────
  const { data: heatmapData } = useQuery<HeatmapRow[]>({
    queryKey: ["sport-center-heatmap", activeCompanyId, costCenterId],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (costCenterId) qs.set("costCenterId", String(costCenterId));
      const r = await fetch(`/api/sport-center/heatmap?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat heatmap");
      return r.json() as Promise<HeatmapRow[]>;
    },
    refetchInterval: 120_000,
  });

  // ── Query 1: PostgreSQL lokal via API server ───────────────────────────────
  const { data: localData, isLoading: localLoading } = useQuery<LocalDashboardData>({
    queryKey: ["sport-center-dashboard", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/sport-center/dashboard${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat dashboard lokal");
      return r.json() as Promise<LocalDashboardData>;
    },
    refetchInterval: 60_000,
  });

  // ── Query 2: Supabase langsung via fetchSportCenterData() ─────────────────
  const {
    data: supaData,
    isLoading: supaLoading,
    isError: supaError,
    error: supaErrorObj,
    refetch: refetchSupa,
  } = useQuery<SportCenterSupabaseData>({
    queryKey: ["sport-center-supabase"],
    queryFn: fetchSportCenterData,
    refetchInterval: 60_000,
    retry: 1,
  });

  // ── Realtime: SSE dari API server ─────────────────────────────────────────
  useEffect(() => {
    const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
    const es = new EventSource(`/api/sport-center/events${qs}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data as string) as { type?: string; entity?: string };
        if (ev.type === "connected") return;
        if (["booking", "payment", "refund", "dashboard"].includes(ev.entity ?? "")) {
          qc.invalidateQueries({ queryKey: ["sport-center-dashboard"] });
          qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
          qc.invalidateQueries({ queryKey: ["sport-center-kpi-live"] });
          qc.invalidateQueries({ queryKey: ["sport-center-heatmap"] });
          setRealtimeCount((c) => c + 1);
        }
      } catch { /* ignore */ }
    };
    return () => { es.close(); esRef.current = null; };
  }, [activeCompanyId, qc]);

  // ── Realtime: Supabase postgres_changes ──────────────────────────────────
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase
      .channel("sport-center-dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sport_center_bookings" }, () => {
        qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
        setRealtimeCount((c) => c + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sport_center_services" }, () => {
        qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
        setRealtimeCount((c) => c + 1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "sport_center_facilities" }, () => {
        qc.invalidateQueries({ queryKey: ["sport-center-supabase"] });
        setRealtimeCount((c) => c + 1);
      })
      .subscribe((status) => {
        setSupabaseConnected(status === "SUBSCRIBED");
      });
    return () => { void supabase.removeChannel(channel); };
  }, [qc]);

  // ── Merge: Supabase jadi sumber utama, lokal sebagai fallback ─────────────
  const hasSupaBookings = (supaData?.totalBookings ?? 0) > 0 || (supaData?.recentBookings?.length ?? 0) > 0;

  // Metrics utama
  const totalBookings   = supaData?.totalBookings   ?? localData?.totalBookings   ?? 0;
  const pendingPayment  = supaData?.pendingPayment  ?? localData?.pendingPayment  ?? 0;
  const uniqueCustomers = supaData?.uniqueCustomers ?? 0;
  const activeServices  = supaData?.activeServices  ?? 0;
  const totalRevenue    = supaData?.totalRevenue    ?? localData?.totalRevenue    ?? 0;
  const monthRevenue    = supaData?.monthRevenue    ?? localData?.monthRevenue    ?? 0;
  const todayBookings   = localData?.todayBookings  ?? 0;

  // Section data
  const byStatus       = hasSupaBookings ? (supaData?.byStatus       ?? []) : (localData?.byStatus       ?? []);
  const topFacilities  = hasSupaBookings ? (supaData?.topFacilities  ?? []) : (localData?.topFacilities  ?? []);
  const recentBookings = hasSupaBookings ? (supaData?.recentBookings ?? []) : (localData?.recentBookings ?? []);

  const isLoading = localLoading && supaLoading;

  // ── Query 3: Sync status dari API ─────────────────────────────────────────
  interface SyncLog {
    id: number; entity: string; action: string; entity_id: number | null;
    status: "ok" | "error"; detail: string | null; company_id: number | null;
    created_at: string;
  }
  interface SyncStatus {
    local: { facilities: number; bookings: number };
    last_facility_sync: { created_at: string; status: string; detail: string | null } | null;
    last_booking_sync:  { created_at: string; status: string; detail: string | null } | null;
    recent_logs: SyncLog[];
  }
  const {
    data: syncData,
    isLoading: syncLoading,
    refetch: refetchSync,
  } = useQuery<SyncStatus>({
    queryKey: ["sport-center-sync-status"],
    queryFn: async () => {
      const r = await fetch("/api/sport-center/sync/status?limit=30", { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat status sync");
      return r.json() as Promise<SyncStatus>;
    },
    refetchInterval: 30_000,
  });

  // ── Mutations: trigger resync manual ─────────────────────────────────────
  const resyncFacilities = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/sport-center/facilities/resync-all", {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Resync fasilitas gagal");
      return r.json();
    },
    onSuccess: () => { void refetchSync(); },
  });

  const resyncAll = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/sport-center/facilities/resync-all?include=bookings", {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Resync semua gagal");
      return r.json();
    },
    onSuccess: () => { void refetchSync(); void qc.invalidateQueries({ queryKey: ["sport-center-dashboard"] }); },
  });

  const resyncBookings = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/sport-center/sync/bookings", {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Resync booking gagal");
      return r.json();
    },
    onSuccess: () => { void refetchSync(); },
  });

  const fmtTs = (ts: string | null | undefined) => {
    if (!ts) return "-";
    try {
      return new Intl.DateTimeFormat("id-ID", {
        day: "2-digit", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(new Date(ts));
    } catch { return ts; }
  };

  const syncBusy = resyncFacilities.isPending || resyncAll.isPending || resyncBookings.isPending;

  const stats = [
    {
      title: "Total Booking",
      value: totalBookings,
      icon: CalendarDays,
      color: "text-blue-400",
      bg: "bg-blue-900/20",
      sub: `Dari Supabase${hasSupaBookings ? " ✓" : " (lokal)"}`,
    },
    {
      title: "Booking Hari Ini",
      value: todayBookings,
      icon: Clock,
      color: "text-purple-400",
      bg: "bg-purple-900/20",
      sub: "Dari PostgreSQL lokal",
    },
    {
      title: "Belum Bayar",
      value: pendingPayment,
      icon: AlertCircle,
      color: "text-yellow-400",
      bg: "bg-yellow-900/20",
      sub: "pending / pending_payment",
    },
    {
      title: "Pelanggan Unik",
      value: uniqueCustomers,
      icon: Users,
      color: "text-emerald-400",
      bg: "bg-emerald-900/20",
      sub: "DISTINCT customer_phone",
    },
    {
      title: "Layanan Aktif",
      value: activeServices,
      icon: Dumbbell,
      color: "text-pink-400",
      bg: "bg-pink-900/20",
      sub: "sport_center_services",
    },
    {
      title: "Revenue Bulan Ini",
      value: idr(monthRevenue),
      icon: TrendingUp,
      color: "text-green-400",
      bg: "bg-green-900/20",
      sub: "Bulan berjalan",
    },
    {
      title: "Total Revenue",
      value: idr(totalRevenue),
      icon: DollarSign,
      color: "text-cyan-400",
      bg: "bg-cyan-900/20",
      sub: "SUM(total_price)",
    },
    {
      title: "Booking per Status",
      value: byStatus.length,
      icon: ShoppingBag,
      color: "text-orange-400",
      bg: "bg-orange-900/20",
      sub: `${byStatus.length} status berbeda`,
    },
  ];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Sport Center Dashboard</h1>
              <p className="text-sm text-muted-foreground">Overview aktivitas & performa realtime</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Cost Center Filter */}
            <div className="flex items-center gap-1.5">
              <Filter className="h-3.5 w-3.5 text-gray-400" />
              <Select
                value={costCenterId != null ? String(costCenterId) : "__all__"}
                onValueChange={v => setCostCenterId(v === "__all__" ? null : Number(v))}
              >
                <SelectTrigger className="h-7 w-44 bg-gray-800 border-gray-700 text-gray-200 text-xs">
                  <SelectValue placeholder="Semua Cost Center" />
                </SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  <SelectItem value="__all__" className="text-xs text-gray-200">Semua Cost Center</SelectItem>
                  {costCenters.map(cc => (
                    <SelectItem key={cc.id} value={String(cc.id)} className="text-xs text-gray-200">
                      {cc.code} — {cc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {supabaseConnected ? (
              <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
                <Wifi className="h-3 w-3" /> Realtime aktif
              </Badge>
            ) : (
              <Badge className="bg-slate-800 text-slate-400 border-slate-600 text-xs gap-1">
                <WifiOff className="h-3 w-3" /> Menghubungkan…
              </Badge>
            )}
            {realtimeCount > 0 && (
              <Badge className="bg-blue-900/40 text-blue-300 border-blue-600 text-xs gap-1">
                <Activity className="h-3 w-3" /> {realtimeCount} update
              </Badge>
            )}
            {costCenterId != null && (
              <Badge className="bg-indigo-900/40 text-indigo-300 border-indigo-700 text-xs gap-1">
                <Filter className="h-3 w-3" /> {costCenterLabel}
              </Badge>
            )}
          </div>
        </div>

        {/* ── FASE 6D-G: KPI Hari Ini (Live) ──────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Zap className="h-4 w-4 text-yellow-400" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">KPI Hari Ini — Live</h2>
            {realtimeCount > 0 && (
              <Badge className="bg-yellow-900/40 text-yellow-300 border-yellow-600 text-xs">
                {realtimeCount} update realtime
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {kpiLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse"><CardContent className="p-4 h-20" /></Card>
              ))
            ) : (
              <>
                <Card className="border-border/60 bg-blue-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">Revenue Hari Ini</p>
                    </div>
                    <p className="text-lg font-bold text-blue-300">{idr(kpiLive?.revenue_today ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">dari accounting</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-purple-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarDays className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">Booking Hari Ini</p>
                    </div>
                    <p className="text-lg font-bold text-purple-300">{kpiLive?.bookings_today ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpiLive?.active_bookings_now ?? 0} aktif sekarang</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-emerald-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <CheckCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">Check-In Hari Ini</p>
                    </div>
                    <p className="text-lg font-bold text-emerald-300">{kpiLive?.checkins_today ?? 0}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">sudah check-in</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-orange-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <Flame className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">Occupancy Hari Ini</p>
                    </div>
                    <p className="text-lg font-bold text-orange-300">{kpiLive?.occupancy_today ?? 0}%</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{kpiLive?.occupied_hours_today ?? 0}h / {kpiLive?.available_hours_today ?? 0}h</p>
                  </CardContent>
                </Card>
                <Card className={`border-border/60 ${(kpiLive?.net_profit_today ?? 0) >= 0 ? "bg-teal-950/20" : "bg-red-950/20"}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className={`h-3.5 w-3.5 shrink-0 ${(kpiLive?.net_profit_today ?? 0) >= 0 ? "text-teal-400" : "text-red-400"}`} />
                      <p className="text-xs text-muted-foreground truncate">Profit Hari Ini</p>
                    </div>
                    <p className={`text-lg font-bold ${(kpiLive?.net_profit_today ?? 0) >= 0 ? "text-teal-300" : "text-red-300"}`}>
                      {idr(kpiLive?.net_profit_today ?? 0)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">net (revenue − refund)</p>
                  </CardContent>
                </Card>
                <Card className="border-border/60 bg-red-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-400 shrink-0" />
                      <p className="text-xs text-muted-foreground truncate">Refund Hari Ini</p>
                    </div>
                    <p className="text-lg font-bold text-red-300">{idr(kpiLive?.refunds_today ?? 0)}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">dikembalikan</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        {/* ── Error card — Supabase gagal ──────────────────────────────────── */}
        {supaError && (
          <Alert className="border-red-700 bg-red-950/40 text-red-300">
            <AlertCircle className="h-4 w-4 text-red-400" />
            <AlertDescription className="flex items-center justify-between gap-3">
              <span>
                <strong>Gagal memuat data dari Supabase</strong>
                {supaErrorObj instanceof Error && (
                  <span className="ml-2 text-xs opacity-70">— {supaErrorObj.message}</span>
                )}
              </span>
              <button
                onClick={() => void refetchSupa()}
                className="flex items-center gap-1 text-xs px-2 py-1 bg-red-900/50 hover:bg-red-800/60 rounded transition-colors"
              >
                <RefreshCw className="h-3 w-3" /> Coba lagi
              </button>
            </AlertDescription>
          </Alert>
        )}

        {/* ── Sumber data indicator ─────────────────────────────────────────── */}
        {!isLoading && !supaError && (
          <p className="text-xs text-muted-foreground">
            Sumber:{" "}
            {hasSupaBookings
              ? <span className="text-emerald-400 font-medium">✓ Supabase ({supaData?.totalBookings ?? 0} booking)</span>
              : <span className="text-slate-400">Supabase (kosong) — menampilkan data lokal</span>
            }
          </p>
        )}

        {/* ── Stats Cards ──────────────────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-5 h-24" /></Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((s) => (
              <Card key={s.title} className="border-border/60">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground mb-1 truncate">{s.title}</p>
                      <p className="text-xl font-bold text-foreground">{s.value}</p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">{s.sub}</p>
                    </div>
                    <div className={`p-2 rounded-lg ml-2 shrink-0 ${s.bg}`}>
                      <s.icon className={`h-4 w-4 ${s.color}`} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* ── Booking per Status & Top Fasilitas ───────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Booking per Status */}
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
                    <Badge className={`text-xs border ${STATUS_COLOR[s.status] ?? "bg-muted text-muted-foreground border-border"}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{s.count} booking</span>
                  </div>
                ))}
                {byStatus.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Top Fasilitas */}
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
                    <span className="text-xs font-bold text-muted-foreground w-5 shrink-0">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.facility_name}</p>
                      <p className="text-xs text-muted-foreground">{f.bookings} booking</p>
                    </div>
                    <span className="text-sm font-medium text-emerald-400 shrink-0">
                      {idr(Number(f.revenue))}
                    </span>
                  </div>
                ))}
                {topFacilities.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Booking Terbaru ───────────────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Booking Terbaru
              <span className="text-xs font-normal ml-1 opacity-60">(5 terbaru berdasarkan created_at)</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40">
                    {["No. Booking", "Pelanggan", "Fasilitas", "Tanggal", "Status", "Total"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recentBookings.map((b, idx) => (
                    <tr key={String(b.id ?? idx)} className="border-b border-border/20 hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">
                        {String(b.booking_number ?? b.id ?? "-")}
                      </td>
                      <td className="py-2 px-3 text-foreground">{String(b.customer_name ?? "-")}</td>
                      <td className="py-2 px-3 text-muted-foreground">{String(b.facility_name ?? "-")}</td>
                      <td className="py-2 px-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(String(b.booking_date ?? ""))}
                      </td>
                      <td className="py-2 px-3">
                        <Badge className={`text-xs border ${STATUS_COLOR[String(b.status ?? "")] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {STATUS_LABEL[String(b.status ?? "")] ?? String(b.status ?? "-")}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-foreground whitespace-nowrap">
                        {idr(Number(b.total_amount ?? b.total ?? 0))}
                      </td>
                    </tr>
                  ))}
                  {recentBookings.length === 0 && (
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
        {/* ── FASE 6D-F: Heatmap Jam Ramai ────────────────────────────────── */}
        {(heatmapData?.length ?? 0) > 0 && (
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-yellow-400" /> Heatmap Jam Ramai
                <span className="text-xs font-normal opacity-60">— historis booking per jam</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={heatmapData ?? []} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                  <XAxis dataKey="hour" stroke="#6b7280" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#6b7280" tick={{ fontSize: 10 }} width={28} allowDecimals={false} />
                  <Tooltip
                    formatter={(v: number) => [`${v} booking`, "Jumlah"]}
                    contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                    labelStyle={{ color: "#e5e7eb", fontSize: 12 }}
                  />
                  <Bar dataKey="booking_count" name="Booking" radius={[3, 3, 0, 0]}>
                    {(heatmapData ?? []).map((entry, i) => {
                      const max = Math.max(...(heatmapData ?? []).map(r => r.booking_count), 1);
                      const intensity = entry.booking_count / max;
                      const color = intensity > 0.7 ? "#ef4444" : intensity > 0.4 ? "#f59e0b" : intensity > 0.1 ? "#3b82f6" : "#374151";
                      return <Cell key={i} fill={color} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" /> Sangat ramai</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" /> Ramai</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" /> Normal</span>
                <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-gray-700 inline-block" /> Sepi</span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Sync Status Panel ─────────────────────────────────────────────── */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <CloudUpload className="h-4 w-4" /> Sinkronisasi ke Supabase
                <span className="text-xs font-normal opacity-60">— auto-refresh tiap 30 detik</span>
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5"
                  disabled={syncBusy}
                  onClick={() => void refetchSync()}
                >
                  <RefreshCw className={`h-3 w-3 ${syncLoading ? "animate-spin" : ""}`} />
                  Refresh
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 border-blue-700 text-blue-300 hover:bg-blue-950/40"
                  disabled={syncBusy}
                  onClick={() => void resyncFacilities.mutateAsync()}
                >
                  {resyncFacilities.isPending
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <Database className="h-3 w-3" />}
                  Resync Fasilitas
                </Button>
                <Button
                  size="sm" variant="outline"
                  className="h-7 text-xs gap-1.5 border-purple-700 text-purple-300 hover:bg-purple-950/40"
                  disabled={syncBusy}
                  onClick={() => void resyncBookings.mutateAsync()}
                >
                  {resyncBookings.isPending
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <BookOpen className="h-3 w-3" />}
                  Resync Booking
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white"
                  disabled={syncBusy}
                  onClick={() => void resyncAll.mutateAsync()}
                >
                  {resyncAll.isPending
                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                    : <CloudUpload className="h-3 w-3" />}
                  Resync Semua
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Hasil resync terakhir */}
            {(resyncFacilities.isSuccess || resyncAll.isSuccess || resyncBookings.isSuccess) && (
              <Alert className="border-emerald-700 bg-emerald-950/40 text-emerald-300 py-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <AlertDescription className="text-xs">
                  {resyncAll.isSuccess && resyncAll.data && (
                    <span>
                      Resync selesai —{" "}
                      Fasilitas: <strong>{(resyncAll.data as any).facilities?.synced ?? 0}/{(resyncAll.data as any).facilities?.total ?? 0}</strong>,{" "}
                      Booking: <strong>{(resyncAll.data as any).bookings?.synced ?? 0}/{(resyncAll.data as any).bookings?.total ?? 0}</strong>
                    </span>
                  )}
                  {resyncFacilities.isSuccess && !resyncAll.isSuccess && resyncFacilities.data && (
                    <span>
                      Fasilitas berhasil disync —{" "}
                      <strong>{(resyncFacilities.data as any).synced ?? 0}/{(resyncFacilities.data as any).total ?? 0}</strong> fasilitas
                    </span>
                  )}
                  {resyncBookings.isSuccess && !resyncAll.isSuccess && resyncBookings.data && (
                    <span>
                      Booking berhasil disync —{" "}
                      <strong>{(resyncBookings.data as any).synced ?? 0}/{(resyncBookings.data as any).total ?? 0}</strong> booking
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
            {(resyncFacilities.isError || resyncAll.isError || resyncBookings.isError) && (
              <Alert className="border-red-700 bg-red-950/40 text-red-300 py-2">
                <XCircle className="h-4 w-4 text-red-400" />
                <AlertDescription className="text-xs">
                  {String(
                    (resyncAll.error ?? resyncFacilities.error ?? resyncBookings.error) instanceof Error
                      ? (resyncAll.error ?? resyncFacilities.error ?? resyncBookings.error as Error)?.message
                      : "Resync gagal"
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Ringkasan last sync */}
            {!syncLoading && syncData && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1">
                  <p className="text-muted-foreground">Fasilitas lokal</p>
                  <p className="text-xl font-bold text-foreground">{syncData.local.facilities}</p>
                </div>
                <div className="rounded-lg border border-border/40 bg-muted/20 p-3 space-y-1">
                  <p className="text-muted-foreground">Booking lokal</p>
                  <p className="text-xl font-bold text-foreground">{syncData.local.bookings}</p>
                </div>
                <div className={`rounded-lg border p-3 space-y-1 ${syncData.last_facility_sync?.status === "ok" ? "border-emerald-700/50 bg-emerald-950/20" : syncData.last_facility_sync ? "border-red-700/50 bg-red-950/20" : "border-border/40 bg-muted/20"}`}>
                  <p className="text-muted-foreground flex items-center gap-1">
                    {syncData.last_facility_sync?.status === "ok"
                      ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      : syncData.last_facility_sync
                        ? <XCircle className="h-3 w-3 text-red-400" />
                        : <Database className="h-3 w-3 text-muted-foreground" />}
                    Sync Fasilitas Terakhir
                  </p>
                  <p className="text-foreground font-medium text-xs">{fmtTs(syncData.last_facility_sync?.created_at)}</p>
                  {syncData.last_facility_sync?.detail && (
                    <p className="text-muted-foreground text-xs opacity-70">{syncData.last_facility_sync.detail}</p>
                  )}
                </div>
                <div className={`rounded-lg border p-3 space-y-1 ${syncData.last_booking_sync?.status === "ok" ? "border-emerald-700/50 bg-emerald-950/20" : syncData.last_booking_sync ? "border-red-700/50 bg-red-950/20" : "border-border/40 bg-muted/20"}`}>
                  <p className="text-muted-foreground flex items-center gap-1">
                    {syncData.last_booking_sync?.status === "ok"
                      ? <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                      : syncData.last_booking_sync
                        ? <XCircle className="h-3 w-3 text-red-400" />
                        : <BookOpen className="h-3 w-3 text-muted-foreground" />}
                    Sync Booking Terakhir
                  </p>
                  <p className="text-foreground font-medium text-xs">{fmtTs(syncData.last_booking_sync?.created_at)}</p>
                  {syncData.last_booking_sync?.detail && (
                    <p className="text-muted-foreground text-xs opacity-70">{syncData.last_booking_sync.detail}</p>
                  )}
                </div>
              </div>
            )}

            {/* Log table */}
            {syncLoading && (
              <div className="h-20 rounded-lg bg-muted/20 animate-pulse" />
            )}
            {!syncLoading && (
              <div className="overflow-x-auto rounded-lg border border-border/40">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border/40 bg-muted/30">
                      {["Waktu", "Entity", "Aksi", "ID", "Status", "Detail"].map((h) => (
                        <th key={h} className="text-left py-2 px-3 text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(syncData?.recent_logs ?? []).map((log) => (
                      <tr key={log.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                        <td className="py-2 px-3 font-mono text-muted-foreground whitespace-nowrap">
                          {fmtTs(log.created_at)}
                        </td>
                        <td className="py-2 px-3">
                          <Badge className={`text-xs border ${log.entity === "facility" ? "bg-blue-900/40 text-blue-300 border-blue-700" : "bg-purple-900/40 text-purple-300 border-purple-700"}`}>
                            {log.entity === "facility" ? "Fasilitas" : "Booking"}
                          </Badge>
                        </td>
                        <td className="py-2 px-3 text-muted-foreground capitalize">{log.action}</td>
                        <td className="py-2 px-3 font-mono text-muted-foreground">
                          {log.entity_id ?? <span className="opacity-40">—</span>}
                        </td>
                        <td className="py-2 px-3">
                          {log.status === "ok" ? (
                            <span className="inline-flex items-center gap-1 text-emerald-400">
                              <CheckCircle2 className="h-3 w-3" /> OK
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-red-400">
                              <XCircle className="h-3 w-3" /> Error
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-muted-foreground max-w-[200px] truncate">
                          {log.detail ?? <span className="opacity-30">—</span>}
                        </td>
                      </tr>
                    ))}
                    {(syncData?.recent_logs ?? []).length === 0 && !syncLoading && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-muted-foreground">
                          Belum ada riwayat sinkronisasi. Klik <strong>Resync Semua</strong> untuk memulai.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </AppShell>
  );
}
