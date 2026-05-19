import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect, useCallback } from "react";
import { BarChart2, TrendingUp, Calendar, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatCurrency } from "@/lib/utils";

interface DailyRow { date: string; bookings: string; revenue: string; }
interface FacilityRow { facility_name: string; bookings: string; revenue: string; }
interface StatusRow { status: string; cnt: string; }

interface ReportData {
  daily: DailyRow[];
  byFacility: FacilityRow[];
  byStatus: StatusRow[];
  dateFrom: string;
  dateTo: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu", confirmed: "Dikonfirmasi", completed: "Selesai", cancelled: "Dibatalkan",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-500", confirmed: "bg-blue-500", completed: "bg-emerald-500", cancelled: "bg-red-400",
};

function defaultFrom() {
  const d = new Date(); d.setDate(d.getDate() - 29);
  return d.toISOString().split("T")[0];
}
function defaultTo() { return new Date().toISOString().split("T")[0]; }

export default function SportCenterReportsPage() {
  const [from, setFrom] = useState(defaultFrom());
  const [to, setTo] = useState(defaultTo());
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/sport-center/admin/reports?from=${from}&to=${to}`);
      setData(await r.json());
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchReport(); }, []);

  const totalRevenue = data?.daily.reduce((s, d) => s + parseInt(d.revenue), 0) ?? 0;
  const totalBookings = data?.daily.reduce((s, d) => s + parseInt(d.bookings), 0) ?? 0;
  const maxRevenue = Math.max(...(data?.daily.map((d) => parseInt(d.revenue)) ?? [1]));
  const maxFacRevenue = Math.max(...(data?.byFacility.map((f) => parseInt(f.revenue)) ?? [1]));

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Laporan Sport Center</h1>
            <p className="text-sm text-slate-500 mt-0.5">Statistik revenue dan booking</p>
          </div>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label className="text-xs">Dari Tanggal</Label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 w-40" />
              </div>
              <div>
                <Label className="text-xs">Sampai Tanggal</Label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-40" />
              </div>
              <Button onClick={fetchReport} disabled={loading} className="gap-2 h-9">
                <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
                Tampilkan
              </Button>
            </div>
          </CardContent>
        </Card>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => <div key={i} className="h-24 rounded-xl bg-slate-100 animate-pulse" />)}
          </div>
        ) : data ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: "Total Revenue", value: formatCurrency(totalRevenue), icon: TrendingUp, color: "text-emerald-600", bg: "bg-emerald-50" },
                { label: "Total Booking", value: totalBookings.toLocaleString("id-ID"), icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
                { label: "Rata-rata / Booking", value: totalBookings > 0 ? formatCurrency(Math.round(totalRevenue / totalBookings)) : "-", icon: BarChart2, color: "text-violet-600", bg: "bg-violet-50" },
              ].map((card) => (
                <Card key={card.label} className="border-0 shadow-sm">
                  <CardContent className="p-5 flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center`}>
                      <card.icon className={`w-5 h-5 ${card.color}`} />
                    </div>
                    <div>
                      <p className="text-xl font-bold text-slate-900">{card.value}</p>
                      <p className="text-xs text-slate-500">{card.label}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Revenue Harian</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.daily.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-8">Tidak ada data</p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {data.daily.map((d) => {
                        const pct = maxRevenue > 0 ? (parseInt(d.revenue) / maxRevenue) * 100 : 0;
                        return (
                          <div key={d.date} className="flex items-center gap-3 text-xs">
                            <span className="text-slate-500 w-20 shrink-0 font-mono">{d.date.substring(5)}</span>
                            <div className="flex-1 bg-slate-100 rounded-full h-5 relative overflow-hidden">
                              <div
                                className="absolute left-0 top-0 h-full bg-gradient-to-r from-blue-500 to-emerald-400 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                              <span className="absolute left-2 top-0 h-full flex items-center font-semibold text-white text-[10px] z-10">
                                {formatCurrency(parseInt(d.revenue))}
                              </span>
                            </div>
                            <span className="text-slate-500 w-10 text-right shrink-0">{d.bookings}×</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border-0 shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold">Revenue per Fasilitas</CardTitle>
                </CardHeader>
                <CardContent>
                  {data.byFacility.length === 0 ? (
                    <p className="text-center text-slate-400 text-sm py-8">Tidak ada data</p>
                  ) : (
                    <div className="space-y-3">
                      {data.byFacility.map((f, i) => {
                        const pct = maxFacRevenue > 0 ? (parseInt(f.revenue) / maxFacRevenue) * 100 : 0;
                        const colors = ["bg-blue-500","bg-emerald-500","bg-violet-500","bg-amber-500","bg-pink-500","bg-red-500"];
                        return (
                          <div key={f.facility_name}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="font-medium text-slate-700 truncate max-w-[60%]">{f.facility_name}</span>
                              <span className="text-slate-500">{f.bookings} booking · {formatCurrency(parseInt(f.revenue))}</span>
                            </div>
                            <div className="w-full bg-slate-100 rounded-full h-2">
                              <div className={`h-2 rounded-full ${colors[i % colors.length]}`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Distribusi Status Booking</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {data.byStatus.map((s) => {
                    const total = data.byStatus.reduce((sum, x) => sum + parseInt(x.cnt), 0);
                    const pct = total > 0 ? Math.round((parseInt(s.cnt) / total) * 100) : 0;
                    return (
                      <div key={s.status} className="flex items-center gap-2 text-sm">
                        <span className={`w-3 h-3 rounded-full ${STATUS_COLOR[s.status] ?? "bg-slate-400"}`} />
                        <span className="text-slate-600">{STATUS_LABEL[s.status] ?? s.status}</span>
                        <span className="font-bold text-slate-800">{s.cnt}</span>
                        <span className="text-slate-400 text-xs">({pct}%)</span>
                      </div>
                    );
                  })}
                </div>
                {data.byStatus.length > 0 && (
                  <div className="mt-4 flex rounded-full overflow-hidden h-4">
                    {data.byStatus.map((s) => {
                      const total = data.byStatus.reduce((sum, x) => sum + parseInt(x.cnt), 0);
                      const pct = total > 0 ? (parseInt(s.cnt) / total) * 100 : 0;
                      return (
                        <div
                          key={s.status}
                          className={`h-full ${STATUS_COLOR[s.status] ?? "bg-slate-400"} transition-all`}
                          style={{ width: `${pct}%` }}
                          title={`${STATUS_LABEL[s.status]}: ${s.cnt}`}
                        />
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </AppShell>
  );
}
