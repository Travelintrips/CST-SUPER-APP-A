import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { FileText, Plus, Search, Send, CheckCircle2, Printer, XCircle } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Invoice = {
  id: number; invoice_number: string; tenant_id: number; tenant_booking_id: number | null;
  business_name: string; owner_name: string; tenant_phone: string | null; tenant_email: string | null;
  title: string; period_label: string | null; order_number: string | null;
  unit_code: string | null; unit_name: string | null; area_name: string | null;
  amount: number; tax_amount: number; total_amount: number;
  due_date: string | null; issued_date: string; status: string; notes: string | null;
};
type BookingOpt = { id: number; order_number: string; business_name: string; total_price: number | null; price: number; tenant_id: number };
type TenantOpt = { id: number; business_name: string; owner_name: string };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Terkirim", paid: "Lunas", cancelled: "Dibatalkan",
};
const STATUS_COLOR: Record<string, string> = {
  draft: "bg-zinc-800/60 text-zinc-300 border-zinc-600",
  sent: "bg-blue-900/30 text-blue-300 border-blue-700",
  paid: "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  cancelled: "bg-red-900/30 text-red-300 border-red-700",
};

type FormState = {
  tenant_id: string; tenant_booking_id: string; title: string; period_label: string;
  amount: string; tax_amount: string; due_date: string; issued_date: string;
  status: string; notes: string;
};
const EMPTY_FORM: FormState = {
  tenant_id: "", tenant_booking_id: "", title: "Invoice Sewa", period_label: "",
  amount: "", tax_amount: "0", due_date: "", issued_date: new Date().toISOString().slice(0, 10),
  status: "draft", notes: "",
};

