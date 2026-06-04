import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { AppShell } from "@/components/layout/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCompany } from "@/contexts/CompanyContext";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, QrCode, CheckCircle2, XCircle, RefreshCw, Activity, DollarSign, ArrowLeft } from "lucide-react";

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", confirmed: "Konfirmasi", checked_in: "Check-In",
  completed: "Selesai", cancelled: "Dibatalkan",
};
const STATUS_COLOR: Record<string, string> = {
  pending: "bg-yellow-900/40 text-yellow-300 border-yellow-600",
  confirmed: "bg-blue-900/40 text-blue-300 border-blue-600",
  checked_in: "bg-purple-900/40 text-purple-300 border-purple-600",
  completed: "bg-emerald-900/40 text-emerald-300 border-emerald-600",
  cancelled: "bg-red-900/40 text-red-300 border-red-600",
};
const PAY_COLOR: Record<string, string> = {
  pending:         "bg-orange-900/30 text-orange-300 border-orange-700",
  pending_payment: "bg-amber-900/30 text-amber-300 border-amber-700",
  unpaid:          "bg-red-900/30 text-red-300 border-red-700",
  paid:            "bg-emerald-900/30 text-emerald-300 border-emerald-700",
  partial:         "bg-yellow-900/30 text-yellow-300 border-yellow-700",
};
const PAY_LABEL: Record<string, string> = {
  pending:         "Belum Bayar",
  pending_payment: "Menunggu Bayar",
  unpaid:          "Belum Bayar",
  paid:            "Lunas",
  partial:         "Sebagian",
};

type Booking = Record<string, unknown>;
type Facility = { id: number; name: string; price_per_hour: number };

