import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import {
  ChevronDown, ChevronLeft, ChevronRight, Calculator,
  Truck, Shield, Clock, Fuel, Users, Info, CheckCircle2,
  MinusCircle, PlusCircle, CalendarDays, Package, MapPin,
  ArrowRight, Phone, User, AlarmClock, Boxes, Send, Loader2,
  PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Vehicle {
  id: string;
  name: string;
  description: string;
  panjang: number;
  lebar: number;
  tinggi: number;
  kapasitasKg: number;
  volumeM3: number;
  hargaDasar: number;
  icon: React.ReactNode;
}

// ─── SVG ──────────────────────────────────────────────────────────────────────

function TruckSVG({ size = "sm", variant = "default" }: { size?: "sm" | "lg"; variant?: string }) {
  const w = size === "lg" ? 280 : 44;
  const h = size === "lg" ? 160 : 28;

  const configs: Record<string, { body: string; cab: string; wheels: string }> = {
    mobil:           { body: "#cbd5e1", cab: "#94a3b8",  wheels: "#475569" },
    "mobil-xl":      { body: "#bfdbfe", cab: "#93c5fd",  wheels: "#3b82f6" },
    van:             { body: "#c7d2fe", cab: "#a5b4fc",  wheels: "#6366f1" },
    "pickup-kecil":  { body: "#fde68a", cab: "#fbbf24",  wheels: "#d97706" },
    "box-kecil":     { body: "#bbf7d0", cab: "#86efac",  wheels: "#16a34a" },
    engkel:          { body: "#fed7aa", cab: "#fb923c",  wheels: "#ea580c" },
    "double-engkel": { body: "#fca5a5", cab: "#f87171",  wheels: "#dc2626" },
    "cdd-long":      { body: "#93c5fd", cab: "#60a5fa",  wheels: "#2563eb" },
    fuso:            { body: "#6ee7b7", cab: "#34d399",  wheels: "#059669" },
    tronton:         { body: "#c4b5fd", cab: "#a78bfa",  wheels: "#7c3aed" },
    "truk-trailer":  { body: "#94a3b8", cab: "#64748b",  wheels: "#334155" },
    "truk-reefer":   { body: "#bae6fd", cab: "#38bdf8",  wheels: "#0284c7" },
    default:         { body: "#93c5fd", cab: "#60a5fa",  wheels: "#2563eb" },
  };

  const c = configs[variant] ?? configs.default;

  if (size === "sm") {
    return (
      <svg viewBox="0 0 44 28" width={w} height={h} fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="8" width="28" height="14" rx="2" fill={c.body} />
        <rect x="30" y="12" width="10" height="10" rx="1.5" fill={c.cab} />
        <rect x="31" y="13" width="7" height="5" rx="1" fill="white" opacity="0.6" />
        <circle cx="10" cy="22" r="4" fill={c.wheels} />
        <circle cx="10" cy="22" r="2" fill="white" opacity="0.4" />
        <circle cx="33" cy="22" r="4" fill={c.wheels} />
        <circle cx="33" cy="22" r="2" fill="white" opacity="0.4" />
        <rect x="39" y="16" width="3" height="2" rx="0.5" fill="#fef08a" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 280 160" width={w} height={h} fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="140" cy="150" rx="120" ry="8" fill="#cbd5e1" opacity="0.4" />
      <rect x="10" y="45" width="185" height="90" rx="6" fill={c.body} />
      <rect x="10" y="45" width="185" height="20" rx="6" fill="white" opacity="0.2" />
      <line x1="10" y1="80" x2="195" y2="80" stroke="white" strokeWidth="1.5" opacity="0.3" />
      <line x1="10" y1="105" x2="195" y2="105" stroke="white" strokeWidth="1.5" opacity="0.15" />
      <rect x="195" y="55" width="70" height="80" rx="8" fill={c.cab} />
      <rect x="202" y="60" width="54" height="42" rx="5" fill="white" opacity="0.55" />
      <rect x="202" y="107" width="25" height="25" rx="3" fill={c.cab} stroke="white" strokeWidth="0.8" opacity="0.6" />
      <rect x="221" y="120" width="4" height="1.5" rx="0.5" fill="white" opacity="0.7" />
      <rect x="14" y="49" width="2" height="82" fill="white" opacity="0.15" />
      <circle cx="50" cy="138" r="18" fill={c.wheels} />
      <circle cx="50" cy="138" r="10" fill="#1e293b" />
      <circle cx="50" cy="138" r="5" fill={c.wheels} opacity="0.5" />
      <circle cx="155" cy="138" r="18" fill={c.wheels} />
      <circle cx="155" cy="138" r="10" fill="#1e293b" />
      <circle cx="155" cy="138" r="5" fill={c.wheels} opacity="0.5" />
      <circle cx="228" cy="138" r="18" fill={c.wheels} />
      <circle cx="228" cy="138" r="10" fill="#1e293b" />
      <circle cx="228" cy="138" r="5" fill={c.wheels} opacity="0.5" />
      <rect x="260" y="82" width="14" height="8" rx="2" fill="#fef08a" />
      <rect x="200" y="40" width="5" height="18" rx="2" fill="#64748b" />
    </svg>
  );
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const VEHICLES: Vehicle[] = [
  { id: "mobil",          name: "Mobil",         description: "Cocok untuk pengiriman kecil dalam kota",             panjang: 300,  lebar: 130, tinggi: 130, kapasitasKg: 400,   volumeM3: 0.5,  hargaDasar: 250_000,   icon: <TruckSVG size="sm" variant="mobil" /> },
  { id: "mobil-xl",       name: "Mobil XL",      description: "Kapasitas lebih besar untuk barang medium",           panjang: 350,  lebar: 150, tinggi: 150, kapasitasKg: 600,   volumeM3: 0.8,  hargaDasar: 350_000,   icon: <TruckSVG size="sm" variant="mobil-xl" /> },
  { id: "van",            name: "Van",            description: "Ideal untuk barang banyak dan tertutup",              panjang: 450,  lebar: 170, tinggi: 170, kapasitasKg: 1200,  volumeM3: 1.3,  hargaDasar: 500_000,   icon: <TruckSVG size="sm" variant="van" /> },
  { id: "pickup-kecil",   name: "Pickup Kecil",  description: "Bak terbuka, cocok untuk material",                  panjang: 350,  lebar: 170, tinggi: 50,  kapasitasKg: 800,   volumeM3: 0.3,  hargaDasar: 400_000,   icon: <TruckSVG size="sm" variant="pickup-kecil" /> },
  { id: "box-kecil",      name: "Box Kecil",     description: "Box tertutup untuk barang sensitif",                  panjang: 380,  lebar: 170, tinggi: 170, kapasitasKg: 1500,  volumeM3: 1.1,  hargaDasar: 550_000,   icon: <TruckSVG size="sm" variant="box-kecil" /> },
  { id: "engkel",         name: "Engkel",         description: "Truk ringan untuk pengiriman antar kota",             panjang: 430,  lebar: 185, tinggi: 200, kapasitasKg: 3500,  volumeM3: 8.0,  hargaDasar: 1_200_000, icon: <TruckSVG size="sm" variant="engkel" /> },
  { id: "double-engkel",  name: "Double Engkel", description: "Kapasitas lebih besar dari engkel biasa",             panjang: 480,  lebar: 200, tinggi: 210, kapasitasKg: 5000,  volumeM3: 12.0, hargaDasar: 1_800_000, icon: <TruckSVG size="sm" variant="double-engkel" /> },
  { id: "cdd-long",       name: "CDD Long",      description: "Cocok untuk pengiriman dalam jumlah besar dan jarak jauh", panjang: 530, lebar: 200, tinggi: 210, kapasitasKg: 6000, volumeM3: 22.3, hargaDasar: 2_500_000, icon: <TruckSVG size="sm" variant="cdd-long" /> },
  { id: "fuso",           name: "Fuso",           description: "Truk medium untuk muatan berat",                     panjang: 550,  lebar: 230, tinggi: 230, kapasitasKg: 8000,  volumeM3: 29.0, hargaDasar: 3_500_000, icon: <TruckSVG size="sm" variant="fuso" /> },
  { id: "tronton",        name: "Tronton",        description: "Truk besar untuk kapasitas industri",                panjang: 700,  lebar: 240, tinggi: 240, kapasitasKg: 15000, volumeM3: 40.0, hargaDasar: 5_000_000, icon: <TruckSVG size="sm" variant="tronton" /> },
  { id: "truk-trailer",   name: "Truk Trailer",  description: "Untuk pengiriman besar lintas pulau",                panjang: 1200, lebar: 240, tinggi: 260, kapasitasKg: 30000, volumeM3: 75.0, hargaDasar: 9_000_000, icon: <TruckSVG size="sm" variant="truk-trailer" /> },
  { id: "truk-reefer",    name: "Truk Reefer",   description: "Berpendingin untuk produk segar & farmasi",          panjang: 700,  lebar: 240, tinggi: 240, kapasitasKg: 15000, volumeM3: 40.0, hargaDasar: 6_500_000, icon: <TruckSVG size="sm" variant="truk-reefer" /> },
];

const AREAS = [
  { value: "jawa-sumatra",  label: "Jawa, Sumatra" },
  { value: "kalimantan",    label: "Kalimantan" },
  { value: "sulawesi",      label: "Sulawesi" },
  { value: "bali-nusra",   label: "Bali & Nusa Tenggara" },
];

const JENIS_BARANG = [
  "Elektronik", "Furniture", "Pakaian & Tekstil", "Makanan & Minuman",
  "Bahan Bangunan", "Alat Berat", "Kimia & Industri", "Farmasi",
  "Dokumen & Kertas", "Barang Berbahaya", "Lainnya",
];

const ADDON_LIST = [
  { key: "bantuanMuat",    label: "Bantuan Muat",           price: 150_000, desc: "+Rp 150.000" },
  { key: "bantuanBongkar", label: "Bantuan Bongkar",        price: 150_000, desc: "+Rp 150.000" },
  { key: "asuransi",       label: "Asuransi",               price: 100_000, desc: "+Rp 100.000" },
  { key: "ferry",          label: "Ferry / Penyeberangan",  price: 500_000, desc: "+Rp 500.000" },
  { key: "tol",            label: "Tol (actual cost)",      price: 0,       desc: "Actual cost" },
  { key: "multiDrop",      label: "Multi-drop",             price: 50_000,  desc: "+Rp 50.000/titik" },
  { key: "urgentDelivery", label: "Urgent Delivery",        price: 200_000, desc: "+Rp 200.000" },
  { key: "overnight",      label: "Overnight / Sewa Seharian", price: 0,   desc: "Harga seharian" },
] as const;

type AddonKey = (typeof ADDON_LIST)[number]["key"];

function formatRp(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

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

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="flex items-center justify-center h-7 w-7 rounded-lg bg-blue-50 text-blue-500 shrink-0">{icon}</span>
      <span className="text-[13px] font-bold text-slate-700 uppercase tracking-wide">{children}</span>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11.5px] font-semibold text-slate-600">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

const INPUT_CLS = "h-10 text-[13px] rounded-xl border-slate-200 focus-visible:ring-blue-400";

function SelectField({ value, onChange, placeholder, options }: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full appearance-none border border-slate-200 rounded-xl h-10 pl-3 pr-8 text-[13px] bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="absolute right-2.5 top-3 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TruckingPage() {
  const [, setLocation] = useLocation();
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle>(VEHICLES[7]);
  const [selectedArea, setSelectedArea]       = useState(AREAS[0].value);
  const [showCalc, setShowCalc]               = useState(false);
  const [activeTab, setActiveTab]             = useState<"dasar" | "seharian">("dasar");
  const scrollRef  = useRef<HTMLDivElement>(null);
  const calcRef    = useRef<HTMLDivElement>(null);

  // ── Form state ──────────────────────────────────────────────────────────────
  const [areaPickup,    setAreaPickup]    = useState("");
  const [alamatPickup,  setAlamatPickup]  = useState("");
  const [picPickup,     setPicPickup]     = useState("");
  const [hpPickup,      setHpPickup]      = useState("");

  const [areaDel,       setAreaDel]       = useState("");
  const [alamatDel,     setAlamatDel]     = useState("");
  const [picPenerima,   setPicPenerima]   = useState("");
  const [hpPenerima,    setHpPenerima]    = useState("");

  const [jadwalType, setJadwalType]       = useState<"sekarang" | "nanti">("sekarang");
  const [tanggal,    setTanggal]          = useState("");
  const [jam,        setJam]              = useState("");

  const [jenisBarang,  setJenisBarang]    = useState("");
  const [berat,        setBerat]          = useState("");
  const [jumlahKoli,   setJumlahKoli]     = useState("");
  const [volume,       setVolume]         = useState("");
  const [catatan,      setCatatan]        = useState("");

  const [jumlahTrip,   setJumlahTrip]     = useState(1);

  const [addons, setAddons] = useState<Record<AddonKey, boolean>>({
    bantuanMuat: false, bantuanBongkar: false, asuransi: false,
    ferry: false, tol: false, multiDrop: false, urgentDelivery: false, overnight: false,
  });

  const [showEstimasi, setShowEstimasi]   = useState(false);
  const [submitting, setSubmitting]       = useState(false);
  const [bookingNumber, setBookingNumber] = useState<string | null>(null);
  const [submitError, setSubmitError]     = useState<string | null>(null);

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function scrollVehicles(dir: "left" | "right") {
    scrollRef.current?.scrollBy({ left: dir === "left" ? -200 : 200, behavior: "smooth" });
  }

  function toggleAddon(key: AddonKey) {
    setAddons((p) => ({ ...p, [key]: !p[key] }));
  }

  function handleCekOngkir() {
    setShowCalc(true);
    setTimeout(() => calcRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }

  async function submitBooking() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/trucking/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleType:    selectedVehicle.id,
          vehicleName:    selectedVehicle.name,
          areaPickup,
          alamatPickup,
          picPickup,
          hpPickup,
          areaDelivery:   areaDel,
          alamatDelivery: alamatDel,
          picPenerima,
          hpPenerima,
          jadwalType,
          tanggalPickup:  jadwalType === "nanti" ? tanggal : undefined,
          jamPickup:      jadwalType === "nanti" ? jam : undefined,
          jenisBarang:    jenisBarang || undefined,
          beratKg:        berat ? parseFloat(berat) : undefined,
          jumlahKoli:     jumlahKoli ? parseInt(jumlahKoli) : undefined,
          volumeM3:       volume ? parseFloat(volume) : undefined,
          catatan:        catatan || undefined,
          jumlahTrip,
          addons,
          estimasiTotal:  totalEstimasi,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { message?: string }).message ?? "Gagal mengirim permintaan");
      }
      const data = await res.json() as { bookingNumber: string };
      setBookingNumber(data.bookingNumber);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Terjadi kesalahan, coba lagi");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Calculation ─────────────────────────────────────────────────────────────

  const biayaDasar = addons.overnight
    ? selectedVehicle.hargaDasar * 3
    : selectedVehicle.hargaDasar;

  const biayaPerTrip  = biayaDasar * jumlahTrip;
  const biayaTambahan =
    (addons.bantuanMuat    ? 150_000 : 0) +
    (addons.bantuanBongkar ? 150_000 : 0) +
    (addons.asuransi       ? 100_000 : 0) +
    (addons.ferry          ? 500_000 : 0) +
    (addons.multiDrop      ?  50_000 : 0) +
    (addons.urgentDelivery ? 200_000 : 0);

  const totalEstimasi = biayaPerTrip + biayaTambahan;

  const selectedAreaLabel = AREAS.find((a) => a.value === selectedArea)?.label ?? "";

  // ─────────────────────────────────────────────────────────────────────────────

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

      {/* ── Sticky Top: Lokasi + Vehicle Selector ── */}
      <div className="bg-white shadow-sm sticky top-0 z-30 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-4 py-3">

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
                {AREAS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
            </div>
          </div>

          <div className="relative flex items-center gap-1">
            <button type="button" onClick={() => scrollVehicles("left")}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-colors z-10">
              <ChevronLeft className="h-4 w-4 text-slate-600" />
            </button>
            <div ref={scrollRef}
              className="flex gap-2 overflow-x-auto flex-1 py-1 px-1"
              style={{ scrollbarWidth: "none" }}>
              {VEHICLES.map((v) => (
                <VehicleCard key={v.id} v={v} selected={selectedVehicle.id === v.id}
                  onClick={() => { setSelectedVehicle(v); setShowCalc(false); setShowEstimasi(false); }} />
              ))}
            </div>
            <button type="button" onClick={() => scrollVehicles("right")}
              className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:border-blue-300 transition-colors z-10">
              <ChevronRight className="h-4 w-4 text-slate-600" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* ── Left Col: Vehicle Detail + Calculator ── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Vehicle Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">{selectedVehicle.name}</h2>
                <p className="text-slate-500 text-sm mt-0.5">{selectedVehicle.description}</p>
              </div>

              <div className="flex justify-center items-center bg-gradient-to-br from-slate-50 to-blue-50 rounded-2xl py-6 border border-slate-100">
                <TruckSVG size="lg" variant={selectedVehicle.id} />
              </div>

              <div>
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Spesifikasi Armada</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <SpecBadge label="Panjang" value={`${selectedVehicle.panjang} cm`} icon={<ArrowRight className="h-3.5 w-3.5" />} />
                  <SpecBadge label="Lebar"   value={`${selectedVehicle.lebar} cm`}   icon={<ArrowRight className="h-3.5 w-3.5 rotate-90" />} />
                  <SpecBadge label="Tinggi"  value={`${selectedVehicle.tinggi} cm`}  icon={<ArrowRight className="h-3.5 w-3.5 -rotate-90" />} />
                  <SpecBadge label="Kapasitas"
                    value={selectedVehicle.kapasitasKg >= 1000
                      ? `${(selectedVehicle.kapasitasKg / 1000).toFixed(1)} ton`
                      : `${selectedVehicle.kapasitasKg.toLocaleString("id-ID")} kg`}
                    icon={<Package className="h-3.5 w-3.5" />} />
                  <SpecBadge label="Volume" value={`${selectedVehicle.volumeM3} m³`} icon={<Package className="h-3.5 w-3.5 opacity-60" />} />
                </div>
                <div className="flex items-start gap-2 mt-3 bg-blue-50 rounded-xl px-3 py-2.5 border border-blue-100">
                  <Info className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-[11.5px] text-blue-700 leading-relaxed">
                    Dimensi ini adalah rata-rata untuk kelas kendaraan ini. Mungkin terdapat variasi.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Calculator Form ── */}
            {showCalc && (
              <div ref={calcRef} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-6">
                <div className="flex items-center gap-2.5 pb-4 border-b border-slate-100">
                  <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center">
                    <Calculator className="h-4.5 w-4.5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Kalkulator Ongkir</h3>
                    <p className="text-[11px] text-slate-400">Isi detail pengiriman untuk menghitung estimasi biaya</p>
                  </div>
                </div>

                {/* ── 1. Pickup ── */}
                <div>
                  <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />}>Pickup</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Area Pickup" required>
                      <SelectField value={areaPickup} onChange={setAreaPickup}
                        placeholder="Pilih area pickup" options={AREAS} />
                    </FormField>
                    <FormField label="Alamat Pickup Lengkap" required>
                      <Input value={alamatPickup} onChange={(e) => setAlamatPickup(e.target.value)}
                        placeholder="Jl. Contoh No.1, Kota" className={INPUT_CLS} />
                    </FormField>
                    <FormField label="Nama PIC Pickup" required>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                        <Input value={picPickup} onChange={(e) => setPicPickup(e.target.value)}
                          placeholder="Nama penanggung jawab pickup"
                          className={cn(INPUT_CLS, "pl-9")} />
                      </div>
                    </FormField>
                    <FormField label="No. HP Pickup" required>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                        <Input type="tel" value={hpPickup} onChange={(e) => setHpPickup(e.target.value)}
                          placeholder="08xx-xxxx-xxxx"
                          className={cn(INPUT_CLS, "pl-9")} />
                      </div>
                    </FormField>
                  </div>
                </div>

                {/* ── 2. Delivery ── */}
                <div>
                  <SectionTitle icon={<MapPin className="h-3.5 w-3.5" />}>Delivery</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Area Delivery" required>
                      <SelectField value={areaDel} onChange={setAreaDel}
                        placeholder="Pilih area delivery" options={AREAS} />
                    </FormField>
                    <FormField label="Alamat Delivery Lengkap" required>
                      <Input value={alamatDel} onChange={(e) => setAlamatDel(e.target.value)}
                        placeholder="Jl. Tujuan No.2, Kota" className={INPUT_CLS} />
                    </FormField>
                    <FormField label="Nama PIC Penerima" required>
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                        <Input value={picPenerima} onChange={(e) => setPicPenerima(e.target.value)}
                          placeholder="Nama penerima"
                          className={cn(INPUT_CLS, "pl-9")} />
                      </div>
                    </FormField>
                    <FormField label="No. HP Penerima" required>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                        <Input type="tel" value={hpPenerima} onChange={(e) => setHpPenerima(e.target.value)}
                          placeholder="08xx-xxxx-xxxx"
                          className={cn(INPUT_CLS, "pl-9")} />
                      </div>
                    </FormField>
                  </div>
                </div>

                {/* ── 3. Jadwal ── */}
                <div>
                  <SectionTitle icon={<AlarmClock className="h-3.5 w-3.5" />}>Jadwal Pickup</SectionTitle>
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      {(["sekarang", "nanti"] as const).map((type) => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => setJadwalType(type)}
                          className={cn(
                            "flex-1 h-10 rounded-xl border-2 text-[13px] font-semibold transition-all",
                            jadwalType === type
                              ? "border-blue-600 bg-blue-600 text-white"
                              : "border-slate-200 bg-white text-slate-600 hover:border-blue-300",
                          )}
                        >
                          {type === "sekarang" ? "Pickup Sekarang" : "Jadwalkan Nanti"}
                        </button>
                      ))}
                    </div>

                    {jadwalType === "nanti" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <FormField label="Tanggal Pickup" required>
                          <div className="relative">
                            <CalendarDays className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                            <Input type="date" value={tanggal} onChange={(e) => setTanggal(e.target.value)}
                              className={cn(INPUT_CLS, "pl-9")} />
                          </div>
                        </FormField>
                        <FormField label="Jam Pickup" required>
                          <div className="relative">
                            <Clock className="absolute left-3 top-2.5 h-4 w-4 text-slate-300 pointer-events-none" />
                            <Input type="time" value={jam} onChange={(e) => setJam(e.target.value)}
                              className={cn(INPUT_CLS, "pl-9")} />
                          </div>
                        </FormField>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── 4. Detail Barang ── */}
                <div>
                  <SectionTitle icon={<Boxes className="h-3.5 w-3.5" />}>Detail Barang</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <FormField label="Jenis Barang" required>
                      <SelectField value={jenisBarang} onChange={setJenisBarang}
                        placeholder="Pilih jenis barang"
                        options={JENIS_BARANG.map((j) => ({ value: j, label: j }))} />
                    </FormField>
                    <FormField label="Berat Barang (kg)" required>
                      <Input type="number" min="0" value={berat} onChange={(e) => setBerat(e.target.value)}
                        placeholder="Masukkan berat" className={INPUT_CLS} />
                    </FormField>
                    <FormField label="Jumlah Koli" required>
                      <Input type="number" min="1" value={jumlahKoli} onChange={(e) => setJumlahKoli(e.target.value)}
                        placeholder="Masukkan jumlah koli" className={INPUT_CLS} />
                    </FormField>
                    <FormField label="Volume (m³) — opsional">
                      <Input type="number" min="0" step="0.01" value={volume} onChange={(e) => setVolume(e.target.value)}
                        placeholder="Kosongkan jika tidak tahu" className={INPUT_CLS} />
                    </FormField>
                    <div className="sm:col-span-2">
                      <FormField label="Catatan Khusus">
                        <Input value={catatan} onChange={(e) => setCatatan(e.target.value)}
                          placeholder="Contoh: barang mudah pecah, suhu tertentu, dsb." className={INPUT_CLS} />
                      </FormField>
                    </div>
                  </div>
                </div>

                {/* ── 5. Jumlah Trip ── */}
                <div>
                  <SectionTitle icon={<Truck className="h-3.5 w-3.5" />}>Jumlah Trip</SectionTitle>
                  <div className="flex items-center gap-4">
                    <Counter value={jumlahTrip} onChange={setJumlahTrip} min={1} />
                    <p className="text-[12px] text-slate-400">Minimal 1 trip · {selectedVehicle.name}</p>
                  </div>
                </div>

                {/* ── 6. Tambahan Layanan ── */}
                <div>
                  <SectionTitle icon={<CheckCircle2 className="h-3.5 w-3.5" />}>Tambahan Layanan</SectionTitle>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {ADDON_LIST.map(({ key, label, desc }) => (
                      <label
                        key={key}
                        className={cn(
                          "flex items-center justify-between gap-3 border-2 rounded-xl px-3.5 py-3 cursor-pointer transition-all",
                          addons[key]
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50",
                        )}
                      >
                        <div className="flex items-center gap-2.5">
                          <Checkbox
                            checked={addons[key]}
                            onCheckedChange={() => toggleAddon(key)}
                            className="border-slate-300 data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                          />
                          <span className="text-[13px] font-medium text-slate-700">{label}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 shrink-0">{desc}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                    <Info className="h-3 w-3 shrink-0" />
                    Biaya opsional dianggap 0 jika tidak dipilih. Tol dihitung actual cost saat perjalanan.
                  </p>
                </div>

                {/* ── 7. Hitung Estimasi Button ── */}
                <Button
                  type="button"
                  onClick={() => setShowEstimasi(true)}
                  className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[14px] gap-2 shadow-md shadow-blue-200"
                >
                  <Calculator className="h-4.5 w-4.5" />
                  Hitung Estimasi
                </Button>

                {/* ── Estimasi Result ── */}
                {showEstimasi && !bookingNumber && (
                  <div className="bg-gradient-to-br from-blue-50 to-slate-50 border border-blue-100 rounded-2xl p-5 space-y-4">
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ringkasan Estimasi Biaya</p>

                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-[13px]">
                        <MapPin className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                        <span className="text-slate-500">
                          {AREAS.find((a) => a.value === areaPickup)?.label || "—"}
                          {" → "}
                          {AREAS.find((a) => a.value === areaDel)?.label || "—"}
                        </span>
                      </div>

                      <div className="h-px bg-blue-100" />

                      <div className="space-y-1.5 text-[13px]">
                        <div className="flex justify-between">
                          <span className="text-slate-500">
                            {addons.overnight ? "Biaya Seharian" : "Biaya Dasar"}
                            {" · "}{selectedVehicle.name}{" × "}{jumlahTrip} trip
                          </span>
                          <span className="font-semibold text-slate-800">{formatRp(biayaPerTrip)}</span>
                        </div>
                        {ADDON_LIST.filter(({ key, price }) => addons[key] && price > 0).map(({ key, label, price }) => (
                          <div key={key} className="flex justify-between text-slate-500">
                            <span>{label}</span>
                            <span className="font-medium text-slate-700">{formatRp(price)}</span>
                          </div>
                        ))}
                        {addons.tol && (
                          <div className="flex justify-between text-slate-500">
                            <span>Tol (actual cost)</span>
                            <span className="font-medium text-slate-500 italic">Menyusul</span>
                          </div>
                        )}
                      </div>

                      <div className="h-px bg-blue-200" />

                      <div className="flex items-end justify-between">
                        <div>
                          <p className="text-[11px] text-slate-400 font-medium">Total Estimasi</p>
                          {addons.tol && <p className="text-[10px] text-slate-400">*belum termasuk biaya tol</p>}
                        </div>
                        <span className="text-2xl font-bold text-blue-600">{formatRp(totalEstimasi)}</span>
                      </div>
                    </div>

                    <p className="text-[10.5px] text-slate-400 border-t border-blue-100 pt-3">
                      *Estimasi belum termasuk PPN. Harga akhir dapat berbeda tergantung kondisi aktual.
                    </p>

                    {submitError && (
                      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3.5 py-3 text-[12.5px] text-red-700">
                        <Info className="h-4 w-4 shrink-0" />
                        {submitError}
                      </div>
                    )}

                    <Button
                      type="button"
                      onClick={submitBooking}
                      disabled={submitting}
                      className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-[14px] gap-2 shadow-md shadow-blue-200 disabled:opacity-60"
                    >
                      {submitting
                        ? <><Loader2 className="h-4 w-4 animate-spin" /> Mengirim Permintaan...</>
                        : <><Send className="h-4 w-4" /> Kirim Permintaan Booking</>
                      }
                    </Button>
                  </div>
                )}

                {/* ── Success State ── */}
                {bookingNumber && (
                  <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-2xl p-6 text-center space-y-4">
                    <div className="flex justify-center">
                      <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                        <PartyPopper className="h-8 w-8 text-green-600" />
                      </div>
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-green-800">Permintaan Terkirim!</h3>
                      <p className="text-[13px] text-green-700 mt-1">Tim kami akan segera menghubungi Anda.</p>
                    </div>
                    <div className="bg-white rounded-xl border border-green-200 px-4 py-3">
                      <p className="text-[11px] text-slate-400 font-medium">No. Booking</p>
                      <p className="text-xl font-bold text-slate-800 tracking-wide mt-0.5">{bookingNumber}</p>
                    </div>
                    <div className="text-[12px] text-green-700 space-y-1">
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        Notifikasi WA dikirim ke tim operasional
                      </div>
                      <div className="flex items-center gap-2 justify-center">
                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                        Konfirmasi & detail harga final menyusul
                      </div>
                    </div>
                    <Button
                      type="button"
                      onClick={() => setLocation("/")}
                      className="w-full h-10 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold text-sm"
                    >
                      Kembali ke Beranda
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Right Col: Price + Cek Ongkir + Layanan Standar ── */}
          <div className="space-y-4">

            {/* Price Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
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
                {activeTab === "dasar" ? (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1">Mulai dari</p>
                    <div className="text-2xl font-bold text-slate-900">{formatRp(selectedVehicle.hargaDasar)}</div>
                    <p className="text-[12px] text-slate-400 mt-0.5">/ trip · {selectedAreaLabel}</p>
                  </div>
                ) : (
                  <div>
                    <p className="text-[11px] text-slate-400 font-medium mb-1">Sewa Harian</p>
                    <div className="text-2xl font-bold text-slate-900">{formatRp(selectedVehicle.hargaDasar * 3)}</div>
                    <p className="text-[12px] text-slate-400 mt-0.5">/ hari · termasuk sopir</p>
                  </div>
                )}

                <div className="h-px bg-slate-100" />

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

                <Button type="button" onClick={handleCekOngkir}
                  className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm gap-2">
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
                  { icon: <Clock className="h-3.5 w-3.5" />,   text: "Waktu tunggu gratis 6 jam" },
                  { icon: <Shield className="h-3.5 w-3.5" />,  text: "Asuransi kargo (limit di aplikasi)" },
                ].map(({ icon, text }) => (
                  <li key={text} className="flex items-center gap-2 text-[12px] text-slate-600">
                    <span className="text-blue-400 shrink-0">{icon}</span>
                    {text}
                  </li>
                ))}
              </ul>

              <p className="text-[11px] font-semibold text-blue-600 mb-2">Tambahan (opsional)</p>
              <ul className="space-y-1.5">
                {[
                  "Bantuan Muat / Bongkar",
                  "Ferry / Penyeberangan",
                  "Tol (actual cost)",
                  "Multi-drop",
                  "Urgent Delivery",
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
    </div>
  );
}
