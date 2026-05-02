import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  useListLogisticOrders, useGetLogisticOrderSummary,
  useUpdateLogisticOrderStatus,
  getListLogisticOrdersQueryKey, getGetLogisticOrderSummaryQueryKey,
} from "@workspace/api-client-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STATUS_OPTIONS, STATUS_COLORS, SHIPMENT_TYPES, OrderStatus } from "@/lib/services-data";
import {
  Package, Ship, TrendingUp, Search, LogOut, Filter, ChevronRight, Truck, Save, Loader2, Settings, ChevronDown,
} from "lucide-react";

const VEHICLE_TYPES = ["CDE", "CDD", "Fuso", "Wingbox", "Trailer"] as const;
type VehicleType = (typeof VEHICLE_TYPES)[number];
type TruckingRates = Record<VehicleType, { ratePerKm: number; loadingFee: number }>;

const DEFAULT_RATES: TruckingRates = {
  CDE:     { ratePerKm: 5000,  loadingFee: 500000 },
  CDD:     { ratePerKm: 7000,  loadingFee: 700000 },
  Fuso:    { ratePerKm: 10000, loadingFee: 1000000 },
  Wingbox: { ratePerKm: 12000, loadingFee: 1200000 },
  Trailer: { ratePerKm: 15000, loadingFee: 1500000 },
};

const ADMIN_KEY = "logistic_admin_auth";
const CARD_STYLE_KEY = "logistic_admin_card_styles";

type CardStyle = { logoUrl?: string; bgCustom?: string };
type CardStyleMap = Record<string, CardStyle>;

const ADMIN_CARDS = [
  { id: "totalOrders", label: "Total Pesanan" },
  { id: "revenue",     label: "Estimasi Revenue" },
  { id: "newOrder",       label: "New Order" },
  { id: "underReview",    label: "Under Review" },
  { id: "quotationSent",  label: "Quotation Sent" },
  { id: "confirmed",      label: "Confirmed" },
  { id: "inProgress",     label: "In Progress" },
  { id: "completed",      label: "Completed" },
  { id: "cancelled",      label: "Cancelled" },
];

const ADMIN_GRADIENT_PRESETS = [
  "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
  "linear-gradient(135deg, #11998e 0%, #38ef7d 100%)",
  "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
  "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
  "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
  "linear-gradient(135deg, #2193b0 0%, #6dd5ed 100%)",
  "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
  "linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)",
];

