import { useState, useRef } from "react";
import { Link } from "wouter";
import {
  ChevronDown, ChevronLeft, ChevronRight, Calculator,
  Truck, Shield, Clock, Fuel, Users, Info, CheckCircle2,
  MinusCircle, PlusCircle, CalendarDays, Package, MapPin,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ─── Vehicle Data ─────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  name: string;
  description: string;
  panjang: number;  // cm
  lebar: number;    // cm
  tinggi: number;   // cm
  kapasitasKg: number;
  volumeM3: number;
  hargaDasar: number; // IDR per trip
  icon: React.ReactNode;
  svgColor: string;
}

function TruckSVG({ size = "sm", variant = "default" }: { size?: "sm" | "lg"; variant?: string }) {
  const w = size === "lg" ? 240 : 44;
  const h = size === "lg" ? 140 : 28;

  const configs: Record<string, { body: string; cab: string; wheels: string }> = {
    mobil:          { body: "#cbd5e1", cab: "#94a3b8", wheels: "#475569" },
    "mobil-xl":     { body: "#bfdbfe", cab: "#93c5fd", wheels: "#3b82f6" },
    van:            { body: "#c7d2fe", cab: "#a5b4fc", wheels: "#6366f1" },
    "pickup-kecil": { body: "#fde68a", cab: "#fbbf24", wheels: "#d97706" },
    "box-kecil":    { body: "#bbf7d0", cab: "#86efac", wheels: "#16a34a" },
    engkel:         { body: "#fed7aa", cab: "#fb923c", wheels: "#ea580c" },
    "double-engkel":{ body: "#fca5a5", cab: "#f87171", wheels: "#dc2626" },
    "cdd-long":     { body: "#93c5fd", cab: "#60a5fa", wheels: "#2563eb" },
    fuso:           { body: "#6ee7b7", cab: "#34d399", wheels: "#059669" },
    tronton:        { body: "#c4b5fd", cab: "#a78bfa", wheels: "#7c3aed" },
    "truk-trailer": { body: "#94a3b8", cab: "#64748b", wheels: "#334155" },
    "truk-reefer":  { body: "#bae6fd", cab: "#38bdf8", wheels: "#0284c7" },
    default:        { body: "#93c5fd", cab: "#60a5fa", wheels: "#2563eb" },
  };

  const c = configs[variant] ?? configs.default;

  if (size === "sm") {
    // Simple side-view icon
    return (
      <svg viewBox="0 0 44 28" width={w} height={h} fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* body */}
        <rect x="2" y="8" width="28" height="14" rx="2" fill={c.body} />
        {/* cab */}
        <rect x="30" y="12" width="10" height="10" rx="1.5" fill={c.cab} />
        {/* windshield */}
        <rect x="31" y="13" width="7" height="5" rx="1" fill="white" opacity="0.6" />
        {/* wheels */}
        <circle cx="10" cy="22" r="4" fill={c.wheels} />
        <circle cx="10" cy="22" r="2" fill="white" opacity="0.4" />
        <circle cx="33" cy="22" r="4" fill={c.wheels} />
        <circle cx="33" cy="22" r="2" fill="white" opacity="0.4" />
        {/* headlight */}
        <rect x="39" y="16" width="3" height="2" rx="0.5" fill="#fef08a" />
      </svg>
    );
  }

  // Large detailed SVG
  return (
    <svg viewBox="0 0 280 160" width={280} height={160} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* shadow */}
      <ellipse cx="140" cy="150" rx="120" ry="8" fill="#cbd5e1" opacity="0.4" />
      {/* trailer/body */}
      <rect x="10" y="45" width="185" height="90" rx="6" fill={c.body} />
      {/* body highlight */}
      <rect x="10" y="45" width="185" height="20" rx="6" fill="white" opacity="0.2" />
      {/* body lines */}
      <line x1="10" y1="80" x2="195" y2="80" stroke="white" strokeWidth="1.5" opacity="0.3" />
      <line x1="10" y1="105" x2="195" y2="105" stroke="white" strokeWidth="1.5" opacity="0.15" />
      {/* cab */}
      <rect x="195" y="55" width="70" height="80" rx="8" fill={c.cab} />
      {/* windshield */}
      <rect x="202" y="60" width="54" height="42" rx="5" fill="white" opacity="0.55" />
      {/* door */}
      <rect x="202" y="107" width="25" height="25" rx="3" fill={c.cab} stroke="white" strokeWidth="0.8" opacity="0.6" />
      {/* door handle */}
      <rect x="221" y="120" width="4" height="1.5" rx="0.5" fill="white" opacity="0.7" />
      {/* rear door */}
      <rect x="14" y="49" width="2" height="82" fill="white" opacity="0.15" />
      {/* wheels */}
      <circle cx="50" cy="138" r="18" fill={c.wheels} />
      <circle cx="50" cy="138" r="10" fill="#1e293b" />
      <circle cx="50" cy="138" r="5" fill={c.wheels} opacity="0.5" />
      <circle cx="155" cy="138" r="18" fill={c.wheels} />
      <circle cx="155" cy="138" r="10" fill="#1e293b" />
      <circle cx="155" cy="138" r="5" fill={c.wheels} opacity="0.5" />
      <circle cx="228" cy="138" r="18" fill={c.wheels} />
      <circle cx="228" cy="138" r="10" fill="#1e293b" />
      <circle cx="228" cy="138" r="5" fill={c.wheels} opacity="0.5" />
      {/* headlight */}
      <rect x="260" y="82" width="14" height="8" rx="2" fill="#fef08a" />
      <rect x="260" y="82" width="14" height="8" rx="2" fill="#fef08a" opacity="0.6" />
      {/* exhaust */}
      <rect x="200" y="40" width="5" height="18" rx="2" fill="#64748b" />
    </svg>
  );
}

