import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Search, Download, RefreshCw, Pencil, ChevronLeft, ChevronRight, FileText } from "lucide-react";
import { useCompany } from "@/contexts/CompanyContext";

function formatRp(n: number) { return "Rp " + Math.abs(Math.round(n)).toLocaleString("id-ID"); }
function generatePeriods() {
  const p: string[] = [];
  const now = new Date();
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    p.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return p;
}
const PERIODS = ["all", ...generatePeriods()];
const STATUS_OPTIONS = ["all", "pending", "paid", "reported"];

interface TaxTx {
  id: number;
  period: string;
  transaction_type: string;
  transaction_ref: string | null;
  tax_name: string;
  tax_rate: number;
  baseAmount: number;
  taxAmount: number;
  direction: string;
  status: string;
  partner_name: string | null;
  npwp: string | null;
  tax_invoice_number: string | null;
  created_at: string;
}

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-orange-100 text-orange-700",
  paid: "bg-emerald-100 text-emerald-700",
  reported: "bg-blue-100 text-blue-700",
};

export default function TaxTransactionsPage() {
  const { selectedCompanyId } = useCompany();
  const qc = useQueryClient();
  const [period, setPeriod] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [editTx, setEditTx] = useState<TaxTx | null>(null);
  const [npwpForm, setNpwpForm] = useState({ npwp: "", taxInvoiceNumber: "", partnerName: "" });

  const params = new URLSearchParams({ page: String(page), limit: "50" });
  if (selectedCompanyId) params.set("companyId", String(selectedCompanyId));
  if (period !== "all") params.set("period", period);
  if (status !== "all") params.set("status", status);
  if (search) params.set("search", search);

  const { data, isLoading, isFetching, refetch } = useQuery<{ data: TaxTx[]; total: number; page: number; limit: number }>({
    queryKey: ["tax-transactions", selectedCompanyId, period, status, search, page],
    queryFn: () => fetch(`/api/tax/transactions?${params}`, { credentials: "include" }).then((r) => r.json()),
  });

  const updateNpwpMut = useMutation({
    mutationFn: async () => {
      if (!editTx) return;
      const r = await fetch(`/api/tax/transactions/${editTx.id}/npwp`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(npwpForm),
      });
      if (!r.ok) throw new Error("Gagal update");
      return r.json();
    },
    onSuccess: () => { toast.success("Data diperbarui"); setEditTx(null); qc.invalidateQueries({ queryKey: ["tax-transactions"] }); },
    onError: () => toast.error("Gagal memperbarui"),
  });

  const markMut = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const endpoint = status === "paid" ? "mark-paid" : "mark-reported";
      const r = await fetch(`/api/accounting/tax-transactions/${id}/${endpoint}`, {
        method: "PATCH", credentials: "include",
      });
      if (!r.ok) throw new Error("Gagal");
      return r.json();
    },
    onSuccess: () => { toast.success("Status diperbarui"); qc.invalidateQueries({ queryKey: ["tax-transactions"] }); },
    onError: () => toast.error("Gagal memperbarui status"),
  });

  const rows = data?.data ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  function openEdit(tx: TaxTx) {
    setNpwpForm({ npwp: tx.npwp ?? "", taxInvoiceNumber: tx.tax_invoice_number ?? "", partnerName: tx.partner_name ?? "" });
    setEditTx(tx);
  }

  return (
    <AppShell>
      <div className="p-6 space-y-4 max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-indigo-600" />
              Transaksi Pajak
            </h1>
            <p className="text-sm text-muted-foreground">{total} transaksi ditemukan</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => {
              const p = new URLSearchParams(params);
              if (selectedCompanyId) p.set("companyId", String(selectedCompanyId));
              window.open(`/api/tax/export?${p}`, "_blank");
            }}>
              <Download className="h-4 w-4 mr-1.5" />Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Select value={period} onValueChange={(v) => { setPeriod(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => <SelectItem key={p} value={p}>{p === "all" ? "Semua Periode" : p}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-36 h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s === "all" ? "Semua Status" : s}</SelectItem>)}
            </SelectContent>
          </Select>
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); setSearch(searchInput); setPage(1); }}>
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8 h-8 text-xs w-48" placeholder="Cari referensi / partner…" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} />
            </div>
            <Button type="submit" size="sm" variant="outline" className="h-8 text-xs">Cari</Button>
          </form>
        </div>

        {/* Table */}
        <div className="rounded-xl border overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">Periode</th>
                  <th className="px-4 py-3 text-left">Referensi</th>
                  <th className="px-4 py-3 text-left">Partner</th>
                  <th className="px-4 py-3 text-left">Nama Pajak</th>
                  <th className="px-4 py-3 text-right">DPP</th>
                  <th className="px-4 py-3 text-right">Pajak</th>
                  <th className="px-4 py-3 text-left">Arah</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading && (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}><td colSpan={9} className="px-4 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td></tr>
                  ))
                )}
                {!isLoading && rows.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">Tidak ada data</td></tr>
                )}
                {rows.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 text-xs text-muted-foreground">{tx.period}</td>
                    <td className="px-4 py-3 font-mono text-xs">{tx.transaction_ref ?? "-"}</td>
                    <td className="px-4 py-3 text-xs">
                      <div>{tx.partner_name ?? <span className="text-muted-foreground/60">-</span>}</div>
                      {tx.npwp && <div className="text-muted-foreground font-mono">{tx.npwp}</div>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-xs font-medium">{tx.tax_name}</div>
                      <div className="text-xs text-muted-foreground">{Number(tx.tax_rate).toFixed(1)}%</div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs">{formatRp(tx.baseAmount)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold">{formatRp(tx.taxAmount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        tx.direction === "output" ? "bg-blue-100 text-blue-700" :
                        tx.direction === "input" ? "bg-violet-100 text-violet-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>{tx.direction ?? "output"}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLOR[tx.status] ?? "bg-muted text-muted-foreground"}`}>
                        {tx.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {tx.status === "pending" && (
                          <>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => markMut.mutate({ id: tx.id, status: "paid" })}>
                              Setor
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 text-xs px-2" onClick={() => markMut.mutate({ id: tx.id, status: "reported" })}>
                              Lapor
                            </Button>
                          </>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(tx)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{total} total · halaman {page} dari {totalPages}</p>
            <div className="flex gap-1">
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="icon" className="h-8 w-8" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* NPWP / No. Faktur Edit Dialog */}
      <Dialog open={!!editTx} onOpenChange={(o) => !o && setEditTx(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Isi NPWP & No. Faktur</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>Nama Partner</Label>
              <Input value={npwpForm.partnerName} onChange={(e) => setNpwpForm((f) => ({ ...f, partnerName: e.target.value }))} placeholder="Nama perusahaan/individu" />
            </div>
            <div className="space-y-1.5">
              <Label>NPWP</Label>
              <Input value={npwpForm.npwp} onChange={(e) => setNpwpForm((f) => ({ ...f, npwp: e.target.value }))} placeholder="00.000.000.0-000.000" />
            </div>
            <div className="space-y-1.5">
              <Label>No. Faktur Pajak</Label>
              <Input value={npwpForm.taxInvoiceNumber} onChange={(e) => setNpwpForm((f) => ({ ...f, taxInvoiceNumber: e.target.value }))} placeholder="000.000-00.00000000" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTx(null)}>Batal</Button>
            <Button onClick={() => updateNpwpMut.mutate()} disabled={updateNpwpMut.isPending}>Simpan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
