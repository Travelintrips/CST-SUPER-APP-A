import { useState, useCallback } from "react";
import {
  useListPortalProductOrders,
  useGetPortalProductOrder,
  useUpdatePortalProductOrderStatus,
  useDeletePortalProductOrder,
  useLinkPortalProductOrderItem,
  useListPortalProducts,
  getListPortalProductOrdersQueryKey,
  getGetPortalProductOrderQueryOptions,
} from "@workspace/api-client-react";
import type { PortalProductOrder } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrefetchOnHover } from "@/hooks/use-prefetch-on-hover";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, RefreshCw, Package, Trash2 } from "lucide-react";

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
  return `${String(d.getDate()).padStart(2,"0")}-${BULAN_ID[d.getMonth()]}-${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

export default function PortalProductOrdersPage() {
  const queryClient = useQueryClient();
  const prefetchHover = usePrefetchOnHover();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailOrderId, setDetailOrderId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [linkingItemId, setLinkingItemId] = useState<number | null>(null);

  const { data: orders = [], isLoading, refetch } = useListPortalProductOrders(
    { status: statusFilter !== "all" ? statusFilter : undefined, search: search || undefined },
    { query: { queryKey: [...getListPortalProductOrdersQueryKey(), statusFilter, search] } },
  );

  const { data: detail, refetch: refetchDetail } = useGetPortalProductOrder(
    detailOrderId ?? 0,
    { query: { enabled: !!detailOrderId, queryKey: [`portal-product-order-${detailOrderId ?? 0}`] } },
  );

  const { data: masterProducts = [] } = useListPortalProducts(
    {},
    { query: { queryKey: ["listPortalProductsAdmin"], staleTime: 60_000 } },
  );

  const updateStatus = useUpdatePortalProductOrderStatus();
  const deleteMut = useDeletePortalProductOrder();
  const linkItem = useLinkPortalProductOrderItem();

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: getListPortalProductOrdersQueryKey() });
  }, [queryClient]);

  const filtered = orders.filter((o) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      o.orderNumber.toLowerCase().includes(q) ||
      o.customerName.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q)
    );
  });

  const allSelected = filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((o) => o.id)));
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  async function handleStatusChange(id: number, status: string) {
    setUpdatingId(id);
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      invalidate();
      toast({ title: "Status berhasil diperbarui" });
      if (detailOrderId === id) queryClient.invalidateQueries({ queryKey: [`portal-product-order-${id}`] });
    } catch {
      toast({ title: "Gagal memperbarui status", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus pesanan ini? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await deleteMut.mutateAsync({ id });
      invalidate();
      if (detailOrderId === id) setDetailOrderId(null);
      toast({ title: "Pesanan berhasil dihapus" });
    } catch {
      toast({ title: "Gagal menghapus pesanan", variant: "destructive" });
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} pesanan terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
    setBulkDeleting(true);
    let success = 0; let failed = 0;
    for (const id of selectedIds) {
      try { await deleteMut.mutateAsync({ id }); success++; }
      catch { failed++; }
    }
    setBulkDeleting(false);
    setSelectedIds(new Set());
    invalidate();
    if (failed === 0) toast({ title: `${success} pesanan berhasil dihapus` });
    else toast({ title: `${success} berhasil, ${failed} gagal`, variant: "destructive" });
  }

  async function handleLinkItem(itemId: number, productId: number) {
    setLinkingItemId(itemId);
    try {
      await linkItem.mutateAsync({ itemId, data: { productId } });
      queryClient.invalidateQueries({ queryKey: [`portal-product-order-${detailOrderId ?? 0}`] });
      refetchDetail();
      toast({ title: "Master item berhasil diperbarui" });
    } catch {
      toast({ title: "Gagal memperbarui master item", variant: "destructive" });
    } finally {
      setLinkingItemId(null);
    }
  }

  const detailOrder = orders.find((o) => o.id === detailOrderId) ?? null;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Portal Order Produk</h1>
          <p className="text-muted-foreground text-sm mt-1">Pesanan produk yang masuk dari Customer Portal</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {(["New Order", "Confirmed", "Completed", "Cancelled"] as const).map((s) => (
            <Card
              key={s}
              className={`cursor-pointer hover:border-primary transition-colors ${statusFilter === s ? "border-primary bg-primary/5" : ""}`}
              onClick={() => setStatusFilter(s === statusFilter ? "all" : s)}
            >
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">{s}</p>
                <p className="text-2xl font-bold">{orders.filter((o) => o.status === s).length}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-primary/10 border border-primary/20 rounded-lg">
            <span className="text-sm font-medium">{selectedIds.size} dipilih</span>
            <Button size="sm" variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              {bulkDeleting ? "Menghapus..." : "Hapus Terpilih"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>Batal</Button>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="w-5 h-5" />
              Daftar Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent>
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
                      <TableHead className="w-10">
                        <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Pilih semua" />
                      </TableHead>
                      <TableHead>No. Order</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((order) => (
                      <TableRow
                        key={order.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setDetailOrderId(order.id)}
                        {...prefetchHover(getGetPortalProductOrderQueryOptions(order.id))}
                      >
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onCheckedChange={() => toggleSelect(order.id)}
                            aria-label={`Pilih ${order.orderNumber}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm font-semibold">{order.orderNumber}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{order.customerName}</p>
                            <p className="text-xs text-muted-foreground">{order.email}</p>
                          </div>
                        </TableCell>
                        <TableCell className="font-semibold">{idr(order.grandTotal)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{formatTanggal(order.createdAt)}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
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
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                            title="Hapus"
                            onClick={() => handleDelete(order.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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
      {detailOrderId && detailOrder && (
        <Dialog open onOpenChange={() => setDetailOrderId(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Detail Pesanan — {detailOrder.orderNumber}</DialogTitle>
            </DialogHeader>

            <div className="space-y-5 text-sm">
              {/* Info Customer */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Customer</p>
                  <p className="font-medium">{detailOrder.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Status</p>
                  <Badge className={`text-xs ${STATUS_COLORS[detailOrder.status] ?? "bg-gray-100"}`}>{detailOrder.status}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">Email</p>
                  <p>{detailOrder.email}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs mb-0.5">WhatsApp</p>
                  <p>{detailOrder.phone}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-muted-foreground text-xs mb-0.5">Alamat Pengiriman</p>
                  <p>{detailOrder.shippingAddress}</p>
                </div>
                {detailOrder.notes && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground text-xs mb-0.5">Catatan</p>
                    <p>{detailOrder.notes}</p>
                  </div>
                )}
              </div>

              {/* Item Table */}
              <div>
                <p className="font-semibold mb-2">Item Pesanan</p>
                {detail?.items ? (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left px-3 py-2">Produk (dari Portal)</th>
                          <th className="text-left px-3 py-2 w-48">Master Item</th>
                          <th className="text-center px-3 py-2 w-16">Qty</th>
                          <th className="text-right px-3 py-2 w-28">Harga</th>
                          <th className="text-right px-3 py-2 w-28">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item) => (
                          <tr key={item.id} className="border-t align-top">
                            <td className="px-3 py-2">
                              <p className="font-medium">{item.productName}</p>
                              {item.productSku && <p className="text-muted-foreground">{item.productSku}</p>}
                            </td>
                            <td className="px-3 py-2">
                              <Select
                                value={item.productId?.toString() ?? ""}
                                onValueChange={(v) => handleLinkItem(item.id, parseInt(v, 10))}
                                disabled={linkingItemId === item.id}
                              >
                                <SelectTrigger className="h-7 text-xs w-full">
                                  <SelectValue placeholder="Pilih master item..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {masterProducts.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()} className="text-xs">
                                      {p.name} {p.sku ? `(${p.sku})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              {item.productId && (
                                <p className="text-[10px] text-green-600 mt-0.5">✓ Terhubung ke master</p>
                              )}
                              {!item.productId && (
                                <p className="text-[10px] text-amber-500 mt-0.5">⚠ Belum terhubung</p>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">{item.qty} {item.unit ?? "pcs"}</td>
                            <td className="px-3 py-2 text-right">{idr(item.unitPrice)}</td>
                            <td className="px-3 py-2 text-right font-semibold">{idr(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-muted/50">
                        <tr>
                          <td colSpan={4} className="px-3 py-2 text-right font-bold">Total</td>
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

            <DialogFooter className="flex-col sm:flex-row gap-2">
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
              <Button
                variant="destructive"
                size="sm"
                onClick={() => { handleDelete(detailOrder.id); }}
              >
                <Trash2 className="h-4 w-4 mr-1.5" />
                Hapus Pesanan
              </Button>
              <Button variant="outline" onClick={() => setDetailOrderId(null)}>Tutup</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