const VEHICLES: Vehicle[] = [
  { id: "mobil",          name: "Mobil",          description: "Cocok untuk pengiriman kecil dalam kota", panjang: 300,  lebar: 130, tinggi: 130, kapasitasKg: 400,   volumeM3: 0.5,  hargaDasar: 250_000,   icon: <TruckSVG size="sm" variant="mobil" />,          svgColor: "#94a3b8" },
  { id: "mobil-xl",       name: "Mobil XL",       description: "Kapasitas lebih besar untuk barang medium", panjang: 350, lebar: 150, tinggi: 150, kapasitasKg: 600,   volumeM3: 0.8,  hargaDasar: 350_000,   icon: <TruckSVG size="sm" variant="mobil-xl" />,       svgColor: "#93c5fd" },
  { id: "van",            name: "Van",             description: "Ideal untuk barang banyak dan tertutup",   panjang: 450, lebar: 170, tinggi: 170, kapasitasKg: 1200,  volumeM3: 1.3,  hargaDasar: 500_000,   icon: <TruckSVG size="sm" variant="van" />,            svgColor: "#a5b4fc" },
  { id: "pickup-kecil",   name: "Pickup Kecil",   description: "Bak terbuka, cocok untuk material",        panjang: 350, lebar: 170, tinggi: 50,  kapasitasKg: 800,   volumeM3: 0.3,  hargaDasar: 400_000,   icon: <TruckSVG size="sm" variant="pickup-kecil" />,   svgColor: "#fbbf24" },
  { id: "box-kecil",      name: "Box Kecil",       description: "Box tertutup untuk barang sensitif",       panjang: 380, lebar: 170, tinggi: 170, kapasitasKg: 1500,  volumeM3: 1.1,  hargaDasar: 550_000,   icon: <TruckSVG size="sm" variant="box-kecil" />,      svgColor: "#86efac" },
  { id: "engkel",         name: "Engkel",          description: "Truk ringan untuk pengiriman antar kota",  panjang: 430, lebar: 185, tinggi: 200, kapasitasKg: 3500,  volumeM3: 8.0,  hargaDasar: 1_200_000, icon: <TruckSVG size="sm" variant="engkel" />,         svgColor: "#fb923c" },
  { id: "double-engkel",  name: "Double Engkel",  description: "Kapasitas lebih besar dari engkel biasa",  panjang: 480, lebar: 200, tinggi: 210, kapasitasKg: 5000,  volumeM3: 12.0, hargaDasar: 1_800_000, icon: <TruckSVG size="sm" variant="double-engkel" />,  svgColor: "#f87171" },
  { id: "cdd-long",       name: "CDD Long",       description: "Cocok untuk pengiriman dalam jumlah besar dan jarak jauh", panjang: 530, lebar: 200, tinggi: 210, kapasitasKg: 6000,  volumeM3: 22.3, hargaDasar: 2_500_000, icon: <TruckSVG size="sm" variant="cdd-long" />,       svgColor: "#60a5fa" },
  { id: "fuso",           name: "Fuso",           description: "Truk medium untuk muatan berat",           panjang: 550, lebar: 230, tinggi: 230, kapasitasKg: 8000,  volumeM3: 29.0, hargaDasar: 3_500_000, icon: <TruckSVG size="sm" variant="fuso" />,           svgColor: "#34d399" },
  { id: "tronton",        name: "Tronton",        description: "Truk besar untuk kapasitas industri",      panjang: 700, lebar: 240, tinggi: 240, kapasitasKg: 15000, volumeM3: 40.0, hargaDasar: 5_000_000, icon: <TruckSVG size="sm" variant="tronton" />,        svgColor: "#a78bfa" },
  { id: "truk-trailer",   name: "Truk Trailer",   description: "Untuk pengiriman besar lintas pulau",      panjang: 1200,lebar: 240, tinggi: 260, kapasitasKg: 30000, volumeM3: 75.0, hargaDasar: 9_000_000, icon: <TruckSVG size="sm" variant="truk-trailer" />,   svgColor: "#64748b" },
  { id: "truk-reefer",    name: "Truk Reefer",    description: "Berpendingin untuk produk segar & farmasi", panjang: 700, lebar: 240, tinggi: 240, kapasitasKg: 15000, volumeM3: 40.0, hargaDasar: 6_500_000, icon: <TruckSVG size="sm" variant="truk-reefer" />,    svgColor: "#38bdf8" },
];

