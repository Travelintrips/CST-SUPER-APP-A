import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowLeft, Search, Ship, Truck, CheckCircle2, Clock,
  MapPin, Package, RefreshCw, AlertCircle, FileText,
  Circle, ArrowRight, Loader2, ThumbsUp, ThumbsDown, RotateCcw, Tag,
  Bell, BellOff,
} from "lucide-react";
import { usePushNotification } from "@/hooks/usePushNotification";
import { formatDate } from "@/lib/utils";
import { cn } from "@/lib/utils";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

type DriverJobStatus =
  | "ASSIGNED" | "ACCEPTED" | "ON_THE_WAY_TO_PICKUP" | "ARRIVED_AT_PICKUP"
  | "PICKED_UP" | "IN_TRANSIT" | "ARRIVED_AT_DESTINATION" | "DELIVERED"
  | "COMPLETED" | "CANCELLED";

interface DriverLog { id: number; status: DriverJobStatus; timestamp: string; }
interface DriverJob {
  id: number; jobNumber: string; status: DriverJobStatus;
  vehicleType: string | null;
  pickupDateTime: string | null; deliveryDateTime: string | null;
  cargoDescription: string | null; weight: string | null;
  distance: string | null; assignedAt: string; completedAt: string | null;
  logs: DriverLog[];
}

interface RfqQuote {
  rfqId: number;
  rfqStatus: string;
  quotedPrice: number | null;
  quotedAt: string | null;
  quoteNotes: string | null;
  customerResponseNotes: string | null;
  customerRespondedAt: string | null;
}

interface OrderUpdateItem {
  id: number;
  status: string | null;
  notes: string | null;
  actorType: string;
  actorName: string | null;
  createdAt: string;
}

interface TrackingData {
  id: number; orderNumber: string;
  customerName: string;
  shipmentType: string; origin: string; destination: string;
  status: string; createdAt: string;
  grandTotal: number | null;
  subtotal: number | null;
  tax: number | null;
  items: { id: number; category: string; serviceName: string }[];
  driverJob: DriverJob | null;
  rfqQuote: RfqQuote | null;
  orderUpdates: OrderUpdateItem[];
}

