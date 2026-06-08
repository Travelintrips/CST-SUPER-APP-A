import { useState, useMemo } from "react";
import { Link } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CreditCard, ExternalLink, RefreshCw, CheckCircle2, Clock,
  XCircle, AlertCircle, Search, Download, ShoppingCart, TrendingUp,
  DollarSign, Hourglass, FlaskConical,
} from "lucide-react";

type PaymentStatus = "pending" | "paid" | "expired" | "cancelled" | "failed";

interface PaylabsPayment {
  id: number;
  refKind: string;
  refId: number;
  refDocNumber: string | null;
  amount: string;
  status: PaymentStatus;
  provider: string;
  providerOrderId: string | null;
  providerMerchantTradeNo: string | null;
  paymentUrl: string | null;
  expiredAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

const idr = (n: number | string) =>
  new Intl.NumberFormat("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Number(n));

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";

const IS_DEV = import.meta.env.DEV;

function StatusBadge({ status }: { status: PaymentStatus }) {
  const map: Record<PaymentStatus, { label: string; className: string; icon: React.ReactNode }> = {
    pending:   { label: "Menunggu",   className: "bg-amber-900/40 text-amber-300 border-amber-700",    icon: <Hourglass className="h-3 w-3" /> },
    paid:      { label: "Lunas",      className: "bg-emerald-900/40 text-emerald-300 border-emerald-700", icon: <CheckCircle2 className="h-3 w-3" /> },
    expired:   { label: "Kadaluarsa", className: "bg-slate-700/60 text-slate-400 border-slate-600",    icon: <Clock className="h-3 w-3" /> },
    cancelled: { label: "Dibatalkan", className: "bg-red-900/40 text-red-400 border-red-700",          icon: <XCircle className="h-3 w-3" /> },
    failed:    { label: "Gagal",      className: "bg-red-900/40 text-red-400 border-red-700",          icon: <AlertCircle className="h-3 w-3" /> },
  };
  const { label, className, icon } = map[status] ?? map.pending;
  return (
    <Badge className={`${className} gap-1 text-xs`}>
      {icon}{label}
    </Badge>
  );
}

export default function PaylabsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [simulateId, setSimulateId] = useState<number | null>(null);
  const [simulating, setSimulating] = useState(false);

  const { data: payments = [], isLoading, refetch } = useQuery<PaylabsPayment[]>({
    queryKey: ["paylabs-payments"],
    queryFn: async () => {
      const r = await fetch("/api/payments", { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat data pembayaran");
      const all: PaylabsPayment[] = await r.json();
      return all.filter((p) => p.provider === "paylabs");
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    let list = payments;
    if (statusFilter !== "all") list = list.filter((p) => p.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((p) =>
        (p.refDocNumber ?? "").toLowerCase().includes(q) ||
        (p.providerMerchantTradeNo ?? "").toLowerCase().includes(q) ||
        (p.providerOrderId ?? "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [payments, statusFilter, search]);

  const totals = useMemo(() => ({
    total: payments.length,
    paid: payments.filter((p) => p.status === "paid").length,
    pending: payments.filter((p) => p.status === "pending").length,
    totalPaidAmount: payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount), 0),
  }), [payments]);

  const handleSimulate = async () => {
    if (!simulateId) return;
    setSimulating(true);
    try {
      const r = await fetch(`/api/payments/${simulateId}/simulate-paid`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const d = await r.json().catch(() => ({})) as { message?: string };
        throw new Error(d.message ?? "Simulasi gagal");
      }
      toast({ title: "Simulasi berhasil", description: "Status pembayaran diubah ke Lunas" });
      setSimulateId(null);
      await qc.invalidateQueries({ queryKey: ["paylabs-payments"] });
    } catch (err: unknown) {
      toast({ title: "Gagal", description: String((err as Error).message), variant: "destructive" });
    } finally {
      setSimulating(false);
    }
  };

  const exportCsv = () => {
    const header = ["ID", "No. Dokumen", "Jumlah", "Status", "Merchant Trade No", "Platform Order ID", "URL Bayar", "Dibuat", "Lunas Pada"];
    const rows = filtered.map((p) => [
      p.id,
      p.refDocNumber ?? "",
      Number(p.amount),
      p.status,
      p.providerMerchantTradeNo ?? "",
      p.providerOrderId ?? "",
      p.paymentUrl ?? "",
      fmtDate(p.createdAt),
      fmtDate(p.paidAt),
    ]);
    const csv = [header, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `paylabs-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-slate-50 flex items-center gap-2">
              <CreditCard className="h-6 w-6 text-indigo-400" />
              Transaksi Paylabs
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Monitor semua payment link dan status pembayaran online via Paylabs.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-1.5" /> Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
              <Download className="h-4 w-4 mr-1.5" /> Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-slate-700 bg-slate-900">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-slate-400 flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" /> Total Transaksi
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-slate-100">{totals.total}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-800/40 bg-slate-900">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" /> Total Diterima
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-emerald-400">{idr(totals.totalPaidAmount)}</p>
            </CardContent>
          </Card>
          <Card className="border-amber-800/40 bg-slate-900">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-slate-400 flex items-center gap-1.5">
                <Hourglass className="h-3.5 w-3.5 text-amber-400" /> Menunggu Bayar
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-amber-400">{totals.pending}</p>
            </CardContent>
          </Card>
          <Card className="border-indigo-800/40 bg-slate-900">
            <CardHeader className="pb-1 pt-4 px-4">
              <CardTitle className="text-xs text-slate-400 flex items-center gap-1.5">
                <DollarSign className="h-3.5 w-3.5 text-indigo-400" /> Lunas
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <p className="text-2xl font-bold text-indigo-400">{totals.paid}</p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-slate-700 bg-slate-900">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  placeholder="Cari no. dokumen, merchant trade no..."
                  className="pl-9 bg-slate-800 border-slate-700 text-sm"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Semua Status</SelectItem>
                  <SelectItem value="pending">Menunggu</SelectItem>
                  <SelectItem value="paid">Lunas</SelectItem>
                  <SelectItem value="expired">Kadaluarsa</SelectItem>
                  <SelectItem value="cancelled">Dibatalkan</SelectItem>
                  <SelectItem value="failed">Gagal</SelectItem>
                </SelectContent>
              </Select>
              {(search || statusFilter !== "all") && (
                <Button variant="ghost" size="sm" className="text-slate-400 text-xs" onClick={() => { setSearch(""); setStatusFilter("all"); }}>
                  Reset
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" /> Memuat data...
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 gap-2">
                <CreditCard className="h-8 w-8 opacity-30" />
                <p className="text-sm">Belum ada transaksi Paylabs</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-700">
                    <TableHead className="text-slate-400 text-xs">No. Dokumen</TableHead>
                    <TableHead className="text-slate-400 text-xs">Jumlah</TableHead>
                    <TableHead className="text-slate-400 text-xs">Status</TableHead>
                    <TableHead className="text-slate-400 text-xs hidden md:table-cell">Merchant Trade No</TableHead>
                    <TableHead className="text-slate-400 text-xs hidden lg:table-cell">Kadaluarsa</TableHead>
                    <TableHead className="text-slate-400 text-xs hidden lg:table-cell">Lunas Pada</TableHead>
                    <TableHead className="text-slate-400 text-xs hidden md:table-cell">Dibuat</TableHead>
                    <TableHead className="text-slate-400 text-xs text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => (
                    <TableRow key={p.id} className="border-slate-700/50 hover:bg-slate-800/40">
                      <TableCell className="text-sm">
                        {p.refDocNumber ? (
                          <Link href={`/sales/orders/${p.refId}`}>
                            <span className="flex items-center gap-1.5 text-indigo-400 hover:text-indigo-300 cursor-pointer">
                              <ShoppingCart className="h-3.5 w-3.5" />
                              {p.refDocNumber}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-slate-500 font-mono text-xs">#{p.id}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm font-mono font-medium text-slate-200">
                        Rp {idr(p.amount)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="font-mono text-xs text-slate-400 truncate max-w-40 block">
                          {p.providerMerchantTradeNo ?? "-"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-slate-400">
                        {fmtDate(p.expiredAt)}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-emerald-400">
                        {p.paidAt ? fmtDate(p.paidAt) : <span className="text-slate-600">-</span>}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-slate-400">
                        {fmtDate(p.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {p.paymentUrl && p.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1 text-sky-400 hover:text-sky-300 hover:bg-sky-900/20 px-2"
                              onClick={() => window.open(p.paymentUrl!, "_blank")}
                            >
                              <ExternalLink className="h-3 w-3" /> Link
                            </Button>
                          )}
                          {IS_DEV && p.status === "pending" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs gap-1 text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 px-2"
                              onClick={() => setSimulateId(p.id)}
                            >
                              <FlaskConical className="h-3 w-3" /> Simulasi
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={simulateId !== null} onOpenChange={(v) => !v && setSimulateId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FlaskConical className="h-5 w-5 text-amber-400" />
              Simulasi Pembayaran Lunas
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-300">
            Tandai payment <span className="font-mono text-amber-300">#{simulateId}</span> sebagai <strong>Lunas</strong> secara simulasi.
          </p>
          <p className="text-xs text-amber-400">Hanya tersedia di mode development.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSimulateId(null)} disabled={simulating}>Batal</Button>
            <Button onClick={handleSimulate} disabled={simulating} className="bg-amber-600 hover:bg-amber-500">
              {simulating ? "Memproses..." : "Ya, Simulasi Lunas"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