const AREAS = [
  { value: "jawa-sumatra", label: "Jawa, Sumatra" },
  { value: "kalimantan", label: "Kalimantan" },
  { value: "sulawesi", label: "Sulawesi" },
  { value: "bali-nusra", label: "Bali & Nusa Tenggara" },
];

const JENIS_BARANG = [
  "Elektronik", "Furniture", "Pakaian & Tekstil", "Makanan & Minuman",
  "Bahan Bangunan", "Alat Berat", "Kimia & Industri", "Farmasi",
  "Dokumen & Kertas", "Barang Berbahaya", "Lainnya",
];

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

// ─── Vehicle Selector Card ─────────────────────────────────────────────────────

function VehicleCard({ v, selected, onClick }: { v: Vehicle; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1.5 px-3 py-2.5 rounded-2xl border-2 transition-all shrink-0 min-w-[76px]",
        selected
          ? "border-blue-600 bg-blue-600 shadow-lg shadow-blue-200 scale-105"
          : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50",
      )}
    >
      <div className={cn("opacity-90", selected && "brightness-200 invert")}>{v.icon}</div>
      <span className={cn("text-[10px] font-semibold leading-tight text-center", selected ? "text-white" : "text-slate-600")}>
        {v.name}
      </span>
    </button>
  );
}

// ─── Spec Badge ───────────────────────────────────────────────────────────────

function SpecBadge({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 bg-slate-50 border border-slate-100 rounded-xl px-3 py-2.5">
      {icon && <span className="text-blue-500">{icon}</span>}
      <div>
        <div className="text-[10px] text-slate-400 font-medium">{label}</div>
        <div className="text-[13px] font-bold text-slate-800">{value}</div>
      </div>
    </div>
  );
}

// ─── Counter ──────────────────────────────────────────────────────────────────

