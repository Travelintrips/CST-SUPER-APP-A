import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { useCompany } from "@/contexts/CompanyContext";
import {
  TrendingUp, TrendingDown, DollarSign, Users, CalendarDays,
  RefreshCw, BarChart2, ArrowUpRight, ArrowDownRight, Activity,
  Trophy,
} from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const idrC = (n: number) => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}M`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(0)}Jt`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}rb`;
  return idr(n);
};

interface ProfitData {
  revenue_booking: number;
  revenue_membership: number;
  refund_amount: number;
  operational_expense: number;
  gross_profit: number;
  net_profit: number;
  bookings_count: number;
  active_members: number;
  top_facilities: FacilityRow[];
  revenue_by_month: MonthRow[];
}

interface FacilityRow {
  facility_name: string;
  facility_id: number;
  total_bookings: number;
  revenue: number;
  refund: number;
  net_revenue: number;
  occupancy_pct: number;
}

interface MonthRow {
  month: string;
  booking_revenue: number;
  membership_revenue: number;
  total_revenue: number;
  expense: number;
  refund: number;
  net_profit: number;
}

function KpiCard({
  title, value, icon: Icon, color, subtitle, trend,
}: {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
  trend?: "up" | "down" | "neutral";
}) {
  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-gray-400 text-sm">{title}</span>
          <div className={`p-2 rounded-lg ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <div className="flex items-end gap-2">
          <span className="text-xl font-bold text-white leading-none">{value}</span>
          {trend === "up" && <ArrowUpRight className="h-4 w-4 text-emerald-400 mb-0.5" />}
          {trend === "down" && <ArrowDownRight className="h-4 w-4 text-red-400 mb-0.5" />}
        </div>
        {subtitle && <p className="text-gray-500 text-xs mt-1">{subtitle}</p>}
      </CardContent>
    </Card>
  );
}

function NetBadge({ value }: { value: number }) {
  if (value > 0) return <Badge className="bg-emerald-900/60 text-emerald-300 border-emerald-700">{idrC(value)}</Badge>;
  if (value < 0) return <Badge className="bg-red-900/60 text-red-300 border-red-700">{idrC(value)}</Badge>;
  return <Badge className="bg-gray-800 text-gray-400 border-gray-700">{idrC(value)}</Badge>;
}

const fmtMonth = (m: string) => {
  const [y, mo] = m.split("-");
  const names = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Ags","Sep","Okt","Nov","Des"];
  return `${names[Number(mo) - 1]} '${y.slice(2)}`;
};

