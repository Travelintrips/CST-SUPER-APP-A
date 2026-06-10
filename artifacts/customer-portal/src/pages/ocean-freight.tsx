import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Ship, ArrowLeft, ChevronRight, Loader2, CheckCircle2, Package,
  Clock, ArrowRight, Info, Anchor, Container,
} from "lucide-react";

/* ─── Constants ──────────────────────────────────────────────── */
const TRADE_TYPES = [
  { v: "domestic",     l: "Domestic" },
  { v: "export",       l: "Export" },
  { v: "import",       l: "Import" },
  { v: "cross_border", l: "Cross Border" },
];
const SERVICE_MODES = [
  { v: "port_to_port",  l: "Port to Port" },
  { v: "door_to_port",  l: "Door to Port" },
  { v: "port_to_door",  l: "Port to Door" },
  { v: "door_to_door",  l: "Door to Door" },
];
const CONTAINER_TYPES = [
  { v: "20ft",      l: "20ft GP",      cbm: 25,  payload: 21800 },
  { v: "40ft",      l: "40ft GP",      cbm: 55,  payload: 26480 },
  { v: "40HC",      l: "40HC",         cbm: 65,  payload: 26480 },
  { v: "reefer_20", l: "Reefer 20ft",  cbm: 25,  payload: 20400 },
  { v: "reefer_40", l: "Reefer 40ft",  cbm: 56,  payload: 24760 },
  { v: "open_top",  l: "Open Top 20ft",cbm: 25,  payload: 21600 },
  { v: "flat_rack", l: "Flat Rack 20ft",cbm: null,payload: 24000 },
];
const CARGO_CONDITIONS = [
  { v: "general",    l: "General Cargo" },
  { v: "dg",         l: "DG Cargo" },
  { v: "reefer",     l: "Reefer" },
  { v: "fragile",    l: "Fragile" },
  { v: "oversize",   l: "Oversize" },
  { v: "high_value", l: "High Value" },
];
const INCOTERMS = ["EXW","FOB","CFR","CIF","DAP","DDP"];
const ADDITIONAL_SERVICES = [
  "Trucking Pickup","Trucking Delivery","Customs Clearance","Insurance",
  "Fumigation","COO / Certificate","Warehouse Handling","Stuffing",
  "Unstuffing","Surveyor","Document Handling",
];

/* ─── Helpers ────────────────────────────────────────────────── */
const IDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

interface EstimateOption {
  estimate_option: string;
  rate_id: number;
  rate_source_name: string;
  carrier: string;
  route: string;
  shipment_type: string;
  service_mode: string;
  container_type: string | null;
  container_qty: number | null;
  transit_days: number | null;
  direct_or_transshipment: string;
  total_estimate: number;
  currency: string;
  total_estimate_idr: number;
  price_status: string;
  validity: string;
  breakdown: Record<string, number | string>;
}

