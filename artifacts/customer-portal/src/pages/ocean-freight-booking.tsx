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
  Ship, ArrowLeft, Plus, Trash2, RefreshCw, CheckCircle2, MapPin,
  User, Loader2, Package, ChevronDown, Anchor,
} from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

/* ─── Types ──────────────────────────────────────────────── */
interface EstimateOption {
  estimate_option: string;
  rate_id: number;
  carrier: string;
  route: string;
  shipment_type: string;
  container_type: string | null;
  transit_days: number | null;
  direct_or_transshipment: string;
  base_ocean_freight: number;
  origin_charges: number;
  destination_charges: number;
  document_charges: number;
  trucking_charges: number;
  customs_charges: number;
  surcharge_breakdown: Record<string, number>;
  total_estimate: number;
  currency: string;
  total_estimate_idr: number;
  exchange_rate_to_idr: number;
  price_status: string;
  validity: string;
}

/* ─── Helpers ────────────────────────────────────────────── */
const IDR = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
const fmtNum = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

const OPTION_LABEL: Record<string, { label: string; color: string; desc: string }> = {
  economy:  { label: "Ekonomi",  color: "text-green-400 border-green-700 bg-green-900/20", desc: "Harga paling terjangkau" },
  standard: { label: "Standar",  color: "text-blue-400 border-blue-700 bg-blue-900/20", desc: "Keseimbangan harga & waktu" },
  priority: { label: "Prioritas",color: "text-orange-400 border-orange-700 bg-orange-900/20", desc: "Transit tercepat" },
};

const PORTS = [
  "Tanjung Priok", "Tanjung Perak", "Tanjung Emas", "Soekarno-Hatta Makassar",
  "Belawan", "Kariangau", "Dwikora", "PSA Singapore", "Port Klang",
  "Penang Port", "Laem Chabang", "Yangshan", "Ningbo", "Kwai Tsing",
  "Busan New Port", "Tokyo Port", "Jebel Ali", "Rotterdam", "Hamburg", "Long Beach",
];
const CONTAINER_TYPES = ["20ft", "40ft", "40HC", "Reefer 20ft", "Reefer 40ft", "Open Top", "Flat Rack"];
const TRADE_TYPES = [{ v: "export", l: "Export" }, { v: "import", l: "Import" }, { v: "domestic", l: "Domestic" }, { v: "cross_border", l: "Cross Border" }];
const SERVICE_MODES = [{ v: "port_to_port", l: "Port to Port" }, { v: "door_to_port", l: "Door to Port" }, { v: "port_to_door", l: "Port to Door" }, { v: "door_to_door", l: "Door to Door" }];
const CARGO_CONDITIONS = [{ v: "general", l: "General Cargo" }, { v: "dg", l: "DG Cargo" }, { v: "reefer", l: "Reefer" }, { v: "fragile", l: "Fragile" }, { v: "oversize", l: "Oversize" }, { v: "high_value", l: "High Value" }];
const ADDITIONAL_SERVICES = [
  { v: "trucking_pickup", l: "Trucking Pickup" }, { v: "trucking_delivery", l: "Trucking Delivery" },
  { v: "customs_clearance", l: "Customs Clearance" }, { v: "insurance", l: "Insurance" },
  { v: "fumigation", l: "Fumigation" }, { v: "coo_certificate", l: "COO / Certificate" },
  { v: "warehouse_handling", l: "Warehouse Handling" },
];

