import { useCallback, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, getLastResponseTime, useListLogisticOrders } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShoppingCart, DollarSign, Truck, Package, Activity, AlertTriangle, ChevronRight, Ship, ArrowRight, Clock, RefreshCw, TrendingUp, TrendingDown, Minus, PackageOpen, ChevronDown, ChevronUp, FilePlus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useUpdateLogisticOrderStatus, useCreateSalesDocument, getListLogisticOrdersQueryKey } from "@workspace/api-client-react";
import type { LogisticOrder } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select as StatusSelect, SelectContent as StatusSelectContent, SelectItem as StatusSelectItem, SelectTrigger as StatusSelectTrigger, SelectValue as StatusSelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";

interface ResponseTimeEntry {
  timestamp: string;
  path: string;
  durationMs: number;
}

interface PathStat {
  path: string;
  count: number;
  minMs: number;
  maxMs: number;
  avgMs: number;
  p95Ms: number;
}

const SLOW_THRESHOLD_MS = 500;

async function fetchResponseTimeTrend(): Promise<ResponseTimeEntry[]> {
  const res = await fetch("/api/dashboard/response-times?path=dashboard/summary");
  if (!res.ok) return [];
  const data = (await res.json()) as { entries: ResponseTimeEntry[] };
  return data.entries;
}

async function fetchResponseTimeStats(): Promise<PathStat[]> {
  const res = await fetch("/api/dashboard/response-time-stats");
  if (!res.ok) return [];
  const data = (await res.json()) as { stats: PathStat[] };
  return data.stats;
}

function rtColor(ms: number): string {
  if (ms < 200) return "text-emerald-500";
  if (ms < 500) return "text-amber-500";
  return "text-destructive";
}

function rtBg(ms: number): string {
  if (ms < 200) return "bg-emerald-500";
  if (ms < 500) return "bg-amber-500";
  return "bg-destructive";
}

const STORAGE_KEY = "dashboard_refresh_interval";

const INTERVAL_OPTIONS = [
  { label: "30 detik", value: "30000" },
  { label: "1 menit", value: "60000" },
  { label: "5 menit", value: "300000" },
  { label: "Mati", value: "off" },
] as const;

type IntervalValue = typeof INTERVAL_OPTIONS[number]["value"];

function getStoredInterval(): IntervalValue {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && INTERVAL_OPTIONS.some((o) => o.value === stored)) {
      return stored as IntervalValue;
    }
  } catch {
    /* ignore */
  }
  return "60000";
}

