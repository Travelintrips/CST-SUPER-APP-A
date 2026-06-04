import { useState, useMemo } from "react";
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
  useListExpenseCategories, useListTaxes, useListExpenses,
  getListExpensesQueryKey,
} from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useCompany } from "@/contexts/CompanyContext";
import {
  Zap, ArrowLeft, Loader2, Coffee, Home, Cpu, Lightbulb, Smile,
  MoreHorizontal, BookOpen, Receipt,
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

// Preset categories with icons — matched by code from DB
const PRESET_CODES = [
  { code: "ENTERTAINMENT",  label: "Entertainment",   icon: Smile,       color: "text-purple-400" },
  { code: "MAKAN_MINUM",   label: "Makan & Minum",   icon: Coffee,      color: "text-amber-400" },
  { code: "SEWA_KANTOR",   label: "Sewa Kantor",     icon: Home,        color: "text-blue-400" },
  { code: "UTILITAS",      label: "Utilitas",        icon: Lightbulb,   color: "text-yellow-400" },
  { code: "PERALATAN",     label: "Peralatan & ATK", icon: Cpu,         color: "text-teal-400" },
  { code: "LAIN_LAIN",     label: "Lain-lain",       icon: MoreHorizontal, color: "text-slate-400" },
];

const STATUS_COLORS: Record<string, string> = {
  draft:     "bg-slate-800 text-slate-300 border-slate-600",
  submitted: "bg-sky-900/40 text-sky-300 border-sky-600",
  approved:  "bg-indigo-900/40 text-indigo-300 border-indigo-600",
  posted:    "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  paid:      "bg-green-900/50 text-green-300 border-green-600",
  rejected:  "bg-red-900/40 text-red-300 border-red-600",
};
const STATUS_LABELS: Record<string, string> = {
  draft: "Draft", submitted: "Diajukan", approved: "Disetujui",
  posted: "Diposting", paid: "Lunas", rejected: "Ditolak",
};

async function postQuickExpense(payload: {
  date: string;
  categoryId: number;
  amount: number;
  vendorEmployee?: string;
  notes?: string;
  taxRateId?: number | null;
  paymentMethod: "cash" | "bank";
  company?: number;
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

export default function ExpenseRoutinePage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();

  const { data: allCats = [] } = useListExpenseCategories();
  const { data: taxes = [] } = useListTaxes();
  const { data: recentExpenses = [] } = useListExpenses({
    expenseType: "routine",
    company: activeCompanyId,
  } as any);

  // Map preset codes → DB category IDs
  const presetMap = useMemo(() => {
    const m: Record<string, { id: number; name: string; expenseAccountId: number | null }> = {};
    for (const cat of allCats) {
      if (PRESET_CODES.some((p) => p.code === cat.code)) {
        m[cat.code] = { id: cat.id, name: cat.name, expenseAccountId: cat.expenseAccountId ?? null };
      }
    }
    return m;
  }, [allCats]);

  // Form state
  const today = new Date().toISOString().slice(0, 10);
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [date, setDate] = useState(today);
  const [amountRaw, setAmountRaw] = useState("");
  const [vendorEmployee, setVendorEmployee] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("bank");
  const [taxRateId, setTaxRateId] = useState<string>("none");
  const [notes, setNotes] = useState("");

  const selectedCat = selectedCode ? presetMap[selectedCode] : null;
  const amount = parseIDR(amountRaw);

  // Tax preview
  const selectedTax = taxes.find((t) => t.id.toString() === taxRateId);
  const taxAmount = selectedTax ? Math.round(amount * Number(selectedTax.rate) / 100) : 0;
  const total = amount + taxAmount;

  const mutation = useMutation({
    mutationFn: postQuickExpense,
    onSuccess: (data) => {
      toast({ title: `✓ ${data.expenseNumber} — ${idr(data.total)} berhasil dicatat.` });
      qc.invalidateQueries({ queryKey: getListExpensesQueryKey() });
      // Reset form
      setAmountRaw("");
      setVendorEmployee("");
      setNotes("");
      setTaxRateId("none");
      setDate(today);
      setSelectedCode(null);
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (!selectedCode || !selectedCat) {
      toast({ title: "Pilih kategori terlebih dahulu.", variant: "destructive" });
      return;
    }
    if (amount <= 0) {
      toast({ title: "Nominal harus lebih dari 0.", variant: "destructive" });
      return;
    }
    if (!date) {
      toast({ title: "Tanggal wajib diisi.", variant: "destructive" });
      return;
    }
    mutation.mutate({
      date,
      categoryId: selectedCat.id,
      amount,
      vendorEmployee: vendorEmployee || undefined,
      notes: notes || undefined,
      taxRateId: taxRateId !== "none" ? Number(taxRateId) : null,
      paymentMethod,
      company: activeCompanyId ?? undefined,
    });
  };

  const needSeed = PRESET_CODES.some((p) => !presetMap[p.code]);

  return (
    <AppShell>
      <div className="p-6 space-y-6 max-w-3xl mx-auto">

        {/* Header */}
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
              <p className="text-sm text-muted-foreground">Catat pengeluaran langsung — jurnal otomatis DR Biaya / CR Kas·Bank</p>
            </div>
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
                  qc.invalidateQueries({ queryKey: ["listExpenseCategories"] });
                  window.location.reload();
                }
              }}
            >
              Seed Sekarang
            </button>
          </div>
        )}

        {/* Preset Buttons */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pilih Kategori</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {PRESET_CODES.map(({ code, label, icon: Icon, color }) => {
                const inDb = !!presetMap[code];
                const active = selectedCode === code;
                return (
                  <button
                    key={code}
                    disabled={!inDb}
                    onClick={() => setSelectedCode(active ? null : code)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-lg border p-3 text-center transition-all",
                      active
                        ? "border-primary bg-primary/10 shadow-sm"
                        : "border-border bg-muted/30 hover:bg-muted/60",
                      !inDb && "opacity-40 cursor-not-allowed",
                    )}
                  >
                    <Icon size={20} className={active ? "text-primary" : color} />
                    <span className="text-xs font-medium leading-tight">{label}</span>
                  </button>
                );
              })}
            </div>
            {/* Also allow custom categories not in presets */}
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

        {/* Form */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Detail Pengeluaran</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              {/* Tanggal */}
              <div className="space-y-1.5">
                <Label>Tanggal <span className="text-destructive">*</span></Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              {/* Kas/Bank */}
              <div className="space-y-1.5">
                <Label>Sumber Dana</Label>
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

            {/* Tujuan / Vendor / Karyawan */}
            <div className="space-y-1.5">
              <Label>Tujuan / Vendor / Karyawan</Label>
              <Input
                placeholder="Nama toko, vendor, atau karyawan (opsional)"
                value={vendorEmployee}
                onChange={(e) => setVendorEmployee(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Nominal */}
              <div className="space-y-1.5">
                <Label>Nominal (IDR) <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="0"
                  value={amountRaw}
                  onChange={(e) => setAmountRaw(formatIDRInput(e.target.value))}
                  className="font-mono"
                />
              </div>
              {/* Pajak */}
              <div className="space-y-1.5">
                <Label>Pajak (opsional)</Label>
                <Select value={taxRateId} onValueChange={setTaxRateId}>
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

            {/* Total preview */}
            {amount > 0 && (
              <div className="rounded-md bg-muted/40 border px-4 py-3 space-y-1 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{idr(amount)}</span>
                </div>
                {taxAmount > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>Pajak ({selectedTax?.name})</span>
                    <span className="font-mono">{idr(taxAmount)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1 mt-1">
                  <span>Total</span>
                  <span className="font-mono text-base">{idr(total)}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground pt-1 border-t mt-1">
                  <span>Jurnal</span>
                  <span>
                    DR {selectedCat ? allCats.find((c) => c.id === selectedCat.id)?.name ?? "Biaya" : "Biaya"}
                    {" · "}
                    CR {paymentMethod === "cash" ? "Kas" : "Bank"}
                  </span>
                </div>
              </div>
            )}

            {/* Keterangan */}
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

        {/* Recent Routine Expenses */}
        {recentExpenses.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <BookOpen size={14} />
                Riwayat Biaya Rutin Terkini
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
