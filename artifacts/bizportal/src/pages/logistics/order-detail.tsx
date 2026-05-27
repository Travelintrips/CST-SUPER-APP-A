import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft, Loader2, Copy, ExternalLink, Plus, RefreshCw, Send,
  Package, Truck, User, ClipboardList, Clock, ShieldAlert, Ship,
  ClipboardCheck, CheckCircle2, XCircle, MapPin, MessageCircle,
  Link2, FileText, AlertTriangle, Eye, EyeOff, StickyNote, Globe,
  RotateCcw, Bell, ChevronDown, ChevronUp,
} from "lucide-react";
import { Link } from "wouter";
import GpsTrackingPanel from "@/components/logistics/GpsTrackingPanel";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const idr = (n: number | string | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(Number(n)).toLocaleString("id-ID")}`;

const dt = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// ── Types ──────────────────────────────────────────────────────────────────────

type Order = {
  id: number; orderNumber: string; customerName: string; email: string; phone: string;
  shipmentType: string; origin: string; destination: string;
  commodity: string | null; cargoDescription: string | null;
  grossWeight: string | null; volumeCbm: string | null; jumlahKoli: number | null;
  status: string;
  finalSellingPrice: string | null; finalPrice: string | null; markupPercent: string | null;
  approvedVendorId: number | null;
  customerQuoteStatus: string | null;
  etaFinal: string | null; termsConditions: string | null; quoteNotes: string | null;
  vendorCost: string | null; orderMargin: string | null;
  version?: number;
  createdAt: string;
};

type Vendor = { id: number; name: string; phone: string | null } | null;

type OrderUpdate = {
  id: number; orderId: number; actorType: string; actorName: string | null;
  status: string | null; notes: string | null; attachmentUrl: string | null;
  isPublic: boolean; createdAt: string;
};

type TaskLink = { id: number; token: string; roleType: string; label: string | null; status: string; taskUrl: string; createdAt: string };
type CustomerLink = { id: number; token: string; status: string; trackUrl: string; createdAt: string };
type QuoteLink = { id: number; token: string; status: string; quoteUrl: string; finalCustomerPrice: string | null; etaFinal: string | null; createdAt: string };
type FulfillmentLink = { id: number; token: string; serviceType: string; status: string; formUrl: string; sentAt: string | null; expiresAt: string | null; submittedAt: string | null; createdAt: string };
type FulfillmentSubmission = { id: number; linkId: number; serviceType: string; fulfillmentData: Record<string, string>; submittedAt: string };

type FreightShipmentLink = {
  id: number; shipmentNumber: string; status: string;
  origin: string; destination: string; shipperName: string;
  approvedVendorName: string | null; createdAt: string;
  rfqId: number; rfqNumber: string;
};

type CustomerApproval = {
  id: number; token: string; status: string;
  customerName: string | null; customerPhone: string | null;
  sellingPrice: string | null; currency: string | null;
  soNumber: string | null; salesDocId: number | null;
  approvedAt: string | null; rejectedAt: string | null;
  expiresAt: string | null; createdAt: string;
  orderId: number | null; orderNumber: string | null;
};

type DetailData = {
  order: Order; vendor: Vendor;
  updates: OrderUpdate[];
  taskLinks: TaskLink[]; customerLinks: CustomerLink[]; quoteLinks: QuoteLink[];
  rfqs: { id: number; rfqNumber: string; status: string }[];
  freightShipments: FreightShipmentLink[];
};

type WaLog = {
  id: number;
  channel: string;
  recipient: string | null;
  subject: string | null;
  status: string;
  context: string | null;
  refType: string | null;
  refId: string | null;
  errorMsg: string | null;
  createdAt: string;
};

function WaNotificationLogPanel({ orderNumber }: { orderNumber: string }) {
  const [open, setOpen] = useState(false);
  const { data: logData, isLoading, refetch } = useQuery<{ total: number; rows: WaLog[] }>({
    queryKey: ["wa-logs", orderNumber],
    queryFn: () => apiFetch(`/api/whatsapp/notification-logs?refId=${encodeURIComponent(orderNumber)}&limit=50`),
    enabled: open,
    staleTime: 30000,
  });
  const logs = logData?.rows ?? [];

  const fmtStatus = (s: string) => {
    if (s === "sent") return <span className="text-xs text-green-600 font-medium">✓ Terkirim</span>;
    if (s === "failed") return <span className="text-xs text-red-500 font-medium">✗ Gagal</span>;
    if (s === "deduped") return <span className="text-xs text-slate-400 font-medium">↩ Duplikat</span>;
    return <span className="text-xs text-slate-500">{s}</span>;
  };

  const fmtChannel = (c: string) => c === "wa" ? "WhatsApp" : c === "email" ? "Email" : c;

  return (
    <Card className="border-slate-100">
      <CardHeader
        className="pb-2 cursor-pointer select-none"
        onClick={() => setOpen((v) => !v)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
            <Bell className="w-4 h-4" /> Log Notifikasi WA/Email
            {logData && <span className="ml-1 text-xs font-normal normal-case text-slate-400">({logData.total})</span>}
          </CardTitle>
          <div className="flex items-center gap-2">
            {open && (
              <button
                onClick={(e) => { e.stopPropagation(); void refetch(); }}
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Refresh log"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}
            {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="pt-0">
          {isLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-slate-400" /></div>
          ) : !logs || logs.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Belum ada log notifikasi</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {logs.map((log) => (
                <div key={log.id} className={`rounded border px-3 py-2 text-xs ${log.status === "failed" ? "border-red-200 bg-red-50" : log.status === "deduped" ? "border-slate-100 bg-slate-50" : "border-green-100 bg-green-50"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-slate-700">{fmtChannel(log.channel)}</span>
                    {fmtStatus(log.status)}
                  </div>
                  {log.context && <p className="text-slate-500 mt-0.5">{log.context}</p>}
                  {log.recipient && <p className="text-slate-400 truncate">→ {log.recipient}</p>}
                  {log.errorMsg && <p className="text-red-500 mt-1 text-xs">{log.errorMsg}</p>}
                  <p className="text-slate-400 mt-1">
                    {new Date(log.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

const ORDER_STATUSES = [
  "New Order", "Pending Vendor", "Vendor Confirmed", "Quotation Sent",
  "order_confirmed", "assigned_to_vendor", "waiting_pickup", "picked_up",
  "in_progress", "delivered", "pod_uploaded", "invoice_created",
  "payment_pending", "paid", "completed", "cancelled",
];

// ── Status badge color map ──────────────────────────────────────────────────────
// Covers both logistic_orders.status values and quote/customer status values.
// Unknown statuses fall back to "bg-slate-100 text-slate-700" (neutral grey).
// Keep this in sync with the status enum in the backend schema.
const STATUS_COLOR: Record<string, string> = {
  // Order lifecycle statuses
  "New Order":           "bg-yellow-100 text-yellow-800",
  "Under Review":        "bg-blue-100 text-blue-700",
  "Vendor Confirmed":    "bg-indigo-100 text-indigo-800",
  "Vendor Rejected":     "bg-red-100 text-red-800",
  "Quotation Sent":      "bg-purple-100 text-purple-800",
  "Customer Approved":   "bg-emerald-100 text-emerald-800",
  "In Progress":         "bg-indigo-100 text-indigo-800",
  "Completed":           "bg-green-200 text-green-900",
  "Cancelled":           "bg-red-100 text-red-800",
  "Done":                "bg-green-200 text-green-900",
  // Legacy / internal status keys
  order_confirmed: "bg-green-100 text-green-800",
  assigned_to_vendor: "bg-blue-100 text-blue-800",
  waiting_pickup: "bg-yellow-100 text-yellow-800",
  picked_up: "bg-blue-100 text-blue-800",
  in_progress: "bg-indigo-100 text-indigo-800",
  delivered: "bg-teal-100 text-teal-800",
  completed: "bg-green-200 text-green-900",
  cancelled: "bg-red-100 text-red-800",
  customer_quoted: "bg-purple-100 text-purple-800",
  customer_approved: "bg-emerald-100 text-emerald-800",
  customer_rejected: "bg-red-100 text-red-800",
  customer_revision_requested: "bg-amber-100 text-amber-800",
};

async function apiFetch<T>(url: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...opts });
  const data = await res.json() as T & { message?: string };
  if (!res.ok) throw new Error((data as { message?: string }).message ?? "API error");
  return data;
}

// ── Send Quote Dialog ──────────────────────────────────────────────────────────

function SendQuoteDialog({ order, rfqId, onSent }: { order: Order; rfqId: number | null; onSent: () => void }) {
  const [open, setOpen] = useState(false);
  const [price, setPrice] = useState(order.finalSellingPrice ?? "");
  const [eta, setEta] = useState(order.etaFinal ?? "");
  const [terms, setTerms] = useState(order.termsConditions ?? "");
  const [notes, setNotes] = useState(order.quoteNotes ?? "");
  const [validDays, setValidDays] = useState("3");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    if (!rfqId) { toast({ title: "Tidak ada RFQ aktif", variant: "destructive" }); return; }
    if (!price) { toast({ title: "Harga jual wajib diisi", variant: "destructive" }); return; }
    setLoading(true);
    try {
      const result = await apiFetch<{ ok: boolean; quoteUrl: string }>(`/api/logistic/rfq/${rfqId}/send-customer-quote`, {
        method: "POST",
        body: JSON.stringify({
          finalCustomerPrice: Number(price),
          etaFinal: eta || undefined,
          termsConditions: terms || undefined,
          quoteNotes: notes || undefined,
          validInDays: validDays ? Number(validDays) : 3,
        }),
      });
      toast({ title: "Penawaran terkirim ke customer!", description: "WA notifikasi dikirim." });
      navigator.clipboard.writeText(result.quoteUrl).catch(() => {});
      setOpen(false);
      onSent();
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-purple-600 hover:bg-purple-700 text-white"
        size="sm"
      >
        <Send className="w-4 h-4 mr-1" />
        Kirim Penawaran ke Customer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kirim Penawaran ke Customer</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">
              Customer: <strong>{order.customerName}</strong> · {order.phone}
            </div>
            <div className="space-y-1.5">
              <Label>Harga Jual Final ke Customer (Rp) <span className="text-red-500">*</span></Label>
              <Input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Estimasi Waktu (ETA)</Label>
              <Input value={eta} onChange={e => setEta(e.target.value)} placeholder="Contoh: 3-5 hari kerja" />
            </div>
            <div className="space-y-1.5">
              <Label>Link Berlaku (hari)</Label>
              <Input type="number" value={validDays} onChange={e => setValidDays(e.target.value)} min={1} max={30} />
            </div>
            <div className="space-y-1.5">
              <Label>Syarat &amp; Ketentuan</Label>
              <Textarea value={terms} onChange={e => setTerms(e.target.value)} rows={3}
                placeholder="Contoh: Harga belum termasuk biaya tambahan, pembayaran 50% di muka..." />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan untuk Customer</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
                placeholder="Pesan tambahan untuk customer..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSend} disabled={loading} className="bg-purple-600 hover:bg-purple-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              Kirim via WA
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Create Task Link Dialog ────────────────────────────────────────────────────

function CreateTaskLinkDialog({ orderId, vendorId, onCreated }: { orderId: number; vendorId: number | null; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [roleType, setRoleType] = useState("vendor");
  const [label, setLabel] = useState("");
  const [expiredDays, setExpiredDays] = useState("7");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleCreate = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ ok: boolean; taskUrl: string }>(`/api/logistic/orders/${orderId}/create-task-link`, {
        method: "POST",
        body: JSON.stringify({ roleType, label: label || undefined, vendorId: roleType === "vendor" ? vendorId : undefined, expiredInDays: expiredDays ? Number(expiredDays) : undefined }),
      });
      toast({ title: "Task link dibuat" });
      navigator.clipboard.writeText(result.taskUrl).catch(() => {});
      setOpen(false);
      onCreated();
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-1" />
        Buat Task Link
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Buat Task Link</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={roleType} onValueChange={setRoleType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="driver">Driver</SelectItem>
                  <SelectItem value="staff">Staff Internal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Label / Keterangan</Label>
              <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Contoh: Pickup Jakarta Pusat" />
            </div>
            <div className="space-y-1.5">
              <Label>Berlaku (hari)</Label>
              <Input type="number" value={expiredDays} onChange={e => setExpiredDays(e.target.value)} min={1} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleCreate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Buat
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Send Fulfillment Dialog ────────────────────────────────────────────────────

function SendFulfillmentDialog({ orderId, vendor, shipmentType, onSent }: {
  orderId: number;
  vendor: Vendor;
  shipmentType: string;
  onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState("7");
  const [customNote, setCustomNote] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSend = async () => {
    setLoading(true);
    try {
      const result = await apiFetch<{ ok: boolean; formUrl: string; vendorPhone: string | null }>(`/api/logistic/orders/${orderId}/send-fulfillment`, {
        method: "POST",
        body: JSON.stringify({
          expiresInDays: expiresInDays ? Number(expiresInDays) : 7,
          customNote: customNote || undefined,
        }),
      });
      toast({ title: "Form fulfillment dikirim!", description: result.vendorPhone ? "WA dikirim ke vendor." : "Link berhasil dibuat." });
      navigator.clipboard.writeText(result.formUrl).catch(() => {});
      setOpen(false);
      onSent();
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-emerald-600 hover:bg-emerald-700 text-white"
        size="sm"
      >
        <ClipboardCheck className="w-4 h-4 mr-1" />
        Kirim ke Vendor
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Kirim Form Fulfillment ke Vendor</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3 space-y-1">
              <p>Layanan: <strong>{shipmentType}</strong></p>
              {vendor && <p>Vendor: <strong className="text-blue-700">{vendor.name}</strong> {vendor.phone ? `· ${vendor.phone}` : ""}</p>}
              {!vendor && <p className="text-amber-600">⚠️ Belum ada vendor terpilih. Link tetap dibuat tanpa notifikasi WA otomatis.</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Link Berlaku (hari)</Label>
              <Input type="number" value={expiresInDays} onChange={e => setExpiresInDays(e.target.value)} min={1} max={30} />
            </div>
            <div className="space-y-1.5">
              <Label>Catatan Tambahan untuk Vendor (opsional)</Label>
              <Textarea value={customNote} onChange={e => setCustomNote(e.target.value)} rows={2}
                placeholder="Instruksi khusus, deadline, dll." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSend} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Send className="w-4 h-4 mr-1" />}
              {vendor?.phone ? "Kirim via WA" : "Buat Link"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Assign Vendor Dialog ───────────────────────────────────────────────────────

type VendorQuoteRow = {
  id: number;
  vendorId: number;
  vendorName: string | null;
  vendorPhone: string | null;
  vendorPrice: string | null;
  sellingPrice: string | null;
  quoteStatus: string | null;
  eta: string | null;
  currency: string | null;
};

type JobOrderData = {
  jobOrder: {
    id: number; order_id: number; vendor_id: number; token: string; status: string;
    driver_name: string | null; driver_phone: string | null; vehicle_plate: string | null;
    carrier: string | null; eta: string | null; accepted_at: string | null;
    rejected_at: string | null; reject_reason: string | null; completed_at: string | null;
    vendor_name: string | null;
  } | null;
  quotes: VendorQuoteRow[];
  progress: { id: number; status: string; notes: string | null; updated_by: string; created_at: string }[];
  trackingToken: string | null;
  trackingUrl: string | null;
  jobUrl: string | null;
};

function AssignVendorDialog({ orderId, onAssigned }: { orderId: number; onAssigned: () => void }) {
  const [open, setOpen] = useState(false);
  const [selectedQuoteId, setSelectedQuoteId] = useState<number | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ jobUrl: string; trackingUrl: string | null; waMessage: string; vendorPhone: string | null } | null>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: jobData } = useQuery<JobOrderData>({
    queryKey: ["order-job", orderId],
    queryFn: () => apiFetch(`/api/logistic/orders/${orderId}/job-order`),
    enabled: !isNaN(orderId) && open,
  });

  const handleAssign = async () => {
    if (!selectedQuoteId) {
      toast({ title: "Pilih quote vendor terlebih dahulu", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const r = await apiFetch<{ ok: boolean; jobUrl: string; trackingToken: string; trackingUrl: string; waMessage: string; vendorPhone: string | null }>
        (`/api/logistic/orders/${orderId}/assign-vendor`, {
          method: "POST",
          body: JSON.stringify({ quoteId: selectedQuoteId, adminNote: adminNote || undefined }),
        });
      setResult({ jobUrl: r.jobUrl, trackingUrl: r.trackingUrl, waMessage: r.waMessage, vendorPhone: r.vendorPhone });
      toast({ title: "Vendor berhasil ditugaskan!", description: "Job order telah dibuat." });
      // Invalidate both order-detail (status/price section) and order-job (driver panel).
      // All mutations in this file use ["order-detail", orderId] as the primary cache key.
      // Additional keys (order-job, order-fulfillment, order-approvals) are invalidated
      // only where the mutation specifically affects those panels.
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["order-job", orderId] });
      onAssigned();
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} disalin!` });
  };

  const QUOTE_STATUS_STYLE: Record<string, string> = {
    approved: "text-green-700 bg-green-50",
    not_selected: "text-slate-400 bg-slate-50",
    pending: "text-amber-700 bg-amber-50",
  };

  return (
    <>
      <Button onClick={() => { setOpen(true); }} className="bg-blue-600 hover:bg-blue-700 text-white" size="sm">
        <CheckCircle2 className="w-4 h-4 mr-1" />
        Tugaskan Vendor
      </Button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setResult(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              Tugaskan Vendor & Buat Job Order
            </DialogTitle>
          </DialogHeader>

          {!result ? (
            <div className="space-y-4 py-2">
              {/* Existing job order warning */}
              {jobData?.jobOrder && (
                <div className={`rounded-lg border px-4 py-3 text-sm ${
                  jobData.jobOrder.status === "accepted" ? "bg-green-50 border-green-200 text-green-800" :
                  jobData.jobOrder.status === "rejected" ? "bg-red-50 border-red-200 text-red-800" :
                  "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                  ⚠️ Job order sudah ada — Status: <strong>{jobData.jobOrder.status}</strong>
                  {jobData.jobOrder.vendor_name && ` · Vendor: ${jobData.jobOrder.vendor_name}`}
                  <br />
                  <span className="text-xs">Klik "Tugaskan" untuk mendapatkan ulang link job order.</span>
                </div>
              )}

              {/* Quote list */}
              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Pilih Vendor Pemenang</Label>
                {(!jobData?.quotes || jobData.quotes.length === 0) ? (
                  <p className="text-sm text-slate-400 py-4 text-center border border-dashed rounded-lg">
                    Belum ada quotes vendor. Buat RFQ dan tunggu respon vendor terlebih dahulu.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                    {jobData.quotes.map((q) => {
                      const isSelected = selectedQuoteId === q.id;
                      const statusStyle = QUOTE_STATUS_STYLE[q.quoteStatus ?? ""] ?? "text-slate-500 bg-slate-50";
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => setSelectedQuoteId(q.id)}
                          className={`w-full text-left rounded-xl border-2 px-4 py-3 text-sm transition-all ${
                            isSelected ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-slate-300"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="font-semibold text-slate-800">{q.vendorName ?? "—"}</div>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusStyle}`}>
                                {q.quoteStatus ?? "—"}
                              </span>
                              {isSelected && <CheckCircle2 className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                            </div>
                          </div>
                          <div className="flex gap-4 mt-1 text-slate-500 text-xs">
                            {q.vendorPrice && (
                              <span>Vendor: <strong className="text-slate-700">
                                Rp {Math.round(Number(q.vendorPrice)).toLocaleString("id-ID")}
                              </strong></span>
                            )}
                            {q.sellingPrice && (
                              <span>Jual: <strong className="text-blue-700">
                                Rp {Math.round(Number(q.sellingPrice)).toLocaleString("id-ID")}
                              </strong></span>
                            )}
                            {q.eta && <span>ETA: {q.eta}</span>}
                            {q.vendorPhone && <span>📞 {q.vendorPhone}</span>}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-sm font-semibold">Catatan untuk Vendor (opsional)</Label>
                <Textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  rows={2}
                  placeholder="Instruksi khusus, prioritas, dll."
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                <Button
                  onClick={handleAssign}
                  disabled={loading || !selectedQuoteId}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
                  Tugaskan Vendor
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <p className="text-green-800 font-semibold text-sm">✅ Vendor berhasil ditugaskan!</p>
                <p className="text-green-700 text-xs mt-1">Job order telah dibuat dan notifikasi WhatsApp disiapkan.</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Link Job Order (untuk Vendor)</Label>
                <div className="flex items-center gap-2">
                  <Input readOnly value={result.jobUrl} className="text-xs font-mono" />
                  <Button variant="outline" size="icon" onClick={() => copyText(result.jobUrl, "Link Job Order")}>
                    <Copy className="w-4 h-4" />
                  </Button>
                  <a href={result.jobUrl} target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="icon"><ExternalLink className="w-4 h-4" /></Button>
                  </a>
                </div>
              </div>

              {result.trackingUrl && (
                <div className="space-y-2">
                  <Label className="text-sm font-semibold">Link Tracking (untuk Customer)</Label>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={result.trackingUrl} className="text-xs font-mono" />
                    <Button variant="outline" size="icon" onClick={() => copyText(result.trackingUrl!, "Link Tracking")}>
                      <Copy className="w-4 h-4" />
                    </Button>
                    <a href={result.trackingUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="icon"><ExternalLink className="w-4 h-4" /></Button>
                    </a>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-semibold">Pesan WhatsApp (copy-paste ke vendor)</Label>
                <div className="relative">
                  <Textarea readOnly value={result.waMessage} rows={8} className="text-xs font-mono pr-10" />
                  <Button
                    variant="ghost" size="icon"
                    className="absolute top-2 right-2 h-7 w-7"
                    onClick={() => copyText(result.waMessage, "Pesan WA")}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                {result.vendorPhone && (
                  <p className="text-xs text-slate-500">
                    📞 Nomor vendor: <strong>{result.vendorPhone}</strong>
                    {" · "}
                    <a
                      href={`https://wa.me/${result.vendorPhone.replace(/\D/g, "")}?text=${encodeURIComponent(result.waMessage)}`}
                      target="_blank" rel="noopener noreferrer"
                      className="text-green-600 underline font-medium"
                    >
                      Buka WhatsApp
                    </a>
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); setResult(null); }}>Tutup</Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Job Order Status Panel ─────────────────────────────────────────────────────

function JobOrderPanel({ orderId }: { orderId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [progressStatus, setProgressStatus] = useState("");
  const [progressNotes, setProgressNotes] = useState("");
  const [updatingProgress, setUpdatingProgress] = useState(false);
  const [completingReview, setCompletingReview] = useState(false);

  const { data, refetch } = useQuery<JobOrderData>({
    queryKey: ["order-job", orderId],
    queryFn: () => apiFetch(`/api/logistic/orders/${orderId}/job-order`),
    enabled: !isNaN(orderId),
    refetchInterval: 20000,
  });

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: `${label} disalin!` });
  };

  const handleAddProgress = async () => {
    if (!progressStatus) return;
    setUpdatingProgress(true);
    try {
      await apiFetch(`/api/logistic/orders/${orderId}/job-progress`, {
        method: "POST",
        body: JSON.stringify({ status: progressStatus, notes: progressNotes, isPublic: true }),
      });
      toast({ title: "Progress diperbarui" });
      setProgressStatus(""); setProgressNotes("");
      refetch();
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setUpdatingProgress(false);
    }
  };

  const handleCompleteReview = async () => {
    setCompletingReview(true);
    try {
      await apiFetch(`/api/logistic/orders/${orderId}/complete-review`, {
        method: "POST",
        body: JSON.stringify({ sendCustomerNotif: true }),
      });
      toast({ title: "Order ditandai Completed", description: "Notifikasi dikirim ke customer." });
      refetch();
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCompletingReview(false);
    }
  };

  if (!data?.jobOrder) return null;

  const job = data.jobOrder;
  const JOB_STATUS_STYLE: Record<string, string> = {
    pending:          "bg-amber-50 border-amber-200 text-amber-800",
    accepted:         "bg-green-50 border-green-200 text-green-800",
    rejected:         "bg-red-50 border-red-200 text-red-800",
    in_progress:      "bg-blue-50 border-blue-200 text-blue-800",
    pickup_scheduled: "bg-indigo-50 border-indigo-200 text-indigo-800",
    completed:        "bg-emerald-50 border-emerald-200 text-emerald-800",
    problem:          "bg-orange-50 border-orange-200 text-orange-800",
  };

  const STATUS_PROGRESS_OPTIONS = [
    "Pickup Scheduled", "In Progress", "In Transit", "Delivered", "Completed", "Problem",
  ];

  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
          <MapPin className="w-4 h-4" /> Job Order & Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Job status */}
        <div className={`rounded-xl border px-3 py-2.5 text-sm font-medium ${JOB_STATUS_STYLE[job.status] ?? "bg-slate-50 border-slate-200 text-slate-700"}`}>
          Status: {job.status}
          {job.vendor_name && <span className="ml-2 font-normal">· {job.vendor_name}</span>}
        </div>

        {/* Links */}
        {data.jobUrl && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 min-w-fit">Job Order:</span>
            <code className="text-xs text-slate-600 truncate flex-1 bg-slate-50 px-2 py-1 rounded">{data.jobUrl}</code>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(data.jobUrl!, "Link Job Order")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <a href={data.jobUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
          </div>
        )}
        {data.trackingUrl && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 min-w-fit">Tracking:</span>
            <code className="text-xs text-slate-600 truncate flex-1 bg-slate-50 px-2 py-1 rounded">{data.trackingUrl}</code>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyText(data.trackingUrl!, "Link Tracking")}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <a href={data.trackingUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="ghost" size="icon" className="h-7 w-7"><ExternalLink className="h-3.5 w-3.5" /></Button>
            </a>
          </div>
        )}

        {/* Operational details (if accepted) */}
        {(job.status === "accepted" || job.status === "in_progress" || job.status === "completed") && (
          <div className="bg-slate-50 rounded-lg px-3 py-2.5 text-xs space-y-1">
            {job.driver_name && <div><span className="text-slate-400">Driver:</span> <span className="font-medium">{job.driver_name}</span> {job.driver_phone && `· ${job.driver_phone}`}</div>}
            {job.vehicle_plate && <div><span className="text-slate-400">Kendaraan:</span> <span className="font-medium">{job.vehicle_plate}</span></div>}
            {job.carrier && <div><span className="text-slate-400">Carrier:</span> <span className="font-medium">{job.carrier}</span></div>}
            {job.eta && <div><span className="text-slate-400">ETA:</span> <span className="font-medium">{job.eta}</span></div>}
          </div>
        )}

        {/* Rejected */}
        {job.status === "rejected" && (
          <div className="bg-red-50 rounded-lg px-3 py-2 text-xs text-red-700">
            ❌ Vendor menolak job.{job.reject_reason ? ` Alasan: ${job.reject_reason}` : ""}
          </div>
        )}

        {/* Admin: add progress */}
        {job.status !== "pending" && job.status !== "rejected" && job.status !== "completed" && (
          <div className="space-y-2 border-t border-slate-100 pt-3">
            <p className="text-xs font-semibold text-slate-600">Tambah Update Progress</p>
            <Select value={progressStatus} onValueChange={setProgressStatus}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Pilih status..." /></SelectTrigger>
              <SelectContent>
                {STATUS_PROGRESS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Textarea
              value={progressNotes}
              onChange={e => setProgressNotes(e.target.value)}
              rows={1}
              placeholder="Keterangan (opsional)"
              className="text-xs"
            />
            <Button
              onClick={handleAddProgress}
              disabled={updatingProgress || !progressStatus}
              size="sm"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {updatingProgress ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
              Tambah Progress
            </Button>
          </div>
        )}

        {/* Admin: complete review */}
        {(job.status === "completed" || job.status === "pod_uploaded") && (
          <Button
            onClick={handleCompleteReview}
            disabled={completingReview}
            size="sm"
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white mt-2"
          >
            {completingReview ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <CheckCircle2 className="w-3.5 h-3.5 mr-1" />}
            Konfirmasi Selesai & Notif Customer
          </Button>
        )}

        {/* Progress timeline */}
        {data.progress.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Riwayat Progress</p>
            <div className="max-h-48 overflow-y-auto space-y-2">
              {[...data.progress].reverse().map(p => (
                <div key={p.id} className="text-xs border-l-2 border-blue-100 pl-2">
                  <span className="font-medium text-slate-700">{p.status}</span>
                  {p.notes && <p className="text-slate-500">{p.notes}</p>}
                  <p className="text-slate-400">
                    {new Date(p.created_at).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}{p.updated_by}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Customer Invoice Panel (Tahap 10) ─────────────────────────────────────────

type InvoiceLink = {
  id: number; token: string; invoiceNumber: string | null;
  customerName: string | null; grandTotal: string | null;
  currency: string | null; dueDate: string | null;
  paymentStatus: string | null; acknowledgedAt: string | null;
  viewedAt: string | null; status: string; createdAt: string;
};

function CustomerInvoicePanel({
  orderId, order, salesDocId,
}: {
  orderId: number;
  order: Order;
  salesDocId: number | null | undefined;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [resending, setResending] = useState<number | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const defaultDue = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [form, setForm] = useState({
    phone: order.phone ?? "",
    invoiceNumber: "",
    notes: "",
    dueDate: defaultDue,
    sendWa: true,
  });
  const [result, setResult] = useState<{ url: string; token: string } | null>(null);

  const { data: links = [], refetch } = useQuery<InvoiceLink[]>({
    queryKey: ["customer-invoice-links", orderId],
    queryFn: () => apiFetch(`/api/vendor-form/admin/customer-invoices?orderId=${orderId}`),
    enabled: open,
    staleTime: 15000,
  });

  const openDialog = () => {
    setForm({ phone: order.phone ?? "", invoiceNumber: "", notes: "", dueDate: defaultDue, sendWa: true });
    setResult(null);
    setDialogOpen(true);
  };

  const handleCreate = async () => {
    setSending(true);
    try {
      const body: Record<string, unknown> = {
        orderId,
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        customerPhone: form.phone || undefined,
        invoiceNumber: form.invoiceNumber || undefined,
        dueDate: form.dueDate || undefined,
        notes: form.notes || undefined,
        currency: "IDR",
        sendWa: form.sendWa && !!form.phone,
      };
      if (salesDocId) body.salesDocId = salesDocId;
      const res = await fetch("/api/vendor-form/admin/customer-invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      const d = await res.json() as { success?: boolean; url?: string; token?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      setResult({ url: d.url ?? "", token: d.token ?? "" });
      toast({ title: "✅ Link invoice dibuat", description: form.sendWa && form.phone ? "WA terkirim ke customer" : "Salin link di bawah" });
      void refetch();
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const handleResendWa = async (linkId: number, phone: string) => {
    const p = prompt("No. WhatsApp customer (format: 628...):", phone);
    if (!p) return;
    setResending(linkId);
    try {
      const res = await fetch(`/api/vendor-form/admin/customer-invoices/${linkId}/send-wa`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ phone: p }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      toast({ title: "✅ WA terkirim ulang" });
    } catch (e: unknown) {
      toast({ title: "Gagal kirim WA", description: (e as Error).message, variant: "destructive" });
    } finally {
      setResending(null);
    }
  };

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link disalin!" });
  };

  const fmtMoney = (v: string | null) =>
    v == null ? "—" : `Rp ${Math.round(Number(v)).toLocaleString("id-ID")}`;

  const payBadge = (s: string | null) => {
    if (s === "paid") return <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Lunas</span>;
    if (s === "partial") return <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Sebagian</span>;
    return <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">Belum Bayar</span>;
  };

  return (
    <>
      <Card className="border-emerald-200">
        <CardHeader
          className="pb-2 cursor-pointer select-none"
          onClick={() => setOpen(v => !v)}
        >
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
              <FileText className="w-4 h-4" />
              Invoice & Pembayaran
              <span className="ml-1 text-[10px] font-normal normal-case text-slate-400 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                Tahap 10
              </span>
              {links.length > 0 && (
                <span className="text-xs font-normal normal-case text-slate-400">({links.length})</span>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {open && (
                <button
                  onClick={e => { e.stopPropagation(); void refetch(); }}
                  className="text-slate-400 hover:text-slate-600"
                  title="Refresh"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
              {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
            </div>
          </div>
        </CardHeader>

        {open && (
          <CardContent className="pt-0 space-y-3">
            {/* Existing links */}
            {links.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3">Belum ada link invoice untuk order ini</p>
            ) : (
              <div className="space-y-2">
                {links.map(lnk => (
                  <div
                    key={lnk.id}
                    className={`rounded-lg border px-3 py-2.5 space-y-2 ${lnk.acknowledgedAt ? "border-green-200 bg-green-50/40" : "border-slate-100"}`}
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        {lnk.invoiceNumber && (
                          <span className="text-xs font-mono font-semibold text-emerald-800">{lnk.invoiceNumber}</span>
                        )}
                        {payBadge(lnk.paymentStatus)}
                        {lnk.acknowledgedAt && (
                          <span className="text-[10px] text-green-600 font-medium">✅ Dikonfirmasi customer</span>
                        )}
                        {lnk.viewedAt && !lnk.acknowledgedAt && (
                          <span className="text-[10px] text-blue-500">👁 Sudah dilihat</span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          title="Kirim ulang WA"
                          disabled={resending === lnk.id}
                          onClick={() => void handleResendWa(lnk.id, order.phone ?? "")}
                        >
                          {resending === lnk.id
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Send className="h-3 w-3 text-green-600" />}
                        </Button>
                        <Button
                          variant="ghost" size="icon" className="h-6 w-6"
                          title="Salin link"
                          onClick={() => copyLink(`${window.location.origin}/customer-invoice/${lnk.token}`)}
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <a
                          href={`/customer-invoice/${lnk.token}`}
                          target="_blank" rel="noopener noreferrer"
                        >
                          <Button variant="ghost" size="icon" className="h-6 w-6" title="Buka link">
                            <ExternalLink className="h-3 w-3" />
                          </Button>
                        </a>
                      </div>
                    </div>
                    <div className="flex gap-x-4 gap-y-0.5 flex-wrap text-[11px] text-slate-500">
                      {lnk.grandTotal && <span>Total: <strong>{fmtMoney(lnk.grandTotal)}</strong></span>}
                      {lnk.dueDate && (
                        <span className={new Date(lnk.dueDate) < new Date() && lnk.paymentStatus !== "paid" ? "text-red-500 font-medium" : ""}>
                          Jatuh tempo: {new Date(lnk.dueDate).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}
                        </span>
                      )}
                      <span className="text-slate-400">
                        Dibuat: {new Date(lnk.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Create button */}
            <Button
              size="sm" className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={openDialog}
            >
              <Plus className="w-3.5 h-3.5 mr-1" />
              Buat & Kirim Link Invoice
            </Button>
          </CardContent>
        )}
      </Card>

      {/* Create Invoice Dialog */}
      <Dialog open={dialogOpen} onOpenChange={v => { if (!sending) { setDialogOpen(v); if (!v) setResult(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-emerald-600" />
              Buat Link Invoice Customer
            </DialogTitle>
          </DialogHeader>

          {result ? (
            <div className="space-y-4 py-2">
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-2xl mb-1">✅</p>
                <p className="font-semibold text-green-700 text-sm">Link Invoice Berhasil Dibuat</p>
                {form.sendWa && form.phone && (
                  <p className="text-xs text-green-600 mt-1">WA terkirim ke customer</p>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-slate-500">Link Invoice (untuk customer)</Label>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${window.location.origin}/customer-invoice/${result.token}`}
                    className="flex-1 text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-slate-50 font-mono truncate"
                  />
                  <Button
                    size="sm" variant="outline"
                    onClick={() => copyLink(`${window.location.origin}/customer-invoice/${result.token}`)}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <Button
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => { setDialogOpen(false); setResult(null); }}
              >
                Selesai
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              <div className="bg-slate-50 rounded-lg px-3 py-2 text-sm space-y-0.5">
                <p><span className="text-slate-400 text-xs">Order:</span> <span className="font-mono font-semibold">{order.orderNumber}</span></p>
                <p><span className="text-slate-400 text-xs">Customer:</span> {order.customerName}</p>
                {salesDocId && (
                  <p className="text-xs text-emerald-600">✓ Data rincian harga dari Sales Order akan diambil otomatis</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">No. Invoice <span className="text-slate-400">(opsional)</span></Label>
                <Input
                  value={form.invoiceNumber}
                  onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                  placeholder="INV/2026/001"
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">No. WhatsApp Customer</Label>
                <Input
                  value={form.phone}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="6281234567890"
                  className="h-9 text-sm font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Jatuh Tempo Pembayaran</Label>
                <Input
                  type="date"
                  value={form.dueDate}
                  min={today}
                  onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Catatan <span className="text-slate-400">(opsional)</span></Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Catatan pembayaran, cara transfer, rekening bank, dll."
                  rows={3}
                  className="text-sm resize-none"
                />
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="sendWa"
                  checked={form.sendWa}
                  onCheckedChange={v => setForm(f => ({ ...f, sendWa: v }))}
                />
                <Label htmlFor="sendWa" className="text-sm cursor-pointer">
                  Kirim link via WhatsApp ke customer
                </Label>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={sending}>Batal</Button>
                <Button
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                  onClick={() => void handleCreate()}
                  disabled={sending}
                >
                  {sending ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Membuat...</> : <><Send className="w-3.5 h-3.5 mr-1.5" />Buat & Kirim</>}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Payment Summary Panel ──────────────────────────────────────────────────────

type SalesDocSummary = {
  id: number; docNumber: string; status: string; invoiceStatus: string;
  customerName: string; totalAmount: number; taxAmount: number;
  grandTotal: number; amountPaid: number;
  lines: { id: number; name: string; quantity: number; unitPrice: number; subtotal: number }[];
};

function PaymentSummaryPanel({
  salesDocId, soNumber,
}: {
  salesDocId: number | null | undefined;
  soNumber: string | null | undefined;
}) {
  const { data: doc, isLoading, isError, refetch } = useQuery<SalesDocSummary>({
    queryKey: ["sales-doc-summary", salesDocId],
    queryFn: () => apiFetch(`/api/sales/documents/${salesDocId}`),
    enabled: salesDocId != null,
    staleTime: 30000,
  });

  const outstanding = doc ? Math.max(0, doc.grandTotal - doc.amountPaid) : 0;
  const pctPaid = doc && doc.grandTotal > 0 ? Math.round((doc.amountPaid / doc.grandTotal) * 100) : 0;

  const invoiceBadge = (s: string) => {
    if (s === "invoiced") return <span className="text-[10px] font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded-full">Invoiced</span>;
    if (s === "to_invoice") return <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">Belum Invoice</span>;
    return <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">—</span>;
  };

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      draft: "bg-slate-100 text-slate-600",
      sent: "bg-blue-100 text-blue-700",
      confirmed: "bg-emerald-100 text-emerald-700",
      done: "bg-green-200 text-green-900",
      cancelled: "bg-red-100 text-red-700",
    };
    const labels: Record<string, string> = { draft: "Draft", sent: "Terkirim", confirmed: "Dikonfirmasi", done: "Selesai", cancelled: "Dibatalkan" };
    return (
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[s] ?? "bg-slate-100 text-slate-600"}`}>
        {labels[s] ?? s}
      </span>
    );
  };

  if (!salesDocId) {
    return (
      <Card className="border-dashed border-slate-200">
        <CardContent className="py-4">
          <p className="text-xs text-slate-400 text-center">
            Ringkasan pembayaran tersedia setelah customer menyetujui penawaran dan Sales Order dibuat.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-indigo-200">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-indigo-700 uppercase tracking-wide flex items-center gap-1.5">
            <ClipboardList className="w-4 h-4" />
            Ringkasan Pembayaran SO
          </CardTitle>
          <div className="flex items-center gap-1.5">
            {doc && statusBadge(doc.status)}
            {doc && invoiceBadge(doc.invoiceStatus)}
            <button
              onClick={() => void refetch()}
              className="text-slate-400 hover:text-slate-600"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        {(doc?.docNumber ?? soNumber) && (
          <div className="flex items-center gap-2 mt-0.5">
            <span className="font-mono text-xs text-slate-500">{doc?.docNumber ?? soNumber}</span>
            <Link href={`/sales/documents/${salesDocId}`}>
              <ExternalLink className="w-3 h-3 text-indigo-400 hover:text-indigo-600 cursor-pointer" />
            </Link>
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
          </div>
        ) : isError ? (
          <p className="text-xs text-red-500 text-center py-2">Gagal memuat data SO</p>
        ) : doc ? (
          <>
            {/* Line items */}
            {doc.lines.length > 0 && (
              <div className="rounded-lg border border-slate-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-3 py-1.5 text-slate-500 font-medium">Item</th>
                      <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Qty</th>
                      <th className="text-right px-3 py-1.5 text-slate-500 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {doc.lines.map(l => (
                      <tr key={l.id} className="border-b border-slate-50 last:border-0">
                        <td className="px-3 py-1.5 text-slate-700">{l.name}</td>
                        <td className="px-3 py-1.5 text-right text-slate-500">{l.quantity}</td>
                        <td className="px-3 py-1.5 text-right font-mono text-slate-700">
                          {idr(l.subtotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Totals */}
            <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 px-3 py-2.5 space-y-1.5 text-sm">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span className="font-mono">{idr(doc.totalAmount)}</span>
              </div>
              {doc.taxAmount > 0 && (
                <div className="flex justify-between text-xs text-slate-500">
                  <span>PPN</span>
                  <span className="font-mono">{idr(doc.taxAmount)}</span>
                </div>
              )}
              <div className="flex justify-between font-semibold text-slate-800 border-t border-indigo-100 pt-1.5">
                <span className="text-xs">Total Tagihan</span>
                <span className="font-mono text-indigo-800">{idr(doc.grandTotal)}</span>
              </div>
              <div className="flex justify-between text-xs text-emerald-600">
                <span>Sudah Dibayar</span>
                <span className="font-mono font-semibold">{idr(doc.amountPaid)}</span>
              </div>
              <div className={`flex justify-between text-xs font-semibold ${outstanding > 0 ? "text-red-600" : "text-emerald-600"}`}>
                <span>Sisa Outstanding</span>
                <span className="font-mono">{outstanding > 0 ? idr(outstanding) : "✓ Lunas"}</span>
              </div>
            </div>

            {/* Progress bar */}
            {doc.grandTotal > 0 && (
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-slate-400">
                  <span>Progress Pembayaran</span>
                  <span>{pctPaid}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${pctPaid >= 100 ? "bg-emerald-500" : pctPaid > 0 ? "bg-indigo-400" : "bg-slate-200"}`}
                    style={{ width: `${Math.min(pctPaid, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Link ke detail SO */}
            <Link href={`/sales/documents/${salesDocId}`}>
              <Button variant="outline" size="sm" className="w-full text-xs border-indigo-200 text-indigo-600 hover:bg-indigo-50">
                <ExternalLink className="w-3 h-3 mr-1.5" />
                Buka Detail Sales Order
              </Button>
            </Link>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── Update Status Dialog ───────────────────────────────────────────────────────

function UpdateStatusDialog({ orderId, currentStatus, currentVersion, onUpdated }: { orderId: number; currentStatus: string; currentVersion?: number; onUpdated: () => void }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(currentStatus);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleUpdate = async () => {
    setLoading(true);
    try {
      await apiFetch(`/api/logistic/orders/${orderId}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          notes,
          ...(currentVersion !== undefined ? { version: currentVersion } : {}),
        }),
      });
      toast({ title: "Status diperbarui" });
      setOpen(false);
      onUpdated();
    } catch (e: unknown) {
      const err = e as { status?: number; message?: string };
      if (err?.status === 409) {
        toast({
          title: "Konflik perubahan",
          description: "Data sudah diubah oleh pengguna lain. Refresh halaman dan coba lagi.",
          variant: "destructive",
        });
        setOpen(false);
        onUpdated();
      } else {
        toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <ClipboardList className="w-4 h-4 mr-1" />
        Update Status
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Update Status Order</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Status Baru</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ORDER_STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Catatan (opsional)</Label>
              <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Catatan untuk timeline..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleUpdate} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Timeline helpers ───────────────────────────────────────────────────────────

function timelineIcon(status: string | null): React.ReactNode {
  const s = (status ?? "").toLowerCase();
  if (s.includes("vmf") || s.includes("link")) return <Link2 className="w-3.5 h-3.5 text-violet-500" />;
  if (s.includes("so dibuat") || s.includes("sales order") || s.includes("so ")) return <FileText className="w-3.5 h-3.5 text-blue-500" />;
  if (s.includes("gagal") || s.includes("error") || s.includes("reject") || s.includes("tolak")) return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
  if (s.includes("approv") || s.includes("setuju") || s.includes("confirm") || s.includes("completed")) return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (s.includes("customer") || s.includes("quotat") || s.includes("quote") || s.includes("penawaran")) return <User className="w-3.5 h-3.5 text-purple-500" />;
  if (s.includes("vendor") || s.includes("rfq")) return <Truck className="w-3.5 h-3.5 text-blue-500" />;
  if (s.includes("wa") || s.includes("whatsapp") || s.includes("notif")) return <MessageCircle className="w-3.5 h-3.5 text-green-500" />;
  if (s.includes("op-confirm") || s.includes("op confirm") || s.includes("operational")) return <ClipboardCheck className="w-3.5 h-3.5 text-orange-500" />;
  if (s.includes("status")) return <ClipboardList className="w-3.5 h-3.5 text-slate-500" />;
  return <StickyNote className="w-3.5 h-3.5 text-slate-400" />;
}

function timelineDotColor(u: OrderUpdate): string {
  const s = (u.status ?? "").toLowerCase();
  if (s.includes("gagal") || s.includes("error") || s.includes("reject")) return "bg-red-400";
  if (s.includes("approv") || s.includes("setuju") || s.includes("confirm") || s.includes("completed")) return "bg-emerald-400";
  if (u.isPublic) return "bg-teal-400";
  return "bg-blue-400";
}

// ── Add Timeline Note Dialog ───────────────────────────────────────────────────

function AddTimelineNoteDialog({ orderId, onAdded }: { orderId: number; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async () => {
    if (!notes.trim()) { toast({ title: "Catatan tidak boleh kosong", variant: "destructive" }); return; }
    setLoading(true);
    try {
      await apiFetch(`/api/logistic/orders/${orderId}/updates`, {
        method: "POST",
        body: JSON.stringify({ notes: notes.trim(), isPublic }),
      });
      toast({ title: "Catatan berhasil ditambahkan" });
      setNotes("");
      setIsPublic(false);
      setOpen(false);
      onAdded();
    } catch (e: unknown) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-slate-500 hover:text-slate-800" onClick={() => setOpen(true)}>
        <Plus className="w-3 h-3 mr-1" /> Tambah Catatan
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Tambah Catatan ke Timeline</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Catatan <span className="text-red-500">*</span></Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={3}
                placeholder="Tulis catatan internal atau update untuk customer..."
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="isPublic" checked={isPublic} onCheckedChange={setIsPublic} />
              <Label htmlFor="isPublic" className="cursor-pointer flex items-center gap-1">
                {isPublic ? <Globe className="w-3.5 h-3.5 text-teal-500" /> : <EyeOff className="w-3.5 h-3.5 text-slate-400" />}
                {isPublic ? "Tampil ke Customer (Publik)" : "Internal (Tidak Tampil ke Customer)"}
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────

export default function LogisticOrderDetailPage() {
  const { orderId: orderIdStr } = useParams<{ orderId: string }>();
  const orderId = Number(orderIdStr);
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery<DetailData>({
    queryKey: ["order-detail", orderId],
    queryFn: () => apiFetch(`/api/logistic/orders/${orderId}/detail`),
    enabled: !isNaN(orderId),
    refetchInterval: 15000,
  });

  const createCustomerLink = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; trackUrl: string }>(`/api/logistic/orders/${orderId}/create-customer-link`, { method: "POST" }),
    onSuccess: (r) => {
      toast({ title: "Tracking link dibuat" });
      navigator.clipboard.writeText(r.trackUrl).catch(() => {});
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const resendWaGroup = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean; message: string }>(`/api/logistic/orders/${orderId}/resend-wa-group`, { method: "POST" }),
    onSuccess: (r) => toast({ title: "✅ " + r.message }),
    onError: (e: Error) => toast({ title: "Gagal kirim WA", description: e.message, variant: "destructive" }),
  });

  const { data: fulfillmentData, refetch: refetchFulfillment } = useQuery<{ links: FulfillmentLink[]; submissions: FulfillmentSubmission[] }>({
    queryKey: ["order-fulfillment", orderId],
    queryFn: () => apiFetch(`/api/logistic/orders/${orderId}/fulfillment`),
    enabled: !isNaN(orderId),
    refetchInterval: 15000,
  });

  const { data: approvalData, refetch: refetchApprovals } = useQuery<CustomerApproval[]>({
    queryKey: ["order-approvals", orderId],
    queryFn: () => apiFetch(`/api/vendor-form/admin/customer-approvals?orderId=${orderId}`),
    enabled: !isNaN(orderId),
    refetchInterval: 30000,
  });

  const retrySoMut = useMutation({
    mutationFn: (approvalId: number) =>
      apiFetch<{ ok: boolean; docNumber: string; already?: boolean }>(
        `/api/vendor-form/admin/customer-approvals/${approvalId}/retry-so`,
        { method: "POST" }
      ),
    onSuccess: (r, approvalId) => {
      toast({
        title: r.already ? "SO sudah ada" : "✅ Sales Order berhasil dibuat",
        description: `Nomor SO: ${r.docNumber}`,
      });
      void refetchApprovals();
      qc.invalidateQueries({ queryKey: ["order-detail", orderId] });
    },
    onError: (e: Error) => toast({ title: "Gagal buat SO", description: e.message, variant: "destructive" }),
  });

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Link disalin!" });
  };

  if (isLoading || !data) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      </AppShell>
    );
  }

  const { order, vendor, updates, taskLinks, customerLinks, quoteLinks, rfqs, freightShipments = [] } = data;
  const activeRfqId = rfqs.find(r => r.status === "vendor_selected" || r.status === "open")?.id ?? rfqs[0]?.id ?? null;
  const hasVendorSelected = !!order.approvedVendorId;
  const quoteStatus = order.customerQuoteStatus;

  return (
    <AppShell>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={() => navigate(`/logistics/portal-orders/${orderId}`)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
            </Button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                <Package className="w-5 h-5 text-blue-500" />
                {order.orderNumber}
              </h1>
              <p className="text-sm text-slate-500">
                {order.shipmentType} · {order.origin} → {order.destination}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
            <UpdateStatusDialog orderId={orderId} currentStatus={order.status} currentVersion={order.version} onUpdated={() => qc.invalidateQueries({ queryKey: ["order-detail", orderId] })} />
            <CreateTaskLinkDialog orderId={orderId} vendorId={order.approvedVendorId} onCreated={() => qc.invalidateQueries({ queryKey: ["order-detail", orderId] })} />
            {hasVendorSelected && (
              <SendQuoteDialog order={order} rfqId={activeRfqId} onSent={() => qc.invalidateQueries({ queryKey: ["order-detail", orderId] })} />
            )}
            <AssignVendorDialog orderId={orderId} onAssigned={() => qc.invalidateQueries({ queryKey: ["order-detail", orderId] })} />
            <SendFulfillmentDialog
              orderId={orderId}
              vendor={vendor}
              shipmentType={order.shipmentType}
              onSent={() => { qc.invalidateQueries({ queryKey: ["order-detail", orderId] }); void refetchFulfillment(); }}
            />
            <Button variant="outline" size="sm" onClick={() => createCustomerLink.mutate()} disabled={createCustomerLink.isPending}>
              <Plus className="w-4 h-4 mr-1" /> Tracking Link
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => resendWaGroup.mutate()}
              disabled={resendWaGroup.isPending}
              title="Kirim ulang notifikasi order ke Admin Group WhatsApp"
            >
              {resendWaGroup.isPending
                ? <Loader2 className="w-4 h-4 animate-spin mr-1" />
                : <MessageCircle className="w-4 h-4 mr-1" />}
              Resend WA Grup
            </Button>
          </div>
        </div>

        {/* Quote status banner */}
        {quoteStatus && (
          <div className={`rounded-xl p-3 flex items-center gap-2 text-sm font-medium ${STATUS_COLOR[quoteStatus] ?? "bg-slate-100 text-slate-700"}`}>
            {quoteStatus === "customer_approved" && "✅ Customer sudah menyetujui penawaran."}
            {quoteStatus === "customer_quoted" && "📤 Penawaran sudah dikirim ke customer, menunggu konfirmasi."}
            {quoteStatus === "customer_revision_requested" && "🔄 Customer meminta revisi. Perlu update penawaran."}
            {quoteStatus === "customer_rejected" && "❌ Customer menolak penawaran."}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left: Order Info */}
          <div className="lg:col-span-2 space-y-4">
            {/* Order Details */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                  <User className="w-4 h-4" /> Customer &amp; Pengiriman
                </CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Customer" value={order.customerName} />
                <Field label="Telepon" value={order.phone} />
                <Field label="Email" value={order.email} />
                <Field label="Layanan" value={order.shipmentType} />
                <Field label="Asal" value={order.origin} />
                <Field label="Tujuan" value={order.destination} />
                {order.commodity && <Field label="Komoditi" value={order.commodity} />}
                {order.cargoDescription && <Field label="Deskripsi" value={order.cargoDescription} />}
                {order.grossWeight && <Field label="Berat" value={`${order.grossWeight} kg`} />}
                {order.volumeCbm && <Field label="Volume" value={`${order.volumeCbm} CBM`} />}
                {order.jumlahKoli != null && <Field label="Jumlah Koli" value={`${order.jumlahKoli} koli`} />}
                <Field label="Status" value={<Badge className={STATUS_COLOR[order.status] ?? "bg-slate-100 text-slate-700"}>{order.status}</Badge>} />
                <Field label="Order Dibuat" value={dt(order.createdAt)} />
              </CardContent>
            </Card>

            {/* Financial */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">💰 Financial</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Harga Vendor" value={idr(order.vendorCost ?? order.finalPrice)} />
                <Field label="Harga ke Customer" value={idr(order.finalSellingPrice)} />
                <Field label="Markup %" value={order.markupPercent ? `${order.markupPercent}%` : "—"} />
                <Field label="Margin" value={idr(order.orderMargin)} />
                {order.etaFinal && <Field label="ETA Final" value={order.etaFinal} />}
                {vendor && (
                  <Field label="Vendor Terpilih" value={<span className="text-blue-700 font-medium">{vendor.name}</span>} />
                )}
              </CardContent>
            </Card>

            {/* Quote Links */}
            {quoteLinks.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">📤 Penawaran Customer</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {quoteLinks.map(q => (
                    <div key={q.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                      <div>
                        <Badge className={STATUS_COLOR[q.status] ?? "bg-slate-100 text-slate-700"}>{q.status}</Badge>
                        {q.finalCustomerPrice && <span className="ml-2 text-slate-600">{idr(q.finalCustomerPrice)}</span>}
                        <span className="text-xs text-slate-400 ml-2">{dt(q.createdAt)}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyUrl(q.quoteUrl)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <a href={q.quoteUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Customer Approval & SO */}
            {(approvalData?.length ?? 0) > 0 && (
              <Card className="border-violet-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-violet-700 uppercase tracking-wide flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" /> Persetujuan Customer &amp; Sales Order
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {approvalData!.map(a => {
                    const APPROVAL_COLOR: Record<string, string> = {
                      pending: "bg-amber-100 text-amber-700",
                      approved: "bg-emerald-100 text-emerald-800",
                      rejected: "bg-red-100 text-red-700",
                    };
                    const needsRetrySo = a.status === "approved" && !a.soNumber;
                    const approvalUrl = `${window.location.origin}/vendor-form/customer-approval/${a.token}`;
                    return (
                      <div key={a.id} className={`rounded-lg border px-3 py-3 space-y-2.5 ${a.status === "approved" ? "border-emerald-200 bg-emerald-50/40" : a.status === "rejected" ? "border-red-100" : "border-amber-100"}`}>
                        {/* Status row */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={APPROVAL_COLOR[a.status] ?? "bg-slate-100 text-slate-600"}>
                              {a.status === "approved" ? "✅ Disetujui" : a.status === "rejected" ? "❌ Ditolak" : "⏳ Menunggu"}
                            </Badge>
                            {a.customerName && <span className="text-sm font-medium text-slate-700">{a.customerName}</span>}
                            {a.sellingPrice && (
                              <span className="text-xs text-slate-500">{idr(a.sellingPrice)} {a.currency ?? "IDR"}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="Salin link approval" onClick={() => { navigator.clipboard.writeText(approvalUrl); toast({ title: "Link disalin!" }); }}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <a href={approvalUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7" title="Buka halaman approval">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </div>
                        </div>

                        {/* SO Number row */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-sm">
                            <FileText className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            {a.soNumber ? (
                              <>
                                <span className="text-slate-500 text-xs">SO:</span>
                                {a.salesDocId ? (
                                  <Link href={`/sales/documents/${a.salesDocId}`}>
                                    <span className="font-mono font-semibold text-blue-700 hover:underline cursor-pointer">{a.soNumber}</span>
                                  </Link>
                                ) : (
                                  <span className="font-mono font-semibold text-blue-700">{a.soNumber}</span>
                                )}
                              </>
                            ) : (
                              <span className="text-xs text-slate-400 italic">
                                {a.status === "approved" ? "SO belum terbuat" : "—"}
                              </span>
                            )}
                          </div>

                          {/* Retry SO button — hanya muncul saat approved tapi SO belum ada */}
                          {needsRetrySo && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 shrink-0"
                              disabled={retrySoMut.isPending}
                              onClick={() => retrySoMut.mutate(a.id)}
                              title="Buat ulang Sales Order dari approval ini"
                            >
                              {retrySoMut.isPending
                                ? <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                : <RotateCcw className="h-3 w-3 mr-1" />}
                              Buat SO
                            </Button>
                          )}
                        </div>

                        {/* Timestamps */}
                        <div className="text-[10px] text-slate-400 flex gap-3 flex-wrap">
                          <span>Dibuat: {dt(a.createdAt)}</span>
                          {a.approvedAt && <span>Disetujui: {dt(a.approvedAt)}</span>}
                          {a.rejectedAt && <span>Ditolak: {dt(a.rejectedAt)}</span>}
                          {a.expiresAt && new Date(a.expiresAt) > new Date() && (
                            <span>Exp: {dt(a.expiresAt)}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Fulfillment Links & Submissions */}
            {(fulfillmentData?.links?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-emerald-700 uppercase tracking-wide flex items-center gap-1.5">
                    <ClipboardCheck className="w-4 h-4" /> Form Fulfillment Vendor
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {fulfillmentData!.links.map(lnk => {
                    const sub = fulfillmentData?.submissions.find(s => s.linkId === lnk.id);
                    const isSubmitted = lnk.status === "submitted";
                    return (
                      <div key={lnk.id} className={`rounded-lg border px-3 py-3 space-y-2 ${isSubmitted ? "border-emerald-200 bg-emerald-50/40" : "border-slate-100"}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge className={isSubmitted ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}>
                              {isSubmitted ? "✅ Submitted" : "⏳ Menunggu"}
                            </Badge>
                            <span className="text-xs text-slate-500 capitalize">{lnk.serviceType}</span>
                            {lnk.expiresAt && (
                              <span className="text-xs text-slate-400">
                                Exp: {new Date(lnk.expiresAt).toLocaleDateString("id-ID")}
                              </span>
                            )}
                          </div>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyUrl(lnk.formUrl)}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                            <a href={lnk.formUrl} target="_blank" rel="noopener noreferrer">
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <ExternalLink className="h-3.5 w-3.5" />
                              </Button>
                            </a>
                          </div>
                        </div>
                        {sub && (
                          <div className="bg-white rounded-lg border border-emerald-100 px-3 py-2.5 space-y-1.5">
                            <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">Data dari Vendor</p>
                            {Object.entries(sub.fulfillmentData).map(([k, v]) => v ? (
                              <div key={k} className="flex gap-2 text-xs">
                                <span className="text-slate-400 capitalize min-w-[120px] flex-shrink-0">
                                  {k.replace(/_/g, " ")}
                                </span>
                                <span className="text-slate-700 font-medium">{v}</span>
                              </div>
                            ) : null)}
                            <p className="text-[10px] text-slate-400 pt-1">
                              Diterima: {new Date(sub.submittedAt).toLocaleString("id-ID")}
                            </p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Job Order & Tracking Panel */}
            <JobOrderPanel orderId={orderId} />

            {/* Task Links */}
            {taskLinks.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Truck className="w-4 h-4" /> Task Links (Vendor/Driver)
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {taskLinks.map(t => (
                    <div key={t.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                      <div>
                        <span className="font-medium text-slate-700">{t.label ?? t.roleType}</span>
                        <Badge className="ml-2 bg-slate-100 text-slate-600">{t.roleType}</Badge>
                        <span className="text-xs text-slate-400 ml-2">{dt(t.createdAt)}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyUrl(t.taskUrl)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <a href={t.taskUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Customer Tracking Links */}
            {customerLinks.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide">📍 Customer Tracking Links</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {customerLinks.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm border border-slate-100 rounded-lg px-3 py-2">
                      <div>
                        <Badge className="bg-teal-50 text-teal-700">{c.status}</Badge>
                        <span className="text-xs text-slate-400 ml-2">{dt(c.createdAt)}</span>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => copyUrl(c.trackUrl)}>
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                        <a href={c.trackUrl} target="_blank" rel="noopener noreferrer">
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Button>
                        </a>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Freight Shipments */}
            {freightShipments.length > 0 && (
              <Card className="border-teal-200">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-teal-700 uppercase tracking-wide flex items-center gap-1.5">
                    <Ship className="w-4 h-4" /> Freight Shipments
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {freightShipments.map(fs => {
                    const FREIGHT_STATUS_COLORS: Record<string, string> = {
                      draft: "bg-slate-100 text-slate-600",
                      rfq_sent: "bg-amber-100 text-amber-700",
                      confirmed: "bg-blue-100 text-blue-700",
                      in_transit: "bg-indigo-100 text-indigo-700",
                      completed: "bg-emerald-100 text-emerald-800",
                      cancelled: "bg-red-100 text-red-700",
                    };
                    const FREIGHT_STATUS_LABELS: Record<string, string> = {
                      draft: "Draft",
                      rfq_sent: "RFQ Dikirim",
                      confirmed: "Dikonfirmasi",
                      in_transit: "Dalam Perjalanan",
                      completed: "Selesai",
                      cancelled: "Dibatalkan",
                    };
                    return (
                      <div key={fs.id} className="rounded-lg border border-teal-100 bg-teal-50/40 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-mono font-semibold text-sm text-teal-800 truncate">{fs.shipmentNumber}</span>
                            <Badge className={`text-xs ${FREIGHT_STATUS_COLORS[fs.status] ?? "bg-slate-100 text-slate-600"}`}>
                              {FREIGHT_STATUS_LABELS[fs.status] ?? fs.status}
                            </Badge>
                          </div>
                          <Link href={`/logistics/freight/${fs.id}`}>
                            <Button variant="outline" size="sm" className="h-7 text-xs shrink-0 border-teal-300 text-teal-700 hover:bg-teal-50">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Detail
                            </Button>
                          </Link>
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                          <div>
                            <span className="text-slate-400">Rute</span>
                            <p className="font-medium">{fs.origin} → {fs.destination}</p>
                          </div>
                          {fs.approvedVendorName && (
                            <div>
                              <span className="text-slate-400">Vendor</span>
                              <p className="font-medium text-teal-700">{fs.approvedVendorName}</p>
                            </div>
                          )}
                          <div>
                            <span className="text-slate-400">Dari RFQ</span>
                            <Link href={`/logistics/rfq/${fs.rfqId}/comparison`}>
                              <span className="font-mono text-teal-600 hover:underline cursor-pointer">{fs.rfqNumber}</span>
                            </Link>
                          </div>
                          <div>
                            <span className="text-slate-400">Dibuat</span>
                            <p className="font-medium">{dt(fs.createdAt)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Ringkasan Pembayaran SO */}
            <PaymentSummaryPanel
              salesDocId={approvalData?.find(a => a.salesDocId != null)?.salesDocId}
              soNumber={approvalData?.find(a => a.soNumber != null)?.soNumber}
            />

            {/* Invoice & Payment — Tahap 10 */}
            <CustomerInvoicePanel
              orderId={orderId}
              order={order}
              salesDocId={approvalData?.find(a => a.salesDocId != null)?.salesDocId}
            />
          </div>

          {/* Right: Timeline + WA Log */}
          <div className="space-y-4">
            <WaNotificationLogPanel orderNumber={order.orderNumber} />
            <Card className="sticky top-6">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                    <Clock className="w-4 h-4" /> Timeline Aktivitas
                    <span className="ml-1 text-xs font-normal normal-case text-slate-400">({updates.length})</span>
                  </CardTitle>
                  <AddTimelineNoteDialog
                    orderId={orderId}
                    onAdded={() => qc.invalidateQueries({ queryKey: ["order-detail", orderId] })}
                  />
                </div>
                <div className="flex gap-2 text-xs text-slate-400 mt-1">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-teal-400 inline-block" />Publik</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />Internal</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Error</span>
                </div>
              </CardHeader>
              <CardContent className="max-h-[600px] overflow-y-auto pt-2">
                {updates.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">Belum ada aktivitas</p>
                ) : (
                  <div className="relative pl-5">
                    <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-100" />
                    <div className="space-y-4">
                      {updates.map(u => (
                        <div key={u.id} className="relative text-sm group">
                          {/* Dot + icon */}
                          <div className={`absolute -left-[17px] top-0.5 w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center ${timelineDotColor(u)}`} />
                          <div className="absolute -left-[28px] top-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {timelineIcon(u.status)}
                          </div>
                          <div className="bg-white rounded-lg border border-slate-100 px-3 py-2 shadow-sm hover:border-slate-200 transition-colors">
                            {/* Status badge */}
                            {u.status && (
                              <div className="flex items-center gap-1.5 mb-1">
                                {timelineIcon(u.status)}
                                <span className={`text-xs font-semibold rounded-full px-2 py-0.5 ${STATUS_COLOR[u.status] ?? "bg-slate-100 text-slate-700"}`}>
                                  {u.status}
                                </span>
                                {u.isPublic && (
                                  <span title="Tampil ke customer" className="ml-auto">
                                    <Eye className="w-3 h-3 text-teal-500" />
                                  </span>
                                )}
                              </div>
                            )}
                            {/* Notes */}
                            {u.notes && (
                              <p className="text-slate-700 text-xs leading-relaxed">{u.notes}</p>
                            )}
                            {/* Meta */}
                            <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {u.actorName ?? u.actorType}
                              <span className="text-slate-300">·</span>
                              {dt(u.createdAt)}
                              {u.isPublic && !u.status && (
                                <span className="ml-auto"><Eye className="w-3 h-3 text-teal-500" /></span>
                              )}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {/* GPS Tracking Panel — full width below main grid */}
      <ErrorBoundary label="GPS Tracking">
        <GpsTrackingPanel orderId={orderId} orderNumber={order.orderNumber} />
      </ErrorBoundary>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <div className="font-medium text-slate-800">{value ?? "—"}</div>
    </div>
  );
}
