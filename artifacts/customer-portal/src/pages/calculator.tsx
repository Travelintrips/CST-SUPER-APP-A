import { useState, useMemo, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Calculator, ArrowRight, Ship, Plane, Truck, Package,
  Warehouse, Globe, Info, RefreshCw, MessageCircle, Phone,
  Lock, CheckCircle2, ChevronRight, Sparkles, ArrowLeft,
  Send, User, X,
} from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

type ServiceType = "seaFreight" | "airFreight" | "customs" | "domestic" | "warehousing" | "projectCargo" | "";

interface CalcRates {
  airFreight:  { baseCost: number; ratePerKg: number;  handlingPct: number; customsFee: number };
  seaFreight:  { baseCost: number; ratePerCbm: number; handlingPct: number; customsFee: number };
  customs:     { baseCost: number; ratePerKg: number;  handlingFee: number; customsPct: number };
  domestic:    { baseCost: number; ratePerKg: number;  handlingPct: number };
  warehousing: { baseCost: number; ratePerCbm: number; handlingFee: number };
}

const DEFAULT_RATES: CalcRates = {
  airFreight:  { baseCost: 500000,  ratePerKg: 90000,    handlingPct: 5, customsFee: 1200000 },
  seaFreight:  { baseCost: 750000,  ratePerCbm: 2500000, handlingPct: 5, customsFee: 1500000 },
  customs:     { baseCost: 1500000, ratePerKg: 5000,     handlingFee: 500000, customsPct: 0.5 },
  domestic:    { baseCost: 500000,  ratePerKg: 8500,     handlingPct: 5 },
  warehousing: { baseCost: 5000000, ratePerCbm: 2500000, handlingFee: 500000 },
};

interface CalcResult {
  chargeableWeight?: number;
  cbm?: number;
  baseCost: number;
  weightCost: number;
  handlingFee: number;
  customsFee: number;
  insuranceFee: number;
  expressFee: number;
  total: number;
  isProjectCargo?: boolean;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

const SERVICE_CONFIG: Record<string, { icon: React.ReactNode; label: string; color: string; bg: string; activeBg: string; activeBorder: string; activeText: string }> = {
  seaFreight:    { icon: <Ship className="h-5 w-5" />,      label: "Sea Freight",    color: "text-blue-600",   bg: "bg-blue-50",   activeBg: "bg-blue-600",    activeBorder: "border-blue-500",  activeText: "text-blue-600" },
  airFreight:    { icon: <Plane className="h-5 w-5" />,     label: "Air Freight",    color: "text-sky-600",    bg: "bg-sky-50",    activeBg: "bg-sky-600",     activeBorder: "border-sky-500",   activeText: "text-sky-600" },
  customs:       { icon: <Package className="h-5 w-5" />,   label: "Bea Cukai",      color: "text-orange-600", bg: "bg-orange-50", activeBg: "bg-orange-500",  activeBorder: "border-orange-500",activeText: "text-orange-600" },
  domestic:      { icon: <Truck className="h-5 w-5" />,     label: "Domestik",       color: "text-amber-600",  bg: "bg-amber-50",  activeBg: "bg-amber-500",   activeBorder: "border-amber-500", activeText: "text-amber-600" },
  warehousing:   { icon: <Warehouse className="h-5 w-5" />, label: "Gudang",         color: "text-teal-600",   bg: "bg-teal-50",   activeBg: "bg-teal-600",    activeBorder: "border-teal-500",  activeText: "text-teal-600" },
  projectCargo:  { icon: <Globe className="h-5 w-5" />,     label: "Project Cargo",  color: "text-violet-600", bg: "bg-violet-50", activeBg: "bg-violet-600",  activeBorder: "border-violet-500",activeText: "text-violet-600" },
};

export default function CalculatorPage() {
  const { t } = useLanguage();

  const qc = useQueryClient();

  // Pre-select service from URL ?service=X
  const initialService = useMemo<ServiceType>(() => {
    if (typeof window === "undefined") return "";
    const param = new URLSearchParams(window.location.search).get("service");
    const valid: ServiceType[] = ["seaFreight","airFreight","customs","domestic","warehousing","projectCargo"];
    return (valid.includes(param as ServiceType) ? param : "") as ServiceType;
  }, []);

  const { data: ratesData } = useQuery<CalcRates>({
    queryKey: ["portal-calculator-rates"],
    queryFn: () => fetch("/api/portal/calculator-rates").then((r) => r.ok ? r.json() : null),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });
  const rates = ratesData ?? DEFAULT_RATES;

  const { data: cargoTypesData } = useQuery<string[]>({
    queryKey: ["portal-cargo-types"],
    queryFn: () => fetch("/api/portal/cargo-types").then((r) => r.ok ? r.json() : []),
    staleTime: 60 * 1000,
  });
  const cargoTypes = cargoTypesData ?? [];

  useEffect(() => {
    const es = new EventSource("/api/ecommerce/events");
    es.addEventListener("price_sync", () => {
      qc.invalidateQueries({ queryKey: ["portal-calculator-rates"] });
      qc.invalidateQueries({ queryKey: ["portal-cargo-types"] });
    });
    return () => es.close();
  }, [qc]);

  const [service, setService] = useState<ServiceType>(initialService);
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [cargoType, setCargoType] = useState("");
  const [incoterms, setIncoterms] = useState("");
  const [insurance, setInsurance] = useState(false);
  const [express, setExpress] = useState(false);
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState("");
  const [calculated, setCalculated] = useState(false);

  // Request Quote form state
  const [showQuoteForm, setShowQuoteForm] = useState(false);
  const [quoteName, setQuoteName] = useState("");
  const [quoteEmail, setQuoteEmail] = useState("");
  const [quoteWa, setQuoteWa] = useState("");
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteSuccess, setQuoteSuccess] = useState(false);
  const [quoteError, setQuoteError] = useState("");

