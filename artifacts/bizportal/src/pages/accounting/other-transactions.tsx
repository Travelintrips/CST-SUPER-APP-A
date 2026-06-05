import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, ArrowDownLeft, ArrowUpRight, Ban, Printer, Download, RefreshCw, Info } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const fmtIDR = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d ? Number(d).toLocaleString("id-ID") : "";
};
const parseIDR = (v: string) => { const n = Number(v.replace(/\D/g, "")); return isNaN(n) ? 0 : n; };

const fmtDate = (s: string) =>
  new Date(s + "T00:00:00").toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message ?? "Terjadi kesalahan");
  return d;
}

interface OtherTx {
  id: number;
  entryNumber: string;
  date: string;
  description: string | null;
  ref: string | null;
  totalDebit: number;
  totalCredit: number;
  status: string;
  lines: {
    id: number;
    accountId: number;
    debit: number;
    credit: number;
    description: string | null;
    accountName: string | null;
    accountCode: string | null;
  }[];
}

interface Journal { id: number; code: string; name: string; type: string; }
interface Account { id: number; code: string; name: string; type: string; }

const INCOME_ACCOUNT_TYPES = ["revenue", "liability", "equity"];
const EXPENSE_ACCOUNT_TYPES = ["expense", "asset"];

function txType(tx: OtherTx): "income" | "expense" | "void" {
  if (tx.status !== "posted") return "void";
  const desc = tx.description ?? "";
  if (desc.includes("Penerimaan:")) return "income";
  return "expense";
}