/* ─── Main Component ─────────────────────────────────────── */
export default function OceanFreightBookingPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: me } = useGetPortalMe({ query: { retry: false } });

  // Step: "form" | "results" | "inquiry" | "success"
  const [step, setStep] = useState<"form" | "results" | "inquiry" | "success">("form");
  const [loading, setLoading]   = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  // Route
  const [originCity,      setOriginCity]      = useState("Jakarta");
  const [originPort,      setOriginPort]       = useState("Tanjung Priok");
  const [destCity,        setDestCity]         = useState("");
  const [destPort,        setDestPort]         = useState("");
  const [tradeType,       setTradeType]        = useState("export");
  const [serviceMode,     setServiceMode]      = useState("port_to_port");

  // Cargo
  const [shipmentType,    setShipmentType]     = useState("FCL");
  const [containerType,   setContainerType]    = useState("20ft");
  const [containerQty,    setContainerQty]     = useState(1);
  const [totalCbm,        setTotalCbm]         = useState("");
  const [grossWeight,     setGrossWeight]      = useState("");
  const [koli,            setKoli]             = useState("");
  const [commodity,       setCommodity]        = useState("");
  const [cargoCondition,  setCargoCondition]   = useState("general");
  const [incoterm,        setIncoterm]         = useState("");
  const [etdPreferred,    setEtdPreferred]     = useState("");
  const [selectedSvc,     setSelectedSvc]      = useState<string[]>([]);
  const toggleSvc = (v: string) => setSelectedSvc(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);

  // Results
  const [options,         setOptions]          = useState<EstimateOption[]>([]);
  const [noRates,         setNoRates]          = useState(false);
  const [selectedOption,  setSelectedOption]   = useState<EstimateOption | null>(null);
  const [showBreakdown,   setShowBreakdown]    = useState(false);

  // Inquiry form
  const [custName,        setCustName]         = useState((me as any)?.name ?? "");
  const [custPhone,       setCustPhone]        = useState((me as any)?.phone ?? "");
  const [custEmail,       setCustEmail]        = useState((me as any)?.email ?? "");
  const [custCompany,     setCustCompany]      = useState("");

  async function handleCalculate() {
    if (!originPort || !destPort) return toast({ title: "Isi origin dan destination port", variant: "destructive" });
    if (shipmentType === "FCL" && !containerType) return toast({ title: "Pilih container type", variant: "destructive" });
    if (shipmentType === "LCL" && !totalCbm && !grossWeight) return toast({ title: "Isi CBM atau gross weight", variant: "destructive" });

    setLoading(true);
    try {
      const body = {
        origin_city: originCity, origin_port: originPort,
        destination_city: destCity, destination_port: destPort,
        trade_type: tradeType, service_mode: serviceMode,
        shipment_type: shipmentType,
        container_type: shipmentType === "FCL" ? containerType : null,
        container_qty: shipmentType === "FCL" ? containerQty : 1,
        total_cbm: totalCbm ? Number(totalCbm) : null,
        gross_weight: grossWeight ? Number(grossWeight) : null,
        cargo_condition: cargoCondition,
        selected_additional_services: selectedSvc,
      };
      const r = await fetch("/api/ocean-freight/calculate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      if (!d.options || d.options.length === 0) { setNoRates(true); setOptions([]); }
      else { setOptions(d.options); setNoRates(false); }
      setStep("results");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  async function handleSubmitInquiry() {
    if (!custName) return toast({ title: "Nama wajib diisi", variant: "destructive" });
    if (!custPhone && !custEmail) return toast({ title: "Phone atau email wajib diisi", variant: "destructive" });

    setLoading(true);
    try {
      const body = {
        origin_city: originCity, origin_port: originPort,
        destination_city: destCity, destination_port: destPort,
        trade_type: tradeType, service_mode: serviceMode,
        shipment_type: shipmentType,
        container_type: shipmentType === "FCL" ? containerType : null,
        container_qty: shipmentType === "FCL" ? containerQty : 1,
        total_cbm: totalCbm ? Number(totalCbm) : null,
        gross_weight: grossWeight ? Number(grossWeight) : null,
        koli: koli ? Number(koli) : null,
        commodity, cargo_condition: cargoCondition,
        incoterm, etd_preferred: etdPreferred,
        selected_additional_services: selectedSvc,
        selected_estimate_option: selectedOption?.estimate_option ?? null,
        selected_rate_id: selectedOption?.rate_id ?? null,
        estimated_price: selectedOption?.total_estimate ?? null,
        estimated_price_idr: selectedOption?.total_estimate_idr ?? null,
        currency: selectedOption?.currency ?? "IDR",
        pricing_breakdown: selectedOption ?? null,
        candidate_rate_ids: options.map(o => o.rate_id),
        customer_name: custName, customer_phone: custPhone,
        customer_email: custEmail,
      };
      const r = await fetch("/api/ocean-freight/inquiry", { method: "POST", headers: { "Content-Type": "application/json", ...(getAuthToken() ? { Authorization: `Bearer ${getAuthToken()}` } : {}) }, body: JSON.stringify(body) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setOrderNumber(d.order_number);
      setStep("success");
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  }

  /* ─ Success ── */
  if (step === "success") return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-16 h-16 bg-green-600 rounded-full flex items-center justify-center mx-auto">
          <CheckCircle2 className="h-8 w-8 text-white" />
        </div>
        <h2 className="text-2xl font-bold text-white">Inquiry Terkirim!</h2>
        <p className="text-gray-400">Tim kami akan mengkonfirmasi penawaran final dan menghubungi Anda segera.</p>
        <div className="bg-gray-800/60 rounded-lg p-4">
          <p className="text-gray-400 text-sm">Nomor Order</p>
          <p className="text-white font-mono text-lg font-bold">{orderNumber}</p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="flex-1 border-gray-600 text-gray-300" onClick={() => setLocation(`/ocean-freight/track/${orderNumber}`)}>
            <MapPin className="h-4 w-4 mr-2" /> Tracking
          </Button>
          <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={() => { setStep("form"); setOptions([]); setSelectedOption(null); setOrderNumber(""); }}>
            Order Lagi
          </Button>
        </div>
      </div>
    </div>
  );

  /* ─ Inquiry Form ── */
  if (step === "inquiry") return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        <button onClick={() => setStep("results")} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Estimasi
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center"><User className="h-5 w-5 text-white" /></div>
          <div>
            <h2 className="text-xl font-bold text-white">Data Pengirim</h2>
            {selectedOption && <p className="text-gray-400 text-sm">Estimasi: {IDR(selectedOption.total_estimate_idr)} ({OPTION_LABEL[selectedOption.estimate_option]?.label})</p>}
          </div>
        </div>

        <div className="space-y-4 bg-gray-900 rounded-xl p-6">
          <div>
            <Label className="text-gray-400 text-sm">Nama Lengkap *</Label>
            <Input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="John Doe" className="mt-1 bg-gray-800 border-gray-600 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-sm">No. HP / WhatsApp *</Label>
            <Input value={custPhone} onChange={(e) => setCustPhone(e.target.value)} placeholder="+62812..." className="mt-1 bg-gray-800 border-gray-600 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-sm">Email</Label>
            <Input value={custEmail} onChange={(e) => setCustEmail(e.target.value)} placeholder="email@domain.com" className="mt-1 bg-gray-800 border-gray-600 text-white" />
          </div>
          <div>
            <Label className="text-gray-400 text-sm">Perusahaan</Label>
            <Input value={custCompany} onChange={(e) => setCustCompany(e.target.value)} placeholder="PT ..." className="mt-1 bg-gray-800 border-gray-600 text-white" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-gray-400 text-sm">Incoterm</Label>
              <Select value={incoterm} onValueChange={setIncoterm}>
                <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue placeholder="Pilih..." /></SelectTrigger>
                <SelectContent className="bg-gray-800 border-gray-700">
                  {["EXW","FOB","CFR/CNF","CIF","DAP","DDP"].map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-gray-400 text-sm">Target ETD</Label>
              <Input type="date" value={etdPreferred} onChange={(e) => setEtdPreferred(e.target.value)} className="mt-1 bg-gray-800 border-gray-600 text-white" />
            </div>
          </div>
          <div>
            <Label className="text-gray-400 text-sm">Komoditas</Label>
            <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="Nama barang..." className="mt-1 bg-gray-800 border-gray-600 text-white" />
          </div>

          <Button onClick={handleSubmitInquiry} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 py-3">
            {loading ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Send className="h-5 w-5 mr-2" />}
            {loading ? "Mengirim..." : "Kirim Request Penawaran"}
          </Button>
          <p className="text-gray-500 text-xs text-center">Tim kami akan menghubungi Anda untuk konfirmasi harga final dalam 1×24 jam</p>
        </div>
      </div>
    </div>
  );

  /* ─ Results ── */
  if (step === "results") return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <button onClick={() => setStep("form")} className="flex items-center gap-2 text-gray-400 hover:text-white text-sm">
          <ArrowLeft className="h-4 w-4" /> Ubah Pencarian
        </button>

        <div>
          <h2 className="text-xl font-bold text-white">Estimasi Ocean Freight</h2>
          <p className="text-gray-400 text-sm mt-1">{originPort} → {destPort} · {shipmentType}{shipmentType === "FCL" ? ` / ${containerType} × ${containerQty}` : ` / ${totalCbm} CBM`}</p>
        </div>

        {noRates ? (
          <div className="bg-gray-900 rounded-xl p-8 text-center space-y-4">
            <Ship className="h-12 w-12 text-gray-600 mx-auto" />
            <h3 className="text-white font-semibold">Rate Belum Tersedia</h3>
            <p className="text-gray-400 text-sm">Kami belum memiliki rate untuk rute ini. Tim kami akan mencari penawaran terbaik untuk Anda.</p>
            <Button onClick={() => setStep("inquiry")} className="bg-blue-600 hover:bg-blue-700">
              Minta Penawaran Manual
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {options.map((opt) => {
              const meta = OPTION_LABEL[opt.estimate_option] ?? { label: opt.estimate_option, color: "text-blue-400 border-blue-700 bg-blue-900/20", desc: "" };
              const isSelected = selectedOption?.rate_id === opt.rate_id;
              return (
                <div key={opt.rate_id} className={`bg-gray-900 rounded-xl border cursor-pointer transition-all ${isSelected ? "border-blue-500 ring-1 ring-blue-500" : "border-gray-700 hover:border-gray-500"}`} onClick={() => { setSelectedOption(opt); setShowBreakdown(false); }}>
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className={`text-xs ${meta.color}`}>{meta.label}</Badge>
                          <span className="text-gray-400 text-sm">{opt.carrier}</span>
                        </div>
                        <p className="text-gray-500 text-xs">{meta.desc} · {opt.transit_days != null ? `${opt.transit_days} hari transit` : "Transit TBD"} {opt.direct_or_transshipment === "transshipment" ? "· Via T/S" : "· Direct"}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-white font-bold text-lg">{IDR(opt.total_estimate_idr)}</p>
                        {opt.currency !== "IDR" && <p className="text-gray-500 text-xs">{opt.currency} {fmtNum(opt.total_estimate)}</p>}
                        <p className="text-gray-500 text-xs">{opt.price_status === "estimate" ? "Estimasi" : "Harga Tetap"}</p>
                      </div>
                    </div>

                    {isSelected && (
                      <div className="mt-3 border-t border-gray-700 pt-3">
                        <button onClick={(e) => { e.stopPropagation(); setShowBreakdown(!showBreakdown); }} className="flex items-center gap-1 text-gray-400 text-xs hover:text-white">
                          <ChevronDown className={`h-3 w-3 transition-transform ${showBreakdown ? "rotate-180" : ""}`} />
                          {showBreakdown ? "Sembunyikan" : "Lihat"} Rincian Biaya
                        </button>
                        {showBreakdown && (
                          <div className="mt-2 space-y-1 text-xs">
                            <div className="flex justify-between text-gray-300"><span>Ocean Freight</span><span>{IDR(opt.base_ocean_freight * opt.exchange_rate_to_idr)}</span></div>
                            <div className="flex justify-between text-gray-400"><span>THC Origin</span><span>{IDR(opt.origin_charges * opt.exchange_rate_to_idr)}</span></div>
                            <div className="flex justify-between text-gray-400"><span>THC Destination</span><span>{IDR(opt.destination_charges * opt.exchange_rate_to_idr)}</span></div>
                            <div className="flex justify-between text-gray-400"><span>Biaya Dokumen</span><span>{IDR(opt.document_charges * opt.exchange_rate_to_idr)}</span></div>
                            {opt.trucking_charges > 0 && <div className="flex justify-between text-gray-400"><span>Trucking</span><span>{IDR(opt.trucking_charges * opt.exchange_rate_to_idr)}</span></div>}
                            {opt.customs_charges > 0 && <div className="flex justify-between text-gray-400"><span>Customs Clearance</span><span>{IDR(opt.customs_charges * opt.exchange_rate_to_idr)}</span></div>}
                            {Object.entries(opt.surcharge_breakdown).map(([k, v]) => (
                              <div key={k} className="flex justify-between text-gray-400"><span>{k}</span><span>{IDR(v * opt.exchange_rate_to_idr)}</span></div>
                            ))}
                            <div className="flex justify-between text-white font-bold border-t border-gray-700 pt-1"><span>Total Estimasi</span><span>{IDR(opt.total_estimate_idr)}</span></div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1 border-gray-600 text-gray-300" onClick={() => { setSelectedOption(null); setStep("inquiry"); }}>
                Minta Penawaran Manual
              </Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" disabled={!selectedOption} onClick={() => setStep("inquiry")}>
                Minta Penawaran Final
              </Button>
            </div>
            <p className="text-gray-500 text-xs text-center">Harga estimasi. Penawaran final akan dikonfirmasi oleh tim kami.</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ─ Form ── */
  return (
    <div className="min-h-screen bg-gray-950 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-blue-600 rounded-xl flex items-center justify-center">
            <Ship className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Ocean Freight</h1>
            <p className="text-gray-400 text-sm">Pengiriman laut FCL & LCL</p>
          </div>
        </div>

        <div className="space-y-4 bg-gray-900 rounded-xl p-6">
          {/* Route */}
          <div>
            <p className="text-gray-300 font-medium mb-3 flex items-center gap-2"><Anchor className="h-4 w-4 text-blue-400" /> Rute Pengiriman</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-gray-400 text-xs">Origin Port *</Label>
                <Select value={originPort} onValueChange={setOriginPort}>
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 max-h-60">
                    {PORTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Destination Port *</Label>
                <Select value={destPort} onValueChange={setDestPort}>
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue placeholder="Pilih port..." /></SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700 max-h-60">
                    {PORTS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Trade Type</Label>
                <Select value={tradeType} onValueChange={setTradeType}>
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {TRADE_TYPES.map(t => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-400 text-xs">Service Mode</Label>
                <Select value={serviceMode} onValueChange={setServiceMode}>
                  <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-gray-800 border-gray-700">
                    {SERVICE_MODES.map(s => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Shipment Type */}
          <div>
            <p className="text-gray-300 font-medium mb-3 flex items-center gap-2"><Package className="h-4 w-4 text-blue-400" /> Jenis Muatan</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {["FCL","LCL"].map(t => (
                <button key={t} onClick={() => setShipmentType(t)} className={`p-3 rounded-lg border text-sm font-medium transition-all ${shipmentType === t ? "bg-blue-600 border-blue-500 text-white" : "bg-gray-800 border-gray-600 text-gray-300 hover:border-gray-400"}`}>
                  {t === "FCL" ? "FCL (Full Container)" : "LCL (Less Container)"}
                </button>
              ))}
            </div>

            {shipmentType === "FCL" ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Container Type *</Label>
                  <Select value={containerType} onValueChange={setContainerType}>
                    <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-gray-800 border-gray-700">
                      {CONTAINER_TYPES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Jumlah Container</Label>
                  <Input type="number" min="1" value={containerQty} onChange={(e) => setContainerQty(Math.max(1, Number(e.target.value)))} className="mt-1 bg-gray-800 border-gray-600 text-white" />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-gray-400 text-xs">Volume (CBM)</Label>
                  <Input type="number" min="0" step="0.01" value={totalCbm} onChange={(e) => setTotalCbm(e.target.value)} placeholder="0.00" className="mt-1 bg-gray-800 border-gray-600 text-white" />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Berat Kotor (kg)</Label>
                  <Input type="number" min="0" step="0.1" value={grossWeight} onChange={(e) => setGrossWeight(e.target.value)} placeholder="0" className="mt-1 bg-gray-800 border-gray-600 text-white" />
                </div>
                <div>
                  <Label className="text-gray-400 text-xs">Jumlah Koli</Label>
                  <Input type="number" min="0" value={koli} onChange={(e) => setKoli(e.target.value)} placeholder="0" className="mt-1 bg-gray-800 border-gray-600 text-white" />
                </div>
              </div>
            )}
          </div>

          {/* Cargo Type */}
          <div>
            <Label className="text-gray-400 text-xs">Kondisi Kargo</Label>
            <Select value={cargoCondition} onValueChange={setCargoCondition}>
              <SelectTrigger className="mt-1 bg-gray-800 border-gray-600 text-white"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-gray-800 border-gray-700">
                {CARGO_CONDITIONS.map(c => <SelectItem key={c.v} value={c.v}>{c.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Additional Services */}
          <div>
            <p className="text-gray-300 text-sm font-medium mb-2">Layanan Tambahan</p>
            <div className="grid grid-cols-2 gap-2">
              {ADDITIONAL_SERVICES.map(s => (
                <label key={s.v} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={selectedSvc.includes(s.v)} onChange={() => toggleSvc(s.v)} className="accent-blue-500" />
                  <span className="text-gray-300 text-sm">{s.l}</span>
                </label>
              ))}
            </div>
          </div>

          <Button onClick={handleCalculate} disabled={loading || !originPort || !destPort} className="w-full bg-blue-600 hover:bg-blue-700 py-3 text-base font-medium">
            {loading ? <><Loader2 className="h-5 w-5 animate-spin mr-2" /> Menghitung...</> : <><RefreshCw className="h-5 w-5 mr-2" /> Cek Estimasi</>}
          </Button>
        </div>
      </div>
    </div>
  );
}
