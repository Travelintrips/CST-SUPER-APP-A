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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Globe, ArrowLeft, RefreshCw, Loader2, FileText, CheckCircle,
  Clock, Pencil, Save, ChevronDown, ChevronUp, AlertCircle, Package,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import { id as idLocale } from "date-fns/locale";
import { FreightCustomsPanel } from "@/components/freight/FreightCustomsPanel";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PpjkOrder {
  id: number; orderNumber: string;
  customerName: string; customerEmail: string | null; customerPhone: string | null;
  customerCompany: string | null; customerNpwp: string | null;
  tradeType: string; commodity: string | null; hsCode: string | null;
  origin: string | null; destination: string | null;
  portOfEntry: string | null; kantorPabean: string | null;
  jenisPelayanan: string | null; status: string; customsStatus: string | null;
  nomorAju: string | null; nomorPib: string | null; nomorPeb: string | null;
  nomorSppb: string | null; tanggalAju: string | null;
  nilaiPabean: string | null; beaMasuk: string | null;
  ppnImpor: string | null; pphImpor: string | null; totalTagihanPabean: string | null;
  serviceFee: string | null; ppnServiceFee: string | null; totalServiceFee: string | null;
  vendorName: string | null; notes: string | null; adminNotes: string | null;
  createdAt: string; updatedAt: string;
}

interface AuditLog {
  id: number; action: string; fromStatus: string | null; toStatus: string | null;
  field: string | null; oldValue: string | null; newValue: string | null;
  changedBy: string; notes: string | null; createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", processing: "Diproses", completed: "Selesai", cancelled: "Dibatalkan",
};
const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700", processing: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700", cancelled: "bg-red-100 text-red-700",
};
const CUSTOMS_STATUS_LABELS: Record<string, string> = {
  draft: "Draft", submitted: "Diajukan", processing: "Diproses",
  approved: "Disetujui", rejected: "Ditolak", completed: "Selesai",
};

const IDR = (n: string | null | undefined) =>
  !n ? "—" : `Rp ${Number(n).toLocaleString("id-ID")}`;

// ─── Action Log Item ──────────────────────────────────────────────────────────

function AuditItem({ log }: { log: AuditLog }) {
  const actionLabel: Record<string, string> = {
    created: "Order dibuat",
    status_changed: "Status diubah",
    customs_status_changed: "Status kepabeanan diubah",
    field_updated: "Field diperbarui",
  };
  const icon = {
    created: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
    status_changed: <AlertCircle className="w-3.5 h-3.5 text-blue-500" />,
    customs_status_changed: <Globe className="w-3.5 h-3.5 text-purple-500" />,
    field_updated: <Pencil className="w-3.5 h-3.5 text-gray-400" />,
  }[log.action] ?? <Clock className="w-3.5 h-3.5 text-gray-400" />;

  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center shrink-0 mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium">{actionLabel[log.action] ?? log.action}</p>
        {log.fromStatus && log.toStatus && (
          <p className="text-xs text-muted-foreground">
            <span className="line-through">{log.fromStatus}</span> → <strong>{log.toStatus}</strong>
          </p>
        )}
        {log.field && (
          <p className="text-xs text-muted-foreground">
            {log.field}: <span className="line-through">{log.oldValue || "—"}</span> → <strong>{log.newValue || "—"}</strong>
          </p>
        )}
        {log.notes && <p className="text-xs text-muted-foreground italic">{log.notes}</p>}
        <p className="text-[10px] text-muted-foreground mt-0.5">
          {log.changedBy} · {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: idLocale })}
        </p>
      </div>
    </div>
  );
}

// ─── Section Collapsible ──────────────────────────────────────────────────────

function Section({ title, icon: Icon, children, defaultOpen = true }: any) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <CardHeader className="pb-2 cursor-pointer" onClick={() => setOpen(!open)}>
        <CardTitle className="text-sm flex items-center gap-2">
          <Icon className="w-4 h-4 text-muted-foreground" />
          {title}
          <span className="ml-auto">{open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}</span>
        </CardTitle>
      </CardHeader>
      {open && <CardContent className="pt-0">{children}</CardContent>}
    </Card>
  );
}

// ─── Status Update Dialog ─────────────────────────────────────────────────────

