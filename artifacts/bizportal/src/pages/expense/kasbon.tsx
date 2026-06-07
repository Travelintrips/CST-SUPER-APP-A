import { useState, useCallback, useRef } from "react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Plus, Loader2, Wallet, RefreshCw, Trash2, ChevronsRight,
  Clock, ShieldCheck, XCircle, CheckCircle, Upload, Scan, Check,
  AlertTriangle, FileText, ChevronRight, History, ChevronsUpDown, User,
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

const CATEGORIES = [
  { value: "Makan & Minum", label: "🍱 Makan & Minum" },
  { value: "Office Supplies", label: "📦 Office Supplies" },
  { value: "Transport", label: "🚗 Transport" },
  { value: "Komunikasi", label: "📱 Komunikasi" },
  { value: "Utilitas", label: "💡 Utilitas" },
  { value: "Lainnya", label: "📋 Lainnya" },
];

// ── Timeline Steps ─────────────────────────────────────────────────────────────
interface TimelineStep { label: string; done: boolean; active: boolean; failed?: boolean; }

function getTimeline(status: string): TimelineStep[] {
  const steps = [
    { label: "Dibuat", key: ["active", "pending_approval", "partial", "repaid", "rejected"] },
    { label: "Disetujui", key: ["active", "partial", "repaid"] },
    { label: "Sebagian", key: ["partial", "repaid"] },
    { label: "Lunas", key: ["repaid"] },
  ];
  return steps.map((s, i) => ({
    label: s.label,
    done: s.key.includes(status),
    active: i === steps.findIndex((x) => !x.key.includes(status)) - 1 || (status === "repaid" && i === steps.length - 1),
    failed: status === "rejected" && i === 0,
  }));
}

function StatusTimeline({ status }: { status: string }) {
  if (status === "rejected") {
    return (
      <div className="flex items-center gap-2 text-sm text-red-400">
        <XCircle size={14} /> Kasbon Ditolak
      </div>
    );
  }
  const steps = getTimeline(status);
  return (
    <div className="flex items-center gap-1 text-xs flex-wrap">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-1">
          <div className={cn(
            "flex items-center gap-1 px-2 py-1 rounded-full border",
            s.done ? "bg-emerald-900/40 text-emerald-300 border-emerald-700" : "bg-muted/30 text-muted-foreground border-border",
            s.active && !s.done ? "border-amber-600 text-amber-300" : "",
          )}>
            {s.done ? <Check size={10} /> : <div className="w-2 h-2 rounded-full bg-current opacity-50" />}
            {s.label}
          </div>
          {i < steps.length - 1 && <ChevronRight size={10} className="text-muted-foreground" />}
        </div>
      ))}
    </div>
  );
}

