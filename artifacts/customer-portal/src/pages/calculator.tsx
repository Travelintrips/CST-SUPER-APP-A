import { useState, useMemo, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Calculator, ArrowRight, Ship, Plane, Truck, Package,
  Warehouse, Globe, Info, RefreshCw, MessageCircle, Phone, Lock,
} from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";

type ServiceType = "seaFreight" | "airFreight" | "customs" | "domestic" | "warehousing" | "projectCargo" | "";

const SERVICE_ICONS: Record<string, React.ReactNode> = {
  seaFreight: <Ship className="h-5 w-5" />,
  airFreight: <Plane className="h-5 w-5" />,
  customs: <Package className="h-5 w-5" />,
  domestic: <Truck className="h-5 w-5" />,
  warehousing: <Warehouse className="h-5 w-5" />,
  projectCargo: <Globe className="h-5 w-5" />,
};

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

export default function CalculatorPage() {
  const { t } = useLanguage();

  const [rates, setRates] = useState<CalcRates>(DEFAULT_RATES);
  const [cargoTypes, setCargoTypes] = useState<string[]>([]);

  useEffect(() => {
    fetch("/api/portal/calculator-rates")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data) setRates(data as CalcRates); })
      .catch(() => undefined);
    fetch("/api/portal/cargo-types")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data)) setCargoTypes(data as string[]); })
      .catch(() => undefined);
  }, []);

  const [service, setService] = useState<ServiceType>("");
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
      res.total = 0;
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
    setService("");
    setOrigin("");
    setDestination("");
    setWeight("");
    setLength("");
    setWidth("");
    setHeight("");
    setCargoType("");
    setIncoterms("");
    setInsurance(false);
    setExpress(false);
    setResult(null);
    setCalculated(false);
    setError("");
  }

  const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500/40 focus:border-sky-400 transition-all placeholder:text-slate-400";
  const labelClass = "block text-sm font-semibold text-slate-700 mb-2";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-sky-50/30 to-white py-12 px-4">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 bg-sky-100 text-sky-700 px-4 py-2 rounded-full text-sm font-semibold mb-5">
            <Calculator className="h-4 w-4" />
            {t("calculator.label")}
          </div>
          <h1 className="text-3xl md:text-5xl font-display font-bold text-slate-900 mb-4">
            {t("calculator.title")}
          </h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto">
            {t("calculator.desc")}
          </p>
        </div>

        <div className="grid lg:grid-cols-5 gap-8 items-start">
          {/* Form */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8">
              <form onSubmit={handleCalculate} className="space-y-6">

                {/* Service Type */}
                <div>
                  <label className={labelClass}>{t("calculator.serviceType")}</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {(["seaFreight", "airFreight", "customs", "domestic", "warehousing", "projectCargo"] as ServiceType[]).map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => { setService(s); setCalculated(false); setResult(null); }}
                        className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all duration-200 ${
                          service === s
                            ? "border-sky-500 bg-sky-50 text-sky-700 shadow-sm"
                            : "border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:bg-sky-50/50"
                        }`}
                      >
                        <span className={service === s ? "text-sky-600" : "text-slate-400"}>
                          {SERVICE_ICONS[s]}
                        </span>
                        {t(`calculator.services.${s}`)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Origin & Destination */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>{t("calculator.origin")}</label>
                    <input
                      type="text"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder={t("calculator.originPlaceholder")}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t("calculator.destination")}</label>
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder={t("calculator.destinationPlaceholder")}
                      className={inputClass}
                    />
                  </div>
                </div>

                {/* Weight & Dimensions */}
                <div>
                  <label className={labelClass}>{t("calculator.weight")}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder={t("calculator.weightPlaceholder")}
                    className={inputClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>
                    {t("calculator.length")} × {t("calculator.width")} × {t("calculator.height")}
                    {cbmAuto !== null && (
                      <span className="ml-2 text-sky-600 font-semibold text-xs">
                        {service === "seaFreight"
                          ? `= ${cbmAuto.toFixed(3)} CBM`
                          : `Vol. Weight: ${(cbmAuto / 6000 * 1e6).toFixed(1)} kg`}
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <input type="number" min="0" step="0.1" value={length} onChange={(e) => setLength(e.target.value)}
                      placeholder="P (cm)" className={inputClass} />
                    <input type="number" min="0" step="0.1" value={width} onChange={(e) => setWidth(e.target.value)}
                      placeholder="L (cm)" className={inputClass} />
                    <input type="number" min="0" step="0.1" value={height} onChange={(e) => setHeight(e.target.value)}
                      placeholder="T (cm)" className={inputClass} />
                  </div>
                </div>

                {/* Cargo Details */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className={labelClass}>{t("calculator.cargoType")}</label>
                    <input
                      type="text"
                      list="cargo-type-list"
                      value={cargoType}
                      onChange={(e) => setCargoType(e.target.value)}
                      placeholder={t("calculator.cargoPlaceholder")}
                      className={inputClass}
                      autoComplete="off"
                    />
                    {cargoTypes.length > 0 && (
                      <datalist id="cargo-type-list">
                        {cargoTypes.map((ct) => <option key={ct} value={ct} />)}
                      </datalist>
                    )}
                  </div>
                  <div>
                    <label className={labelClass}>
                      {t("calculator.cargoValue")}
                      <span className="ml-2 inline-flex items-center gap-1 text-xs font-normal text-sky-600 bg-sky-50 border border-sky-200 rounded-full px-2 py-0.5">
                        <Lock className="h-2.5 w-2.5" /> Auto
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={cargoValueAuto !== null ? formatIDR(cargoValueAuto) : ""}
                        placeholder={service && service !== "projectCargo"
                          ? "Isi berat / dimensi untuk estimasi"
                          : "Pilih jenis layanan dulu"}
                        className={`${inputClass} bg-slate-50 text-slate-600 cursor-not-allowed`}
                      />
                      {cargoValueAuto !== null && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <span className="text-xs text-sky-600 font-semibold bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                            Estimasi
                          </span>
                        </div>
                      )}
                    </div>
                    {service && service !== "projectCargo" && (
                      <p className="text-xs text-slate-500 mt-1">
                        {service === "airFreight" && `★ Tarif: ${formatIDR(rates.airFreight.ratePerKg)}/kg (chargeable weight)`}
                        {service === "seaFreight" && `★ Tarif: ${formatIDR(rates.seaFreight.ratePerCbm)}/CBM`}
                        {service === "customs" && `★ Tarif: ${formatIDR(rates.customs.ratePerKg)}/kg + bea masuk ${rates.customs.customsPct}%`}
                        {service === "domestic" && `★ Tarif: ${formatIDR(rates.domestic.ratePerKg)}/kg`}
                        {service === "warehousing" && `★ Tarif: ${formatIDR(rates.warehousing.ratePerCbm)}/CBM per bulan`}
                      </p>
                    )}
                    {(!service || service === "projectCargo") && (
                      <p className="text-xs text-slate-400 mt-1">Dihitung otomatis berdasarkan tarif yang berlaku</p>
                    )}
                  </div>
                </div>

                {/* Incoterms */}
                <div>
                  <label className={labelClass}>{t("calculator.incoterms")}</label>
                  <select value={incoterms} onChange={(e) => setIncoterms(e.target.value)} className={inputClass}>
                    <option value="">{t("calculator.selectIncoterms")}</option>
                    {["EXW", "FOB", "CIF", "CFR", "DAP", "DDP", "FCA", "CPT"].map((i) => (
                      <option key={i} value={i}>{i}</option>
                    ))}
                  </select>
                </div>

                {/* Options */}
                <div className="flex flex-col sm:flex-row gap-4">
                  <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    insurance ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                    <input type="checkbox" checked={insurance} onChange={(e) => setInsurance(e.target.checked)} className="w-4 h-4 accent-sky-600" />
                    <span className="text-sm font-medium text-slate-700">{t("calculator.insurance")}</span>
                  </label>
                  <label className={`flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${
                    express ? "border-sky-500 bg-sky-50" : "border-slate-200 hover:border-slate-300"
                  }`}>
                    <input type="checkbox" checked={express} onChange={(e) => setExpress(e.target.checked)} className="w-4 h-4 accent-sky-600" />
                    <span className="text-sm font-medium text-slate-700">{t("calculator.express")}</span>
                  </label>
                </div>

                {error && (
                  <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
                    <Info className="h-4 w-4 shrink-0" />
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button type="submit" className="flex-1 h-12 text-base gap-2 rounded-xl bg-sky-600 hover:bg-sky-700">
                    <Calculator className="h-5 w-5" />
                    {t("calculator.calculate")}
                  </Button>
                  {calculated && (
                    <Button type="button" variant="outline" onClick={handleReset} className="h-12 px-4 rounded-xl">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>
            </div>
          </div>

          {/* Result Panel */}
          <div className="lg:col-span-2 space-y-5">
            {!calculated ? (
              <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-8 text-center">
                <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
                  <Calculator className="h-8 w-8 text-slate-400" />
                </div>
                <h3 className="font-bold text-slate-700 text-lg mb-2">{t("calculator.result")}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  {t("calculator.desc")}
                </p>
              </div>
            ) : result?.isProjectCargo ? (
              <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-3xl border border-amber-200 p-8 text-center">
                <Globe className="h-10 w-10 text-amber-500 mx-auto mb-4" />
                <h3 className="font-bold text-slate-800 text-xl mb-3">{t("calculator.services.projectCargo")}</h3>
                <p className="text-slate-600 text-sm mb-6">{t("calculator.projectNote")}</p>
                <div className="space-y-3">
                  <Link href="/jasa">
                    <Button className="w-full h-11 gap-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl">
                      {t("calculator.ctaQuote")} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <a href="#kontak">
                    <Button variant="outline" className="w-full h-11 gap-2 rounded-xl border-amber-300">
                      <MessageCircle className="h-4 w-4" />
                      {t("calculator.ctaContact")}
                    </Button>
                  </a>
                </div>
              </div>
            ) : result ? (
              <div className="space-y-4">
                {/* Cost Breakdown */}
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                  <h3 className="font-bold text-slate-800 text-lg mb-5">{t("calculator.result")}</h3>

                  {(result.chargeableWeight !== undefined || result.cbm !== undefined) && (
                    <div className="bg-sky-50 rounded-xl p-4 mb-5 text-sm">
                      {result.chargeableWeight !== undefined && (
                        <div className="flex justify-between text-sky-700">
                          <span>{t("calculator.chargeableWeight")}</span>
                          <span className="font-bold">{result.chargeableWeight} kg</span>
                        </div>
                      )}
                      {result.cbm !== undefined && (
                        <div className="flex justify-between text-sky-700">
                          <span>{t("calculator.cbm")}</span>
                          <span className="font-bold">{result.cbm} CBM</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="space-y-3">
                    {[
                      { key: "baseCost", val: result.baseCost },
                      { key: "weightCost", val: result.weightCost },
                      { key: "handlingFee", val: result.handlingFee },
                      { key: "customsFee", val: result.customsFee },
                      ...(result.insuranceFee > 0 ? [{ key: "insuranceFee", val: result.insuranceFee }] : []),
                      ...(result.expressFee > 0 ? [{ key: "expressFee", val: result.expressFee }] : []),
                    ].map(({ key, val }) => val > 0 ? (
                      <div key={key} className="flex justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                        <span className="text-slate-600">{t(`calculator.${key}`)}</span>
                        <span className="font-semibold text-slate-800">{formatIDR(val)}</span>
                      </div>
                    ) : null)}
                  </div>

                  <div className="mt-5 pt-4 border-t-2 border-slate-200 flex justify-between items-center">
                    <span className="font-bold text-slate-800">{t("calculator.total")}</span>
                    <span className="text-2xl font-bold text-sky-600">{formatIDR(result.total)}</span>
                  </div>
                </div>

                {/* Disclaimer */}
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-800">
                  <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
                  {t("calculator.disclaimer")}
                </div>

                {/* CTA Buttons */}
                <div className="space-y-3">
                  <Link href="/jasa">
                    <Button className="w-full h-12 gap-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-base">
                      {t("calculator.ctaQuote")} <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                  <div className="grid grid-cols-2 gap-3">
                    <a href="/#kontak">
                      <Button variant="outline" className="w-full h-11 gap-2 rounded-xl text-sm">
                        <MessageCircle className="h-4 w-4" />
                        {t("calculator.ctaContact")}
                      </Button>
                    </a>
                    <Link href="/jasa">
                      <Button variant="outline" className="w-full h-11 gap-2 rounded-xl text-sm border-sky-200 text-sky-700 hover:bg-sky-50">
                        <Phone className="h-4 w-4" />
                        {t("calculator.ctaSend")}
                      </Button>
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Info Card */}
            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white">
              <h4 className="font-bold mb-3 text-base">Formula Kalkulator</h4>
              <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
                <p>🚢 <strong className="text-white">Sea Freight:</strong> CBM = P×L×T (meter), tarif per CBM</p>
                <p>✈️ <strong className="text-white">Air Freight:</strong> Chargeable = max(berat, P×L×T/6000), tarif per kg</p>
                <p>🏠 <strong className="text-white">Warehousing:</strong> Biaya dasar + tarif per CBM/bulan</p>
                <p>🚚 <strong className="text-white">Domestic:</strong> Biaya dasar + tarif per kg</p>
                <p>🛡️ <strong className="text-white">Asuransi:</strong> 0.5% dari estimasi biaya</p>
                <p>⚡ <strong className="text-white">Express:</strong> +20% dari subtotal</p>
                <p className="text-slate-400 pt-1 border-t border-slate-700">Tarif dikonfigurasi oleh admin</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