function Counter({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center gap-2 h-10 border border-slate-200 rounded-xl px-2 bg-white">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
        className="text-slate-400 hover:text-blue-600 transition-colors">
        <MinusCircle className="h-5 w-5" />
      </button>
      <span className="w-8 text-center font-semibold text-slate-800 text-sm">{value}</span>
      <button type="button" onClick={() => onChange(value + 1)}
        className="text-slate-400 hover:text-blue-600 transition-colors">
        <PlusCircle className="h-5 w-5" />
      </button>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TruckingPage() {
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle>(VEHICLES[7]); // CDD Long default
  const [selectedArea, setSelectedArea]       = useState(AREAS[0].value);
  const [showCalc, setShowCalc]               = useState(false);
  const [activeTab, setActiveTab]             = useState<"dasar" | "seharian">("dasar");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Calculator state
  const [areaPickup, setAreaPickup]     = useState("");
  const [alamatPickup, setAlamatPickup] = useState("");
  const [areaDel, setAreaDel]           = useState("");
  const [alamatDel, setAlamatDel]       = useState("");
  const [jumlahTrip, setJumlahTrip]     = useState(1);
  const [tanggal, setTanggal]           = useState("");
  const [jam, setJam]                   = useState("");
  const [jenisBarang, setJenisBarang]   = useState("");
  const [berat, setBerat]               = useState("");
  const [jumlahKoli, setJumlahKoli]     = useState("");
  const [catatan, setCatatan]           = useState("");
  const [addons, setAddons] = useState({
    bantuanMuat: false, bantuanBongkar: false, asuransi: false,
    ferry: false, multiDrop: false, urgentDelivery: false,
  });
  const [showEstimasi, setShowEstimasi] = useState(false);

  function scrollVehicles(dir: "left" | "right") {
    if (!scrollRef.current) return;
    scrollRef.current.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  }

  function toggleAddon(key: keyof typeof addons) {
    setAddons((p) => ({ ...p, [key]: !p[key] }));
  }

  // Simple estimasi calculation
  const biayaDasar   = selectedVehicle.hargaDasar;
  const biayaRute    = areaPickup && areaDel ? Math.round(biayaDasar * 0.72 * jumlahTrip) : 0;
  const biayaTambahan =
    (addons.bantuanMuat   ? 150_000 : 0) +
    (addons.bantuanBongkar ? 150_000 : 0) +
    (addons.asuransi       ? 100_000 : 0) +
    (addons.ferry          ? 500_000 : 0) +
    (addons.multiDrop      ?  50_000 : 0) +
    (addons.urgentDelivery ? 200_000 : 0);
  const totalEstimasi = biayaDasar * jumlahTrip + biayaRute + biayaTambahan;

  const selectedAreaLabel = AREAS.find((a) => a.value === selectedArea)?.label ?? "";

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ── Page Title Bar ── */}
      <div className="bg-white border-b border-slate-100 px-4 py-4">
        <div className="max-w-6xl mx-auto flex items-center gap-3">
          <Link href="/" className="text-slate-400 hover:text-blue-600 transition-colors">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold text-slate-900">Trucking</h1>
            <p className="text-[12px] text-slate-400">Pesan armada trucking sesuai kebutuhan pengiriman Anda</p>
          </div>
        </div>
      </div>

      {/* ── Top Bar: Lokasi + Vehicle Selector ── */}
      <div className="bg-white shadow-sm sticky top-0 z-30 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-3">

          {/* Lokasi Jemput dropdown */}
          <div className="flex items-center gap-3 mb-3">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 uppercase tracking-wider shrink-0">
              <MapPin className="h-3.5 w-3.5 text-blue-500" />
              Lokasi Jemput
            </div>
            <div className="relative">
              <select
                value={selectedArea}
                onChange={(e) => setSelectedArea(e.target.value)}
                className="appearance-none bg-white border border-slate-200 rounded-xl pl-3 pr-8 py-1.5 text-[13px] font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
              >
                {AREAS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Vehicle scroll row */}
          <div className="relative flex items-center gap-1">
            <button
              type="button"
              onClick={() => scrollVehicles("left")}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-colors z-10"
            >
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>

            <div
              ref={scrollRef}
              className="flex gap-2 overflow-x-auto scrollbar-hide flex-1 py-1 px-1"
              style={{ scrollbarWidth: "none" }}
            >
              {VEHICLES.map((v) => (
                <VehicleCard
                  key={v.id}
                  v={v}
                  selected={selectedVehicle.id === v.id}
                  onClick={() => { setSelectedVehicle(v); setShowCalc(false); setShowEstimasi(false); }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => scrollVehicles("right")}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-colors z-10"
            >
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">

        {/* ── Vehicle Detail + Price Panel ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Left: Vehicle Image + Specs */}
          <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">

            {/* Name + description */}
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{selectedVehicle.name}</h2>
              <p className="text-slate-500 text-sm mt-0.5">{selectedVehicle.description}</p>
            </div>

            {/* Vehicle SVG image */}
            <div className="flex justify-center items-center bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl py-6 border border-slate-100">
              <TruckSVG size="lg" variant={selectedVehicle.id} />
            </div>

            {/* Specs grid */}
            <div>
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Spesifikasi Armada</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <SpecBadge
                  label="Panjang"
                  value={`${selectedVehicle.panjang} cm`}
                  icon={<ArrowRight className="h-3.5 w-3.5" />}
                />
                <SpecBadge
                  label="Lebar"
                  value={`${selectedVehicle.lebar} cm`}
                  icon={<ArrowRight className="h-3.5 w-3.5 rotate-90" />}
                />
                <SpecBadge
                  label="Tinggi"
                  value={`${selectedVehicle.tinggi} cm`}
                  icon={<ArrowRight className="h-3.5 w-3.5 -rotate-90" />}
                />
                <SpecBadge
                  label="Kapasitas"
                  value={selectedVehicle.kapasitasKg >= 1000
                    ? `${(selectedVehicle.kapasitasKg / 1000).toFixed(1)} ton`
                    : `${selectedVehicle.kapasitasKg.toLocaleString("id-ID")} kg`}
                  icon={<Package className="h-3.5 w-3.5" />}
                />
                <SpecBadge
                  label="Volume"
                  value={`${selectedVehicle.volumeM3} m³`}
                  icon={<Package className="h-3.5 w-3.5 opacity-60" />}
                />
              </div>

              {/* Disclaimer */}
              <div className="flex items-start gap-2 mt-3 bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
                <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11.5px] text-blue-700 leading-relaxed">
                  Dimensi ini adalah rata-rata untuk kelas kendaraan ini. Mungkin terdapat variasi.
                </p>
              </div>
            </div>

            {/* Calculator panel (shown after Cek Ongkir) */}
            {showCalc && (
              <div className="border-t border-slate-100 pt-5">
                <h3 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                  <Calculator className="h-4.5 w-4.5 text-blue-500" />
                  Kalkulator Ongkir
                </h3>

                <div className="space-y-4">
                  {/* Row 1: Area pickup + alamat */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Area Pickup</Label>
                      <div className="relative">
                        <select value={areaPickup} onChange={(e) => setAreaPickup(e.target.value)}
                          className="w-full appearance-none border border-slate-200 rounded-xl h-10 pl-3 pr-8 text-[13px] bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
                          <option value="">Pilih area pickup</option>
                          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Alamat Pickup</Label>
                      <Input value={alamatPickup} onChange={(e) => setAlamatPickup(e.target.value)}
                        placeholder="Masukkan alamat lengkap pickup"
                        className="h-10 text-[13px] rounded-xl border-slate-200" />
                    </div>
                  </div>

                  {/* Row 2: Area delivery + alamat */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Area Delivery</Label>
                      <div className="relative">
                        <select value={areaDel} onChange={(e) => setAreaDel(e.target.value)}
                          className="w-full appearance-none border border-slate-200 rounded-xl h-10 pl-3 pr-8 text-[13px] bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
                          <option value="">Pilih area delivery</option>
                          {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Alamat Delivery</Label>
                      <Input value={alamatDel} onChange={(e) => setAlamatDel(e.target.value)}
                        placeholder="Masukkan alamat lengkap delivery"
                        className="h-10 text-[13px] rounded-xl border-slate-200" />
                    </div>
                  </div>

                  {/* Row 3: Trip / Tanggal / Jam / Jenis Barang */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Jumlah Trip</Label>
                      <Counter value={jumlahTrip} onChange={setJumlahTrip} min={1} />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Tanggal Pickup</Label>
                      <div className="relative">
                        <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
                          className="h-10 text-[13px] rounded-xl border-slate-200 pr-8" />
                        <CalendarDays className="absolute right-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Jam Pickup</Label>
                      <Input type="time" value={jam} onChange={(e) => setJam(e.target.value)}
                        className="h-10 text-[13px] rounded-xl border-slate-200" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Jenis Barang</Label>
                      <div className="relative">
                        <select value={jenisBarang} onChange={(e) => setJenisBarang(e.target.value)}
                          className="w-full appearance-none border border-slate-200 rounded-xl h-10 pl-3 pr-8 text-[13px] bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400">
                          <option value="">Pilih jenis barang</option>
                          {JENIS_BARANG.map((j) => <option key={j} value={j}>{j}</option>)}
                        </select>
                        <ChevronDown className="absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>

                  {/* Row 4: Berat / Koli / Catatan */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Berat Barang (kg)</Label>
                      <Input type="number" value={berat} onChange={(e) => setBerat(e.target.value)}
                        placeholder="Masukkan berat"
                        className="h-10 text-[13px] rounded-xl border-slate-200" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Jumlah Koli</Label>
                      <Input type="number" value={jumlahKoli} onChange={(e) => setJumlahKoli(e.target.value)}
                        placeholder="Masukkan jumlah koli"
                        className="h-10 text-[13px] rounded-xl border-slate-200" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-semibold text-slate-600">Catatan Khusus</Label>
                      <Input value={catatan} onChange={(e) => setCatatan(e.target.value)}
                        placeholder="Opsional"
                        className="h-10 text-[13px] rounded-xl border-slate-200" />
                    </div>
                  </div>

                  {/* Addon checkboxes */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { key: "bantuanMuat",    label: "Bantuan Muat" },
                      { key: "bantuanBongkar", label: "Bantuan Bongkar" },
                      { key: "asuransi",       label: "Asuransi" },
                      { key: "ferry",          label: "Ferry / Penyeberangan" },
                      { key: "multiDrop",      label: "Multi-drop" },
                      { key: "urgentDelivery", label: "Urgent Delivery" },
                    ].map(({ key, label }) => (
                      <label key={key}
                        className="flex items-center gap-2.5 border border-slate-200 rounded-xl px-3 py-2.5 cursor-pointer hover:bg-blue-50 hover:border-blue-200 transition-colors">
                        <Checkbox
                          checked={addons[key as keyof typeof addons]}
                          onCheckedChange={() => toggleAddon(key as keyof typeof addons)}
                          className="border-slate-300" />
                        <span className="text-[13px] text-slate-700">{label}</span>
                      </label>
                    ))}
                  </div>

                  {/* Hitung Estimasi */}
                  <Button
                    type="button"
                    onClick={() => setShowEstimasi(true)}
                    className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm"
                  >
                    Hitung Estimasi
                  </Button>

                  {/* Estimasi result */}
                  {showEstimasi && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
                      <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Estimasi Biaya</p>
                      <div className="overflow-x-auto">
                        <div className="flex flex-wrap gap-4 text-sm min-w-[600px] sm:min-w-0">
                          <div><span className="text-slate-400 text-[11px] block">Armada</span><span className="font-semibold text-slate-800">{selectedVehicle.name}</span></div>
                          <div><span className="text-slate-400 text-[11px] block">Area Pickup</span><span className="font-semibold text-slate-800">{AREAS.find(a=>a.value===areaPickup)?.label ?? "—"}</span></div>
                          <div><span className="text-slate-400 text-[11px] block">Area Delivery</span><span className="font-semibold text-slate-800">{AREAS.find(a=>a.value===areaDel)?.label ?? "—"}</span></div>
                          <div><span className="text-slate-400 text-[11px] block">Harga Dasar</span><span className="font-semibold text-slate-800">{formatRp(biayaDasar * jumlahTrip)}</span></div>
                          {biayaRute > 0 && <div><span className="text-slate-400 text-[11px] block">Biaya Rute</span><span className="font-semibold text-slate-800">{formatRp(biayaRute)}</span></div>}
                          {biayaTambahan > 0 && <div><span className="text-slate-400 text-[11px] block">Biaya Tambahan</span><span className="font-semibold text-slate-800">{formatRp(biayaTambahan)}</span></div>}
                          <div className="ml-auto">
                            <span className="text-slate-400 text-[11px] block">Total Estimasi</span>
                            <span className="font-bold text-blue-600 text-xl">{formatRp(totalEstimasi)}</span>
                          </div>
                        </div>
                      </div>
                      <p className="text-[10.5px] text-slate-400 mt-2">
                        *Estimasi harga belum termasuk PPN. Harga dapat berubah sewaktu-waktu.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right: Price + Cek Ongkir + Layanan Standar */}
          <div className="space-y-4">

            {/* Price Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">

              {/* Tabs */}
              <div className="flex border-b border-slate-100">
                {(["dasar", "seharian"] as const).map((tab) => (
                  <button key={tab} type="button"
                    onClick={() => setActiveTab(tab)}
                    className={cn(
                      "flex-1 py-3 text-[13px] font-semibold transition-colors",
                      activeTab === tab
                        ? "border-b-2 border-blue-600 text-blue-600"
                        : "text-slate-400 hover:text-slate-600",
                    )}>
                    {tab === "dasar" ? "BIAYA DASAR" : "HARGA SEHARIAN"}
                  </button>
                ))}
              </div>

              <div className="p-5 space-y-4">
                {/* Price display */}
                {activeTab === "dasar" ? (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1">Mulai dari</p>
                    <div className="text-2xl font-bold text-slate-900">
                      {formatRp(selectedVehicle.hargaDasar)}
                    </div>
                    <p className="text-[12px] text-slate-400 mt-0.5">/ trip · {selectedAreaLabel}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1">Sewa Harian</p>
                    <div className="text-2xl font-bold text-slate-900">
                      {formatRp(selectedVehicle.hargaDasar * 3)}
                    </div>
                    <p className="text-[12px] text-slate-400 mt-0.5">/ hari · termasuk sopir</p>
                  </div>
                )}

                <div className="h-px bg-slate-100" />

                {/* Cek Ongkir block */}
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                    <Calculator className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-slate-800">Cek Ongkir</p>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Hitung estimasi biaya pengiriman berdasarkan rute dan kebutuhan Anda.
                    </p>
                  </div>
                </div>

                <Button
                  type="button"
                  onClick={() => { setShowCalc(true); setTimeout(() => { document.getElementById("calc-section")?.scrollIntoView({ behavior: "smooth", block: "start" }); }, 100); }}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm gap-2"
                >
                  <Calculator className="h-4 w-4" />
                  Cek Ongkir
                </Button>
              </div>
            </div>

            {/* Layanan Standar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
              <h4 className="text-[13px] font-bold text-slate-800 mb-3">Layanan Standar</h4>

              <p className="text-[11px] font-semibold text-blue-600 mb-2">Termasuk di Harga</p>
              <ul className="space-y-2 mb-4">
                {[
                  { icon: <Truck className="h-3.5 w-3.5" />,   text: "Kendaraan sesuai pilihan" },
                  { icon: <Package className="h-3.5 w-3.5" />, text: "Ruang kargo khusus" },
                  { icon: <Users className="h-3.5 w-3.5" />,   text: "Pengemudi berpengalaman" },
                  { icon: <Fuel className="h-3.5 w-3.5" />,    text: "Bahan bakar" },
                  { icon: <Clock className="h-3.5 w-3.5" />,   text: "Waktu tunggu gratis 6 jam/booking" },
                  { icon: <Truck className="h-3.5 w-3.5" />,   text: "Bongkar/Muat" },
                  { icon: <Shield className="h-3.5 w-3.5" />,  text: "Asuransi kargo (limit di aplikasi)" },
                ].map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-[12px] text-slate-600">
                    <span className="text-blue-400 shrink-0">{icon}</span>
                    {text}
                  </li>
                ))}
              </ul>

              <p className="text-[11px] font-semibold text-blue-600 mb-2">Tambahan</p>
              <ul className="space-y-1.5">
                {[
                  "Ferry / Penyeberangan",
                  "Multi-drop",
                  "Urgent Delivery",
                  "Extra Helper (bantuan muat/bongkar)",
                  "Overnight / Sewa Seharian",
                ].map((text) => (
                  <li key={text} className="flex items-center gap-2 text-[12px] text-slate-500">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ── Sticky Bottom CTA ── */}
      <div className="sticky bottom-0 bg-white border-t border-slate-200 shadow-lg px-4 py-3 z-20">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-[12px] text-slate-500">
            <Shield className="h-4 w-4 text-green-500 shrink-0" />
            Data Anda aman dan terenkripsi
          </div>
          <Link href="/book">
            <Button className="h-11 px-8 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm gap-2 shadow-md shadow-blue-200">
              <Truck className="h-4 w-4" />
              Pesan Trucking
            </Button>
          </Link>
        </div>
      </div>

      {/* anchor for scroll */}
      <div id="calc-section" />
    </div>
  );
}
