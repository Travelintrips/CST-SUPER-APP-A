import { useState, useCallback } from "react";
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
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Loader2, Wallet, RefreshCw, Trash2, ChevronsRight,
  Clock, ShieldCheck, XCircle, CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const fmtIDR = (raw: string) => {
  const d = raw.replace(/\D/g, "");
  return d ? Number(d).toLocaleString("id-ID") : "";
};
const parseIDR = (v: string) => { const n = Number(v.replace(/\D/g, "")); return isNaN(n) ? 0 : n; };

const STATUS_COLORS: Record<string, string> = {
  active:           "bg-sky-900/40 text-sky-300 border-sky-600",
  partial:          "bg-amber-900/40 text-amber-300 border-amber-600",
  repaid:           "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  pending_approval: "bg-violet-900/40 text-violet-300 border-violet-600",
  rejected:         "bg-red-900/40 text-red-300 border-red-600",
};
const STATUS_LABELS: Record<string, string> = {
  active:           "Aktif",
  partial:          "Sebagian",
  repaid:           "Lunas",
  pending_approval: "Menunggu Approval",
  rejected:         "Ditolak",
};
const STATUS_ICONS: Record<string, React.ReactNode> = {
  pending_approval: <Clock size={12} className="inline mr-1" />,
  rejected:         <XCircle size={12} className="inline mr-1" />,
  active:           <CheckCircle size={12} className="inline mr-1" />,
};

async function apiFetch(url: string, opts?: RequestInit) {
  const r = await fetch(url, { credentials: "include", ...opts });
  const d = await r.json();
  if (!r.ok) throw new Error(d.message ?? "Terjadi kesalahan.");
  return d;
}