export default function SportCenterProfitability() {
  const { activeCompanyId } = useCompany();
  const today = new Date().toISOString().split("T")[0];
  const firstOfYear = `${new Date().getFullYear()}-01-01`;

  const [from, setFrom] = useState(firstOfYear);
  const [to, setTo] = useState(today);
  const [queryFrom, setQueryFrom] = useState(firstOfYear);
  const [queryTo, setQueryTo] = useState(today);

  const { data, isLoading, refetch } = useQuery<ProfitData>({
    queryKey: ["sc-profitability", activeCompanyId, queryFrom, queryTo],
    queryFn: async () => {
      const qs = new URLSearchParams({ from: queryFrom, to: queryTo });
      if (activeCompanyId) qs.set("company_id", String(activeCompanyId));
      const r = await fetch(`/api/sport-center/profitability?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat profitabilitas");
      return r.json();
    },
  });

  const d = data;
  const netProfitPositive = (d?.net_profit ?? 0) >= 0;

  const handleApply = () => {
    setQueryFrom(from);
    setQueryTo(to);
  };

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-900/40 rounded-lg">
              <Trophy className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Profitabilitas Sport Center</h1>
              <p className="text-gray-400 text-sm">Laba/rugi berbasis jurnal accounting yang terposting</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="border-gray-700 text-gray-300">
            <RefreshCw className="h-4 w-4 mr-1" /> Refresh
          </Button>
        </div>

        {/* Filter */}
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Dari</Label>
                <Input type="date" value={from} onChange={e => setFrom(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white h-8 w-36" />
              </div>
              <div className="space-y-1">
                <Label className="text-gray-400 text-xs">Sampai</Label>
                <Input type="date" value={to} onChange={e => setTo(e.target.value)}
                  className="bg-gray-800 border-gray-700 text-white h-8 w-36" />
              </div>
              <Button size="sm" onClick={handleApply} className="bg-emerald-700 hover:bg-emerald-600 text-white">
                Terapkan
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="bg-gray-900 border-gray-700">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-3 bg-gray-800" />
                  <Skeleton className="h-6 w-32 bg-gray-800" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              title="Pendapatan Booking"
              value={idrC(d?.revenue_booking ?? 0)}
              icon={DollarSign}
              color="bg-blue-900/40 text-blue-400"
              subtitle="dari accounting_entries"
              trend="up"
            />
            <KpiCard
              title="Pendapatan Membership"
              value={idrC(d?.revenue_membership ?? 0)}
              icon={Users}
              color="bg-purple-900/40 text-purple-400"
              subtitle="dari accounting_entries"
              trend="up"
            />
            <KpiCard
              title="Refund"
              value={idrC(d?.refund_amount ?? 0)}
              icon={ArrowDownRight}
              color="bg-orange-900/40 text-orange-400"
              subtitle="booking + membership refund"
              trend="down"
            />
            <KpiCard
              title="Biaya Operasional"
              value={idrC(d?.operational_expense ?? 0)}
              icon={Activity}
              color="bg-red-900/40 text-red-400"
              subtitle="operational expense"
              trend="down"
            />
            <KpiCard
              title="Laba Kotor"
              value={idrC(d?.gross_profit ?? 0)}
              icon={TrendingUp}
              color={`${(d?.gross_profit ?? 0) >= 0 ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"}`}
              subtitle="Revenue − Refund"
              trend={(d?.gross_profit ?? 0) >= 0 ? "up" : "down"}
            />
            <KpiCard
              title="Laba Bersih"
              value={idrC(d?.net_profit ?? 0)}
              icon={netProfitPositive ? TrendingUp : TrendingDown}
              color={netProfitPositive ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"}
              subtitle="Laba Kotor − Biaya Operasional"
              trend={netProfitPositive ? "up" : "down"}
            />
            <KpiCard
              title="Booking Aktif"
              value={String(d?.bookings_count ?? 0)}
              icon={CalendarDays}
              color="bg-cyan-900/40 text-cyan-400"
              subtitle="dalam periode"
            />
            <KpiCard
              title="Member Aktif"
              value={String(d?.active_members ?? 0)}
              icon={Users}
              color="bg-indigo-900/40 text-indigo-400"
              subtitle="status aktif"
            />
          </div>
        )}

        {/* Charts Row */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Revenue per Bulan */}
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <BarChart2 className="h-4 w-4 text-cyan-400" /> Revenue per Bulan
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full bg-gray-800" />
              ) : (d?.revenue_by_month?.length ?? 0) === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                  Belum ada data accounting untuk periode ini
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={d?.revenue_by_month ?? []} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" tickFormatter={fmtMonth} stroke="#6b7280" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => idrC(v)} stroke="#6b7280" tick={{ fontSize: 10 }} width={56} />
                    <Tooltip
                      formatter={(v: number) => idr(v)}
                      labelFormatter={fmtMonth}
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      labelStyle={{ color: "#e5e7eb" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                    <Bar dataKey="booking_revenue" name="Booking" fill="#3b82f6" radius={[2,2,0,0]} />
                    <Bar dataKey="membership_revenue" name="Membership" fill="#8b5cf6" radius={[2,2,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Revenue vs Expense */}
          <Card className="bg-gray-900 border-gray-700">
            <CardHeader className="pb-2">
              <CardTitle className="text-white text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-emerald-400" /> Revenue vs Expense & Laba Bersih
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full bg-gray-800" />
              ) : (d?.revenue_by_month?.length ?? 0) === 0 ? (
                <div className="h-48 flex items-center justify-center text-gray-500 text-sm">
                  Belum ada data accounting untuk periode ini
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={d?.revenue_by_month ?? []} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" tickFormatter={fmtMonth} stroke="#6b7280" tick={{ fontSize: 11 }} />
                    <YAxis tickFormatter={v => idrC(v)} stroke="#6b7280" tick={{ fontSize: 10 }} width={56} />
                    <Tooltip
                      formatter={(v: number) => idr(v)}
                      labelFormatter={fmtMonth}
                      contentStyle={{ backgroundColor: "#1f2937", border: "1px solid #374151", borderRadius: 8 }}
                      labelStyle={{ color: "#e5e7eb" }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: "#9ca3af" }} />
                    <Line type="monotone" dataKey="total_revenue" name="Total Revenue" stroke="#3b82f6" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="expense" name="Expense" stroke="#ef4444" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="net_profit" name="Laba Bersih" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="4 2" />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Facilities Table */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <Trophy className="h-4 w-4 text-yellow-400" /> Profit per Fasilitas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full bg-gray-800" />
                ))}
              </div>
            ) : (d?.top_facilities?.length ?? 0) === 0 ? (
              <div className="py-10 text-center text-gray-500 text-sm">
                Belum ada data fasilitas dalam periode ini
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-gray-800 hover:bg-transparent">
                    <TableHead className="text-gray-400 text-xs">Fasilitas</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Total Booking</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Revenue</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Refund</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Net Revenue</TableHead>
                    <TableHead className="text-gray-400 text-xs text-right">Occupancy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(d?.top_facilities ?? []).map((f, i) => (
                    <TableRow key={i} className="border-gray-800 hover:bg-gray-800/40">
                      <TableCell className="text-white font-medium py-3">{f.facility_name}</TableCell>
                      <TableCell className="text-gray-300 text-right py-3">{f.total_bookings.toLocaleString("id-ID")}</TableCell>
                      <TableCell className="text-blue-300 text-right py-3">{idrC(f.revenue)}</TableCell>
                      <TableCell className="text-orange-300 text-right py-3">{f.refund > 0 ? idrC(f.refund) : "—"}</TableCell>
                      <TableCell className="text-right py-3">
                        <NetBadge value={f.net_revenue} />
                      </TableCell>
                      <TableCell className="text-right py-3">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-16 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${Math.min(100, f.occupancy_pct)}%` }}
                            />
                          </div>
                          <span className="text-gray-400 text-xs w-8">{f.occupancy_pct}%</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* P&L Summary Card */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-white text-sm flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-cyan-400" /> Ringkasan Laba/Rugi
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full bg-gray-800" />
            ) : (
              <div className="space-y-2 max-w-sm">
                <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
                  <span className="text-gray-400 text-sm">Pendapatan Booking</span>
                  <span className="text-blue-300 font-mono text-sm">{idr(d?.revenue_booking ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
                  <span className="text-gray-400 text-sm">Pendapatan Membership</span>
                  <span className="text-purple-300 font-mono text-sm">{idr(d?.revenue_membership ?? 0)}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
                  <span className="text-gray-400 text-sm">Refund</span>
                  <span className="text-orange-300 font-mono text-sm">({idr(d?.refund_amount ?? 0)})</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-700 font-semibold">
                  <span className="text-white text-sm">= Laba Kotor</span>
                  <span className={`font-mono text-sm ${(d?.gross_profit ?? 0) >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                    {idr(d?.gross_profit ?? 0)}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-gray-800">
                  <span className="text-gray-400 text-sm">Biaya Operasional</span>
                  <span className="text-red-300 font-mono text-sm">({idr(d?.operational_expense ?? 0)})</span>
                </div>
                <div className="flex justify-between items-center py-2 bg-gray-800/60 px-3 rounded-lg font-bold">
                  <span className="text-white">= Laba Bersih</span>
                  <span className={`font-mono ${netProfitPositive ? "text-emerald-400" : "text-red-400"}`}>
                    {idr(d?.net_profit ?? 0)}
                  </span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info note */}
        <p className="text-gray-600 text-xs">
          * Seluruh angka bersumber dari <code className="text-gray-500">accounting_entries</code> yang berstatus <code className="text-gray-500">posted</code> — identik dengan jurnal akuntansi yang terposting.
        </p>
      </div>
    </AppShell>
  );
}
