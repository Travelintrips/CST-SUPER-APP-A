import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, Loader2,
  Building2, Phone, Mail, Package, ExternalLink,
  ChevronRight, AlertCircle, User,
} from "lucide-react";
import { Link } from "wouter";

interface AuditEntry {
  id: number;
  actorName: string | null;
  description: string | null;
  oldValue: { status?: string } | null;
  newValue: { status?: string; fulfillmentId?: number; notes?: string | null } | null;
  createdAt: string;
}

interface VendorFulfillmentDetail {
  id: number;
  orderId: number;
  orderItemId: number;
  vendorCatalogItemId: number;
  vendorId: number;
  serviceType: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  fulfillmentPayload: unknown;
  calculationInput: unknown;
  templateSnapshot: unknown;
  priceSnapshot: unknown;
  allowedTransitions: string[];
  order: {
    orderNumber: string;
    customerName: string;
    companyName: string;
    status: string;
  };
  item: {
    serviceName: string;
    category: string;
    subtotal: number;
    inputData: unknown;
    itemSource: string;
  };
  vendor: {
    id: number;
    name: string;
    phone: string | null;
    email: string | null;
  };
  catalogItem: {
    id: number;
    name: string;
    unit: string | null;
    kategori: string | null;
    description: string | null;
    priceBase: string;
    markupPct: string;
    priceSell: string | null;
  } | null;
  auditHistory: AuditEntry[];
}

const STATUS_COLORS: Record<string, string> = {
  pending:     "bg-yellow-100 text-yellow-800 border-yellow-200",
  confirmed:   "bg-blue-100 text-blue-800 border-blue-200",
  in_progress: "bg-orange-100 text-orange-800 border-orange-200",
  completed:   "bg-green-100 text-green-800 border-green-200",
  cancelled:   "bg-red-100 text-red-800 border-red-200",
};

const STATUS_LABELS: Record<string, string> = {
  pending:     "Pending",
  confirmed:   "Dikonfirmasi",
  in_progress: "In Progress",
  completed:   "Selesai",
  cancelled:   "Dibatalkan",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending:     <Clock className="h-4 w-4" />,
  confirmed:   <CheckCircle2 className="h-4 w-4" />,
  in_progress: <Loader2 className="h-4 w-4" />,
  completed:   <CheckCircle2 className="h-4 w-4" />,
  cancelled:   <XCircle className="h-4 w-4" />,
};

const TRANSITION_LABELS: Record<string, string> = {
  confirmed:   "Konfirmasi Vendor",
  in_progress: "Tandai In Progress",
  completed:   "Tandai Selesai",
  cancelled:   "Batalkan",
};

const TRANSITION_VARIANTS: Record<string, "default" | "outline" | "destructive"> = {
  confirmed:   "default",
  in_progress: "default",
  completed:   "default",
  cancelled:   "destructive",
};

const TIMELINE_STEPS = ["pending", "confirmed", "in_progress", "completed"];

const idr = (n: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n));

const fmt = (iso: string) => {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
};