export default function DashboardPage() {
  const [intervalValue, setIntervalValue] = useState<IntervalValue>(getStoredInterval);

  const refetchInterval = intervalValue === "off" ? false : Number(intervalValue);

  const { data: summary, isLoading, isFetching, refetch, dataUpdatedAt } = useGetDashboardSummary({
    query: {
      queryKey: getGetDashboardSummaryQueryKey(),
      refetchInterval,
    }
  });

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;

  const [responseTime, setResponseTime] = useState<string | null>(null);
  const responseTimeMs = responseTime ? parseFloat(responseTime) : null;
  const responseTimeColor = responseTimeMs === null ? "" : responseTimeMs < 200 ? "text-emerald-500" : responseTimeMs <= 500 ? "text-amber-500" : "text-destructive";

  useEffect(() => {
    if (!dataUpdatedAt) return;
    const rt = getLastResponseTime("/api/dashboard/summary");
    if (rt) setResponseTime(rt);
  }, [dataUpdatedAt]);

  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  useEffect(() => {
    if (intervalValue === "off" || !dataUpdatedAt) {
      setSecondsLeft(null);
      return;
    }
    const intervalMs = Number(intervalValue);
    const tick = () => {
      const remaining = Math.round((dataUpdatedAt + intervalMs - Date.now()) / 1000);
      setSecondsLeft(Math.max(0, remaining));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [dataUpdatedAt, intervalValue]);

  const formatCountdown = (secs: number): string => {
    if (secs <= 0) return "sebentar lagi";
    if (secs < 60) return `${secs}d`;
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return s > 0 ? `${m}m ${s}d` : `${m}m`;
  };

  const handleRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handleIntervalChange = (value: string) => {
    const v = value as IntervalValue;
    setIntervalValue(v);
    try {
      localStorage.setItem(STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  };

  const { data: rtEntries = [], refetch: refetchRt } = useQuery({
    queryKey: ["dashboard-response-times"],
    queryFn: fetchResponseTimeTrend,
  });

  const { data: rtStats = [], refetch: refetchStats } = useQuery({
    queryKey: ["dashboard-response-time-stats"],
    queryFn: fetchResponseTimeStats,
  });

  useEffect(() => {
    if (dataUpdatedAt) { void refetchRt(); void refetchStats(); }
  }, [dataUpdatedAt, refetchRt, refetchStats]);

  const activeFreightCount = summary?.activeFreightCount ?? 0;
  const awaitingQuoteCount = summary?.awaitingQuoteCount ?? 0;
  const inTransitCount = summary?.inTransitCount ?? 0;

  const { data: portalOrders = [], isLoading: portalLoading, refetch: refetchPortal } = useListLogisticOrders(undefined, {
    query: { queryKey: ["dashboard-portal-orders"], refetchInterval },
  });
  const portalNew = portalOrders.filter((o) => o.status === "New Order").length;
  const portalInProgress = portalOrders.filter((o) => o.status === "In Progress").length;
  const portalCompleted = portalOrders.filter((o) => o.status === "Completed").length;

  const [selectedPortalStatus, setSelectedPortalStatus] = useState<string | null>(null);
  const [soDialog, setSoDialog] = useState<LogisticOrder | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateLogisticOrderStatus();
  const createSalesDoc = useCreateSalesDocument();

  const portalDetailOrders = selectedPortalStatus === "all"
    ? [...portalOrders].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    : [...portalOrders]
        .filter((o) => o.status === selectedPortalStatus)
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function handlePortalStatusChange(id: number, status: string) {
    setUpdatingId(id);
    updateStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Status diperbarui: ${status}` });
          queryClient.invalidateQueries({ queryKey: getListLogisticOrdersQueryKey() });
          void refetchPortal();
        },
        onError: () => toast({ title: "Gagal memperbarui status", variant: "destructive" }),
        onSettled: () => setUpdatingId(null),
      },
    );
  }

  function handleCreateSalesOrder() {
    if (!soDialog) return;
    const o = soDialog;
    createSalesDoc.mutate(
      {
        data: {
          kind: "order",
          customerName: o.companyName || o.customerName,
          origin: o.origin,
          destination: o.destination,
          notes: [
            `Ref Portal Order: ${o.orderNumber}`,
            `Tipe: ${o.shipmentType}`,
            o.commodity ? `Komoditi: ${o.commodity}` : null,
            o.cargoDescription ? `Kargo: ${o.cargoDescription}` : null,
            o.notes ?? null,
          ].filter(Boolean).join(" | "),
          lines: [
            {
              name: `Jasa Logistik ${o.shipmentType} — ${o.origin} → ${o.destination}`,
              description: `Portal Order #${o.orderNumber} (${o.customerName})`,
              quantity: 1,
              unitPrice: o.grandTotal,
            },
          ],
        },
      },
      {
        onSuccess: (doc) => {
          toast({ title: "Sales Order berhasil dibuat!", description: doc.docNumber });
          setSoDialog(null);
        },
        onError: () => toast({ title: "Gagal membuat Sales Order", variant: "destructive" }),
      },
    );
  }

  const STATUS_OPTIONS_PORTAL = ["New Order", "Confirmed", "In Progress", "Completed", "Cancelled"];
  const STATUS_COLORS_PORTAL: Record<string, string> = {
    "New Order":   "bg-yellow-100 text-yellow-800 border-yellow-200",
    "Confirmed":   "bg-blue-100 text-blue-800 border-blue-200",
    "In Progress": "bg-orange-100 text-orange-800 border-orange-200",
    "Completed":   "bg-green-100 text-green-800 border-green-200",
    "Cancelled":   "bg-red-100 text-red-800 border-red-200",
  };

  const formatIDR = (value: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('id-ID').format(value);
  };

  const formatLastUpdated = (date: Date) => {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Admin Overview</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Aggregated business metrics across all divisions.</p>
          </div>
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <div className="flex items-center gap-2">
              <Select value={intervalValue} onValueChange={handleIntervalChange}>
                <SelectTrigger
                  className="h-8 w-[120px] text-xs"
                  data-testid="dashboard-refresh-interval-select"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVAL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value} className="text-xs">
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isFetching}
                data-testid="dashboard-refresh-btn"
                className="gap-1.5 h-8"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
                {isFetching ? "Memuat..." : "Refresh"}
              </Button>
            </div>
            {!isLoading && lastUpdated && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Diperbarui: {formatLastUpdated(lastUpdated)}</span>
                {secondsLeft !== null && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className="flex items-center gap-0.5">
                      <Clock className="h-3 w-3" />
                      Refresh dalam {formatCountdown(secondsLeft)}
                    </span>
                  </>
                )}
                {responseTime && (
                  <>
                    <span className="text-muted-foreground/40">·</span>
                    <span className={`flex items-center gap-0.5 ${responseTimeColor}`} title="Waktu respons server">
                      <Activity className="h-3 w-3" />
                      Muat dalam {responseTime}
                    </span>
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* ── Portal Orders — always at the TOP ── */}
        <Card className="border-primary/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageOpen className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Portal Orders</CardTitle>
                {portalNew > 0 && (
                  <Badge className="bg-yellow-100 text-yellow-800 border border-yellow-200 text-xs">
                    {portalNew} baru
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-xs" onClick={() => void refetchPortal()}>
                  <RefreshCw className="h-3 w-3" /> Refresh
                </Button>
                <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                  <Link href="/logistics/portal-orders">
                    Lihat Semua <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
            <CardDescription>Pesanan masuk dari customer portal — klik kartu untuk melihat detail</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* 4 clickable stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { key: "all",         label: "Total",       value: portalOrders.length,  color: "text-foreground",    bg: "bg-slate-50 hover:bg-slate-100",         ring: "ring-slate-300"  },
                { key: "New Order",   label: "New Order",   value: portalNew,             color: "text-yellow-700",    bg: "bg-yellow-50 hover:bg-yellow-100",       ring: "ring-yellow-400" },
                { key: "In Progress", label: "In Progress", value: portalInProgress,      color: "text-orange-700",    bg: "bg-orange-50 hover:bg-orange-100",       ring: "ring-orange-400" },
                { key: "Completed",   label: "Completed",   value: portalCompleted,       color: "text-green-700",     bg: "bg-green-50 hover:bg-green-100",         ring: "ring-green-500"  },
              ].map((s) => {
                const isSelected = selectedPortalStatus === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSelectedPortalStatus(isSelected ? null : s.key)}
                    className={`rounded-xl border-2 p-4 text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
                      ${isSelected ? `${s.bg} ring-2 ${s.ring} border-transparent shadow-md` : `border-border ${s.bg}`}
                    `}
                  >
                    <p className="text-xs text-muted-foreground mb-1 font-medium">{s.label}</p>
                    {portalLoading
                      ? <Skeleton className="h-7 w-10 bg-muted" />
                      : <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                    }
                    <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-0.5">
                      {isSelected
                        ? <><ChevronUp className="h-3 w-3" /> Sembunyikan</>
                        : <><ChevronDown className="h-3 w-3" /> Lihat detail</>
                      }
                    </p>
                  </button>
                );
              })}
            </div>

            {/* Inline detail panel — shown when a card is selected */}
            {selectedPortalStatus && (
              <div className="rounded-xl border border-border overflow-hidden bg-background">
                <div className="px-4 py-2.5 border-b border-border bg-muted/40 flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    {selectedPortalStatus === "all" ? "Semua Portal Order" : `Status: ${selectedPortalStatus}`}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">({portalDetailOrders.length} pesanan)</span>
                  </p>
                  <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => setSelectedPortalStatus(null)}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>

                {portalLoading ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full bg-muted" />)}
                  </div>
                ) : portalDetailOrders.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">
                    Tidak ada pesanan untuk status ini
                  </div>
                ) : (
                  <div className="divide-y divide-border/60">
                    {portalDetailOrders.map((o) => (
                      <div key={o.id} className="px-4 py-3 flex flex-wrap md:flex-nowrap items-start md:items-center gap-3">
                        {/* Order info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs text-muted-foreground">{o.orderNumber}</span>
                            <Badge className={`text-[10px] px-1.5 py-0 border ${STATUS_COLORS_PORTAL[o.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                              {o.status}
                            </Badge>
                          </div>
                          <p className="text-sm font-medium truncate mt-0.5">{o.customerName}
                            {o.companyName ? <span className="text-muted-foreground font-normal"> · {o.companyName}</span> : null}
                          </p>
                          <p className="text-xs text-muted-foreground truncate">{o.origin} → {o.destination} · {o.shipmentType}</p>
                        </div>

                        {/* Amount + date */}
                        <div className="text-right shrink-0 hidden sm:block">
                          <p className="text-sm font-semibold">
                            {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(o.grandTotal)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(o.createdAt).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                          </p>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <StatusSelect
                            value={o.status}
                            onValueChange={(v) => handlePortalStatusChange(o.id, v)}
                            disabled={updatingId === o.id}
                          >
                            <StatusSelectTrigger className="h-7 w-32 text-xs">
                              <StatusSelectValue />
                            </StatusSelectTrigger>
                            <StatusSelectContent>
                              {STATUS_OPTIONS_PORTAL.map((s) => (
                                <StatusSelectItem key={s} value={s} className="text-xs">{s}</StatusSelectItem>
                              ))}
                            </StatusSelectContent>
                          </StatusSelect>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-xs h-7 whitespace-nowrap"
                            onClick={() => setSoDialog(o)}
                            disabled={o.status === "Cancelled"}
                          >
                            <FilePlus className="h-3.5 w-3.5" /> Buat SO
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-3">
          <StatCard
            title="Total Revenue"
            href="/ecommerce?tab=orders"
            icon={<DollarSign className="h-4 w-4 text-emerald-500" />}
            isLoading={isLoading}
            value={formatIDR(summary?.totalRevenue || 0)}
            testId="stat-revenue"
          />

          <StatCard
            title="Total Orders"
            href="/ecommerce?tab=orders"
            icon={<ShoppingCart className="h-4 w-4 text-blue-500" />}
            isLoading={isLoading}
            value={formatNumber(summary?.totalOrders || 0)}
            testId="stat-orders"
          />

          <StatCard
            title="Total Shipments"
            href="/logistics"
            icon={<Truck className="h-4 w-4 text-indigo-500" />}
            isLoading={isLoading}
            value={formatNumber(summary?.totalShipments || 0)}
            testId="stat-shipments"
          />

          <StatCard
            title="Stock Value"
            href="/trading"
            icon={<Package className="h-4 w-4 text-violet-500" />}
            isLoading={isLoading}
            value={formatIDR(summary?.totalStockValue || 0)}
            testId="stat-stock-value"
          />

          <StatCard
            title="Today's Transactions"
            href="/pos"
            icon={<Activity className="h-4 w-4 text-amber-500" />}
            isLoading={isLoading}
            value={formatNumber(summary?.todayTransactions || 0)}
            testId="stat-today-tx"
          />

          <StatCard
            title="Low Stock Alerts"
            href="/trading"
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            isLoading={isLoading}
            value={formatNumber(summary?.lowStockCount || 0)}
            valueClassName="text-destructive"
            titleClassName="text-destructive"
            testId="stat-low-stock"
          />
        </div>

        {/* Freight Forwarding Mini-Card */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ship className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Freight Forwarding</CardTitle>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/logistics/freight">
                  Lihat Semua <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
            <CardDescription>Ringkasan pengiriman freight internasional aktif</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-7 w-10 bg-muted" />
                    <Skeleton className="h-4 w-24 bg-muted" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <Link href="/logistics/freight?status=active" className="group block rounded-lg p-2 -m-2 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="space-y-1">
                    <p className="text-2xl font-bold">{activeFreightCount}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Shipment Aktif</p>
                  </div>
                </Link>
                <Link href="/logistics/freight?status=rfq_sent" className="group block rounded-lg p-2 -m-2 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-2xl font-bold text-amber-500">{awaitingQuoteCount}</p>
                      {awaitingQuoteCount > 0 && (
                        <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Menunggu Persetujuan Quote</p>
                  </div>
                </Link>
                <Link href="/logistics/freight?status=in_transit" className="group block rounded-lg p-2 -m-2 transition-colors hover:bg-accent/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <div className="space-y-1">
                    <p className="text-2xl font-bold text-indigo-500">{inTransitCount}</p>
                    <p className="text-xs text-muted-foreground group-hover:text-foreground transition-colors">Dalam Perjalanan</p>
                  </div>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {rtEntries.length > 0 && (
          <ResponseTimeTrendCard entries={rtEntries} />
        )}
        {rtStats.length > 0 && (
          <ResponseTimeStatsCard stats={rtStats} />
        )}
      </div>

      {/* Create Sales Order Dialog */}
      <Dialog open={!!soDialog} onOpenChange={(open) => { if (!open) setSoDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5" /> Buat Sales Order
            </DialogTitle>
            <DialogDescription>
              Sales Order akan dibuat dari portal order berikut.
            </DialogDescription>
          </DialogHeader>
          {soDialog && (
            <div className="space-y-3 py-2">
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">No. Order</span>
                  <span className="font-mono font-medium">{soDialog.orderNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pelanggan</span>
                  <span className="font-medium">{soDialog.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Perusahaan</span>
                  <span>{soDialog.companyName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Rute</span>
                  <span>{soDialog.origin} → {soDialog.destination}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-1">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-bold text-base">
                    {new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(soDialog.grandTotal)}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sales Order akan dibuat dengan status <strong>Draft</strong>. Anda bisa mengubah detail di halaman Sales setelah dibuat.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoDialog(null)}>Batal</Button>
            <Button onClick={handleCreateSalesOrder} disabled={createSalesDoc.isPending} className="gap-2">
              <FilePlus className="h-4 w-4" />
              {createSalesDoc.isPending ? "Membuat..." : "Buat Sales Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

interface StatCardProps {
  title: string;
  href: string;
  icon: React.ReactNode;
  isLoading: boolean;
  value: string;
  valueClassName?: string;
  titleClassName?: string;
  testId?: string;
}

function StatCard({ title, href, icon, isLoading, value, valueClassName, titleClassName, testId }: StatCardProps) {
  return (
    <Link href={href} data-testid={testId} className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      <Card className="bg-card border-border transition-all hover:border-primary/50 hover:shadow-md group-hover:bg-accent/40 cursor-pointer h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className={`text-sm font-medium ${titleClassName ?? ""}`}>{title}</CardTitle>
          <div className="flex items-center gap-1">
            {icon}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-7 w-[80px] bg-muted" />
          ) : (
            <div className={`text-xl sm:text-2xl font-bold truncate ${valueClassName ?? ""}`}>{value}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

function ResponseTimeStatsCard({ stats }: { stats: PathStat[] }) {
  if (!stats.length) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">Statistik Performa per Endpoint</CardTitle>
        </div>
        <CardDescription className="text-xs">Min / Avg / p95 / Max dari histori terakhir</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border/50 text-muted-foreground">
                <th className="text-left pb-1.5 font-medium pr-4">Endpoint</th>
                <th className="text-right pb-1.5 font-medium pr-3 tabular-nums">N</th>
                <th className="text-right pb-1.5 font-medium pr-3 tabular-nums">Min</th>
                <th className="text-right pb-1.5 font-medium pr-3 tabular-nums">Avg</th>
                <th className="text-right pb-1.5 font-medium pr-3 tabular-nums">p95</th>
                <th className="text-right pb-1.5 font-medium tabular-nums">Max</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {stats.map((s) => (
                <tr key={s.path}>
                  <td className="py-1.5 pr-4 font-mono text-[10px] text-muted-foreground truncate max-w-[160px]" title={s.path}>
                    {s.path.replace(/^\/api\//, "")}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums text-muted-foreground">{s.count}</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${rtColor(s.minMs)}`}>{s.minMs}ms</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${rtColor(s.avgMs)}`}>{s.avgMs}ms</td>
                  <td className={`py-1.5 pr-3 text-right tabular-nums font-medium ${rtColor(s.p95Ms)}`}>{s.p95Ms}ms</td>
                  <td className={`py-1.5 text-right tabular-nums font-medium ${rtColor(s.maxMs)}`}>{s.maxMs}ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function ResponseTimeTrendCard({ entries }: { entries: ResponseTimeEntry[] }) {
  const last20 = entries.slice(-20);
  const avg = last20.reduce((s, e) => s + e.durationMs, 0) / last20.length;
  const firstHalf = last20.slice(0, Math.floor(last20.length / 2));
  const secondHalf = last20.slice(Math.floor(last20.length / 2));
  const avgFirst = firstHalf.length ? firstHalf.reduce((s, e) => s + e.durationMs, 0) / firstHalf.length : avg;
  const avgSecond = secondHalf.length ? secondHalf.reduce((s, e) => s + e.durationMs, 0) / secondHalf.length : avg;
  const trendDiff = avgSecond - avgFirst;
  const TrendIcon = Math.abs(trendDiff) < 20 ? Minus : trendDiff > 0 ? TrendingUp : TrendingDown;
  const trendColor = Math.abs(trendDiff) < 20 ? "text-muted-foreground" : trendDiff > 0 ? "text-destructive" : "text-emerald-500";
  const maxMs = Math.max(...last20.map((e) => e.durationMs), 1);
  const hasSlow = last20.some((e) => e.durationMs >= SLOW_THRESHOLD_MS);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium">Tren Waktu Respons API</CardTitle>
          </div>
          <div className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {Math.abs(trendDiff) < 20 ? "Stabil" : trendDiff > 0 ? "Melambat" : "Membaik"}
          </div>
        </div>
        <CardDescription className="text-xs">
          {last20.length} permintaan terakhir · rata-rata{" "}
          <span className={`font-medium ${rtColor(avg)}`}>{avg.toFixed(0)}ms</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {hasSlow && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Ada respons yang melebihi {SLOW_THRESHOLD_MS}ms. Periksa performa server.
          </div>
        )}
        <div className="flex items-end gap-0.5 h-12">
          {last20.map((e, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm opacity-80 hover:opacity-100 transition-opacity ${rtBg(e.durationMs)}`}
              style={{ height: `${Math.max(4, (e.durationMs / maxMs) * 100)}%` }}
              title={`${new Date(e.timestamp).toLocaleTimeString("id-ID")}: ${e.durationMs.toFixed(1)}ms`}
            />
          ))}
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" />{"< 200ms"}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-amber-500" />200–499ms</span>
          <span className="flex items-center gap-1"><span className="inline-block h-2 w-2 rounded-sm bg-destructive" />{"≥ 500ms"}</span>
        </div>
        <div className="space-y-1 max-h-36 overflow-y-auto">
          {[...last20].reverse().slice(0, 10).map((e, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-0.5">
              <span className="text-muted-foreground tabular-nums">
                {new Date(e.timestamp).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
              <span className={`font-medium tabular-nums ${rtColor(e.durationMs)}`}>
                {e.durationMs.toFixed(1)}ms
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
