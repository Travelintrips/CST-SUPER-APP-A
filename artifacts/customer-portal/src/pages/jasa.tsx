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
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-8 md:py-10">
        <div className="container px-4 md:px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-accent font-semibold text-xs uppercase tracking-widest mb-1">{t("jasa.catalogLabel")}</p>
              <h1 className="text-2xl md:text-3xl font-display font-bold">{t("jasa.title")}</h1>
            </div>
            <div className="relative w-full md:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground/50" />
              <Input
                type="text"
                placeholder={t("jasa.search")}
                className="h-10 pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
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
                          alt={service.name}
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
                      <CardTitle className="text-sm leading-snug">{service.name}</CardTitle>
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
