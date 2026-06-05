import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  useListExpenseCategories, useListTaxes, useListExpenses, useListAccounts,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Zap, ArrowLeft, Loader2, Coffee, Home, Cpu, Lightbulb, Smile,
  MoreHorizontal, BookOpen, Receipt, Info, LayoutTemplate, RefreshCw,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const formatIDRInput = (raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("id-ID");
};

const parseIDR = (v: string) => {
  const n = Number(v.replace(/\D/g, ""));
  return isNaN(n) ? 0 : n;
};

const PRESET_CODES = [
  { code: "ENTERTAINMENT",  label: "Entertainment",   icon: Smile,         color: "text-purple-400" },
  { code: "MAKAN_MINUM",   label: "Makan & Minum",   icon: Coffee,        color: "text-amber-400" },
  { code: "SEWA_KANTOR",   label: "Sewa Kantor",     icon: Home,          color: "text-blue-400" },
  { code: "UTILITAS",      label: "Utilitas",         icon: Lightbulb,    color: "text-yellow-400" },
  { code: "PERALATAN",     label: "Peralatan & ATK", icon: Cpu,           color: "text-teal-400" },
  { code: "LAIN_LAIN",     label: "Lain-lain",       icon: MoreHorizontal, color: "text-slate-400" },
];

const STATUS_COLORS: Record<string, string> = {
  draft:            "bg-slate-800 text-slate-300 border-slate-600",
  submitted:        "bg-sky-900/40 text-sky-300 border-sky-600",
  approved:         "bg-indigo-900/40 text-indigo-300 border-indigo-600",
  posted:           "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  paid:             "bg-green-900/50 text-green-300 border-green-600",
  rejected:         "bg-red-900/40 text-red-300 border-red-600",
  pending_approval: "bg-orange-900/40 text-orange-300 border-orange-600",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", submitted: "Diajukan", approved: "Disetujui",
  posted: "Diposting", paid: "Lunas", rejected: "Ditolak",
  pending_approval: "Menunggu Approval",
};

