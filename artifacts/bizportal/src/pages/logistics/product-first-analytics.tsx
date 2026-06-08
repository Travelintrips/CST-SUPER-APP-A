import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, Package, Truck, ShoppingBag, Clock, Percent, RefreshCw,
} from "lucide-react";

const IDR = (n: number | string | null) => {
  const v = Number(n ?? 0);
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1)}M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1)} Jt`;
  if (v >= 1_000) return `Rp ${(v / 1_000).toFixed(0)} Rb`;
  return `Rp ${v.toLocaleString("id-ID")}`;
};

const PCT = (n: number | string | null) => `${Number(n ?? 0).toFixed(1)}%`;
const HRS = (n: number | string | null) => `${Number(n ?? 0).toFixed(1)} jam`;

const MODE_COLORS: Record<string, string> = {
  trucking: "#6366f1",
  pickup_self: "#22c55e",
};

const STATUS_COLORS = [
  "#6366f1","#22c55e","#f59e0b","#ef4444","#3b82f6",
  "#8b5cf6","#ec4899","#14b8a6","#f97316","#84cc16",
];

export default function ProductFirstAnalyticsPage() {
  const today = new Date().toISOString().slice(0, 10);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);

  const [dateFrom, setDateFrom] = useState(ninetyDaysAgo);
  const [dateTo, setDateTo] = useState(today);
  const [filterApplied, setFilterApplied] = useState({ dateFrom: ninetyDaysAgo, dateTo: today });

  const params = new URLSearchParams({ dateFrom: filterApplied.dateFrom, dateTo: filterApplied.dateTo });

  const { data: allData, isLoading, refetch } = useQuery({
    queryKey: ["pf-analytics-all", filterApplied],
    queryFn: () => api.get(`/api/logistic/product-first/analytics/all?${params}`).then((r) => r.data),
  });

  const { data: modeRatio } = useQuery({
    queryKey: ["pf-analytics-mode", filterApplied],
    queryFn: () => api.get(`/api/logistic/product-first/analytics/mode-ratio?${params}`).then((r) => r.data),
  });

  const { data: vendorResp } = useQuery({
    queryKey: ["pf-analytics-vendor", filterApplied],
    queryFn: () => api.get(`/api/logistic/product-first/analytics/vendor-response?${params}`).then((r) => r.data),
  });

  const { data: summary } = useQuery({
    queryKey: ["pf-analytics-summary", filterApplied],
    queryFn: () => api.get(`/api/logistic/product-first/analytics/summary?${params}`).then((r) => r.data),
  });

  const { data: marginData } = useQuery({
    queryKey: ["pf-analytics-margin", filterApplied],
    queryFn: () => api.get(`/api/logistic/product-first/analytics/margin?${params}`).then((r) => r.data),
  });

  const s = allData?.summary ?? {};
  const conv = allData?.conversion ?? {};
  const marginOverall = allData?.margin ?? {};

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-indigo-400" />
            Analytics — Product-First Orders
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Metrik performa, konversi, dan margin untuk alur product-first
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          className="gap-2 border-slate-600 text-slate-300 hover:text-white"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* Date Filter */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Dari Tanggal</Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white h-8 w-40"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-slate-400">Sampai Tanggal</Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white h-8 w-40"
              />
            </div>
            <Button
              size="sm"
              onClick={() => setFilterApplied({ dateFrom, dateTo })}
              className="bg-indigo-600 hover:bg-indigo-500 text-white"
            >
              Terapkan
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading && (
        <div className="text-center text-slate-400 py-12">Memuat data analytics...</div>
      )}

      {!isLoading && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-slate-800/60 border-slate-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Package className="w-3.5 h-3.5" /> Total Orders
                </div>
                <div className="text-2xl font-bold text-white">{s.total ?? 0}</div>
                <div className="flex gap-2 mt-1 text-xs">
                  <span className="text-emerald-400">{s.completed ?? 0} selesai</span>
                  <span className="text-blue-400">{s.active ?? 0} aktif</span>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Clock className="w-3.5 h-3.5" /> Resp. Vendor Produk
                </div>
                <div className="text-2xl font-bold text-white">
                  {allData?.vendorResponseHours != null
                    ? HRS(allData.vendorResponseHours)
                    : "—"}
                </div>
                <div className="text-xs text-slate-400">rata-rata</div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Truck className="w-3.5 h-3.5" /> Konversi Pengiriman
                </div>
                <div className="text-2xl font-bold text-white">
                  {conv.total ? PCT((Number(conv.selected ?? 0) / Number(conv.total)) * 100) : "—"}
                </div>
                <div className="text-xs text-slate-400">
                  {conv.selected ?? 0} dari {conv.total ?? 0} memilih mode
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-800/60 border-slate-700">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 text-slate-400 text-xs mb-1">
                  <Percent className="w-3.5 h-3.5" /> Margin Overall
                </div>
                <div className="text-2xl font-bold text-white">
                  {PCT(marginOverall.overall_margin_pct)}
                </div>
                <div className="text-xs text-slate-400">
                  {IDR(marginOverall.total_gross_margin)} gross
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Row 2: Pie mode ratio + Status bar chart */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mode Ratio Pie */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">
                  Pickup Self vs Trucking
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(modeRatio?.byMode?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={modeRatio.byMode}
                        dataKey="count"
                        nameKey="shipment_mode"
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        label={(e) => `${e.shipment_mode}: ${e.count} (${e.pct}%)`}
                      >
                        {(modeRatio.byMode as any[]).map((entry: any, i: number) => (
                          <Cell key={i} fill={MODE_COLORS[entry.shipment_mode] ?? "#64748b"} />
                        ))}
                      </Pie>
                      <Legend />
                      <Tooltip formatter={(v: any) => [`${v} orders`, ""]} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                    Belum ada data mode pengiriman
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Status distribution bar */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">
                  Distribusi Status
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(summary?.byStatus?.length ?? 0) > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={summary.byStatus} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                      <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                      <YAxis
                        type="category"
                        dataKey="status"
                        width={140}
                        tick={{ fill: "#94a3b8", fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                        labelStyle={{ color: "#e2e8f0" }}
                      />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {(summary.byStatus as any[]).map((_: any, i: number) => (
                          <Cell key={i} fill={STATUS_COLORS[i % STATUS_COLORS.length]} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-40 text-slate-500 text-sm">
                    Belum ada data status
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Vendor response time + Margin by mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Vendor Response Time */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">
                  Waktu Respon Vendor Produk (per Vendor)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(vendorResp?.byVendor?.length ?? 0) > 0 ? (
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                    {(vendorResp.byVendor as any[]).map((v: any, i: number) => (
                      <div key={i} className="flex items-center justify-between text-sm">
                        <span className="text-slate-300 truncate max-w-[55%]">{v.vendor_name}</span>
                        <div className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className="text-xs border-slate-600 text-slate-400"
                          >
                            {v.order_count} orders
                          </Badge>
                          <span className={`font-mono text-xs font-medium ${Number(v.avg_response_hours) <= 24 ? "text-emerald-400" : Number(v.avg_response_hours) <= 48 ? "text-amber-400" : "text-red-400"}`}>
                            {HRS(v.avg_response_hours)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                    Belum ada data respon vendor
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Margin by Mode */}
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">
                  Margin per Mode Pengiriman
                </CardTitle>
              </CardHeader>
              <CardContent>
                {(marginData?.byMode?.length ?? 0) > 0 ? (
                  <div className="space-y-3">
                    {(marginData.byMode as any[]).map((m: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-slate-700/50">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-200 capitalize">
                            {m.shipment_mode === "pickup_self" ? "Pickup Mandiri" : "Trucking"}
                          </span>
                          <Badge
                            className={`text-xs ${Number(m.avg_margin_pct) >= 20 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-400 border-amber-500/30"}`}
                            variant="outline"
                          >
                            {PCT(m.avg_margin_pct)} margin
                          </Badge>
                        </div>
                        <div className="flex gap-4 text-xs text-slate-400">
                          <span>{m.order_count} orders</span>
                          <span>Avg rev: {IDR(m.avg_grand_total)}</span>
                          <span>Gross: {IDR(m.avg_gross_margin)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-32 text-slate-500 text-sm">
                    Belum ada data margin (butuh orders Completed)
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Row 4: Monthly trend */}
          {(summary?.byMonth?.length ?? 0) > 0 && (
            <Card className="bg-slate-800/60 border-slate-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-slate-300 font-medium">
                  Tren Bulanan — Product-First Orders
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={summary.byMonth}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid #334155", borderRadius: 6 }}
                      labelStyle={{ color: "#e2e8f0" }}
                    />
                    <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} name="Jumlah Order" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
