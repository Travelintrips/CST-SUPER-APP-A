import { useState, useEffect, useCallback, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, RefreshCw, Ship, Trash2, Eye, Filter, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  useListFreightShipments,
  useDeleteFreightShipment,
  getListFreightShipmentsQueryKey,
} from "@workspace/api-client-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  rfq_sent: "RFQ Dikirim",
  confirmed: "Dikonfirmasi",
  in_transit: "Dalam Perjalanan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  rfq_sent: "bg-amber-500/10 text-amber-500 border-amber-500/20",
  confirmed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  in_transit: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
  completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

const ACTIVE_STATUSES = ["draft", "rfq_sent", "confirmed", "in_transit"];

const FREIGHT_REFRESH_INTERVALS = [
  { label: "30 detik", value: "30" },
  { label: "1 menit", value: "60" },
  { label: "5 menit", value: "300" },
  { label: "Mati", value: "off" },
] as const;

type FreightRefreshValue = "30" | "60" | "300" | "off";

const FREIGHT_REFRESH_LS_KEY = "freight-refresh-interval";

function getInitialRefreshInterval(): FreightRefreshValue {
  try {
    const stored = localStorage.getItem(FREIGHT_REFRESH_LS_KEY);
    if (stored === "30" || stored === "60" || stored === "300" || stored === "off") {
      return stored;
    }
  } catch {}
  return "60";
}

function refetchIntervalMs(value: FreightRefreshValue): number | false {
  if (value === "off") return false;
  return parseInt(value, 10) * 1000;
}

