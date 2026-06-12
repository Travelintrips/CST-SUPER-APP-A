import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { FileText, Search, Eye, CheckCircle2, XCircle, RefreshCw } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtDate = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";

type Invoice = {
  id: number; invoice_number: string; tenant_id: number; booking_id: number | null;
  unit_code: string | null; period_start: string | null; period_end: string | null;
  due_date: string | null; invoice_date: string; rent_amount: number;
  service_charge_amount: number; electricity_charge_amount: number; water_charge_amount: number;
  other_charge_amount: number; discount_amount: number; penalty_amount: number;
  subtotal: number; tax_amount: number; total_amount: number; paid_amount: number;
  outstanding_amount: number; status: string; notes: string | null;
  business_name?: string;
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  sent: "bg-blue-900/30 text-blue-300 border-blue-700",
  partial: "bg-yellow-900/30 text-yellow-300 border-yellow-700",
  paid: "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  overdue: "bg-red-900/30 text-red-300 border-red-700",
  cancelled: "bg-muted text-muted-foreground border-border",
};
const STATUS_LABEL: Record<string, string> = {
  draft: "Draft", sent: "Terkirim", partial: "Sebagian", paid: "Lunas",
  overdue: "Jatuh Tempo", cancelled: "Dibatalkan",
};

