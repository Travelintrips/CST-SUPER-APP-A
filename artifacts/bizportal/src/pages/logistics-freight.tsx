import { AppShell } from "@/components/layout/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, RefreshCw, Ship, Trash2, Eye, X } from "lucide-react";
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

function buildUrl(params: Record<string, string | null>): string {
  const sp = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === "") {
      sp.delete(key);
    } else {
      sp.set(key, value);
    }
  }
  const qs = sp.toString();
  return qs ? `/logistics/freight?${qs}` : "/logistics/freight";
}

export default function LogisticsFreightPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { data: shipments, isLoading } = useListFreightShipments();
  const deleteShipment = useDeleteFreightShipment();

  void location;
  const searchParams = new URLSearchParams(window.location.search);
  const statusFilter = searchParams.get("status") ?? null;
  const fromFilter = searchParams.get("from") ?? "";
  const toFilter = searchParams.get("to") ?? "";

  const setStatusFilter = (value: string | null) => {
    setLocation(buildUrl({ status: value }));
  };

  const setDateFilter = (from: string, to: string) => {
    setLocation(buildUrl({ from: from || null, to: to || null }));
  };

  const clearDateFilter = () => {
    setLocation(buildUrl({ from: null, to: null }));
  };

  const hasDateFilter = fromFilter !== "" || toFilter !== "";

  const filteredShipments = (shipments ?? []).filter((s) => {
    if (statusFilter) {
      if (statusFilter === "active") {
        if (!ACTIVE_STATUSES.includes(s.status)) return false;
      } else {
        if (s.status !== statusFilter) return false;
      }
    }

    if (hasDateFilter) {
      const createdAt = new Date(s.createdAt);
      if (fromFilter) {
        const from = new Date(fromFilter);
        from.setHours(0, 0, 0, 0);
        if (createdAt < from) return false;
      }
      if (toFilter) {
        const to = new Date(toFilter);
        to.setHours(23, 59, 59, 999);
        if (createdAt > to) return false;
      }
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

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ship className="h-6 w-6 text-primary" />
            <h1 className="text-2xl font-bold">Freight Forwarding</h1>
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => queryClient.invalidateQueries({ queryKey: getListFreightShipmentsQueryKey() })}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Link href="/logistics/freight/new">
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Buat Shipment
              </Button>
            </Link>
          </div>
        </div>

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
                <span className={`inline-flex items-center justify-center rounded-full text-xs font-semibold min-w-[1.25rem] px-1 ${isActive ? "bg-white/20 text-inherit" : "bg-muted text-muted-foreground"}`}>
                  {count}
                </span>
              </Button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex items-end gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Dari Tanggal</Label>
              <Input
                type="date"
                value={fromFilter}
                onChange={(e) => setDateFilter(e.target.value, toFilter)}
                className="w-40 h-8 text-sm"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sampai Tanggal</Label>
              <Input
                type="date"
                value={toFilter}
                min={fromFilter || undefined}
                onChange={(e) => setDateFilter(fromFilter, e.target.value)}
                className="w-40 h-8 text-sm"
              />
            </div>
            {hasDateFilter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearDateFilter}
                className="h-8 gap-1 text-muted-foreground"
              >
                <X className="h-3.5 w-3.5" />
                Reset Tanggal
              </Button>
            )}
          </div>
          {(statusFilter || hasDateFilter) && (
            <p className="text-xs text-muted-foreground self-end pb-1">
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
                      {statusFilter || hasDateFilter
                        ? "Tidak ada shipment dengan filter ini."
                        : "Belum ada freight shipment. Buat shipment pertama Anda."}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredShipments.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-sm font-semibold">{s.shipmentNumber}</TableCell>
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