function PrintInvoice({ inv }: { inv: Invoice }) {
  const handlePrint = () => {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`
      <html><head><title>Invoice ${inv.invoice_number}</title>
      <style>
        body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 0; padding: 24px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; border-bottom: 2px solid #111; padding-bottom: 16px; }
        .company { font-size: 18px; font-weight: bold; }
        .sub { font-size: 12px; color: #555; }
        .inv-title { font-size: 22px; font-weight: bold; margin-bottom: 4px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 20px; }
        .label { color: #666; font-size: 11px; text-transform: uppercase; margin-bottom: 2px; }
        .value { font-size: 13px; font-weight: 500; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #f0f0f0; text-align: left; padding: 8px 12px; font-size: 12px; border: 1px solid #ddd; }
        td { padding: 8px 12px; border: 1px solid #ddd; font-size: 13px; }
        .total-row td { font-weight: bold; background: #f8f8f8; }
        .footer { margin-top: 40px; text-align: right; }
        .status-badge { display: inline-block; padding: 3px 10px; border-radius: 4px; font-size: 11px; font-weight: bold;
          background: ${inv.status === "paid" ? "#d1fae5" : inv.status === "sent" ? "#dbeafe" : "#f3f4f6"};
          color: ${inv.status === "paid" ? "#065f46" : inv.status === "sent" ? "#1e40af" : "#374151"};
        }
      </style></head><body>
      <div class="header">
        <div>
          <div class="company">BizPortal ERP</div>
          <div class="sub">Manajemen Properti & Penyewaan</div>
        </div>
        <div style="text-align:right">
          <div class="inv-title">INVOICE</div>
          <div style="font-size:15px;font-weight:bold;color:#1e40af">${inv.invoice_number}</div>
          <div style="margin-top:6px"><span class="status-badge">${STATUS_LABEL[inv.status] ?? inv.status}</span></div>
        </div>
      </div>
      <div class="info-grid">
        <div>
          <div class="label">Tagihan Kepada</div>
          <div class="value">${inv.business_name}</div>
          <div style="color:#555">${inv.owner_name}</div>
          ${inv.tenant_phone ? `<div style="color:#555">${inv.tenant_phone}</div>` : ""}
          ${inv.tenant_email ? `<div style="color:#555">${inv.tenant_email}</div>` : ""}
        </div>
        <div style="text-align:right">
          <div><span class="label">Tgl. Invoice: </span><span class="value">${fmtDate(inv.issued_date)}</span></div>
          ${inv.due_date ? `<div><span class="label">Jatuh Tempo: </span><span class="value">${fmtDate(inv.due_date)}</span></div>` : ""}
          ${inv.order_number ? `<div><span class="label">No. Penyewaan: </span><span class="value">${inv.order_number}</span></div>` : ""}
          ${inv.unit_code ? `<div><span class="label">Unit: </span><span class="value">${inv.unit_code} – ${inv.unit_name ?? ""}</span></div>` : ""}
          ${inv.area_name ? `<div><span class="label">Area: </span><span class="value">${inv.area_name}</span></div>` : ""}
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Keterangan</th><th style="text-align:right">Jumlah</th></tr>
        </thead>
        <tbody>
          <tr>
            <td>${inv.title}${inv.period_label ? ` – ${inv.period_label}` : ""}</td>
            <td style="text-align:right">${idr(Number(inv.amount))}</td>
          </tr>
          ${Number(inv.tax_amount) > 0 ? `<tr><td>PPN / Pajak</td><td style="text-align:right">${idr(Number(inv.tax_amount))}</td></tr>` : ""}
          <tr class="total-row">
            <td><strong>TOTAL</strong></td>
            <td style="text-align:right"><strong>${idr(Number(inv.total_amount))}</strong></td>
          </tr>
        </tbody>
      </table>
      ${inv.notes ? `<div style="margin-top:12px;padding:10px;background:#f9f9f9;border-radius:4px;font-size:12px"><strong>Catatan:</strong> ${inv.notes}</div>` : ""}
      <div class="footer">
        <div style="margin-bottom:40px">Hormat Kami,</div>
        <div style="border-top:1px solid #999;display:inline-block;min-width:180px;text-align:center;padding-top:4px">Pengelola</div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.print();
  };
  return (
    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-zinc-400 hover:text-zinc-200" onClick={handlePrint}>
      <Printer className="h-3.5 w-3.5" /> Print
    </Button>
  );
}

export default function TenantInvoices() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showDialog, setShowDialog] = useState(false);
  const [editInvoice, setEditInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isLoading } = useQuery<{ data: Invoice[]; total: number }>({
    queryKey: ["tenant-invoices", activeCompanyId, statusFilter, search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (search) qs.set("search", search);
      const r = await fetch(`/api/tenant/invoices?${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: tenants } = useQuery<{ data: TenantOpt[] }>({
    queryKey: ["tenant-list-opts", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/tenant/tenants${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  const { data: bookings } = useQuery<{ data: BookingOpt[] }>({
    queryKey: ["tenant-booking-options", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/tenant/bookings${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  function openCreate() {
    setEditInvoice(null);
    setForm(EMPTY_FORM);
    setShowDialog(true);
  }
  function openEdit(inv: Invoice) {
    setEditInvoice(inv);
    setForm({
      tenant_id: String(inv.tenant_id),
      tenant_booking_id: inv.tenant_booking_id ? String(inv.tenant_booking_id) : "",
      title: inv.title,
      period_label: inv.period_label ?? "",
      amount: String(inv.amount),
      tax_amount: String(inv.tax_amount),
      due_date: inv.due_date ? inv.due_date.slice(0, 10) : "",
      issued_date: inv.issued_date ? inv.issued_date.slice(0, 10) : new Date().toISOString().slice(0, 10),
      status: inv.status,
      notes: inv.notes ?? "",
    });
    setShowDialog(true);
  }

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["tenant-invoices"] });
    qc.invalidateQueries({ queryKey: ["tenant-dashboard"] });
  };

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const url = editInvoice ? `/api/tenant/invoices/${editInvoice.id}` : "/api/tenant/invoices";
      const method = editInvoice ? "PUT" : "POST";
      const r = await fetch(url, {
        method, credentials: "include",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: editInvoice ? "Invoice diperbarui" : "Invoice dibuat" });
      setShowDialog(false);
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const sendMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tenant/invoices/${id}/send`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Invoice ditandai terkirim" }); invalidate(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tenant/invoices/${id}/mark-paid`, { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Invoice ditandai lunas" }); invalidate(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/tenant/invoices/${id}`, { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => { toast({ title: "Invoice dibatalkan" }); invalidate(); },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  function handleSave() {
    if (!form.tenant_id || !form.amount) return;
    saveMutation.mutate({
      company_id: activeCompanyId,
      tenant_id: Number(form.tenant_id),
      tenant_booking_id: form.tenant_booking_id ? Number(form.tenant_booking_id) : null,
      title: form.title,
      period_label: form.period_label || null,
      amount: Number(form.amount),
      tax_amount: Number(form.tax_amount || 0),
      due_date: form.due_date || null,
      issued_date: form.issued_date || new Date().toISOString().slice(0, 10),
      status: form.status,
      notes: form.notes || null,
    });
  }

  const filteredBookings = form.tenant_id
    ? (bookings?.data ?? []).filter((b) => String(b.tenant_id) === form.tenant_id)
    : (bookings?.data ?? []);

  const rows = data?.data ?? [];

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-violet-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Invoice Penyewa</h1>
              <p className="text-sm text-muted-foreground">Total: {data?.total ?? 0} invoice</p>
            </div>
          </div>
          <Button size="sm" className="gap-1" onClick={openCreate}>
            <Plus className="h-4 w-4" /> Buat Invoice
          </Button>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input placeholder="Cari no. invoice / penyewa…" className="h-8 text-xs pl-7 w-64"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
              <SelectItem value="sent">Terkirim</SelectItem>
              <SelectItem value="paid">Lunas</SelectItem>
              <SelectItem value="cancelled">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["No. Invoice", "Penyewa", "Unit", "Periode", "Tgl. Invoice", "Jatuh Tempo", "Status", "Total", ""].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Memuat…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Belum ada invoice</td></tr>
                ) : rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-violet-300 whitespace-nowrap cursor-pointer hover:underline"
                      onClick={() => openEdit(inv)}>
                      {inv.invoice_number}
                    </td>
                    <td className="py-2.5 px-3 text-foreground whitespace-nowrap">
                      <div>{inv.business_name}</div>
                      <div className="text-xs text-muted-foreground">{inv.owner_name}</div>
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {inv.unit_code ? `${inv.unit_code} – ${inv.unit_name ?? ""}` : inv.order_number ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">
                      {inv.period_label ?? "—"}
                    </td>
                    <td className="py-2.5 px-3 text-xs text-muted-foreground whitespace-nowrap">{fmtDate(inv.issued_date)}</td>
                    <td className="py-2.5 px-3 text-xs whitespace-nowrap">
                      {inv.due_date
                        ? <span className={new Date(inv.due_date) < new Date() && inv.status !== "paid" ? "text-red-400 font-medium" : "text-muted-foreground"}>
                            {fmtDate(inv.due_date)}
                          </span>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <Badge className={`${STATUS_COLOR[inv.status] ?? STATUS_COLOR.draft} text-xs`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-foreground text-right whitespace-nowrap">
                      {idr(Number(inv.total_amount))}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <div className="flex items-center gap-1 justify-end">
                        <PrintInvoice inv={inv} />
                        {inv.status === "draft" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-blue-400 hover:text-blue-300"
                            disabled={sendMutation.isPending}
                            onClick={() => sendMutation.mutate(inv.id)}>
                            <Send className="h-3.5 w-3.5" /> Kirim
                          </Button>
                        )}
                        {inv.status !== "paid" && inv.status !== "cancelled" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-emerald-400 hover:text-emerald-300"
                            disabled={markPaidMutation.isPending}
                            onClick={() => markPaidMutation.mutate(inv.id)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Lunas
                          </Button>
                        )}
                        {inv.status !== "cancelled" && (
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-red-400 hover:text-red-300"
                            disabled={cancelMutation.isPending}
                            onClick={() => { if (confirm("Batalkan invoice ini?")) cancelMutation.mutate(inv.id); }}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editInvoice ? `Edit Invoice – ${editInvoice.invoice_number}` : "Buat Invoice"}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 py-2 max-h-[65vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Penyewa *</Label>
                  <Select value={form.tenant_id} onValueChange={(v) => setForm((p) => ({ ...p, tenant_id: v, tenant_booking_id: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Pilih penyewa" /></SelectTrigger>
                    <SelectContent>
                      {(tenants?.data ?? []).map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>{t.business_name} – {t.owner_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Penyewaan (opsional)</Label>
                  <Select value={form.tenant_booking_id} onValueChange={(v) => {
                    const b = filteredBookings.find((x) => String(x.id) === v);
                    setForm((p) => ({ ...p, tenant_booking_id: v, amount: b ? String(b.total_price ?? b.price ?? "") : p.amount }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="Pilih penyewaan (opsional)" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">— Tanpa penyewaan —</SelectItem>
                      {filteredBookings.map((b) => (
                        <SelectItem key={b.id} value={String(b.id)}>{b.order_number} — {b.business_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Judul Invoice</Label>
                  <Input value={form.title} onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))} />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">Label Periode (mis: Jan 2026)</Label>
                  <Input placeholder="mis: Januari 2026" value={form.period_label}
                    onChange={(e) => setForm((p) => ({ ...p, period_label: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Jumlah (IDR) *</Label>
                  <Input type="number" min={0} value={form.amount}
                    onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Pajak / PPN (IDR)</Label>
                  <Input type="number" min={0} value={form.tax_amount}
                    onChange={(e) => setForm((p) => ({ ...p, tax_amount: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Tgl. Invoice</Label>
                  <Input type="date" value={form.issued_date}
                    onChange={(e) => setForm((p) => ({ ...p, issued_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Jatuh Tempo</Label>
                  <Input type="date" value={form.due_date}
                    onChange={(e) => setForm((p) => ({ ...p, due_date: e.target.value }))} />
                </div>
                {editInvoice && (
                  <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="draft">Draft</SelectItem>
                        <SelectItem value="sent">Terkirim</SelectItem>
                        <SelectItem value="paid">Lunas</SelectItem>
                        <SelectItem value="cancelled">Dibatalkan</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catatan</Label>
                <Textarea rows={2} value={form.notes}
                  onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
              {form.amount && (
                <div className="text-sm text-muted-foreground bg-muted/30 rounded-md px-3 py-2">
                  Total: <span className="font-semibold text-foreground">
                    {idr(Number(form.amount || 0) + Number(form.tax_amount || 0))}
                  </span>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
              <Button disabled={!form.tenant_id || !form.amount || saveMutation.isPending} onClick={handleSave}>
                {saveMutation.isPending ? "Menyimpan…" : editInvoice ? "Perbarui" : "Buat Invoice"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