export default function OtherTransactionsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const cq = activeCompanyId ? `?company=${activeCompanyId}` : "";

  const { data: txList = [], isLoading, refetch } = useQuery<OtherTx[]>({
    queryKey: ["other-transactions", activeCompanyId],
    queryFn: () => apiFetch(`/api/accounting/other-transactions${cq}`),
  });

  const { data: journals = [] } = useQuery<Journal[]>({
    queryKey: ["accounting-journals", activeCompanyId],
    queryFn: () => apiFetch(`/api/accounting/journals${cq}`),
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["accounting-accounts", activeCompanyId],
    queryFn: () => apiFetch(`/api/accounting/accounts${cq}`),
  });

  const bankJournals = useMemo(() => journals.filter((j) => j.type === "bank" || j.type === "cash"), [journals]);

  const today = new Date().toISOString().slice(0, 10);
  const [open, setOpen] = useState(false);
  const [tabFilter, setTabFilter] = useState<"all" | "income" | "expense">("all");

  const [form, setForm] = useState({
    type: "income" as "income" | "expense",
    journalId: "",
    counterAccountId: "",
    amountRaw: "",
    date: today,
    description: "",
    ref: "",
  });

  const reset = () => setForm({ type: "income", journalId: "", counterAccountId: "", amountRaw: "", date: today, description: "", ref: "" });

  const counterAccounts = useMemo(() => {
    const allowedTypes = form.type === "income" ? INCOME_ACCOUNT_TYPES : EXPENSE_ACCOUNT_TYPES;
    return accounts.filter((a) => allowedTypes.includes(a.type));
  }, [accounts, form.type]);

  const createMut = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/accounting/other-transactions${cq}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: () => {
      toast({ title: "Transaksi berhasil dicatat" });
      qc.invalidateQueries({ queryKey: ["other-transactions"] });
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const voidMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/accounting/other-transactions/${id}/void${cq}`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Transaksi dibatalkan" });
      qc.invalidateQueries({ queryKey: ["other-transactions"] });
    },
    onError: (e: any) => toast({ title: "Gagal", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = () => {
    const amt = parseIDR(form.amountRaw);
    if (!form.journalId || !form.counterAccountId || !amt || !form.date)
      return toast({ title: "Lengkapi semua field", variant: "destructive" });
    createMut.mutate({
      type: form.type,
      journalId: Number(form.journalId),
      counterAccountId: Number(form.counterAccountId),
      amount: amt,
      date: form.date,
      description: form.description || undefined,
      ref: form.ref || undefined,
    });
  };

  const filtered = useMemo(() => {
    if (tabFilter === "all") return txList;
    if (tabFilter === "income") return txList.filter((t) => txType(t) === "income");
    return txList.filter((t) => txType(t) === "expense");
  }, [txList, tabFilter]);

  const totalIncome = txList.filter((t) => txType(t) === "income").reduce((s, t) => s + t.totalDebit, 0);
  const totalExpense = txList.filter((t) => txType(t) === "expense").reduce((s, t) => s + t.totalDebit, 0);

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-50">Penerimaan & Pengeluaran Lain</h1>
            <p className="text-slate-400 text-sm mt-1">
              Catat transaksi pendapatan atau pengeluaran di luar AR/AP — bunga bank, sewa, denda, dsb.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => printWindow(
              "Penerimaan & Pengeluaran Lain",
              ["Tanggal", "No. Entri", "Tipe", "Keterangan", "Referensi", "Jumlah", "Status"],
              filtered.map((t) => [
                t.date, t.entryNumber,
                txType(t) === "income" ? "Penerimaan" : txType(t) === "expense" ? "Pengeluaran" : "Dibatalkan",
                t.description?.replace(/^\[OTH\]\s*/, "") ?? "",
                t.ref ?? "",
                t.totalDebit,
                t.status === "posted" ? "Aktif" : "Dibatalkan",
              ]),
              [6]
            )} disabled={filtered.length === 0}>
              <Printer className="h-4 w-4 mr-1.5" />Print
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportXlsx(
              "Penerimaan & Pengeluaran Lain",
              ["Tanggal", "No. Entri", "Tipe", "Keterangan", "Referensi", "Jumlah", "Status"],
              filtered.map((t) => [
                t.date, t.entryNumber,
                txType(t) === "income" ? "Penerimaan" : txType(t) === "expense" ? "Pengeluaran" : "Dibatalkan",
                t.description?.replace(/^\[OTH\]\s*/, "") ?? "",
                t.ref ?? "",
                t.totalDebit,
                t.status === "posted" ? "Aktif" : "Dibatalkan",
              ])
            )} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />Excel
            </Button>
            <Button variant="outline" size="icon" onClick={() => refetch()} title="Refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
              <DialogTrigger asChild>
                <Button className="gap-2"><Plus className="h-4 w-4" /> Catat Transaksi</Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Catat Penerimaan / Pengeluaran Lain</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-1">
                  <div className="space-y-1">
                    <Label>Tipe Transaksi</Label>
                    <Select value={form.type} onValueChange={(v) => setForm((f) => ({ ...f, type: v as "income" | "expense", counterAccountId: "" }))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="income">
                          <span className="flex items-center gap-2"><ArrowDownLeft className="h-4 w-4 text-emerald-400" /> Penerimaan Lain</span>
                        </SelectItem>
                        <SelectItem value="expense">
                          <span className="flex items-center gap-2"><ArrowUpRight className="h-4 w-4 text-red-400" /> Pengeluaran Lain</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-slate-400 pt-0.5">
                      {form.type === "income"
                        ? "Posting: DR Kas/Bank → CR Akun Pendapatan"
                        : "Posting: DR Akun Beban → CR Kas/Bank"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <Label>Jurnal Kas / Bank</Label>
                    <Select value={form.journalId} onValueChange={(v) => setForm((f) => ({ ...f, journalId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Pilih jurnal..." /></SelectTrigger>
                      <SelectContent>
                        {bankJournals.map((j) => (
                          <SelectItem key={j.id} value={String(j.id)}>
                            [{j.code}] {j.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1">
                    <Label>{form.type === "income" ? "Akun Pendapatan (Kredit)" : "Akun Beban (Debit)"}</Label>
                    <Select value={form.counterAccountId} onValueChange={(v) => setForm((f) => ({ ...f, counterAccountId: v }))}>
                      <SelectTrigger><SelectValue placeholder="Pilih akun..." /></SelectTrigger>
                      <SelectContent>
                        {counterAccounts.map((a) => (
                          <SelectItem key={a.id} value={String(a.id)}>
                            [{a.code}] {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Jumlah (IDR)</Label>
                      <Input
                        placeholder="0"
                        value={form.amountRaw}
                        onChange={(e) => setForm((f) => ({ ...f, amountRaw: fmtIDR(e.target.value) }))}
                        className="text-right font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Tanggal</Label>
                      <Input type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label>Keterangan</Label>
                    <Textarea
                      placeholder="Mis: Pendapatan bunga bank BCA bulan Mei..."
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      rows={2}
                      className="resize-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label>Referensi (opsional)</Label>
                    <Input
                      placeholder="No. memo, bukti, dsb."
                      value={form.ref}
                      onChange={(e) => setForm((f) => ({ ...f, ref: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button onClick={handleSubmit} disabled={createMut.isPending}>
                    {createMut.isPending ? "Menyimpan..." : "Catat"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-emerald-950/30 border-emerald-800/50">
            <CardContent className="py-4 px-5">
              <p className="text-xs text-emerald-400 font-medium uppercase tracking-wide">Total Penerimaan</p>
              <p className="text-2xl font-bold text-emerald-300 mt-1">{idr(totalIncome)}</p>
            </CardContent>
          </Card>
          <Card className="bg-red-950/30 border-red-800/50">
            <CardContent className="py-4 px-5">
              <p className="text-xs text-red-400 font-medium uppercase tracking-wide">Total Pengeluaran</p>
              <p className="text-2xl font-bold text-red-300 mt-1">{idr(totalExpense)}</p>
            </CardContent>
          </Card>
          <Card className="bg-slate-800/40 border-slate-700/50">
            <CardContent className="py-4 px-5">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wide">Net</p>
              <p className={`text-2xl font-bold mt-1 ${totalIncome - totalExpense >= 0 ? "text-emerald-300" : "text-red-300"}`}>
                {idr(totalIncome - totalExpense)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardHeader className="pb-2">
            <Tabs value={tabFilter} onValueChange={(v) => setTabFilter(v as any)}>
              <TabsList className="h-8">
                <TabsTrigger value="all" className="text-xs">Semua ({txList.length})</TabsTrigger>
                <TabsTrigger value="income" className="text-xs">Penerimaan</TabsTrigger>
                <TabsTrigger value="expense" className="text-xs">Pengeluaran</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="py-10 text-center text-slate-400 text-sm">Memuat...</div>
            ) : filtered.length === 0 ? (
              <div className="py-12 text-center">
                <Info className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                <p className="text-slate-400 text-sm">Belum ada transaksi</p>
                <p className="text-slate-500 text-xs mt-1">Klik "Catat Transaksi" untuk menambah</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border">
                    <TableHead className="text-xs">Tanggal</TableHead>
                    <TableHead className="text-xs">No. Entri</TableHead>
                    <TableHead className="text-xs">Tipe</TableHead>
                    <TableHead className="text-xs">Keterangan</TableHead>
                    <TableHead className="text-xs">Akun Lawan</TableHead>
                    <TableHead className="text-xs">Referensi</TableHead>
                    <TableHead className="text-xs text-right">Jumlah</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((tx) => {
                    const type = txType(tx);
                    const bankLine = type === "income"
                      ? tx.lines.find((l) => l.debit > 0)
                      : tx.lines.find((l) => l.credit > 0);
                    const counterLine = type === "income"
                      ? tx.lines.find((l) => l.credit > 0)
                      : tx.lines.find((l) => l.debit > 0);
                    const cleanDesc = tx.description?.replace(/^\[OTH\]\s*(Penerimaan|Pengeluaran):\s*/, "") ?? "";
                    const amount = type === "income" ? tx.totalDebit : tx.totalDebit;
                    return (
                      <TableRow key={tx.id} className="border-border text-sm">
                        <TableCell className="text-xs text-slate-300 whitespace-nowrap">
                          {fmtDate(tx.date)}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-slate-400">{tx.entryNumber}</TableCell>
                        <TableCell>
                          {type === "void" ? (
                            <Badge className="text-xs border bg-slate-800 text-slate-400 border-slate-700">Dibatalkan</Badge>
                          ) : type === "income" ? (
                            <Badge className="text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700 gap-1">
                              <ArrowDownLeft className="h-3 w-3" /> Penerimaan
                            </Badge>
                          ) : (
                            <Badge className="text-xs border bg-red-900/40 text-red-300 border-red-700 gap-1">
                              <ArrowUpRight className="h-3 w-3" /> Pengeluaran
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs text-slate-300 max-w-[180px] truncate" title={cleanDesc}>
                          {cleanDesc}
                        </TableCell>
                        <TableCell className="text-xs text-slate-400">
                          {counterLine?.accountCode && (
                            <span className="font-mono">[{counterLine.accountCode}]</span>
                          )}{" "}
                          {counterLine?.accountName ?? "-"}
                        </TableCell>
                        <TableCell className="text-xs text-slate-500 font-mono">{tx.ref ?? "-"}</TableCell>
                        <TableCell className="text-right font-mono text-sm font-medium">
                          {type === "void" ? (
                            <span className="text-slate-500 line-through">{idr(tx.totalDebit)}</span>
                          ) : type === "income" ? (
                            <span className="text-emerald-400">+{idr(amount)}</span>
                          ) : (
                            <span className="text-red-400">-{idr(amount)}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {tx.status === "posted" ? (
                            <Badge className="text-xs border bg-sky-900/30 text-sky-300 border-sky-700">Posted</Badge>
                          ) : (
                            <Badge className="text-xs border bg-slate-800 text-slate-500 border-slate-700">Draft/Batal</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {tx.status === "posted" && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-slate-400 hover:text-red-400"
                              title="Batalkan transaksi"
                              onClick={() => {
                                if (confirm("Batalkan transaksi ini? Akan dibuat jurnal pembalik."))
                                  voidMut.mutate(tx.id);
                              }}
                              disabled={voidMut.isPending}
                            >
                              <Ban className="h-3.5 w-3.5" />
                            </Button>
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