async function fetchTracking(orderNumber: string): Promise<TrackingData> {
  const res = await fetch(`${BASE}/api/logistic/orders/track/${encodeURIComponent(orderNumber)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { message?: string }).message ?? "Order tidak ditemukan");
  }
  return res.json() as Promise<TrackingData>;
}

const ORDER_STEPS = [
  { key: "Order Received",    label: "Order Diterima",         icon: FileText },
  { key: "Admin Review",      label: "Review Admin",           icon: Clock },
  { key: "RFQ Sent",          label: "RFQ Terkirim",           icon: ArrowRight },
  { key: "Quote Received",    label: "Penawaran Masuk",        icon: Tag },
  { key: "Customer Approval", label: "Persetujuan",            icon: ThumbsUp },
  { key: "Vendor Confirmed",  label: "Vendor Konfirmasi",      icon: CheckCircle2 },
  { key: "In Progress",       label: "Diproses",               icon: RotateCcw },
  { key: "Pickup",            label: "Penjemputan",            icon: MapPin },
  { key: "In Transit",        label: "Dalam Perjalanan",       icon: Truck },
  { key: "Arrived",           label: "Tiba",                   icon: MapPin },
  { key: "Delivered",         label: "Terkirim",               icon: Package },
  { key: "POD Uploaded",      label: "Bukti Upload",           icon: FileText },
  { key: "Invoice Issued",    label: "Invoice",                icon: FileText },
  { key: "Payment Received",  label: "Pembayaran",             icon: CheckCircle2 },
  { key: "Completed",         label: "Selesai",                icon: CheckCircle2 },
];

const ORDER_STATUS_RANK: Record<string, number> = {
  "Order Received":    0,
  "Admin Review":      1,
  "RFQ Sent":          2,
  "Quote Received":    3,
  "Customer Approval": 4,
  "Vendor Confirmed":  5,
  "In Progress":       6,
  "Pickup":            7,
  "In Transit":        8,
  "Arrived":           9,
  "Delivered":         10,
  "POD Uploaded":      11,
  "Invoice Issued":    12,
  "Payment Received":  13,
  "Completed":         14,
  // backward compat aliases
  "New Order":         0,
  "Under Review":      1,
  "Processing":        1,
  "Quotation Sent":    3,
  "Customer Approved": 4,
  "Vendor Rejected":   2,
  "Done":              14,
};

const DRIVER_STEPS: { key: DriverJobStatus; label: string }[] = [
  { key: "ASSIGNED",              label: "Driver Ditugaskan" },
  { key: "ACCEPTED",              label: "Driver Menerima" },
  { key: "ON_THE_WAY_TO_PICKUP",  label: "Menuju Pickup" },
  { key: "ARRIVED_AT_PICKUP",     label: "Tiba di Pickup" },
  { key: "PICKED_UP",             label: "Barang Diambil" },
  { key: "IN_TRANSIT",            label: "Dalam Perjalanan" },
  { key: "ARRIVED_AT_DESTINATION", label: "Tiba di Tujuan" },
  { key: "DELIVERED",             label: "Terkirim" },
  { key: "COMPLETED",             label: "Selesai" },
];

const DRIVER_STATUS_RANK: Record<string, number> = Object.fromEntries(
  DRIVER_STEPS.map((s, i) => [s.key, i])
);

const STATUS_COLORS: Record<string, string> = {

  "Order Received":    "bg-slate-100 text-slate-700 border-slate-200",
  "Admin Review":      "bg-amber-100 text-amber-800 border-amber-200",
  "RFQ Sent":          "bg-blue-100 text-blue-700 border-blue-200",
  "Quote Received":    "bg-purple-100 text-purple-800 border-purple-200",
  "Customer Approval": "bg-violet-100 text-violet-800 border-violet-200",
  "Vendor Confirmed":  "bg-green-100 text-green-800 border-green-200",
  "In Progress":       "bg-blue-100 text-blue-800 border-blue-200",
  "Pickup":            "bg-yellow-100 text-yellow-800 border-yellow-200",
  "In Transit":        "bg-indigo-100 text-indigo-800 border-indigo-200",
  "Arrived":           "bg-cyan-100 text-cyan-800 border-cyan-200",
  "Delivered":         "bg-teal-100 text-teal-800 border-teal-200",
  "POD Uploaded":      "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Invoice Issued":    "bg-orange-100 text-orange-800 border-orange-200",
  "Payment Received":  "bg-lime-100 text-lime-800 border-lime-200",
  "Completed":         "bg-green-200 text-green-900 border-green-300",
  "Cancelled":         "bg-red-100 text-red-800 border-red-200",
  // backward compat
  "New Order":         "bg-yellow-100 text-yellow-800 border-yellow-200",
  "Processing":        "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_LABELS: Record<string, string> = {
  "Order Received":    "Order Diterima",
  "Admin Review":      "Ditinjau Admin",
  "RFQ Sent":          "Mencari Vendor",
  "Quote Received":    "Penawaran Masuk",
  "Customer Approval": "Menunggu Persetujuan Anda",
  "Vendor Confirmed":  "Vendor Dikonfirmasi",
  "Vendor Rejected":   "Vendor Menolak",
  "In Progress":       "Sedang Diproses",
  "Pickup":            "Proses Penjemputan",
  "In Transit":        "Dalam Perjalanan",
  "Arrived":           "Tiba di Tujuan",
  "Delivered":         "Terkirim",
  "POD Uploaded":      "Bukti Pengiriman Diunggah",
  "Invoice Issued":    "Invoice Diterbitkan",
  "Payment Received":  "Pembayaran Diterima",
  "Completed":         "Selesai",
  "Done":              "Selesai",
  "Cancelled":         "Dibatalkan",
  // backward compat
  "New Order":         "Order Masuk",
  "Under Review":      "Sedang Ditinjau",
  "Quotation Sent":    "Penawaran Dikirim",
  "Customer Approved": "Customer Menyetujui",
  "Processing":        "Sedang Diproses",
};

function isTerminalStatus(status: string) {
  return status === "Completed" || status === "Done" || status === "Cancelled";
}

const CUSTOMER_VISIBLE_STEPS = [
  { key: "Order Received",    label: "Order\nDiterima" },
  { key: "Admin Review",      label: "Review\nAdmin" },
  { key: "Vendor Confirmed",  label: "Vendor\nKonfirmasi" },
  { key: "In Progress",       label: "Diproses" },
  { key: "In Transit",        label: "Dalam\nPerjalanan" },
  { key: "Delivered",         label: "Terkirim" },
  { key: "Invoice Issued",    label: "Invoice" },
  { key: "Completed",         label: "Selesai" },
];

const CUSTOMER_STEP_RANK: Record<string, number> = {
  "Order Received":    0,
  "Admin Review":      1,
  "RFQ Sent":          1,
  "Quote Received":    1,
  "Customer Approval": 1,
  "Vendor Confirmed":  2,
  "In Progress":       3,
  "Pickup":            4,
  "In Transit":        4,
  "Arrived":           5,
  "Delivered":         5,
  "POD Uploaded":      6,
  "Invoice Issued":    6,
  "Payment Received":  7,
  "Completed":         7,
  "New Order":         0,
  "Processing":        1,
};

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function idr(n: number | null | undefined) {
  if (n == null) return "—";
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function OrderStepper({ status }: { status: string }) {
  const isCancelled = status === "Cancelled";
  const current = CUSTOMER_STEP_RANK[status] ?? 0;

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 my-1">
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
        <span className="text-red-700 font-semibold text-sm">Order Dibatalkan</span>
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto pb-1">
      <div className="flex items-start min-w-[480px]">
        {CUSTOMER_VISIBLE_STEPS.map((step, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <div key={step.key} className="flex items-start flex-1">
              <div className="flex flex-col items-center gap-1 flex-1">
                <div className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all flex-shrink-0 text-[10px] font-bold",
                  done   ? "bg-green-500 border-green-500 text-white" :
                  active ? "bg-primary border-primary text-primary-foreground shadow-md ring-2 ring-primary/20" :
                            "bg-muted border-border text-muted-foreground"
                )}>
                  {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <span>{i + 1}</span>}
                </div>
                <span className={cn(
                  "text-[9px] font-medium text-center leading-tight whitespace-pre-line",
                  active ? "text-primary font-semibold" :
                  done   ? "text-green-600" :
                            "text-muted-foreground"
                )}>
                  {step.label}
                </span>
              </div>
              {i < CUSTOMER_VISIBLE_STEPS.length - 1 && (
                <div className={cn(
                  "h-0.5 flex-shrink-0 w-3 mt-3.5",
                  i < current ? "bg-green-400" : "bg-border"
                )} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DriverStepper({ job }: { job: DriverJob }) {
  const current = DRIVER_STATUS_RANK[job.status] ?? 0;
  const isCancelled = job.status === "CANCELLED";
  const visibleSteps = DRIVER_STEPS.filter((s) => s.key !== "COMPLETED" || job.status === "COMPLETED");

  return (
    <div className="space-y-0">
      {visibleSteps.map((step, i) => {
        const stepRank = DRIVER_STATUS_RANK[step.key];
        const done = stepRank < current;
        const active = stepRank === current;
        const log = [...job.logs].reverse().find((l) => l.status === step.key);

        return (
          <div key={step.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                "w-7 h-7 rounded-full flex items-center justify-center border-2 flex-shrink-0 mt-0.5",
                isCancelled ? "bg-red-100 border-red-300 text-red-400" :
                done   ? "bg-green-500 border-green-500 text-white" :
                active ? "bg-primary border-primary text-primary-foreground" :
                          "bg-muted border-border text-muted-foreground"
              )}>
                {done && !isCancelled
                  ? <CheckCircle2 className="w-3.5 h-3.5" />
                  : active && !isCancelled
                    ? <Circle className="w-3.5 h-3.5 fill-current" />
                    : <Circle className="w-2 h-2" />
                }
              </div>
              {i < visibleSteps.length - 1 && (
                <div className={cn(
                  "w-0.5 flex-1 my-1",
                  done && !isCancelled ? "bg-green-400" : "bg-border"
                )} />
              )}
            </div>
            <div className={cn("pb-4", i === visibleSteps.length - 1 && "pb-0")}>
              <p className={cn(
                "text-sm font-medium",
                active && !isCancelled ? "text-primary" :
                done && !isCancelled ? "text-foreground" : "text-muted-foreground"
              )}>
                {step.label}
              </p>
              {log && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formatDateTime(log.timestamp)}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function QuoteCard({
  rfqQuote,
  orderNumber,
  onRespond,
}: {
  rfqQuote: RfqQuote;
  orderNumber: string;
  onRespond: () => void;
}) {
  const [showNotes, setShowNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [pendingResponse, setPendingResponse] = useState<"approved" | "revision_requested" | "rejected" | null>(null);
  const qc = useQueryClient();

  const respondMut = useMutation({
    mutationFn: async (payload: { response: "approved" | "revision_requested" | "rejected"; notes?: string }) => {
      const r = await fetch(`${BASE}/api/logistic/rfq/quote-respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, ...payload }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? "Gagal mengirim respons");
      return d;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tracking", orderNumber] });
      setShowNotes(false);
      setPendingResponse(null);
      setNotes("");
      onRespond();
    },
  });

  const { rfqStatus, quotedPrice, quotedAt, quoteNotes, customerResponseNotes, customerRespondedAt } = rfqQuote;

  if (rfqStatus === "customer_approved") {
    return (
      <div className="bg-card border border-green-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
          <ThumbsUp className="w-4 h-4" /> Anda telah menyetujui penawaran ini
        </div>
        <div className="text-sm text-muted-foreground">
          Tim kami akan segera memproses pengiriman Anda. Harga yang disepakati: <strong className="text-foreground">{idr(quotedPrice)}</strong>.
          {customerResponseNotes && <p className="mt-1">Catatan Anda: {customerResponseNotes}</p>}
        </div>
        {customerRespondedAt && (
          <p className="text-xs text-muted-foreground">Disetujui pada {formatDateTime(customerRespondedAt)}</p>
        )}
      </div>
    );
  }

  if (rfqStatus === "customer_rejected") {
    return (
      <div className="bg-card border border-red-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
          <ThumbsDown className="w-4 h-4" /> Anda telah menolak penawaran ini
        </div>
        <div className="text-sm text-muted-foreground">
          Tim kami akan menghubungi Anda untuk membahas opsi lain.
          {customerResponseNotes && <p className="mt-1">Alasan Anda: {customerResponseNotes}</p>}
        </div>
        {customerRespondedAt && (
          <p className="text-xs text-muted-foreground">Ditolak pada {formatDateTime(customerRespondedAt)}</p>
        )}
      </div>
    );
  }

  if (rfqStatus === "customer_revision_requested") {
    return (
      <div className="bg-card border border-yellow-200 rounded-xl p-5 space-y-3">
        <div className="flex items-center gap-2 text-yellow-700 font-semibold text-sm">
          <RotateCcw className="w-4 h-4" /> Anda telah meminta revisi penawaran
        </div>
        <div className="text-sm text-muted-foreground">
          Tim kami sedang meninjau permintaan revisi Anda dan akan menghubungi Anda kembali.
          {customerResponseNotes && <p className="mt-1">Catatan Anda: {customerResponseNotes}</p>}
        </div>
        {customerRespondedAt && (
          <p className="text-xs text-muted-foreground">Diminta pada {formatDateTime(customerRespondedAt)}</p>
        )}
      </div>
    );
  }

  if (rfqStatus === "customer_quoted" && quotedPrice != null) {
    return (
      <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center gap-2 text-primary font-semibold text-sm">
          <Tag className="w-4 h-4" /> Penawaran Harga Tersedia
        </div>
        <p className="text-xs text-muted-foreground">
          Tim kami telah menyiapkan penawaran terbaik untuk pengiriman Anda. Silakan tinjau dan berikan respons Anda.
        </p>

        <div className="bg-muted/40 rounded-lg px-4 py-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Harga Penawaran</span>
            <span className="text-xl font-bold text-foreground">{idr(quotedPrice)}</span>
          </div>
          {quotedAt && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Dikirim</span>
              <span>{formatDateTime(quotedAt)}</span>
            </div>
          )}
          {quoteNotes && (
            <div className="text-xs text-muted-foreground bg-background rounded p-2 border border-border">
              📝 {quoteNotes}
            </div>
          )}
        </div>

        {respondMut.isError && (
          <p className="text-xs text-red-500">{(respondMut.error as Error).message}</p>
        )}

        {respondMut.isSuccess && !showNotes && (
          <p className="text-xs text-green-600 font-medium">✓ Respons berhasil dikirim. Terima kasih!</p>
        )}

        {showNotes && pendingResponse && (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {pendingResponse === "revision_requested"
                ? "Apa yang perlu direvisi? (opsional)"
                : pendingResponse === "rejected"
                  ? "Alasan penolakan (opsional)"
                  : "Catatan tambahan (opsional)"}
            </p>
            <Textarea
              placeholder={
                pendingResponse === "revision_requested"
                  ? "Contoh: Harga terlalu tinggi, mohon diskusikan lagi..."
                  : pendingResponse === "rejected"
                    ? "Contoh: Sudah mendapatkan vendor lain..."
                    : "Catatan untuk tim kami..."
              }
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="text-sm"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => { setShowNotes(false); setPendingResponse(null); setNotes(""); }}
                disabled={respondMut.isPending}
              >
                Batal
              </Button>
              <Button
                size="sm"
                className={cn(
                  "flex-1",
                  pendingResponse === "approved" && "bg-green-600 hover:bg-green-700",
                  pendingResponse === "revision_requested" && "bg-yellow-600 hover:bg-yellow-700",
                  pendingResponse === "rejected" && "bg-red-600 hover:bg-red-700",
                )}
                onClick={() => respondMut.mutate({ response: pendingResponse, notes: notes || undefined })}
                disabled={respondMut.isPending}
              >
                {respondMut.isPending
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : pendingResponse === "approved" ? "Konfirmasi Setuju"
                    : pendingResponse === "revision_requested" ? "Kirim Permintaan Revisi"
                      : "Konfirmasi Tolak"}
              </Button>
            </div>
          </div>
        )}

        {!showNotes && !respondMut.isSuccess && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground text-center">Berikan respons Anda:</p>
            <div className="grid grid-cols-3 gap-2">
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white text-xs"
                onClick={() => { setPendingResponse("approved"); setShowNotes(true); }}
                disabled={respondMut.isPending}
              >
                <ThumbsUp className="w-3.5 h-3.5 mr-1" /> Setuju
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-yellow-700 border-yellow-300 hover:bg-yellow-50 text-xs"
                onClick={() => { setPendingResponse("revision_requested"); setShowNotes(true); }}
                disabled={respondMut.isPending}
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1" /> Revisi
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-red-600 border-red-300 hover:bg-red-50 text-xs"
                onClick={() => { setPendingResponse("rejected"); setShowNotes(true); }}
                disabled={respondMut.isPending}
              >
                <ThumbsDown className="w-3.5 h-3.5 mr-1" /> Tolak
              </Button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}

