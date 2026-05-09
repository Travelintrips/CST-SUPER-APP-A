import { useState } from "react";
import {
  useListPortalProductOrders,
  useGetPortalProductOrder,
  useUpdatePortalProductOrderStatus,
  getListPortalProductOrdersQueryKey,
} from "@workspace/api-client-react";
import type { PortalProductOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, RefreshCw, Package, Eye, X } from "lucide-react";

const STATUS_OPTIONS = ["New Order", "Confirmed", "Processing", "Shipped", "Completed", "Cancelled"];

const STATUS_COLORS: Record<string, string> = {
  "New Order":   "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Confirmed":   "bg-blue-100 text-blue-800 border-blue-200",
  "Processing":  "bg-orange-100 text-orange-800 border-orange-200",
  "Shipped":     "bg-purple-100 text-purple-800 border-purple-200",
  "Completed":   "bg-green-100 text-green-800 border-green-200",
  "Cancelled":   "bg-red-100 text-red-800 border-red-200",
};

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
function formatTanggal(iso: string) {
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = BULAN_ID[d.getMonth()];
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}-${mon}-${year}, ${hh}:${mm}`;
}

export default function PortalProductOrdersPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailOrder, setDetailOrder] = useState<PortalProductOrder | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const { data: orders = [], isLoading, refetch } = useListPortalProductOrders(
    { status: statusFilter !== "all" ? statusFilter : undefined, search: search || undefined },
    { query: { queryKey: [...getListPortalProductOrdersQueryKey(), statusFilter, search] } },
  );

  const { data: detail } = useGetPortalProductOrder(
    detailOrder?.id ?? 0,
    { query: { enabled: !!detailOrder?.id, queryKey: [`portal-product-order-${detailOrder?.id ?? 0}`] } },
  );

  const updateStatus = useUpdatePortalProductOrderStatus();

  async function handleStatusChange(id: number, status: string) {
    setUpdatingId(id);
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      queryClient.invalidateQueries({ queryKey: getListPortalProductOrdersQueryKey() });
      toast({ title: "Status berhasil diperbarui" });
      if (detailOrder?.id === id) setDetailOrder((prev) => prev ? { ...prev, status } : prev);
    } catch {
      toast({ title: "Gagal memperbarui status", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  }

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  });

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Portal Order Produk</h1>
          <p className="text-muted-foreground text-sm mt-1">Pesanan produk yang masuk dari Customer Portal</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {["New Order", "Confirmed", "Completed", "Cancelled"].map((s) => (
            <Card key={s} className="cursor-pointer hover:border-primary transition-colors" onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s}</p>
                <p className="text-2xl font-bold">{orders.filter((o) => o.status === s).length}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Daftar Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Cari no. order, nama, email..."
                  className="pl-9"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-44">
                  <SelectValue placeholder="Semua Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Memuat...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p>Belum ada pesanan produk</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>No. Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((order) => (
                      <TableRow key={order.id}>
                        <TableCell className="font-mono text-sm font-semibold">{order.orderNumber}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">{order.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{idr(order.grandTotal)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatTanggal(order.createdAt)}</TableCell>
                        <TableCell>
                          <Select
                            value={order.status}
                            onValueChange={(v) => handleStatusChange(order.id, v)}
                            disabled={updatingId === order.id}
                          >
                            <SelectTrigger className="h-7 w-36 text-xs border-0 p-1">
                              <Badge className={`text-xs ${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-700"}`}>
                                {order.status}
                              </Badge>
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.map((s) => (
                                <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setDetailOrder(order)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Detail Dialog */}
      {detailOrder && (
        <Dialog open onOpenChange={() => setDetailOrder(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between">
                <span>Detail Pesanan — {detailOrder.orderNumber}</span>
                <button onClick={() => setDetailOrder(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground text-xs">Customer</p>
                  <p className="font-medium">{detailOrder.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Status</p>
                  <Badge className={`text-xs ${STATUS_COLORS[detailOrder.status] ?? "bg-gray-100"}`}>{detailOrder.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Email</p>
                  <p>{detailOrder.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">WhatsApp</p>
                  <p>{detailOrder.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs">Alamat Pengiriman</p>
                  <p>{detailOrder.shippingAddress}</p>
                </div>
                {detailOrder.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs">Catatan</p>
                    <p>{detailOrder.notes}</p>
                  </div>
                )}
              </div>

              <div>
                <p className="font-semibold mb-2">Item Pesanan</p>
                {detail?.items ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2">Produk</th>
                          <th className="text-center px-3 py-2">Qty</th>
                          <th className="text-right px-3 py-2">Harga</th>
                          <th className="text-right px-3 py-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item) => (
                          <tr key={item.id} className="border-t">
                            <td className="px-3 py-2">
                              <p className="font-medium">{item.productName}</p>
                              {item.productSku && <p className="text-muted-foreground">{item.productSku}</p>}
                            </td>
                            <td className="px-3 py-2 text-center">{item.qty} {item.unit ?? "pcs"}</td>
                            <td className="px-3 py-2 text-right">{idr(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{idr(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50">
                        <tr>
                          <td colSpan={3} className="px-3 py-2 text-right font-bold">Total</td>
                          <td className="px-3 py-2 text-right font-bold text-primary">{idr(detailOrder.grandTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-xs py-4 text-center">Memuat detail...</div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Select
                value={detailOrder.status}
                onValueChange={(v) => handleStatusChange(detailOrder.id, v)}
                disabled={updatingId === detailOrder.id}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => setDetailOrder(null)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
