import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Ship, Anchor, ArrowLeft, ChevronRight, Loader2, CheckCircle2, Package,
  Clock, ArrowRight, Info, Container, Globe, Shield, FileCheck,
  Truck, Star, MapPin, PhoneCall, ChevronDown,
} from "lucide-react";

/* ─── Constants ──────────────────────────────────────────────────── */
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
  { v: "20ft",      l: "20ft GP",        cbm: 25,   payload: 21800, desc: "Kontainer standar serbaguna" },
  { v: "40ft",      l: "40ft GP",        cbm: 55,   payload: 26480, desc: "Kapasitas besar untuk volume tinggi" },
  { v: "40HC",      l: "40ft High Cube", cbm: 65,   payload: 26480, desc: "Tinggi extra untuk kargo besar" },
  { v: "reefer_20", l: "Reefer 20ft",    cbm: 25,   payload: 20400, desc: "Pendingin untuk kargo sensitif" },
  { v: "reefer_40", l: "Reefer 40ft",    cbm: 56,   payload: 24760, desc: "Pendingin kapasitas besar" },
  { v: "open_top",  l: "Open Top 20ft",  cbm: 25,   payload: 21600, desc: "Untuk kargo overheight" },
  { v: "flat_rack", l: "Flat Rack 20ft", cbm: null, payload: 24000, desc: "Untuk mesin & proyek kargo" },
];
const CARGO_CONDITIONS = [
  { v: "general",    l: "General Cargo" },
  { v: "dg",         l: "DG Cargo" },
  { v: "reefer",     l: "Reefer" },
  { v: "fragile",    l: "Fragile" },
  { v: "oversize",   l: "Oversize" },
  { v: "high_value", l: "High Value" },
];
const INCOTERMS = ["EXW", "FOB", "CFR", "CIF", "DAP", "DDP"];
const ADDITIONAL_SERVICES = [
  "Trucking Pickup", "Trucking Delivery", "Customs Clearance", "Insurance",
  "Fumigation", "COO / Certificate", "Warehouse Handling", "Stuffing",
  "Unstuffing", "Surveyor", "Document Handling",
];

const POPULAR_ROUTES = [
  { from: "Surabaya", to: "Singapore", pol: "Tanjung Perak", pod: "PSA Singapore", transit: "3–5 hari", flag: "🇸🇬" },
  { from: "Jakarta",  to: "Shanghai",  pol: "Tanjung Priok", pod: "Yangshan Port",  transit: "7–10 hari", flag: "🇨🇳" },
  { from: "Makassar", to: "Hong Kong", pol: "Makassar Port",  pod: "Kwai Chung",    transit: "8–12 hari", flag: "🇭🇰" },
  { from: "Belawan",  to: "Penang",    pol: "Belawan Port",   pod: "Penang Port",   transit: "2–3 hari", flag: "🇲🇾" },
  { from: "Surabaya", to: "Melbourne", pol: "Tanjung Perak",  pod: "Melbourne",     transit: "14–18 hari", flag: "🇦🇺" },
  { from: "Jakarta",  to: "Rotterdam", pol: "Tanjung Priok",  pod: "Rotterdam",     transit: "25–30 hari", flag: "🇳🇱" },
];

const FEATURES = [
  { icon: Globe,     title: "Jaringan Global",      desc: "150+ pelabuhan di seluruh dunia, 20+ shipping line partner" },
  { icon: Shield,    title: "Cargo Insurance",      desc: "Perlindungan kargo penuh dari pelabuhan asal hingga tujuan" },
  { icon: FileCheck, title: "Dokumen Lengkap",      desc: "B/L, packing list, COO, MSDS dan semua dokumen ekspor-impor" },
  { icon: Truck,     title: "Door to Door",         desc: "Pickup & delivery ke pintu Anda, termasuk customs clearance" },
  { icon: Clock,     title: "Tracking Real-time",   desc: "Pantau posisi kargo Anda setiap saat via portal tracking" },
  { icon: Star,      title: "Harga Kompetitif",     desc: "Negosiasi langsung dengan carrier untuk tarif terbaik" },
];