function JsonBlock({ data, label }: { data: unknown; label: string }) {
  const [open, setOpen] = useState(false);
  if (data == null) return <span className="text-gray-400 text-sm">—</span>;
  return (
    <div>
      <button
        className="text-xs text-blue-600 hover:underline flex items-center gap-1"
        onClick={() => setOpen(!open)}
      >
        {open ? "Sembunyikan" : "Lihat"} {label}
        <ChevronRight className={`h-3 w-3 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <pre className="mt-2 p-3 bg-gray-50 border rounded text-xs overflow-auto max-h-60 font-mono text-gray-700 whitespace-pre-wrap break-all">
          {JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StatusTimeline({
  currentStatus,
  auditHistory,
}: {
  currentStatus: string;
  auditHistory: AuditEntry[];
}) {
  const isCancelled = currentStatus === "cancelled";
  const currentIdx = TIMELINE_STEPS.indexOf(currentStatus);

  const getStepTime = (step: string): string | null => {
    if (step === "pending") return null;
    const entry = auditHistory.find((e) => e.newValue?.status === step);
    return entry?.createdAt ?? null;
  };

  return (
    <div className="space-y-3">
      {isCancelled ? (
        <div className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-red-700">Fulfillment Dibatalkan</p>
            {auditHistory.find((e) => e.newValue?.status === "cancelled") && (
              <p className="text-xs text-red-500 mt-0.5">
                {fmt(auditHistory.find((e) => e.newValue?.status === "cancelled")!.createdAt)}
              </p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-0">
          {TIMELINE_STEPS.map((step, idx) => {
            const isDone = currentIdx > idx || currentStatus === step && step === "completed";
            const isCurrent = currentStatus === step;
            const stepTime = getStepTime(step);

            return (
              <div key={step} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold
                      ${isDone || (isCurrent && step === "completed")
                        ? "bg-green-500 border-green-500 text-white"
                        : isCurrent
                        ? "bg-blue-500 border-blue-500 text-white"
                        : "bg-white border-gray-300 text-gray-400"
                      }`}
                  >
                    {isDone || (isCurrent && step === "completed") ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <div className="mt-1 text-center">
                    <p className={`text-xs font-medium ${isCurrent ? "text-blue-600" : isDone ? "text-green-600" : "text-gray-400"}`}>
                      {STATUS_LABELS[step]}
                    </p>
                    {stepTime && (
                      <p className="text-xs text-gray-400 whitespace-nowrap">
                        {new Date(stepTime).toLocaleDateString("id-ID", { day: "2-digit", month: "short" })}
                      </p>
                    )}
                  </div>
                </div>
                {idx < TIMELINE_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mb-6 ${currentIdx > idx ? "bg-green-400" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LogisticsVendorFulfillmentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [actionDialog, setActionDialog] = useState<{ status: string; label: string } | null>(null);
  const [notes, setNotes] = useState("");

  const { data, isLoading, error } = useQuery<VendorFulfillmentDetail>({
    queryKey: ["vendor-fulfillment-detail", id],
    queryFn: async () => {
      const res = await fetch(`/api/logistic/vendor-fulfillments/${id}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Gagal memuat data");
      }
      return res.json();
    },
    enabled: !!id,
  });

  const mutation = useMutation({
    mutationFn: async ({ status, notes }: { status: string; notes: string }) => {
      const res = await fetch(`/api/logistic/vendor-fulfillments/${id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: notes.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message ?? "Gagal update status");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Status berhasil diperbarui" });
      qc.invalidateQueries({ queryKey: ["vendor-fulfillment-detail", id] });
      qc.invalidateQueries({ queryKey: ["vendor-fulfillments"] });
      setActionDialog(null);
      setNotes("");
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Gagal", description: err.message });
    },
  });

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-24 text-gray-400">
          <Loader2 className="h-6 w-6 animate-spin mr-2" />
          Memuat data...
        </div>
      </AppShell>
    );
  }

  if (error || !data) {
    return (
      <AppShell>
        <div className="p-6">
          <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            <AlertCircle className="h-5 w-5 flex-shrink-0" />
            <p>{(error as Error)?.message ?? "Data tidak ditemukan"}</p>
          </div>
          <Link href="/logistics/vendor-fulfillments">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Kembali
            </Button>
          </Link>
        </div>
      </AppShell>
    );
  }

  const allowedActions = data.allowedTransitions.filter((s) => s !== "cancelled");
  const canCancel = data.allowedTransitions.includes("cancelled");

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* ── Breadcrumb ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/logistics/vendor-fulfillments">
            <span className="hover:text-gray-900 cursor-pointer">Vendor Fulfillment</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-gray-900 font-medium">#{data.id}</span>
        </div>

        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Vendor Fulfillment #{data.id}</h1>
              <Badge className={`text-sm border ${STATUS_COLORS[data.status] ?? "bg-gray-100 text-gray-700 border-gray-200"}`}>
                <span className="flex items-center gap-1.5">
                  {STATUS_ICONS[data.status]}
                  {STATUS_LABELS[data.status] ?? data.status}
                </span>
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500 flex-wrap">
              <span>
                Order:{" "}
                <Link href={`/logistics/portal-orders/${data.orderId}`}>
                  <span className="font-mono text-blue-600 hover:underline cursor-pointer">
                    {data.order.orderNumber || `#${data.orderId}`}
                  </span>
                </Link>
              </span>
              <span>·</span>
              <span>
                {data.order.customerName}
                {data.order.companyName && ` (${data.order.companyName})`}
              </span>
              <span>·</span>
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-100 text-xs">
                {data.serviceType || "—"}
              </span>
            </div>
          </div>

          <Link href={`/logistics/portal-orders/${data.orderId}`}>
            <Button variant="outline" size="sm">
              <ExternalLink className="h-4 w-4 mr-2" />
              Buka Order
            </Button>
          </Link>
        </div>

        {/* ── Status Timeline ──────────────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Status Fulfillment</CardTitle>
          </CardHeader>
          <CardContent>
            <StatusTimeline currentStatus={data.status} auditHistory={data.auditHistory} />

            {data.adminNotes && (
              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
                <span className="font-medium">Catatan Admin:</span> {data.adminNotes}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Main grid ────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Order Item */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Package className="h-4 w-4 text-blue-500" />
                Item Order
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Nama Layanan</p>
                <p className="font-medium">{data.item.serviceName || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Kategori</p>
                <p className="text-sm">{data.item.category || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Subtotal Item</p>
                <p className="text-sm font-medium tabular-nums">
                  {data.item.subtotal > 0 ? idr(data.item.subtotal) : "—"}
                </p>
              </div>
              {data.item.inputData && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Calculation Input</p>
                  <JsonBlock data={data.item.inputData} label="input" />
                </div>
              )}
              {data.calculationInput && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Fulfillment Calculation</p>
                  <JsonBlock data={data.calculationInput} label="kalkulasi" />
                </div>
              )}
              {data.templateSnapshot && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Template Snapshot</p>
                  <JsonBlock data={data.templateSnapshot} label="template" />
                </div>
              )}
              {data.priceSnapshot && (
                <div>
                  <p className="text-xs text-gray-500 mb-1">Price Snapshot</p>
                  <JsonBlock data={data.priceSnapshot} label="harga" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* Vendor */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Building2 className="h-4 w-4 text-purple-500" />
                Vendor
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <p className="text-xs text-gray-500">Nama Vendor</p>
                <p className="font-medium">{data.vendor.name || "—"}</p>
              </div>
              {data.vendor.phone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-3.5 w-3.5 text-gray-400" />
                  <a href={`tel:${data.vendor.phone}`} className="text-blue-600 hover:underline">
                    {data.vendor.phone}
                  </a>
                  <a
                    href={`https://wa.me/${data.vendor.phone.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full hover:bg-green-200"
                  >
                    WA
                  </a>
                </div>
              )}
              {data.vendor.email && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-3.5 w-3.5 text-gray-400" />
                  <a href={`mailto:${data.vendor.email}`} className="text-blue-600 hover:underline">
                    {data.vendor.email}
                  </a>
                </div>
              )}

              {data.catalogItem && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs text-gray-500 font-medium mb-2">Catalog Item Terhubung</p>
                    <div className="p-3 bg-purple-50 border border-purple-100 rounded-lg space-y-2">
                      <p className="font-medium text-sm">{data.catalogItem.name}</p>
                      {data.catalogItem.description && (
                        <p className="text-xs text-gray-500">{data.catalogItem.description}</p>
                      )}
                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p className="text-gray-400">Harga Dasar</p>
                          <p className="font-medium tabular-nums">{idr(data.catalogItem.priceBase)}</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Markup</p>
                          <p className="font-medium">{data.catalogItem.markupPct}%</p>
                        </div>
                        <div>
                          <p className="text-gray-400">Harga Jual</p>
                          <p className="font-medium tabular-nums">
                            {data.catalogItem.priceSell ? idr(data.catalogItem.priceSell) : "—"}
                          </p>
                        </div>
                      </div>
                      {data.catalogItem.unit && (
                        <p className="text-xs text-gray-500">Unit: {data.catalogItem.unit}</p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Riwayat Status ──────────────────────────────────────────── */}
        {data.auditHistory.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Riwayat Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.auditHistory.map((entry) => (
                  <div key={entry.id} className="flex gap-3 items-start">
                    <div className="mt-0.5 p-1.5 rounded-full bg-gray-100">
                      <User className="h-3 w-3 text-gray-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {entry.oldValue?.status && entry.newValue?.status && (
                          <div className="flex items-center gap-1.5 text-xs">
                            <Badge className={`text-xs border ${STATUS_COLORS[entry.oldValue.status] ?? ""}`}>
                              {STATUS_LABELS[entry.oldValue.status] ?? entry.oldValue.status}
                            </Badge>
                            <ChevronRight className="h-3 w-3 text-gray-400" />
                            <Badge className={`text-xs border ${STATUS_COLORS[entry.newValue.status] ?? ""}`}>
                              {STATUS_LABELS[entry.newValue.status] ?? entry.newValue.status}
                            </Badge>
                          </div>
                        )}
                        <span className="text-xs text-gray-400">
                          oleh {entry.actorName ?? "Admin"} · {fmt(entry.createdAt)}
                        </span>
                      </div>
                      {entry.newValue?.notes && (
                        <p className="text-xs text-gray-600 mt-1 italic">"{entry.newValue.notes}"</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Action Buttons ──────────────────────────────────────────── */}
        {(allowedActions.length > 0 || canCancel) && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-3">
                {allowedActions.map((status) => (
                  <Button
                    key={status}
                    variant={TRANSITION_VARIANTS[status] ?? "default"}
                    onClick={() => {
                      setNotes("");
                      setActionDialog({ status, label: TRANSITION_LABELS[status] ?? status });
                    }}
                  >
                    {STATUS_ICONS[status]}
                    <span className="ml-2">{TRANSITION_LABELS[status] ?? status}</span>
                  </Button>
                ))}
                {canCancel && (
                  <Button
                    variant="destructive"
                    onClick={() => {
                      setNotes("");
                      setActionDialog({ status: "cancelled", label: "Batalkan Fulfillment" });
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Batalkan
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Meta ─────────────────────────────────────────────────────── */}
        <div className="text-xs text-gray-400 flex gap-4">
          <span>Dibuat: {fmt(data.createdAt)}</span>
          <span>·</span>
          <span>Diperbarui: {fmt(data.updatedAt)}</span>
        </div>
      </div>

      {/* ── Action Dialog ───────────────────────────────────────────────── */}
      <Dialog open={!!actionDialog} onOpenChange={(o) => { if (!o) { setActionDialog(null); setNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{actionDialog?.label}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-gray-600">
              Ubah status fulfillment{" "}
              <span className="font-mono font-medium">#{data.id}</span>{" "}
              ke{" "}
              <Badge className={`text-xs border ${STATUS_COLORS[actionDialog?.status ?? ""] ?? ""}`}>
                {STATUS_LABELS[actionDialog?.status ?? ""] ?? actionDialog?.status}
              </Badge>
            </p>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Catatan (opsional)</Label>
              <Textarea
                placeholder="Tambahkan catatan untuk perubahan status ini..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setActionDialog(null); setNotes(""); }}>
              Batal
            </Button>
            <Button
              variant={actionDialog?.status === "cancelled" ? "destructive" : "default"}
              disabled={mutation.isPending}
              onClick={() => {
                if (actionDialog) mutation.mutate({ status: actionDialog.status, notes });
              }}
            >
              {mutation.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Konfirmasi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