function StatusDialog({ orderId, current, customsCurrent, open, onOpenChange, onUpdated }: any) {
  const [status, setStatus] = useState(current);
  const [customsStatus, setCustomsStatus] = useState(customsCurrent ?? "");
  const [notes, setNotes] = useState("");

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/ppjk/orders/${orderId}/status`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, customsStatus: customsStatus || undefined, notes: notes || undefined }),
      });
      if (!r.ok) throw new Error("Gagal");
      return r.json();
    },
    onSuccess: () => { toast.success("Status diperbarui"); onUpdated(); onOpenChange(false); },
    onError: () => toast.error("Gagal memperbarui status"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Update Status PPJK</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Status Order</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Status Kepabeanan</Label>
            <Select value={customsStatus || "none"} onValueChange={(v) => setCustomsStatus(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Pilih status kepabeanan..." /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Tidak ada —</SelectItem>
                {Object.entries(CUSTOMS_STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Catatan (opsional)</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="resize-none" placeholder="Alasan perubahan status..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle className="w-4 h-4 mr-2" />}
            Simpan Status
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Editable Field Row ───────────────────────────────────────────────────────

function FieldRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex justify-between items-start py-1.5 border-b last:border-0">
      <span className="text-xs text-muted-foreground shrink-0 mr-4">{label}</span>
      <span className="text-xs font-medium text-right">{value}</span>
    </div>
  );
}

// ─── Edit Form Dialog ─────────────────────────────────────────────────────────

function EditDialog({ order, open, onOpenChange, onSaved }: { order: PpjkOrder; open: boolean; onOpenChange: (v: boolean) => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    customerName: order.customerName, customerEmail: order.customerEmail ?? "",
    customerPhone: order.customerPhone ?? "", customerCompany: order.customerCompany ?? "",
    customerNpwp: order.customerNpwp ?? "",
    tradeType: order.tradeType, commodity: order.commodity ?? "", hsCode: order.hsCode ?? "",
    origin: order.origin ?? "", destination: order.destination ?? "",
    portOfEntry: order.portOfEntry ?? "", kantorPabean: order.kantorPabean ?? "",
    jenisPelayanan: order.jenisPelayanan ?? "",
    nomorAju: order.nomorAju ?? "", nomorPib: order.nomorPib ?? "",
    nomorPeb: order.nomorPeb ?? "", nomorSppb: order.nomorSppb ?? "",
    tanggalAju: order.tanggalAju ?? "",
    nilaiPabean: order.nilaiPabean ?? "", beaMasuk: order.beaMasuk ?? "",
    ppnImpor: order.ppnImpor ?? "", pphImpor: order.pphImpor ?? "",
    totalTagihanPabean: order.totalTagihanPabean ?? "",
    serviceFee: order.serviceFee ?? "", ppnServiceFee: order.ppnServiceFee ?? "",
    totalServiceFee: order.totalServiceFee ?? "",
    vendorName: order.vendorName ?? "", notes: order.notes ?? "", adminNotes: order.adminNotes ?? "",
  });

  const f = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/ppjk/orders/${order.id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) throw new Error("Gagal");
      return r.json();
    },
    onSuccess: () => { toast.success("Data disimpan"); onSaved(); onOpenChange(false); },
    onError: () => toast.error("Gagal menyimpan"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit PPJK Order — {order.orderNumber}</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">
          {/* Customer */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5 col-span-2"><Label>Nama Importir / Eksportir *</Label><Input value={form.customerName} onChange={(e) => f("customerName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Perusahaan</Label><Input value={form.customerCompany} onChange={(e) => f("customerCompany", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>NPWP</Label><Input value={form.customerNpwp} onChange={(e) => f("customerNpwp", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.customerEmail} onChange={(e) => f("customerEmail", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Telepon</Label><Input value={form.customerPhone} onChange={(e) => f("customerPhone", e.target.value)} /></div>
          </div>
          {/* Shipment */}
          <div className="border-t pt-4 grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Trade Type</Label>
              <Select value={form.tradeType} onValueChange={(v) => f("tradeType", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="import">Import</SelectItem>
                  <SelectItem value="export">Export</SelectItem>
                  <SelectItem value="transit">Transit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Jenis Pelayanan</Label>
              <Select value={form.jenisPelayanan || "none"} onValueChange={(v) => f("jenisPelayanan", v === "none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="Pilih..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="customs_clearance">Customs Clearance</SelectItem>
                  <SelectItem value="customs_import">PIB — Impor</SelectItem>
                  <SelectItem value="customs_export">PEB — Ekspor</SelectItem>
                  <SelectItem value="customs_transit">Transit</SelectItem>
                  <SelectItem value="full_service">Full Service PPJK</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Komoditi</Label><Input value={form.commodity} onChange={(e) => f("commodity", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>HS Code</Label><Input value={form.hsCode} onChange={(e) => f("hsCode", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Asal (Origin)</Label><Input value={form.origin} onChange={(e) => f("origin", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tujuan (Destination)</Label><Input value={form.destination} onChange={(e) => f("destination", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Port of Entry</Label><Input value={form.portOfEntry} onChange={(e) => f("portOfEntry", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Kantor Pabean</Label><Input value={form.kantorPabean} onChange={(e) => f("kantorPabean", e.target.value)} /></div>
          </div>
          {/* Nomor dokumen */}
          <div className="border-t pt-4 grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Nomor Aju</Label><Input value={form.nomorAju} onChange={(e) => f("nomorAju", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Tanggal Aju</Label><Input type="date" value={form.tanggalAju} onChange={(e) => f("tanggalAju", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Nomor PIB</Label><Input value={form.nomorPib} onChange={(e) => f("nomorPib", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Nomor PEB</Label><Input value={form.nomorPeb} onChange={(e) => f("nomorPeb", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Nomor SPPB</Label><Input value={form.nomorSppb} onChange={(e) => f("nomorSppb", e.target.value)} /></div>
          </div>
          {/* Finansial */}
          <div className="border-t pt-4 grid grid-cols-2 gap-4">
            <div className="space-y-1.5"><Label>Nilai Pabean (IDR)</Label><Input type="number" value={form.nilaiPabean} onChange={(e) => f("nilaiPabean", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Bea Masuk (IDR)</Label><Input type="number" value={form.beaMasuk} onChange={(e) => f("beaMasuk", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>PPN Impor (IDR)</Label><Input type="number" value={form.ppnImpor} onChange={(e) => f("ppnImpor", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>PPh Impor (IDR)</Label><Input type="number" value={form.pphImpor} onChange={(e) => f("pphImpor", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Total Tagihan Pabean (IDR)</Label><Input type="number" value={form.totalTagihanPabean} onChange={(e) => f("totalTagihanPabean", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Service Fee PPJK (IDR)</Label><Input type="number" value={form.serviceFee} onChange={(e) => f("serviceFee", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>PPN Service Fee (IDR)</Label><Input type="number" value={form.ppnServiceFee} onChange={(e) => f("ppnServiceFee", e.target.value)} /></div>
            <div className="space-y-1.5 col-span-2"><Label>Total Service Fee (IDR)</Label><Input type="number" value={form.totalServiceFee} onChange={(e) => f("totalServiceFee", e.target.value)} /></div>
          </div>
          {/* Vendor & notes */}
          <div className="border-t pt-4 grid grid-cols-1 gap-4">
            <div className="space-y-1.5"><Label>Vendor PPJK</Label><Input value={form.vendorName} onChange={(e) => f("vendorName", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Catatan Customer</Label><Textarea value={form.notes} onChange={(e) => f("notes", e.target.value)} rows={2} className="resize-none" /></div>
            <div className="space-y-1.5"><Label>Catatan Admin</Label><Textarea value={form.adminNotes} onChange={(e) => f("adminNotes", e.target.value)} rows={2} className="resize-none" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Detail Page ─────────────────────────────────────────────────────────

export default function PpjkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const orderId = parseInt(id || "0");

  const [statusOpen, setStatusOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery<{
    order: PpjkOrder;
    docs: any[];
    auditLogs: AuditLog[];
  }>({
    queryKey: ["ppjk-order", orderId],
    queryFn: async () => {
      const r = await fetch(`/api/ppjk/orders/${orderId}`, { credentials: "include" });
      if (!r.ok) throw new Error("Tidak ditemukan");
      return r.json();
    },
    enabled: !!orderId,
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["ppjk-order", orderId] });
    qc.invalidateQueries({ queryKey: ["ppjk-orders"] });
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Memuat...
        </div>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="p-6 text-muted-foreground">Order tidak ditemukan.</div>
      </AppShell>
    );
  }

  const { order, auditLogs } = data;

  return (
    <AppShell>
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/logistics/ppjk")}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
          </Button>
          <div className="flex items-center gap-2 flex-1">
            <Globe className="w-5 h-5 text-blue-600" />
            <span className="font-mono font-bold text-lg">{order.orderNumber}</span>
            <Badge className={`text-xs ${order.status === "draft" ? "bg-gray-100 text-gray-700" : order.status === "processing" ? "bg-blue-100 text-blue-700" : order.status === "completed" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
              {STATUS_LABELS[order.status] ?? order.status}
            </Badge>
            {order.customsStatus && (
              <Badge variant="outline" className="text-xs">
                Pabean: {CUSTOMS_STATUS_LABELS[order.customsStatus] ?? order.customsStatus}
              </Badge>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4" /></Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}><Pencil className="w-4 h-4 mr-1" /> Edit</Button>
            <Button size="sm" onClick={() => setStatusOpen(true)}><CheckCircle className="w-4 h-4 mr-1" /> Update Status</Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left — Main info */}
          <div className="lg:col-span-2 space-y-4">
            <Section title="Informasi Customer / Importir" icon={Globe}>
              <FieldRow label="Nama" value={order.customerName} />
              <FieldRow label="Perusahaan" value={order.customerCompany} />
              <FieldRow label="NPWP" value={order.customerNpwp} />
              <FieldRow label="Email" value={order.customerEmail} />
              <FieldRow label="Telepon" value={order.customerPhone} />
            </Section>

            <Section title="Detail Layanan" icon={Package}>
              <FieldRow label="Jenis Trade" value={<Badge variant="outline" className="text-xs capitalize">{order.tradeType}</Badge>} />
              <FieldRow label="Jenis Pelayanan" value={order.jenisPelayanan?.replace(/_/g, " ")} />
              <FieldRow label="Komoditi" value={order.commodity} />
              <FieldRow label="HS Code" value={order.hsCode} />
              <FieldRow label="Origin" value={order.origin} />
              <FieldRow label="Destination" value={order.destination} />
              <FieldRow label="Port of Entry" value={order.portOfEntry} />
              <FieldRow label="Kantor Pabean" value={order.kantorPabean} />
              <FieldRow label="Vendor PPJK" value={order.vendorName} />
            </Section>

            <Section title="Nomor Dokumen" icon={FileText}>
              <FieldRow label="Nomor Aju" value={<span className="font-mono">{order.nomorAju}</span>} />
              <FieldRow label="Tanggal Aju" value={order.tanggalAju} />
              <FieldRow label="Nomor PIB" value={<span className="font-mono">{order.nomorPib}</span>} />
              <FieldRow label="Nomor PEB" value={<span className="font-mono">{order.nomorPeb}</span>} />
              <FieldRow label="Nomor SPPB" value={<span className="font-mono">{order.nomorSppb}</span>} />
            </Section>

            <Section title="Perhitungan Pabean & Service Fee" icon={FileText}>
              <FieldRow label="Nilai Pabean" value={IDR(order.nilaiPabean)} />
              <FieldRow label="Bea Masuk" value={IDR(order.beaMasuk)} />
              <FieldRow label="PPN Impor" value={IDR(order.ppnImpor)} />
              <FieldRow label="PPh Impor" value={IDR(order.pphImpor)} />
              <FieldRow label="Total Tagihan Pabean" value={<strong className="text-orange-700">{IDR(order.totalTagihanPabean)}</strong>} />
              <div className="border-t mt-2 pt-2">
                <FieldRow label="Service Fee PPJK" value={IDR(order.serviceFee)} />
                <FieldRow label="PPN Service Fee" value={IDR(order.ppnServiceFee)} />
                <FieldRow label="Total Service Fee" value={<strong className="text-blue-700">{IDR(order.totalServiceFee)}</strong>} />
              </div>
            </Section>

            {/* Dokumen Kepabeanan (PPJK) */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <FileText className="w-4 h-4 text-muted-foreground" /> Dokumen Kepabeanan (PIB / PEB / SPPB / dll.)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FreightCustomsPanel sourceModule="ppjk" sourceOrderId={orderId} />
              </CardContent>
            </Card>

            {/* Notes */}
            {(order.notes || order.adminNotes) && (
              <Card>
                <CardContent className="pt-4 space-y-3">
                  {order.notes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Catatan Customer</p>
                      <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
                    </div>
                  )}
                  {order.adminNotes && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Catatan Admin</p>
                      <p className="text-sm whitespace-pre-wrap">{order.adminNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right — Audit Log */}
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" /> Audit Trail
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {auditLogs.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center">Belum ada log aktivitas</p>
                ) : (
                  <div className="space-y-4">
                    {auditLogs.map((log) => (
                      <AuditItem key={log.id} log={log} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 space-y-2 text-xs text-muted-foreground">
                <p>Dibuat: {format(new Date(order.createdAt), "dd MMM yyyy HH:mm", { locale: idLocale })}</p>
                <p>Diperbarui: {format(new Date(order.updatedAt), "dd MMM yyyy HH:mm", { locale: idLocale })}</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <StatusDialog
        orderId={orderId} current={order.status} customsCurrent={order.customsStatus}
        open={statusOpen} onOpenChange={setStatusOpen}
        onUpdated={() => { invalidate(); refetch(); }}
      />
      <EditDialog
        order={order} open={editOpen} onOpenChange={setEditOpen}
        onSaved={() => { invalidate(); refetch(); }}
      />
    </AppShell>
  );
}
