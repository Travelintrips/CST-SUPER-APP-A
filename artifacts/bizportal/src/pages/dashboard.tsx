import { useCallback, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { useGetDashboardSummary, getGetDashboardSummaryQueryKey, getLastResponseTime } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ShoppingCart, DollarSign, Truck, Package, Activity, AlertTriangle, ChevronRight, Ship, ArrowRight, Clock, RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Link } from "wouter";

interface ResponseTimeEntry {
  timestamp: string;
  path: string;
  durationMs: number;
}

const SLOW_THRESHOLD_MS = 500;

async function fetchResponseTimeTrend(): Promise<ResponseTimeEntry[]> {
  const res = await fetch("/api/dashboard/response-times?path=dashboard/summary");
  if (!res.ok) return [];
  const data = (await res.json()) as { entries: ResponseTimeEntry[] };
  return data.entries;
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

  useEffect(() => {
    if (dataUpdatedAt) void refetchRt();
  }, [dataUpdatedAt, refetchRt]);

  const activeFreightCount = summary?.activeFreightCount ?? 0;
  const awaitingQuoteCount = summary?.awaitingQuoteCount ?? 0;
  const inTransitCount = summary?.inTransitCount ?? 0;

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
      </div>
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
