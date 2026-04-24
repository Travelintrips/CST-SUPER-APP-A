import { useState, useMemo } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowDownLeft, ArrowUpRight, ExternalLink } from "lucide-react";
import {
  useListAccountingPayments,
  getListAccountingPaymentsQueryKey,
  useCreateAccountingPayment,
  useListJournals,
  type AccountingPayment,
} from "@workspace/api-client-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const formatDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

export default function PaymentsPage() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [filter, setFilter] = useState<{ paymentType?: "inbound" | "outbound"; from?: string; to?: string }>({});

  const params = useMemo(() => ({
    ...(filter.paymentType ? { paymentType: filter.paymentType } : {}),
    ...(filter.from ? { from: new Date(filter.from).toISOString() } : {}),
    ...(filter.to ? { to: new Date(filter.to + "T23:59:59").toISOString() } : {}),
  }), [filter]);

  const { data: payments = [] as AccountingPayment[], isLoading } = useListAccountingPayments(params, {
    query: { queryKey: getListAccountingPaymentsQueryKey(params) },
  });
  const { data: journals = [] } = useListJournals();
  const bankCashJournals = journals.filter((j) => j.type === "bank" || j.type === "cash");

  const createMut = useCreateAccountingPayment();
  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);

  const emptyForm = {
    paymentType: "inbound" as "inbound" | "outbound",
    amount: "",
    journalId: "",
    partnerName: "",
    date: today,
    ref: "",
    memo: "",
  };
  const [form, setForm] = useState(emptyForm);

  const reset = () => setForm(emptyForm);

  const totalInbound = (payments as AccountingPayment[]).filter((p) => p.paymentType === "inbound").reduce((s: number, p: AccountingPayment) => s + p.amount, 0);
  const totalOutbound = (payments as AccountingPayment[]).filter((p) => p.paymentType === "outbound").reduce((s: number, p: AccountingPayment) => s + p.amount, 0);

  const submit = async () => {
    if (!form.paymentType || !form.amount || !form.journalId || !form.date) {
      toast({ title: "Tipe, jumlah, jurnal & tanggal wajib diisi", variant: "destructive" });
      return;
    }
    const amt = Number(form.amount);
    if (Number.isNaN(amt) || amt <= 0) {
      toast({ title: "Jumlah harus angka positif", variant: "destructive" });
      return;
    }
    try {
      await createMut.mutateAsync({
        data: {
          paymentType: form.paymentType,
          amount: amt,
          journalId: Number(form.journalId),
          partnerName: form.partnerName || undefined,
          date: form.date,
          ref: form.ref || undefined,
          memo: form.memo || undefined,
        },
      });
      toast({ title: "Pembayaran berhasil dicatat", description: "Jurnal otomatis dibuat." });
      await qc.invalidateQueries({ queryKey: getListAccountingPaymentsQueryKey() });
      setOpen(false);
      reset();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(err);
      toast({ title: "Gagal mencatat", description: msg, variant: "destructive" });
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Pembayaran</h1>
            <p className="text-slate-400 text-sm mt-1">
              Catat penerimaan dari pelanggan dan pembayaran ke pemasok secara manual.
            </p>
          </div>
          <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Catat Pembayaran</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Catat Pembayaran Manual</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-1">
                  <Label>Tipe Pembayaran</Label>
                  <Select
                    value={form.paymentType}
                    onValueChange={(v) => setForm((f) => ({ ...f, paymentType: v as "inbound" | "outbound" }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="inbound">
                        <span className="flex items-center gap-2">
                          <ArrowDownLeft className="h-4 w-4 text-emerald-400" /> Bayar Masuk (Penerimaan)
                        </span>
                      </SelectItem>
                      <SelectItem value="outbound">
                        <span className="flex items-center gap-2">
                          <ArrowUpRight className="h-4 w-4 text-red-400" /> Bayar Keluar (Pembayaran)
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-slate-400 pt-0.5">
                    {form.paymentType === "inbound"
                      ? "Posting: DR Bank/Kas \u2192 CR Piutang (AR)"
                      : "Posting: DR Hutang (AP) \u2192 CR Bank/Kas"}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Tanggal</Label>
                    <Input
                      type="date"
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Jumlah (IDR)</Label>
                    <Input
                      type="number"
                      min="0"
                      step="1000"
                      placeholder="0"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label>Jurnal (Bank / Kas)</Label>
                  <Select
                    value={form.journalId}
                    onValueChange={(v) => setForm((f) => ({ ...f, journalId: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Pilih jurnal..." />
                    </SelectTrigger>
                    <SelectContent>
                      {bankCashJournals.map((j) => (
                        <SelectItem key={j.id} value={String(j.id)}>
                          [{j.code}] {j.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Nama Mitra (Opsional)</Label>
                  <Input
                    placeholder="Nama pelanggan / pemasok"
                    value={form.partnerName}
                    onChange={(e) => setForm((f) => ({ ...f, partnerName: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label>No. Referensi (Opsional)</Label>
                  <Input
                    placeholder="Mis. INV/2024/001 atau PO-005"
                    value={form.ref}
                    onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Memo (Opsional)</Label>
                  <Textarea
                    placeholder="Keterangan tambahan..."
                    rows={2}
                    value={form.memo}
                    onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setOpen(false); reset(); }}>Batal</Button>
                <Button onClick={submit} disabled={createMut.isPending}>
                  {createMut.isPending ? "Menyimpan..." : "Simpan & Posting"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card className="border-emerald-800/40 bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <ArrowDownLeft className="h-4 w-4 text-emerald-400" /> Total Bayar Masuk
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-emerald-400">{idr(totalInbound)}</p>
            </CardContent>
          </Card>
          <Card className="border-red-800/40 bg-slate-900">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-slate-400 flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-red-400" /> Total Bayar Keluar
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-red-400">{idr(totalOutbound)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-800 bg-slate-900">
          <CardContent className="pt-4">
            <div className="flex flex-wrap gap-3 mb-4">
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-xs whitespace-nowrap">Tipe</Label>
                <Select
                  value={filter.paymentType ?? "all"}
                  onValueChange={(v) =>
                    setFilter((f) => ({ ...f, paymentType: v === "all" ? undefined : (v as "inbound" | "outbound") }))
                  }
                >
                  <SelectTrigger className="w-36 h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua</SelectItem>
                    <SelectItem value="inbound">Bayar Masuk</SelectItem>
                    <SelectItem value="outbound">Bayar Keluar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-xs whitespace-nowrap">Dari</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-36"
                  value={filter.from ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, from: e.target.value || undefined }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-slate-400 text-xs whitespace-nowrap">Sampai</Label>
                <Input
                  type="date"
                  className="h-8 text-xs w-36"
                  value={filter.to ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, to: e.target.value || undefined }))}
                />
              </div>
              {(filter.paymentType || filter.from || filter.to) && (
                <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setFilter({})}>
                  Reset
                </Button>
              )}
            </div>

            {isLoading ? (
              <p className="text-slate-400 text-sm py-8 text-center">Memuat data...</p>
            ) : payments.length === 0 ? (
              <p className="text-slate-500 text-sm py-8 text-center">
                Belum ada pembayaran yang dicatat. Klik &ldquo;Catat Pembayaran&rdquo; untuk mulai.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Tipe</TableHead>
                    <TableHead>Mitra</TableHead>
                    <TableHead>Referensi</TableHead>
                    <TableHead className="text-right">Jumlah (IDR)</TableHead>
                    <TableHead>Jurnal</TableHead>
                    <TableHead>Entry</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(payments as AccountingPayment[]).map((p) => {
                    const journal = journals.find((j) => j.id === p.journalId);
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="text-slate-300 text-xs whitespace-nowrap">
                          {formatDate(p.date)}
                        </TableCell>
                        <TableCell>
                          {p.paymentType === "inbound" ? (
                            <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-700 text-xs gap-1">
                              <ArrowDownLeft className="h-3 w-3" /> Masuk
                            </Badge>
                          ) : (
                            <Badge className="bg-red-900/40 text-red-300 border-red-700 text-xs gap-1">
                              <ArrowUpRight className="h-3 w-3" /> Keluar
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-300 text-sm">{p.partnerName ?? "-"}</TableCell>
                        <TableCell className="text-slate-400 text-xs font-mono">{p.ref ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm tabular-nums">
                          <span className={p.paymentType === "inbound" ? "text-emerald-400" : "text-red-400"}>
                            {idr(p.amount)}
                          </span>
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs">
                          {journal ? `[${journal.code}] ${journal.name}` : "-"}
                        </TableCell>
                        <TableCell>
                          {p.entryId ? (
                            <Link href={`/accounting/entries/${p.entryId}`}>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 text-xs gap-1 text-indigo-400 hover:text-indigo-300 px-2"
                              >
                                <ExternalLink className="h-3 w-3" /> Lihat
                              </Button>
                            </Link>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
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
      </div>
    </AppShell>
  );
}
