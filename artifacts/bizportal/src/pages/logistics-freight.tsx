import { AppShell } from "@/components/layout/AppShell";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, RefreshCw, Ship, Trash2, Eye } from "lucide-react";
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

export default function LogisticsFreightPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const { data: shipments, isLoading } = useListFreightShipments();
  const deleteShipment = useDeleteFreightShipment();

  void location;
  const searchParams = new URLSearchParams(window.location.search);
  const statusFilter = searchParams.get("status") ?? null;

  const setStatusFilter = (value: string | null) => {
    if (value === null) {
      setLocation("/logistics/freight");
    } else {
      setLocation(`/logistics/freight?status=${value}`);
    }
  };

  const filteredShipments = shipments?.filter((s) => {
    if (!statusFilter) return true;
    if (statusFilter === "active") return ACTIVE_STATUSES.includes(s.status);
    return s.status === statusFilter;
  }) ?? [];

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
            return (
              <Button
                key={f.value ?? "all"}
                variant={isActive ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(f.value)}
              >
                {f.label}
              </Button>
            );
          })}
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
                  <TableHead>Tanggal</TableHead>
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
                      {statusFilter
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
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(s.createdAt).toLocaleDateString("id-ID")}
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
