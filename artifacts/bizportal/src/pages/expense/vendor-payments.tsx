import { useState } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Loader2, Banknote, Trash2, Receipt } from "lucide-react";

const idr = (n: number | string) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(Number(n));
const fmtIDR = (raw: string) => { const d = raw.replace(/\D/g, ""); return d ? Number(d).toLocaleString("id-ID") : ""; };
const parseIDR = (v: string) => { const n = Number(v.replace(/\D/g, "")); return isNaN(n) ? 0 : n; };
const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "-";

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message ?? "Terjadi kesalahan.");
  return d;
}

export default function VendorPaymentsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const cq = activeCompanyId ? `?company=${activeCompanyId}` : "";

  const { data: list = [], isLoading } = useQuery({
    queryKey: ["vendor-payments", activeCompanyId],
    queryFn: () => apiFetch(`/api/vendor-payments${cq}`),
  });

  const { data: summary } = useQuery({
    queryKey: ["vendor-payments-summary", activeCompanyId],
    queryFn: () => apiFetch(`/api/vendor-payments/summary${cq}`),
  });

  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [pm, setPm] = useState("bank");
  const [payDate, setPayDate] = useState(today);
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const createMut = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/vendor-payments${cq}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: (d: any) => {
      toast({ title: `✓ ${d.payment_number} — ${idr(d.amount)} berhasil dicatat.` });
      qc.invalidateQueries({ queryKey: ["vendor-payments"] });
      qc.invalidateQueries({ queryKey: ["vendor-payments-summary"] });
      setShowForm(false); setVendorName(""); setAmountRaw(""); setReference(""); setNotes(""); setPayDate(today);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/vendor-payments/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Pembayaran dihapus." });
      qc.invalidateQueries({ queryKey: ["vendor-payments"] });
      qc.invalidateQueries({ queryKey: ["vendor-payments-summary"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const amount = parseIDR(amountRaw);
    if (!vendorName.trim()) return toast({ title: "Nama vendor wajib diisi.", variant: "destructive" });
    if (amount <= 0) return toast({ title: "Nominal harus lebih dari 0.", variant: "destructive" });
    createMut.mutate({ vendorName, amount, paymentMethod: pm, paymentDate: payDate, reference, notes });
  };

  const totalAmount = Number(summary?.total_amount ?? 0);
  const thisMonth   = Number(summary?.this_month_amount ?? 0);

  return (
    <AppShell>
      <div className="p-6 space-y-5 max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/expense">
              <Button variant="ghost" size="icon" className="h-8 w-8"><ArrowLeft size={15} /></Button>
            </Link>
            <div className="flex items-center gap-2">
              <Banknote size={20} className="text-emerald-400" />
              <div>
                <h1 className="text-xl font-bold">Pembayaran Vendor</h1>
                <p className="text-sm text-muted-foreground">DR Hutang Usaha · CR Bank / Kas</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {totalAmount > 0 && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Total Dibayar</p>
                <p className="font-mono text-emerald-400 font-semibold">{idr(totalAmount)}</p>
              </div>
            )}
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} className="mr-1" /> Catat Pembayaran
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        {summary && (
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Transaksi</p>
                <p className="text-2xl font-bold">{summary.total_count ?? 0}</p>
                <p className="text-xs text-muted-foreground mt-1">Bank: {summary.bank_count} · Kas: {summary.cash_count}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Total Nominal</p>
                <p className="text-xl font-bold text-emerald-400">{idr(totalAmount)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Bulan Ini</p>
                <p className="text-xl font-bold text-sky-400">{idr(thisMonth)}</p>
                <p className="text-xs text-muted-foreground mt-1">{summary.this_month_count ?? 0} transaksi</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Form */}
        {showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Form Pembayaran Vendor Baru</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nama Vendor <span className="text-destructive">*</span></Label>
                  <Input placeholder="Nama vendor / supplier..." value={vendorName} onChange={(e) => setVendorName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Referensi (No. Invoice/PO)</Label>
                  <Input placeholder="INV-001 atau PO-2024-001..." value={reference} onChange={(e) => setReference(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label>Nominal (IDR) <span className="text-destructive">*</span></Label>
                  <Input placeholder="0" className="font-mono" value={amountRaw} onChange={(e) => setAmountRaw(fmtIDR(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tanggal Bayar <span className="text-destructive">*</span></Label>
                  <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Metode Bayar</Label>
                  <Select value={pm} onValueChange={setPm}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">🏦 Transfer Bank</SelectItem>
                      <SelectItem value="cash">💵 Tunai</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Catatan</Label>
                <Textarea placeholder="Keterangan opsional..." value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? <Loader2 size={14} className="mr-1 animate-spin" /> : <Receipt size={14} className="mr-1" />}
                  Simpan & Buat Jurnal
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Batal</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="animate-spin text-muted-foreground" size={24} />
              </div>
            ) : list.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Banknote size={32} className="opacity-30" />
                <p className="text-sm">Belum ada pembayaran vendor.</p>
                <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                  <Plus size={13} className="mr-1" /> Catat Pembayaran
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>No. Pembayaran</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead className="text-right">Nominal</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {list.map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs text-sky-400">{row.payment_number}</TableCell>
                      <TableCell className="font-medium">{row.vendor_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{fmtDate(row.payment_date)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{row.reference ?? "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={row.payment_method === "bank"
                          ? "bg-blue-900/30 text-blue-300 border-blue-600"
                          : "bg-amber-900/30 text-amber-300 border-amber-600"}>
                          {row.payment_method === "bank" ? "Bank" : "Kas"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-sm">{idr(row.amount)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => { if (confirm("Hapus pembayaran ini?")) deleteMut.mutate(row.id); }}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