// ── OCR Confidence Badge ───────────────────────────────────────────────────────
function ConfidenceBadge({ confidence }: { confidence: string }) {
  if (confidence === "high") return <Badge className="text-xs border bg-emerald-900/40 text-emerald-300 border-emerald-700">OCR: Akurat</Badge>;
  if (confidence === "medium") return <Badge className="text-xs border bg-amber-900/40 text-amber-300 border-amber-700">OCR: Perlu Cek</Badge>;
  return <Badge className="text-xs border bg-red-900/40 text-red-300 border-red-700">OCR: Rendah</Badge>;
}

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
  const { data: paymentAccounts = [] } = useQuery({
    queryKey: ["expense-payment-accounts"],
    queryFn: () => apiFetch("/api/expenses/payment-accounts"),
  });
  const { data: userList = [] } = useQuery<any[]>({
    queryKey: ["users-list"],
    queryFn: () => apiFetch("/api/users"),
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

  // ── Create form ──────────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const [showForm, setShowForm] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [amountRaw, setAmountRaw] = useState("");
  const [pm, setPm] = useState("bank");
  const [sourceAccountId, setSourceAccountId] = useState("");
  const [date, setDate] = useState(today);
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState("");

  const createMut = useMutation({
    mutationFn: (body: object) => apiFetch(`/api/cash-advances${cq}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }),
    onSuccess: (d) => {
      if (d.needsApproval) {
        toast({ title: `⏳ ${d.advanceNumber} — menunggu approval`, description: d.message });
      } else {
        toast({ title: `✓ ${d.advanceNumber} — ${idr(d.amount)} berhasil dibuat.` });
      }
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
      setShowForm(false); setPartyName(""); setSelectedUserId(""); setUserSearch(""); setAmountRaw(""); setNotes(""); setDate(today); setSourceAccountId(""); setCategory("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const handleCreate = () => {
    const amount = parseIDR(amountRaw);
    if (!partyName.trim()) return toast({ title: "Karyawan wajib dipilih.", variant: "destructive" });
    if (amount <= 0) return toast({ title: "Nominal harus lebih dari 0.", variant: "destructive" });
    createMut.mutate({
      type: "kasbon", partyName, amount, paymentMethod: pm, date, notes, category: category || undefined,
      sourceAccountId: sourceAccountId ? Number(sourceAccountId) : undefined,
      userId: selectedUserId || undefined,
    });
  };

  // filtered users for combobox
  const filteredUsers = (userList as any[]).filter((u) =>
    !userSearch || (u.name ?? "").toLowerCase().includes(userSearch.toLowerCase()) ||
    (u.email ?? "").toLowerCase().includes(userSearch.toLowerCase())
  ).slice(0, 50);

  // ── Approve / Reject ─────────────────────────────────────────────────────────
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const approveMut = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/cash-advances/${id}/approve`, { method: "PATCH" }),
    onSuccess: async (d) => {
      toast({ title: `✅ ${d.advanceNumber} disetujui. Jurnal DR/CR telah diposting.` });
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
      setSelected(d);
      await fetchDetail(d.id);
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const rejectMut = useMutation({
    mutationFn: ({ id, reason }: { id: number; reason: string }) =>
      apiFetch(`/api/cash-advances/${id}/reject`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reason }),
      }),
    onSuccess: async (d) => {
      toast({ title: `Kasbon ditolak.` });
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
      setSelected(d);
      await fetchDetail(d.id);
      setShowRejectDialog(false); setRejectReason("");
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  // ── Upload Receipt + OCR ─────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [ocrDialog, setOcrDialog] = useState<{
    visible: boolean;
    ocr: { amount: number | null; date: string | null; partyName: string | null; description: string | null; confidence: string } | null;
  }>({ visible: false, ocr: null });

  const handleUploadReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selected || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    setUploadingReceipt(true);
    try {
      const formData = new FormData();
      formData.append("receipt", file);
      const r = await fetch(`/api/cash-advances/${selected.id}/upload-receipt`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message ?? "Upload gagal");
      toast({ title: "Receipt berhasil diproses. Hasil OCR siap untuk auto-fill." });
      setOcrDialog({ visible: true, ocr: d.ocr });
      await fetchDetail(selected.id);
      qc.invalidateQueries({ queryKey: ["cash-advances", "kasbon"] });
    } catch (err: any) {
      toast({ title: err.message ?? "Upload gagal", variant: "destructive" });
    } finally {
      setUploadingReceipt(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // ── OCR Auto-fill → repayment form ──────────────────────────────────────────
  const applyOcr = () => {
    if (!ocrDialog.ocr) return;
    if (ocrDialog.ocr.amount) setRepAmtRaw(fmtIDR(String(ocrDialog.ocr.amount)));
    if (ocrDialog.ocr.date) setRepDate(ocrDialog.ocr.date);
    if (ocrDialog.ocr.description) setRepNotes(ocrDialog.ocr.description);
    setOcrDialog({ visible: false, ocr: null });
    toast({ title: "Data OCR berhasil di-fill ke form cicilan. Periksa sebelum submit." });
  };

  // ── Repay form ───────────────────────────────────────────────────────────────
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

  // ── Delete ───────────────────────────────────────────────────────────────────
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
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw size={13} className="mr-1" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setShowForm(!showForm)}>
              <Plus size={14} className="mr-1" /> Buat Kasbon
            </Button>
          </div>
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
                  <Label>Karyawan <span className="text-destructive">*</span></Label>
                  <Popover open={userSearchOpen} onOpenChange={setUserSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className={cn("w-full justify-between font-normal", !partyName && "text-muted-foreground")}
                      >
                        <span className="flex items-center gap-2 truncate">
                          <User size={13} className="shrink-0 text-muted-foreground" />
                          {partyName || "Pilih karyawan..."}
                        </span>
                        <ChevronsUpDown size={13} className="shrink-0 text-muted-foreground" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-72 p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Cari nama atau email..."
                          value={userSearch}
                          onValueChange={setUserSearch}
                        />
                        <CommandList className="max-h-52">
                          <CommandEmpty>
                            {userSearch ? (
                              <div className="p-2 text-center">
                                <p className="text-xs text-muted-foreground mb-2">Karyawan tidak ditemukan.</p>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-xs"
                                  onClick={() => {
                                    setPartyName(userSearch);
                                    setSelectedUserId("");
                                    setUserSearchOpen(false);
                                  }}
                                >
                                  Gunakan "{userSearch}" sebagai nama
                                </Button>
                              </div>
                            ) : "Tidak ada karyawan."}
                          </CommandEmpty>
                          {filteredUsers.map((u: any) => (
                            <CommandItem
                              key={u.id}
                              value={u.name}
                              onSelect={() => {
                                setPartyName(u.name ?? "");
                                setSelectedUserId(String(u.id));
                                setUserSearchOpen(false);
                                setUserSearch("");
                              }}
                            >
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-sm truncate">{u.name}</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {u.email}
                                  {u.departmentName ? ` · ${u.departmentName}` : ""}
                                  {u.divisionName ? ` · ${u.divisionName}` : ""}
                                </span>
                              </div>
                              {selectedUserId === String(u.id) && (
                                <Check size={13} className="ml-auto text-primary shrink-0" />
                              )}
                            </CommandItem>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {partyName && !selectedUserId && (
                    <p className="text-xs text-amber-400 flex items-center gap-1">
                      <AlertTriangle size={11} /> Input manual (bukan dari sistem)
                    </p>
                  )}
                  <Select
                    value={selectedUserId}
                    onValueChange={(v) => {
                      setSelectedUserId(v);
                      const u = (userList as any[]).find((u: any) => u.id === v);
                      if (u) setPartyName(u.name ?? "");
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Pilih karyawan..." /></SelectTrigger>
                    <SelectContent>
                      {(userList as any[]).map((u: any) => (
                        <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Atau ketik nama manual..." value={partyName} onChange={(e) => setPartyName(e.target.value)} className="text-xs" />
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
                  <Label>Kategori</Label>
                  <Select value={category || "__none__"} onValueChange={(v) => setCategory(v === "__none__" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="Pilih kategori..." /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— Tanpa Kategori —</SelectItem>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Sumber Dana (Akun)</Label>
                <Select
                  value={sourceAccountId || "__none__"}
                  onValueChange={(v) => {
                    const val = v === "__none__" ? "" : v;
                    setSourceAccountId(val);
                    if (val) {
                      const acc = (paymentAccounts as any[]).find((a: any) => String(a.id) === val);
                      if (acc) setPm((acc.name ?? "").toLowerCase().includes("kas") ? "cash" : "bank");
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Pilih akun kas/bank..." /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Default —</SelectItem>
                    {(paymentAccounts as any[]).filter((a: any) => a.account_class === "kas").length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">💵 Kas</div>
                        {(paymentAccounts as any[]).filter((a: any) => a.account_class === "kas").map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.code} – {a.name}</SelectItem>
                        ))}
                      </>
                    )}
                    {(paymentAccounts as any[]).filter((a: any) => a.account_class === "bank").length > 0 && (
                      <>
                        <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">🏦 Bank</div>
                        {(paymentAccounts as any[]).filter((a: any) => a.account_class === "bank").map((a: any) => (
                          <SelectItem key={a.id} value={String(a.id)}>{a.code} – {a.name}</SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Keterangan</Label>
                <Textarea rows={2} placeholder="Opsional..." value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {parseIDR(amountRaw) > 0 && (
                <div className="rounded-md bg-muted/40 border px-4 py-2 text-xs text-muted-foreground">
                  Jurnal: <strong>DR Piutang Karyawan</strong> {idr(parseIDR(amountRaw))} · <strong>CR {
                    sourceAccountId
                      ? ((paymentAccounts as any[]).find((a: any) => String(a.id) === sourceAccountId)?.name ?? (pm === "cash" ? "Kas" : "Bank"))
                      : (pm === "cash" ? "Kas" : "Bank")
                  }</strong> {idr(parseIDR(amountRaw))}
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
                  <TableHead>Kategori</TableHead>
                  <TableHead className="text-right">Nominal</TableHead>
                  <TableHead className="text-right">Terbayar</TableHead>
                  <TableHead className="text-right">Sisa</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-8"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Memuat...</TableCell></TableRow>
                )}
                {!isLoading && (list as any[]).length === 0 && (
                  <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">Belum ada kasbon.</TableCell></TableRow>
                )}
                {(list as any[]).map((row: any) => (
                  <TableRow key={row.id} className="cursor-pointer hover:bg-muted/50" onClick={() => openDetail(row)}>
                    <TableCell className="font-mono text-xs text-primary">{row.advance_number ?? row.advanceNumber}</TableCell>
                    <TableCell className="text-sm">{row.date}</TableCell>
                    <TableCell className="text-sm font-medium">{row.party_name ?? row.partyName}</TableCell>
                    <TableCell className="text-sm font-medium">{row.user?.name ?? row.partyName}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.category ? (
                        <Badge variant="outline" className="text-xs font-normal">{row.category}</Badge>
                      ) : <span className="text-muted-foreground/40">—</span>}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm">{idr(Number(row.amount))}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-emerald-400">
                      {row.status === "pending_approval" ? <span className="text-muted-foreground">—</span> : idr(Number(row.paid_amount ?? row.paidAmount))}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-amber-400">
                      {row.status === "pending_approval" ? <span className="text-muted-foreground">—</span> : idr(Number(row.remaining_amount ?? row.remainingAmount))}
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-xs border", STATUS_COLORS[row.status] ?? "")}>
                        {STATUS_LABELS[row.status] ?? row.status}
                      </Badge>
                    </TableCell>
                    <TableCell><ChevronsRight size={14} className="text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* ── Detail Sheet ──────────────────────────────────────────────────────── */}
      <Sheet open={!!selected} onOpenChange={(v) => { if (!v) { setSelected(null); setDetail(null); } }}>
        <SheetContent className="w-[460px] sm:w-[540px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="font-mono text-base">{selected.advance_number ?? selected.advanceNumber}</SheetTitle>
                <SheetDescription>{selected.party_name ?? selected.partyName}</SheetDescription>
              </SheetHeader>

              <div className="mt-4 space-y-4">
                {/* Employee info card */}
                {detail?.employee && (
                  <div className="rounded-md border bg-muted/20 px-3 py-2 flex items-start gap-2">
                    <User size={14} className="mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{detail.employee.name ?? (selected.party_name ?? selected.partyName)}</p>
                      <p className="text-xs text-muted-foreground truncate">{detail.employee.email}</p>
                      {(detail.employee.department || detail.employee.division || detail.employee.section) && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {[detail.employee.department, detail.employee.division, detail.employee.section].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                  </div>
                )}

                {/* Timeline */}
                <div className="rounded-md bg-muted/20 border px-3 py-2">
                  <StatusTimeline status={selected.status} />
                </div>

                {/* Pending approval banner */}
                {selected.status === "pending_approval" && (
                  <Alert className="border-violet-600 bg-violet-900/20">
                    <Clock size={14} className="text-violet-400" />
                    <AlertDescription className="text-violet-300 text-sm ml-2">
                      Kasbon menunggu approval BD. Dana belum dicairkan, jurnal belum diposting.{" "}
                      <Link href="/expense/approvals" className="underline hover:text-violet-200">Buka Approval →</Link>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Rejected banner */}
                {selected.status === "rejected" && (
                  <Alert className="border-red-600 bg-red-900/20">
                    <XCircle size={14} className="text-red-400" />
                    <AlertDescription className="text-red-300 text-sm ml-2">
                      Kasbon ini ditolak.
                      {(detail?.rejection_reason || detail?.rejectionReason) && ` Alasan: ${detail.rejection_reason ?? detail.rejectionReason}`}
                    </AlertDescription>
                  </Alert>
                )}

                {/* OCR data banner */}
                {detail?.ocrRawData && (
                  <div className="rounded-md border border-blue-700 bg-blue-900/20 px-3 py-2 space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-medium flex items-center gap-1 text-blue-300">
                        <Scan size={12} /> Hasil OCR Receipt
                      </p>
                      <ConfidenceBadge confidence={detail.ocrRawData.confidence ?? "low"} />
                    </div>
                    <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                      {detail.ocrRawData.amount && (
                        <div><span className="text-blue-400">Nominal:</span> {idr(detail.ocrRawData.amount)}</div>
                      )}
                      {detail.ocrRawData.date && (
                        <div><span className="text-blue-400">Tanggal:</span> {detail.ocrRawData.date}</div>
                      )}
                      {detail.ocrRawData.partyName && (
                        <div className="col-span-2"><span className="text-blue-400">Vendor:</span> {detail.ocrRawData.partyName}</div>
                      )}
                      {detail.ocrRawData.description && (
                        <div className="col-span-2"><span className="text-blue-400">Deskripsi:</span> {detail.ocrRawData.description}</div>
                      )}
                    </div>
                  </div>
                )}

                {/* Summary */}
                <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Nominal</span>
                    <span className="font-mono font-semibold">{idr(Number(selected.amount))}</span>
                  </div>
                  {selected.category && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Kategori</span>
                      <Badge variant="outline" className="text-xs">{selected.category}</Badge>
                    </div>
                  )}
                  {selected.status !== "pending_approval" && (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Terbayar</span>
                        <span className="font-mono text-emerald-400">{idr(Number(selected.paid_amount ?? selected.paidAmount))}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm font-bold">
                        <span>Sisa Piutang</span>
                        <span className="font-mono text-amber-400">{idr(Number(selected.remaining_amount ?? selected.remainingAmount))}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Status</span>
                    <Badge className={cn("text-xs border", STATUS_COLORS[selected.status] ?? "")}>
                      {STATUS_LABELS[selected.status] ?? selected.status}
                    </Badge>
                  </div>
                  {(selected.notes || selected.party_name) && (
                    <p className="text-xs text-muted-foreground pt-1">{selected.notes}</p>
                  )}
                </div>

                {/* ── BD Approve / Reject ─────────────────────────────────── */}
                {selected.status === "pending_approval" && (
                  <div className="space-y-2 rounded-lg border border-violet-700 bg-violet-900/10 p-3">
                    <p className="text-sm font-medium flex items-center gap-2 text-violet-300">
                      <ShieldCheck size={14} /> Tindakan BD / Finance
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        size="sm"
                        className="bg-emerald-700 hover:bg-emerald-600 text-white"
                        onClick={() => approveMut.mutate(selected.id)}
                        disabled={approveMut.isPending}
                      >
                        {approveMut.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : <CheckCircle size={13} className="mr-1" />}
                        Setujui & Post Jurnal
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => setShowRejectDialog(true)}
                        disabled={rejectMut.isPending}
                      >
                        <XCircle size={13} className="mr-1" /> Tolak
                      </Button>
                    </div>
                  </div>
                )}

                {/* Approval trail */}
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
                            <div className="text-muted-foreground">
                              {r.date} · {r.paymentMethod === "cash" ? "Kas" : "Bank"}
                              {r.notes ? ` · ${r.notes}` : ""}
                            </div>
                            <span className="font-mono text-emerald-400">{idr(r.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* ── Upload Receipt ──────────────────────────────────────── */}
                {(selected.status === "active" || selected.status === "partial") && (
                  <div className="border-t pt-4 space-y-2">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <FileText size={14} className="text-blue-400" /> Upload Receipt
                    </p>
                    <p className="text-xs text-muted-foreground">Upload struk belanja (JPG/PNG/PDF) — OCR akan mengisi form otomatis.</p>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".jpg,.jpeg,.png,.pdf,.webp"
                      className="hidden"
                      onChange={handleUploadReceipt}
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full border-blue-700 text-blue-300 hover:bg-blue-900/30"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploadingReceipt}
                    >
                      {uploadingReceipt
                        ? <><Loader2 size={13} className="mr-1 animate-spin" />Memproses OCR...</>
                        : <><Upload size={13} className="mr-1" />Pilih File Receipt</>}
                    </Button>
                    {detail?.receipt_url && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <CheckCircle size={11} className="text-emerald-400" />
                        Receipt sudah diupload
                      </p>
                    )}
                  </div>
                )}

                {/* ── Add Repayment ───────────────────────────────────────── */}
                {(selected.status === "active" || selected.status === "partial") && (
                  <div className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium flex items-center gap-2">
                      <RefreshCw size={14} className="text-primary" />Tambah Cicilan / Reimbursement
                    </p>
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
                    {parseIDR(repAmtRaw) > 0 && (
                      <div className="text-xs text-muted-foreground rounded bg-muted/30 px-3 py-1.5">
                        Jurnal: <strong>DR {repPm === "cash" ? "Kas" : "Bank"}</strong> · <strong>CR Piutang Karyawan</strong> {idr(parseIDR(repAmtRaw))}
                      </div>
                    )}
                    <Button size="sm" className="w-full" onClick={handleRepay} disabled={repayMut.isPending}>
                      {repayMut.isPending ? <><Loader2 size={13} className="mr-1 animate-spin" />Menyimpan...</> : "Catat Cicilan"}
                    </Button>
                  </div>
                )}

                {/* ── Audit Log ───────────────────────────────────────────── */}
                {detail?.auditLogs?.length > 0 && (
                  <div className="space-y-2 border-t pt-4">
                    <p className="text-sm font-medium flex items-center gap-2 text-muted-foreground">
                      <History size={13} /> Riwayat Aktivitas
                    </p>
                    <div className="space-y-1">
                      {detail.auditLogs.map((log: any, i: number) => (
                        <div key={i} className="flex justify-between text-xs text-muted-foreground rounded border px-2 py-1.5">
                          <span className="font-medium text-foreground/70">{log.action?.replace(/_/g, " ")}</span>
                          <span>{new Date(log.created_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Delete */}
                {["active", "pending_approval", "rejected"].includes(selected.status) && Number(selected.paid_amount ?? selected.paidAmount) === 0 && (
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

      {/* ── Reject Dialog ────────────────────────────────────────────────────── */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle size={16} /> Tolak Kasbon
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Masukkan alasan penolakan (opsional):</p>
            <Textarea
              rows={3}
              placeholder="Alasan penolakan..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowRejectDialog(false)}>Batal</Button>
            <Button
              variant="destructive"
              onClick={() => selected && rejectMut.mutate({ id: selected.id, reason: rejectReason })}
              disabled={rejectMut.isPending}
            >
              {rejectMut.isPending ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
              Konfirmasi Tolak
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── OCR Auto-fill Dialog ──────────────────────────────────────────────── */}
      <Dialog open={ocrDialog.visible} onOpenChange={(v) => setOcrDialog((p) => ({ ...p, visible: v }))}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scan size={16} className="text-blue-400" /> Hasil OCR Receipt
            </DialogTitle>
          </DialogHeader>
          {ocrDialog.ocr && (
            <div className="space-y-3">
              <ConfidenceBadge confidence={ocrDialog.ocr.confidence} />
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Nominal</span>
                  <span className="font-mono font-semibold">{ocrDialog.ocr.amount ? idr(ocrDialog.ocr.amount) : "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tanggal</span>
                  <span>{ocrDialog.ocr.date ?? "—"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="text-right max-w-[60%]">{ocrDialog.ocr.partyName ?? "—"}</span>
                </div>
                {ocrDialog.ocr.description && (
                  <div>
                    <span className="text-muted-foreground">Deskripsi</span>
                    <p className="mt-1 text-xs">{ocrDialog.ocr.description}</p>
                  </div>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Klik "Isi Form" untuk mengisi otomatis form cicilan. Anda bisa koreksi sebelum submit.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOcrDialog({ visible: false, ocr: null })}>Tutup</Button>
            <Button onClick={applyOcr} className="bg-blue-700 hover:bg-blue-600">
              <Check size={13} className="mr-1" /> Isi Form Otomatis
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