const STATUS_FILTERS: { value: string | null; label: string }[] = [
  { value: null, label: "Semua" },
  { value: "active", label: "Aktif" },
  { value: "draft", label: "Draft" },
  { value: "rfq_sent", label: "RFQ Dikirim" },
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "in_transit", label: "Dalam Perjalanan" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

type DatePreset = "all" | "7days" | "30days" | "custom";

const DATE_PRESETS: DatePreset[] = ["all", "7days", "30days", "custom"];

function parseParamsFromSearch(search: string) {
  const p = new URLSearchParams(search);
  const rawDate = p.get("date") ?? "";
  const from = p.get("from") ?? "";
  const to = p.get("to") ?? "";
  let preset: DatePreset = DATE_PRESETS.includes(rawDate as DatePreset)
    ? (rawDate as DatePreset)
    : "all";
  if (preset === "all" && (from || to)) {
    preset = "custom";
  }
  return {
    status: p.get("status") ?? null,
    preset,
    from,
    to,
  };
}

export default function LogisticsFreightPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, navigate] = useLocation();
  const [refreshInterval, setRefreshInterval] = useState<FreightRefreshValue>(getInitialRefreshInterval);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const wasFetchingRef = useRef(false);

  const handleRefreshIntervalChange = (value: string) => {
    const next = value as FreightRefreshValue;
    setRefreshInterval(next);
    try { localStorage.setItem(FREIGHT_REFRESH_LS_KEY, next); } catch {}
  };

  const {
    data: shipments,
    isLoading,
    isFetching,
    refetch,
  } = useListFreightShipments({ query: { refetchInterval: refetchIntervalMs(refreshInterval) } });

  useEffect(() => {
    if (wasFetchingRef.current && !isFetching) {
      setLastRefreshed(new Date());
    }
    wasFetchingRef.current = isFetching;
  }, [isFetching]);

  const deleteShipment = useDeleteFreightShipment();

  void location;

  const initial = parseParamsFromSearch(window.location.search);

  const [statusFilter, setStatusFilterState] = useState<string | null>(initial.status);
  const [datePreset, setDatePresetState] = useState<DatePreset>(initial.preset);
  const [customDateFrom, setCustomDateFromState] = useState<string>(initial.from);
  const [customDateTo, setCustomDateToState] = useState<string>(initial.to);

  const syncStateFromUrl = useCallback(() => {
    const parsed = parseParamsFromSearch(window.location.search);
    setStatusFilterState(parsed.status);
    setDatePresetState(parsed.preset);
    setCustomDateFromState(parsed.from);
    setCustomDateToState(parsed.to);
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", syncStateFromUrl);
    return () => window.removeEventListener("popstate", syncStateFromUrl);
  }, [syncStateFromUrl]);

  useEffect(() => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (datePreset !== "all") params.set("date", datePreset);
    if (datePreset === "custom" && customDateFrom) params.set("from", customDateFrom);
    if (datePreset === "custom" && customDateTo) params.set("to", customDateTo);
    const qs = params.toString();
    const newUrl = qs ? `/logistics/freight?${qs}` : "/logistics/freight";
    const currentSearch = window.location.search;
    const currentFull = currentSearch ? `/logistics/freight${currentSearch}` : "/logistics/freight";
    if (newUrl !== currentFull) {
      navigate(newUrl, { replace: true });
    }
  }, [statusFilter, datePreset, customDateFrom, customDateTo]);

  const setStatusFilter = (value: string | null) => {
    setStatusFilterState(value);
  };

  const setDatePreset = (preset: DatePreset) => {
    if (preset !== "custom") {
      setCustomDateFromState("");
      setCustomDateToState("");
    }
    setDatePresetState(preset);
  };

  const customFrom = customDateFrom
    ? (() => { const [y, m, d] = customDateFrom.split("-").map(Number); return new Date(y, m - 1, d, 0, 0, 0, 0); })()
    : null;
  const customTo = customDateTo
    ? (() => { const [y, m, d] = customDateTo.split("-").map(Number); return new Date(y, m - 1, d, 23, 59, 59, 999); })()
    : null;
  const isCustomRangeInvalid = !!(customFrom && customTo && customFrom > customTo);

  const filteredShipments = (shipments ?? []).filter((s) => {
    if (statusFilter) {
      if (statusFilter === "active") {
        if (!ACTIVE_STATUSES.includes(s.status)) return false;
      } else {
        if (s.status !== statusFilter) return false;
      }
    }

    if (datePreset === "7days" || datePreset === "30days") {
      const days = datePreset === "7days" ? 7 : 30;
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      cutoff.setHours(0, 0, 0, 0);
      if (new Date(s.createdAt) < cutoff) return false;
    } else if (datePreset === "custom" && !isCustomRangeInvalid) {
      if (customFrom && new Date(s.createdAt) < customFrom) return false;
      if (customTo && new Date(s.createdAt) > customTo) return false;
    }

    return true;
  });

  const getFilterCount = (value: string | null): number => {
    if (!shipments) return 0;
    if (value === null) return shipments.length;
    if (value === "active") return shipments.filter((s) => ACTIVE_STATUSES.includes(s.status)).length;
    return shipments.filter((s) => s.status === value).length;
  };

  const handleDelete = (id: number, shipmentNumber: string) => {
    if (!confirm(`Hapus shipment ${shipmentNumber}?`)) return;
    deleteShipment.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListFreightShipmentsQueryKey() });
          toast({ title: "Berhasil dihapus" });
        },
        onError: () => {
          toast({ title: "Gagal menghapus", variant: "destructive" });
        },
      }
    );
  };

  const isFiltered = statusFilter !== null || datePreset !== "all";

  const clearFilters = () => {
    setStatusFilterState(null);
    setDatePreset("all");
  };

  const activeFilterParts: string[] = [];
  if (statusFilter) {
    const label = STATUS_FILTERS.find((f) => f.value === statusFilter)?.label ?? statusFilter;
    activeFilterParts.push(`Status: ${label}`);
  }
  if (datePreset === "7days") activeFilterParts.push("7 Hari Terakhir");
  else if (datePreset === "30days") activeFilterParts.push("30 Hari Terakhir");
  else if (datePreset === "custom") {
    const parts: string[] = [];
    if (customDateFrom) parts.push(customDateFrom.split("-").reverse().join("/"));
    if (customDateTo) parts.push(customDateTo.split("-").reverse().join("/"));
    activeFilterParts.push(parts.length ? parts.join(" – ") : "Tanggal kustom");
  }

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Freight Forwarding</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={refreshInterval} onValueChange={handleRefreshIntervalChange}>
              <SelectTrigger className="h-8 text-xs w-auto min-w-[110px] gap-1" aria-label="Interval refresh">
                <RefreshCw className={`h-3 w-3 shrink-0 ${isFetching ? "animate-spin" : ""}`} />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREIGHT_REFRESH_INTERVALS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              title="Refresh sekarang"
              aria-label="Refresh daftar shipment freight"
            >
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Link href="/logistics/freight/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Buat Shipment
              </Button>
            </Link>
          </div>
        </div>
        {lastRefreshed && (
          <p className="text-xs text-muted-foreground -mt-4">
            Diperbarui: {lastRefreshed.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        )}

        {isFiltered && (
          <div className="flex items-center gap-2 rounded-md border border-primary/25 bg-primary/5 px-3 py-1.5 text-sm w-fit max-w-full flex-wrap">
            <Filter className="h-3.5 w-3.5 text-primary shrink-0" />
            <span className="text-foreground font-medium">Filter aktif:</span>
            <span className="text-muted-foreground">{activeFilterParts.join(" · ")}</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="ml-auto h-auto py-0 px-1 gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
              aria-label="Hapus semua filter"
            >
              <X className="h-3.5 w-3.5" />
              Hapus filter
            </Button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const isActive = statusFilter === f.value;
            const count = getFilterCount(f.value);
            return (
              <Button
                key={f.value ?? "all"}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
                className="gap-1.5"
              >
                {f.label}
                {isLoading ? (
                  <Skeleton className="h-4 w-5 rounded-full" />
                ) : (
                  <span className={`inline-flex items-center justify-center rounded-full text-xs font-semibold min-w-[1.25rem] px-1 ${isActive ? "bg-white/20 text-inherit" : "bg-muted text-muted-foreground"}`}>
                    {count}
                  </span>
                )}
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={datePreset}
            onValueChange={(v) => setDatePreset(v as DatePreset)}
          >
            <SelectTrigger className="h-8 text-sm w-auto min-w-[160px]">
              <SelectValue placeholder="Semua Waktu" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Waktu</SelectItem>
              <SelectItem value="7days">7 Hari Terakhir</SelectItem>
              <SelectItem value="30days">30 Hari Terakhir</SelectItem>
              <SelectItem value="custom">Kustom</SelectItem>
            </SelectContent>
          </Select>

          {datePreset === "custom" && (
            <>
              <Input
                type="date"
                className={`h-8 text-sm w-auto px-2 ${isCustomRangeInvalid ? "border-destructive" : ""}`}
                value={customDateFrom}
                onChange={(e) => setCustomDateFromState(e.target.value)}
                aria-label="Dari tanggal"
              />
              <span className="text-sm text-muted-foreground">–</span>
              <Input
                type="date"
                className={`h-8 text-sm w-auto px-2 ${isCustomRangeInvalid ? "border-destructive" : ""}`}
                value={customDateTo}
                onChange={(e) => setCustomDateToState(e.target.value)}
                aria-label="Sampai tanggal"
              />
              {isCustomRangeInvalid && (
                <span className="text-xs text-destructive">Tanggal awal harus sebelum tanggal akhir</span>
              )}
            </>
          )}

          {isFiltered && (
            <p className="text-xs text-muted-foreground">
              Menampilkan {filteredShipments.length} shipment
            </p>
          )}
        </div>

        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Shipment</TableHead>
                  <TableHead>Shipper</TableHead>
                  <TableHead>Consignee</TableHead>
                  <TableHead>Komoditi</TableHead>
                  <TableHead>Origin → Destination</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden md:table-cell">Tgl. Dibuat</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : !filteredShipments.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground">
                      {isFiltered
                        ? "Tidak ada shipment dengan filter ini."
                        : "Belum ada freight shipment. Buat shipment pertama Anda."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <div className="font-mono text-sm font-semibold">{s.shipmentNumber}</div>
                        <div className="md:hidden text-xs text-muted-foreground mt-0.5">
                          {new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </TableCell>
                      <TableCell>{s.shipperName}</TableCell>
                      <TableCell>{s.consigneeName}</TableCell>
                      <TableCell>{s.commodity}</TableCell>
                      <TableCell>
                        <span className="text-muted-foreground">{s.origin}</span>
                        <span className="mx-1">→</span>
                        <span>{s.destination}</span>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={STATUS_COLORS[s.status] ?? ""}>
                          {STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-muted-foreground text-sm whitespace-nowrap">
                        {new Date(s.createdAt).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <Link href={`/logistics/freight/${s.id}`}>
                            <Button variant="ghost" size="icon" title="Detail">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </Link>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Hapus"
                            onClick={() => handleDelete(s.id, s.shipmentNumber)}
                            disabled={deleteShipment.isPending}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
