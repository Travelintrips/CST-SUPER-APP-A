import { useState, useCallback } from "react";
import { CATEGORY_LABELS } from "@workspace/product-templates";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Search, RefreshCw, Package, Trash2, CheckCircle2, Circle,
  Clock, Truck, XCircle, ChevronRight, AlertTriangle, User,
  Mail, Phone, MapPin, StickyNote, Loader2, Tag, FileText,
  ClipboardList, Wrench,
} from "lucide-react";
import { getTemplate } from "@/lib/productTemplates";

/* ─────────────────────────────────────────────── constants ─── */

const STATUS_OPTIONS = ["New Order", "Confirmed", "Processing", "Shipped", "Completed", "Cancelled"] as const;
type OrderStatus = typeof STATUS_OPTIONS[number];

const STATUS_FLOW: OrderStatus[] = ["New Order", "Confirmed", "Processing", "Shipped", "Completed"];

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  "New Order":  "Confirmed",
  "Confirmed":  "Processing",
  "Processing": "Shipped",
  "Shipped":    "Completed",
};

const NEXT_LABEL: Partial<Record<OrderStatus, string>> = {
  "New Order":  "Konfirmasi Order",
  "Confirmed":  "Mulai Proses",
  "Processing": "Tandai Dikirim",
  "Shipped":    "Selesaikan",
};

const STATUS_COLORS: Record<OrderStatus, string> = {
  "New Order":  "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Confirmed":  "bg-blue-100 text-blue-800 border-blue-200",
  "Processing": "bg-orange-100 text-orange-800 border-orange-200",
  "Shipped":    "bg-purple-100 text-purple-800 border-purple-200",
  "Completed":  "bg-green-100 text-green-800 border-green-200",
  "Cancelled":  "bg-red-100 text-red-800 border-red-200",
};

const STATUS_ICONS: Record<OrderStatus, React.ReactNode> = {
  "New Order":  <Clock className="w-3.5 h-3.5" />,
  "Confirmed":  <CheckCircle2 className="w-3.5 h-3.5" />,
  "Processing": <Loader2 className="w-3.5 h-3.5" />,
  "Shipped":    <Truck className="w-3.5 h-3.5" />,
  "Completed":  <CheckCircle2 className="w-3.5 h-3.5" />,
  "Cancelled":  <XCircle className="w-3.5 h-3.5" />,
};

const STATS_LIST: { status: OrderStatus; label: string }[] = [
  { status: "New Order",  label: "Pesanan Baru" },
  { status: "Confirmed",  label: "Dikonfirmasi" },
  { status: "Processing", label: "Diproses" },
  { status: "Shipped",    label: "Dikirim" },
  { status: "Completed",  label: "Selesai" },
  { status: "Cancelled",  label: "Dibatalkan" },
];


const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const BULAN_ID = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
function formatTanggal(iso: string) {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")} ${BULAN_ID[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
}

/* ─────────────────────────────────────────────── StatusTimeline ─── */