async function postQuickExpense(payload: {
  date: string; categoryId: number; amount: number;
  vendorEmployee?: string; notes?: string;
  taxRateId?: number | null; paymentMethod: "cash" | "bank"; company?: number;
}) {
  const res = await fetch(`/api/expenses/quick${payload.company ? `?company=${payload.company}` : ""}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message ?? "Gagal menyimpan expense.");
  return data;
}

async function fetchTemplates(companyId?: number | null) {
  const url = `/api/expense-templates${companyId ? `?company=${companyId}` : ""}`;
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) return [];
  return res.json() as Promise<any[]>;
}

export default function ExpenseRoutinePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();

  const { data: allCats = [], refetch: refetchCats } = useListExpenseCategories({
    query: { refetchInterval: 30_000 },
  });
  const { data: taxes = [], refetch: refetchTaxes } = useListTaxes({
    query: { refetchInterval: 30_000 },
  });
  const { data: accounts = [] } = useListAccounts({
    query: { refetchInterval: 30_000 },
  });
  const { data: recentExpenses = [] } = useListExpenses(
    { expenseType: "routine", company: activeCompanyId } as any
  );
  const { data: templates = [] } = useQuery({
    queryKey: ["expenseTemplates", activeCompanyId],
    queryFn: () => fetchTemplates(activeCompanyId),
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const presetMap = useMemo(() => {
    const m: Record<string, any> = {};
    for (const cat of allCats) {
      if (PRESET_CODES.some((p) => p.code === cat.code)) {
        m[cat.code] = cat;
      }
    }
    return m;
  }, [allCats]);

  const accountById = useMemo(() => {
    const m = new Map<number, { name: string; code: string }>();
    for (const a of accounts) m.set(a.id, { name: a.name, code: a.code });
    return m;
  }, [accounts]);

  const today = new Date().toISOString().slice(0, 10);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [amountRaw, setAmountRaw] = useState("");
  const [vendorEmployee, setVendorEmployee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("bank");
  const [taxRateId, setTaxRateId] = useState<string>("none");
  const [taxAutoFilled, setTaxAutoFilled] = useState(false);
  const [notes, setNotes] = useState("");
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const selectedCat: any = useMemo(() => {
    if (!selectedCode) return null;
    const fromPreset = presetMap[selectedCode];
    if (fromPreset) return fromPreset;
    return allCats.find((c) => c.code === selectedCode) ?? null;
  }, [selectedCode, presetMap, allCats]);

  // Auto-fill tax from category when category changes
  useEffect(() => {
    if (!selectedCat) return;
    const defaultTaxId = (selectedCat as any).defaultTaxId as number | null | undefined;
    if (defaultTaxId) {
      setTaxRateId(String(defaultTaxId));
      setTaxAutoFilled(true);
    } else {
      if (taxAutoFilled) {
        setTaxRateId("none");
        setTaxAutoFilled(false);
      }
    }
  }, [selectedCat?.id]);

  const amount = parseIDR(amountRaw);
  const selectedTax = taxes.find((t) => t.id.toString() === taxRateId);
  const taxAmount = selectedTax ? Math.round(amount * Number(selectedTax.rate) / 100) : 0;
  const isWithholding = selectedTax?.kind === "withholding";
  const total = isWithholding ? amount - taxAmount : amount + taxAmount;

  // Account name resolution
  const debitAccName = selectedCat?.expenseAccountId
    ? (accountById.get(selectedCat.expenseAccountId)?.name ?? `#${selectedCat.expenseAccountId}`)
    : "—";
  const debitAccCode = selectedCat?.expenseAccountId
    ? (accountById.get(selectedCat.expenseAccountId)?.code ?? "")
    : "";

  const mutation = useMutation({
    mutationFn: postQuickExpense,
    onSuccess: (data) => {
      const msg = data.needsApproval
        ? `${data.expenseNumber} menunggu approval.`
        : `✓ ${data.expenseNumber} — ${idr(data.total)} diposting ke jurnal.`;
      toast({ title: msg });
      qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      setAmountRaw(""); setVendorEmployee(""); setNotes("");
      setTaxRateId("none"); setTaxAutoFilled(false);
      setDate(today); setSelectedCode(null);
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedCode || !selectedCat) {
      toast({ title: "Pilih kategori terlebih dahulu.", variant: "destructive" }); return;
    }
    if (!selectedCat.expenseAccountId) {
      toast({ title: `Kategori "${selectedCat.name}" belum punya akun biaya. Konfigurasi di halaman Kategori.`, variant: "destructive" }); return;
    }
    if (amount <= 0) {
      toast({ title: "Nominal harus lebih dari 0.", variant: "destructive" }); return;
    }
    if (!date) {
      toast({ title: "Tanggal wajib diisi.", variant: "destructive" }); return;
    }
    mutation.mutate({
      date, categoryId: selectedCat.id, amount,
      vendorEmployee: vendorEmployee || undefined,
      notes: notes || undefined,
      taxRateId: taxRateId !== "none" ? Number(taxRateId) : null,
      paymentMethod, company: activeCompanyId ?? undefined,
    });
  };

  const applyTemplate = (tpl: any) => {
    if (tpl.category_id) {
      const cat = allCats.find((c) => c.id === tpl.category_id);
      if (cat) setSelectedCode(cat.code);
    }
    if (tpl.payment_method) setPaymentMethod(tpl.payment_method);
    if (tpl.tax_rate_id) { setTaxRateId(String(tpl.tax_rate_id)); setTaxAutoFilled(false); }
    if (tpl.amount_preset) setAmountRaw(formatIDRInput(String(Math.round(Number(tpl.amount_preset)))));
    if (tpl.default_vendor) setVendorEmployee(tpl.default_vendor);
    toast({ title: `Template "${tpl.name}" diterapkan.` });
  };

  const handleManualRefresh = async () => {
    await Promise.all([refetchCats(), refetchTaxes()]);
    setLastRefresh(new Date());
    toast({ title: "Data kategori & pajak diperbarui." });
  };

  const needSeed = PRESET_CODES.some((p) => !presetMap[p.code]);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-3xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/expense">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <ArrowLeft size={15} />
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <Zap size={20} className="text-amber-400" />
              <div>
                <h1 className="text-xl font-bold">Biaya Rutin</h1>
                <p className="text-sm text-muted-foreground">Catat pengeluaran — jurnal otomatis DR Biaya / CR Kas·Bank</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleManualRefresh}>
                    <RefreshCw size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Perbarui data (otomatis setiap 30 detik)</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Link href="/expense/templates">
              <Button variant="outline" size="sm">
                <LayoutTemplate size={13} className="mr-1.5" />
                Template
              </Button>
            </Link>
          </div>
        </div>

        {/* Seed hint */}
        {needSeed && (
          <div className="rounded-md border border-amber-700 bg-amber-950/40 px-4 py-3 text-sm text-amber-300 flex items-center justify-between gap-3">
            <span>Preset kategori rutin belum ada di database.</span>
            <button
              className="shrink-0 underline text-amber-200 hover:text-white"
              onClick={async () => {
                const r = await fetch("/api/expenses/seed-categories", { method: "POST", credentials: "include" });
                if (r.ok) {
                  toast({ title: "Kategori berhasil di-seed." });
                  qc.invalidateQueries({ queryKey: ["listExpenseCategories"] });
                  window.location.reload();
                }
              }}
            >Seed Sekarang</button>
          </div>
        )}

        {/* Quick Template Shortcuts */}
        {templates.length > 0 && (
          <Card className="border-dashed border-primary/30">
            <CardHeader className="pb-2 pt-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <LayoutTemplate size={13} />
                Template Cepat
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3">
              <div className="flex flex-wrap gap-2">
                {templates.slice(0, 8).map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => applyTemplate(tpl)}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-muted/30 px-3 py-1.5 text-xs font-medium hover:bg-muted/60 transition-colors"
                  >
                    <Zap size={11} className="text-amber-400" />
                    {tpl.name}
                    {tpl.amount_preset ? (
                      <span className="text-muted-foreground">{idr(Number(tpl.amount_preset))}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Preset Category Buttons */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pilih Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PRESET_CODES.map(({ code, label, icon: Icon, color }) => {
                const cat: any = presetMap[code];
                const inDb = !!cat;
                const active = selectedCode === code;
                const hasAccount = inDb && !!cat?.expenseAccountId;
                return (
                  <button
                    key={code}
                    disabled={!inDb}
                    onClick={() => setSelectedCode(active ? null : code)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all relative",
                      active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-muted/30 hover:bg-muted/60",
                      !inDb && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <Icon size={20} className={active ? "text-primary" : color} />
                    <span className="text-xs font-medium leading-tight">{label}</span>
                    {inDb && !hasAccount && (
                      <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-amber-500" title="Belum ada akun biaya" />
                    )}
                  </button>
                );
              })}
            </div>
            {/* Custom categories */}
            {allCats.filter((c) => !PRESET_CODES.some((p) => p.code === c.code) && c.isActive).length > 0 && (
              <div className="mt-3 pt-3 border-t">
                <p className="text-xs text-muted-foreground mb-2">Kategori lainnya:</p>
                <Select value={selectedCode ?? "none"} onValueChange={(v) => setSelectedCode(v === "none" ? null : v)}>
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue placeholder="Pilih kategori lain..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">—</SelectItem>
                    {allCats
                      .filter((c) => !PRESET_CODES.some((p) => p.code === c.code) && c.isActive && c.expenseAccountId)
                      .map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Mapping Info — shown when category selected */}
        {selectedCat && (
          <div className={cn(
            "rounded-md border px-4 py-3 text-sm",
            selectedCat.expenseAccountId
              ? "border-emerald-700/40 bg-emerald-950/20"
              : "border-amber-700/40 bg-amber-950/20"
          )}>
            {selectedCat.expenseAccountId ? (
              <div className="flex items-start gap-2">
                <CheckCircle2 size={15} className="text-emerald-400 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <p className="font-medium text-emerald-300">Mapping Akun Terdeteksi</p>
                  <p className="text-xs text-muted-foreground">
                    Debit: <span className="text-foreground font-mono">{debitAccCode}</span>{" "}
                    <span className="text-foreground">{debitAccName}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Kredit: <span className="text-foreground">{paymentMethod === "cash" ? "Kas (Tunai)" : "Bank"}</span>
                    {" "}(dari sumber dana)
                  </p>
                  {(selectedCat as any).defaultTaxId && taxRateId !== "none" && selectedTax && (
                    <p className="text-xs text-amber-300 flex items-center gap-1">
                      <Info size={11} />
                      Pajak default: {selectedTax.name} ({Number(selectedTax.rate)}%)
                      {taxAutoFilled && <span className="text-muted-foreground">(auto-filled)</span>}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-amber-300">
                <AlertCircle size={15} className="shrink-0" />
                <span>
                  Kategori ini belum punya akun biaya.{" "}
                  <Link href="/expense/categories" className="underline">Konfigurasi sekarang →</Link>
                </span>
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Detail Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tanggal <span className="text-destructive">*</span></Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Sumber Dana (Kredit)</Label>
                <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v as "cash" | "bank")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="bank">🏦 Bank (Transfer)</SelectItem>
                    <SelectItem value="cash">💵 Kas (Tunai)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tujuan / Vendor / Karyawan</Label>
              <Input
                placeholder="Nama toko, vendor, atau karyawan (opsional)"
                value={vendorEmployee}
                onChange={(e) => setVendorEmployee(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nominal (IDR) <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="0"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(formatIDRInput(e.target.value))}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  Pajak
                  {taxAutoFilled && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-600 text-amber-400">
                      auto
                    </Badge>
                  )}
                </Label>
                <Select
                  value={taxRateId}
                  onValueChange={(v) => { setTaxRateId(v); setTaxAutoFilled(false); }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Tanpa pajak" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Tanpa pajak</SelectItem>
                    {taxes.map((t) => (
                      <SelectItem key={t.id} value={t.id.toString()}>
                        {t.name} ({Number(t.rate)}%)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Jurnal Preview */}
            {amount > 0 && selectedCat && (
              <div className="rounded-md bg-muted/40 border px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{idr(amount)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{isWithholding ? `PPh Dipotong (${selectedTax?.name})` : `PPN (${selectedTax?.name})`}</span>
                    <span className="font-mono">{isWithholding ? `−${idr(taxAmount)}` : `+${idr(taxAmount)}`}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1.5 mt-0.5">
                  <span>{isWithholding ? "Dibayar ke Vendor" : "Total"}</span>
                  <span className="font-mono text-base">{idr(total)}</span>
                </div>
                <div className="border-t pt-1.5 mt-0.5 space-y-0.5 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground mb-1">Entri Jurnal Otomatis:</p>
                  <div className="flex justify-between">
                    <span className="text-emerald-400">DR {debitAccCode && `[${debitAccCode}]`} {debitAccName}</span>
                    <span className="font-mono">{idr(amount)}</span>
                  </div>
                  {taxAmount > 0 && !isWithholding && (
                    <div className="flex justify-between">
                      <span className="text-emerald-400">DR PPN Masukan</span>
                      <span className="font-mono">{idr(taxAmount)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && isWithholding && (
                    <div className="flex justify-between">
                      <span className="text-rose-400">CR Hutang PPh ({selectedTax?.name})</span>
                      <span className="font-mono">{idr(taxAmount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-rose-400">CR {paymentMethod === "cash" ? "Kas (Tunai)" : "Bank"}</span>
                    <span className="font-mono">{idr(total)}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Keterangan</Label>
              <Textarea
                placeholder="Catatan opsional..."
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={mutation.isPending || !selectedCode || amount <= 0}
            >
              {mutation.isPending ? (
                <><Loader2 size={14} className="mr-2 animate-spin" /> Menyimpan...</>
              ) : (
                <><Zap size={14} className="mr-2" /> Catat & Posting Sekarang</>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Recent */}
        {recentExpenses.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BookOpen size={14} />
                Riwayat Biaya Rutin Terkini
                <span className="ml-auto text-[10px] text-muted-foreground/60 font-normal">
                  Refresh {lastRefresh.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">No. Expense</TableHead>
                    <TableHead className="text-xs">Tanggal</TableHead>
                    <TableHead className="text-xs">Kategori</TableHead>
                    <TableHead className="text-xs">Tujuan</TableHead>
                    <TableHead className="text-xs text-right">Total</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(recentExpenses as any[]).slice(0, 20).map((exp) => {
                    const cat = allCats.find((c) => c.id === exp.categoryId);
                    return (
                      <TableRow key={exp.id}>
                        <TableCell>
                          <Link href={`/expense/${exp.id}`}>
                            <span className="font-mono text-xs text-primary hover:underline">{exp.expenseNumber}</span>
                          </Link>
                        </TableCell>
                        <TableCell className="text-xs">{exp.date}</TableCell>
                        <TableCell>
                          {cat ? (
                            <Badge variant="secondary" className="text-xs">{cat.name}</Badge>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{exp.vendorEmployee ?? "—"}</TableCell>
                        <TableCell className="text-xs text-right font-medium font-mono">{idr(exp.total)}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-xs border", STATUS_COLORS[exp.status] ?? "bg-muted text-muted-foreground")}>
                            {STATUS_LABELS[exp.status] ?? exp.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
        {recentExpenses.length === 0 && (
          <div className="text-center py-8 text-sm text-muted-foreground flex flex-col items-center gap-2">
            <Receipt size={32} className="opacity-30" />
            <p>Belum ada biaya rutin. Isi form di atas untuk memulai.</p>
          </div>
        )}
      </div>
    </AppShell>
  );
}
