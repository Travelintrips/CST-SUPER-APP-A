import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Activity, DollarSign, RefreshCw, ArrowLeft } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

type Payment = {
  id: number; payment_number: string; booking_id: number;
  booking_number: string; customer_name: string; booking_date: string;
  amount: number; method: string; status: string; paid_at: string | null;
  notes: string; facility_name: string | null;
};

const METHOD_LABEL: Record<string, string> = {
  cash: "Tunai", transfer: "Transfer Bank", qris: "QRIS", card: "Kartu", other: "Lainnya",
};

export default function SportCenterPayments() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const esRef = useRef<EventSource | null>(null);
  const [realtimeCount, setRealtimeCount] = useState(0);

  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [showDialog, setShowDialog] = useState(false);
  const [form, setForm] = useState({ booking_id: "", amount: "", method: "cash", notes: "" });

  const { data, isLoading } = useQuery<{ data: Payment[]; total: number }>({
    queryKey: ["sport-center-payments", activeCompanyId, statusFilter, page],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (statusFilter !== "all") qs.set("status", statusFilter);
      qs.set("page", String(page));
      const r = await fetch(`/api/sport-center/payments?${qs}`, { credentials: "include" });
      return r.json();
    },
  });

  useEffect(() => {
    const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
    const es = new EventSource(`/api/sport-center/events${qs}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "connected") return;
        if (ev.entity === "payment") {
          qc.invalidateQueries({ queryKey: ["sport-center-payments"] });
          setRealtimeCount((c) => c + 1);
        }
      } catch {}
    };
    return () => { es.close(); };
  }, [activeCompanyId, qc]);

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch("/api/sport-center/payments", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Pembayaran dicatat" });
      setShowDialog(false); setForm({ booking_id: "", amount: "", method: "cash", notes: "" });
      qc.invalidateQueries({ queryKey: ["sport-center-payments"] });
      qc.invalidateQueries({ queryKey: ["sport-center-dashboard"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const totalRevenue = (data?.data ?? []).reduce((s, p) => s + (p.status === "paid" ? Number(p.amount) : 0), 0);

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/sport-center/dashboard")} className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <DollarSign className="h-6 w-6 text-green-400" />
            <div>
              <h1 className="text-2xl font-bold text-foreground">Pembayaran</h1>
              <p className="text-sm text-muted-foreground">Total: {data?.total ?? 0} transaksi</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {realtimeCount > 0 && (
              <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
                <Activity className="h-3 w-3" /> Live
              </Badge>
            )}
            <Button onClick={() => setShowDialog(true)} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Catat Pembayaran
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-border/60 bg-emerald-900/10">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Revenue Halaman Ini</p>
              <p className="text-xl font-bold text-emerald-400 mt-1">{idr(totalRevenue)}</p>
            </CardContent>
          </Card>
        </div>

        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="paid">Lunas</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="failed">Gagal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/40 bg-muted/20">
                  {["No. Pembayaran", "No. Booking", "Pelanggan", "Tgl Pembayaran", "Tanggal Booking", "Metode", "Status", "Jumlah", "Fasilitas"].map((h) => (
                    <th key={h} className="text-left py-3 px-3 text-xs text-muted-foreground font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Memuat…</td></tr>
                ) : (data?.data ?? []).length === 0 ? (
                  <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Belum ada pembayaran</td></tr>
                ) : (data?.data ?? []).map((p) => (
                  <tr key={p.id} className="border-b border-border/20 hover:bg-muted/20">
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{p.payment_number}</td>
                    <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{p.booking_number}</td>
                    <td className="py-2.5 px-3 text-foreground">{p.customer_name}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">
                      {p.paid_at
                        ? new Date(p.paid_at).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })
                        : <span className="text-muted-foreground/50">—</span>}
                    </td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{p.booking_date ?? "—"}</td>
                    <td className="py-2.5 px-3">
                      <Badge className="bg-blue-900/30 text-blue-300 border-blue-700 text-xs">
                        {METHOD_LABEL[p.method] ?? p.method}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3">
                      <Badge className={p.status === "paid"
                        ? "bg-emerald-900/30 text-emerald-300 border-emerald-700 text-xs"
                        : p.status === "pending"
                        ? "bg-yellow-900/30 text-yellow-300 border-yellow-700 text-xs"
                        : "bg-red-900/30 text-red-300 border-red-700 text-xs"
                      }>
                        {p.status === "paid" ? "Lunas" : p.status === "pending" ? "Pending" : p.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-3 font-medium text-foreground text-right">{idr(Number(p.amount))}</td>
                    <td className="py-2.5 px-3 text-muted-foreground text-xs">{p.facility_name ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        {(data?.total ?? 0) > 50 && (
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
            <Button variant="outline" size="sm" disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>Next</Button>
          </div>
        )}

        <Dialog open={showDialog} onOpenChange={setShowDialog}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Catat Pembayaran</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="space-y-1">
                <Label className="text-xs">ID Booking *</Label>
                <Input
                  type="number" placeholder="Masukkan ID booking"
                  value={form.booking_id} onChange={(e) => setForm((p) => ({ ...p, booking_id: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">ID booking tersedia di halaman Bookings</p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Jumlah (IDR) *</Label>
                <Input type="number" min={0} value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Metode Pembayaran</Label>
                <Select value={form.method} onValueChange={(v) => setForm((p) => ({ ...p, method: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Tunai</SelectItem>
                    <SelectItem value="transfer">Transfer Bank</SelectItem>
                    <SelectItem value="qris">QRIS</SelectItem>
                    <SelectItem value="card">Kartu</SelectItem>
                    <SelectItem value="other">Lainnya</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catatan</Label>
                <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDialog(false)}>Batal</Button>
              <Button
                disabled={!form.booking_id || !form.amount || createMutation.isPending}
                onClick={() => createMutation.mutate({
                  company_id: activeCompanyId,
                  booking_id: Number(form.booking_id),
                  amount: Number(form.amount),
                  method: form.method,
                  notes: form.notes,
                })}
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Catat Pembayaran"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
