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

const stripJasa = (name: string) => name.replace(/^Jasa\s+/i, "");

export default function Jasa() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { t } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<string>(() => t("jasa.all"));

  const { data: servicesRaw, isLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServicesJasa"] },
  });

  const services = Array.isArray(servicesRaw) ? servicesRaw : [];

  const allCategories = Array.from(
    new Set(services.flatMap((s) => s.categories ?? []))
  ).sort();

  const allLabel = t("jasa.all");

  const filtered = services.filter((s) => {
    const q = searchQuery.toLowerCase();
    const matchSearch =
      !q ||
      s.name.toLowerCase().includes(q) ||
      (s.description ?? "").toLowerCase().includes(q) ||
      (s.categories ?? []).some((c) => c.toLowerCase().includes(q));
    const matchCat =
      activeCategory === allLabel ||
      (s.categories ?? []).includes(activeCategory);
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0B4F8A 0%, #0F8FD8 50%, #38BDF8 100%)",
          padding: "clamp(48px, 7vw, 80px) 0 clamp(36px, 5vw, 60px)",
        }}
      >
        {/* Overlay: dark vignette */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(2,34,64,0.55) 0%, rgba(2,34,64,0.25) 40%, rgba(2,34,64,0.05) 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Overlay: dot grid */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        />
        {/* Layer 1: CSS glow dots + route lines */}
        <div
          aria-hidden="true"
          className="jasa-glow-layer"
          style={{
            position: "absolute",
            right: "-4%",
            top: "50%",
            transform: "translateY(-50%)",
            width: "58%",
            height: "88%",
            background: [
              "radial-gradient(circle at 22% 44%, rgba(255,255,255,0.85) 0 3px, transparent 5px)",
              "radial-gradient(circle at 42% 32%, rgba(255,255,255,0.80) 0 3px, transparent 5px)",
              "radial-gradient(circle at 62% 48%, rgba(255,255,255,0.80) 0 3px, transparent 5px)",
              "radial-gradient(circle at 78% 34%, rgba(255,255,255,0.75) 0 3px, transparent 5px)",
              "radial-gradient(circle at 72% 68%, rgba(255,255,255,0.75) 0 3px, transparent 5px)",
              "radial-gradient(circle at 22% 44%, rgba(255,255,255,0.22) 0 16px, transparent 38px)",
              "radial-gradient(circle at 42% 32%, rgba(255,255,255,0.18) 0 14px, transparent 36px)",
              "radial-gradient(circle at 62% 48%, rgba(255,255,255,0.18) 0 14px, transparent 36px)",
              "radial-gradient(circle at 78% 34%, rgba(255,255,255,0.16) 0 13px, transparent 34px)",
              "linear-gradient(25deg, transparent 17%, rgba(255,255,255,0.16) 18%, transparent 20%)",
              "linear-gradient(145deg, transparent 33%, rgba(255,255,255,0.14) 34%, transparent 36%)",
              "linear-gradient(78deg, transparent 49%, rgba(255,255,255,0.13) 50%, transparent 52%)",
              "radial-gradient(ellipse at center, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 38%, transparent 70%)",
            ].join(", "),
            borderRadius: "999px",
            opacity: 0.95,
            filter: "drop-shadow(0 0 34px rgba(255,255,255,0.18))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        {/* Layer 2: Route curves SVG */}
        <div
          aria-hidden="true"
          className="jasa-routes-layer"
          style={{
            position: "absolute",
            right: "3%",
            top: "22%",
            width: "48%",
            height: "56%",
            backgroundImage: "url(/images/logistics-routes.svg)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            backgroundPosition: "center right",
            opacity: 0.45,
            filter: "drop-shadow(0 0 18px rgba(255,255,255,0.20))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <style>{`
          @media (max-width: 768px) {
            .jasa-glow-layer {
              width: 95% !important;
              height: 75% !important;
              right: -38% !important;
              opacity: 0.45 !important;
            }
            .jasa-routes-layer {
              width: 90% !important;
              right: -42% !important;
              opacity: 0.22 !important;
              filter: none !important;
            }
          }
        `}</style>

        {/* Content */}
        <div
          className="container px-4 md:px-6"
          style={{ position: "relative", zIndex: 2 }}
        >
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
            <div>
              <p
                className="font-semibold uppercase mb-2"
                style={{ fontSize: "11px", letterSpacing: "0.14em", color: "rgba(255,255,255,0.85)" }}
              >
                {t("jasa.catalogLabel")}
              </p>
              <h1
                className="font-display text-white"
                style={{
                  fontSize: "clamp(28px, 4vw, 52px)",
                  fontWeight: 800,
                  lineHeight: 1.1,
                  textShadow: "0 6px 20px rgba(0,0,0,0.25)",
                }}
              >
                {t("jasa.title")}
              </h1>
            </div>
            {/* Glassmorphism search */}
            <div className="relative w-full md:w-80 shrink-0">
              <Search
                className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ width: "16px", height: "16px", color: "rgba(255,255,255,0.85)" }}
              />
              <input
                id="jasa-hero-search"
                type="text"
                placeholder={t("jasa.search")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full focus:outline-none"
                style={{
                  paddingLeft: "40px",
                  paddingRight: "14px",
                  paddingTop: "11px",
                  paddingBottom: "11px",
                  background: "rgba(255,255,255,0.15)",
                  border: "1px solid rgba(255,255,255,0.35)",
                  backdropFilter: "blur(12px)",
                  WebkitBackdropFilter: "blur(12px)",
                  borderRadius: "14px",
                  fontSize: "14px",
                  color: "white",
                  boxShadow: "0 10px 30px rgba(0,0,0,0.20)",
                }}
                onFocus={(e) => {
                  e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.45), 0 10px 30px rgba(0,0,0,0.20)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.65)";
                }}
                onBlur={(e) => {
                  e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.20)";
                  e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
                }}
              />
              <style>{`#jasa-hero-search::placeholder { color: rgba(255,255,255,0.75); }`}</style>
            </div>
          </div>
        </div>
      </div>

      <div className="container px-4 md:px-6 mt-6">
        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-2 mb-6">
          {[allLabel, ...allCategories].map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                activeCategory === cat
                  ? "bg-primary text-primary-foreground border-primary shadow-sm"
                  : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* ── Featured service banners ── */}
        <div className="mb-6 space-y-3">
          {/* Freight Forwarding */}
          <div className="rounded-2xl border-2 border-primary/20 bg-gradient-to-r from-primary/5 via-sky-50 to-blue-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex gap-2 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <Ship className="h-5 w-5 text-blue-600" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
                  <Plane className="h-5 w-5 text-sky-600" />
                </div>
              </div>
              <div>
                <p className="font-bold text-foreground">Freight Forwarding</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {["Impor", "Ekspor", "Domestic"].map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0">{d}</Badge>
                  ))}
                  <span className="text-[10px] text-muted-foreground">×</span>
                  {["Sea Freight", "Air Freight"].map((m) => (
                    <Badge key={m} variant="outline" className="text-[10px] px-1.5 py-0">{m}</Badge>
                  ))}
                  <span className="text-[10px] text-muted-foreground">×</span>
                  {["D2D", "D2P", "P2D", "P2P"].map((v) => (
                    <Badge key={v} className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 hover:bg-primary/10">{v}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={() => setLocation("/freight-forwarding")} className="gap-2 shrink-0">
              {t("jasa.createOrder")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Jasa Pengurusan Pabean / PPJK */}
          <div className="rounded-2xl border-2 border-orange-200 bg-gradient-to-r from-orange-50 via-amber-50 to-yellow-50 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-center gap-4 flex-1">
              <div className="flex gap-2 shrink-0">
                <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
                  <FileCheck className="h-5 w-5 text-orange-600" />
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Scale className="h-5 w-5 text-amber-600" />
                </div>
              </div>
              <div>
                <p className="font-bold text-foreground">Pengurusan Pabean / PPJK</p>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {["PIB/PEB", "Handling Clearance", "Konsultasi Pabean", "Undername"].map((s) => (
                    <Badge key={s} className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100">{s}</Badge>
                  ))}
                  <span className="text-[10px] text-muted-foreground">×</span>
                  {["Impor", "Ekspor"].map((d) => (
                    <Badge key={d} variant="secondary" className="text-[10px] px-1.5 py-0">{d}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button
              onClick={() => setLocation("/pabean")}
              className="gap-2 shrink-0 bg-orange-600 hover:bg-orange-700 text-white"
            >
              {t("jasa.submitService")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Services grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>{t("jasa.noMatches")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filtered.map((service) => {
              const primaryCat = (service.categories ?? [])[0] ?? "";
              const Icon = ICON_BY_CATEGORY[primaryCat] ?? Package;
              const colors = COLOR_BY_CATEGORY[primaryCat] ?? DEFAULT_COLOR;
              const imgUrl = resolveImageUrl(service.imageUrl);
              return (
                <Link key={service.id} href={`/jasa/${service.id}`} className="block group">
                  <Card className="h-full hover:shadow-md transition-all group-hover:border-primary/40 overflow-hidden">
                    {imgUrl ? (
                      <div className="h-32 overflow-hidden">
                        <img
                          src={imgUrl}
                          alt={stripJasa(service.name)}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    ) : (
                      <div className={`h-24 ${colors.bg} flex items-center justify-center`}>
                        <Icon className={`h-10 w-10 ${colors.text} opacity-60`} />
                      </div>
                    )}
                    <CardHeader className="pb-2 pt-3 px-4">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {(service.categories ?? []).map((cat) => (
                          <Badge key={cat} className={`text-[10px] px-1.5 py-0 ${COLOR_BY_CATEGORY[cat]?.badge ?? DEFAULT_COLOR.badge}`}>
                            {cat}
                          </Badge>
                        ))}
                      </div>
                      <CardTitle className="text-sm leading-snug">{stripJasa(service.name)}</CardTitle>
                      <div className="flex items-center gap-1 mt-1">
                        <Calculator className="h-3 w-3 text-primary/70" />
                        <span className="text-[10px] font-semibold text-primary/70 uppercase tracking-wide">Kalkulator Biaya</span>
                      </div>
                    </CardHeader>
                    {service.description && (
                      <CardContent className="px-4 pb-3">
                        <CardDescription className="text-xs line-clamp-2">{service.description}</CardDescription>
                      </CardContent>
                    )}
                    <CardContent className="px-4 pb-4 pt-0">
                      <Button size="sm" className="w-full gap-1 text-xs h-8 group-hover:bg-primary/90">
                        <Calculator className="h-3 w-3" /> Hitung Biaya <ArrowRight className="h-3 w-3" />
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