// ── Status-change notification banner ────────────────────────────────────────
function StatusChangeBanner({
  prevStatus,
  newStatus,
  onDismiss,
}: {
  prevStatus: string;
  newStatus: string;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="animate-in slide-in-from-top-2 fade-in duration-300 bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
      <Bell className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p className="text-sm font-semibold text-green-800">Status Pengiriman Diperbarui</p>
        <p className="text-xs text-green-700 mt-0.5">
          <span className="line-through opacity-60">{STATUS_LABELS[prevStatus] ?? prevStatus}</span>
          {" → "}
          <strong>{STATUS_LABELS[newStatus] ?? newStatus}</strong>
        </p>
      </div>
      <button onClick={onDismiss} className="text-green-500 hover:text-green-700 text-xs font-medium">
        Tutup
      </button>
    </div>
  );
}

// ── Countdown + live indicator ────────────────────────────────────────────────
const ACTIVE_INTERVAL   = 15;
const TERMINAL_INTERVAL = 60;

function AutoRefreshBar({
  isTerminal,
  isFetching,
  lastRefreshed,
  onRefresh,
  sseConnected,
}: {
  isTerminal: boolean;
  isFetching: boolean;
  lastRefreshed: Date | null;
  onRefresh: () => void;
  sseConnected: boolean;
}) {
  const intervalSec = isTerminal ? TERMINAL_INTERVAL : ACTIVE_INTERVAL;
  const [countdown, setCountdown] = useState(intervalSec);

  useEffect(() => {
    setCountdown(intervalSec);
  }, [lastRefreshed, intervalSec]);

  useEffect(() => {
    if (isTerminal) return;
    const t = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? intervalSec : prev - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [isTerminal, intervalSec, lastRefreshed]);

  return (
    <div className="flex items-center justify-between text-xs text-muted-foreground">
      <div className="flex items-center gap-2">
        {isFetching ? (
          <RefreshCw className="w-3 h-3 animate-spin text-primary" />
        ) : isTerminal ? (
          <CheckCircle2 className="w-3 h-3 text-green-500" />
        ) : sseConnected ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-gray-400" />
          </span>
        )}
        <span>
          {isFetching
            ? "Memperbarui..."
            : isTerminal
              ? "Order selesai — tracking dihentikan"
              : sseConnected
                ? `Live · SSE aktif — refresh dalam ${countdown}d`
                : `Menghubungkan ulang... — refresh dalam ${countdown}d`}
        </span>
      </div>
      {!isTerminal && (
        <button
          onClick={onRefresh}
          disabled={isFetching}
          className="flex items-center gap-1 hover:text-foreground transition-colors disabled:opacity-50"
        >
          <RefreshCw className="w-3 h-3" />
          Perbarui
        </button>
      )}
    </div>
  );
}