export default function AdminPage() {
  const [, setLocation] = useLocation();
  const [authed, setAuthed] = useState(() => localStorage.getItem(ADMIN_KEY) === "1");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const updateStatus = useUpdateLogisticOrderStatus();

  const [statusFilter, setStatusFilter] = useState<string>(
    () => new URLSearchParams(window.location.search).get("status") ?? ""
  );
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [debouncedSearch, setDebouncedSearch] = useState<string>("");

  const [rates, setRates] = useState<TruckingRates>(DEFAULT_RATES);
  const [ratesEditing, setRatesEditing] = useState<TruckingRates>(DEFAULT_RATES);
  const [ratesSaving, setRatesSaving] = useState(false);

  const [cardStyles, setCardStyles] = useState<CardStyleMap>(() => {
    try { return JSON.parse(localStorage.getItem(CARD_STYLE_KEY) ?? "{}"); } catch { return {}; }
  });
  const [cardConfigOpen, setCardConfigOpen] = useState(false);

  function updateCardStyle(id: string, patch: Partial<CardStyle>) {
    const next = { ...cardStyles, [id]: { ...cardStyles[id], ...patch } };
    setCardStyles(next);
    localStorage.setItem(CARD_STYLE_KEY, JSON.stringify(next));
  }

  function resetCardStyle(id: string) {
    const next = { ...cardStyles };
    delete next[id];
    setCardStyles(next);
    localStorage.setItem(CARD_STYLE_KEY, JSON.stringify(next));
  }

  useEffect(() => {
    fetch("/api/logistic/orders/trucking-rates")
      .then((r) => r.json())
      .then((d) => { setRates(d); setRatesEditing(d); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400);
    return () => clearTimeout(t);
  }, [search]);

  const params = {
    status: statusFilter || undefined,
    shipmentType: typeFilter || undefined,
    search: debouncedSearch || undefined,
  };

  const { data: orders = [], isLoading } = useListLogisticOrders(params, {
    query: { enabled: authed, queryKey: getListLogisticOrdersQueryKey(params) },
  });

  const { data: summary } = useGetLogisticOrderSummary({
    query: { enabled: authed, queryKey: getGetLogisticOrderSummaryQueryKey() },
  });

  async function handleSaveRates() {
    setRatesSaving(true);
    try {
      const res = await fetch("/api/logistic/orders/trucking-rates", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-admin-password": "admin123" },
        body: JSON.stringify(ratesEditing),
      });
      if (!res.ok) throw new Error("Gagal menyimpan");
      setRates(ratesEditing);
      toast({ title: "Tarif trucking berhasil disimpan" });
    } catch {
      toast({ title: "Gagal menyimpan tarif", variant: "destructive" });
    } finally {
      setRatesSaving(false);
    }
  }

  function handleLogin() {
    if (password === "admin123") {
      localStorage.setItem(ADMIN_KEY, "1");
      setAuthed(true);
      setLoginError("");
    } else {
      setLoginError("Password salah. Coba lagi.");
    }
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_KEY);
    setAuthed(false);
    setPassword("");
  }

  function setStatusFilterAndUrl(status: string) {
    setStatusFilter(status);
    if (status) {
      setLocation(`/admin?status=${encodeURIComponent(status)}`);
    } else {
      setLocation("/admin");
    }
  }

  function handleInlineStatusChange(orderId: number, status: string) {
    updateStatus.mutate(
      { id: orderId, data: { status } },
      {
        onSuccess: () => {
          toast({ title: `Status diperbarui: ${status}` });
          queryClient.invalidateQueries({ queryKey: getListLogisticOrdersQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetLogisticOrderSummaryQueryKey() });
        },
        onError: () => toast({ title: "Gagal memperbarui status", variant: "destructive" }),
      }
    );
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center mx-auto mb-4">
              <Ship className="w-6 h-6 text-primary-foreground" />
            </div>
            <h1 className="text-xl font-bold text-foreground">Admin Dashboard</h1>
            <p className="text-sm text-muted-foreground mt-1">Logistic Ordering System</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-6 space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Password</label>
              <Input
                type="password"
                placeholder="Masukkan password admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              {loginError && <p className="text-xs text-destructive mt-1">{loginError}</p>}
            </div>
            <Button className="w-full" onClick={handleLogin}>Masuk</Button>
          </div>
          <Button variant="ghost" className="w-full text-muted-foreground" onClick={() => setLocation("/")}>
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Navbar */}
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logistic-order/logocst-new.jpg" alt="CST Logistics" className="h-8 w-8 object-contain rounded-full" />
            <span className="font-bold text-sm text-foreground">Admin Dashboard</span>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="w-3.5 h-3.5 mr-1" /> Logout
          </Button>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        {/* Summary Stats */}
        {summary && (
          <div className="space-y-3">
            {/* Top row: Total + Revenue */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { id: "totalOrders", label: "Total Pesanan", value: summary.totalOrders, icon: <Package className="w-10 h-10 opacity-20" />, defaultCls: "bg-primary text-primary-foreground", subLabelCls: "text-primary-foreground/60" },
                { id: "revenue", label: "Estimasi Revenue", value: formatCurrency(summary.totalEstimatedRevenue), icon: <TrendingUp className="w-10 h-10 opacity-20" />, defaultCls: "bg-accent text-accent-foreground", subLabelCls: "text-accent-foreground/70" },
              ].map(({ id, label, value, icon, defaultCls, subLabelCls }) => {
                const cs = cardStyles[id];
                const isGrad = cs?.bgCustom?.includes("gradient");
                return (
                  <button
                    key={id}
                    onClick={() => setStatusFilterAndUrl("")}
                    style={cs?.bgCustom ? { background: cs.bgCustom } : undefined}
                    className={`${cs?.bgCustom ? (isGrad ? "text-white" : "") : defaultCls} rounded-xl p-5 flex items-center justify-between w-full cursor-pointer hover:brightness-95 transition-all text-left`}
                  >
                    <div>
                      <p className={`text-xs mb-1 ${cs?.bgCustom ? (isGrad ? "text-white/70" : "text-foreground/60") : subLabelCls}`}>{label}</p>
                      <p className="text-2xl sm:text-4xl font-bold leading-tight">{value}</p>
                    </div>
                    {cs?.logoUrl ? (
                      <img src={cs.logoUrl} alt="" className="w-10 h-10 object-contain rounded opacity-80" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                    ) : icon}
                  </button>
                );
              })}
            </div>

            {/* Status breakdown */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              {[
                { id: "newOrder",      label: "New Order",       value: summary.newOrders,          bg: "bg-blue-50",    border: "border-blue-200",   text: "text-blue-700",   num: "text-blue-800" },
                { id: "underReview",   label: "Under Review",    value: summary.underReviewOrders,  bg: "bg-yellow-50",  border: "border-yellow-200", text: "text-yellow-700", num: "text-yellow-800" },
                { id: "quotationSent", label: "Quotation Sent",  value: summary.quotationSentOrders,bg: "bg-purple-50",  border: "border-purple-200", text: "text-purple-700", num: "text-purple-800" },
                { id: "confirmed",     label: "Confirmed",       value: summary.confirmedOrders,    bg: "bg-emerald-50", border: "border-emerald-200",text: "text-emerald-700",num: "text-emerald-800" },
                { id: "inProgress",    label: "In Progress",     value: summary.inProgressOrders,   bg: "bg-orange-50",  border: "border-orange-200", text: "text-orange-700", num: "text-orange-800" },
                { id: "completed",     label: "Completed",       value: summary.completedOrders,    bg: "bg-green-50",   border: "border-green-200",  text: "text-green-700",  num: "text-green-800" },
                { id: "cancelled",     label: "Cancelled",       value: summary.cancelledOrders,    bg: "bg-red-50",     border: "border-red-200",    text: "text-red-700",    num: "text-red-800" },
              ].map(({ id, label, value, bg, border, text, num }) => {
                const cs = cardStyles[id];
                const isGrad = cs?.bgCustom?.includes("gradient");
                return (
                  <button
                    key={id}
                    onClick={() => setStatusFilterAndUrl(statusFilter === label ? "" : label)}
                    style={cs?.bgCustom ? { background: cs.bgCustom } : undefined}
                    className={`${cs?.bgCustom ? "" : bg} border ${cs?.bgCustom ? "border-white/20" : border} rounded-lg p-3 text-left transition-all hover:shadow-sm cursor-pointer ${statusFilter === label ? "ring-2 ring-offset-1 ring-current" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <p className={`text-2xl font-bold ${isGrad ? "text-white drop-shadow" : num}`}>{value}</p>
                      {cs?.logoUrl && (
                        <img src={cs.logoUrl} alt="" className="h-6 w-6 object-contain rounded opacity-80" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                      )}
                    </div>
                    <p className={`text-xs font-medium mt-0.5 ${isGrad ? "text-white/85" : text} leading-tight`}>{label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Cari nama perusahaan, PIC, atau nomor order..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilterAndUrl(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-44">
                <Filter className="w-3.5 h-3.5 mr-1" />
                <SelectValue placeholder="Semua Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Semua Status</SelectItem>
                {STATUS_OPTIONS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="w-full sm:w-40">
                <SelectValue placeholder="Semua Tipe" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Semua Tipe</SelectItem>
                {SHIPMENT_TYPES.map(({ type }) => <SelectItem key={type} value={type}>{type}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Trucking Rates Config */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center gap-2">
            <Truck className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-foreground text-sm">Tarif Trucking per Kendaraan</h2>
          </div>
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Tarif ini diterapkan otomatis saat customer memilih jenis kendaraan pada kalkulator. Rate digunakan sebagai: <strong>Jarak (km) × Rate/km + Loading Fee</strong>.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground w-28">Kendaraan</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Trucking Rate (IDR/km)</th>
                    <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground">Loading Fee (IDR)</th>
                  </tr>
                </thead>
                <tbody>
                  {VEHICLE_TYPES.map((vt) => (
                    <tr key={vt} className="border-b border-border/50">
                      <td className="py-2 px-3">
                        <Badge variant="outline" className="font-mono text-xs">{vt}</Badge>
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={ratesEditing[vt]?.ratePerKm ?? ""}
                          onChange={(e) => setRatesEditing((prev) => ({
                            ...prev,
                            [vt]: { ...prev[vt], ratePerKm: parseInt(e.target.value) || 0 },
                          }))}
                          className="h-8 text-sm w-40"
                          min="0"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <Input
                          type="number"
                          value={ratesEditing[vt]?.loadingFee ?? ""}
                          onChange={(e) => setRatesEditing((prev) => ({
                            ...prev,
                            [vt]: { ...prev[vt], loadingFee: parseInt(e.target.value) || 0 },
                          }))}
                          className="h-8 text-sm w-40"
                          min="0"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={handleSaveRates} disabled={ratesSaving} size="sm" className="gap-2">
                {ratesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {ratesSaving ? "Menyimpan..." : "Simpan Tarif"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setRatesEditing(rates)}
                disabled={ratesSaving}
              >
                Reset
              </Button>
            </div>
          </div>
        </div>

        {/* Card Style Config */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <button
            className="w-full px-4 py-3 border-b border-border flex items-center justify-between hover:bg-muted/30 transition-colors"
            onClick={() => setCardConfigOpen((v) => !v)}
          >
            <div className="flex items-center gap-2">
              <Settings className="w-4 h-4 text-primary" />
              <h2 className="font-semibold text-foreground text-sm">Tampilan Stat Cards</h2>
              <span className="text-xs text-muted-foreground">(logo &amp; background)</span>
            </div>
            <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${cardConfigOpen ? "rotate-180" : ""}`} />
          </button>
          {cardConfigOpen && (
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground mb-2">Kustomisasi logo dan background tiap stat card. Perubahan tersimpan otomatis di browser ini.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ADMIN_CARDS.map(({ id, label }) => {
                  const cs = cardStyles[id] ?? {};
                  const isGrad = cs.bgCustom?.includes("gradient");
                  return (
                    <div key={id} className="border rounded-lg p-3 space-y-2 bg-muted/20">
                      {/* Preview */}
                      <div
                        style={cs.bgCustom ? { background: cs.bgCustom } : undefined}
                        className={`rounded p-2 flex items-center justify-between ${cs.bgCustom ? "" : "bg-primary/10"}`}
                      >
                        <span className={`text-xs font-semibold ${isGrad ? "text-white" : "text-foreground"}`}>{label}</span>
                        {cs.logoUrl && <img src={cs.logoUrl} alt="" className="h-5 w-5 object-contain rounded" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />}
                      </div>

                      {/* Logo URL */}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 w-9">Logo:</span>
                        <input
                          className="flex-1 text-xs border rounded px-1.5 py-0.5 bg-background min-w-0"
                          placeholder="URL gambar..."
                          value={cs.logoUrl ?? ""}
                          onChange={(e) => updateCardStyle(id, { logoUrl: e.target.value || undefined })}
                        />
                        {cs.logoUrl && (
                          <button onClick={() => updateCardStyle(id, { logoUrl: undefined })} className="text-muted-foreground hover:text-red-500 flex-shrink-0 text-xs">✕</button>
                        )}
                      </div>

                      {/* Background */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] text-muted-foreground flex-shrink-0 w-9">BG:</span>
                        <input
                          type="color"
                          value={cs.bgCustom && !isGrad ? cs.bgCustom : "#eff6ff"}
                          onChange={(e) => updateCardStyle(id, { bgCustom: e.target.value })}
                          className="h-5 w-6 rounded border-0 cursor-pointer p-0 flex-shrink-0"
                          title="Warna solid"
                        />
                        {ADMIN_GRADIENT_PRESETS.map((g, gi) => (
                          <button
                            key={gi}
                            style={{ background: g }}
                            onClick={() => updateCardStyle(id, { bgCustom: g })}
                            className={`h-4 w-6 rounded border ${cs.bgCustom === g ? "ring-2 ring-offset-1 ring-gray-400" : "border-gray-200"}`}
                            title={`Gradient ${gi + 1}`}
                          />
                        ))}
                        {cs.bgCustom && (
                          <button onClick={() => updateCardStyle(id, { bgCustom: undefined })} className="text-muted-foreground hover:text-red-500 text-xs flex-shrink-0">✕</button>
                        )}
                      </div>

                      {(cs.logoUrl || cs.bgCustom) && (
                        <button onClick={() => resetCardStyle(id)} className="text-[10px] text-muted-foreground hover:text-red-500 underline">Reset ke default</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Orders Table */}
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-foreground text-sm">Daftar Pesanan ({orders.length})</h2>
          </div>

          {isLoading ? (
            <div className="text-center py-10 text-muted-foreground text-sm">Memuat data...</div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12">
              <Package className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-40" />
              <p className="font-medium text-foreground">Tidak ada pesanan</p>
              <p className="text-sm text-muted-foreground mt-1">Belum ada pesanan masuk</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {["Order #", "Perusahaan", "PIC", "Tipe", "Route", "Total", "Status", "Tanggal", ""].map((h) => (
                      <th key={h} className="text-left text-xs font-semibold text-muted-foreground px-4 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-b border-border hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-foreground">{order.orderNumber}</td>
                      <td className="px-4 py-3 text-sm text-foreground">{order.companyName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{order.customerName}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{order.shipmentType}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{order.origin} → {order.destination}</td>
                      <td className="px-4 py-3 text-sm font-bold text-accent">{formatCurrency(order.grandTotal)}</td>
                      <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                        <Select
                          value={order.status}
                          onValueChange={(val) => handleInlineStatusChange(order.id, val)}
                        >
                          <SelectTrigger className={`h-7 text-xs border-0 px-2 font-medium w-36 ${STATUS_COLORS[order.status as OrderStatus] || "bg-gray-100 text-gray-800"}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(order.createdAt)}</td>
                      <td className="px-4 py-3 cursor-pointer" onClick={() => setLocation(`/admin/orders/${order.id}`)}>
                        <ChevronRight className="w-4 h-4 text-muted-foreground" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
