import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, Ship, Plane, Package, Warehouse, Truck, FileCheck,
  Shield, FileText, ArrowRight, ChevronRight, Scale, Calculator,
} from "lucide-react";
import { useListPortalServices } from "@workspace/api-client-react";
import { resolveImageUrl } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { useLanguage } from "@/i18n/LanguageContext";
import { translateServiceName, translateCategory } from "@/i18n/serviceData";

const ICON_BY_CATEGORY: Record<string, LucideIcon> = {
  "Udara": Plane,
  "Laut": Ship,
  "Trucking": Truck,
  "Container": Package,
  "Pabean": FileCheck,
  "Handling": Package,
  "Storage": Warehouse,
  "Document": FileText,
  "Additional": Shield,
  "Freight Forwarding": Ship,
  "Lainnya": Shield,
};

const COLOR_BY_CATEGORY: Record<string, { bg: string; text: string; badge: string }> = {
  "Udara":             { bg: "bg-blue-50",    text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
  "Laut":              { bg: "bg-indigo-50",  text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700" },
  "Trucking":          { bg: "bg-amber-50",   text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  "Container":         { bg: "bg-violet-50",  text: "text-violet-700", badge: "bg-violet-100 text-violet-700" },
  "Pabean":            { bg: "bg-orange-50",  text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  "Handling":          { bg: "bg-purple-50",  text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  "Storage":           { bg: "bg-teal-50",    text: "text-teal-700",   badge: "bg-teal-100 text-teal-700" },
  "Document":          { bg: "bg-slate-50",   text: "text-slate-700",  badge: "bg-slate-100 text-slate-700" },
  "Additional":        { bg: "bg-pink-50",    text: "text-pink-700",   badge: "bg-pink-100 text-pink-700" },
  "Freight Forwarding":{ bg: "bg-cyan-50",    text: "text-cyan-700",   badge: "bg-cyan-100 text-cyan-700" },
  "Lainnya":           { bg: "bg-gray-50",    text: "text-gray-700",   badge: "bg-gray-100 text-gray-700" },
};

const DEFAULT_COLOR = { bg: "bg-blue-50", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" };

const CARD_ACCENT: Record<string, { overlay: string; hoverShadow: string; hoverBorder: string; iconBg: string }> = {
  "Udara":              { overlay: "rgba(59,130,246,0.22)",  hoverShadow: "0 10px 36px rgba(59,130,246,0.18)",  hoverBorder: "rgba(59,130,246,0.28)",  iconBg: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" },
  "Laut":               { overlay: "rgba(67,56,202,0.22)",   hoverShadow: "0 10px 36px rgba(67,56,202,0.16)",   hoverBorder: "rgba(67,56,202,0.26)",   iconBg: "linear-gradient(135deg,#EEF2FF,#C7D2FE)" },
  "Trucking":           { overlay: "rgba(71,85,105,0.24)",   hoverShadow: "0 10px 36px rgba(71,85,105,0.16)",   hoverBorder: "rgba(71,85,105,0.26)",   iconBg: "linear-gradient(135deg,#F1F5F9,#E2E8F0)" },
  "Container":          { overlay: "rgba(109,40,217,0.20)",  hoverShadow: "0 10px 36px rgba(109,40,217,0.16)",  hoverBorder: "rgba(109,40,217,0.26)",  iconBg: "linear-gradient(135deg,#F5F3FF,#DDD6FE)" },
  "Pabean":             { overlay: "rgba(194,65,12,0.22)",   hoverShadow: "0 10px 36px rgba(194,65,12,0.16)",   hoverBorder: "rgba(194,65,12,0.26)",   iconBg: "linear-gradient(135deg,#FFF7ED,#FED7AA)" },
  "Handling":           { overlay: "rgba(126,34,206,0.20)",  hoverShadow: "0 10px 36px rgba(126,34,206,0.16)",  hoverBorder: "rgba(126,34,206,0.24)",  iconBg: "linear-gradient(135deg,#FAF5FF,#E9D5FF)" },
  "Storage":            { overlay: "rgba(15,118,110,0.20)",  hoverShadow: "0 10px 36px rgba(15,118,110,0.16)",  hoverBorder: "rgba(15,118,110,0.24)",  iconBg: "linear-gradient(135deg,#F0FDFA,#CCFBF1)" },
  "Document":           { overlay: "rgba(71,85,105,0.18)",   hoverShadow: "0 10px 36px rgba(71,85,105,0.14)",   hoverBorder: "rgba(71,85,105,0.22)",   iconBg: "linear-gradient(135deg,#F8FAFC,#E2E8F0)" },
  "Additional":         { overlay: "rgba(190,24,93,0.20)",   hoverShadow: "0 10px 36px rgba(190,24,93,0.16)",   hoverBorder: "rgba(190,24,93,0.24)",   iconBg: "linear-gradient(135deg,#FDF2F8,#FBCFE8)" },
  "Freight Forwarding": { overlay: "rgba(8,145,178,0.22)",   hoverShadow: "0 10px 36px rgba(8,145,178,0.18)",   hoverBorder: "rgba(8,145,178,0.28)",   iconBg: "linear-gradient(135deg,#ECFEFF,#CFFAFE)" },
  "Lainnya":            { overlay: "rgba(75,85,99,0.18)",    hoverShadow: "0 10px 36px rgba(75,85,99,0.14)",    hoverBorder: "rgba(75,85,99,0.22)",    iconBg: "linear-gradient(135deg,#F9FAFB,#E5E7EB)" },
};
const DEFAULT_ACCENT = { overlay: "rgba(59,130,246,0.20)", hoverShadow: "0 10px 36px rgba(59,130,246,0.16)", hoverBorder: "rgba(59,130,246,0.26)", iconBg: "linear-gradient(135deg,#EFF6FF,#DBEAFE)" };

const stripJasa = (name: string) => name.replace(/^Jasa\s+/i, "");

export default function Jasa() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { t, locale } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<string>("__all__");

  const { data: servicesRaw, isLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServicesJasa"] },
  });

  const services = Array.isArray(servicesRaw) ? servicesRaw : [];

  const allCategories = Array.from(
    new Set(services.flatMap((s) => s.categories ?? []))
  ).sort();

  const filtered = services.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      translateServiceName(s.name, locale).toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q) ||
      (s.categories ?? []).some((c) =>
        c.toLowerCase().includes(q) || translateCategory(c, locale).toLowerCase().includes(q)
      );
    const matchCat =
      activeCategory === "__all__" ||
      (s.categories ?? []).includes(activeCategory);
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen pb-24" style={{ background: "#F8FAFC" }}>

      {/* ── Hero Banner ────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0B3D6B 0%, #0D6EBF 55%, #1E9FE8 100%)",
          padding: "clamp(52px, 8vw, 88px) 0 clamp(40px, 6vw, 68px)",
        }}
      >
        {/* Dot pattern */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        {/* Left vignette */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(100deg, rgba(5,20,50,0.50) 0%, rgba(5,20,50,0.20) 45%, transparent 70%)",
          }}
        />
        {/* Decorative glow orbs */}
        <div
          aria-hidden="true"
          className="jasa-glow-layer"
          style={{
            position: "absolute", right: "-2%", top: "50%", transform: "translateY(-50%)",
            width: "55%", height: "90%",
            background: [
              "radial-gradient(circle at 20% 42%, rgba(255,255,255,0.90) 0 3.5px, transparent 6px)",
              "radial-gradient(circle at 40% 30%, rgba(255,255,255,0.85) 0 3px, transparent 5px)",
              "radial-gradient(circle at 63% 50%, rgba(255,255,255,0.85) 0 3px, transparent 5px)",
              "radial-gradient(circle at 79% 33%, rgba(255,255,255,0.80) 0 2.5px, transparent 5px)",
              "radial-gradient(circle at 73% 70%, rgba(255,255,255,0.80) 0 2.5px, transparent 5px)",
              "radial-gradient(circle at 20% 42%, rgba(255,255,255,0.18) 0 18px, transparent 40px)",
              "radial-gradient(circle at 40% 30%, rgba(255,255,255,0.14) 0 15px, transparent 36px)",
              "radial-gradient(circle at 63% 50%, rgba(255,255,255,0.14) 0 15px, transparent 36px)",
              "linear-gradient(28deg, transparent 18%, rgba(255,255,255,0.12) 19%, transparent 21%)",
              "linear-gradient(148deg, transparent 34%, rgba(255,255,255,0.10) 35%, transparent 37%)",
              "radial-gradient(ellipse at center, rgba(255,255,255,0.10) 0%, transparent 65%)",
            ].join(", "),
            borderRadius: "999px",
            opacity: 0.9,
            filter: "drop-shadow(0 0 36px rgba(255,255,255,0.15))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        {/* Route SVG overlay */}
        <div
          aria-hidden="true"
          className="jasa-routes-layer"
          style={{
            position: "absolute", right: "4%", top: "20%",
            width: "46%", height: "60%",
            backgroundImage: "url(/images/logistics-routes.svg)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            backgroundPosition: "center right",
            opacity: 0.40,
            filter: "drop-shadow(0 0 20px rgba(255,255,255,0.18))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <style>{`
          @media (max-width: 768px) {
            .jasa-glow-layer { width: 95% !important; height: 75% !important; right: -38% !important; opacity: 0.40 !important; }
            .jasa-routes-layer { width: 90% !important; right: -42% !important; opacity: 0.18 !important; filter: none !important; }
          }
        `}</style>

        <div className="max-w-6xl mx-auto px-4 md:px-8" style={{ position: "relative", zIndex: 2 }}>
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p
                className="font-semibold uppercase tracking-widest mb-3"
                style={{ fontSize: "10.5px", letterSpacing: "0.18em", color: "rgba(255,255,255,0.78)" }}
              >
                {t("jasa.catalogLabel")}
              </p>
              <h1
                className="font-display text-white"
                style={{
                  fontSize: "clamp(26px, 3.8vw, 50px)",
                  fontWeight: 800,
                  lineHeight: 1.08,
                  letterSpacing: "-0.01em",
                  textShadow: "0 4px 24px rgba(0,0,0,0.22)",
                }}
              >
                {t("jasa.title")}
              </h1>
              <p
                className="mt-3 hidden md:block"
                style={{ fontSize: "14px", color: "rgba(255,255,255,0.68)", maxWidth: "380px", lineHeight: 1.6 }}
              >
                Temukan layanan logistik terpercaya sesuai kebutuhan bisnis Anda
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full md:w-80 shrink-0">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: "15px", height: "15px", color: "rgba(255,255,255,0.80)" }}
              />
              <input
                id="jasa-hero-search"
                type="text"
                placeholder={t("jasa.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full focus:outline-none"
                style={{
                  paddingLeft: "42px", paddingRight: "16px",
                  paddingTop: "12px", paddingBottom: "12px",
                  background: "rgba(255,255,255,0.13)",
                  border: "1.5px solid rgba(255,255,255,0.30)",
                  backdropFilter: "blur(16px)",
                  WebkitBackdropFilter: "blur(16px)",
                  borderRadius: "12px",
                  fontSize: "13.5px",
                  color: "white",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 2.5px rgba(255,255,255,0.40), 0 8px 32px rgba(0,0,0,0.18)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.60)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = "0 8px 32px rgba(0,0,0,0.18)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)";
                }}
              />
              <style>{`#jasa-hero-search::placeholder { color: rgba(255,255,255,0.60); }`}</style>
            </div>
          </div>
        </div>
      </div>

      {/* ── Page Body ──────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-7">

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2 mb-7">
          <button
            key="__all__"
            onClick={() => setActiveCategory("__all__")}
            className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all border ${
              activeCategory === "__all__"
                ? "bg-[#0B5CAD] text-white border-[#0B5CAD] shadow-md shadow-blue-200"
                : "bg-white text-slate-500 border-slate-200 hover:border-[#0B5CAD]/40 hover:text-slate-700 hover:shadow-sm"
            }`}
          >
            {t("jasa.all")}
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-1.5 rounded-full text-[13px] font-medium transition-all border ${
                activeCategory === cat
                  ? "bg-[#0B5CAD] text-white border-[#0B5CAD] shadow-md shadow-blue-200"
                  : "bg-white text-slate-500 border-slate-200 hover:border-[#0B5CAD]/40 hover:text-slate-700 hover:shadow-sm"
              }`}
            >
              {translateCategory(cat, locale)}
            </button>
          ))}
        </div>

        {/* ── Featured service banners ── */}
        <div className="mb-8 space-y-4">

          {/* Freight Forwarding */}
          <div
            className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5 jasa-ff-card"
            style={{
              background: [
                "radial-gradient(ellipse at 7% 50%, rgba(59,130,246,0.13) 0%, transparent 52%)",
                "repeating-linear-gradient(-52deg, transparent 0px, transparent 26px, rgba(96,165,250,0.065) 26px, rgba(96,165,250,0.065) 27px)",
                "linear-gradient(130deg, #EBF5FF 0%, #DBEAFE 50%, #BAE6FD 82%, #DDFAFF 100%)",
              ].join(", "),
              border: "1.5px solid rgba(59,130,246,0.22)",
              boxShadow: "0 6px 28px rgba(59,130,246,0.11), 0 1px 4px rgba(59,130,246,0.06), inset 0 1px 0 rgba(255,255,255,0.88)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 38px rgba(59,130,246,0.18), 0 2px 8px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.88)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(59,130,246,0.11), 0 1px 4px rgba(59,130,246,0.06), inset 0 1px 0 rgba(255,255,255,0.88)"; }}
          >
            <div className="flex items-start gap-4 flex-1 min-w-0">
              {/* Icon cluster */}
              <div className="flex gap-2 shrink-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(37,99,235,0.13)",
                    boxShadow: "0 0 0 6px rgba(37,99,235,0.06), 0 2px 8px rgba(37,99,235,0.16)",
                  }}
                >
                  <Ship className="h-5 w-5 text-blue-700" />
                </div>
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(14,165,233,0.13)",
                    boxShadow: "0 0 0 6px rgba(14,165,233,0.06), 0 2px 8px rgba(14,165,233,0.16)",
                  }}
                >
                  <Plane className="h-5 w-5 text-sky-600" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-tight">Freight Forwarding</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {([
                    { label: t("jasa.importLabel"), dir: "Impor" },
                    { label: t("jasa.exportLabel"), dir: "Ekspor" },
                    { label: t("jasa.domesticLabel"), dir: "Domestic" },
                  ] as Array<{ label: string; dir: string }>).map(({ label, dir }) => (
                    <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0" onClick={() => setLocation(`/freight-forwarding?direction=${dir}`)} style={{cursor:"pointer"}}>{label}</Badge>
                  ))}
                  <span className="text-[10px] text-slate-400 self-center">×</span>
                  {[translateCategory("Laut", locale), translateCategory("Udara", locale)].map((m) => (
                    <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0 border-blue-200 text-blue-600">{m}</Badge>
                  ))}
                  <span className="text-[10px] text-slate-400 self-center">×</span>
                  {["D2D", "D2P", "P2D", "P2P"].map((v) => (
                    <Badge key={v} className="text-[10px] px-1.5 py-0 bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">{v}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/freight-forwarding")}
              className="gap-2 shrink-0 bg-blue-700 hover:bg-blue-800 text-white shadow-md shadow-blue-200 px-5"
            >
              {t("jasa.createOrder")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Pengurusan Pabean / PPJK */}
          <div
            className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5"
            style={{
              background: [
                "radial-gradient(ellipse at 50% 44%, rgba(255,255,255,0.64) 0%, transparent 56%)",
                `url("data:image/svg+xml,%3Csvg width='20' height='20' xmlns='http://www.w3.org/2000/svg'%3E%3Ccircle cx='2' cy='2' r='1.2' fill='%23D97706' fill-opacity='0.11'/%3E%3C/svg%3E")`,
                "linear-gradient(130deg, #FFFBEB 0%, #FEF3C7 40%, #FFEDD5 78%, #FFF7EE 100%)",
              ].join(", "),
              border: "1.5px solid rgba(217,119,6,0.22)",
              boxShadow: "0 6px 28px rgba(217,119,6,0.10), 0 1px 4px rgba(217,119,6,0.05), inset 0 1px 0 rgba(255,255,255,0.95)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 38px rgba(217,119,6,0.17), 0 2px 8px rgba(217,119,6,0.07), inset 0 1px 0 rgba(255,255,255,0.95)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(217,119,6,0.10), 0 1px 4px rgba(217,119,6,0.05), inset 0 1px 0 rgba(255,255,255,0.95)"; }}
          >
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="flex gap-2 shrink-0">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(234,88,12,0.13)",
                    boxShadow: "0 0 0 6px rgba(234,88,12,0.06), 0 2px 8px rgba(234,88,12,0.16)",
                  }}
                >
                  <FileCheck className="h-5 w-5 text-orange-700" />
                </div>
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{
                    background: "rgba(217,119,6,0.13)",
                    boxShadow: "0 0 0 6px rgba(217,119,6,0.06), 0 2px 8px rgba(217,119,6,0.16)",
                  }}
                >
                  <Scale className="h-5 w-5 text-amber-700" />
                </div>
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-tight">{t("jasa.customsTitle")}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {([
                    { label: "PIB/PEB", svc: "pib_peb" },
                    { label: "Handling Clearance", svc: "handling" },
                    { label: "Undername", svc: "undername" },
                  ] as Array<{ label: string; svc: string }>).map(({ label, svc }) => (
                    <Badge key={label} className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100" onClick={() => setLocation(`/pabean?service=${svc}`)} style={{cursor:"pointer"}}>{label}</Badge>
                  ))}
                  <span className="text-[10px] text-slate-400 self-center">×</span>
                  {[t("jasa.importLabel"), t("jasa.exportLabel")].map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0">{d}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/pabean")}
              className="gap-2 shrink-0 bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-200 px-5"
            >
              {t("jasa.submitService")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ── Service grid ── */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-52 rounded-2xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="CST Logistics" className="h-8 w-auto object-contain opacity-60" />
            </div>
            <p className="text-sm">{t("jasa.noMatches")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {filtered.map((service) => {
              const primaryCat = (service.categories ?? [])[0] ?? "";
              const Icon = ICON_BY_CATEGORY[primaryCat] ?? Package;
              const colors = COLOR_BY_CATEGORY[primaryCat] ?? DEFAULT_COLOR;
              const accent = CARD_ACCENT[primaryCat] ?? DEFAULT_ACCENT;
              const imgUrl = resolveImageUrl(service.imageUrl);
              return (
                <Link key={service.id} href={`/jasa/${service.id}`} className="block group">
                  <Card
                    className="h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5"
                    style={{
                      border: "1.5px solid #E8EDF3",
                      borderRadius: "16px",
                      boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = accent.hoverShadow;
                      (e.currentTarget as HTMLElement).style.borderColor = accent.hoverBorder;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
                      (e.currentTarget as HTMLElement).style.borderColor = "#E8EDF3";
                    }}
                  >
                    {imgUrl ? (
                      <div className="h-36 overflow-hidden relative">
                        <img
                          src={imgUrl}
                          alt={stripJasa(service.name)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-400"
                        />
                        {/* Subtle category-tinted gradient overlay on image */}
                        <div
                          aria-hidden="true"
                          style={{
                            position: "absolute", inset: 0, pointerEvents: "none",
                            background: `linear-gradient(to bottom, transparent 40%, ${accent.overlay} 100%)`,
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        style={{
                          height: "112px",
                          background: accent.iconBg,
                          borderBottom: "1px solid rgba(0,0,0,0.05)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {Icon === Package
                          ? <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="CST Logistics" className="h-11 w-auto max-w-[80px] object-contain opacity-70" />
                          : <Icon className={`h-11 w-11 ${colors.text} opacity-55`} />}
                      </div>
                    )}

                    <CardHeader className="pb-1.5 pt-3.5 px-4">
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {(service.categories ?? []).map((cat) => (
                          <Badge
                            key={cat}
                            className={`text-[9.5px] px-1.5 py-0 font-semibold ${COLOR_BY_CATEGORY[cat]?.badge ?? DEFAULT_COLOR.badge}`}
                          >
                            {translateCategory(cat, locale)}
                          </Badge>
                        ))}
                      </div>
                      <CardTitle className="text-[13.5px] font-bold leading-snug text-slate-800">
                        {translateServiceName(stripJasa(service.name), locale)}
                      </CardTitle>
                      <div className="flex items-center gap-1 mt-1">
                        <Calculator className="h-3 w-3 text-blue-500" />
                        <span className="text-[9.5px] font-semibold text-blue-500 uppercase tracking-widest">{t("jasa.calcCost")}</span>
                      </div>
                    </CardHeader>

                    {service.description && (
                      <CardContent className="px-4 pb-2 pt-0">
                        <CardDescription className="text-[11.5px] leading-relaxed line-clamp-2 text-slate-500">
                          {service.description}
                        </CardDescription>
                      </CardContent>
                    )}

                    <CardContent className="px-4 pb-4 pt-1">
                      <Button
                        size="sm"
                        className="w-full gap-1.5 text-[12px] h-8 font-semibold"
                        style={{
                          background: "linear-gradient(135deg, #1565C0 0%, #0B5CAD 100%)",
                          boxShadow: "0 2px 8px rgba(11,92,173,0.28)",
                        }}
                      >
                        <Calculator className="h-3 w-3" />
                        {t("jasa.calcButton")}
                        <ArrowRight className="h-3 w-3" />
                      </Button>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
