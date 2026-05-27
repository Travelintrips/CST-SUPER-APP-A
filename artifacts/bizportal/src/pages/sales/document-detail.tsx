import { useState } from "react";
import { useParams, useLocation, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  useGetSalesDocument,
  useSalesDocumentAction,
  useDeleteSalesDocument,
  getGetSalesDocumentQueryKey,
  getListSalesDocumentsQueryKey,
} from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, FileEdit, Printer, CheckCircle, Send, XCircle,
  Truck, Receipt, User, Calendar, MapPin, Package, FileText,
  Clock, Loader2, Trash2, ExternalLink,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

const idr = (n: number | string | null | undefined) =>
  n == null
    ? "—"
    : `Rp ${Math.round(Number(n)).toLocaleString("id-ID")}`;

const dateStr = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

const dateTimeStr = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Terkirim",
  confirmed: "Dikonfirmasi",
  done: "Selesai",
  cancelled: "Dibatalkan",
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700 border-slate-200",
  sent: "bg-blue-100 text-blue-700 border-blue-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  done: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-700 border-red-200",
};

const PAYMENT_LABELS: Record<string, string> = {
  unpaid: "Belum Bayar",
  partial: "Sebagian",
  paid: "Lunas",
};

const PAYMENT_COLORS: Record<string, string> = {
  unpaid: "bg-amber-100 text-amber-700 border-amber-200",
  partial: "bg-orange-100 text-orange-700 border-orange-200",
  paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
};

const INVOICE_LABELS: Record<string, string> = {
  none: "Belum Ditagih",
  to_invoice: "Perlu Invoice",
  invoiced: "Sudah Ditagih",
};

const DELIVERY_LABELS: Record<string, string> = {
  to_deliver: "Perlu Dikirim",
  delivered: "Sudah Dikirim",
};

// ── InfoRow helper ─────────────────────────────────────────────────────────────

function InfoRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span className="text-xs text-muted-foreground w-32 shrink-0 mt-0.5">{label}</span>
      <span className={`text-sm font-medium flex-1 ${mono ? "font-mono" : ""}`}>{value || "—"}</span>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function SalesDocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const docId = Number(id);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  const { data: doc, isLoading, error } = useGetSalesDocument(docId, {
    query: { enabled: !Number.isNaN(docId) },
  });

  const actionMut = useSalesDocumentAction();
  const deleteMut = useDeleteSalesDocument();

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: getGetSalesDocumentQueryKey(docId) });
    queryClient.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey({}) });
  };

  const handleAction = async (action: string, label: string) => {
    if (!confirm(`${label}?`)) return;
    setActionLoading(action);
    try {
      await actionMut.mutateAsync({ id: docId, data: { action } });
      invalidate();
      toast({ title: "Berhasil" });
    } catch {
      toast({ title: "Gagal", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Hapus dokumen ini? Tindakan ini tidak bisa dibatalkan.")) return;
    setActionLoading("delete");
    try {
      await deleteMut.mutateAsync({ id: docId });
      queryClient.invalidateQueries({ queryKey: getListSalesDocumentsQueryKey({}) });
      toast({ title: "Dokumen dihapus" });
      navigate(doc?.kind === "order" ? "/sales/orders" : "/sales/documents");
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
      setActionLoading(null);
    }
  };

  const handleDownloadPdf = async () => {
    setPdfLoading(true);
    try {
      const res = await fetch(`/api/sales/documents/${docId}/pdf`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast({ title: "Gagal download PDF", variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  // ── Loading state ────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <AppShell>
        <div className="space-y-6 max-w-5xl mx-auto">
          <div className="flex items-center gap-4">
            <Skeleton className="h-9 w-9 rounded-md" />
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
          <Skeleton className="h-64" />
        </div>
      </AppShell>
    );
  }

  if (error || !doc || Number.isNaN(docId)) {
    return (
      <AppShell>
        <div className="max-w-5xl mx-auto py-16 text-center">
          <FileText className="w-14 h-14 mx-auto mb-4 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold mb-1">Dokumen tidak ditemukan</h2>
          <p className="text-sm text-muted-foreground mb-6">
            Dokumen dengan ID <span className="font-mono font-medium">{id}</span> tidak ada atau kamu tidak punya akses.
          </p>
          <Button variant="outline" onClick={() => navigate("/sales/documents")}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Kembali ke Daftar
          </Button>
        </div>
      </AppShell>
    );
  }

  const isOrder = doc.kind === "order";
  const isEditable = doc.status === "draft" || doc.status === "sent";
  const isCancelled = doc.status === "cancelled";
  const isDone = doc.status === "done";
  const isConfirmed = doc.status === "confirmed";

  const subtotal = Number(doc.totalAmount ?? 0);
  const taxAmount = Number(doc.taxAmount ?? 0);
  const grandTotal = Number(doc.grandTotal ?? subtotal);
  const amountPaid = Number(doc.amountPaid ?? 0);
  const amountDue = Math.max(0, grandTotal - amountPaid);

  const backHref = isOrder ? "/sales/orders" : "/sales/documents";

  return (
    <AppShell>
      <div className="space-y-5 max-w-5xl mx-auto pb-8">

        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="ghost" size="icon" onClick={() => navigate(backHref)} className="shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-bold font-mono tracking-tight">{doc.docNumber}</h1>
                <Badge variant="outline" className="text-xs capitalize">
                  {isOrder ? "Sales Order" : "Quotation"}
                </Badge>
                <Badge className={`text-xs border ${STATUS_COLORS[doc.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                  {STATUS_LABELS[doc.status] ?? doc.status}
                </Badge>
                {doc.aiGenerated && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700 border border-violet-200">
                    🤖 AI
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Dibuat {dateTimeStr(doc.createdAt)}
                {doc.confirmedAt ? ` · Dikonfirmasi ${dateTimeStr(doc.confirmedAt)}` : ""}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* PDF */}
            <Button variant="outline" size="sm" onClick={handleDownloadPdf} disabled={pdfLoading} className="gap-2">
              {pdfLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Printer className="h-3.5 w-3.5" />}
              PDF
            </Button>

            {/* Edit — hanya untuk draft/sent */}
            {isEditable && (
              <Button variant="outline" size="sm" asChild className="gap-2">
                <Link href={`/sales/documents/${docId}/edit`}>
                  <FileEdit className="h-3.5 w-3.5" /> Edit
                </Link>
              </Button>
            )}

            {/* Send — draft only */}
            {doc.status === "draft" && (
              <Button size="sm" variant="outline" className="gap-2 text-blue-600 border-blue-200 hover:bg-blue-50"
                onClick={() => handleAction("send", "Kirim ke customer")}
                disabled={actionLoading === "send"}
              >
                {actionLoading === "send" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                Kirim
              </Button>
            )}

            {/* Confirm — draft or sent */}
            {(doc.status === "draft" || doc.status === "sent") && (
              <Button size="sm" className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                onClick={() => handleAction("confirm", "Konfirmasi sebagai Sales Order")}
                disabled={actionLoading === "confirm"}
              >
                {actionLoading === "confirm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Konfirmasi
              </Button>
            )}

            {/* Mark Delivered — confirmed SO */}
            {isOrder && isConfirmed && doc.deliveryStatus !== "delivered" && (
              <Button size="sm" variant="outline" className="gap-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                onClick={() => handleAction("mark_delivered", "Tandai sudah dikirim")}
                disabled={actionLoading === "mark_delivered"}
              >
                {actionLoading === "mark_delivered" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Truck className="h-3.5 w-3.5" />}
                Tandai Terkirim
              </Button>
            )}

            {/* Mark Invoiced — confirmed SO */}
            {isOrder && (isConfirmed || isDone) && doc.invoiceStatus !== "invoiced" && (
              <Button size="sm" variant="outline" className="gap-2 text-orange-600 border-orange-200 hover:bg-orange-50"
                onClick={() => handleAction("mark_invoiced", "Buat invoice untuk dokumen ini")}
                disabled={actionLoading === "mark_invoiced"}
              >
                {actionLoading === "mark_invoiced" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Receipt className="h-3.5 w-3.5" />}
                Buat Invoice
              </Button>
            )}

            {/* Cancel */}
            {!isCancelled && !isDone && (
              <Button size="sm" variant="ghost"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => handleAction("cancel", "Batalkan dokumen ini")}
                disabled={actionLoading === "cancel"}
              >
                {actionLoading === "cancel" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                Batalkan
              </Button>
            )}

            {/* Delete — hanya draft */}
            {doc.status === "draft" && (
              <Button size="sm" variant="ghost"
                className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={handleDelete}
                disabled={actionLoading === "delete"}
              >
                {actionLoading === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            )}
          </div>
        </div>

        {/* ── Info Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

          {/* Customer */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" /> Customer
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 divide-y divide-border/50">
              <InfoRow label="Nama" value={<span className="font-semibold">{doc.customerName}</span>} />
              {doc.customerAddress && (
                <InfoRow label="Alamat" value={doc.customerAddress} />
              )}
            </CardContent>
          </Card>

          {/* Tanggal & Status */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" /> Tanggal & Status
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-0 divide-y divide-border/50">
              <InfoRow label="Dibuat" value={dateStr(doc.createdAt)} />
              {doc.validUntil && (
                <InfoRow label="Berlaku hingga" value={dateStr(doc.validUntil)} />
              )}
              {doc.expectedDate && (
                <InfoRow label="Tanggal kirim" value={dateStr(doc.expectedDate)} />
              )}
              {isOrder && (
                <>
                  <InfoRow
                    label="Invoice"
                    value={
                      <Badge variant="outline" className="text-xs">
                        {INVOICE_LABELS[doc.invoiceStatus] ?? doc.invoiceStatus}
                      </Badge>
                    }
                  />
                  <InfoRow
                    label="Pengiriman"
                    value={
                      <Badge variant="outline" className="text-xs">
                        {DELIVERY_LABELS[doc.deliveryStatus ?? "to_deliver"] ?? doc.deliveryStatus}
                      </Badge>
                    }
                  />
                  <InfoRow
                    label="Pembayaran"
                    value={
                      <Badge className={`text-xs border ${PAYMENT_COLORS[doc.paymentStatus ?? "unpaid"] ?? ""}`}>
                        {PAYMENT_LABELS[doc.paymentStatus ?? "unpaid"] ?? doc.paymentStatus}
                      </Badge>
                    }
                  />
                </>
              )}
              {doc.invoiceNumber && (
                <InfoRow label="No. Invoice" value={doc.invoiceNumber} mono />
              )}
              {doc.dueDate && (
                <InfoRow label="Jatuh tempo" value={dateStr(doc.dueDate)} />
              )}
            </CardContent>
          </Card>

          {/* Pengiriman (jika ada) */}
          {(doc.origin || doc.destination || doc.transportMode) && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" /> Pengiriman
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0 divide-y divide-border/50">
                {doc.origin && <InfoRow label="Asal" value={doc.origin} />}
                {doc.destination && <InfoRow label="Tujuan" value={doc.destination} />}
                {doc.transportMode && <InfoRow label="Moda" value={doc.transportMode} />}
                {doc.etd && <InfoRow label="ETD" value={dateStr(doc.etd)} />}
                {doc.eta && <InfoRow label="ETA" value={dateStr(doc.eta)} />}
              </CardContent>
            </Card>
          )}

          {/* Catatan (jika ada) */}
          {doc.notes && (
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <FileText className="h-4 w-4 text-muted-foreground" /> Catatan
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{doc.notes}</p>
              </CardContent>
            </Card>
          )}

          {/* Link ke Logistic Order (jika ada) */}
          {doc.logisticOrderId && (
            <Card className="border-indigo-200/60 bg-indigo-50/30">
              <CardContent className="px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-indigo-500" />
                  <span className="text-sm text-indigo-700 font-medium">Terhubung ke Logistic Order</span>
                </div>
                <Button variant="outline" size="sm" asChild className="gap-1.5 text-indigo-600 border-indigo-200 hover:bg-indigo-100">
                  <Link href={`/logistics/orders/${doc.logisticOrderId}`}>
                    Lihat <ExternalLink className="h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Line Items Table ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-muted-foreground" /> Item / Jasa
              <span className="ml-auto text-xs text-muted-foreground font-normal">{doc.lines?.length ?? 0} baris</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30">
                  <TableHead className="pl-4 w-8">#</TableHead>
                  <TableHead>Nama / Deskripsi</TableHead>
                  <TableHead className="text-right w-28">Qty</TableHead>
                  <TableHead className="text-right w-36">Harga Satuan</TableHead>
                  <TableHead className="text-right w-36 pr-4">Subtotal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(doc.lines ?? []).map((line, idx) => (
                  <TableRow key={line.id ?? idx}>
                    <TableCell className="pl-4 text-muted-foreground text-sm">{idx + 1}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{line.name}</p>
                      {line.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{line.description}</p>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {Number(line.quantity).toLocaleString("id-ID")}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {idr(line.unitPrice)}
                    </TableCell>
                    <TableCell className="text-right text-sm font-medium tabular-nums pr-4">
                      {idr(line.subtotal)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>

          {/* Totals */}
          <div className="px-4 py-4 border-t">
            <div className="ml-auto max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Subtotal</span>
                <span className="tabular-nums">{idr(subtotal)}</span>
              </div>
              {taxAmount > 0 && (
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Pajak</span>
                  <span className="tabular-nums">{idr(taxAmount)}</span>
                </div>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Grand Total</span>
                <span className="tabular-nums text-emerald-700">{idr(grandTotal)}</span>
              </div>
              {isOrder && amountPaid > 0 && (
                <>
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>Sudah Dibayar</span>
                    <span className="tabular-nums text-emerald-600">({idr(amountPaid)})</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between text-sm font-semibold">
                    <span>Sisa Tagihan</span>
                    <span className={`tabular-nums ${amountDue > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                      {idr(amountDue)}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </Card>

        {/* ── Footer timestamps ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground px-1">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> Dibuat {dateTimeStr(doc.createdAt)}
          </span>
          {doc.updatedAt !== doc.createdAt && (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" /> Diperbarui {dateTimeStr(doc.updatedAt)}
            </span>
          )}
        </div>

      </div>
    </AppShell>
  );
}