// ── Push Notification Toggle ──────────────────────────────────────────────────
function PushToggle({ orderNumber }: { orderNumber: string | null }) {
  const { state, subscribe, unsubscribe } = usePushNotification(orderNumber);

  if (state === "unsupported" || !orderNumber) return null;

  if (state === "denied") {
    return (
      <div className="text-xs text-muted-foreground flex items-center gap-1.5 px-3 py-2 rounded-lg bg-muted/60">
        <BellOff className="w-3.5 h-3.5 flex-shrink-0" />
        Notifikasi diblokir — aktifkan di pengaturan browser
      </div>
    );
  }

  if (state === "subscribed") {
    return (
      <button
        onClick={unsubscribe}
        className="flex items-center gap-2 text-xs text-primary font-medium px-3 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors"
      >
        <Bell className="w-3.5 h-3.5 fill-primary" />
        Notifikasi aktif — klik untuk matikan
      </button>
    );
  }

  return (
    <button
      onClick={subscribe}
      disabled={state === "loading"}
      className="flex items-center gap-2 text-xs text-muted-foreground font-medium px-3 py-2 rounded-lg border border-border hover:bg-muted/60 transition-colors disabled:opacity-50"
    >
      {state === "loading"
        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
        : <Bell className="w-3.5 h-3.5" />}
      Aktifkan notifikasi browser
    </button>
  );
}