  const cbmAuto = useMemo(() => {
    const l = parseFloat(length);
    const w = parseFloat(width);
    const h = parseFloat(height);
    if (l > 0 && w > 0 && h > 0) {
      if (service === "seaFreight") return (l / 100) * (w / 100) * (h / 100);
      return l * w * h;
    }
    return null;
  }, [length, width, height, service]);

  const cargoValueAuto = useMemo(() => {
    if (!service || service === "projectCargo") return null;
    const wKg = parseFloat(weight) || 0;
    const lCm = parseFloat(length) || 0;
    const wCm = parseFloat(width) || 0;
    const hCm = parseFloat(height) || 0;
    if (service === "airFreight") {
      if (wKg <= 0) return null;
      const volumetricWeight = (lCm * wCm * hCm) / 6000;
      const chargeable = Math.max(wKg, volumetricWeight);
      const r = rates.airFreight;
      const weightCost = Math.ceil(chargeable) * r.ratePerKg;
      const handlingFee = Math.round(weightCost * (r.handlingPct / 100));
      return r.baseCost + weightCost + handlingFee + r.customsFee;
    }
    if (service === "seaFreight") {
      if (lCm <= 0 || wCm <= 0 || hCm <= 0) return null;
      const cbm = (lCm / 100) * (wCm / 100) * (hCm / 100);
      const r = rates.seaFreight;
      const effectiveCbm = Math.max(cbm, 0.01);
      const weightCost = Math.ceil(effectiveCbm * 10) / 10 * r.ratePerCbm;
      const handlingFee = Math.round(weightCost * (r.handlingPct / 100));
      return r.baseCost + weightCost + handlingFee + r.customsFee;
    }
    if (service === "customs") {
      if (wKg <= 0) return null;
      const r = rates.customs;
      return r.baseCost + wKg * r.ratePerKg + r.handlingFee;
    }
    if (service === "domestic") {
      if (wKg <= 0) return null;
      const r = rates.domestic;
      const weightCost = wKg * r.ratePerKg;
      const handlingFee = Math.round(weightCost * (r.handlingPct / 100));
      return r.baseCost + weightCost + handlingFee;
    }
    if (service === "warehousing") {
      const cbm = lCm > 0 && wCm > 0 && hCm > 0 ? (lCm / 100) * (wCm / 100) * (hCm / 100) : 1;
      const r = rates.warehousing;
      const weightCost = Math.ceil(cbm) * r.ratePerCbm;
      return r.baseCost + weightCost + r.handlingFee;
    }
    return null;
  }, [rates, service, weight, length, width, height]);

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!service) { setError(t("calculator.validation.selectService")); return; }
    if (!weight && service !== "warehousing") { setError(t("calculator.validation.enterWeight")); return; }
    if (!origin) { setError(t("calculator.validation.enterOrigin")); return; }
    if (!destination) { setError(t("calculator.validation.enterDestination")); return; }

    const wKg = parseFloat(weight) || 0;
    const lCm = parseFloat(length) || 0;
    const wCm = parseFloat(width) || 0;
    const hCm = parseFloat(height) || 0;
    const value = cargoValueAuto ?? 0;

    let res: CalcResult = { baseCost: 0, weightCost: 0, handlingFee: 0, customsFee: 0, insuranceFee: 0, expressFee: 0, total: 0 };

    if (service === "projectCargo") {
      res.isProjectCargo = true;
      setResult(res);
      setCalculated(true);
      return;
    }
    if (service === "airFreight") {
      const volumetricWeight = (lCm * wCm * hCm) / 6000;
      const chargeable = Math.max(wKg, volumetricWeight);
      res.chargeableWeight = Math.round(chargeable * 100) / 100;
      const r = rates.airFreight;
      res.baseCost = r.baseCost;
      res.weightCost = Math.ceil(chargeable) * r.ratePerKg;
      res.handlingFee = Math.round(res.weightCost * (r.handlingPct / 100));
      res.customsFee = r.customsFee;
    } else if (service === "seaFreight") {
      const cbm = (lCm / 100) * (wCm / 100) * (hCm / 100);
      res.cbm = Math.round(cbm * 1000) / 1000;
      const effectiveCbm = Math.max(cbm, 0.01);
      const r = rates.seaFreight;
      res.baseCost = r.baseCost;
      res.weightCost = Math.ceil(effectiveCbm * 10) / 10 * r.ratePerCbm;
      res.handlingFee = Math.round(res.weightCost * (r.handlingPct / 100));
      res.customsFee = r.customsFee;
    } else if (service === "customs") {
      const r = rates.customs;
      res.baseCost = r.baseCost;
      res.weightCost = wKg * r.ratePerKg;
      res.handlingFee = r.handlingFee;
      res.customsFee = Math.max(500000, value * (r.customsPct / 100));
    } else if (service === "domestic") {
      const r = rates.domestic;
      res.chargeableWeight = wKg;
      res.baseCost = r.baseCost;
      res.weightCost = wKg * r.ratePerKg;
      res.handlingFee = Math.round(res.weightCost * (r.handlingPct / 100));
      res.customsFee = 0;
    } else if (service === "warehousing") {
      const cbm = lCm > 0 && wCm > 0 && hCm > 0 ? (lCm / 100) * (wCm / 100) * (hCm / 100) : 1;
      res.cbm = Math.round(cbm * 1000) / 1000;
      const r = rates.warehousing;
      res.baseCost = r.baseCost;
      res.weightCost = Math.ceil(cbm) * r.ratePerCbm;
      res.handlingFee = r.handlingFee;
      res.customsFee = 0;
    }

    const subtotal = res.baseCost + res.weightCost + res.handlingFee + res.customsFee;
    res.insuranceFee = insurance && value > 0 ? Math.round(value * 0.005) : 0;
    const afterInsurance = subtotal + res.insuranceFee;
    res.expressFee = express ? Math.round(afterInsurance * 0.20) : 0;
    res.total = afterInsurance + res.expressFee;

    setResult(res);
    setCalculated(true);
  }

  function handleReset() {
    setService(""); setOrigin(""); setDestination(""); setWeight("");
    setLength(""); setWidth(""); setHeight(""); setCargoType("");
    setIncoterms(""); setInsurance(false); setExpress(false);
    setResult(null); setCalculated(false); setError("");
    setShowQuoteForm(false); setQuoteName(""); setQuoteEmail("");
    setQuoteWa(""); setQuoteSuccess(false); setQuoteError("");
  }

  async function handleQuoteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setQuoteError("");
    if (!quoteName.trim()) { setQuoteError("Nama wajib diisi"); return; }
    if (!quoteWa.trim()) { setQuoteError("Nomor WhatsApp wajib diisi"); return; }
    setQuoteSubmitting(true);
    try {
      const res = await fetch("/api/portal/request-quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: quoteName.trim(),
          email: quoteEmail.trim() || undefined,
          whatsapp: quoteWa.trim(),
          service,
          origin,
          destination,
          weight: weight || undefined,
          length: length || undefined,
          width: width || undefined,
          height: height || undefined,
          incoterms: incoterms || undefined,
          insurance,
          express,
          result,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setQuoteError(data.error ?? "Gagal mengirim. Silakan coba lagi.");
      } else {
        setQuoteSuccess(true);
        setShowQuoteForm(false);
      }
    } catch {
      setQuoteError("Tidak dapat terhubung ke server. Cek koneksi Anda.");
    } finally {
      setQuoteSubmitting(false);
    }
  }

  const svc = service ? SERVICE_CONFIG[service] : null;

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(160deg, #F0F6FF 0%, #F8FAFC 50%, #FFFFFF 100%)" }}>
      <style>{`
        .calc-input {
          width: 100%;
          border-radius: 10px;
          border: 1.5px solid #E2E8F0;
          background: #FFFFFF;
          padding: 10px 14px;
          font-size: 13.5px;
          color: #1E293B;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .calc-input:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12), 0 1px 2px rgba(0,0,0,0.04);
        }
        .calc-input::placeholder { color: #94A3B8; }
        .calc-input:read-only { background: #F8FAFC; color: #64748B; cursor: not-allowed; }
        .calc-select {
          width: 100%;
          border-radius: 10px;
          border: 1.5px solid #E2E8F0;
          background: #FFFFFF;
          padding: 10px 14px;
          font-size: 13.5px;
          color: #1E293B;
          outline: none;
          transition: border-color 0.15s ease, box-shadow 0.15s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          cursor: pointer;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='none' viewBox='0 0 24 24'%3E%3Cpath stroke='%2394A3B8' stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 12px center;
          padding-right: 36px;
        }
        .calc-select:focus {
          border-color: #3B82F6;
          box-shadow: 0 0 0 3px rgba(59,130,246,0.12), 0 1px 2px rgba(0,0,0,0.04);
        }
        .calc-label {
          display: block;
          font-size: 12px;
          font-weight: 600;
          color: #475569;
          margin-bottom: 6px;
          letter-spacing: 0.01em;
          text-transform: uppercase;
        }
        .calc-card {
          background: #FFFFFF;
          border-radius: 18px;
          border: 1px solid rgba(226,232,240,0.80);
          box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.05);
        }
        .result-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 9px 0;
          border-bottom: 1px solid #F1F5F9;
          font-size: 13px;
        }
        .result-row:last-child { border-bottom: none; }
        @keyframes slide-up-fade {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .result-appear { animation: slide-up-fade 0.35s ease both; }
        .svc-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 12px 8px;
          border-radius: 12px;
          border: 1.5px solid #E2E8F0;
          background: #FFFFFF;
          font-size: 12px;
          font-weight: 600;
          color: #64748B;
          cursor: pointer;
          transition: all 0.18s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
        }
        .svc-btn:hover:not(.svc-btn-active) {
          border-color: #93C5FD;
          background: #EFF6FF;
          color: #1D4ED8;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(59,130,246,0.12);
        }
        .svc-btn-active {
          border-color: transparent !important;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(0,0,0,0.15), 0 2px 6px rgba(0,0,0,0.10) !important;
        }
        .option-toggle {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 14px;
          border-radius: 10px;
          border: 1.5px solid #E2E8F0;
          background: #FFFFFF;
          cursor: pointer;
          transition: all 0.16s ease;
          box-shadow: 0 1px 2px rgba(0,0,0,0.04);
          flex: 1;
        }
        .option-toggle:hover { border-color: #93C5FD; }
        .option-toggle-active { border-color: #3B82F6 !important; background: #EFF6FF; }
      `}</style>

      {/* ── Page Header ── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0B3D6B 0%, #0D6EBF 55%, #1E9FE8 100%)",
          padding: "clamp(24px,3.5vw,36px) 0 clamp(18px,2.5vw,26px)",
        }}
      >
        <div aria-hidden="true" style={{ position:"absolute",inset:0,backgroundImage:"radial-gradient(rgba(255,255,255,0.10) 1px,transparent 1px)",backgroundSize:"32px 32px",pointerEvents:"none" }} />
        <div className="max-w-5xl mx-auto px-4 md:px-8" style={{ position:"relative",zIndex:2 }}>
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : undefined}
            className="inline-flex items-center gap-1.5 mb-3 text-[12px] font-semibold rounded-lg px-3 py-1.5 select-none"
            style={{ color:"rgba(255,255,255,0.85)", background:"rgba(255,255,255,0.10)", border:"1.5px solid rgba(255,255,255,0.20)", transition:"all 0.16s ease" }}
            onMouseEnter={e => { const el=e.currentTarget as HTMLElement; el.style.background="rgba(255,255,255,0.18)"; el.style.color="white"; el.style.transform="translateY(-1px)"; }}
            onMouseLeave={e => { const el=e.currentTarget as HTMLElement; el.style.background="rgba(255,255,255,0.10)"; el.style.color="rgba(255,255,255,0.85)"; el.style.transform="translateY(0)"; }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Kembali
          </button>
          <div className="flex flex-col md:flex-row md:items-end gap-3 justify-between">
            <div>
              <div className="inline-flex items-center gap-1.5 mb-2 px-2.5 py-1 rounded-full text-[10.5px] font-semibold uppercase tracking-widest" style={{ background:"rgba(255,255,255,0.14)", color:"rgba(255,255,255,0.80)", border:"1px solid rgba(255,255,255,0.18)" }}>
                <Calculator className="h-3 w-3" /> {t("calculator.label")}
              </div>
              <h1 className="font-display font-bold text-white" style={{ fontSize:"clamp(20px,2.8vw,32px)", lineHeight:1.08, letterSpacing:"-0.02em", textShadow:"0 4px 16px rgba(0,0,0,0.20)" }}>
                {t("calculator.title")}
              </h1>
              <p className="mt-1.5 hidden md:block" style={{ fontSize:"13px", color:"rgba(255,255,255,0.68)", maxWidth:"380px", lineHeight:1.55 }}>
                {t("calculator.desc")}
              </p>
            </div>
            <div className="hidden md:flex items-center gap-2 shrink-0">
              {["Transparan", "Akurat", "Cepat"].map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full" style={{ background:"rgba(255,255,255,0.12)", color:"rgba(255,255,255,0.85)", border:"1px solid rgba(255,255,255,0.18)" }}>
                  <CheckCircle2 className="h-3 w-3" /> {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="max-w-5xl mx-auto px-4 md:px-8 py-7">
        <div className="grid lg:grid-cols-5 gap-6 items-start">

          {/* ── Form ── */}
          <div className="lg:col-span-3">
            <div className="calc-card p-6">
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background:"linear-gradient(135deg,#0B5CAD,#1A73D4)", boxShadow:"0 4px 12px rgba(11,92,173,0.30)" }}>
                    <Calculator className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="font-bold text-slate-800 text-[14px] leading-tight">Form Kalkulator</p>
                    <p className="text-[11px] text-slate-400">Isi semua kolom untuk mendapatkan estimasi</p>
                  </div>
                </div>
                {calculated && (
                  <button onClick={handleReset} className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-500 hover:text-slate-700 px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-all">
                    <RefreshCw className="h-3.5 w-3.5" /> Reset
                  </button>
                )}
              </div>

              <form onSubmit={handleCalculate} className="space-y-5">

                {/* ── Step 1: Service Type ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{ background:"linear-gradient(135deg,#0B5CAD,#1A73D4)" }}>1</span>
                    <label className="text-[12.5px] font-bold text-slate-700 uppercase tracking-wide">Pilih Jenis Layanan</label>
                  </div>
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {(["seaFreight","airFreight","customs","domestic","warehousing","projectCargo"] as ServiceType[]).map((s) => {
                      const cfg = SERVICE_CONFIG[s];
                      const isActive = service === s;
                      return (
                        <button
                          key={s}
                          type="button"
                          onClick={() => { setService(s); setCalculated(false); setResult(null); }}
                          className={`svc-btn${isActive ? " svc-btn-active" : ""}`}
                          style={isActive ? {
                            background: `linear-gradient(135deg, ${s === "seaFreight" ? "#1D4ED8,#3B82F6" : s === "airFreight" ? "#0284C7,#38BDF8" : s === "customs" ? "#EA580C,#FB923C" : s === "domestic" ? "#D97706,#FCD34D" : s === "warehousing" ? "#0D9488,#2DD4BF" : "#7C3AED,#A78BFA"})`,
                            color: "white",
                            borderColor: "transparent",
                          } : {}}
                        >
                          <span className={isActive ? "text-white" : cfg.color}>{cfg.icon}</span>
                          <span style={{ fontSize: "10.5px", lineHeight: 1.2, textAlign: "center" }}>{cfg.label}</span>
                        </button>
                      );
                    })}
                  </div>
                  {svc && (
                    <div className="mt-2.5 flex items-center gap-1.5 text-[11.5px] font-medium" style={{ color: svc.activeText }}>
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {svc.label} dipilih
                    </div>
                  )}
                </div>

                {/* ── Step 2: Route ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{ background:"linear-gradient(135deg,#0B5CAD,#1A73D4)" }}>2</span>
                    <label className="text-[12.5px] font-bold text-slate-700 uppercase tracking-wide">Asal & Tujuan</label>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="calc-label">{t("calculator.origin")}</label>
                      <input type="text" value={origin} onChange={(e) => setOrigin(e.target.value)} placeholder={t("calculator.originPlaceholder")} className="calc-input" />
                    </div>
                    <div>
                      <label className="calc-label">{t("calculator.destination")}</label>
                      <input type="text" value={destination} onChange={(e) => setDestination(e.target.value)} placeholder={t("calculator.destinationPlaceholder")} className="calc-input" />
                    </div>
                  </div>
                </div>

                {/* ── Step 3: Cargo ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{ background:"linear-gradient(135deg,#0B5CAD,#1A73D4)" }}>3</span>
                    <label className="text-[12.5px] font-bold text-slate-700 uppercase tracking-wide">Detail Kargo</label>
                  </div>

                  {/* Weight */}
                  <div className="mb-3">
                    <label className="calc-label">{t("calculator.weight")}</label>
                    <input type="number" min="0" step="0.1" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder={t("calculator.weightPlaceholder")} className="calc-input" />
                  </div>

                  {/* Dimensions */}
                  <div className="mb-3">
                    <label className="calc-label flex items-center gap-2">
                      {t("calculator.length")} × {t("calculator.width")} × {t("calculator.height")}
                      {cbmAuto !== null && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE" }}>
                          <Sparkles className="h-2.5 w-2.5" />
                          {service === "seaFreight" ? `${cbmAuto.toFixed(3)} CBM` : `Vol.W: ${(cbmAuto / 6000 * 1e6).toFixed(1)} kg`}
                        </span>
                      )}
                    </label>
                    <div className="grid grid-cols-3 gap-2.5">
                      <input type="number" min="0" step="0.1" value={length} onChange={(e) => setLength(e.target.value)} placeholder="P (cm)" className="calc-input" />
                      <input type="number" min="0" step="0.1" value={width}  onChange={(e) => setWidth(e.target.value)}  placeholder="L (cm)" className="calc-input" />
                      <input type="number" min="0" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="T (cm)" className="calc-input" />
                    </div>
                  </div>

                  {/* Cargo type + value */}
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div>
                      <label className="calc-label">{t("calculator.cargoType")}</label>
                      <input type="text" list="cargo-type-list" value={cargoType} onChange={(e) => setCargoType(e.target.value)} placeholder={t("calculator.cargoPlaceholder")} className="calc-input" autoComplete="off" />
                      {cargoTypes.length > 0 && <datalist id="cargo-type-list">{cargoTypes.map((ct) => <option key={ct} value={ct} />)}</datalist>}
                    </div>
                    <div>
                      <label className="calc-label flex items-center gap-1.5">
                        {t("calculator.cargoValue")}
                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background:"#F0FDF4", color:"#15803D", border:"1px solid #BBF7D0" }}>
                          <Lock className="h-2.5 w-2.5" /> Auto
                        </span>
                      </label>
                      <div className="relative">
                        <input type="text" readOnly value={cargoValueAuto !== null ? formatIDR(cargoValueAuto) : ""} placeholder={service && service !== "projectCargo" ? "Isi berat / dimensi" : "Pilih layanan dulu"} className="calc-input" />
                        {cargoValueAuto !== null && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background:"#EFF6FF", color:"#1D4ED8", border:"1px solid #BFDBFE" }}>Estimasi</span>
                          </div>
                        )}
                      </div>
                      {service && service !== "projectCargo" && (
                        <p className="text-[10.5px] text-slate-400 mt-1 leading-relaxed">
                          {service === "airFreight" && `Tarif: ${formatIDR(rates.airFreight.ratePerKg)}/kg (chargeable weight)`}
                          {service === "seaFreight" && `Tarif: ${formatIDR(rates.seaFreight.ratePerCbm)}/CBM`}
                          {service === "customs"    && `Tarif: ${formatIDR(rates.customs.ratePerKg)}/kg + bea ${rates.customs.customsPct}%`}
                          {service === "domestic"   && `Tarif: ${formatIDR(rates.domestic.ratePerKg)}/kg`}
                          {service === "warehousing"&& `Tarif: ${formatIDR(rates.warehousing.ratePerCbm)}/CBM per bulan`}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Step 4: Options ── */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-white flex-shrink-0" style={{ background:"linear-gradient(135deg,#0B5CAD,#1A73D4)" }}>4</span>
                    <label className="text-[12.5px] font-bold text-slate-700 uppercase tracking-wide">Incoterms & Opsi Tambahan</label>
                  </div>

                  <div className="mb-3">
                    <label className="calc-label">{t("calculator.incoterms")}</label>
                    <select value={incoterms} onChange={(e) => setIncoterms(e.target.value)} className="calc-select">
                      <option value="">{t("calculator.selectIncoterms")}</option>
                      {["EXW","FOB","CIF","CFR","DAP","DDP","FCA","CPT"].map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <label className={`option-toggle${insurance ? " option-toggle-active" : ""}`}>
                      <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                      <div>
                        <p className="text-[12.5px] font-semibold text-slate-700 leading-tight">{t("calculator.insurance")}</p>
                        <p className="text-[10.5px] text-slate-400">+0.5% dari nilai kargo</p>
                      </div>
                    </label>
                    <label className={`option-toggle${express ? " option-toggle-active" : ""}`}>
                      <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                      <div>
                        <p className="text-[12.5px] font-semibold text-slate-700 leading-tight">{t("calculator.express")}</p>
                        <p className="text-[10.5px] text-slate-400">+20% layanan prioritas</p>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Error */}
                {error && (
                  <div className="flex items-center gap-2 text-red-600 rounded-xl px-4 py-3 text-[13px] font-medium" style={{ background:"#FEF2F2", border:"1.5px solid #FECACA" }}>
                    <Info className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                {/* CTA */}
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-2.5 font-bold rounded-xl transition-all duration-200 select-none"
                  style={{
                    height: "48px",
                    fontSize: "14.5px",
                    background: "linear-gradient(135deg, #0B5CAD 0%, #1A73D4 50%, #2B8FE8 100%)",
                    color: "white",
                    boxShadow: "0 4px 20px rgba(11,92,173,0.35), 0 2px 6px rgba(11,92,173,0.20), inset 0 1px 0 rgba(255,255,255,0.18)",
                    border: "none",
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "translateY(-1px)";
                    el.style.boxShadow = "0 8px 28px rgba(11,92,173,0.40), 0 3px 10px rgba(11,92,173,0.25), inset 0 1px 0 rgba(255,255,255,0.18)";
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement;
                    el.style.transform = "translateY(0)";
                    el.style.boxShadow = "0 4px 20px rgba(11,92,173,0.35), 0 2px 6px rgba(11,92,173,0.20), inset 0 1px 0 rgba(255,255,255,0.18)";
                  }}
                >
                  <Calculator className="h-5 w-5" />
                  {t("calculator.calculate")}
                  <ChevronRight className="h-4 w-4 opacity-70" />
                </button>
              </form>
            </div>
          </div>

          {/* ── Right Panel ── */}
          <div className="lg:col-span-2 space-y-4">

            {/* Result */}
            {!calculated ? (
              <div className="calc-card p-6 text-center">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}>
                  <Calculator className="h-7 w-7" style={{ color:"#3B82F6" }} />
                </div>
                <h3 className="font-bold text-slate-700 text-[15px] mb-1.5">{t("calculator.result")}</h3>
                <p className="text-slate-400 text-[12.5px] leading-relaxed max-w-[220px] mx-auto">
                  Isi form di sebelah kiri, lalu tekan tombol Hitung Estimasi
                </p>
                <div className="mt-5 pt-4 border-t border-slate-100 grid grid-cols-3 gap-2">
                  {[
                    { label: "Transparan", icon: "📊" },
                    { label: "Real-time", icon: "⚡" },
                    { label: "Terpercaya", icon: "🛡️" },
                  ].map((f) => (
                    <div key={f.label} className="text-center">
                      <div className="text-lg mb-1">{f.icon}</div>
                      <p className="text-[10.5px] font-semibold text-slate-500">{f.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : result?.isProjectCargo ? (
              <div className="calc-card p-6 text-center result-appear" style={{ border:"1.5px solid #FDE68A" }}>
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4" style={{ background:"linear-gradient(135deg,#FFFBEB,#FEF3C7)" }}>
                  <Globe className="h-7 w-7 text-amber-500" />
                </div>
                <h3 className="font-bold text-slate-800 text-[16px] mb-2">{t("calculator.services.projectCargo")}</h3>
                <p className="text-slate-600 text-[12.5px] mb-5 leading-relaxed">{t("calculator.projectNote")}</p>
                <div className="space-y-2.5">
                  <Link href="/jasa">
                    <Button className="w-full h-10 gap-2 text-[13px] font-bold rounded-xl" style={{ background:"linear-gradient(135deg,#D97706,#F59E0B)", border:"none", boxShadow:"0 4px 14px rgba(217,119,6,0.35)" }}>
                      {t("calculator.ctaQuote")} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <a href="#kontak">
                    <Button variant="outline" className="w-full h-10 gap-2 rounded-xl text-[13px]" style={{ borderColor:"#FDE68A", color:"#92400E" }}>
                      <MessageCircle className="h-4 w-4" /> {t("calculator.ctaContact")}
                    </Button>
                  </a>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-3.5 result-appear">
                {/* Metrics (chargeable weight / CBM) */}
                {(result.chargeableWeight !== undefined || result.cbm !== undefined) && (
                  <div className="calc-card p-4" style={{ border:"1.5px solid #BFDBFE" }}>
                    <p className="text-[10.5px] font-bold uppercase tracking-widest text-blue-600 mb-2.5">Metrik Kargo</p>
                    <div className="grid grid-cols-2 gap-3">
                      {result.chargeableWeight !== undefined && (
                        <div className="rounded-xl p-3 text-center" style={{ background:"linear-gradient(135deg,#EFF6FF,#DBEAFE)" }}>
                          <p className="text-[10px] font-semibold text-blue-600 uppercase mb-1">Chargeable</p>
                          <p className="text-[18px] font-bold text-blue-800">{result.chargeableWeight}</p>
                          <p className="text-[10px] text-blue-500">kg</p>
                        </div>
                      )}
                      {result.cbm !== undefined && (
                        <div className="rounded-xl p-3 text-center" style={{ background:"linear-gradient(135deg,#F0FDFA,#CCFBF1)" }}>
                          <p className="text-[10px] font-semibold text-teal-600 uppercase mb-1">Volume</p>
                          <p className="text-[18px] font-bold text-teal-800">{result.cbm}</p>
                          <p className="text-[10px] text-teal-500">CBM</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="calc-card p-5">
                  <p className="text-[10.5px] font-bold uppercase tracking-widest text-slate-500 mb-3">Rincian Biaya</p>
                  <div className="space-y-0">
                    {[
                      { key: "baseCost",     val: result.baseCost,    icon: "📦" },
                      { key: "weightCost",   val: result.weightCost,  icon: "⚖️" },
                      { key: "handlingFee",  val: result.handlingFee, icon: "🔧" },
                      { key: "customsFee",   val: result.customsFee,  icon: "📋" },
                      ...(result.insuranceFee > 0 ? [{ key:"insuranceFee", val:result.insuranceFee, icon:"🛡️" }] : []),
                      ...(result.expressFee  > 0 ? [{ key:"expressFee",   val:result.expressFee,   icon:"⚡" }] : []),
                    ].map(({ key, val, icon }) => val > 0 ? (
                      <div key={key} className="result-row">
                        <span className="text-slate-500 flex items-center gap-1.5">
                          <span className="text-[12px]">{icon}</span>
                          {t(`calculator.${key}`)}
                        </span>
                        <span className="font-semibold text-slate-800 text-[13px]">{formatIDR(val)}</span>
                      </div>
                    ) : null)}
                  </div>

                  {/* Total */}
                  <div className="mt-4 pt-3.5 rounded-xl" style={{ borderTop:"2px solid #E2E8F0" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{t("calculator.total")}</p>
                        <p className="text-[10px] text-slate-400">Estimasi total</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold leading-tight" style={{ fontSize:"clamp(18px,2.2vw,26px)", color:"#0B5CAD" }}>
                          {formatIDR(result.total)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-2.5 rounded-xl p-3.5 text-[11.5px] leading-relaxed" style={{ background:"#FFFBEB", border:"1.5px solid #FDE68A", color:"#92400E" }}>
                  <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
                  <span><strong>Perhatian:</strong> {t("calculator.disclaimer")} Harga akhir akan dikonfirmasi oleh tim kami.</span>
                </div>

                {/* CTA */}
                <div className="space-y-2.5">
                  {/* Request Quote — primary CTA */}
                  {quoteSuccess ? (
                    <div className="flex items-start gap-3 rounded-xl px-4 py-3.5" style={{ background:"linear-gradient(135deg,#ECFDF5,#D1FAE5)", border:"1.5px solid #6EE7B7" }}>
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold text-emerald-800 text-[13px]">Permintaan terkirim!</p>
                        <p className="text-emerald-700 text-[11.5px] mt-0.5">Tim CST akan menghubungi Anda via WhatsApp dalam 1×24 jam kerja.</p>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowQuoteForm((v) => !v)}
                      className="w-full flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200"
                      style={{
                        height: "46px", fontSize: "13.5px",
                        background: showQuoteForm
                          ? "linear-gradient(135deg,#059669,#10B981)"
                          : "linear-gradient(135deg,#0B5CAD,#1A73D4)",
                        color: "white", border: "none",
                        boxShadow: showQuoteForm
                          ? "0 4px 16px rgba(5,150,105,0.35)"
                          : "0 4px 16px rgba(11,92,173,0.30)",
                      }}
                      onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(-1px)"; el.style.boxShadow = "0 8px 24px rgba(11,92,173,0.40)"; }}
                      onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.transform = "translateY(0)"; }}
                    >
                      <Send className="h-4 w-4" />
                      {showQuoteForm ? "Tutup Form" : "Request Quote — Minta Penawaran"}
                      {!showQuoteForm && <ArrowRight className="h-4 w-4 opacity-70" />}
                    </button>
                  )}

                  {/* Inline Quote Form */}
                  {showQuoteForm && !quoteSuccess && (
                    <div className="rounded-xl overflow-hidden" style={{ border:"1.5px solid #BFDBFE", background:"#F0F7FF", animation:"slide-up-fade 0.25s ease both" }}>
                      <div className="flex items-center justify-between px-4 py-3" style={{ background:"linear-gradient(135deg,#0B3D6B,#1A73D4)" }}>
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-white" />
                          <span className="font-bold text-white text-[13px]">Data Kontak Anda</span>
                        </div>
                        <button onClick={() => setShowQuoteForm(false)} className="text-white/70 hover:text-white transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <form onSubmit={handleQuoteSubmit} className="p-4 space-y-3">
                        <div>
                          <label className="calc-label">Nama Lengkap *</label>
                          <input
                            type="text"
                            value={quoteName}
                            onChange={(e) => setQuoteName(e.target.value)}
                            placeholder="Nama Anda"
                            className="calc-input"
                            required
                          />
                        </div>
                        <div>
                          <label className="calc-label">Nomor WhatsApp *</label>
                          <input
                            type="tel"
                            value={quoteWa}
                            onChange={(e) => setQuoteWa(e.target.value)}
                            placeholder="08xxxxxxxxxx"
                            className="calc-input"
                            required
                          />
                        </div>
                        <div>
                          <label className="calc-label">Email <span className="text-slate-400 normal-case font-normal">(opsional)</span></label>
                          <input
                            type="email"
                            value={quoteEmail}
                            onChange={(e) => setQuoteEmail(e.target.value)}
                            placeholder="email@domain.com"
                            className="calc-input"
                          />
                        </div>
                        {quoteError && (
                          <div className="flex items-center gap-2 text-red-600 rounded-lg px-3 py-2.5 text-[12px] font-medium" style={{ background:"#FEF2F2", border:"1.5px solid #FECACA" }}>
                            <Info className="h-3.5 w-3.5 shrink-0" /> {quoteError}
                          </div>
                        )}
                        <button
                          type="submit"
                          disabled={quoteSubmitting}
                          className="w-full flex items-center justify-center gap-2 font-bold rounded-xl transition-all duration-200 disabled:opacity-60"
                          style={{ height:"42px", fontSize:"13px", background:"linear-gradient(135deg,#059669,#10B981)", color:"white", border:"none", boxShadow:"0 4px 14px rgba(5,150,105,0.30)" }}
                        >
                          {quoteSubmitting ? (
                            <><RefreshCw className="h-4 w-4 animate-spin" /> Mengirim...</>
                          ) : (
                            <><Send className="h-4 w-4" /> Kirim Permintaan</>
                          )}
                        </button>
                        <p className="text-[10.5px] text-slate-400 text-center leading-relaxed">
                          Detail estimasi ini akan dikirim ke tim CST via WhatsApp & email.
                        </p>
                      </form>
                    </div>
                  )}

                  {/* Secondary CTAs */}
                  {!showQuoteForm && (
                    <div className="grid grid-cols-2 gap-2.5">
                      <a href="/#kontak">
                        <button className="w-full flex items-center justify-center gap-1.5 font-semibold rounded-xl border transition-all duration-150 hover:bg-slate-50" style={{ height:"38px", fontSize:"12px", borderColor:"#E2E8F0", color:"#475569" }}>
                          <MessageCircle className="h-3.5 w-3.5" /> Hubungi Kami
                        </button>
                      </a>
                      <Link href="/jasa">
                        <button className="w-full flex items-center justify-center gap-1.5 font-semibold rounded-xl border transition-all duration-150" style={{ height:"38px", fontSize:"12px", borderColor:"#BFDBFE", color:"#1D4ED8", background:"#EFF6FF" }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background="#DBEAFE"; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background="#EFF6FF"; }}
                        >
                          <Phone className="h-3.5 w-3.5" /> Lihat Layanan
                        </button>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {/* ── Formula Card ── */}
            <div className="rounded-2xl p-5" style={{ background:"linear-gradient(145deg,#0A1628,#0D2444)", border:"1px solid rgba(255,255,255,0.07)" }}>
              <div className="flex items-center gap-2 mb-3.5">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:"rgba(59,130,246,0.20)", border:"1px solid rgba(59,130,246,0.30)" }}>
                  <Info className="h-3.5 w-3.5 text-blue-400" />
                </div>
                <h4 className="font-bold text-white text-[13px]">Formula Kalkulator</h4>
              </div>
              <div className="space-y-2.5">
                {[
                  { icon: "🚢", name: "Sea Freight",  formula: "CBM = P×L×T (meter) · tarif per CBM" },
                  { icon: "✈️", name: "Air Freight",   formula: "CW = max(berat, P×L×T/6000) · tarif/kg" },
                  { icon: "🏠", name: "Warehousing",   formula: "Biaya dasar + tarif per CBM/bulan" },
                  { icon: "🚚", name: "Domestic",      formula: "Biaya dasar + tarif per kg" },
                  { icon: "🛡️", name: "Asuransi",      formula: "0.5% dari estimasi total" },
                  { icon: "⚡", name: "Express",       formula: "+20% dari subtotal" },
                ].map((f) => (
                  <div key={f.name} className="flex gap-2.5 text-[11px]">
                    <span className="shrink-0 w-5 text-center">{f.icon}</span>
                    <div>
                      <span className="font-semibold text-white">{f.name}:</span>
                      <span className="text-slate-400 ml-1">{f.formula}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3.5 pt-3 border-t text-[10.5px] text-slate-500" style={{ borderColor:"rgba(255,255,255,0.08)" }}>
                Tarif dikonfigurasi oleh admin
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