export default function TenantInvoices() {
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [detailId, setDetailId] = useState<number | null>(null);

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

  const detail = data?.data.find((i) => i.id === detailId);

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/tenant/invoices/${id}/status`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: (_, { status }) => {
      toast({ title: `Invoice diubah ke: ${STATUS_LABEL[status] ?? status}` });
      qc.invalidateQueries({ queryKey: ["tenant-invoices"] });
      qc.invalidateQueries({ queryKey: ["tenant-dashboard"] });
      setDetailId(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const rows = data?.data ?? [];

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-6 w-6 text-orange-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Invoice Tenant</h1>
              <p className="text-sm text-muted-foreground">Total: {data?.total ?? 0} invoice</p>
            </div>
          </div>
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
              <SelectItem value="partial">Sebagian</SelectItem>
              <SelectItem value="paid">Lunas</SelectItem>
              <SelectItem value="overdue">Jatuh Tempo</SelectItem>
              <SelectItem value="cancelled">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["No. Invoice", "Penyewa", "Unit", "Periode", "Jatuh Tempo", "Total", "Terbayar", "Sisa", "Status", ""].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-xs text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">Memuat…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={10} className="py-10 text-center text-muted-foreground">Belum ada invoice</td></tr>
                ) : rows.map((inv) => (
                  <tr key={inv.id} className="border-b border-border/20 hover:bg-muted/20 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{inv.invoice_number}</td>
                    <td className="py-2.5 px-3 text-foreground whitespace-nowrap">{inv.business_name ?? `Tenant #${inv.tenant_id}`}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">{inv.unit_code ?? "—"}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">
                      {inv.period_start ? `${fmtDate(inv.period_start)} – ${fmtDate(inv.period_end)}` : fmtDate(inv.invoice_date)}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs whitespace-nowrap">
                      <span className={inv.status === "overdue" ? "text-red-400 font-medium" : ""}>{fmtDate(inv.due_date)}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-foreground whitespace-nowrap font-medium">{idr(Number(inv.total_amount))}</td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 whitespace-nowrap">{idr(Number(inv.paid_amount))}</td>
                    <td className="py-2.5 px-3 text-right text-yellow-400 whitespace-nowrap">{idr(Number(inv.outstanding_amount))}</td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <Badge className={`${STATUS_COLOR[inv.status] ?? "bg-muted"} text-xs`}>
                        {STATUS_LABEL[inv.status] ?? inv.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap text-right">
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDetailId(inv.id)}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {/* Detail Dialog */}
        <Dialog open={!!detailId} onOpenChange={(o) => { if (!o) setDetailId(null); }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-orange-400" />
                {detail?.invoice_number ?? "Detail Invoice"}
              </DialogTitle>
            </DialogHeader>
            {detail && (
              <div className="space-y-4 text-sm">
                <div className="flex items-center justify-between">
                  <Badge className={`${STATUS_COLOR[detail.status] ?? "bg-muted"} text-xs`}>
                    {STATUS_LABEL[detail.status] ?? detail.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Tgl: {fmtDate(detail.invoice_date)}</span>
                </div>

                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div><p className="text-muted-foreground">Penyewa</p><p className="font-medium">{detail.business_name ?? `Tenant #${detail.tenant_id}`}</p></div>
                  <div><p className="text-muted-foreground">Unit</p><p>{detail.unit_code ?? "—"}</p></div>
                  <div><p className="text-muted-foreground">Periode</p><p>{detail.period_start ? `${fmtDate(detail.period_start)} – ${fmtDate(detail.period_end)}` : "—"}</p></div>
                  <div><p className="text-muted-foreground">Jatuh Tempo</p><p className={detail.status === "overdue" ? "text-red-400 font-medium" : ""}>{fmtDate(detail.due_date)}</p></div>
                </div>

                <div className="border border-border/40 rounded p-3 space-y-1.5 text-xs">
                  {[
                    ["Sewa", detail.rent_amount],
                    ["Service Charge", detail.service_charge_amount],
                    ["Listrik", detail.electricity_charge_amount],
                    ["Air", detail.water_charge_amount],
                    ["Lainnya", detail.other_charge_amount],
                  ].filter(([, v]) => Number(v) > 0).map(([l, v]) => (
                    <div key={String(l)} className="flex justify-between">
                      <span className="text-muted-foreground">{l}</span>
                      <span>{idr(Number(v))}</span>
                    </div>
                  ))}
                  {Number(detail.discount_amount) > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Diskon</span><span>-{idr(Number(detail.discount_amount))}</span>
                    </div>
                  )}
                  {Number(detail.penalty_amount) > 0 && (
                    <div className="flex justify-between text-red-400">
                      <span>Denda</span><span>+{idr(Number(detail.penalty_amount))}</span>
                    </div>
                  )}
                  <div className="border-t border-border/40 pt-1.5 flex justify-between font-semibold">
                    <span>Total</span><span>{idr(Number(detail.total_amount))}</span>
                  </div>
                  <div className="flex justify-between text-emerald-400">
                    <span>Terbayar</span><span>{idr(Number(detail.paid_amount))}</span>
                  </div>
                  <div className="flex justify-between text-yellow-400 font-medium">
                    <span>Sisa Tagihan</span><span>{idr(Number(detail.outstanding_amount))}</span>
                  </div>
                </div>

                {detail.notes && (
                  <p className="text-xs text-muted-foreground border border-border/40 rounded p-2">{detail.notes}</p>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {detail.status === "draft" && (
                    <Button size="sm" className="gap-1 text-xs" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "sent" })}
                      disabled={updateStatusMutation.isPending}>
                      Kirim Invoice
                    </Button>
                  )}
                  {["sent", "partial", "overdue"].includes(detail.status) && (
                    <Button size="sm" className="gap-1 text-xs bg-emerald-700 hover:bg-emerald-600" onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "paid" })}
                      disabled={updateStatusMutation.isPending}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Tandai Lunas
                    </Button>
                  )}
                  {!["paid", "cancelled"].includes(detail.status) && (
                    <Button size="sm" variant="ghost" className="gap-1 text-xs text-red-400 hover:text-red-300"
                      onClick={() => updateStatusMutation.mutate({ id: detail.id, status: "cancelled" })}
                      disabled={updateStatusMutation.isPending}>
                      <XCircle className="h-3.5 w-3.5" /> Batalkan
                    </Button>
                  )}
                  {updateStatusMutation.isPending && <RefreshCw className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