export default function SportCenterBookings() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { activeCompanyId } = useCompany();
  const { toast } = useToast();
  const esRef = useRef<EventSource | null>(null);

  const [statusFilter, setStatusFilter] = useState("all");
  const [paymentFilter, setPaymentFilter] = useState(() => {
    if (typeof window !== "undefined") {
      return new URLSearchParams(window.location.search).get("payment") ?? "all";
    }
    return "all";
  });
  const [dateFilter, setDateFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [realtimeCount, setRealtimeCount] = useState(0);
  const [payBooking, setPayBooking] = useState<Booking | null>(null);
  const [payForm, setPayForm] = useState({ method: "cash", notes: "" });

  const [form, setForm] = useState({
    customer_name: "", customer_phone: "", facility_id: "",
    booking_date: "", start_time: "", end_time: "", duration_hours: "1",
    base_amount: "0", total_amount: "0", notes: "",
  });

  const { data, isLoading } = useQuery<{ data: Booking[]; total: number }>({
    queryKey: ["sport-center-bookings", activeCompanyId, statusFilter, paymentFilter, dateFilter, page],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (activeCompanyId) qs.set("companyId", String(activeCompanyId));
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (paymentFilter !== "all") qs.set("payment_status", paymentFilter);
      if (dateFilter) qs.set("date", dateFilter);
      qs.set("page", String(page));
      const r = await fetch(`/api/sport-center/bookings?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Gagal memuat booking");
      return r.json();
    },
  });

  const { data: facilities } = useQuery<Facility[]>({
    queryKey: ["sport-center-facilities-list", activeCompanyId],
    queryFn: async () => {
      const qs = activeCompanyId ? `?companyId=${activeCompanyId}` : "";
      const r = await fetch(`/api/sport-center/facilities${qs}`, { credentials: "include" });
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
        if (ev.entity === "booking") {
          qc.invalidateQueries({ queryKey: ["sport-center-bookings"] });
          setRealtimeCount((c) => c + 1);
        }
      } catch {}
    };
    return () => { es.close(); };
  }, [activeCompanyId, qc]);

  const createMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch("/api/sport-center/bookings", {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "Gagal");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Booking berhasil dibuat" });
      setShowCreateDialog(false);
      setForm({ customer_name: "", customer_phone: "", facility_id: "", booking_date: "", start_time: "", end_time: "", duration_hours: "1", base_amount: "0", total_amount: "0", notes: "" });
      qc.invalidateQueries({ queryKey: ["sport-center-bookings"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const payMutation = useMutation({
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
      toast({ title: "Pembayaran berhasil dicatat" });
      setPayBooking(null);
      setPayForm({ method: "cash", notes: "" });
      qc.invalidateQueries({ queryKey: ["sport-center-bookings"] });
      qc.invalidateQueries({ queryKey: ["sport-center-payments"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const checkinMutation = useMutation({
    mutationFn: async (id: number) => {
      const r = await fetch(`/api/sport-center/bookings/${id}/checkin`, {
        method: "POST", credentials: "include",
      });
      if (!r.ok) throw new Error("Gagal check-in");
    },
    onSuccess: () => {
      toast({ title: "Check-in berhasil" });
      qc.invalidateQueries({ queryKey: ["sport-center-bookings"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const r = await fetch(`/api/sport-center/bookings/${id}`, {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error("Gagal update");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sport-center-bookings"] }),
  });

  const handleFacilityChange = (facilityId: string) => {
    const f = facilities?.find((x) => String(x.id) === facilityId);
    const hours = Number(form.duration_hours || 1);
    const price = f ? f.price_per_hour * hours : 0;
    setForm((p) => ({ ...p, facility_id: facilityId, base_amount: String(price), total_amount: String(price) }));
  };

  const filtered = (data?.data ?? []).filter((b: any) =>
    !search ||
    String(b.customer_name).toLowerCase().includes(search.toLowerCase()) ||
    String(b.booking_number).toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <AppShell>
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/sport-center/dashboard")} className="h-8 w-8 shrink-0">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Bookings</h1>
              <p className="text-sm text-muted-foreground">Kelola semua booking fasilitas</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {realtimeCount > 0 && (
              <Badge className="bg-emerald-900/40 text-emerald-300 border-emerald-600 text-xs gap-1">
                <Activity className="h-3 w-3" /> Live
              </Badge>
            )}
            <Button onClick={() => setShowCreateDialog(true)} size="sm" className="gap-1">
              <Plus className="h-4 w-4" /> Buat Booking
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Cari nama / no. booking…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="confirmed">Konfirmasi</SelectItem>
              <SelectItem value="checked_in">Check-In</SelectItem>
              <SelectItem value="completed">Selesai</SelectItem>
              <SelectItem value="cancelled">Dibatalkan</SelectItem>
            </SelectContent>
          </Select>
          <Select value={paymentFilter} onValueChange={(v) => { setPaymentFilter(v); setPage(1); }}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Pembayaran</SelectItem>
              <SelectItem value="pending">Belum Bayar</SelectItem>
              <SelectItem value="pending_payment">Menunggu Bayar</SelectItem>
              <SelectItem value="paid">Lunas</SelectItem>
              <SelectItem value="partial">Sebagian</SelectItem>
              <SelectItem value="unpaid">Tidak Bayar</SelectItem>
            </SelectContent>
          </Select>
          <Input type="date" value={dateFilter} onChange={(e) => { setDateFilter(e.target.value); setPage(1); }} className="w-40" />
          {dateFilter && (
            <Button variant="ghost" size="sm" onClick={() => setDateFilter("")}>
              <XCircle className="h-4 w-4" />
            </Button>
          )}
        </div>

        <Card className="border-border/60">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/40 bg-muted/20">
                    {["No. Booking","Pelanggan","Fasilitas","Tanggal","Jam","Status","Pembayaran","Total","Aksi"].map((h) => (
                      <th key={h} className="text-left py-3 px-3 text-xs text-muted-foreground font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Memuat…</td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={9} className="py-10 text-center text-muted-foreground">Tidak ada booking</td></tr>
                  ) : filtered.map((b: any) => (
                    <tr key={b.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="py-2.5 px-3 font-mono text-xs text-muted-foreground">{b.booking_number}</td>
                      <td className="py-2.5 px-3">
                        <p className="text-foreground font-medium">{b.customer_name}</p>
                        <p className="text-xs text-muted-foreground">{b.customer_phone}</p>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">{b.facility_name}</td>
                      <td className="py-2.5 px-3 text-muted-foreground">{b.booking_date}</td>
                      <td className="py-2.5 px-3 text-muted-foreground text-xs">{b.start_time}–{b.end_time}</td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-xs border ${STATUS_COLOR[b.status as string] ?? ""}`}>
                          {STATUS_LABEL[b.status as string] ?? b.status}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3">
                        <Badge className={`text-xs border ${PAY_COLOR[b.payment_status as string] ?? "bg-muted text-muted-foreground border-border"}`}>
                          {PAY_LABEL[b.payment_status as string] ?? String(b.payment_status)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">{idr(Number(b.total_amount))}</td>
                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1">
                          {b.payment_status !== "paid" && !["cancelled"].includes(b.status as string) && (
                            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1 text-emerald-400 border-emerald-700 hover:bg-emerald-900/30"
                              onClick={() => { setPayBooking(b); setPayForm({ method: "cash", notes: "" }); }}>
                              <DollarSign className="h-3 w-3" /> Bayar
                            </Button>
                          )}
                          {b.status === "confirmed" && (
                            <Button size="sm" variant="outline" className="text-xs h-7 px-2 gap-1"
                              onClick={() => checkinMutation.mutate(b.id as number)}>
                              <QrCode className="h-3 w-3" /> Check-in
                            </Button>
                          )}
                          {b.status === "pending" && (
                            <Button size="sm" variant="outline" className="text-xs h-7 px-2 text-emerald-400 border-emerald-700"
                              onClick={() => statusMutation.mutate({ id: b.id as number, status: "confirmed" })}>
                              <CheckCircle2 className="h-3 w-3" />
                            </Button>
                          )}
                          {!["cancelled","completed","checked_in"].includes(b.status as string) && (
                            <Button size="sm" variant="ghost" className="text-xs h-7 px-2 text-red-400"
                              onClick={() => statusMutation.mutate({ id: b.id as number, status: "cancelled" })}>
                              <XCircle className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {(data?.total ?? 0) > 50 && (
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>Total: {data?.total} booking</span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={page * 50 >= (data?.total ?? 0)} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        )}

        {/* Payment Dialog */}
        <Dialog open={!!payBooking} onOpenChange={(o) => { if (!o) { setPayBooking(null); setPayForm({ method: "cash", notes: "" }); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle>Catat Pembayaran Booking</DialogTitle></DialogHeader>
            {payBooking && (
              <div className="grid gap-3 py-2">
                <div className="rounded-lg bg-muted/30 p-3 text-sm space-y-1">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">No. Booking</span>
                    <span className="font-mono font-medium">{payBooking.booking_number as string}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Pelanggan</span>
                    <span>{payBooking.customer_name as string}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Fasilitas</span>
                    <span>{payBooking.facility_name as string}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tanggal</span>
                    <span>{payBooking.booking_date as string}</span>
                  </div>
                  <div className="flex justify-between font-semibold border-t border-border/40 pt-1 mt-1">
                    <span>Total Tagihan</span>
                    <span className="text-emerald-400">{idr(Number(payBooking.total_amount))}</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Metode Pembayaran</Label>
                  <Select value={payForm.method} onValueChange={(v) => setPayForm((p) => ({ ...p, method: v }))}>
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
                  <Input value={payForm.notes} onChange={(e) => setPayForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opsional" />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setPayBooking(null); setPayForm({ method: "cash", notes: "" }); }}>Batal</Button>
              <Button
                disabled={payMutation.isPending}
                className="bg-emerald-700 hover:bg-emerald-600"
                onClick={() => payBooking && payMutation.mutate({
                  company_id: payBooking.company_id ?? activeCompanyId,
                  booking_id: payBooking.id,
                  amount: payBooking.total_amount,
                  method: payForm.method,
                  notes: payForm.notes,
                })}
              >
                {payMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Konfirmasi Pembayaran"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Buat Booking Baru</DialogTitle></DialogHeader>
            <div className="grid gap-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Nama Pelanggan *</Label>
                  <Input value={form.customer_name} onChange={(e) => setForm((p) => ({ ...p, customer_name: e.target.value }))} placeholder="Nama" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">No. HP</Label>
                  <Input value={form.customer_phone} onChange={(e) => setForm((p) => ({ ...p, customer_phone: e.target.value }))} placeholder="08xx" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fasilitas *</Label>
                <Select value={form.facility_id} onValueChange={handleFacilityChange}>
                  <SelectTrigger><SelectValue placeholder="Pilih fasilitas" /></SelectTrigger>
                  <SelectContent>
                    {(facilities ?? []).map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>{f.name} — {idr(f.price_per_hour)}/jam</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Tanggal *</Label>
                  <Input type="date" value={form.booking_date} onChange={(e) => setForm((p) => ({ ...p, booking_date: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Mulai *</Label>
                  <Input type="time" value={form.start_time} onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Selesai *</Label>
                  <Input type="time" value={form.end_time} onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Durasi (jam)</Label>
                  <Input type="number" min="0.5" step="0.5" value={form.duration_hours}
                    onChange={(e) => {
                      const h = Number(e.target.value);
                      const f = facilities?.find((x) => String(x.id) === form.facility_id);
                      const price = f ? f.price_per_hour * h : 0;
                      setForm((p) => ({ ...p, duration_hours: e.target.value, base_amount: String(price), total_amount: String(price) }));
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Total (IDR)</Label>
                  <Input type="number" value={form.total_amount} onChange={(e) => setForm((p) => ({ ...p, total_amount: e.target.value }))} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Catatan</Label>
                <Input value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Opsional" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Batal</Button>
              <Button
                disabled={!form.customer_name || !form.facility_id || !form.booking_date || createMutation.isPending}
                onClick={() => {
                  const fac = facilities?.find((x) => String(x.id) === form.facility_id);
                  createMutation.mutate({
                    company_id: activeCompanyId,
                    customer_name: form.customer_name, customer_phone: form.customer_phone,
                    facility_id: Number(form.facility_id), facility_name: fac?.name ?? "",
                    booking_date: form.booking_date, start_time: form.start_time, end_time: form.end_time,
                    duration_hours: Number(form.duration_hours), base_amount: Number(form.base_amount),
                    total_amount: Number(form.total_amount), notes: form.notes,
                  });
                }}
              >
                {createMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : "Buat Booking"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
