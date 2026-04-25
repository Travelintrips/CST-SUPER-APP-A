import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Navigation2, RefreshCw, Ship, ArrowRight, Clock, Package, ArrowUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  useListShipments,
  useCreateShipment,
  useUpdateShipmentStatus,
  getListShipmentsQueryKey,
  useListFreightShipments,
} from "@workspace/api-client-react";

const FREIGHT_REFETCH_INTERVAL_MS = 60_000;

export default function LogisticsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const { data: shipments, isLoading } = useListShipments();
  const createShipment = useCreateShipment();
  const updateStatus = useUpdateShipmentStatus();

  const {
    data: freightShipments,
    isLoading: freightLoading,
    isFetching: freightFetching,
    refetch: refetchFreight,
  } = useListFreightShipments({ query: { refetchInterval: FREIGHT_REFETCH_INTERVAL_MS } });

  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const wasFetchingRef = useRef(false);
  useEffect(() => {
    if (wasFetchingRef.current && !freightFetching) {
      setLastRefreshed(new Date());
    }
    wasFetchingRef.current = freightFetching;
  }, [freightFetching]);

  const FREIGHT_STATUS_LABELS: Record<string, string> = {
    draft: "Draft",
    rfq_sent: "RFQ Dikirim",
    confirmed: "Dikonfirmasi",
    in_transit: "Dalam Perjalanan",
    completed: "Selesai",
    cancelled: "Dibatalkan",
  };

  const FREIGHT_STATUS_COLORS: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    rfq_sent: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    confirmed: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    in_transit: "bg-indigo-500/10 text-indigo-500 border-indigo-500/20",
    completed: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  };

  const [freightStatusFilter, setFreightStatusFilter] = useState<string>("all");
  const [freightSortOrder, setFreightSortOrder] = useState<"newest" | "oldest">("newest");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const activeFreight = freightShipments?.filter(
    (s) => s.status !== "cancelled" && s.status !== "completed"
  ) ?? [];
  const awaitingQuote = freightShipments?.filter((s) => s.status === "rfq_sent") ?? [];
  const inTransit = freightShipments?.filter((s) => s.status === "in_transit") ?? [];

  const recentFreightBase = freightStatusFilter === "all"
    ? activeFreight
    : activeFreight.filter((s) => s.status === freightStatusFilter);

  const recentFreight = [...recentFreightBase]
    .sort((a, b) => {
      const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      return freightSortOrder === "newest" ? diff : -diff;
    })
    .slice(0, 5);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 border-amber-500/20';
      case 'picked_up': return 'bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 border-blue-500/20';
      case 'in_transit': return 'bg-indigo-500/10 text-indigo-500 hover:bg-indigo-500/20 border-indigo-500/20';
      case 'out_for_delivery': return 'bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 border-violet-500/20';
      case 'delivered': return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border-emerald-500/20';
      case 'failed': return 'bg-destructive/10 text-destructive hover:bg-destructive/20 border-destructive/20';
      default: return 'bg-muted text-muted-foreground';
    }
  };

  const handleCreateShipment = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    createShipment.mutate({
      data: {
        carrier: formData.get("carrier") as string,
        origin: formData.get("origin") as string,
        destination: formData.get("destination") as string,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        setIsDialogOpen(false);
        toast({ title: "Shipment berhasil dibuat" });
      },
      onError: () => toast({ title: "Gagal membuat shipment", variant: "destructive" })
    });
  };

  const handleStatusChange = (id: number, status: "pending" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed") => {
    updateStatus.mutate({ id, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListShipmentsQueryKey() });
        toast({ title: "Status berhasil diperbarui" });
      },
      onError: () => toast({ title: "Gagal memperbarui status", variant: "destructive" })
    });
  };

  const statuses: Array<"pending" | "picked_up" | "in_transit" | "out_for_delivery" | "delivered" | "failed"> = [
    "pending", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed"
  ];

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Logistik</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1 sm:mt-2">Lacak pengiriman dan kelola operasi armada.</p>
        </div>

        {/* Freight Forwarding Summary Card */}
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
            {freightLoading ? (
              <div className="grid grid-cols-3 gap-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-1">
                    <Skeleton className="h-7 w-10" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <p className="text-2xl font-bold">{activeFreight.length}</p>
                  <p className="text-xs text-muted-foreground">Shipment Aktif</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <p className="text-2xl font-bold text-amber-500">{awaitingQuote.length}</p>
                    {awaitingQuote.length > 0 && (
                      <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">Menunggu Persetujuan Quote</p>
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-bold text-indigo-500">{inTransit.length}</p>
                  <p className="text-xs text-muted-foreground">Dalam Perjalanan</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Active Freight Shipments */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base shrink-0">Shipment Freight Terbaru</CardTitle>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => refetchFreight()}
                  disabled={freightFetching}
                  title="Refresh"
                  aria-label="Refresh daftar shipment freight"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${freightFetching ? "animate-spin" : ""}`} />
                </Button>
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/logistics/freight">
                    Lihat Semua <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
            {lastRefreshed && (
              <p className="text-[11px] text-muted-foreground">
                Diperbarui: {lastRefreshed.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Select value={freightStatusFilter} onValueChange={setFreightStatusFilter}>
                <SelectTrigger className="h-7 text-xs w-auto min-w-[130px]">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="rfq_sent">RFQ Dikirim</SelectItem>
                  <SelectItem value="confirmed">Dikonfirmasi</SelectItem>
                  <SelectItem value="in_transit">Dalam Perjalanan</SelectItem>
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2 gap-1"
                onClick={() => setFreightSortOrder((prev) => prev === "newest" ? "oldest" : "newest")}
              >
                <ArrowUpDown className="h-3 w-3" />
                {freightSortOrder === "newest" ? "Terbaru" : "Terlama"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {freightLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-40 flex-1" />
                    <Skeleton className="h-6 w-24 rounded-full" />
                  </div>
                ))}
              </div>
            ) : recentFreight.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                <Package className="h-8 w-8 opacity-40" />
                <p className="text-sm">
                  {freightStatusFilter === "all"
                    ? "Tidak ada shipment freight aktif."
                    : `Tidak ada shipment dengan status "${FREIGHT_STATUS_LABELS[freightStatusFilter] ?? freightStatusFilter}".`}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Shipment</TableHead>
                    <TableHead className="hidden sm:table-cell">Rute</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentFreight.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/logistics/freight/${s.id}`)}
                    >
                      <TableCell className="font-mono text-sm font-semibold">{s.shipmentNumber}</TableCell>
                      <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                        {s.origin} → {s.destination}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={FREIGHT_STATUS_COLORS[s.status] ?? ""}>
                          {FREIGHT_STATUS_LABELS[s.status] ?? s.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
          <h2 className="text-lg sm:text-xl font-semibold tracking-tight">Daftar Pengiriman</h2>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Buat Pengiriman</Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleCreateShipment}>
                <DialogHeader>
                  <DialogTitle>Pengiriman Baru</DialogTitle>
                  <DialogDescription>Daftarkan pengiriman baru untuk dilacak.</DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <div className="grid gap-2">
                    <Label htmlFor="carrier">Carrier / Ekspedisi</Label>
                    <Input id="carrier" name="carrier" required placeholder="JNE, TIKI, SiCepat..." />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="origin">Asal</Label>
                    <Input id="origin" name="origin" required placeholder="Jakarta" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="destination">Tujuan</Label>
                    <Input id="destination" name="destination" required placeholder="Surabaya" />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={createShipment.isPending}>
                    {createShipment.isPending ? "Membuat..." : "Buat"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card className="hidden md:block">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Resi</TableHead>
                  <TableHead>Carrier</TableHead>
                  <TableHead>Rute</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Aksi</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-[120px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[100px]" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-[100px] rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-8 w-[80px] ml-auto rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : !shipments || shipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <Navigation2 className="h-8 w-8 mb-2 opacity-50" />
                        <p>Belum ada pengiriman aktif.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  shipments.map((shipment) => (
                    <TableRow key={shipment.id}>
                      <TableCell className="font-mono text-sm font-medium">{shipment.trackingNumber}</TableCell>
                      <TableCell>{shipment.carrier}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-muted-foreground">{shipment.origin}</span>
                          <span>-&gt;</span>
                          <span className="font-medium">{shipment.destination}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${getStatusColor(shipment.status)}`}>
                          {shipment.status.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8">
                              <RefreshCw className="mr-2 h-3.5 w-3.5" />
                              Update
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {statuses.map(s => (
                              <DropdownMenuItem key={s} onClick={() => handleStatusChange(shipment.id, s)} className="capitalize">
                                Tandai: {s.replace(/_/g, ' ')}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <div className="md:hidden space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, i) => (
              <Card key={i}><CardContent className="p-4 space-y-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-8 w-full" />
              </CardContent></Card>
            ))
          ) : !shipments || shipments.length === 0 ? (
            <Card><CardContent className="p-8 text-center">
              <Navigation2 className="h-8 w-8 mb-2 opacity-50 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Belum ada pengiriman aktif.</p>
            </CardContent></Card>
          ) : (
            shipments.map((shipment) => (
              <Card key={shipment.id}><CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium truncate">{shipment.trackingNumber}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{shipment.carrier}</p>
                  </div>
                  <Badge variant="outline" className={`capitalize shrink-0 text-xs ${getStatusColor(shipment.status)}`}>
                    {shipment.status.replace(/_/g, ' ')}
                  </Badge>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground truncate">{shipment.origin}</span>
                  <span className="shrink-0">-&gt;</span>
                  <span className="font-medium truncate">{shipment.destination}</span>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full h-9">
                      <RefreshCw className="mr-2 h-3.5 w-3.5" />
                      Update Status
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[calc(100vw-3rem)] sm:w-auto">
                    {statuses.map(s => (
                      <DropdownMenuItem key={s} onClick={() => handleStatusChange(shipment.id, s)} className="capitalize">
                        Tandai: {s.replace(/_/g, ' ')}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent></Card>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
