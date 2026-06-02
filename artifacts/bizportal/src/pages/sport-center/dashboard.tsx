import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import {
  CalendarDays, Users, DollarSign, Clock, TrendingUp,
  Activity, AlertCircle, Building2,
} from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Konfirmasi", checked_in: "Check-In",
  completed: "Selesai", cancelled: "Dibatal",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-900/40 text-yellow-300 border-yellow-600",
  confirmed: "bg-blue-900/40 text-blue-300 border-blue-600",
  checked_in: "bg-purple-900/40 text-purple-300 border-purple-600",
  completed: "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  cancelled: "bg-red-900/40 text-red-300 border-red-600",
};

interface DashboardData {
  totalBookings: number; todayBookings: number; pendingPayment: number;
  totalRevenue: number; monthRevenue: number; totalMembers: number;
  byStatus: { status: string; count: string }[];
  topFacilities: { facility_name: string; bookings: string; revenue: string }[];
  recentBookings: Record<string, unknown>[];
}

export default function SportCenterDashboard() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const esRef = useRef<EventSource | null>(null);
  const [realtimeCount, setRealtimeCount] = useState(0);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["sport-center-dashboard", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/sport-center/dashboard${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat dashboard");
      return r.json();
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
    const es = new EventSource(`/api/sport-center/events${qs}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "connected") return;
        if (["booking","payment","dashboard"].includes(ev.entity)) {
          qc.invalidateQueries({ queryKey: ["sport-center-dashboard"] });
          setRealtimeCount((c) => c + 1);
        }
      } catch {}
    };
    return () => { es.close(); esRef.current = null; };
  }, [activeCompanyId, qc]);

  const stats = [
    { title: "Total Booking", value: data?.totalBookings ?? 0, icon: CalendarDays, color: "text-blue-400", bg: "bg-blue-900/20", sub: "Semua waktu" },
    { title: "Booking Hari Ini", value: data?.todayBookings ?? 0, icon: Clock, color: "text-purple-400", bg: "bg-purple-900/20", sub: "Aktif hari ini" },
    { title: "Belum Bayar", value: data?.pendingPayment ?? 0, icon: AlertCircle, color: "text-yellow-400", bg: "bg-yellow-900/20", sub: "Perlu konfirmasi" },
    { title: "Member Aktif", value: data?.totalMembers ?? 0, icon: Users, color: "text-emerald-400", bg: "bg-emerald-900/20", sub: "Gym & AP" },
    { title: "Revenue Bulan Ini", value: idr(data?.monthRevenue ?? 0), icon: TrendingUp, color: "text-green-400", bg: "bg-green-900/20", sub: "Bulan berjalan" },
    { title: "Total Revenue", value: idr(data?.totalRevenue ?? 0), icon: DollarSign, color: "text-cyan-400", bg: "bg-cyan-900/20", sub: "Sepanjang waktu" },
  ];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Building2 className="h-7 w-7 text-emerald-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Sport Center Dashboard</h1>
              <p className="text-sm text-muted-foreground">Overview aktivitas & performa</p>
            </div>
          </div>
          {realtimeCount > 0 && (
            <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
              <Activity className="h-3 w-3" /> Realtime aktif
            </Badge>
          )}
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="animate-pulse"><CardContent className="p-5 h-24" /></Card>
            ))}
          </div>
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" /> Booking per Status
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {(data?.byStatus ?? []).map((s) => (
                  <div key={s.status} className="flex items-center justify-between">
                    <Badge className={`text-xs border ${STATUS_COLOR[s.status] ?? "bg-muted text-muted-foreground"}`}>
                      {STATUS_LABEL[s.status] ?? s.status}
                    </Badge>
                    <span className="text-sm font-medium text-foreground">{s.count}</span>
                  </div>
                ))}
                {(data?.byStatus ?? []).length === 0 && (
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
                {(data?.topFacilities ?? []).map((f, i) => (
                  <div key={f.facility_name} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4">{i + 1}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{f.facility_name}</p>
                      <p className="text-xs text-muted-foreground">{f.bookings} booking</p>
                    </div>
                    <span className="text-sm font-medium text-emerald-400">{idr(Number(f.revenue))}</span>
                  </div>
                ))}
                {(data?.topFacilities ?? []).length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">Belum ada data</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

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
                    {["No. Booking","Pelanggan","Fasilitas","Tanggal","Status","Total"].map((h) => (
                      <th key={h} className="text-left py-2 px-3 text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(data?.recentBookings ?? []).map((b: any) => (
                    <tr key={b.id} className="border-b border-border/20 hover:bg-muted/30">
                      <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{b.booking_number}</td>
                      <td className="py-2 px-3 text-foreground">{b.customer_name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{b.facility_name}</td>
                      <td className="py-2 px-3 text-muted-foreground">{b.booking_date}</td>
                      <td className="py-2 px-3">
                        <Badge className={`text-xs border ${STATUS_COLOR[b.status] ?? ""}`}>
                          {STATUS_LABEL[b.status] ?? b.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-medium text-foreground">{idr(Number(b.total_amount))}</td>
                    </tr>
                  ))}
                  {(data?.recentBookings ?? []).length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-muted-foreground text-sm">Belum ada booking</td>
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