export default function TrackPage() {
  const [, setLocation] = useLocation();
  const { orderNumber: pathOrderNumber } = useParams<{ orderNumber?: string }>();
  const [input, setInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [sseConnected, setSseConnected] = useState(false);
  const sseReconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const qc = useQueryClient();

  const prevStatusRef = useRef<string | null>(null);
  const prevDriverStatusRef = useRef<string | null>(null);
  const [statusChangeBanner, setStatusChangeBanner] = useState<{ prev: string; next: string } | null>(null);

  useEffect(() => {
    if (pathOrderNumber) {
      const n = pathOrderNumber.toUpperCase().trim();
      setInput(n);
      setSearchTerm(n);
      return;
    }
    const qp = new URLSearchParams(window.location.search);
    const o = qp.get("order");
    if (o) { setInput(o); setSearchTerm(o.toUpperCase().trim()); }
  }, [pathOrderNumber]);

  // Real-time: SSE dengan auto-reconnect + connection state tracking
  useEffect(() => {
    let mounted = true;

    function connect() {
      const es = new EventSource("/api/ecommerce/events");

      es.onopen = () => { if (mounted) setSseConnected(true); };
      es.onerror = () => {
        if (!mounted) return;
        setSseConnected(false);
        es.close();
        // Auto-reconnect setelah 5 detik
        sseReconnectRef.current = setTimeout(() => {
          if (mounted) connect();
        }, 5000);
      };

      const invalidateIfMatch = (e: MessageEvent) => {
        try {
          const data = JSON.parse(e.data);
          if (searchTerm && data.orderNumber === searchTerm) {
            qc.invalidateQueries({ queryKey: ["tracking", searchTerm] });
          }
        } catch { }
      };
      es.addEventListener("logistic_order_status_changed", invalidateIfMatch);
      es.addEventListener("vendor_quote_received", invalidateIfMatch);

      return es;
    }

    const es = connect();

    return () => {
      mounted = false;
      setSseConnected(false);
      if (sseReconnectRef.current) clearTimeout(sseReconnectRef.current);
      es.close();
    };
  }, [searchTerm, qc]);

  const isTerminal = !!(lastRefreshed && prevStatusRef.current && isTerminalStatus(prevStatusRef.current));

  const {
    data: tracking, isLoading, isError, error, refetch, isFetching,
  } = useQuery<TrackingData, Error>({
    queryKey: ["tracking", searchTerm],
    queryFn: () => fetchTracking(searchTerm),
    enabled: !!searchTerm,
    refetchInterval: isTerminal
      ? false
      : (ACTIVE_INTERVAL * 1000),
    staleTime: 5_000,
  });

  useEffect(() => {
    if (!tracking) return;
    const prev = prevStatusRef.current;

    // Deteksi perubahan order status
    if (prev !== null && prev !== tracking.status) {
      setStatusChangeBanner({ prev, next: tracking.status });
    }
    prevStatusRef.current = tracking.status;

    // Deteksi perubahan driver status
    if (tracking.driverJob) {
      prevDriverStatusRef.current = tracking.driverJob.status;
    }

    setLastRefreshed(new Date());
  }, [tracking]);

  function handleSearch() {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return;
    prevStatusRef.current = null;
    prevDriverStatusRef.current = null;
    setStatusChangeBanner(null);
    setLastRefreshed(null);
    setSearchTerm(trimmed);
  }

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const isOrderTerminal = tracking ? isTerminalStatus(tracking.status) : false;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-foreground">Lacak Pengiriman</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground mb-1">Tracking Order</h1>
          <p className="text-sm text-muted-foreground">Masukkan nomor order untuk melihat status pengiriman secara real-time.</p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder="Contoh: LOG-250513-12345"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="font-mono uppercase"
          />
          <Button onClick={handleSearch} disabled={isLoading}>
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            <span className="ml-1 hidden sm:inline">{isLoading ? "Mencari..." : "Cari"}</span>
          </Button>
        </div>

        {isError && (
          <div className="text-center py-10 text-muted-foreground">
            <AlertCircle className="w-10 h-10 mx-auto mb-3 text-red-400" />
            <p className="font-medium text-foreground">Order tidak ditemukan</p>
            <p className="text-sm mt-1">{error?.message ?? "Pastikan nomor order sudah benar."}</p>
          </div>
        )}

        {tracking && (
          <div className="space-y-4">

            {/* Status change banner */}
            {statusChangeBanner && (
              <StatusChangeBanner
                prevStatus={statusChangeBanner.prev}
                newStatus={statusChangeBanner.next}
                onDismiss={() => setStatusChangeBanner(null)}
              />
            )}

            {/* Auto-refresh bar */}
            <AutoRefreshBar
              isTerminal={isOrderTerminal}
              isFetching={isFetching}
              lastRefreshed={lastRefreshed}
              onRefresh={handleRefresh}
              sseConnected={sseConnected}
            />

            {/* Push notification toggle */}
            <PushToggle orderNumber={searchTerm || null} />

            {/* Penawaran harga */}
            {tracking.rfqQuote && ["customer_quoted", "customer_approved", "customer_rejected", "customer_revision_requested"].includes(tracking.rfqQuote.rfqStatus) && (
              <QuoteCard
                rfqQuote={tracking.rfqQuote}
                orderNumber={tracking.orderNumber}
                onRespond={() => {
                  setTimeout(() => refetch(), 1000);
                }}
              />
            )}

            {/* Header — order number & status */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Nomor Order</p>
                  <p className="text-xl font-bold font-mono text-foreground">{tracking.orderNumber}</p>
                </div>
                <Badge className={cn("border font-medium", STATUS_COLORS[tracking.status] ?? "bg-gray-100 text-gray-800")}>
                  {STATUS_LABELS[tracking.status] ?? tracking.status}
                </Badge>
              </div>
              <Separator className="mb-4" />

              {/* Route */}
              <div className="flex items-center gap-2 mb-4 bg-muted/40 rounded-lg px-4 py-3">
                <div className="text-center flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Asal</p>
                  <p className="font-semibold text-sm text-foreground leading-tight">{tracking.origin}</p>
                </div>
                <div className="flex flex-col items-center gap-1 flex-shrink-0">
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">{tracking.shipmentType}</span>
                </div>
                <div className="text-center flex-1">
                  <p className="text-xs text-muted-foreground mb-0.5">Tujuan</p>
                  <p className="font-semibold text-sm text-foreground leading-tight">{tracking.destination}</p>
                </div>
              </div>

              {/* Order stepper */}
              <OrderStepper status={tracking.status} />

              <Separator className="mt-5 mb-4" />
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium text-foreground text-right">{tracking.customerName}</span>
                <span className="text-muted-foreground">Tgl Order</span>
                <span className="font-medium text-foreground text-right">{formatDate(tracking.createdAt)}</span>
                {tracking.subtotal != null && (
                  <>
                    <span className="text-muted-foreground">Subtotal Est.</span>
                    <span className="font-medium text-foreground text-right">{idr(tracking.subtotal)}</span>
                  </>
                )}
                {tracking.tax != null && tracking.tax > 0 && (
                  <>
                    <span className="text-muted-foreground">PPN</span>
                    <span className="font-medium text-foreground text-right">{idr(tracking.tax)}</span>
                  </>
                )}
                {tracking.grandTotal != null && (
                  <>
                    <span className="text-muted-foreground font-semibold">Total Est.</span>
                    <span className="font-bold text-foreground text-right">{idr(tracking.grandTotal)}</span>
                  </>
                )}
              </div>
            </div>

            {/* Driver job tracking */}
            {tracking.driverJob ? (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-foreground text-sm flex items-center gap-2">
                    <Truck className="w-4 h-4 text-primary" />
                    Status Pengiriman Driver
                  </h3>
                  <Badge variant="outline" className="text-xs font-mono">
                    {tracking.driverJob.jobNumber}
                  </Badge>
                </div>

                {/* Driver info */}
                <div className="bg-muted/40 rounded-lg px-4 py-3 mb-4 grid grid-cols-2 gap-y-2 text-sm">
                  {tracking.driverJob.vehicleType && (
                    <>
                      <span className="text-muted-foreground">Kendaraan</span>
                      <span className="font-medium text-right">{tracking.driverJob.vehicleType}</span>
                    </>
                  )}
                  {tracking.driverJob.pickupDateTime && (
                    <>
                      <span className="text-muted-foreground flex items-center gap-1"><MapPin className="w-3 h-3" />Est. Pickup</span>
                      <span className="font-medium text-right text-xs leading-snug">{formatDateTime(tracking.driverJob.pickupDateTime)}</span>
                    </>
                  )}
                  {tracking.driverJob.deliveryDateTime && (
                    <>
                      <span className="text-muted-foreground">Est. Tiba</span>
                      <span className="font-medium text-right text-xs leading-snug">{formatDateTime(tracking.driverJob.deliveryDateTime)}</span>
                    </>
                  )}
                </div>

                {/* Driver status timeline */}
                <DriverStepper job={tracking.driverJob} />
              </div>
            ) : (
              tracking.status !== "Completed" && (
                <div className="bg-card border border-border rounded-xl p-4 flex items-center gap-3 text-sm text-muted-foreground">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <p>Driver belum ditugaskan. Anda akan menerima notifikasi setelah order dikonfirmasi dan driver ditetapkan.</p>
                </div>
              )
            )}

            {/* Services */}
            {tracking.items.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-foreground text-sm mb-3 flex items-center gap-2">
                  <Package className="w-4 h-4 text-primary" />
                  Layanan ({tracking.items.length})
                </h3>
                <div className="space-y-2">
                  {tracking.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-3">
                      <div>
                        <Badge variant="outline" className="text-xs mr-1">{item.category}</Badge>
                        <span className="text-sm text-foreground">{item.serviceName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Riwayat Update */}
            {tracking.orderUpdates && tracking.orderUpdates.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <h3 className="font-semibold text-foreground text-sm mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Riwayat Status
                </h3>
                <div className="space-y-0">
                  {[...tracking.orderUpdates].reverse().map((update, i) => (
                    <div key={update.id} className="flex gap-3">
                      <div className="flex flex-col items-center">
                        <div className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center border-2 flex-shrink-0 mt-0.5",
                          i === tracking.orderUpdates.length - 1
                            ? "bg-primary border-primary text-primary-foreground"
                            : "bg-green-500 border-green-500 text-white"
                        )}>
                          <CheckCircle2 className="w-3 h-3" />
                        </div>
                        {i < tracking.orderUpdates.length - 1 && (
                          <div className="w-0.5 flex-1 my-1 bg-border" />
                        )}
                      </div>
                      <div className={cn("pb-4", i === tracking.orderUpdates.length - 1 && "pb-0")}>
                        {update.status && (
                          <p className="text-sm font-medium text-foreground">
                            {STATUS_LABELS[update.status] ?? update.status}
                          </p>
                        )}
                        {update.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{update.notes}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-0.5">{formatDateTime(update.createdAt)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={() => setLocation("/jasa")}>
              <Ship className="w-4 h-4 mr-2" /> Buat Order Baru
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
