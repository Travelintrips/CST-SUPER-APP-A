import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { getAuthHeaders, getAuthToken } from "@/lib/auth";
import { useGetPortalMe } from "@workspace/api-client-react";
import {
  Plane, ArrowLeft, Plus, Trash2, ChevronRight, Loader2,
  Weight, Package, RefreshCw, CheckCircle2, MapPin, User,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ─── Types ──────────────────────────────────────────────────── */
interface DimRow {
  id: string;
  length: string;
  width: string;
  height: string;
  koli: string;
  gross_weight: string;
}

interface RateOption {
  rate_id: number;
  airline: string;
  rate_source_name: string;
  routing_type: string;
  transit_days: number | null;
  flight_number: string | null;
  etd: string | null;
  eta: string | null;
  service_mode: string;
  service_level: string;
  currency: string;
  rate_per_kg: number;
  weight_break: string;
  freight_base: number;
  fuel_surcharge: number;
  security_surcharge: number;
  fixed_fees: number;
  total_estimate_idr: number;
}

interface EstimateResult {
  gross_weight: number;
  volumetric_weight: number;
  chargeable_weight: number;
  weight_break: string;
  options: RateOption[];
}

/* ─── Helpers ────────────────────────────────────────────────── */
const IDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number, d = 3) => n.toLocaleString("id-ID", { minimumFractionDigits: 0, maximumFractionDigits: d });

function newRow(): DimRow {
  return { id: crypto.randomUUID(), length: "", width: "", height: "", koli: "1", gross_weight: "" };
}

const TRADE_TYPE_OPTS = [
  { v: "export", l: "Export" },
  { v: "import", l: "Import" },
  { v: "domestic", l: "Domestic" },
];
const SERVICE_MODE_OPTS = [
  { v: "airport_to_airport", l: "Airport to Airport" },
  { v: "door_to_door",       l: "Door to Door" },
  { v: "door_to_airport",    l: "Door to Airport" },
  { v: "airport_to_door",    l: "Airport to Door" },
];
const SERVICE_LEVEL_OPTS = [
  { v: "standard", l: "Standard" },
  { v: "express",  l: "Express" },
  { v: "economy",  l: "Economy" },
];
const CARGO_TYPE_OPTS = [
  { v: "general",      l: "General Cargo" },
  { v: "dg",           l: "Dangerous Goods (DG)" },
  { v: "perishable",   l: "Perishable" },
  { v: "live_animal",  l: "Live Animal" },
  { v: "valuable",     l: "Valuable" },
  { v: "oversize",     l: "Oversize" },
];