const PROCESS_STEPS = [
  { n: "01", title: "Konsultasi",  desc: "Ceritakan kebutuhan pengiriman Anda kepada tim kami" },
  { n: "02", title: "Quotation",   desc: "Kami kirimkan estimasi biaya & pilihan carrier" },
  { n: "03", title: "Booking",     desc: "Konfirmasi dan pengurusan dokumen lengkap" },
  { n: "04", title: "Pengiriman",  desc: "Kargo dikirim & dipantau hingga tiba di tujuan" },
];

/* ─── Helpers ────────────────────────────────────────────────────── */
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

/* ─── Landing Page ────────────────────────────────────────────────── */
function LandingPage({ onGetQuote }: { onGetQuote: () => void }) {
  const [, setLocation] = useLocation();
  const [expandedRoute, setExpandedRoute] = useState<number | null>(null);

  return (
    <div className="min-h-screen bg-white">

      {/* ── Hero ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0c1a3a 0%, #0d2b5e 40%, #0e3d7e 70%, #1a5fa8 100%)",
          minHeight: "520px",
        }}
      >
        {/* Decorative circles */}
        <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #60a5fa, transparent)" }} />
        <div className="absolute bottom-0 -left-16 w-72 h-72 rounded-full opacity-10"
          style={{ background: "radial-gradient(circle, #3b82f6, transparent)" }} />

        <div className="relative max-w-6xl mx-auto px-5 md:px-8 pt-14 pb-20">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-5 text-[12px] font-semibold uppercase tracking-widest"
              style={{ background: "rgba(96,165,250,0.15)", color: "#93c5fd", border: "1px solid rgba(96,165,250,0.3)" }}>
              <Anchor className="h-3 w-3" />
              Ocean Freight — FCL & LCL
            </div>
            <h1 className="text-4xl md:text-5xl font-extrabold text-white leading-tight tracking-tight mb-5">
              Pengiriman Laut<br />
              <span style={{ color: "#60a5fa" }}>Internasional</span>{" "}
              <span className="text-white">Terpercaya</span>
            </h1>
            <p className="text-lg text-blue-200 leading-relaxed mb-8 max-w-xl">
              FCL, LCL, Reefer, dan project cargo ke 150+ pelabuhan di seluruh dunia.
              Dapatkan estimasi harga instan dan pengurusan dokumen lengkap.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={onGetQuote}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-[15px] text-white transition-all duration-200"
                style={{ background: "linear-gradient(135deg,#2563eb,#1d4ed8)", boxShadow: "0 4px 20px rgba(37,99,235,0.45)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(37,99,235,0.6)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 20px rgba(37,99,235,0.45)"}
              >
                <Ship className="h-4 w-4" />
                Minta Penawaran
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setLocation("/track")}
                className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-[15px] transition-all duration-200"
                style={{ background: "rgba(255,255,255,0.1)", color: "#bfdbfe", border: "1px solid rgba(255,255,255,0.2)" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.18)"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.1)"}
              >
                <MapPin className="h-4 w-4" />
                Lacak Kargo
              </button>
            </div>
          </div>
        </div>

        {/* Wave divider */}
        <div className="absolute bottom-0 left-0 right-0 overflow-hidden leading-none">
          <svg viewBox="0 0 1440 48" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" style={{ width: "100%", height: "48px" }}>
            <path d="M0,48 L0,24 C360,48 720,0 1080,24 L1440,0 L1440,48 Z" fill="white" />
          </svg>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div className="max-w-6xl mx-auto px-5 md:px-8 -mt-1">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8">
          {[
            { n: "150+", label: "Pelabuhan Tujuan" },
            { n: "20+",  label: "Shipping Line Partner" },
            { n: "FCL & LCL", label: "Semua Jenis Muatan" },
            { n: "24/7", label: "Dukungan Operasional" },
          ].map(({ n, label }) => (
            <div key={label} className="text-center p-4 rounded-2xl" style={{ background: "#f0f7ff" }}>
              <p className="text-2xl font-extrabold text-blue-700">{n}</p>
              <p className="text-[12px] font-medium text-slate-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FCL vs LCL ── */}
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-10">
        <div className="text-center mb-8">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">Pilihan Layanan</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">FCL atau LCL?</h2>
          <p className="text-slate-500 mt-2 max-w-lg mx-auto text-[14px]">Kami melayani kedua jenis muatan dengan tarif kompetitif dan penanganan profesional.</p>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          {/* FCL */}
          <div className="rounded-2xl overflow-hidden border border-blue-100" style={{ boxShadow: "0 4px 24px rgba(37,99,235,0.08)" }}>
            <div className="p-6" style={{ background: "linear-gradient(135deg,#1e3a8a,#1d4ed8)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Container className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">FCL</h3>
                  <p className="text-blue-200 text-[12px]">Full Container Load</p>
                </div>
              </div>
              <p className="text-blue-100 text-[13px] leading-relaxed">
                Kontainer penuh untuk pengiriman besar. Lebih ekonomis per unit dan aman karena kargo tidak bercampur.
              </p>
            </div>
            <div className="p-5 bg-white">
              <ul className="space-y-2">
                {["Ideal untuk muatan ≥10 CBM", "Lebih aman — kargo tidak bercampur", "Transit time lebih cepat", "20ft, 40ft, 40HC, Reefer, Open Top"].map(t => (
                  <li key={t} className="flex items-center gap-2 text-[13px] text-slate-600">
                    <CheckCircle2 className="h-4 w-4 text-blue-500 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
              <button onClick={onGetQuote} className="mt-5 w-full py-2.5 rounded-xl text-[13px] font-semibold text-blue-700 transition-all"
                style={{ background: "#eff6ff", border: "1.5px solid #bfdbfe" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#dbeafe"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#eff6ff"}
              >
                Cek Estimasi FCL →
              </button>
            </div>
          </div>

          {/* LCL */}
          <div className="rounded-2xl overflow-hidden border border-slate-100" style={{ boxShadow: "0 4px 24px rgba(15,23,42,0.06)" }}>
            <div className="p-6" style={{ background: "linear-gradient(135deg,#0f172a,#1e293b)" }}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <Package className="h-5 w-5 text-white" />
                </div>
                <div>
                  <h3 className="text-white font-bold text-lg">LCL</h3>
                  <p className="text-slate-400 text-[12px]">Less than Container Load</p>
                </div>
              </div>
              <p className="text-slate-300 text-[13px] leading-relaxed">
                Bayar sesuai volume. Cocok untuk pengiriman kecil yang tidak memenuhi satu kontainer penuh.
              </p>
            </div>
            <div className="p-5 bg-white">
              <ul className="space-y-2">
                {["Ideal untuk muatan &lt;10 CBM", "Bayar sesuai CBM / W/M", "Konsolidasi dengan kargo lain", "Fleksibel untuk UMKM & startup"].map(t => (
                  <li key={t} className="flex items-center gap-2 text-[13px] text-slate-600">
                    <CheckCircle2 className="h-4 w-4 text-slate-400 shrink-0" />
                    <span dangerouslySetInnerHTML={{ __html: t }} />
                  </li>
                ))}
              </ul>
              <button onClick={onGetQuote} className="mt-5 w-full py-2.5 rounded-xl text-[13px] font-semibold text-slate-700 transition-all"
                style={{ background: "#f8fafc", border: "1.5px solid #e2e8f0" }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = "#f1f5f9"}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = "#f8fafc"}
              >
                Cek Estimasi LCL →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Container Types ── */}
      <div className="py-12" style={{ background: "#f8fafc" }}>
        <div className="max-w-6xl mx-auto px-5 md:px-8">
          <div className="text-center mb-8">
            <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">Armada Kontainer</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Pilihan Kontainer</h2>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {CONTAINER_TYPES.map(ct => (
              <div key={ct.v} className="bg-white rounded-2xl p-4 border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all duration-200 cursor-pointer group"
                onClick={onGetQuote}>
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3 group-hover:bg-blue-100 transition-colors">
                  <Container className="h-5 w-5 text-blue-600" />
                </div>
                <p className="font-bold text-slate-800 text-[14px]">{ct.l}</p>
                <p className="text-[11px] text-slate-500 mt-0.5 leading-tight">{ct.desc}</p>
                <div className="mt-3 pt-3 border-t border-slate-50 space-y-0.5">
                  {ct.cbm && <p className="text-[11px] text-blue-600 font-medium">{ct.cbm} CBM</p>}
                  <p className="text-[11px] text-slate-500">{(ct.payload / 1000).toFixed(1)}t payload</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Popular Routes ── */}
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-12">
        <div className="text-center mb-8">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">Rute Populer</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Rute Ekspor & Impor Unggulan</h2>
          <p className="text-slate-500 mt-2 text-[14px]">Transit time adalah estimasi dan dapat berubah sesuai jadwal carrier.</p>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {POPULAR_ROUTES.map((r, i) => (
            <button
              key={i}
              onClick={onGetQuote}
              className="text-left p-4 rounded-2xl border border-slate-100 hover:border-blue-200 hover:shadow-md transition-all duration-200 group bg-white"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl">{r.flag}</span>
                <Badge className="bg-blue-50 text-blue-700 font-medium text-[11px]">{r.transit}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <div>
                  <p className="font-bold text-slate-800 text-[14px]">{r.from}</p>
                  <p className="text-[11px] text-slate-400">{r.pol}</p>
                </div>
                <ArrowRight className="h-4 w-4 text-blue-400 shrink-0 mx-1 group-hover:translate-x-1 transition-transform" />
                <div>
                  <p className="font-bold text-slate-800 text-[14px]">{r.to}</p>
                  <p className="text-[11px] text-slate-400">{r.pod}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <div className="py-12" style={{ background: "linear-gradient(135deg,#0c1a3a,#1e3a8a)" }}>
        <div className="max-w-6xl mx-auto px-5 md:px-8">
          <div className="text-center mb-10">
            <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: "#93c5fd" }}>Keunggulan Kami</p>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">Mengapa Pilih CST Logistics?</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex items-start gap-4 p-5 rounded-2xl" style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                <div className="w-10 h-10 rounded-xl shrink-0 flex items-center justify-center" style={{ background: "rgba(96,165,250,0.2)" }}>
                  <Icon className="h-5 w-5 text-blue-300" />
                </div>
                <div>
                  <p className="font-bold text-white text-[14px]">{title}</p>
                  <p className="text-blue-200 text-[12px] leading-relaxed mt-1">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Process ── */}
      <div className="max-w-6xl mx-auto px-5 md:px-8 py-12">
        <div className="text-center mb-10">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-widest mb-2">Alur Kerja</p>
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Proses Pengiriman</h2>
        </div>
        <div className="grid md:grid-cols-4 gap-6">
          {PROCESS_STEPS.map((s, i) => (
            <div key={s.n} className="text-center">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4 text-xl font-extrabold"
                style={{ background: i === 0 ? "#1d4ed8" : "#eff6ff", color: i === 0 ? "#fff" : "#1d4ed8" }}>
                {s.n}
              </div>
              <h3 className="font-bold text-slate-800 mb-1">{s.title}</h3>
              <p className="text-[13px] text-slate-500 leading-relaxed">{s.desc}</p>
              {i < PROCESS_STEPS.length - 1 && (
                <div className="hidden md:flex justify-end absolute right-0 top-7">
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA bottom ── */}
      <div className="py-14" style={{ background: "#f0f7ff" }}>
        <div className="max-w-2xl mx-auto px-5 text-center">
          <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 mb-3 tracking-tight">
            Siap Mengirim Kargo Anda?
          </h2>
          <p className="text-slate-500 mb-7 text-[15px]">
            Dapatkan estimasi harga instan untuk rute tujuan Anda. Tim kami siap membantu 24/7.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onGetQuote}
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-bold text-white text-[15px] transition-all"
              style={{ background: "linear-gradient(135deg,#1d4ed8,#1e40af)", boxShadow: "0 4px 18px rgba(29,78,216,0.35)" }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 24px rgba(29,78,216,0.5)"}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 18px rgba(29,78,216,0.35)"}
            >
              <Ship className="h-4 w-4" />
              Minta Penawaran Sekarang
            </button>
            <a
              href="https://wa.me/6282119507696?text=Halo%2C%20saya%20ingin%20tanya%20tentang%20Ocean%20Freight"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl font-semibold text-slate-700 text-[15px] border border-slate-200 bg-white hover:bg-slate-50 transition-all"
            >
              <PhoneCall className="h-4 w-4" />
              Hubungi via WhatsApp
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Page ──────────────────────────────────────────────────── */
export default function OceanFreightPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [view, setView] = useState<"landing" | "booking">("landing");

  // Step control
  const [step, setStep] = useState<"selector" | "form" | "results" | "selected" | "confirm" | "success">("selector");

  // Route state
  const [originCity,     setOriginCity]     = useState("Surabaya");
  const [originPort,     setOriginPort]     = useState("Tanjung Perak");
  const [destCity,       setDestCity]       = useState("Singapore");
  const [destPort,       setDestPort]       = useState("PSA Singapore");
  const [tradeType,      setTradeType]      = useState("export");
  const [serviceMode,    setServiceMode]    = useState("port_to_port");
  const [shipmentType,   setShipmentType]   = useState("FCL");
  const [containerType,  setContainerType]  = useState("20ft");
  const [containerQty,   setContainerQty]   = useState("1");
  const [totalCbm,       setTotalCbm]       = useState("");
  const [grossWeight,    setGrossWeight]    = useState("");
  const [koli,           setKoli]           = useState("");
  const [commodity,      setCommodity]      = useState("General Cargo");
  const [hsCode,         setHsCode]         = useState("");
  const [cargoCondition, setCargoCondition] = useState("general");
  const [incoterm,       setIncoterm]       = useState("FOB");
  const [etdPreferred,   setEtdPreferred]   = useState("");
  const [additionalSvcs, setAdditionalSvcs] = useState<string[]>([]);

  // Customer info
  const [custName,    setCustName]    = useState("");
  const [custPhone,   setCustPhone]   = useState("");
  const [custEmail,   setCustEmail]   = useState("");
  const [custCompany, setCustCompany] = useState("");
  const [custNotes,   setCustNotes]   = useState("");

  // Results
  const [loading,         setLoading]         = useState(false);
  const [estimateResults, setEstimateResults] = useState<EstimateOption[]>([]);
  const [noRates,         setNoRates]         = useState(false);
  const [selectedOption,  setSelectedOption]  = useState<EstimateOption | null>(null);
  const [submitting,      setSubmitting]      = useState(false);
  const [successOrder,    setSuccessOrder]    = useState("");

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
      const data = await res.json() as { options?: EstimateOption[] };
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
      const data = await res.json() as { order_number?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal submit");
      setSuccessOrder(data.order_number ?? "");
      setStep("success");
    } catch (e: unknown) {
      toast({ title: "Error", description: (e as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Landing view ── */
  if (view === "landing") {
    return <LandingPage onGetQuote={() => setView("booking")} />;
  }

  /* ── Success ── */
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
            Permintaan penawaran Ocean Freight berhasil dikirim.<br />
            Tim kami akan mengirim harga final setelah mendapatkan konfirmasi dari shipping line / partner.
          </p>
          <Button className="bg-blue-700 hover:bg-blue-800 text-white" onClick={() => setLocation("/")}>
            Kembali ke Beranda
          </Button>
        </div>
      </div>
    );
  }

  /* ── Booking form ── */
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 via-blue-900 to-blue-800">
      {/* Header */}
      <div className="bg-blue-950/80 backdrop-blur border-b border-white/10 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => setView("landing")} className="text-white/70 hover:text-white transition-colors">
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
                <button key={t.v} onClick={() => setTradeType(t.v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    tradeType === t.v ? "bg-blue-500 text-white shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}>{t.l}</button>
              ))}
            </div>
          </div>

          {/* Service Mode */}
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Service Mode</p>
            <div className="flex flex-wrap gap-2">
              {SERVICE_MODES.map(m => (
                <button key={m.v} onClick={() => setServiceMode(m.v)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                    serviceMode === m.v ? "bg-blue-500 text-white shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}>{m.l}</button>
              ))}
            </div>
          </div>

          {/* Shipment Type */}
          <div>
            <p className="text-white/70 text-xs uppercase tracking-wider mb-2">Shipment Type</p>
            <div className="flex gap-2">
              {["FCL", "LCL"].map(t => (
                <button key={t} onClick={() => setShipmentType(t)}
                  className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                    shipmentType === t ? "bg-blue-500 text-white shadow-lg" : "bg-white/10 text-white/80 hover:bg-white/20"
                  }`}>{t}</button>
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

        {/* ── Visual: Container ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 flex flex-col items-center justify-center gap-3">
            <div className="w-24 h-16 bg-blue-500/30 rounded-xl flex items-center justify-center border-2 border-blue-400/50">
              <Container className="w-10 h-10 text-blue-300" />
            </div>
            {shipmentType === "FCL" && containerInfo && (
              <div className="text-center">
                <p className="text-white font-bold text-lg">{containerInfo.l}</p>
                {containerInfo.cbm && <p className="text-blue-300 text-sm">Volume: {containerInfo.cbm} CBM</p>}
                <p className="text-blue-300 text-sm">Max Payload: {containerInfo.payload.toLocaleString("id-ID")} kg</p>
                <p className="text-white/50 text-xs mt-1">Detail final mengikuti konfirmasi carrier.</p>
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

          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-3">
            {shipmentType === "FCL" ? (
              <>
                <p className="text-white/70 text-xs uppercase tracking-wider">Container Type</p>
                <div className="grid grid-cols-2 gap-2">
                  {CONTAINER_TYPES.map(ct => (
                    <button key={ct.v} onClick={() => setContainerType(ct.v)}
                      className={`p-2 rounded-lg text-xs font-medium transition-all text-left ${
                        containerType === ct.v ? "bg-blue-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
                      }`}>{ct.l}</button>
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

        {/* ── Extended Form ── */}
        {(step === "form" || step === "results" || step === "selected") && (
          <div className="bg-white/10 backdrop-blur rounded-2xl p-5 space-y-5">
            <h3 className="text-white font-bold text-sm uppercase tracking-wider">Detail Pengiriman</h3>
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
            <div>
              <p className="text-white/70 text-xs mb-2">Cargo Condition</p>
              <div className="flex flex-wrap gap-2">
                {CARGO_CONDITIONS.map(cc => (
                  <button key={cc.v} onClick={() => setCargoCondition(cc.v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                      cargoCondition === cc.v ? "bg-blue-500 text-white" : "bg-white/10 text-white/80 hover:bg-white/20"
                    }`}>{cc.l}</button>
                ))}
              </div>
            </div>
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
            <div>
              <p className="text-white/70 text-xs mb-2 uppercase tracking-wider">Layanan Tambahan</p>
              <div className="grid grid-cols-2 gap-2">
                {ADDITIONAL_SERVICES.map(svc => (
                  <label key={svc} className="flex items-center gap-2 cursor-pointer">
                    <Checkbox checked={additionalSvcs.includes(svc)} onCheckedChange={() => toggleService(svc)}
                      className="border-white/40 data-[state=checked]:bg-blue-500" />
                    <span className="text-white/80 text-xs">{svc}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── CTA Buttons ── */}
        {step === "selector" && (
          <Button onClick={() => setStep("form")} className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-base">
            Cek Estimasi <ChevronRight className="ml-2 w-5 h-5" />
          </Button>
        )}

        {step === "form" && (
          <Button onClick={handleEstimate} disabled={loading} className="w-full bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl text-base">
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
                        selectedOption?.estimate_option === opt.estimate_option ? "border-blue-500 ring-2 ring-blue-200" : "border-transparent hover:border-blue-200"
                      }`}
                      onClick={() => setSelectedOption(opt)}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <Badge className={
                          opt.estimate_option === "Economy"  ? "bg-green-100 text-green-700" :
                          opt.estimate_option === "Priority" ? "bg-red-100 text-red-700" :
                          "bg-blue-100 text-blue-700"
                        }>{opt.estimate_option}</Badge>
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
                            : IDR(opt.total_estimate)}
                        </p>
                        {opt.currency !== "IDR" && <p className="text-xs text-gray-500">≈ {IDR(opt.total_estimate_idr)}</p>}
                        {opt.validity && <p className="text-xs text-gray-400 mt-1">Valid s/d {opt.validity}</p>}
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
                  Harga ini adalah estimasi awal. Harga final dikonfirmasi setelah admin/vendor mendapat konfirmasi dari shipping line/partner.
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
                {([
                  ["Ocean Freight",        selectedOption.breakdown.ocean_freight],
                  ["Origin Charges",       selectedOption.breakdown.origin_charges],
                  ["Destination Charges",  selectedOption.breakdown.destination_charges],
                  ["Document Charges",     selectedOption.breakdown.document_charges],
                  ["Trucking Pickup",      selectedOption.breakdown.trucking_pickup],
                  ["Trucking Delivery",    selectedOption.breakdown.trucking_delivery],
                  ["Customs Clearance",    selectedOption.breakdown.customs_clearance],
                  ["DG Surcharge",         selectedOption.breakdown.dg_surcharge],
                  ["Reefer Surcharge",     selectedOption.breakdown.reefer_surcharge],
                  ["Peak Season Surcharge",selectedOption.breakdown.peak_season_surcharge],
                ] as [string, number | string | undefined][]).filter(([, v]) => v && Number(v) > 0).map(([label, val]) => (
                  <div key={label} className="flex justify-between text-gray-600">
                    <span>{label}</span>
                    <span>{selectedOption.currency !== "IDR" ? `${selectedOption.currency} ${Number(val).toLocaleString("id-ID")}` : IDR(Number(val))}</span>
                  </div>
                ))}
                <div className="border-t pt-2 flex justify-between font-bold text-gray-800 text-base">
                  <span>Total Estimasi</span>
                  <span className="text-blue-700">
                    {selectedOption.currency !== "IDR"
                      ? `${selectedOption.currency} ${selectedOption.total_estimate.toLocaleString("id-ID")}`
                      : IDR(selectedOption.total_estimate)}
                  </span>
                </div>
                {selectedOption.currency !== "IDR" && <p className="text-xs text-gray-500 text-right">≈ {IDR(selectedOption.total_estimate_idr)}</p>}
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-lg flex gap-2">
                <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Harga ini adalah estimasi awal. Harga final dikonfirmasi setelah admin/vendor mendapat konfirmasi dari shipping line, NVOCC, co-loader, atau partner.</p>
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
              <Button onClick={handleSubmitInquiry} disabled={submitting}
                className="flex-1 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 rounded-xl">
                {submitting
                  ? <><Loader2 className="mr-2 w-5 h-5 animate-spin" />Mengirim...</>
                  : <>Minta Penawaran Final <ArrowRight className="ml-2 w-5 h-5" /></>}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
