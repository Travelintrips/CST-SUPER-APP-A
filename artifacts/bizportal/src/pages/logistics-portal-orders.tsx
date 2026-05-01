import { useState } from "react";
import { useLocation } from "wouter";
import {
  useListLogisticOrders,
  useUpdateLogisticOrderStatus,
  useCreateSalesDocument,
  getListLogisticOrdersQueryKey,
} from "@workspace/api-client-react";
import type { LogisticOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PackageOpen, Search, RefreshCw, FilePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";

const STATUS_OPTIONS = ["New Order", "Confirmed", "In Progress", "Completed", "Cancelled"];

const STATUS_COLORS: Record<string, string> = {
  "New Order":   "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Confirmed":   "bg-blue-100 text-blue-800 border-blue-200",
  "In Progress": "bg-orange-100 text-orange-800 border-orange-200",
  "Completed":   "bg-green-100 text-green-800 border-green-200",
  "Cancelled":   "bg-red-100 text-red-800 border-red-200",
};

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

export default function LogisticsPortalOrdersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [, navigate] = useLocation();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [soDialog, setSoDialog] = useState<LogisticOrder | null>(null);

  const { data: orders = [], isLoading, refetch } = useListLogisticOrders(
    statusFilter !== "all" ? { status: statusFilter } : undefined,
    { query: { queryKey: [...getListLogisticOrdersQueryKey(), statusFilter] } },
  );

  const updateStatus = useUpdateLogisticOrderStatus();
  const createSalesDoc = useCreateSalesDocument();

  function handleStatusChange(id: number, status: string) {
    setUpdatingId(id);
    updateStatus.mutate(
      { id, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Status diperbarui: ${status}` });
          queryClient.invalidateQueries({ queryKey: getListLogisticOrdersQueryKey() });
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
          navigate("/sales/orders");
        },
        onError: () => toast({ title: "Gagal membuat Sales Order", variant: "destructive" }),
      },
    );
  }

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.companyName.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  });

  const counts = {
    total: orders.length,
    newOrder: orders.filter((o) => o.status === "New Order").length,
    inProgress: orders.filter((o) => o.status === "In Progress").length,
    completed: orders.filter((o) => o.status === "Completed").length,
  };

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <PackageOpen className="h-6 w-6" /> Portal Orders
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pesanan masuk dari customer portal — ubah status atau konversi ke Sales Order
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Total", value: counts.total, color: "text-foreground" },
            { label: "New Order", value: counts.newOrder, color: "text-yellow-700" },
            { label: "In Progress", value: counts.inProgress, color: "text-orange-700" },
            { label: "Completed", value: counts.completed, color: "text-green-700" },
          ].map((s) => (
            <Card key={s.label}>
              <CardHeader className="pb-1 pt-4 px-4">
                <CardTitle className="text-xs text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cari nomor order, nama, perusahaan, email..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-44">
              <SelectValue placeholder="Semua status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Order</TableHead>
                  <TableHead>Pelanggan</TableHead>
                  <TableHead>Rute</TableHead>
                  <TableHead>Tipe</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Memuat...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Tidak ada pesanan
                    </TableCell>
                  </TableRow>
                ) : filtered.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell>
                      <span className="font-mono text-xs font-medium">{o.orderNumber}</span>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{o.customerName}</span>
                        <span className="text-xs text-muted-foreground">{o.companyName}</span>
                        <span className="text-xs text-muted-foreground">{o.email}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{o.origin} → {o.destination}</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{o.shipmentType}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium text-sm">
                      {idr(o.grandTotal)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString("id-ID", {
                        day: "2-digit", month: "short", year: "numeric",
                      })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge className={`${STATUS_COLORS[o.status] ?? "bg-gray-100 text-gray-800"} border text-xs whitespace-nowrap`}>
                          {o.status}
                        </Badge>
                        <Select
                          value={o.status}
                          onValueChange={(v) => handleStatusChange(o.id, v)}
                          disabled={updatingId === o.id}
                        >
                          <SelectTrigger className="h-7 w-32 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 text-xs h-7 whitespace-nowrap"
                          onClick={() => setSoDialog(o)}
                          disabled={o.status === "Cancelled"}
                        >
                          <FilePlus className="h-3.5 w-3.5" />
                          Buat SO
                        </Button>
                        {o.status !== "Completed" && o.status !== "Cancelled" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                            title="Batalkan"
                            disabled={updatingId === o.id}
                            onClick={() => {
                              if (!confirm(`Batalkan order ${o.orderNumber}?`)) return;
                              handleStatusChange(o.id, "Cancelled");
                            }}
                            data-testid={`btn-cancel-${o.id}`}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Create Sales Order Dialog */}
      <Dialog open={!!soDialog} onOpenChange={(open) => { if (!open) setSoDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FilePlus className="h-5 w-5" /> Buat Sales Order
            </DialogTitle>
            <DialogDescription>
              Sales Order akan dibuat dari portal order berikut dan diarahkan ke halaman Sales.
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
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tipe</span>
                  <Badge variant="outline" className="text-xs">{soDialog.shipmentType}</Badge>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="text-muted-foreground font-medium">Total</span>
                  <span className="font-bold text-base">{idr(soDialog.grandTotal)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Sales Order akan dibuat dengan status <strong>Draft</strong> dengan 1 line item berisi total harga portal order ini.
                Anda bisa mengubah detail di halaman Sales setelah dibuat.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSoDialog(null)}>Batal</Button>
            <Button
              onClick={handleCreateSalesOrder}
              disabled={createSalesDoc.isPending}
              className="gap-2"
            >
              <FilePlus className="h-4 w-4" />
              {createSalesDoc.isPending ? "Membuat..." : "Buat Sales Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