/* ─── Main ───────────────────────────────────────────────────── */
export default function AirFreightBookingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Step 1 — Route
  const [originCity,    setOriginCity]    = useState("Jakarta");
  const [originAirport, setOriginAirport] = useState("CGK");
  const [destCity,      setDestCity]      = useState("");
  const [destAirport,   setDestAirport]   = useState("");
  const [tradeType,     setTradeType]     = useState("export");
  const [serviceMode,   setServiceMode]   = useState("airport_to_airport");
  const [serviceLevel,  setServiceLevel]  = useState("standard");
  const [cargoType,     setCargoType]     = useState("general");

  // Step 2 — Cargo
  const [rows, setRows] = useState<DimRow[]>([newRow()]);
  const [commodity, setCommodity] = useState("");

  // Step 3 — Estimate result
  const [estimate,     setEstimate]    = useState<EstimateResult | null>(null);
  const [estimating,   setEstimating]  = useState(false);
  const [selectedRate, setSelectedRate] = useState<RateOption | null>(null);

  // Step 4 — Customer info
  const [custName,  setCustName]  = useState("");
  const [custPhone, setCustPhone] = useState("");
  const [custEmail, setCustEmail] = useState("");
  const [notes,     setNotes]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<{ orderNumber: string } | null>(null);

  // Pre-fill from portal auth
  const token = getAuthToken();
  const { data: me } = useGetPortalMe({
    query: { queryKey: ["portalMe", token], enabled: !!token },
    request: { headers: getAuthHeaders() },
  });
  if (me && !custName)  setCustName(me.name  ?? "");
  if (me && !custEmail) setCustEmail(me.email ?? "");
  if (me && !custPhone) setCustPhone((me as any).phone ?? "");

  // ── Weight calculation ────────────────────────────────────────
  const totalGross = rows.reduce((s, r) => s + (parseFloat(r.gross_weight) || 0), 0);
  const totalVolumetric = rows.reduce((s, r) => {
    const l = parseFloat(r.length) || 0;
    const w = parseFloat(r.width)  || 0;
    const h = parseFloat(r.height) || 0;
    const k = parseInt(r.koli)     || 1;
    return s + (l * w * h * k) / 1_000_000 * 167;
  }, 0);
  const chargeableWeight = Math.max(totalGross, totalVolumetric);
  const totalKoli = rows.reduce((s, r) => s + (parseInt(r.koli) || 0), 0);

  // ── Row helpers ───────────────────────────────────────────────
  const upd = (id: string, f: keyof DimRow, v: string) =>
    setRows(p => p.map(r => r.id === id ? { ...r, [f]: v } : r));

  // ── Hitung Estimasi ───────────────────────────────────────────
  async function handleEstimate(): Promise<void> {
    if (!originAirport.trim() || !destAirport.trim()) {
      toast({ title: "Origin & Destination Airport wajib diisi", variant: "destructive" });
      return;
    }
    if (chargeableWeight <= 0) {
      toast({ title: "Isi berat / dimensi kargo terlebih dahulu", variant: "destructive" });
      return;
    }
    setEstimating(true);
    setEstimate(null);
    setSelectedRate(null);
    try {
      const dimRows = rows.map(r => ({
        length:       parseFloat(r.length)      || 0,
        width:        parseFloat(r.width)       || 0,
        height:       parseFloat(r.height)      || 0,
        koli:         parseInt(r.koli)          || 1,
        gross_weight: parseFloat(r.gross_weight) || 0,
      }));
      const res = await fetch("/api/air-freight/public/estimate", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          origin_airport: originAirport.trim().toUpperCase(),
          destination_airport: destAirport.trim().toUpperCase(),
          gross_weight:  totalGross,
          dimension_rows: dimRows,
          trade_type:    tradeType,
          service_mode:  serviceMode,
          service_level: serviceLevel,
          cargo_type:    cargoType,
        }),
      });
      const data = await res.json() as EstimateResult & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengambil estimasi");
      setEstimate(data);
      if (data.options.length === 0) {
        toast({ title: "Tidak ada rate tersedia untuk rute ini saat ini", variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Gagal menghitung estimasi", description: String(err), variant: "destructive" });
    } finally {
      setEstimating(false);
    }
  }

  // ── Minta Penawaran Final ─────────────────────────────────────
  async function handleSubmit(): Promise<void> {
    if (!custName.trim())  { toast({ title: "Nama wajib diisi", variant: "destructive" }); return; }
    if (!custPhone.trim()) { toast({ title: "Nomor WhatsApp wajib diisi", variant: "destructive" }); return; }
    if (!commodity.trim()) { toast({ title: "Nama komoditi wajib diisi", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const dimRows = rows
        .filter(r => r.length || r.width || r.height)
        .map(r => ({
          length:       parseFloat(r.length)       || 0,
          width:        parseFloat(r.width)        || 0,
          height:       parseFloat(r.height)       || 0,
          koli:         parseInt(r.koli)           || 1,
          gross_weight: parseFloat(r.gross_weight) || 0,
        }));

      const payload: Record<string, unknown> = {
        customer_name:  custName.trim(),
        customer_phone: custPhone.trim(),
        customer_email: custEmail.trim(),
        origin_city:    originCity.trim(),
        origin_airport: originAirport.trim().toUpperCase(),
        destination_city:    destCity.trim(),
        destination_airport: destAirport.trim().toUpperCase(),
        trade_type:    tradeType,
        service_mode:  serviceMode,
        service_level: serviceLevel,
        cargo_type:    cargoType,
        commodity:     commodity.trim(),
        gross_weight:            parseFloat(totalGross.toFixed(3)),
        total_volumetric_weight: parseFloat(totalVolumetric.toFixed(3)),
        chargeable_weight:       parseFloat(chargeableWeight.toFixed(3)),
        koli: totalKoli,
        dimension_rows: dimRows,
        notes: notes.trim() || null,
      };

      if (selectedRate) {
        payload.selected_rate_id    = selectedRate.rate_id;
        payload.estimated_price_idr = parseFloat(selectedRate.total_estimate_idr.toFixed(0));
        payload.currency            = selectedRate.currency;
        payload.pricing_breakdown   = {
          rate_per_kg:        selectedRate.rate_per_kg,
          weight_break:       selectedRate.weight_break,
          freight_base:       selectedRate.freight_base,
          fuel_surcharge:     selectedRate.fuel_surcharge,
          security_surcharge: selectedRate.security_surcharge,
          fixed_fees:         selectedRate.fixed_fees,
          airline:            selectedRate.airline,
        };
      }

      const res = await fetch("/api/air-freight/public/orders", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      const data = await res.json() as { ok: boolean; order_number: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal membuat order");
      setDone({ orderNumber: data.order_number });
      toast({ title: "Order berhasil dikirim!" });
    } catch (err) {
      toast({ title: "Gagal mengirim order", description: String(err), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Success screen ──────────────────────────────────────────── */
  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
           style={{ background: "linear-gradient(160deg,#F4F8FD,#EEF4FA)" }}>
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-8 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-9 h-9 text-emerald-600" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Permintaan Terkirim!</h1>
          <p className="text-sm text-gray-600">
            Tim kami akan menghubungi Anda dengan penawaran harga final dalam waktu singkat.
          </p>
          <div className="bg-gray-50 rounded-xl p-4 text-left space-y-1">
            <p className="text-xs text-gray-500">Nomor Order</p>
            <p className="text-base font-mono font-bold text-gray-900">{done.orderNumber}</p>
          </div>
          <Button
            className="w-full"
            onClick={() => setLocation(`/air-freight/track/${done.orderNumber}`)}
          >
            Lihat Status Pengiriman
          </Button>
          <button
            className="text-xs text-gray-400 hover:text-gray-600 underline"
            onClick={() => setLocation("/")}
          >
            Kembali ke Beranda
          </button>
        </div>
      </div>
    );
  }

  /* ── Main form ───────────────────────────────────────────────── */
  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg,#F4F8FD,#EEF4FA)" }}>
      {/* Navbar */}
      <nav className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/95 backdrop-blur-sm shadow-sm">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button
            onClick={() => setLocation("/jasa")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-sky-100 flex items-center justify-center">
              <Plane className="w-4 h-4 text-sky-600" />
            </div>
            <span className="text-sm font-semibold text-gray-800">Air Freight Booking</span>
          </div>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">

        {/* ── Rute ────────────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-sky-500" /> Rute Penerbangan
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Kota Asal</Label>
              <Input value={originCity} onChange={e => setOriginCity(e.target.value)}
                     placeholder="Jakarta" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Kode Bandara Asal <span className="text-red-500">*</span></Label>
              <Input value={originAirport} onChange={e => setOriginAirport(e.target.value.toUpperCase())}
                     placeholder="CGK" className="h-9 text-sm font-mono uppercase" maxLength={4} />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Kota Tujuan</Label>
              <Input value={destCity} onChange={e => setDestCity(e.target.value)}
                     placeholder="Singapore" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Kode Bandara Tujuan <span className="text-red-500">*</span></Label>
              <Input value={destAirport} onChange={e => setDestAirport(e.target.value.toUpperCase())}
                     placeholder="SIN" className="h-9 text-sm font-mono uppercase" maxLength={4} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Trade Type</Label>
              <Select value={tradeType} onValueChange={setTradeType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TRADE_TYPE_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Service Mode</Label>
              <Select value={serviceMode} onValueChange={setServiceMode}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_MODE_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Service Level</Label>
              <Select value={serviceLevel} onValueChange={setServiceLevel}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SERVICE_LEVEL_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Jenis Kargo</Label>
              <Select value={cargoType} onValueChange={setCargoType}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CARGO_TYPE_OPTS.map(o => <SelectItem key={o.v} value={o.v}>{o.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </section>

        {/* ── Kargo & Dimensi ──────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-4 h-4 text-sky-500" /> Detail Kargo
          </h2>

          {/* Komoditi */}
          <div>
            <Label className="text-xs text-gray-500 mb-1 block">Nama Komoditi / Barang <span className="text-red-500">*</span></Label>
            <Input value={commodity} onChange={e => setCommodity(e.target.value)}
                   placeholder="Contoh: Electronic Components" className="h-9 text-sm" />
          </div>

          {/* Dimensi rows */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-xs text-gray-500">Dimensi Koli (cm) & Berat</Label>
              <button
                type="button"
                onClick={() => setRows(p => [...p, newRow()])}
                className="text-xs text-sky-600 hover:text-sky-800 flex items-center gap-1 font-medium"
              >
                <Plus className="w-3 h-3" /> Tambah Koli
              </button>
            </div>
            <div className="space-y-2">
              {/* header */}
              <div className="grid grid-cols-12 gap-1 text-[10px] text-gray-400 font-medium px-1">
                <span className="col-span-2">P (cm)</span>
                <span className="col-span-2">L (cm)</span>
                <span className="col-span-2">T (cm)</span>
                <span className="col-span-2">Koli</span>
                <span className="col-span-3">GW (kg)</span>
                <span className="col-span-1" />
              </div>
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-12 gap-1 items-center">
                  <Input value={r.length} onChange={e => upd(r.id,"length",e.target.value)}
                         className="col-span-2 h-8 text-xs" placeholder="100" type="number" min="0" />
                  <Input value={r.width}  onChange={e => upd(r.id,"width", e.target.value)}
                         className="col-span-2 h-8 text-xs" placeholder="80"  type="number" min="0" />
                  <Input value={r.height} onChange={e => upd(r.id,"height",e.target.value)}
                         className="col-span-2 h-8 text-xs" placeholder="80"  type="number" min="0" />
                  <Input value={r.koli}   onChange={e => upd(r.id,"koli",  e.target.value)}
                         className="col-span-2 h-8 text-xs" placeholder="1"   type="number" min="1" />
                  <Input value={r.gross_weight} onChange={e => upd(r.id,"gross_weight",e.target.value)}
                         className="col-span-3 h-8 text-xs" placeholder="60"  type="number" min="0" step="0.1" />
                  <button
                    type="button"
                    onClick={() => setRows(p => p.filter(x => x.id !== r.id))}
                    className="col-span-1 flex items-center justify-center text-gray-300 hover:text-red-500 transition-colors"
                    disabled={rows.length === 1}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Weight summary */}
          {(totalGross > 0 || totalVolumetric > 0) && (
            <div className="rounded-xl bg-sky-50 border border-sky-100 p-3 grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-[10px] text-sky-600 font-semibold uppercase tracking-wide">Gross Weight</p>
                <p className="text-sm font-bold text-gray-900">{fmtNum(totalGross, 1)} kg</p>
              </div>
              <div>
                <p className="text-[10px] text-sky-600 font-semibold uppercase tracking-wide">Volumetric (1:167)</p>
                <p className="text-sm font-bold text-gray-900">{fmtNum(totalVolumetric, 1)} kg</p>
              </div>
              <div className="bg-sky-600 rounded-lg p-1">
                <p className="text-[10px] text-sky-100 font-semibold uppercase tracking-wide">Chargeable</p>
                <p className="text-sm font-bold text-white">{fmtNum(chargeableWeight, 1)} kg</p>
              </div>
            </div>
          )}

          {/* Hitung Estimasi */}
          <Button
            className="w-full bg-sky-600 hover:bg-sky-700 gap-2"
            onClick={() => void handleEstimate()}
            disabled={estimating}
          >
            {estimating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Weight className="w-4 h-4" />}
            Hitung Estimasi Harga
          </Button>
        </section>

        {/* ── Hasil Estimasi ───────────────────────────────────── */}
        {estimate && (
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <Plane className="w-4 h-4 text-sky-500" /> Pilih Opsi Rate
            </h2>

            {/* Weight summary */}
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div>
                <p className="text-gray-400">Gross Weight</p>
                <p className="font-semibold text-gray-800">{fmtNum(estimate.gross_weight, 1)} kg</p>
              </div>
              <div>
                <p className="text-gray-400">Volumetric</p>
                <p className="font-semibold text-gray-800">{fmtNum(estimate.volumetric_weight, 1)} kg</p>
              </div>
              <div>
                <p className="text-gray-400">Chargeable</p>
                <p className="font-bold text-sky-700">{fmtNum(estimate.chargeable_weight, 1)} kg</p>
              </div>
              <div>
                <p className="text-gray-400">Weight Break</p>
                <Badge className="text-[10px] bg-sky-100 text-sky-700 border-sky-200">{estimate.weight_break}</Badge>
              </div>
            </div>

            {estimate.options.length === 0 && (
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 text-center text-sm text-amber-700">
                Tidak ada rate tersedia untuk rute ini saat ini.
                Klik <strong>"Minta Penawaran Final"</strong> di bawah untuk request manual ke tim kami.
              </div>
            )}

            {estimate.options.map((opt) => {
              const sel = selectedRate?.rate_id === opt.rate_id;
              return (
                <div
                  key={opt.rate_id}
                  onClick={() => setSelectedRate(sel ? null : opt)}
                  className={`rounded-xl border-2 p-4 cursor-pointer transition-all ${
                    sel
                      ? "border-sky-500 bg-sky-50"
                      : "border-slate-200 hover:border-sky-300 bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-bold text-sm text-gray-900">{opt.airline || opt.rate_source_name}</p>
                      <p className="text-xs text-gray-500">
                        {opt.routing_type === "direct" ? "Penerbangan Langsung" : "Via Transit"}
                        {opt.transit_days != null ? ` • ${opt.transit_days} hari` : ""}
                        {opt.flight_number ? ` • ${opt.flight_number}` : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-sky-700">{IDR(opt.total_estimate_idr)}</p>
                      <p className="text-[10px] text-gray-400">Estimasi Total</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-gray-500 border-t border-gray-100 pt-2 mt-2">
                    <div>
                      <span className="text-gray-400">Rate/kg</span>
                      <p className="font-medium text-gray-700">{IDR(opt.rate_per_kg)}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">ETD</span>
                      <p className="font-medium text-gray-700">{opt.etd ?? "—"}</p>
                    </div>
                    <div>
                      <span className="text-gray-400">ETA</span>
                      <p className="font-medium text-gray-700">{opt.eta ?? "—"}</p>
                    </div>
                  </div>
                  {sel && (
                    <div className="flex items-center gap-1 mt-2 text-xs text-sky-600 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Dipilih
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* ── Data Kontak ──────────────────────────────────────── */}
        <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <User className="w-4 h-4 text-sky-500" /> Data Pemesan
          </h2>
          <div className="grid grid-cols-1 gap-3">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Nama <span className="text-red-500">*</span></Label>
              <Input value={custName}  onChange={e => setCustName(e.target.value)}
                     placeholder="Nama lengkap" className="h-9 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Nomor WhatsApp <span className="text-red-500">*</span></Label>
              <Input value={custPhone} onChange={e => setCustPhone(e.target.value)}
                     placeholder="08xx-xxxx-xxxx" className="h-9 text-sm" type="tel" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Email</Label>
              <Input value={custEmail} onChange={e => setCustEmail(e.target.value)}
                     placeholder="email@company.com" className="h-9 text-sm" type="email" />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Catatan Tambahan</Label>
              <Input value={notes} onChange={e => setNotes(e.target.value)}
                     placeholder="Opsional" className="h-9 text-sm" />
            </div>
          </div>
        </section>

        {/* ── Submit ───────────────────────────────────────────── */}
        <div className="pb-8">
          <Button
            className="w-full h-12 text-base bg-sky-600 hover:bg-sky-700 gap-2 shadow-lg"
            onClick={() => void handleSubmit()}
            disabled={submitting}
          >
            {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ChevronRight className="w-5 h-5" />}
            Minta Penawaran Final
          </Button>
          <p className="text-xs text-center text-gray-400 mt-2">
            {selectedRate
              ? `Estimasi rate dipilih: ${selectedRate.airline || selectedRate.rate_source_name}`
              : "Tim kami akan menghubungi Anda dengan harga final melalui WhatsApp"}
          </p>
        </div>

      </div>
    </div>
  );
}
