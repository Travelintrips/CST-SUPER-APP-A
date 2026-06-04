import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCompany } from "@/contexts/CompanyContext";
import {
  TrendingUp, TrendingDown, Minus, Search, RefreshCw,
  ShoppingCart, Users, Truck, DollarSign, AlertTriangle,
  ChevronLeft, ChevronRight, Target, BarChart2, Clock,
} from "lucide-react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const idrCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}Jt`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}rb`;
  return String(n);
};

const pct = (n: number, decimals = 1) => `${n.toFixed(decimals)}%`;

function MarginBadge({ pct: p }: { pct: number }) {
  if (p >= 25) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">{p.toFixed(1)}%</Badge>;
  if (p >= 10) return <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px]">{p.toFixed(1)}%</Badge>;
  if (p >= 0) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">{p.toFixed(1)}%</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px]">{p.toFixed(1)}%</Badge>;
}

function WinRateBadge({ rate }: { rate: number }) {
  if (rate >= 60) return <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200 text-[10px]">{rate.toFixed(1)}%</Badge>;
  if (rate >= 35) return <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">{rate.toFixed(1)}%</Badge>;
  return <Badge className="bg-red-100 text-red-800 border-red-200 text-[10px]">{rate.toFixed(1)}%</Badge>;
}

// ─── Types ───────────────────────────────────────────────────────────────────
interface OrderRow {
  id: number; orderNumber: string; customerName: string;
  createdAt: string; status: string; origin: string; destination: string;
  revenue: number; vendorCost: number; margin: number; marginPct: number;
  vendorName: string | null;
}
interface OrdersData { rows: OrderRow[]; total: number; limit: number; offset: number; }

interface CustomerRow {
  customerName: string; orderCount: number;
  revenue: number; outstanding: number; profit: number; profitabilityPct: number;
}

interface VendorRow {
  vendorId: number; vendorName: string; orderCount: number;
  totalSpend: number; winRate: number; totalInvites: number; totalWins: number;
  ontimePct: number; recommendationScore: number; avgResponseMin: number;
}

