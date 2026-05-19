import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  BarChart2, TrendingUp, CalendarCheck, CircleDollarSign,
  Clock3, CheckCircle2, XCircle, Trophy,
} from "lucide-react";

// ── Constants ─────────────────────────────────────────────────────────────────

const FACILITIES = [
  { id: "futsal-01",    name: "Futsal",    short: "Futsal",    color: "#3b82f6" },
  { id: "badminton-01", name: "Badminton", short: "Badminton", color: "#10b981" },
  { id: "basket-01",    name: "Basket",    short: "Basket",    color: "#f97316" },
  { id: "fitness-01",   name: "Fitness",   short: "Fitness",   color: "#a855f7" },
  { id: "yoga-01",      name: "Yoga",      short: "Yoga",      color: "#ec4899" },
  { id: "zumba-01",     name: "Zumba",     short: "Zumba",     color: "#eab308" },
];

const MONTHS_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const DAYS_ID   = ["Sen","Sel","Rab","Kam","Jum","Sab","Min"];

// ── Types ─────────────────────────────────────────────────────────────────────

interface Booking {
  id: number;
  facilityId: string;
  facilityName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  totalPrice: number;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function apiFetch(path: string) {
  const res = await fetch(`/api${path}`, { credentials: "include" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function formatCurrency(n: number, compact = false) {
  if (compact) {
    if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}jt`;
    if (n >= 1_000)     return `Rp ${(n / 1_000).toFixed(0)}rb`;
    return `Rp ${n}`;
  }
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

function getPeriodLabel(period: string, offset: number): string {
  const now = new Date();
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() + offset * 7 - d.getDay() + 1);
    const e = new Date(d); e.setDate(d.getDate() + 6);
    const fmt = (x: Date) => x.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    return `${fmt(d)} – ${fmt(e)}`;
  }
  if (period === "month") {
    const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
  }
  return `${now.getFullYear() + offset}`;
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  title, value, sub, icon: Icon, color,
}: { title: string; value: string; sub?: string; icon: React.ElementType; color: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide truncate">{title}</p>
            <p className="text-2xl font-bold mt-1 leading-tight">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2.5 rounded-lg shrink-0 ${color}`}>
            <Icon className="h-4 w-4 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label, isCurrency = false }: {
  active?: boolean; payload?: { value: number; name?: string; color?: string }[];
  label?: string; isCurrency?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background shadow-md px-3 py-2 text-sm">
      <p className="font-medium mb-1 text-muted-foreground">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }}>
          {p.name ? `${p.name}: ` : ""}
          {isCurrency ? formatCurrency(p.value) : p.value}
        </p>
      ))}
    </div>
  );
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function SportCenterReportPage() {
  const [period, setPeriod] = useState<"week" | "month" | "year">("month");
  const [offset, setOffset] = useState(0);

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["sport-center-bookings"],
    queryFn: () => apiFetch("/sport-center/bookings"),
    refetchInterval: 60_000,
  });

  // ── Filter by period ──────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const now = new Date();
    return bookings.filter(b => {
      const d = new Date(b.date + "T00:00:00");
      if (period === "week") {
        const ws = new Date(now);
        ws.setDate(ws.getDate() - ws.getDay() + 1 + offset * 7);
        ws.setHours(0, 0, 0, 0);
        const we = new Date(ws); we.setDate(ws.getDate() + 6);
        return d >= ws && d <= we;
      }
      if (period === "month") {
        const target = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
      }
      return d.getFullYear() === now.getFullYear() + offset;
    });
  }, [bookings, period, offset]);

  const activeBookings   = filtered.filter(b => b.status !== "cancelled");
  const confirmedCount   = filtered.filter(b => b.status === "confirmed").length;
  const completedCount   = filtered.filter(b => b.status === "completed").length;
  const pendingCount     = filtered.filter(b => b.status === "pending").length;
  const cancelledCount   = filtered.filter(b => b.status === "cancelled").length;
  const totalRevenue     = activeBookings.reduce((s, b) => s + b.totalPrice, 0);
  const totalHours       = activeBookings.reduce((s, b) => s + b.totalHours, 0);
  const avgBookingValue  = activeBookings.length ? totalRevenue / activeBookings.length : 0;

  // ── Revenue by facility ───────────────────────────────────────────────────

  const facilityStats = useMemo(() => {
    return FACILITIES.map(f => {
      const fbs    = activeBookings.filter(b => b.facilityId === f.id);
      const rev    = fbs.reduce((s, b) => s + b.totalPrice, 0);
      const hrs    = fbs.reduce((s, b) => s + b.totalHours, 0);
      return { ...f, count: fbs.length, revenue: rev, hours: hrs };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [activeBookings]);

  // ── Trend by sub-period ───────────────────────────────────────────────────

  const trendData = useMemo(() => {
    if (period === "week") {
      // daily
      return DAYS_ID.map((label, i) => {
        const day    = i === 6 ? 0 : i + 1; // 0=Sun in JS
        const dayBks = activeBookings.filter(b => {
          const d = new Date(b.date + "T00:00:00");
          return d.getDay() === day;
        });
        return {
          label,
          booking: dayBks.length,
          revenue: dayBks.reduce((s, b) => s + b.totalPrice, 0),
        };
      });
    }
    if (period === "month") {
      // weekly buckets (W1–W5)
      return Array.from({ length: 5 }, (_, wi) => {
        const wBks = activeBookings.filter(b => {
          const day = new Date(b.date + "T00:00:00").getDate();
          return Math.floor((day - 1) / 7) === wi;
        });
        return {
          label: `Mg ${wi + 1}`,
          booking: wBks.length,
          revenue: wBks.reduce((s, b) => s + b.totalPrice, 0),
        };
      });
    }
    // year → monthly
    return MONTHS_ID.map((label, mi) => {
      const mBks = activeBookings.filter(b => new Date(b.date + "T00:00:00").getMonth() === mi);
      return {
        label,
        booking: mBks.length,
        revenue: mBks.reduce((s, b) => s + b.totalPrice, 0),
      };
    });
  }, [activeBookings, period]);

  // ── Peak hour analysis ────────────────────────────────────────────────────

  const hourData = useMemo(() => {
    const counts: Record<number, number> = {};
    activeBookings.forEach(b => {
      const sh = parseInt(b.startTime.split(":")[0]);
      const eh = parseInt(b.endTime.split(":")[0]);
      for (let h = sh; h < eh; h++) counts[h] = (counts[h] ?? 0) + 1;
    });
    return Array.from({ length: 17 }, (_, i) => ({
      label: `${String(i + 6).padStart(2, "0")}`,
      count: counts[i + 6] ?? 0,
    }));
  }, [activeBookings]);

  // ── Pie data ──────────────────────────────────────────────────────────────

  const pieData = facilityStats
    .filter(f => f.count > 0)
    .map(f => ({ name: f.short, value: f.count, color: f.color }));

  const statusPieData = [
    { name: "Dikonfirmasi", value: confirmedCount,  color: "#10b981" },
    { name: "Selesai",      value: completedCount,  color: "#64748b" },
    { name: "Menunggu",     value: pendingCount,     color: "#f59e0b" },
    { name: "Dibatalkan",   value: cancelledCount,   color: "#ef4444" },
  ].filter(d => d.value > 0);

  const topFacility = facilityStats[0];

  // ── Render ────────────────────────────────────────────────────────────────

  const periodLabel = getPeriodLabel(period, offset);

  return (
    <AppShell>
      <div className="space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <BarChart2 className="h-7 w-7 text-primary" />
              Laporan Sport Center
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Rekap booking, pendapatan, dan tren fasilitas</p>
          </div>

          {/* Period controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={period} onValueChange={(v: "week" | "month" | "year") => { setPeriod(v); setOffset(0); }}>
              <SelectTrigger className="w-[110px] h-9 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Mingguan</SelectItem>
                <SelectItem value="month">Bulanan</SelectItem>
                <SelectItem value="year">Tahunan</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1 rounded-md border px-2 py-1 text-sm bg-muted/30">
              <button onClick={() => setOffset(o => o - 1)} className="px-1.5 hover:text-primary transition-colors">‹</button>
              <span className="min-w-[140px] text-center font-medium text-xs">{periodLabel}</span>
              <button onClick={() => setOffset(o => o + 1)} disabled={offset >= 0} className="px-1.5 hover:text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed">›</button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
        ) : (
          <>
            {/* KPI Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Total Booking"
                value={String(activeBookings.length)}
                sub={`${cancelledCount} dibatalkan`}
                icon={CalendarCheck}
                color="bg-blue-500"
              />
              <StatCard
                title="Total Pendapatan"
                value={formatCurrency(totalRevenue, true)}
                sub={`Rata-rata ${formatCurrency(avgBookingValue, true)}/booking`}
                icon={CircleDollarSign}
                color="bg-emerald-500"
              />
              <StatCard
                title="Total Jam Terpakai"
                value={`${totalHours.toFixed(1)} jam`}
                sub={`Rata-rata ${activeBookings.length ? (totalHours / activeBookings.length).toFixed(1) : 0} jam/booking`}
                icon={Clock3}
                color="bg-purple-500"
              />
              <StatCard
                title="Fasilitas Terpopuler"
                value={topFacility?.count > 0 ? topFacility.short : "—"}
                sub={topFacility?.count > 0 ? `${topFacility.count} booking · ${formatCurrency(topFacility.revenue, true)}` : "Belum ada data"}
                icon={Trophy}
                color="bg-amber-500"
              />
            </div>

            {/* Status summary */}
            <div className="flex flex-wrap gap-2 text-sm">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{confirmedCount} dikonfirmasi</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-500/10 border border-slate-400/20 text-slate-600">
                <TrendingUp className="h-3.5 w-3.5" />
                <span>{completedCount} selesai</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700">
                <Clock3 className="h-3.5 w-3.5" />
                <span>{pendingCount} menunggu</span>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-400/20 text-red-600">
                <XCircle className="h-3.5 w-3.5" />
                <span>{cancelledCount} dibatalkan</span>
              </div>
            </div>

            {/* Trend charts */}
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Revenue trend */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Tren Pendapatan</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {trendData.every(d => d.revenue === 0) ? (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Belum ada data pendapatan</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={trendData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false}
                          tickFormatter={v => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}jt` : v >= 1000 ? `${(v/1000).toFixed(0)}rb` : String(v)} />
                        <Tooltip content={<CustomTooltip isCurrency />} />
                        <Bar dataKey="revenue" name="Pendapatan" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Booking count trend */}
              <Card>
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Tren Jumlah Booking</CardTitle>
                </CardHeader>
                <CardContent className="px-2 pb-4">
                  {trendData.every(d => d.booking === 0) ? (
                    <div className="flex items-center justify-center h-48 text-sm text-muted-foreground">Belum ada data booking</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={trendData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="booking" name="Booking" fill="#10b981" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Facility breakdown + status pie */}
            <div className="grid lg:grid-cols-3 gap-4">
              {/* Per-facility table */}
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold">Performa per Fasilitas</CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4">
                  {facilityStats.every(f => f.count === 0) ? (
                    <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Belum ada data fasilitas</div>
                  ) : (
                    <div className="divide-y text-sm">
                      {facilityStats.map((f, idx) => {
                        const maxRev = facilityStats[0]?.revenue || 1;
                        const pct    = maxRev > 0 ? (f.revenue / maxRev) * 100 : 0;
                        return (
                          <div key={f.id} className="py-2.5 flex items-center gap-3">
                            <span className="text-xs text-muted-foreground w-4 shrink-0">{idx + 1}</span>
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{ backgroundColor: f.color }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <span className="font-medium truncate">{f.name}</span>
                                <span className="text-muted-foreground shrink-0">{f.count} booking</span>
                              </div>
                              <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${pct}%`, backgroundColor: f.color }}
                                />
                              </div>
                            </div>
                            <div className="text-right shrink-0 min-w-[80px]">
                              <div className="font-semibold">{formatCurrency(f.revenue, true)}</div>
                              <div className="text-xs text-muted-foreground">{f.hours}j</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Pie — distribution */}
              <div className="flex flex-col gap-4">
                <Card>
                  <CardHeader className="pb-1 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold">Sebaran Fasilitas</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 flex justify-center">
                    {pieData.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Belum ada data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" cx="50%" cy="50%" outerRadius={60} paddingAngle={2}>
                            {pieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                          <Tooltip formatter={(v: number, name: string) => [v, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-1 pt-4 px-5">
                    <CardTitle className="text-sm font-semibold">Sebaran Status</CardTitle>
                  </CardHeader>
                  <CardContent className="pb-4 flex justify-center">
                    {statusPieData.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">Belum ada data</div>
                    ) : (
                      <ResponsiveContainer width="100%" height={160}>
                        <PieChart>
                          <Pie data={statusPieData} dataKey="value" cx="50%" cy="50%" outerRadius={60} paddingAngle={2}>
                            {statusPieData.map((entry, i) => (
                              <Cell key={i} fill={entry.color} />
                            ))}
                          </Pie>
                          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: "11px" }} />
                          <Tooltip formatter={(v: number, name: string) => [v, name]} />
                        </PieChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Peak hour heatmap */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-5">
                <CardTitle className="text-sm font-semibold">Jam Tersibuk</CardTitle>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {hourData.every(h => h.count === 0) ? (
                  <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">Belum ada data</div>
                ) : (
                  <>
                    <div className="flex items-end gap-1 h-20">
                      {hourData.map((h, i) => {
                        const max = Math.max(...hourData.map(x => x.count), 1);
                        const pct = (h.count / max) * 100;
                        const intensity = h.count / max;
                        const bg = intensity > 0.75 ? "bg-red-500"
                          : intensity > 0.5 ? "bg-orange-400"
                          : intensity > 0.25 ? "bg-amber-300"
                          : intensity > 0 ? "bg-emerald-200"
                          : "bg-muted";
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
                            <div className="w-full flex items-end justify-center" style={{ height: 64 }}>
                              <div
                                className={`w-full rounded-t transition-all ${bg}`}
                                style={{ height: `${Math.max(4, pct)}%` }}
                                title={`${h.label}:00 — ${h.count} slot`}
                              />
                            </div>
                            <span className="text-[9px] text-muted-foreground">{h.label}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-3 mt-3 text-[11px] text-muted-foreground">
                      <span>Intensitas:</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-emerald-200 inline-block" /> Rendah</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-amber-300 inline-block" /> Sedang</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-orange-400 inline-block" /> Tinggi</span>
                      <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded bg-red-500 inline-block" /> Puncak</span>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppShell>
  );
}