export default function KasbonPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const cq = activeCompanyId ? `?company=${activeCompanyId}` : "";

  const { data: list = [], isLoading, refetch } = useQuery({
    queryKey: ["cash-advances", "kasbon", activeCompanyId],
    queryFn: () => apiFetch(`/api/cash-advances?type=kasbon${activeCompanyId ? `&company=${activeCompanyId}` : ""}`),
  });

  const [selected, setSelected] = useState<any | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

  const fetchDetail = useCallback(async (id: number) => {
    const d = await apiFetch(`/api/cash-advances/${id}`);
    setDetail(d);
  }, []);

  const openDetail = async (row: any) => {
    setSelected(row);
    await fetchDetail(row.id);
  };

  // ── Create form ───────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [pm, setPm] = useState("bank");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");

  const createMut = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/cash-advances${cq}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: (d) => {
      if (d.needsApproval) {
        toast({
          title: `⏳ ${d.advanceNumber} — menunggu approval`,
          description: d.message,
        });
      } else {
        toast({ title: `✓ ${d.advanceNumber} — ${idr(d.amount)} berhasil dibuat.` });
      }
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
      setShowForm(false); setPartyName(""); setAmountRaw(""); setNotes(""); setDate(today);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const amount = parseIDR(amountRaw);
    if (!partyName.trim()) return toast({ title: "Nama karyawan wajib diisi.", variant: "destructive" });
    if (amount <= 0) return toast({ title: "Nominal harus lebih dari 0.", variant: "destructive" });
    createMut.mutate({ type: "kasbon", partyName, amount, paymentMethod: pm, date, notes });
  };

  // ── Repay form ────────────────────────────────────────────────────────
  const [repAmtRaw, setRepAmtRaw] = useState("");
  const [repPm, setRepPm] = useState("bank");
  const [repDate, setRepDate] = useState(today);
  const [repNotes, setRepNotes] = useState("");

  const repayMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: object }) =>
      apiFetch(`/api/cash-advances/${id}/repay`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      }),
    onSuccess: async (d) => {
      toast({ title: `✓ Cicilan ${idr(d.repayment.amount)} berhasil dicatat.` });
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
      setRepAmtRaw(""); setRepNotes(""); setRepDate(today);
      setSelected(d.advance);
      await fetchDetail(d.advance.id);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleRepay = () => {
    if (!selected) return;
    const amount = parseIDR(repAmtRaw);
    if (amount <= 0) return toast({ title: "Nominal cicilan harus lebih dari 0.", variant: "destructive" });
    repayMut.mutate({ id: selected.id, body: { amount, paymentMethod: repPm, date: repDate, notes: repNotes } });
  };

  // ── Delete ────────────────────────────────────────────────────────────
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/cash-advances/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Kasbon dihapus." });
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
      setSelected(null); setDetail(null);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const pendingCount = (list as any[]).filter((r: any) => r.status === "pending_approval").length;

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
              <Wallet size={20} className="text-amber-400" />
              <div>
                <h1 className="text-xl font-bold">Kasbon Karyawan</h1>
                <p className="text-sm text-muted-foreground">DR Piutang Karyawan · CR Kas/Bank</p>
              </div>
            </div>
            {pendingCount > 0 && (
              <Link href="/expense/approvals">
                <Badge className="bg-violet-900/40 text-violet-300 border-violet-600 border cursor-pointer hover:bg-violet-900/60">
                  <Clock size={11} className="mr-1" />{pendingCount} menunggu approval
                </Badge>
              </Link>
            )}
          </div>
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus size={14} className="mr-1" /> Buat Kasbon
          </Button>
        </div>

        {/* Create Form */}
        {showForm && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm text-muted-foreground">Form Kasbon Baru</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nama Karyawan <span className="text-destructive">*</span></Label>
                  <Input placeholder="Nama karyawan..." value={partyName} onChange={(e) => setPartyName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Tanggal <span className="text-destructive">*</span></Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Nominal (IDR) <span className="text-destructive">*</span></Label>
                  <Input placeholder="0" className="font-mono" value={amountRaw} onChange={(e) => setAmountRaw(fmtIDR(e.target.value))} />
                </div>
                <div className="space-y-1.5">
                  <Label>Sumber Dana</Label>
                  <Select value={pm} onValueChange={setPm}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bank">🏦 Bank</SelectItem>
                      <SelectItem value="cash">💵 Kas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Keterangan</Label>
                <Textarea rows={2} placeholder="Opsional..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {parseIDR(amountRaw) > 0 && (
                <div className="rounded-md bg-muted/40 border px-4 py-2 text-xs text-muted-foreground">
                  Jurnal: <strong>DR Piutang Karyawan</strong> {idr(parseIDR(amountRaw))} · <strong>CR {pm === "cash" ? "Kas" : "Bank"}</strong> {idr(parseIDR(amountRaw))}
                  <div className="mt-1 text-violet-400">⚡ Jika nominal melebihi limit, akan masuk antrian approval terlebih dahulu.</div>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={handleCreate} disabled={createMut.isPending}>
                  {createMut.isPending ? <><Loader2 size={14} className="mr-1 animate-spin" />Menyimpan...</> : "Simpan Kasbon"}
                </Button>
                <Button variant="ghost" onClick={() => setShowForm(false)}>Batal</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* List */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>No. Kasbon</TableHead>
                  <TableHead>Tanggal</TableHead>
                  <TableHead>Karyawan</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead className="text-right">Terbayar</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                )}
                {!isLoading && list.length === 0 && (
                  <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Belum ada kasbon.</TableCell></TableRow>
                )}
                {list.map((row: any) => (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(row)}>
                    <TableCell className="font-mono text-xs text-primary">{row.advanceNumber}</TableCell>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell className="text-sm font-medium">{row.partyName}</TableCell>
                    <TableCell className="text-right font-mono text-sm">{idr(row.amount)}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-400">
                      {row.status === "pending_approval" ? <span className="text-muted-foreground">—</span> : idr(row.paidAmount)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-400">
                      {row.status === "pending_approval" ? <span className="text-muted-foreground">—</span> : idr(row.remainingAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs border", STATUS_COLORS[row.status] ?? "")}>
                        {STATUS_ICONS[row.status]}
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <ChevronsRight size={14} className="text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!selected} onOpenChange={(v) => { if (!v) { setSelected(null); setDetail(null); } }}>
        <SheetContent className="w-[420px] sm:w-[520px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{selected.advanceNumber}</SheetTitle>
                <SheetDescription>{selected.partyName}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Pending approval banner */}
                {selected.status === "pending_approval" && (
                  <Alert className="border-violet-600 bg-violet-900/20">
                    <Clock size={14} className="text-violet-400" />
                    <AlertDescription className="text-violet-300 text-sm ml-2">
                      Kasbon ini sedang menunggu approval. Dana belum dicairkan dan jurnal belum dibuat.{" "}
                      <Link href="/expense/approvals" className="underline hover:text-violet-200">
                        Buka halaman Approval →
                      </Link>
                    </AlertDescription>
                  </Alert>
                )}
                {/* Rejected banner */}
                {selected.status === "rejected" && (
                  <Alert className="border-red-600 bg-red-900/20">
                    <XCircle size={14} className="text-red-400" />
                    <AlertDescription className="text-red-300 text-sm ml-2">
                      Kasbon ini ditolak.
                      {detail?.approvalRequest?.l1_notes ? ` Alasan: ${detail.approvalRequest.l1_notes}` : ""}
                      {detail?.approvalRequest?.l2_notes ? ` Alasan L2: ${detail.approvalRequest.l2_notes}` : ""}
                    </AlertDescription>
                  </Alert>
                )}

                {/* Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nominal</span>
                    <span className="font-mono font-semibold">{idr(selected.amount)}</span>
                  </div>
                  {selected.status !== "pending_approval" && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Terbayar</span>
                        <span className="font-mono text-emerald-400">{idr(selected.paidAmount)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm font-bold">
                        <span>Sisa Piutang</span>
                        <span className="font-mono text-amber-400">{idr(selected.remainingAmount)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={cn("text-xs border", STATUS_COLORS[selected.status] ?? "")}>
                      {STATUS_ICONS[selected.status]}
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </Badge>
                  </div>
                  {selected.notes && <p className="text-xs text-muted-foreground pt-1">{selected.notes}</p>}
                </div>

                {/* Approval trail if pending */}
                {detail?.approvalRequest && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <ShieldCheck size={14} className="text-violet-400" /> Alur Approval
                    </p>
                    {detail.approvalRequest.l1_approver_name && (
                      <div className="flex justify-between items-center text-sm rounded border px-3 py-2">
                        <div>
                          <p className="font-medium">L1: {detail.approvalRequest.l1_approver_name}</p>
                          {detail.approvalRequest.l1_notes && (
                            <p className="text-xs text-muted-foreground">{detail.approvalRequest.l1_notes}</p>
                          )}
                        </div>
                        {detail.approvalRequest.l1_status === "approved" ? <CheckCircle size={14} className="text-emerald-400" /> :
                         detail.approvalRequest.l1_status === "rejected" ? <XCircle size={14} className="text-red-400" /> :
                         <Clock size={14} className="text-amber-400" />}
                      </div>
                    )}
                    {detail.approvalRequest.l2_approver_name && (
                      <div className="flex justify-between items-center text-sm rounded border px-3 py-2">
                        <div>
                          <p className="font-medium">L2: {detail.approvalRequest.l2_approver_name}</p>
                          {detail.approvalRequest.l2_notes && (
                            <p className="text-xs text-muted-foreground">{detail.approvalRequest.l2_notes}</p>
                          )}
                        </div>
                        {detail.approvalRequest.l2_status === "approved" ? <CheckCircle size={14} className="text-emerald-400" /> :
                         detail.approvalRequest.l2_status === "rejected" ? <XCircle size={14} className="text-red-400" /> :
                         detail.approvalRequest.l2_status === "skipped" ? <span className="text-xs text-muted-foreground">Skip</span> :
                         <Clock size={14} className="text-amber-400" />}
                      </div>
                    )}
                  </div>
                )}

                {/* Repayment History */}
                {selected.status !== "pending_approval" && selected.status !== "rejected" && (
                  <div>
                    <p className="text-sm font-medium mb-2">Riwayat Pelunasan</p>
                    {!detail?.repayments?.length ? (
                      <p className="text-xs text-muted-foreground">Belum ada cicilan.</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.repayments.map((r: any) => (
                          <div key={r.id} className="flex justify-between items-center rounded border px-3 py-2 text-xs">
                            <div className="text-muted-foreground">{r.date} · {r.paymentMethod === "cash" ? "Kas" : "Bank"}{r.notes ? ` · ${r.notes}` : ""}</div>
                            <span className="font-mono text-emerald-400">{idr(r.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Add Repayment — only for active/partial */}
                {(selected.status === "active" || selected.status === "partial") && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium flex items-center gap-2"><RefreshCw size={14} className="text-primary" />Tambah Cicilan</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Nominal</Label>
                        <Input placeholder="0" className="font-mono h-8 text-sm" value={repAmtRaw} onChange={(e) => setRepAmtRaw(fmtIDR(e.target.value))} />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Tanggal</Label>
                        <Input type="date" className="h-8 text-sm" value={repDate} onChange={(e) => setRepDate(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Sumber Dana</Label>
                      <Select value={repPm} onValueChange={setRepPm}>
                        <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="bank">🏦 Bank</SelectItem>
                          <SelectItem value="cash">💵 Kas</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Keterangan</Label>
                      <Input placeholder="Opsional..." className="h-8 text-sm" value={repNotes} onChange={(e) => setRepNotes(e.target.value)} />
                    </div>
                    <Button size="sm" className="w-full" onClick={handleRepay} disabled={repayMut.isPending}>
                      {repayMut.isPending ? <><Loader2 size={13} className="mr-1 animate-spin" />Menyimpan...</> : "Catat Cicilan"}
                    </Button>
                  </div>
                )}

                {/* Delete */}
                {["active", "pending_approval", "rejected"].includes(selected.status) && Number(selected.paidAmount) === 0 && (
                  <div className="border-t pt-4">
                    <Button variant="destructive" size="sm" className="w-full" onClick={() => deleteMut.mutate(selected.id)} disabled={deleteMut.isPending}>
                      <Trash2 size={13} className="mr-1" /> Hapus Kasbon
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </AppShell>
  );
}
