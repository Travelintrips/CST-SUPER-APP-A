import { useState, useMemo } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
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
import { AccountCombobox } from "@/components/accounting/AccountCombobox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/contexts/LanguageContext";
import { useCompany } from "@/contexts/CompanyContext";
import {
  useListAccountingEntries, useCreateAccountingEntry, useListJournals, useListAccounts,
  getListAccountingEntriesQueryKey,
  getGetAccountingEntryQueryOptions,
  type AccountingEntry,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { usePrefetchOnHover } from "@/hooks/use-prefetch-on-hover";
import { Plus, FileText, Trash2, Printer, Download, RotateCcw, RefreshCw } from "lucide-react";
import { exportXlsx, printWindow } from "@/lib/export";

const idr = (n: number) => new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual",
  sales_invoice: "Faktur Jual",
  purchase_bill: "Tagihan Beli",
  sales_payment: "Bayar Masuk",
  purchase_payment: "Bayar Keluar",
  manual_payment: "Bayar Manual",
  reversal: "Pembalik",
};

type LineForm = { accountId: number; debit: number; credit: number; description: string };

function ReverseDialog({ entry, onDone }: { entry: AccountingEntry; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleReverse = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/accounting/entries/${entry.id}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? `HTTP ${resp.status}`);
      }
      toast({ title: "Jurnal pembalik berhasil dibuat" });
      setOpen(false);
      setReason("");
      onDone();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(err);
      toast({ title: "Gagal membalik jurnal", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (entry.source === "reversal") return null;
  if (entry.status !== "posted") return null;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 px-2">
          <RotateCcw className="h-3 w-3" /> Balik
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Buat Jurnal Pembalik?</DialogTitle></DialogHeader>
        <div className="space-y-3 py-2 text-sm text-slate-300">
          <p>Akan membuat entri baru dengan DR/CR <strong>dibalik</strong> untuk mengimbangi entri <span className="font-mono text-indigo-300">{entry.entryNumber}</span>.</p>
          <div className="space-y-1">
            <Label className="text-slate-300 text-xs">Alasan <span className="text-slate-500">(opsional)</span></Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Mis. kesalahan posting..." className="text-sm resize-none" />
          </div>
          <p className="text-amber-400 text-xs">Jurnal pembalik akan langsung diposting.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Batal</Button>
          <Button onClick={handleReverse} disabled={loading} className="bg-amber-600 hover:bg-amber-700">
            {loading ? "Memproses..." : "Ya, Buat Pembalik"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetDraftDialog({ entry, onDone }: { entry: AccountingEntry; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleReset = async () => {
    setLoading(true);
    try {
      const resp = await fetch(`/api/accounting/entries/${entry.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "draft" }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message ?? `HTTP ${resp.status}`);
      }
      toast({ title: "Entri berhasil direset ke Draft" });
      setOpen(false);
      onDone();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? String(err);
      toast({ title: "Gagal reset draft", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  if (entry.source !== "manual") return null;
  if (entry.status !== "posted") return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 text-slate-400 hover:text-slate-300 hover:bg-slate-800 px-2">
          <RefreshCw className="h-3 w-3" /> Reset
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Reset ke Draft?</DialogTitle></DialogHeader>
        <p className="text-sm text-slate-300 py-2">
          Entri <span className="font-mono text-indigo-300">{entry.entryNumber}</span> akan dikembalikan ke status <strong>Draft</strong>. Laporan keuangan tidak akan terpengaruh sampai diposting ulang.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>Batal</Button>
          <Button onClick={handleReset} disabled={loading} variant="secondary">
            {loading ? "Mereset..." : "Ya, Reset Draft"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EntriesPage() {
  const qc = useQueryClient();
  const prefetchHover = usePrefetchOnHover();
  const { toast } = useToast();
  const { t } = useLanguage();
  const { activeCompanyId, isConsolidated } = useCompany();
  const [filter, setFilter] = useState<{ journalId?: number; from?: string; to?: string }>({});
  const params = useMemo(() => ({
    ...(filter.journalId ? { journalId: filter.journalId } : {}),
    ...(filter.from ? { from: new Date(filter.from).toISOString() } : {}),
    ...(filter.to ? { to: new Date(filter.to + "T23:59:59").toISOString() } : {}),
    company: (isConsolidated ? "all" : activeCompanyId) as unknown as number,
  }), [filter, activeCompanyId, isConsolidated]);
  const { data: entries } = useListAccountingEntries(params, { query: { queryKey: getListAccountingEntriesQueryKey(params) } });
  const { data: journals } = useListJournals();
  const { data: accounts } = useListAccounts();
  const createMut = useCreateAccountingEntry();

  const [open, setOpen] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    journalId: 0, date: today, ref: "", description: "",
    lines: [
      { accountId: 0, debit: 0, credit: 0, description: "" },
      { accountId: 0, debit: 0, credit: 0, description: "" },
    ] as LineForm[],
  });

  const reset = () => setForm({
    journalId: 0, date: today, ref: "", description: "",
    lines: [{ accountId: 0, debit: 0, credit: 0, description: "" }, { accountId: 0, debit: 0, credit: 0, description: "" }],
  });

  const totalD = form.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalC = form.lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalD === totalC && totalD > 0;

  const submit = async () => {
    if (!form.journalId || !form.date) {
      toast({ title: t.common.error, variant: "destructive" }); return;
    }
    if (!balanced) {
      toast({ title: t.common.error, description: `Debit ${idr(totalD)} ≠ Kredit ${idr(totalC)}`, variant: "destructive" }); return;
    }
    const lines = form.lines.filter((l) => l.accountId && (Number(l.debit) || Number(l.credit)));
    if (lines.length < 2) {
      toast({ title: t.common.error, variant: "destructive" }); return;
    }
    try {
      await createMut.mutateAsync({
        data: {
          journalId: form.journalId, date: new Date(form.date).toISOString(),
          ref: form.ref || null, description: form.description || null,
          lines: lines.map((l) => ({ accountId: l.accountId, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, description: l.description || null })),
        },
      });
      toast({ title: t.common.success });
      qc.invalidateQueries({ queryKey: getListAccountingEntriesQueryKey() });
      reset(); setOpen(false);
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message ?? String(e);
      toast({ title: t.common.error, description: msg, variant: "destructive" });
    }
  };

  const refreshEntries = () => qc.invalidateQueries({ queryKey: getListAccountingEntriesQueryKey() });

  const journalLabel = (id: number) => journals?.find((j) => j.id === id)?.code ?? `#${id}`;

  const rows = entries ?? [];
  const headers = ["Nomor", "Tanggal", "Jurnal", "Sumber", "Status", "Ref", "Deskripsi", "Debit", "Kredit"];
  const xlsxRows = () => rows.map((e) => [
    e.entryNumber,
    new Date(e.date).toLocaleDateString("id-ID"),
    journalLabel(e.journalId),
    SOURCE_LABELS[e.source] ?? e.source,
    e.status,
    e.ref ?? "",
    e.description ?? "",
    e.totalDebit,
    e.totalCredit,
  ]);

  return (
    <AppShell>
      <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2"><FileText className="h-6 w-6" />Jurnal Entry</h1>
            <p className="text-sm text-muted-foreground">Daftar entri jurnal — auto-posting & manual. Jurnal posted bisa Dibalik; jurnal manual bisa di-Reset Draft.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => printWindow("Jurnal Entry", headers, xlsxRows(), [7, 8])} disabled={rows.length === 0}>
              <Printer className="h-4 w-4 mr-1.5" />Print Preview
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportXlsx("Jurnal_Entry", headers, xlsxRows())} disabled={rows.length === 0}>
              <Download className="h-4 w-4 mr-1.5" />Export XLSX
            </Button>
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
              <DialogTrigger asChild><Button data-testid="button-add-entry"><Plus className="h-4 w-4 mr-2" />Entry Manual</Button></DialogTrigger>
              <DialogContent className="max-w-3xl">
                <DialogHeader><DialogTitle>Jurnal Entry Manual — No. akan digenerate otomatis sebagai JE/YYYY/NNNN</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Jurnal</Label>
                      <Select value={String(form.journalId || "")} onValueChange={(v) => setForm({ ...form, journalId: parseInt(v) })}>
                        <SelectTrigger data-testid="select-entry-journal"><SelectValue placeholder="Pilih" /></SelectTrigger>
                        <SelectContent>{(journals ?? []).map((j) => (<SelectItem key={j.id} value={String(j.id)}>{j.code} - {j.name}</SelectItem>))}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Tanggal</Label><DatePicker value={form.date} onChange={(date) => setForm({ ...form, date })} data-testid="input-entry-date" /></div>
                    <div><Label>Referensi</Label><Input value={form.ref} onChange={(e) => setForm({ ...form, ref: e.target.value })} placeholder="opsional" /></div>
                  </div>
                  <div><Label>Deskripsi</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="opsional" /></div>
                  <div className="border rounded-md">
                    <Table>
                      <TableHeader><TableRow><TableHead>Akun</TableHead><TableHead className="w-32">Debit</TableHead><TableHead className="w-32">Kredit</TableHead><TableHead>Deskripsi</TableHead><TableHead className="w-10"></TableHead></TableRow></TableHeader>
                      <TableBody>
                        {form.lines.map((l, i) => (
                          <TableRow key={i}>
                            <TableCell>
                              <AccountCombobox
                                accounts={accounts ?? []}
                                value={l.accountId || null}
                                onChange={(v) => { const lines = [...form.lines]; lines[i] = { ...lines[i]!, accountId: v }; setForm({ ...form, lines }); }}
                                data-testid={`select-line-account-${i}`}
                              />
                            </TableCell>
                            <TableCell><Input data-testid={`input-line-debit-${i}`} type="number" step="0.01" value={l.debit || ""} onChange={(e) => { const lines = [...form.lines]; lines[i] = { ...lines[i]!, debit: parseFloat(e.target.value) || 0, credit: 0 }; setForm({ ...form, lines }); }} /></TableCell>
                            <TableCell><Input data-testid={`input-line-credit-${i}`} type="number" step="0.01" value={l.credit || ""} onChange={(e) => { const lines = [...form.lines]; lines[i] = { ...lines[i]!, credit: parseFloat(e.target.value) || 0, debit: 0 }; setForm({ ...form, lines }); }} /></TableCell>
                            <TableCell><Input value={l.description} onChange={(e) => { const lines = [...form.lines]; lines[i] = { ...lines[i]!, description: e.target.value }; setForm({ ...form, lines }); }} /></TableCell>
                            <TableCell><Button size="icon" variant="ghost" onClick={() => { const lines = form.lines.filter((_, idx) => idx !== i); setForm({ ...form, lines: lines.length > 0 ? lines : [{ accountId: 0, debit: 0, credit: 0, description: "" }] }); }}><Trash2 className="h-4 w-4" /></Button></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <div className="flex items-center justify-between">
                    <Button variant="outline" size="sm" onClick={() => setForm({ ...form, lines: [...form.lines, { accountId: 0, debit: 0, credit: 0, description: "" }] })}>+ Tambah Baris</Button>
                    <div className="flex gap-4 text-sm font-medium">
                      <span>Total Debit: <span className="font-mono">{idr(totalD)}</span></span>
                      <span>Total Kredit: <span className="font-mono">{idr(totalC)}</span></span>
                      <Badge variant={balanced ? "default" : "destructive"}>{balanced ? "✓ Seimbang" : "✗ Tidak seimbang"}</Badge>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Batal</Button>
                  <Button onClick={submit} disabled={!balanced} data-testid="button-post-entry">Post</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        <Card><CardContent className="p-4">
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <Label>Jurnal</Label>
              <Select value={filter.journalId ? String(filter.journalId) : "all"} onValueChange={(v) => setFilter({ ...filter, journalId: v === "all" ? undefined : parseInt(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua</SelectItem>
                  {(journals ?? []).map((j) => (<SelectItem key={j.id} value={String(j.id)}>{j.code} - {j.name}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Dari</Label><DatePicker value={filter.from ?? ""} onChange={(v) => setFilter({ ...filter, from: v || undefined })} /></div>
            <div><Label>Sampai</Label><DatePicker value={filter.to ?? ""} onChange={(v) => setFilter({ ...filter, to: v || undefined })} /></div>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nomor</TableHead>
                <TableHead>Tanggal</TableHead>
                <TableHead>Jurnal</TableHead>
                <TableHead>Sumber</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Ref</TableHead>
                <TableHead>Deskripsi</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Kredit</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Tidak ada entri</TableCell></TableRow>
              ) : rows.map((e) => (
                <TableRow key={e.id} data-testid={`row-entry-${e.id}`} className={e.status === "cancelled" ? "opacity-40" : undefined} {...prefetchHover(getGetAccountingEntryQueryOptions(e.id))}>
                  <TableCell>
                    <Link href={`/accounting/entries/${e.id}`} className="text-indigo-400 hover:underline font-mono text-xs">
                      {e.entryNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-xs">{new Date(e.date).toLocaleDateString("id-ID")}</TableCell>
                  <TableCell><Badge variant="outline">{journalLabel(e.journalId)}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={e.source === "reversal" ? "destructive" : "secondary"} className="text-xs">
                      {SOURCE_LABELS[e.source] ?? e.source}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        e.status === "posted"
                          ? "bg-green-900/40 text-green-300 border-green-700 text-xs"
                          : e.status === "cancelled"
                          ? "bg-slate-700/60 text-slate-400 border-slate-600 text-xs"
                          : "bg-yellow-900/40 text-yellow-300 border-yellow-700 text-xs"
                      }
                    >
                      {e.status === "posted" ? "Posted" : e.status === "cancelled" ? "Dibatalkan" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs">{e.ref ?? "-"}</TableCell>
                  <TableCell className="text-xs max-w-[180px] truncate">{e.description ?? "-"}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{idr(e.totalDebit)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{idr(e.totalCredit)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <ReverseDialog entry={e} onDone={refreshEntries} />
                      <ResetDraftDialog entry={e} onDone={refreshEntries} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    </AppShell>
  );
}
