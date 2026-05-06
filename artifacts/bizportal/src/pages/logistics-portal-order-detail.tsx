import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetLogisticOrder,
  useListLogisticOrderRfqs,
  useListLogisticOrderQuotes,
  useCreateLogisticOrderRfq,
  useCreateLogisticOrderQuote,
  useUpdateLogisticOrderQuote,
  useApproveLogisticOrderQuote,
  useUpdateLogisticOrderStatus,
  getListLogisticOrderRfqsQueryKey,
  getListLogisticOrderQuotesQueryKey,
  getListLogisticOrdersQueryKey,
  getGetLogisticOrderQueryKey,
} from "@workspace/api-client-react";
import type { LogisticQuote, LogisticRfq } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, PackageOpen, Send, Plus, CheckCircle, Edit, Star, Zap, TrendingDown,
  RefreshCw, MessageCircle,
} from "lucide-react";

const idr = (n: number | null | undefined) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_COLORS: Record<string, string> = {
  "New Order": "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Under Review": "bg-blue-100 text-blue-800 border-blue-200",
  "Quotation Sent": "bg-purple-100 text-purple-800 border-purple-200",
  "Confirmed": "bg-teal-100 text-teal-800 border-teal-200",
  "In Progress": "bg-orange-100 text-orange-800 border-orange-200",
  "Completed": "bg-green-100 text-green-800 border-green-200",
  "Cancelled": "bg-red-100 text-red-800 border-red-200",
};

interface VendorRow {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
  isActive: boolean;
  eta: string;
}