// ─── Filter bar ──────────────────────────────────────────────────────────────
function FilterBar({
  search, onSearch, dateFrom, dateTo, onDateFrom, onDateTo,
}: {
  search?: string; onSearch?: (v: string) => void;
  dateFrom: string; dateTo: string;
  onDateFrom: (v: string) => void; onDateTo: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 items-center">
      {onSearch !== undefined && (
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm w-52"
            placeholder="Cari order / customer…"
            value={search}
            onChange={e => onSearch(e.target.value)}
          />
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Dari</span>
        <Input type="date" className="h-8 text-xs w-36" value={dateFrom} onChange={e => onDateFrom(e.target.value)} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Sampai</span>
        <Input type="date" className="h-8 text-xs w-36" value={dateTo} onChange={e => onDateTo(e.target.value)} />
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ProfitabilityAnalyticsPage() {
  const { companyId: activeCompanyId } = useCompany();
  const companyParam = activeCompanyId ? `companyId=${activeCompanyId}` : "companyId=all";

  const [tab, setTab] = useState<"orders" | "customers" | "vendors">("orders");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 50;

  // Debounce search
  const handleSearch = useCallback((v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as unknown as { _t: ReturnType<typeof setTimeout> })._t);
    (handleSearch as unknown as { _t: ReturnType<typeof setTimeout> })._t = setTimeout(() => {
      setDebouncedSearch(v);
      setPage(0);
    }, 400);
  }, []);

  const dateParams = [
    dateFrom ? `dateFrom=${dateFrom}` : "",
    dateTo ? `dateTo=${dateTo}` : "",
  ].filter(Boolean).join("&");

  // ── Orders query ──
  const ordersQuery = useQuery<OrdersData>({
    queryKey: ["profit-orders", companyParam, debouncedSearch, dateFrom, dateTo, page],
    queryFn: async () => {
      const params = [companyParam, dateParams, `search=${encodeURIComponent(debouncedSearch)}`, `limit=${PAGE_SIZE}`, `offset=${page * PAGE_SIZE}`].filter(Boolean).join("&");
      const r = await fetch(`/api/analytics/profitability/orders?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat data order");
      return r.json() as Promise<OrdersData>;
    },
    enabled: tab === "orders",
  });

  // ── Customers query ──
  const customersQuery = useQuery<CustomerRow[]>({
    queryKey: ["profit-customers", companyParam, dateFrom, dateTo],
    queryFn: async () => {
      const params = [companyParam, dateParams].filter(Boolean).join("&");
      const r = await fetch(`/api/analytics/profitability/customers?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat data customer");
      return r.json() as Promise<CustomerRow[]>;
    },
    enabled: tab === "customers",
  });

  // ── Vendors query ──
  const vendorsQuery = useQuery<VendorRow[]>({
    queryKey: ["profit-vendors", companyParam, dateFrom, dateTo],
    queryFn: async () => {
      const params = [companyParam, dateParams].filter(Boolean).join("&");
      const r = await fetch(`/api/analytics/profitability/vendors?${params}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat data vendor");
      return r.json() as Promise<VendorRow[]>;
    },
    enabled: tab === "vendors",
  });

  const handleRefresh = () => {
    if (tab === "orders") void ordersQuery.refetch();
    if (tab === "customers") void customersQuery.refetch();
    if (tab === "vendors") void vendorsQuery.refetch();
  };

  const isFetching = ordersQuery.isFetching || customersQuery.isFetching || vendorsQuery.isFetching;

  const thCls = "text-xs font-semibold text-muted-foreground uppercase tracking-wide px-3 py-2 text-left border-b bg-slate-50/80 whitespace-nowrap";
  const tdCls = "px-3 py-2.5 text-sm border-b border-slate-100 align-middle";

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-[1600px] mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <BarChart2 className="h-6 w-6 text-indigo-500" />
              <Link href="/analytics-dashboard"><Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button></Link>

              <h1 className="text-2xl font-bold tracking-tight">Profitability Analytics</h1>
            </div>
            <p className="text-sm text-muted-foreground mt-1">Analisis profitabilitas per order, per customer, dan per vendor</p>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching} className="gap-1.5 h-8 self-start">
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as typeof tab)}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="orders" className="gap-1.5">
                <ShoppingCart className="h-3.5 w-3.5" /> Per Order
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-1.5">
                <Users className="h-3.5 w-3.5" /> Per Customer
              </TabsTrigger>
              <TabsTrigger value="vendors" className="gap-1.5">
                <Truck className="h-3.5 w-3.5" /> Per Vendor
              </TabsTrigger>
            </TabsList>
            <FilterBar
              search={tab === "orders" ? search : undefined}
              onSearch={tab === "orders" ? handleSearch : undefined}
              dateFrom={dateFrom} dateTo={dateTo}
              onDateFrom={v => { setDateFrom(v); setPage(0); }}
              onDateTo={v => { setDateTo(v); setPage(0); }}
            />
          </div>

          {/* ── TAB: Orders ── */}
          <TabsContent value="orders" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ShoppingCart className="h-4 w-4 text-blue-500" />
                  Revenue · Vendor Cost · Margin per Order
                  {ordersQuery.data && (
                    <Badge variant="secondary" className="text-[10px]">{ordersQuery.data.total} order</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={thCls}>No. Order</th>
                        <th className={thCls}>Customer</th>
                        <th className={thCls}>Rute</th>
                        <th className={thCls}>Vendor</th>
                        <th className={thCls}>Tanggal</th>
                        <th className={thCls}>Status</th>
                        <th className={`${thCls} text-right`}>Revenue</th>
                        <th className={`${thCls} text-right`}>Vendor Cost</th>
                        <th className={`${thCls} text-right`}>Margin</th>
                        <th className={`${thCls} text-right`}>Margin %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ordersQuery.isLoading
                        ? [...Array(8)].map((_, i) => (
                          <tr key={i}>
                            {[...Array(10)].map((_, j) => (
                              <td key={j} className={tdCls}><Skeleton className="h-4 w-full" /></td>
                            ))}
                          </tr>
                        ))
                        : (ordersQuery.data?.rows ?? []).length === 0
                        ? (
                          <tr>
                            <td colSpan={10} className="text-center py-10 text-sm text-muted-foreground">
                              Tidak ada data order
                            </td>
                          </tr>
                        )
                        : (ordersQuery.data?.rows ?? []).map(row => (
                          <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                            <td className={tdCls}>
                              <Link href={`/logistics/orders/${row.id}`} className="font-mono text-xs text-blue-600 hover:underline">
                                {row.orderNumber}
                              </Link>
                            </td>
                            <td className={tdCls}>
                              <span className="font-medium">{row.customerName || "—"}</span>
                            </td>
                            <td className={tdCls}>
                              {row.origin && row.destination
                                ? <span className="text-xs text-muted-foreground">{row.origin} → {row.destination}</span>
                                : <span className="text-muted-foreground">—</span>}
                            </td>
                            <td className={tdCls}>
                              <span className="text-xs">{row.vendorName ?? <span className="text-muted-foreground italic">Belum ada</span>}</span>
                            </td>
                            <td className={tdCls}>
                              <span className="text-xs text-muted-foreground">
                                {new Date(row.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "2-digit" })}
                              </span>
                            </td>
                            <td className={tdCls}>
                              <Badge variant="outline" className="text-[10px] whitespace-nowrap">{row.status}</Badge>
                            </td>
                            <td className={`${tdCls} text-right font-medium text-emerald-700`}>{idrCompact(row.revenue)}</td>
                            <td className={`${tdCls} text-right text-slate-600`}>{idrCompact(row.vendorCost)}</td>
                            <td className={`${tdCls} text-right font-semibold ${row.margin < 0 ? "text-red-600" : "text-blue-700"}`}>
                              {idrCompact(row.margin)}
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <MarginBadge pct={row.marginPct} />
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
                {/* Pagination */}
                {ordersQuery.data && ordersQuery.data.total > PAGE_SIZE && (
                  <div className="flex items-center justify-between px-4 py-2 border-t bg-slate-50/50">
                    <span className="text-xs text-muted-foreground">
                      {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, ordersQuery.data.total)} dari {ordersQuery.data.total}
                    </span>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="outline" size="sm" className="h-7 w-7 p-0" disabled={(page + 1) * PAGE_SIZE >= ordersQuery.data.total} onClick={() => setPage(p => p + 1)}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Summary bar */}
            {ordersQuery.data && ordersQuery.data.rows.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  {
                    label: "Total Revenue",
                    value: idr(ordersQuery.data.rows.reduce((s, r) => s + r.revenue, 0)),
                    icon: <DollarSign className="h-4 w-4 text-emerald-600" />,
                    color: "border-l-emerald-500",
                  },
                  {
                    label: "Total Vendor Cost",
                    value: idr(ordersQuery.data.rows.reduce((s, r) => s + r.vendorCost, 0)),
                    icon: <Truck className="h-4 w-4 text-slate-500" />,
                    color: "border-l-slate-400",
                  },
                  {
                    label: "Total Margin",
                    value: idr(ordersQuery.data.rows.reduce((s, r) => s + r.margin, 0)),
                    icon: <TrendingUp className="h-4 w-4 text-blue-600" />,
                    color: "border-l-blue-500",
                  },
                ].map(card => (
                  <Card key={card.label} className={`border-l-4 ${card.color}`}>
                    <CardContent className="flex items-center gap-3 p-3">
                      {card.icon}
                      <div>
                        <div className="text-xs text-muted-foreground">{card.label}</div>
                        <div className="font-semibold text-sm">{card.value}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── TAB: Customers ── */}
          <TabsContent value="customers" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Users className="h-4 w-4 text-violet-500" />
                  Revenue · Outstanding · Profitabilitas per Customer
                  {customersQuery.data && (
                    <Badge variant="secondary" className="text-[10px]">{customersQuery.data.length} customer</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={thCls}>#</th>
                        <th className={thCls}>Customer</th>
                        <th className={`${thCls} text-right`}>Order</th>
                        <th className={`${thCls} text-right`}>Revenue</th>
                        <th className={`${thCls} text-right`}>Outstanding</th>
                        <th className={`${thCls} text-right`}>Profit</th>
                        <th className={`${thCls} text-right`}>Profitabilitas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {customersQuery.isLoading
                        ? [...Array(8)].map((_, i) => (
                          <tr key={i}>
                            {[...Array(7)].map((_, j) => (
                              <td key={j} className={tdCls}><Skeleton className="h-4 w-full" /></td>
                            ))}
                          </tr>
                        ))
                        : (customersQuery.data ?? []).length === 0
                        ? (
                          <tr><td colSpan={7} className="text-center py-10 text-sm text-muted-foreground">Tidak ada data customer</td></tr>
                        )
                        : (customersQuery.data ?? []).map((row, i) => (
                          <tr key={row.customerName} className="hover:bg-slate-50 transition-colors">
                            <td className={`${tdCls} text-xs font-bold text-muted-foreground w-8`}>{i + 1}</td>
                            <td className={tdCls}>
                              <span className="font-medium">{row.customerName}</span>
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <Badge variant="secondary" className="text-[10px]">{row.orderCount}</Badge>
                            </td>
                            <td className={`${tdCls} text-right font-semibold text-emerald-700`}>{idrCompact(row.revenue)}</td>
                            <td className={`${tdCls} text-right`}>
                              {row.outstanding > 0
                                ? <span className="text-amber-600 font-medium flex items-center justify-end gap-1"><AlertTriangle className="h-3 w-3" />{idrCompact(row.outstanding)}</span>
                                : <span className="text-emerald-600 text-xs">Lunas</span>}
                            </td>
                            <td className={`${tdCls} text-right font-semibold ${row.profit < 0 ? "text-red-600" : "text-blue-700"}`}>
                              {idrCompact(row.profit)}
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <MarginBadge pct={row.profitabilityPct} />
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Customer summary */}
            {customersQuery.data && customersQuery.data.length > 0 && (
              <div className="grid grid-cols-4 gap-3 mt-3">
                {[
                  { label: "Total Revenue", value: idr(customersQuery.data.reduce((s, r) => s + r.revenue, 0)), icon: <DollarSign className="h-4 w-4 text-emerald-600" />, color: "border-l-emerald-500" },
                  { label: "Total Outstanding", value: idr(customersQuery.data.reduce((s, r) => s + r.outstanding, 0)), icon: <AlertTriangle className="h-4 w-4 text-amber-500" />, color: "border-l-amber-400" },
                  { label: "Total Profit", value: idr(customersQuery.data.reduce((s, r) => s + r.profit, 0)), icon: <TrendingUp className="h-4 w-4 text-blue-600" />, color: "border-l-blue-500" },
                  {
                    label: "Avg Profitabilitas",
                    value: pct(customersQuery.data.reduce((s, r) => s + r.profitabilityPct, 0) / (customersQuery.data.length || 1)),
                    icon: <Target className="h-4 w-4 text-violet-600" />,
                    color: "border-l-violet-500",
                  },
                ].map(card => (
                  <Card key={card.label} className={`border-l-4 ${card.color}`}>
                    <CardContent className="flex items-center gap-3 p-3">
                      {card.icon}
                      <div>
                        <div className="text-xs text-muted-foreground">{card.label}</div>
                        <div className="font-semibold text-sm">{card.value}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── TAB: Vendors ── */}
          <TabsContent value="vendors" className="mt-4">
            <Card>
              <CardHeader className="py-3 px-4 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Truck className="h-4 w-4 text-indigo-500" />
                  Spend · Win Rate · Performance per Vendor
                  {vendorsQuery.data && (
                    <Badge variant="secondary" className="text-[10px]">{vendorsQuery.data.length} vendor</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr>
                        <th className={thCls}>#</th>
                        <th className={thCls}>Vendor</th>
                        <th className={`${thCls} text-right`}>Order</th>
                        <th className={`${thCls} text-right`}>Total Spend</th>
                        <th className={`${thCls} text-right`}>Win Rate</th>
                        <th className={`${thCls} text-right`}>RFQ (Diundang)</th>
                        <th className={`${thCls} text-right`}>On-Time</th>
                        <th className={`${thCls} text-right`}>Avg Respon</th>
                        <th className={`${thCls} text-right`}>Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendorsQuery.isLoading
                        ? [...Array(8)].map((_, i) => (
                          <tr key={i}>
                            {[...Array(9)].map((_, j) => (
                              <td key={j} className={tdCls}><Skeleton className="h-4 w-full" /></td>
                            ))}
                          </tr>
                        ))
                        : (vendorsQuery.data ?? []).length === 0
                        ? (
                          <tr><td colSpan={9} className="text-center py-10 text-sm text-muted-foreground">Tidak ada data vendor</td></tr>
                        )
                        : (vendorsQuery.data ?? []).map((row, i) => (
                          <tr key={row.vendorId} className="hover:bg-slate-50 transition-colors">
                            <td className={`${tdCls} text-xs font-bold text-muted-foreground w-8`}>{i + 1}</td>
                            <td className={tdCls}>
                              <Link href={`/purchase/vendors/${row.vendorId}`} className="font-medium text-blue-700 hover:underline">
                                {row.vendorName}
                              </Link>
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <Badge variant="secondary" className="text-[10px]">{row.orderCount}</Badge>
                            </td>
                            <td className={`${tdCls} text-right font-semibold text-slate-700`}>{idrCompact(row.totalSpend)}</td>
                            <td className={`${tdCls} text-right`}>
                              <WinRateBadge rate={row.winRate} />
                            </td>
                            <td className={`${tdCls} text-right text-xs text-muted-foreground`}>
                              {row.totalWins}/{row.totalInvites}
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <span className={`text-xs font-medium ${row.ontimePct >= 80 ? "text-emerald-700" : row.ontimePct >= 50 ? "text-amber-600" : "text-red-600"}`}>
                                {pct(row.ontimePct)}
                              </span>
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <span className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                {row.avgResponseMin < 60
                                  ? `${row.avgResponseMin.toFixed(0)}m`
                                  : `${(row.avgResponseMin / 60).toFixed(1)}j`}
                              </span>
                            </td>
                            <td className={`${tdCls} text-right`}>
                              <div className="flex items-center justify-end gap-1.5">
                                <div className="h-1.5 w-16 rounded-full bg-slate-100">
                                  <div
                                    className={`h-1.5 rounded-full ${row.recommendationScore >= 80 ? "bg-emerald-500" : row.recommendationScore >= 60 ? "bg-blue-400" : "bg-amber-400"}`}
                                    style={{ width: `${row.recommendationScore}%` }}
                                  />
                                </div>
                                <span className="text-xs font-semibold w-6 text-right">{row.recommendationScore.toFixed(0)}</span>
                              </div>
                            </td>
                          </tr>
                        ))
                      }
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Vendor summary */}
            {vendorsQuery.data && vendorsQuery.data.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  {
                    label: "Total Spend ke Vendor",
                    value: idr(vendorsQuery.data.reduce((s, r) => s + r.totalSpend, 0)),
                    icon: <DollarSign className="h-4 w-4 text-slate-600" />,
                    color: "border-l-slate-400",
                  },
                  {
                    label: "Avg Win Rate",
                    value: pct(vendorsQuery.data.reduce((s, r) => s + r.winRate, 0) / (vendorsQuery.data.length || 1)),
                    icon: <Target className="h-4 w-4 text-indigo-600" />,
                    color: "border-l-indigo-500",
                  },
                  {
                    label: "Avg On-Time",
                    value: pct(vendorsQuery.data.reduce((s, r) => s + r.ontimePct, 0) / (vendorsQuery.data.length || 1)),
                    icon: <TrendingUp className="h-4 w-4 text-emerald-600" />,
                    color: "border-l-emerald-500",
                  },
                ].map(card => (
                  <Card key={card.label} className={`border-l-4 ${card.color}`}>
                    <CardContent className="flex items-center gap-3 p-3">
                      {card.icon}
                      <div>
                        <div className="text-xs text-muted-foreground">{card.label}</div>
                        <div className="font-semibold text-sm">{card.value}</div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