function StatusTimeline({ status }: { status: string }) {
  const isCancelled = status === "Cancelled";
  const currentIdx = STATUS_FLOW.indexOf(status as OrderStatus);

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 px-1 py-3">
        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
        <span className="text-sm font-medium text-red-600">Pesanan Dibatalkan</span>
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="absolute top-[18px] left-[18px] right-[18px] h-0.5 bg-muted" />
      <div className="flex justify-between relative">
        {STATUS_FLOW.map((s, idx) => {
          const done = idx < currentIdx;
          const active = idx === currentIdx;
          return (
            <div key={s} className="flex flex-col items-center gap-1.5 flex-1">
              <div
                className={`w-9 h-9 rounded-full border-2 flex items-center justify-center z-10 transition-all ${
                  done   ? "bg-primary border-primary text-primary-foreground shadow-sm" :
                  active ? "bg-primary/10 border-primary text-primary shadow-sm ring-2 ring-primary/20" :
                           "bg-background border-muted-foreground/30 text-muted-foreground/40"
                }`}
              >
                {done ? <CheckCircle2 className="w-4 h-4" /> : active ? <Circle className="w-4 h-4 fill-primary/30" /> : <Circle className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] text-center leading-tight max-w-[60px] ${done || active ? "font-semibold text-foreground" : "text-muted-foreground"}`}>
                {s === "New Order" ? "Pesanan\nBaru" :
                 s === "Confirmed" ? "Konfirmasi" :
                 s === "Processing" ? "Diproses" :
                 s === "Shipped" ? "Dikirim" : "Selesai"}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── QuickActions ─── */

function QuickActions({ order, updating, onStatus }: { order: PortalProductOrder; updating: boolean; onStatus: (status: string) => void }) {
  const status = order.status as OrderStatus;
  const next = NEXT_STATUS[status];
  const nextLabel = NEXT_LABEL[status];
  const canCancel = status !== "Completed" && status !== "Cancelled";

  if (status === "Completed") {
    return <div className="flex items-center gap-2 text-sm text-green-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Pesanan telah selesai</div>;
  }
  if (status === "Cancelled") {
    return <Button variant="outline" size="sm" disabled={updating} onClick={() => onStatus("New Order")}>Aktifkan Kembali</Button>;
  }
  return (
    <div className="flex flex-wrap gap-2">
      {next && nextLabel && (
        <Button size="sm" disabled={updating} onClick={() => onStatus(next)} className="gap-1.5">
          {updating ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
          {nextLabel}
        </Button>
      )}
      {canCancel && (
        <Button size="sm" variant="outline" disabled={updating}
          onClick={() => { if (confirm(`Batalkan pesanan ${order.orderNumber}?`)) onStatus("Cancelled"); }}
          className="gap-1.5 text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/5"
        >
          <XCircle className="w-4 h-4" /> Batalkan
        </Button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────── TemplateDataPanel ─── */

function TemplateDataPanel({ order }: { order: PortalProductOrder & {
  productCategory?: string | null;
  templateVersion?: string | null;
  customFieldValues?: Record<string, string | number | boolean>;
  uploadedDocuments?: { key: string; label: string; reference: string }[];
  checklistStatus?: Record<string, boolean>;
  packagingNotes?: string | null;
}}) {
  const category = order.productCategory ?? "general";
  const template = getTemplate(category);
  const customFields = order.customFieldValues ?? {};
  const docs = order.uploadedDocuments ?? [];
  const checklist = order.checklistStatus ?? {};
  const catLabel = CATEGORY_LABELS[category] ?? category;

  const hasAnyData =
    Object.keys(customFields).length > 0 ||
    docs.length > 0 ||
    Object.keys(checklist).length > 0;

  if (!hasAnyData && !order.productCategory) return null;

  const checklistDone = template.checklist.filter((c) => checklist[c.key]).length;

  return (
    <div className="space-y-4">
      <Separator />
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Tag className="w-3.5 h-3.5 text-primary" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Data Template Komoditas
          </p>
          <Badge variant="secondary" className="text-[10px] h-4">
            {catLabel}
          </Badge>
          {order.templateVersion && (
            <span className="text-[10px] text-muted-foreground">v{order.templateVersion}</span>
          )}
        </div>

        <div className="space-y-4">
          {/* Custom Fields */}
          {Object.keys(customFields).length > 0 && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <Package className="w-3 h-3 text-primary" />
                <p className="text-xs font-semibold">Field Khusus</p>
              </div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {template.customFields
                  .filter((f) => customFields[f.key] !== undefined && customFields[f.key] !== "" && customFields[f.key] !== 0)
                  .map((f) => (
                    <div key={f.key} className={f.type === "textarea" ? "col-span-2" : ""}>
                      <p className="text-[10px] text-muted-foreground">{f.label}</p>
                      <p className="text-xs font-medium">
                        {String(customFields[f.key])}
                        {f.unit && <span className="text-muted-foreground ml-1">{f.unit}</span>}
                      </p>
                    </div>
                  ))}
                {/* Show fields not in template (fallback) */}
                {Object.entries(customFields)
                  .filter(([key]) => !template.customFields.find((f) => f.key === key))
                  .map(([key, val]) => (
                    <div key={key}>
                      <p className="text-[10px] text-muted-foreground">{key}</p>
                      <p className="text-xs font-medium">{String(val)}</p>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Documents */}
          {docs.length > 0 && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-3">
                <FileText className="w-3 h-3 text-primary" />
                <p className="text-xs font-semibold">Dokumen Tercatat</p>
              </div>
              <div className="space-y-2">
                {docs.map((doc) => (
                  <div key={doc.key} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">{doc.label}</span>
                    <span className="font-mono font-medium bg-muted px-1.5 py-0.5 rounded text-[10px]">
                      {doc.reference}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Checklist */}
          {template.checklist.length > 0 && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-1.5">
                  <ClipboardList className="w-3 h-3 text-primary" />
                  <p className="text-xs font-semibold">Checklist Persiapan</p>
                </div>
                <Badge variant={checklistDone === template.checklist.length ? "default" : "secondary"} className="text-[10px] h-4">
                  {checklistDone}/{template.checklist.length}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {template.checklist.map((item) => (
                  <div key={item.key} className="flex items-center gap-2 text-xs">
                    {checklist[item.key] ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500 shrink-0" />
                    ) : (
                      <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={checklist[item.key] ? "text-foreground" : "text-muted-foreground"}>
                      {item.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Packaging Notes */}
          {order.packagingNotes && (
            <div className="border rounded-lg p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Wrench className="w-3 h-3 text-primary" />
                <p className="text-xs font-semibold">Catatan Packaging</p>
              </div>
              <p className="text-xs text-muted-foreground">{order.packagingNotes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────── Main Page ─── */

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
  const toggleAll = () => { if (allSelected) setSelectedIds(new Set()); else setSelectedIds(new Set(filtered.map((o) => o.id))); };
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  };

  async function handleStatusChange(id: number, status: string) {
    setUpdatingId(id);
    try {
      await updateStatus.mutateAsync({ id, data: { status } });
      invalidate();
      if (detailOrderId === id) queryClient.invalidateQueries({ queryKey: [`portal-product-order-${id}`] });
      toast({ title: `Status diperbarui: ${status}` });
    } catch { toast({ title: "Gagal memperbarui status", variant: "destructive" }); }
    finally { setUpdatingId(null); }
  }

  async function handleDelete(id: number) {
    if (!confirm("Hapus pesanan ini? Tindakan ini tidak bisa dibatalkan.")) return;
    try {
      await deleteMut.mutateAsync({ id });
      invalidate();
      if (detailOrderId === id) setDetailOrderId(null);
      toast({ title: "Pesanan berhasil dihapus" });
    } catch { toast({ title: "Gagal menghapus pesanan", variant: "destructive" }); }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Hapus ${selectedIds.size} pesanan terpilih?`)) return;
    setBulkDeleting(true);
    let success = 0; let failed = 0;
    for (const id of selectedIds) { try { await deleteMut.mutateAsync({ id }); success++; } catch { failed++; } }
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
    } catch { toast({ title: "Gagal memperbarui master item", variant: "destructive" }); }
    finally { setLinkingItemId(null); }
  }

  const detailOrder = orders.find((o) => o.id === detailOrderId) ?? null;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">Portal Order Produk</h1>
          <p className="text-muted-foreground text-sm mt-1">Kelola pesanan produk dari Customer Portal — konfirmasi, proses, dan selesaikan</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {STATS_LIST.map(({ status, label }) => {
            const count = orders.filter((o) => o.status === status).length;
            const isActive = statusFilter === status;
            return (
              <Card
                key={status}
                className={`cursor-pointer hover:border-primary/50 transition-all ${isActive ? "border-primary bg-primary/5 shadow-sm" : ""}`}
                onClick={() => setStatusFilter(isActive ? "all" : status)}
              >
                <CardContent className="p-3 text-center">
                  <p className="text-[11px] text-muted-foreground leading-tight mb-1">{label}</p>
                  <p className={`text-xl font-bold ${isActive ? "text-primary" : ""}`}>{count}</p>
                </CardContent>
              </Card>
            );
          })}
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

        {/* Table Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Package className="w-4 h-4" />
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
                  {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button variant="outline" size="icon" onClick={() => refetch()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>

            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 opacity-40" />
                Memuat...
              </div>
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
                      <TableHead>Kategori</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Tanggal</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-16">Aksi</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((order) => {
                      const isUpdating = updatingId === order.id;
                      const next = NEXT_STATUS[order.status as OrderStatus];
                      const nextLabel = NEXT_LABEL[order.status as OrderStatus];
                      const cat = (order as unknown as { productCategory?: string }).productCategory;
                      return (
                        <TableRow
                          key={order.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setDetailOrderId(order.id)}
                          {...prefetchHover(getGetPortalProductOrderQueryOptions(order.id))}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(order.id)} onCheckedChange={() => toggleSelect(order.id)} />
                          </TableCell>
                          <TableCell className="font-mono text-xs font-semibold">{order.orderNumber}</TableCell>
                          <TableCell>
                            <div>
                              <p className="font-medium text-sm">{order.customerName}</p>
                              <p className="text-xs text-muted-foreground">{order.email}</p>
                            </div>
                          </TableCell>
                          <TableCell>
                            {cat ? (
                              <Badge variant="outline" className="text-[10px] gap-1">
                                <Tag className="w-2.5 h-2.5" />
                                {CATEGORY_LABELS[cat] ?? cat}
                              </Badge>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="font-semibold text-sm">{idr(order.grandTotal)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatTanggal(order.createdAt)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs gap-1 ${STATUS_COLORS[order.status as OrderStatus] ?? "bg-gray-100 text-gray-700"}`}>
                              {STATUS_ICONS[order.status as OrderStatus]}
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center gap-1">
                              {next && nextLabel && (
                                <Button size="sm" variant="outline" className="h-7 text-xs px-2 whitespace-nowrap"
                                  disabled={isUpdating} title={nextLabel}
                                  onClick={() => handleStatusChange(order.id, next)}
                                >
                                  {isUpdating ? <Loader2 className="h-3 w-3 animate-spin" /> : <ChevronRight className="h-3 w-3" />}
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                title="Hapus" onClick={() => handleDelete(order.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Detail Dialog ── */}
      {detailOrderId && detailOrder && (
        <Dialog open onOpenChange={() => setDetailOrderId(null)}>
          <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Package className="w-4 h-4 text-primary" />
                Pesanan {detailOrder.orderNumber}
                <Badge className={`ml-1 text-xs gap-1 ${STATUS_COLORS[detailOrder.status as OrderStatus] ?? "bg-gray-100"}`}>
                  {STATUS_ICONS[detailOrder.status as OrderStatus]}
                  {detailOrder.status}
                </Badge>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-5 text-sm">

              {/* Status Timeline */}
              <div className="bg-muted/30 border rounded-xl p-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">Progress Status</p>
                <StatusTimeline status={detailOrder.status} />
              </div>

              {/* Quick Actions */}
              <div className="flex items-center justify-between flex-wrap gap-3 px-1">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Tindakan Cepat</p>
                  <QuickActions
                    order={detailOrder}
                    updating={updatingId === detailOrder.id}
                    onStatus={(s) => handleStatusChange(detailOrder.id, s)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">Atau pilih status:</p>
                  <Select
                    value={detailOrder.status}
                    onValueChange={(v) => handleStatusChange(detailOrder.id, v)}
                    disabled={updatingId === detailOrder.id}
                  >
                    <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Info Customer */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Informasi Customer</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                  <div className="flex items-start gap-2">
                    <User className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div><p className="text-[10px] text-muted-foreground">Customer</p><p className="font-medium">{detailOrder.customerName}</p></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div><p className="text-[10px] text-muted-foreground">Email</p><p className="break-all">{detailOrder.email}</p></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div><p className="text-[10px] text-muted-foreground">WhatsApp</p><p>{detailOrder.phone}</p></div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Clock className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div><p className="text-[10px] text-muted-foreground">Tanggal Order</p><p>{formatTanggal(detailOrder.createdAt)}</p></div>
                  </div>
                  <div className="col-span-2 flex items-start gap-2">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                    <div><p className="text-[10px] text-muted-foreground">Alamat Pengiriman</p><p>{detailOrder.shippingAddress}</p></div>
                  </div>
                  {detailOrder.notes && (
                    <div className="col-span-2 flex items-start gap-2">
                      <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
                      <div><p className="text-[10px] text-muted-foreground">Catatan</p><p className="text-muted-foreground italic">{detailOrder.notes}</p></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Template Data Panel */}
              <TemplateDataPanel order={detail as typeof detailOrder & {
                productCategory?: string | null;
                templateVersion?: string | null;
                customFieldValues?: Record<string, string | number | boolean>;
                uploadedDocuments?: { key: string; label: string; reference: string }[];
                checklistStatus?: Record<string, boolean>;
                packagingNotes?: string | null;
              } ?? detailOrder as unknown as Parameters<typeof TemplateDataPanel>[0]["order"]} />

              <Separator />

              {/* Item Table */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Item Pesanan</p>
                {detail?.items ? (
                  detail.items.length === 0 ? (
                    <p className="text-muted-foreground text-xs py-3">Tidak ada item</p>
                  ) : (
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted">
                          <tr>
                            <th className="text-left px-3 py-2">Produk (dari Portal)</th>
                            <th className="text-left px-3 py-2 w-44">Link Master Item</th>
                            <th className="text-center px-3 py-2 w-16">Qty</th>
                            <th className="text-right px-3 py-2 w-24">Harga</th>
                            <th className="text-right px-3 py-2 w-24">Subtotal</th>
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
                                  <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="Pilih master..." /></SelectTrigger>
                                  <SelectContent>
                                    {masterProducts.map((p) => (
                                      <SelectItem key={p.id} value={p.id.toString()} className="text-xs">
                                        {p.name} {p.sku ? `(${p.sku})` : ""}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {item.productId
                                  ? <p className="text-[10px] text-green-600 mt-0.5">✓ Terhubung ke master</p>
                                  : <p className="text-[10px] text-amber-500 mt-0.5 flex items-center gap-0.5"><AlertTriangle className="w-2.5 h-2.5" /> Belum terhubung</p>
                                }
                              </td>
                              <td className="px-3 py-2 text-center">{item.qty} {item.unit ?? "pcs"}</td>
                              <td className="px-3 py-2 text-right">{idr(item.unitPrice)}</td>
                              <td className="px-3 py-2 text-right font-semibold">{idr(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-muted/50">
                          <tr>
                            <td colSpan={4} className="px-3 py-2 text-right font-bold">Grand Total</td>
                            <td className="px-3 py-2 text-right font-bold text-primary">{idr(detailOrder.grandTotal)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )
                ) : (
                  <div className="text-muted-foreground text-xs py-4 text-center flex items-center justify-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memuat detail...
                  </div>
                )}
              </div>

              {/* Danger zone */}
              <Separator />
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">Pesanan {detailOrder.orderNumber}</p>
                <Button variant="ghost" size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
                  onClick={() => handleDelete(detailOrder.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Hapus Pesanan
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </AppShell>
  );
}