export default function LogisticsPortalOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = parseInt(id ?? "0", 10);
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  const [rfqDialog, setRfqDialog] = useState(false);
  const [selectedVendors, setSelectedVendors] = useState<number[]>([]);
  const [rfqNotes, setRfqNotes] = useState("");

  const [quoteDialog, setQuoteDialog] = useState<{ open: boolean; rfqId: number; vendorId?: number } | null>(null);
  const [quoteForm, setQuoteForm] = useState({
    vendorId: "", vendorPrice: "", estimatedPickup: "", estimatedDelivery: "",
    estimatedDays: "", vendorNotes: "", markupType: "percentage", markupPercentage: "0",
    fixedSellingPrice: "",
  });

  const [editDialog, setEditDialog] = useState<LogisticQuote | null>(null);
  const [editForm, setEditForm] = useState({
    vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "",
    vendorNotes: "", markupType: "percentage", markupPercentage: "0", fixedSellingPrice: "",
  });

  const [approveDialog, setApproveDialog] = useState<LogisticQuote | null>(null);

  const { data: order, isLoading } = useGetLogisticOrder(orderId);
  const { data: rfqs = [] } = useListLogisticOrderRfqs(orderId);
  const { data: comparison, refetch: refetchQuotes } = useListLogisticOrderQuotes(orderId);
  const quotes = comparison?.quotes ?? [];
  const cheapest = comparison?.cheapest;
  const fastest = comparison?.fastest;
  const recommended = comparison?.recommended;

  const { data: vendors = [] } = useQuery<VendorRow[]>({
    queryKey: ["logistic-vendors"],
    queryFn: async () => {
      const res = await fetch("/api/logistic/orders/vendors");
      if (!res.ok) throw new Error("Failed to load vendors");
      return res.json() as Promise<VendorRow[]>;
    },
  });

  const createRfq = useCreateLogisticOrderRfq();
  const createQuote = useCreateLogisticOrderQuote();
  const updateQuote = useUpdateLogisticOrderQuote();
  const approveQuote = useApproveLogisticOrderQuote();
  const updateStatus = useUpdateLogisticOrderStatus();

  function invalidateAll() {
    qc.invalidateQueries({ queryKey: getListLogisticOrderRfqsQueryKey(orderId) });
    qc.invalidateQueries({ queryKey: getListLogisticOrderQuotesQueryKey(orderId) });
    qc.invalidateQueries({ queryKey: getGetLogisticOrderQueryKey(orderId) });
    qc.invalidateQueries({ queryKey: getListLogisticOrdersQueryKey() });
  }

  function handleSendRfq() {
    if (selectedVendors.length === 0) {
      toast({ title: "Pilih minimal satu vendor", variant: "destructive" });
      return;
    }
    createRfq.mutate(
      { id: orderId, data: { vendorIds: selectedVendors, notes: rfqNotes || undefined } },
      {
        onSuccess: (rfq) => {
          toast({ title: `RFQ ${rfq.rfqNumber} berhasil dikirim ke ${selectedVendors.length} vendor!` });
          setRfqDialog(false);
          setSelectedVendors([]);
          setRfqNotes("");
          invalidateAll();
        },
        onError: () => toast({ title: "Gagal mengirim RFQ", variant: "destructive" }),
      }
    );
  }

  function handleCreateQuote() {
    if (!quoteDialog) return;
    const vp = parseFloat(quoteForm.vendorPrice.replace(/[.,]/g, ""));
    if (!quoteForm.vendorId || isNaN(vp) || vp <= 0) {
      toast({ title: "Vendor dan harga wajib diisi", variant: "destructive" });
      return;
    }
    const mp = parseFloat(quoteForm.markupPercentage) || 0;
    const fp = quoteForm.fixedSellingPrice ? parseFloat(quoteForm.fixedSellingPrice) : undefined;
    createQuote.mutate(
      {
        id: orderId,
        data: {
          rfqId: quoteDialog.rfqId,
          vendorId: parseInt(quoteForm.vendorId, 10),
          vendorPrice: vp,
          estimatedPickup: quoteForm.estimatedPickup || undefined,
          estimatedDelivery: quoteForm.estimatedDelivery || undefined,
          estimatedDays: quoteForm.estimatedDays ? parseInt(quoteForm.estimatedDays) : undefined,
          vendorNotes: quoteForm.vendorNotes || undefined,
          markupType: quoteForm.markupType,
          markupPercentage: mp,
          fixedSellingPrice: fp,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Quote berhasil ditambahkan" });
          setQuoteDialog(null);
          setQuoteForm({ vendorId: "", vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "", vendorNotes: "", markupType: "percentage", markupPercentage: "0", fixedSellingPrice: "" });
          invalidateAll();
        },
        onError: () => toast({ title: "Gagal menyimpan quote", variant: "destructive" }),
      }
    );
  }

  function openEditDialog(q: LogisticQuote) {
    setEditDialog(q);
    setEditForm({
      vendorPrice: String(q.vendorPrice),
      estimatedPickup: q.estimatedPickup ?? "",
      estimatedDelivery: q.estimatedDelivery ?? "",
      estimatedDays: q.estimatedDays != null ? String(q.estimatedDays) : "",
      vendorNotes: q.vendorNotes ?? "",
      markupType: q.markupType,
      markupPercentage: String(q.markupPercentage),
      fixedSellingPrice: q.fixedSellingPrice != null ? String(q.fixedSellingPrice) : "",
    });
  }

  function handleUpdateQuote() {
    if (!editDialog) return;
    const vp = parseFloat(editForm.vendorPrice);
    if (isNaN(vp) || vp <= 0) {
      toast({ title: "Harga vendor tidak valid", variant: "destructive" });
      return;
    }
    updateQuote.mutate(
      {
        quoteId: editDialog.id,
        data: {
          vendorPrice: vp,
          estimatedPickup: editForm.estimatedPickup || undefined,
          estimatedDelivery: editForm.estimatedDelivery || undefined,
          estimatedDays: editForm.estimatedDays ? parseInt(editForm.estimatedDays) : undefined,
          vendorNotes: editForm.vendorNotes || undefined,
          markupType: editForm.markupType,
          markupPercentage: parseFloat(editForm.markupPercentage) || 0,
          fixedSellingPrice: editForm.fixedSellingPrice ? parseFloat(editForm.fixedSellingPrice) : undefined,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Quote berhasil diperbarui" });
          setEditDialog(null);
          invalidateAll();
          refetchQuotes();
        },
        onError: () => toast({ title: "Gagal memperbarui quote", variant: "destructive" }),
      }
    );
  }

  function handleApproveQuote() {
    if (!approveDialog) return;
    approveQuote.mutate(
      { id: orderId, data: { quoteId: approveDialog.id } },
      {
        onSuccess: () => {
          toast({ title: "Quote diapprove & penawaran dikirim ke customer via WhatsApp!" });
          setApproveDialog(null);
          invalidateAll();
        },
        onError: () => toast({ title: "Gagal approve quote", variant: "destructive" }),
      }
    );
  }

  function previewSellingPrice(vp: number, mt: string, mp: number, fp: number | null): number {
    if (mt === "fixed_price" && fp != null) return fp;
    return vp + (vp * mp / 100);
  }

  const activeVendors = vendors.filter((v) => v.isActive);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (!order) {
    return (
      <AppShell>
        <div className="p-6">
          <p className="text-muted-foreground">Order tidak ditemukan.</p>
          <Button variant="outline" className="mt-4" onClick={() => navigate("/logistics/portal-orders")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Kembali
          </Button>
        </div>
      </AppShell>
    );
  }

  const latestRfq: LogisticRfq | undefined = rfqs[0];

  return (
    <AppShell>
      <div className="space-y-6 p-6 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate("/logistics/portal-orders")}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold flex items-center gap-2">
                <PackageOpen className="h-5 w-5" />
                {order.orderNumber}
              </h1>
              <Badge className={`${STATUS_COLORS[order.status] ?? "bg-gray-100 text-gray-800"} border text-xs`}>
                {order.status}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {order.customerName} · {order.companyName} · {order.email} · {order.phone}
            </p>
          </div>
          <div className="flex gap-2">
            {order.status === "New Order" || order.status === "Under Review" ? (
              <Button size="sm" className="gap-2" onClick={() => setRfqDialog(true)}>
                <Send className="h-4 w-4" /> Kirim RFQ ke Vendor
              </Button>
            ) : null}
          </div>
        </div>

        <Tabs defaultValue="detail">
          <TabsList>
            <TabsTrigger value="detail">Detail Order</TabsTrigger>
            <TabsTrigger value="rfq">
              RFQ & Quotes
              {quotes.length > 0 && (
                <span className="ml-1.5 inline-flex items-center justify-center rounded-full bg-blue-600 text-white text-[10px] w-4 h-4">
                  {quotes.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── Tab 1: Order Detail ── */}
          <TabsContent value="detail" className="space-y-4 mt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Info Pengiriman</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Tipe" value={order.shipmentType} />
                  <InfoRow label="Rute" value={`${order.origin} → ${order.destination}`} />
                  {order.commodity && <InfoRow label="Komoditi" value={order.commodity} />}
                  {order.cargoDescription && <InfoRow label="Kargo" value={order.cargoDescription} />}
                  {order.grossWeight != null && <InfoRow label="Berat" value={`${order.grossWeight} kg`} />}
                  {order.volumeCbm != null && <InfoRow label="Volume" value={`${order.volumeCbm} CBM`} />}
                  {order.requiredDate && <InfoRow label="Tgl Butuh" value={order.requiredDate} />}
                  {order.paymentType && <InfoRow label="Pembayaran" value={order.paymentType} />}
                  {order.notes && <InfoRow label="Catatan" value={order.notes} />}
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Nilai Order</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <InfoRow label="Subtotal" value={idr(order.subtotal)} />
                  <InfoRow label="Pajak" value={idr(order.tax)} />
                  <InfoRow label="Total Estimasi" value={<span className="font-bold text-base">{idr(order.grandTotal)}</span>} />
                  {order.finalSellingPrice != null && (
                    <InfoRow label="Harga Jual Final" value={<span className="font-bold text-green-700">{idr(order.finalSellingPrice)}</span>} />
                  )}
                  {order.approvedVendorName && <InfoRow label="Vendor Dipilih" value={order.approvedVendorName} />}
                  {order.quotationSentAt && (
                    <InfoRow label="Penawaran Dikirim" value={new Date(order.quotationSentAt).toLocaleString("id-ID")} />
                  )}
                </CardContent>
              </Card>
            </div>

            {(order.items ?? []).length > 0 && (
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm">Item Layanan</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Layanan</TableHead>
                        <TableHead>Kategori</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(order.items ?? []).map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-medium text-sm">{item.serviceName}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{item.category}</TableCell>
                          <TableCell className="text-right text-sm">{idr(item.subtotal)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ── Tab 2: RFQ & Quotes ── */}
          <TabsContent value="rfq" className="space-y-4 mt-4">
            {/* RFQ List */}
            {rfqs.length > 0 && (
              <Card>
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">History RFQ</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {rfqs.map((rfq) => (
                    <div key={rfq.id} className="flex items-center gap-3 text-sm rounded-lg border px-3 py-2 bg-muted/30">
                      <MessageCircle className="h-4 w-4 text-blue-500 shrink-0" />
                      <span className="font-mono font-medium">{rfq.rfqNumber}</span>
                      <span className="text-muted-foreground">
                        {(rfq.vendorIds ?? []).length} vendor · {rfq.status}
                      </span>
                      <span className="ml-auto text-xs text-muted-foreground">
                        {new Date(rfq.createdAt).toLocaleString("id-ID")}
                      </span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Comparison Summary */}
            {quotes.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <ComparisonCard
                  icon={<TrendingDown className="h-4 w-4 text-green-600" />}
                  label="Termurah"
                  quote={cheapest}
                  badge="bg-green-100 text-green-800"
                />
                <ComparisonCard
                  icon={<Zap className="h-4 w-4 text-yellow-600" />}
                  label="Tercepat"
                  quote={fastest}
                  badge="bg-yellow-100 text-yellow-800"
                />
                <ComparisonCard
                  icon={<Star className="h-4 w-4 text-purple-600" />}
                  label="Rekomendasi"
                  quote={recommended}
                  badge="bg-purple-100 text-purple-800"
                />
              </div>
            )}

            {/* Quotes Table */}
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">
                  Penawaran Vendor ({quotes.length})
                </CardTitle>
                {latestRfq && order.status !== "Quotation Sent" && order.status !== "Confirmed" && order.status !== "Completed" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-xs"
                    onClick={() => {
                      setQuoteForm({ vendorId: "", vendorPrice: "", estimatedPickup: "", estimatedDelivery: "", estimatedDays: "", vendorNotes: "", markupType: "percentage", markupPercentage: "0", fixedSellingPrice: "" });
                      setQuoteDialog({ open: true, rfqId: latestRfq.id });
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Tambah Manual
                  </Button>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {quotes.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    Belum ada penawaran. Kirim RFQ ke vendor atau tambah manual.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Harga Vendor</TableHead>
                        <TableHead>Markup</TableHead>
                        <TableHead className="text-right">Harga Jual</TableHead>
                        <TableHead>ETA</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sumber</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quotes.map((q) => {
                        const isCheapest = cheapest?.id === q.id;
                        const isFastest = fastest?.id === q.id;
                        const isRecommended = recommended?.id === q.id;
                        const isApproved = q.quoteStatus === "approved";
                        return (
                          <TableRow key={q.id} className={isApproved ? "bg-green-50" : ""}>
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-sm">{q.vendorName}</span>
                                {isCheapest && <Badge className="text-[10px] bg-green-100 text-green-800 border-0 px-1 py-0">Murah</Badge>}
                                {isFastest && <Badge className="text-[10px] bg-yellow-100 text-yellow-800 border-0 px-1 py-0">Cepat</Badge>}
                                {isRecommended && <Badge className="text-[10px] bg-purple-100 text-purple-800 border-0 px-1 py-0">★ Rekomendasi</Badge>}
                              </div>
                              {q.vendorNotes && <p className="text-xs text-muted-foreground mt-0.5">{q.vendorNotes}</p>}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm">
                              {idr(q.vendorPrice)}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {q.markupType === "fixed_price"
                                ? `Fix: ${idr(q.fixedSellingPrice)}`
                                : `${q.markupPercentage}%`}
                            </TableCell>
                            <TableCell className="text-right font-mono text-sm font-semibold">
                              {idr(q.sellingPrice)}
                            </TableCell>
                            <TableCell className="text-xs">
                              {q.estimatedPickup && <div>Pickup: {q.estimatedPickup}</div>}
                              {q.estimatedDelivery && <div>Kirim: {q.estimatedDelivery}</div>}
                              {q.estimatedDays != null && <div>{q.estimatedDays} hari</div>}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className={`text-xs ${
                                isApproved ? "bg-green-100 text-green-800 border-green-200"
                                : q.quoteStatus === "rejected" ? "bg-red-100 text-red-800"
                                : "bg-gray-100 text-gray-700"
                              }`}>
                                {isApproved ? "✓ Approved" : q.quoteStatus}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {q.replySource === "whatsapp" ? "🟢 WA" : "Manual"}
                              {q.replyTimestamp && (
                                <div>{new Date(q.replyTimestamp).toLocaleDateString("id-ID")}</div>
                              )}
                            </TableCell>
                            <TableCell>
                              {!isApproved && order.status !== "Quotation Sent" && order.status !== "Confirmed" && order.status !== "Completed" && (
                                <div className="flex gap-1.5 justify-end">
                                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => openEditDialog(q)}>
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="default"
                                    className="h-7 px-2 text-xs gap-1"
                                    title="Approve & Kirim ke Customer"
                                    onClick={() => setApproveDialog(q)}
                                  >
                                    <CheckCircle className="h-3.5 w-3.5" />
                                    Approve
                                  </Button>
                                </div>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ── Dialog: Kirim RFQ ── */}
      <Dialog open={rfqDialog} onOpenChange={setRfqDialog}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" /> Kirim RFQ ke Vendor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm space-y-1">
              <div className="font-medium">{order.orderNumber}</div>
              <div className="text-muted-foreground">{order.shipmentType} · {order.origin} → {order.destination}</div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-2 block">Pilih Vendor ({selectedVendors.length} dipilih)</Label>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {activeVendors.length === 0 && (
                  <p className="text-sm text-muted-foreground">Tidak ada vendor aktif.</p>
                )}
                {activeVendors.map((v) => (
                  <label
                    key={v.id}
                    className="flex items-center gap-3 rounded-lg border px-3 py-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  >
                    <Checkbox
                      checked={selectedVendors.includes(v.id)}
                      onCheckedChange={(checked) => {
                        setSelectedVendors((prev) =>
                          checked ? [...prev, v.id] : prev.filter((x) => x !== v.id)
                        );
                      }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{v.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {v.phone ?? "No phone"} · {v.serviceType ?? "Semua tipe"}
                      </div>
                    </div>
                    {!v.phone && (
                      <Badge variant="outline" className="text-xs text-orange-600">No WA</Badge>
                    )}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-sm">Catatan Tambahan (opsional)</Label>
              <Input
                className="mt-1"
                placeholder="Catatan untuk vendor..."
                value={rfqNotes}
                onChange={(e) => setRfqNotes(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRfqDialog(false)}>Batal</Button>
            <Button onClick={handleSendRfq} disabled={createRfq.isPending || selectedVendors.length === 0} className="gap-2">
              <Send className="h-4 w-4" />
              {createRfq.isPending ? "Mengirim..." : `Kirim ke ${selectedVendors.length} Vendor`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Tambah Quote Manual ── */}
      <Dialog open={!!quoteDialog?.open} onOpenChange={(open) => { if (!open) setQuoteDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" /> Tambah Penawaran Manual
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label className="text-sm">Vendor *</Label>
              <select
                className="mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={quoteForm.vendorId}
                onChange={(e) => setQuoteForm((f) => ({ ...f, vendorId: e.target.value }))}
              >
                <option value="">Pilih vendor...</option>
                {activeVendors.map((v) => (
                  <option key={v.id} value={v.id}>{v.name}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Harga Vendor (IDR) *</Label>
                <Input className="mt-1" placeholder="5000000" value={quoteForm.vendorPrice}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, vendorPrice: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">Estimasi Hari</Label>
                <Input className="mt-1" type="number" placeholder="3" value={quoteForm.estimatedDays}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedDays: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">ETA Pickup</Label>
                <Input className="mt-1" placeholder="Besok pagi" value={quoteForm.estimatedPickup}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedPickup: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">ETA Delivery</Label>
                <Input className="mt-1" placeholder="2-3 hari" value={quoteForm.estimatedDelivery}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, estimatedDelivery: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Markup</Label>
              <div className="flex gap-2 mt-1">
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm w-36"
                  value={quoteForm.markupType}
                  onChange={(e) => setQuoteForm((f) => ({ ...f, markupType: e.target.value }))}
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed_price">Harga Tetap</option>
                </select>
                {quoteForm.markupType === "percentage" ? (
                  <Input placeholder="15" value={quoteForm.markupPercentage}
                    onChange={(e) => setQuoteForm((f) => ({ ...f, markupPercentage: e.target.value }))} />
                ) : (
                  <Input placeholder="Harga jual (IDR)" value={quoteForm.fixedSellingPrice}
                    onChange={(e) => setQuoteForm((f) => ({ ...f, fixedSellingPrice: e.target.value }))} />
                )}
              </div>
              {quoteForm.vendorPrice && quoteForm.markupType === "percentage" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preview harga jual: {idr(previewSellingPrice(
                    parseFloat(quoteForm.vendorPrice) || 0,
                    "percentage",
                    parseFloat(quoteForm.markupPercentage) || 0,
                    null
                  ))}
                </p>
              )}
            </div>
            <div>
              <Label className="text-sm">Catatan Vendor</Label>
              <Input className="mt-1" placeholder="Catatan..." value={quoteForm.vendorNotes}
                onChange={(e) => setQuoteForm((f) => ({ ...f, vendorNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuoteDialog(null)}>Batal</Button>
            <Button onClick={handleCreateQuote} disabled={createQuote.isPending}>
              {createQuote.isPending ? "Menyimpan..." : "Simpan Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Edit Quote ── */}
      <Dialog open={!!editDialog} onOpenChange={(open) => { if (!open) setEditDialog(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit className="h-5 w-5" /> Edit Quote — {editDialog?.vendorName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">Harga Vendor (IDR) *</Label>
                <Input className="mt-1" placeholder="5000000" value={editForm.vendorPrice}
                  onChange={(e) => setEditForm((f) => ({ ...f, vendorPrice: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">Estimasi Hari</Label>
                <Input className="mt-1" type="number" placeholder="3" value={editForm.estimatedDays}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedDays: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-sm">ETA Pickup</Label>
                <Input className="mt-1" placeholder="Besok pagi" value={editForm.estimatedPickup}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedPickup: e.target.value }))} />
              </div>
              <div>
                <Label className="text-sm">ETA Delivery</Label>
                <Input className="mt-1" placeholder="2-3 hari" value={editForm.estimatedDelivery}
                  onChange={(e) => setEditForm((f) => ({ ...f, estimatedDelivery: e.target.value }))} />
              </div>
            </div>
            <div>
              <Label className="text-sm">Markup</Label>
              <div className="flex gap-2 mt-1">
                <select
                  className="rounded-md border bg-background px-3 py-2 text-sm w-36"
                  value={editForm.markupType}
                  onChange={(e) => setEditForm((f) => ({ ...f, markupType: e.target.value }))}
                >
                  <option value="percentage">Persentase (%)</option>
                  <option value="fixed_price">Harga Tetap</option>
                </select>
                {editForm.markupType === "percentage" ? (
                  <Input placeholder="15" value={editForm.markupPercentage}
                    onChange={(e) => setEditForm((f) => ({ ...f, markupPercentage: e.target.value }))} />
                ) : (
                  <Input placeholder="Harga jual (IDR)" value={editForm.fixedSellingPrice}
                    onChange={(e) => setEditForm((f) => ({ ...f, fixedSellingPrice: e.target.value }))} />
                )}
              </div>
              {editForm.vendorPrice && editForm.markupType === "percentage" && (
                <p className="text-xs text-muted-foreground mt-1">
                  Preview harga jual: {idr(previewSellingPrice(
                    parseFloat(editForm.vendorPrice) || 0,
                    "percentage",
                    parseFloat(editForm.markupPercentage) || 0,
                    null
                  ))}
                </p>
              )}
            </div>
            <div>
              <Label className="text-sm">Catatan Vendor</Label>
              <Input className="mt-1" placeholder="Catatan..." value={editForm.vendorNotes}
                onChange={(e) => setEditForm((f) => ({ ...f, vendorNotes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialog(null)}>Batal</Button>
            <Button onClick={handleUpdateQuote} disabled={updateQuote.isPending}>
              {updateQuote.isPending ? "Menyimpan..." : "Update Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Approve & Send ── */}
      <Dialog open={!!approveDialog} onOpenChange={(open) => { if (!open) setApproveDialog(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" /> Approve & Kirim ke Customer
            </DialogTitle>
          </DialogHeader>
          {approveDialog && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Konfirmasi pilihan penawaran ini. Harga jual akan dikirim ke customer via WhatsApp.
                <strong className="text-foreground"> Harga vendor tidak akan ditampilkan ke customer.</strong>
              </p>
              <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium">{approveDialog.vendorName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Harga Vendor (internal)</span>
                  <span className="font-mono">{idr(approveDialog.vendorPrice)}</span>
                </div>
                <div className="flex justify-between border-t pt-2 mt-2">
                  <span className="font-medium">Harga Jual ke Customer</span>
                  <span className="font-bold text-lg text-green-700">{idr(approveDialog.sellingPrice)}</span>
                </div>
                {approveDialog.estimatedDelivery && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Estimasi Pengiriman</span>
                    <span>{approveDialog.estimatedDelivery}</span>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Setelah approve, status order otomatis berubah ke "Quotation Sent" dan customer menerima WA.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveDialog(null)}>Batal</Button>
            <Button
              className="gap-2 bg-green-600 hover:bg-green-700"
              onClick={handleApproveQuote}
              disabled={approveQuote.isPending}
            >
              <CheckCircle className="h-4 w-4" />
              {approveQuote.isPending ? "Menyimpan..." : "Approve & Kirim WA"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground shrink-0">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

function ComparisonCard({ icon, label, quote, badge }: {
  icon: React.ReactNode;
  label: string;
  quote: LogisticQuote | null | undefined;
  badge: string;
}) {
  const idr = (n: number | null | undefined) =>
    n == null ? "—"
    : new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  return (
    <Card className="border">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badge}`}>{label}</span>
        </div>
        {quote ? (
          <div>
            <div className="font-medium text-sm">{quote.vendorName}</div>
            <div className="text-lg font-bold mt-0.5">{idr(quote.sellingPrice)}</div>
            {quote.estimatedDays != null && (
              <div className="text-xs text-muted-foreground mt-0.5">{quote.estimatedDays} hari</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Belum ada data</div>
        )}
      </CardContent>
    </Card>
  );
}