/* ─── Main Page ──────────────────────────────────────────────── */
export default function OceanFreightPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Step control
  const [step, setStep] = useState<"selector" | "form" | "results" | "selected" | "confirm" | "success">("selector");

  // Route state
  const [originCity,      setOriginCity]      = useState("Surabaya");
  const [originPort,      setOriginPort]       = useState("Tanjung Perak");
  const [destCity,        setDestCity]         = useState("Singapore");
  const [destPort,        setDestPort]         = useState("PSA Singapore");
  const [tradeType,       setTradeType]        = useState("export");
  const [serviceMode,     setServiceMode]      = useState("port_to_port");
  const [shipmentType,    setShipmentType]     = useState("FCL");
  const [containerType,   setContainerType]    = useState("20ft");
  const [containerQty,    setContainerQty]     = useState("1");
  const [totalCbm,        setTotalCbm]         = useState("");
  const [grossWeight,     setGrossWeight]      = useState("");
  const [koli,            setKoli]             = useState("");
  const [commodity,       setCommodity]        = useState("General Cargo");
  const [hsCode,          setHsCode]           = useState("");
  const [cargoCondition,  setCargoCondition]   = useState("general");
  const [incoterm,        setIncoterm]         = useState("FOB");
  const [etdPreferred,    setEtdPreferred]     = useState("");
  const [additionalSvcs,  setAdditionalSvcs]   = useState<string[]>([]);

  // Customer info
  const [custName,    setCustName]    = useState("");
  const [custPhone,   setCustPhone]   = useState("");
  const [custEmail,   setCustEmail]   = useState("");
  const [custCompany, setCustCompany] = useState("");
  const [custNotes,   setCustNotes]   = useState("");

  // Results
  const [loading,          setLoading]          = useState(false);
  const [estimateResults,  setEstimateResults]  = useState<EstimateOption[]>([]);
  const [noRates,          setNoRates]          = useState(false);
  const [selectedOption,   setSelectedOption]   = useState<EstimateOption | null>(null);
  const [submitting,       setSubmitting]       = useState(false);
  const [successOrder,     setSuccessOrder]     = useState("");

  const containerInfo = CONTAINER_TYPES.find(c => c.v === containerType);

  function toggleService(svc: string) {
    setAdditionalSvcs(prev =>
      prev.includes(svc) ? prev.filter(s => s !== svc) : [...prev, svc]
    );
  }

  function validateForm(): string | null {
    if (!originPort.trim()) return "Port of Loading wajib diisi";
    if (!destPort.trim())   return "Port of Discharge wajib diisi";
    if (shipmentType === "FCL") {
      if (!containerType) return "Tipe container wajib dipilih";
      if (Number(containerQty) < 1) return "Jumlah container minimal 1";
    }
    if (shipmentType === "LCL" && !totalCbm && !grossWeight) return "Total CBM atau Gross Weight wajib diisi untuk LCL";
    return null;
  }

  async function handleEstimate() {
    const err = validateForm();
    if (err) { toast({ title: "Error", description: err, variant: "destructive" }); return; }
    setLoading(true);
    setNoRates(false);
    try {
      const res = await fetch("/api/ocean-freight-public/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin_city: originCity, origin_port: originPort,
          destination_city: destCity, destination_port: destPort,
          trade_type: tradeType, service_mode: serviceMode,
          shipment_type: shipmentType, container_type: containerType,
          container_qty: Number(containerQty), total_cbm: Number(totalCbm || 0),
          gross_weight: Number(grossWeight || 0),
          cargo_condition: cargoCondition,
          selected_additional_services: additionalSvcs,
        }),
      });
      const data = await res.json();
      if (data.options && data.options.length > 0) {
        setEstimateResults(data.options);
        setStep("results");
      } else {
        setNoRates(true);
        setEstimateResults([]);
        setStep("results");
      }
    } catch {
      toast({ title: "Error", description: "Gagal menghitung estimasi", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmitInquiry() {
    if (!custName.trim()) { toast({ title: "Error", description: "Nama customer wajib diisi", variant: "destructive" }); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/ocean-freight-public/inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin_city: originCity, origin_port: originPort,
          destination_city: destCity, destination_port: destPort,
          trade_type: tradeType, service_mode: serviceMode,
          shipment_type: shipmentType, container_type: containerType,
          container_qty: Number(containerQty), total_cbm: Number(totalCbm || 0),
          gross_weight: Number(grossWeight || 0), koli: Number(koli || 0),
          commodity, hs_code: hsCode, cargo_condition: cargoCondition,
          incoterm, etd_preferred: etdPreferred,
          selected_additional_services: additionalSvcs,
          selected_estimate_option: selectedOption?.estimate_option,
          estimated_price: selectedOption?.total_estimate,
          estimated_price_idr: selectedOption?.total_estimate_idr,
          currency: selectedOption?.currency ?? "IDR",
          pricing_breakdown: selectedOption?.breakdown,
          selected_rate_id: selectedOption?.rate_id,
          customer_name: custName, customer_phone: custPhone,
          customer_email: custEmail, customer_company: custCompany,
          customer_notes: custNotes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Gagal submit");
      setSuccessOrder(data.order_number);
      setStep("success");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── UI ─────────────────────────────────────────────────────── */
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-950 to-blue-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-lg w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Inquiry Terkirim!</h2>
          <p className="text-gray-600 mb-2">No. Order: <span className="font-bold text-blue-700">{successOrder}</span></p>
          <p className="text-gray-600 mb-6">
            Permintaan penawaran Ocean Freight berhasil dikirim.<br/>
            Tim kami akan mengirim harga final setelah mendapatkan konfirmasi dari shipping line / partner.
          </p>
          <Button className="bg-blue-700 hover:bg-blue-800 text-white" onClick={() => setLocation("/")}>
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800">
      {/* Header */}
      <div className="bg-blue-950/80 backdrop-blur border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-white/70 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Ship className="w-6 h-6 text-blue-300" />
          <div>
            <h1 className="text-white font-bold text-lg leading-tight">Ocean Freight</h1>
            <p className="text-blue-300 text-xs">FCL · LCL · Export · Import · Cross Border</p>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* ── Selector Panel ── */}
        <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-4">
          {/* Trade Type */}
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Trade Type</p>
            <div className="flex flex-wrap gap-2">
              {TRADE_TYPES.map(t => (
                <button key={t.v}
                  onClick={() => setTradeType(t.v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tradeType === t.v ? "bg-blue-500 text-white shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >{t.l}</button>
              ))}
            </div>
          </div>

          {/* Service Mode */}
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Service Mode</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_MODES.map(m => (
                <button key={m.v}
                  onClick={() => setServiceMode(m.v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    serviceMode === m.v ? "bg-blue-500 text-white shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >{m.l}</button>
              ))}
            </div>
          </div>

          {/* Shipment Type */}
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Shipment Type</p>
            <div className="flex gap-2">
              {["FCL","LCL"].map(t => (
                <button key={t} onClick={() => setShipmentType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    shipmentType === t ? "bg-blue-500 text-white shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}
                >{t}</button>
              ))}
            </div>
          </div>

          {/* Route */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-white/70 text-xs mb-1">Origin City</p>
              <input value={originCity} onChange={e => setOriginCity(e.target.value)} placeholder="Surabaya"
                className="w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <p className="text-white/70 text-xs mb-1">Port of Loading (POL)</p>
              <input value={originPort} onChange={e => setOriginPort(e.target.value)} placeholder="Tanjung Perak"
                className="w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <p className="text-white/70 text-xs mb-1">Destination City</p>
              <input value={destCity} onChange={e => setDestCity(e.target.value)} placeholder="Singapore"
                className="w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <p className="text-white/70 text-xs mb-1">Port of Discharge (POD)</p>
              <input value={destPort} onChange={e => setDestPort(e.target.value)} placeholder="PSA Singapore"
                className="w-full bg-white/10 text-white placeholder-white/40 border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
            </div>
          </div>
        </div>

        {/* ── Visual: Container / Ship ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Container info */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
            <div className="w-24 h-16 bg-blue-500/30 rounded-xl flex items-center justify-center border-2 border-blue-400/50">
              <Container className="w-10 h-10 text-blue-300" />
            </div>
            {shipmentType === "FCL" && containerInfo && (
              <div className="text-center">
                <p className="text-white font-bold text-lg">{containerInfo.l}</p>
                {containerInfo.cbm && <p className="text-blue-300 text-sm">Volume: {containerInfo.cbm} CBM</p>}
                <p className="text-blue-300 text-sm">Max Payload: {containerInfo.payload.toLocaleString("id-ID")} kg</p>
                <p className="text-white/50 text-xs mt-1">Dimensi dan transit time adalah estimasi. Detail final mengikuti konfirmasi carrier/shipping line.</p>
              </div>
            )}
            {shipmentType === "LCL" && (
              <div className="text-center">
                <p className="text-white font-bold">LCL Cargo</p>
                <p className="text-blue-300 text-sm">Less than Container Load</p>
                <p className="text-white/50 text-xs mt-1">Rate berdasarkan CBM yang terisi</p>
              </div>
            )}
          </div>

          {/* FCL container selector / LCL fields */}
          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-3">
            {shipmentType === "FCL" ? (
              <>
                <p className="text-white/70 text-xs uppercase tracking-wider">Container Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {CONTAINER_TYPES.map(ct => (
                    <button key={ct.v} onClick={() => setContainerType(ct.v)}
                      className={`p-2 rounded-lg text-xs font-medium transition-all text-left ${
                        containerType === ct.v ? "bg-blue-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
                      }`}
                    >{ct.l}</button>
                  ))}
                </div>
                <div>
                  <p className="text-white/70 text-xs mb-1">Jumlah Container</p>
                  <input type="number" min="1" value={containerQty} onChange={e => setContainerQty(e.target.value)}
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </>
            ) : (
              <>
                <p className="text-white/70 text-xs uppercase tracking-wider">LCL Detail</p>
                <div className="space-y-2">
                  <div>
                    <p className="text-white/70 text-xs mb-1">Total CBM</p>
                    <input type="number" min="0" step="0.01" value={totalCbm} onChange={e => setTotalCbm(e.target.value)} placeholder="0.00"
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <p className="text-white/70 text-xs mb-1">Gross Weight (kg)</p>
                    <input type="number" min="0" value={grossWeight} onChange={e => setGrossWeight(e.target.value)} placeholder="0"
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                  <div>
                    <p className="text-white/70 text-xs mb-1">Jumlah Koli</p>
                    <input type="number" min="0" value={koli} onChange={e => setKoli(e.target.value)} placeholder="0"
                      className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Extended Form (shown when step === "form") ── */}
        {(step === "form" || step === "results" || step === "selected") && (
          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-5">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">Detail Pengiriman</h3>

            {/* Cargo */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/70 text-xs mb-1">Commodity</p>
                <input value={commodity} onChange={e => setCommodity(e.target.value)} placeholder="General Cargo"
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <p className="text-white/70 text-xs mb-1">HS Code (opsional)</p>
                <input value={hsCode} onChange={e => setHsCode(e.target.value)} placeholder="0000.00"
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>
            </div>

            {/* Cargo condition */}
            <div>
              <p className="text-white/70 text-xs mb-2">Cargo Condition</p>
              <div className="flex flex-wrap gap-2">
                {CARGO_CONDITIONS.map(cc => (
                  <button key={cc.v} onClick={() => setCargoCondition(cc.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      cargoCondition === cc.v ? "bg-blue-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
                    }`}
                  >{cc.l}</button>
                ))}
              </div>
            </div>

            {/* Incoterm + ETD */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-white/70 text-xs mb-1">Incoterm</p>
                <select value={incoterm} onChange={e => setIncoterm(e.target.value)}
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400">
                  {INCOTERMS.map(i => <option key={i} value={i} className="bg-blue-900">{i}</option>)}
                </select>
              </div>
              <div>
                <p className="text-white/70 text-xs mb-1">ETD Preferred</p>
                <input type="date" value={etdPreferred} onChange={e => setEtdPreferred(e.target.value)}
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
              </div>
            </div>

            {/* Additional services */}
            <div>
              <p className="text-white/70 text-xs mb-2 uppercase tracking-wider">Layanan Tambahan</p>
              <div className="grid grid-cols-2 gap-2">
                {ADDITIONAL_SERVICES.map(svc => (
                  <label key={svc} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox
                      checked={additionalSvcs.includes(svc)}
                      onCheckedChange={() => toggleService(svc)}
                      className="border-white/40 data-[state=checked]:bg-blue-500"
                    />
                    <span className="text-white/80 text-xs">{svc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CTA Button ── */}
        {step === "selector" && (
          <Button
            onClick={() => setStep("form")}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-base"
          >
            Cek Estimasi <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        )}

        {(step === "form") && (
          <Button
            onClick={handleEstimate}
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-base"
          >
            {loading ? <><Loader2 className="mr-2 w-5 h-5 animate-spin" />Menghitung...</> : <>Hitung Estimasi <ChevronRight className="ml-2 w-5 h-5" /></>}
          </Button>
        )}

        {/* ── Estimate Results ── */}
        {step === "results" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-white font-bold text-lg">Hasil Estimasi</h2>
              <button onClick={handleEstimate} disabled={loading}
                className="text-blue-300 text-sm hover:text-white flex items-center gap-1">
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Hitung Ulang
              </button>
            </div>

            {noRates ? (
              <div className="bg-white/10 rounded-2xl p-6 text-center">
                <Anchor className="w-10 h-10 text-blue-300 mx-auto mb-3" />
                <p className="text-white font-semibold">Tidak ada rate tersedia untuk rute ini</p>
                <p className="text-white/60 text-sm mt-1">Silakan submit inquiry untuk mendapatkan penawaran manual dari tim kami.</p>
                <Button className="mt-4 bg-blue-500 hover:bg-blue-400 text-white" onClick={() => setStep("selected")}>
                  Minta Penawaran Manual
                </Button>
              </div>
            ) : (
              <>
                <div className="grid gap-4 md:grid-cols-3">
                  {estimateResults.map(opt => (
                    <div key={opt.estimate_option}
                      className={`bg-white rounded-xl shadow-lg p-5 cursor-pointer border-2 transition-all ${
                        selectedOption?.estimate_option === opt.estimate_option
                          ? "border-blue-500 ring-2 ring-blue-200"
                          : "border-transparent hover:border-blue-200"
                      }`}
                      onClick={() => setSelectedOption(opt)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Badge className={
                          opt.estimate_option === "Economy"  ? "bg-green-100 text-green-700" :
                          opt.estimate_option === "Priority" ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        }>
                          {opt.estimate_option}
                        </Badge>
                        <span className="text-xs text-gray-500">Estimasi Awal</span>
                      </div>
                      <p className="font-semibold text-gray-700 text-sm">{opt.carrier ?? opt.rate_source_name}</p>
                      <p className="text-gray-500 text-xs">{opt.route}</p>
                      <p className="text-gray-500 text-xs capitalize">{opt.service_mode?.replace(/_/g, " ")} · {opt.direct_or_transshipment}</p>
                      {opt.transit_days && (
                        <div className="flex items-center gap-1 mt-2 text-gray-500 text-xs">
                          <Clock className="w-3 h-3" /> {opt.transit_days} hari
                        </div>
                      )}
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xl font-bold text-blue-700">
                          {opt.currency !== "IDR"
                            ? `${opt.currency} ${opt.total_estimate.toLocaleString("id-ID")}`
                            : IDR(opt.total_estimate)
                          }
                        </p>
                        {opt.currency !== "IDR" && (
                          <p className="text-xs text-gray-500">≈ {IDR(opt.total_estimate_idr)}</p>
                        )}
                        {opt.validity && (
                          <p className="text-xs text-gray-400 mt-1">Valid s/d {opt.validity}</p>
                        )}
                      </div>
                      <Button
                        className={`w-full mt-3 text-sm ${selectedOption?.estimate_option === opt.estimate_option ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"}`}
                        onClick={e => { e.stopPropagation(); setSelectedOption(opt); setStep("selected"); }}
                      >
                        Pilih Estimasi Ini
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-white/50 text-xs text-center">
                  Harga ini adalah estimasi awal. Harga final akan dikonfirmasi setelah admin/vendor mendapatkan konfirmasi dari shipping line, NVOCC, co-loader, atau partner.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── Selected Breakdown ── */}
        {step === "selected" && selectedOption && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl shadow-lg p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-800">Breakdown Estimasi</h3>
                <Badge className="bg-blue-100 text-blue-700">{selectedOption.estimate_option}</Badge>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  ["Ocean Freight",       selectedOption.breakdown.ocean_freight],
                  ["Origin Charges",      selectedOption.breakdown.origin_charges],
                  ["Destination Charges", selectedOption.breakdown.destination_charges],
                  ["Document Charges",    selectedOption.breakdown.document_charges],
                  ["Trucking Pickup",     selectedOption.breakdown.trucking_pickup],
                  ["Trucking Delivery",   selectedOption.breakdown.trucking_delivery],
                  ["Customs Clearance",   selectedOption.breakdown.customs_clearance],
                  ["DG Surcharge",        selectedOption.breakdown.dg_surcharge],
                  ["Reefer Surcharge",    selectedOption.breakdown.reefer_surcharge],
                  ["Peak Season Surcharge",selectedOption.breakdown.peak_season_surcharge],
                ].filter(([, v]) => v && Number(v) > 0).map(([label, val]) => (
                  <div key={label as string} className="flex justify-between text-gray-600">
                    <span>{label as string}</span>
                    <span>
                      {selectedOption.currency !== "IDR"
                        ? `${selectedOption.currency} ${Number(val).toLocaleString("id-ID")}`
                        : IDR(Number(val))
                      }
                    </span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold text-gray-800 text-base">
                  <span>Total Estimasi</span>
                  <span className="text-blue-700">
                    {selectedOption.currency !== "IDR"
                      ? `${selectedOption.currency} ${selectedOption.total_estimate.toLocaleString("id-ID")}`
                      : IDR(selectedOption.total_estimate)
                    }
                  </span>
                </div>
                {selectedOption.currency !== "IDR" && (
                  <p className="text-xs text-gray-500 text-right">≈ {IDR(selectedOption.total_estimate_idr)}</p>
                )}
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg flex gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Harga ini adalah estimasi awal. Harga final akan dikonfirmasi setelah admin/vendor mendapatkan konfirmasi dari shipping line, NVOCC, co-loader, atau partner.</p>
              </div>
            </div>

            {/* Customer form */}
            <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-3">
              <h3 className="text-white font-bold text-sm uppercase tracking-wider">Data Anda</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-white/70 text-xs mb-1">Nama *</p>
                  <input value={custName} onChange={e => setCustName(e.target.value)} placeholder="Nama lengkap"
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <p className="text-white/70 text-xs mb-1">No. HP / WhatsApp</p>
                  <input value={custPhone} onChange={e => setCustPhone(e.target.value)} placeholder="08xx"
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <p className="text-white/70 text-xs mb-1">Email</p>
                  <input type="email" value={custEmail} onChange={e => setCustEmail(e.target.value)} placeholder="email@domain.com"
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <p className="text-white/70 text-xs mb-1">Perusahaan</p>
                  <input value={custCompany} onChange={e => setCustCompany(e.target.value)} placeholder="PT ..."
                    className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div>
                <p className="text-white/70 text-xs mb-1">Catatan Tambahan</p>
                <textarea value={custNotes} onChange={e => setCustNotes(e.target.value)} rows={2} placeholder="Instruksi khusus..."
                  className="w-full bg-white/10 text-white border border-white/20 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-none" />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep("results")}
                className="border-white/30 text-white hover:bg-white/10">
                <ArrowLeft className="w-4 h-4 mr-1" /> Kembali
              </Button>
              <Button
                onClick={handleSubmitInquiry}
                disabled={submitting}
                className="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl"
              >
                {submitting
                  ? <><Loader2 className="mr-2 w-5 h-5 animate-spin" />Mengirim...</>
                  : <>Minta Penawaran Final <ArrowRight className="ml-2 w-5 h-5" /></>
                }
              </Button>
            </div>
          </div>
        )}

        {/* No estimate yet but want to submit directly */}
        {(step === "results" && noRates) && null}

      </div>
    </div>
  );
}
