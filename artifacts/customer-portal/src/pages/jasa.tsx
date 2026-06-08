import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Search, ArrowRight, ChevronRight, Calculator, ArrowLeft,
  Store, Building2, Truck, Tag, MapPin, Clock,
} from "lucide-react";
import { useListPortalServices } from "@workspace/api-client-react";
import { resolveImageUrl } from "@/lib/utils";
import { getServiceFallbackImage } from "@/lib/categoryImages";
import { useLanguage } from "@/i18n/LanguageContext";
import { translateServiceName, translateCategory } from "@/i18n/serviceData";
import { GROUPED_DISPLAY_CATEGORIES as GROUPED_CATEGORIES } from "@workspace/logistics-constants";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ServiceHubItem {
  source: "vendor_catalog_item" | "product";
  id: number;
  title: string;
  category: string;
  serviceType: string | null;
  price: number | null;
  unit: string | null;
  targetUrl: string;
  description?: string | null;
  imageUrl?: string | null;
  vendorName?: string | null;
  stockStatus?: string | null;
  location?: string | null;
  leadTime?: string | null;
  currency?: string;
  categories?: string[];
  primaryImageUrl?: string | null;
  categoryKey?: string | null;
  specValues?: unknown;
  templateSnapshot?: unknown;
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

const CARD_ACCENT: Record<string, { hoverShadow: string; hoverBorder: string }> = {
  "Udara":              { hoverShadow: "0 10px 36px rgba(59,130,246,0.18)",  hoverBorder: "rgba(59,130,246,0.28)"  },
  "Laut":               { hoverShadow: "0 10px 36px rgba(67,56,202,0.16)",   hoverBorder: "rgba(67,56,202,0.26)"   },
  "Trucking":           { hoverShadow: "0 10px 36px rgba(71,85,105,0.16)",   hoverBorder: "rgba(71,85,105,0.26)"   },
  "Container":          { hoverShadow: "0 10px 36px rgba(109,40,217,0.16)",  hoverBorder: "rgba(109,40,217,0.26)"  },
  "Pabean":             { hoverShadow: "0 10px 36px rgba(194,65,12,0.16)",   hoverBorder: "rgba(194,65,12,0.26)"   },
  "Handling":           { hoverShadow: "0 10px 36px rgba(126,34,206,0.16)",  hoverBorder: "rgba(126,34,206,0.24)"  },
  "Storage":            { hoverShadow: "0 10px 36px rgba(15,118,110,0.16)",  hoverBorder: "rgba(15,118,110,0.24)"  },
  "Document":           { hoverShadow: "0 10px 36px rgba(71,85,105,0.14)",   hoverBorder: "rgba(71,85,105,0.22)"   },
  "Additional":         { hoverShadow: "0 10px 36px rgba(190,24,93,0.16)",   hoverBorder: "rgba(190,24,93,0.24)"   },
  "Freight Forwarding": { hoverShadow: "0 10px 36px rgba(8,145,178,0.18)",   hoverBorder: "rgba(8,145,178,0.28)"   },
  "Lainnya":            { hoverShadow: "0 10px 36px rgba(75,85,99,0.14)",    hoverBorder: "rgba(75,85,99,0.22)"    },
};
const DEFAULT_ACCENT = { hoverShadow: "0 10px 36px rgba(59,130,246,0.16)", hoverBorder: "rgba(59,130,246,0.26)" };

const CATEGORY_PLACEHOLDER: Record<string, { emoji: string; from: string; to: string }> = {
  trucking:    { emoji: "🚛", from: "#1a3a6c", to: "#2a5aaa" },
  sea_freight: { emoji: "🚢", from: "#0c3057", to: "#1a5080" },
  air_freight: { emoji: "✈️", from: "#1a4060", to: "#2a6090" },
  ppjk:        { emoji: "📋", from: "#3a3060", to: "#5a4a90" },
  handling:    { emoji: "🏭", from: "#2a4a2a", to: "#4a7a4a" },
  document:    { emoji: "📄", from: "#3a4a5a", to: "#5a6a7a" },
  exim_service:{ emoji: "🌍", from: "#1a4a4a", to: "#2a7070" },
};

const stripJasa = (name: string) => name.replace(/^Jasa\s+/i, "");

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

// ── Realtime hook ─────────────────────────────────────────────────────────────

function useServicesRealtime(queryKey: string) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const [justUpdated, setJustUpdated] = useState(false);

  const handleChange = useCallback(() => {
    qc.invalidateQueries({ queryKey: [queryKey] });
    setJustUpdated(true);
    setTimeout(() => setJustUpdated(false), 3000);
  }, [qc, queryKey]);

  const handleCatalogChange = useCallback((payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => {
    const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
    if (row["template_kind"] !== "service" && row["templateKind"] !== "service") return;
    if (import.meta.env.DEV) {
      console.log("[Realtime] vendor_catalog_items service changed, refetch marketplace", payload.eventType, row["id"]);
    }
    qc.invalidateQueries({ queryKey: [queryKey] });
    setJustUpdated(true);
    setTimeout(() => setJustUpdated(false), 3000);
  }, [qc, queryKey]);

  useEffect(() => {
    if (!supabase) return;

    // Legacy: watch products table (dipertahankan untuk kompatibilitas)
    const channel = supabase
      .channel("portal-services-jasa-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, handleChange)
      .subscribe((status) => {
        setConnected(status === "SUBSCRIBED");
      });

    // Tambahan: watch vendor_catalog_items untuk item service dari etalase vendor
    const catalogChannel = supabase
      .channel("portal-services-jasa-catalog-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "vendor_catalog_items" },
        handleCatalogChange,
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "vendor_catalog_items" },
        handleCatalogChange,
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "vendor_catalog_items" },
        handleCatalogChange,
      )
      .subscribe();

    return () => {
      supabase!.removeChannel(channel);
      supabase!.removeChannel(catalogChannel);
      setConnected(false);
    };
  }, [handleChange, handleCatalogChange]);
      .subscribe((status) => setConnected(status === "SUBSCRIBED"));
    return () => { supabase!.removeChannel(channel); setConnected(false); };
  }, [handleChange]);

  return { connected, justUpdated };
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: "vendor_catalog_item" | "product" }) {
  if (source === "vendor_catalog_item") {
    return (
      <span
        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
        style={{
          background: "linear-gradient(135deg, #0ea5e9 0%, #2563eb 100%)",
          color: "white",
          letterSpacing: "0.02em",
        }}
      >
        <Store className="h-2.5 w-2.5" />
        Vendor Marketplace
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
      style={{
        background: "linear-gradient(135deg, #0B5CAD 0%, #1A73D4 100%)",
        color: "white",
        letterSpacing: "0.02em",
      }}
    >
      <Calculator className="h-2.5 w-2.5" />
      Layanan Internal
    </span>
  );
}

// ── Vendor Marketplace Card ───────────────────────────────────────────────────

function VendorServiceCard({ item }: { item: ServiceHubItem }) {
  const catKey = item.categoryKey ?? item.serviceType ?? "";
  const cat = catKey ? CATEGORY_PLACEHOLDER[catKey] : undefined;
  const hasImage = !!item.primaryImageUrl;

  return (
    <Link href={item.targetUrl} className="block group">
      <div
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-full transition-all duration-200 group-hover:-translate-y-0.5"
        style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 36px rgba(14,165,233,0.18)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(14,165,233,0.30)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
          (e.currentTarget as HTMLElement).style.borderColor = "rgba(226,232,240,1)";
        }}
      >
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-sky-400 to-blue-500" />

        {/* Image / Placeholder */}
        <div className="relative w-full h-[120px] overflow-hidden bg-slate-100">
          {hasImage ? (
            <img
              src={item.primaryImageUrl!}
              alt={item.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              loading="lazy"
            />
          ) : cat ? (
            <div
              className="w-full h-full flex flex-col items-center justify-center gap-1.5 select-none"
              style={{ background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` }}
            >
              <span className="text-4xl drop-shadow-sm">{cat.emoji}</span>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-sky-50 to-blue-50">
              <Truck className="h-8 w-8 text-sky-200" />
            </div>
          )}
          {/* Source badge overlaid */}
          <div className="absolute top-2 left-2">
            <SourceBadge source="vendor_catalog_item" />
          </div>
        </div>

        <div className="p-3.5 flex flex-col flex-1 gap-2">
          {/* Vendor name */}
          {item.vendorName && (
            <div className="flex items-center gap-1.5">
              <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-500 truncate">{item.vendorName}</span>
            </div>
          )}

          {/* Title */}
          <h3 className="text-[13.5px] font-bold text-slate-800 leading-snug line-clamp-2">{item.title}</h3>

          {/* Category */}
          {item.category && (
            <span
              className="self-start text-[10px] font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: "rgba(14,165,233,0.08)",
                color: "#0369a1",
                border: "1px solid rgba(14,165,233,0.20)",
              }}
            >
              {item.category}
            </span>
          )}

          {/* Meta */}
          <div className="flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-slate-400">
            {item.location && <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{item.location}</span>}
            {item.leadTime && <span className="flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />Lead: {item.leadTime}</span>}
          </div>

          {/* Price + CTA */}
          <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <div>
              {item.price != null
                ? <span className="text-[14px] font-extrabold text-sky-700">{item.currency === "USD" ? `$${item.price.toLocaleString("en-US")}` : formatIDR(item.price)}</span>
                : <span className="text-[11px] text-slate-400 italic">Harga nego</span>
              }
              {item.unit && <span className="text-[10px] text-slate-400 ml-1">/ {item.unit}</span>}
            </div>
            <div
              className="flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-lg"
              style={{ background: "rgba(14,165,233,0.08)", color: "#0369a1" }}
            >
              Detail <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Legacy Product Card ───────────────────────────────────────────────────────

function LegacyServiceCard({ item, failedImages, onImageError }: {
  item: ServiceHubItem;
  failedImages: Set<number>;
  onImageError: (id: number) => void;
}) {
  const primaryCat = (item.categories ?? [])[0] ?? item.category ?? "";
  const accent = CARD_ACCENT[primaryCat] ?? DEFAULT_ACCENT;
  const apiImgUrl = resolveImageUrl(item.imageUrl ?? null);
  const fallbackImg = getServiceFallbackImage(item.categories ?? [item.category].filter(Boolean), item.title);
  const bannerSrc = (apiImgUrl && !failedImages.has(item.id)) ? apiImgUrl : fallbackImg;
  const { locale } = useLanguage();

  return (
    <Link href={item.targetUrl} className="block group">
      <Card
        className="h-full overflow-hidden transition-all duration-200 group-hover:-translate-y-0.5"
        style={{ border: "1.5px solid #E8EDF3", borderRadius: "16px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = accent.hoverShadow;
          (e.currentTarget as HTMLElement).style.borderColor = accent.hoverBorder;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
          (e.currentTarget as HTMLElement).style.borderColor = "#E8EDF3";
        }}
      >
        {/* Banner */}
        <div className="h-36 overflow-hidden relative">
          <img
            src={bannerSrc}
            alt={stripJasa(item.title)}
            loading="lazy"
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => onImageError(item.id)}
          />
          <div
            aria-hidden="true"
            style={{
              position: "absolute", inset: 0, pointerEvents: "none",
              background: "linear-gradient(to bottom, rgba(0,0,0,0.04) 0%, rgba(0,0,0,0.22) 75%, rgba(0,0,0,0.38) 100%)",
            }}
          />
          {/* Source badge top-left */}
          <div className="absolute top-2 left-2.5">
            <SourceBadge source="product" />
          </div>
          {/* Category chips bottom-left */}
          <div className="absolute bottom-2.5 left-3 flex flex-wrap gap-1">
            {(item.categories ?? []).map((cat) => (
              <span
                key={cat}
                className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full"
                style={{
                  background: "rgba(255,255,255,0.18)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                  color: "rgba(255,255,255,0.95)",
                  border: "1px solid rgba(255,255,255,0.25)",
                }}
              >
                {translateCategory(cat, locale)}
              </span>
            ))}
          </div>
        </div>

        <CardHeader className="pb-1.5 pt-3 px-4">
          <CardTitle className="text-[13.5px] font-bold leading-snug text-slate-800">
            {translateServiceName(stripJasa(item.title), locale)}
          </CardTitle>
        </CardHeader>

        {item.description && (
          <CardContent className="px-4 pb-2 pt-0">
            <CardDescription className="text-[11.5px] leading-relaxed line-clamp-2 text-slate-500">
              {item.description}
            </CardDescription>
          </CardContent>
        )}

        <CardContent className="px-4 pb-2 pt-0">
          <div
            className="flex items-center justify-between rounded-lg px-3 py-1.5"
            style={{ background: "rgba(11,92,173,0.05)", border: "1px solid rgba(11,92,173,0.10)" }}
          >
            <span className="text-[9.5px] font-semibold text-slate-400 uppercase tracking-wide">Harga Jual</span>
            {item.price && item.price > 0 ? (
              <span className="text-[13px] font-bold text-[#0B5CAD]">{formatIDR(item.price)}</span>
            ) : (
              <span className="text-[11px] font-semibold text-amber-600">Harga Negosiasi</span>
            )}
          </div>
        </CardContent>

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
            Kalkulator Harga
            <ArrowRight className="h-3 w-3" />
          </Button>
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────

function SectionHeader({
  title, subtitle, count, accent,
}: { title: string; subtitle: string; count: number; accent: "sky" | "blue" }) {
  const colors = accent === "sky"
    ? { bar: "from-sky-400 to-blue-500", count: "bg-sky-100 text-sky-700 border-sky-200" }
    : { bar: "from-blue-500 to-indigo-600", count: "bg-blue-100 text-blue-700 border-blue-200" };
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className={`w-1 h-12 rounded-full bg-gradient-to-b ${colors.bar} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5 flex-wrap">
          <h2 className="text-[17px] font-bold text-slate-800">{title}</h2>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${colors.count}`}>
            {count} layanan
          </span>
        </div>
        <p className="text-[12px] text-slate-500 mt-0.5">{subtitle}</p>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Jasa() {
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const { t, locale } = useLanguage();
  const [activeCategory, setActiveCategory] = useState<string>("__all__");
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set());
  const qc = useQueryClient();
  const { connected: realtimeConnected, justUpdated: realtimeUpdated } = useServicesRealtime("listPortalServicesJasa");

  // Invalidate on price_sync SSE
  useEffect(() => {
    const es = new EventSource("/api/ecommerce/events");
    es.addEventListener("price_sync", () => qc.invalidateQueries({ queryKey: ["listPortalServicesJasa"] }));
    return () => es.close();
  }, [qc]);

  // ── Source A: Vendor Marketplace (vendor_catalog_items) ─────────────────────
  const { data: marketplaceRaw, isLoading: mktLoading } = useQuery<unknown[]>({
    queryKey: ["jasaMarketplace"],
    queryFn: async () => {
      const res = await fetch("/api/portal/marketplace?kind=service");
      if (!res.ok) throw new Error("Gagal memuat marketplace");
      return res.json();
    },
    staleTime: 30_000,
  });

  // ── Source B: Legacy Products ────────────────────────────────────────────────
  const { data: servicesRaw, isLoading: svcLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServicesJasa"], staleTime: 0, gcTime: 0, refetchOnWindowFocus: true },
  });

  const isLoading = mktLoading || svcLoading;

  // ── Normalize vendor catalog items → ServiceHubItem ──────────────────────────
  const vendorItems: ServiceHubItem[] = (Array.isArray(marketplaceRaw) ? marketplaceRaw : []).map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    const resolvedLabel = (r["resolvedCategoryLabel"] as string | null)
      ?? (r["kategori"] as string | null)
      ?? (r["categoryKey"] as string | null)
      ?? "";
    return {
      source: "vendor_catalog_item",
      id: r["id"] as number,
      title: r["name"] as string,
      category: resolvedLabel,
      serviceType: (r["serviceType"] as string | null) ?? null,
      price: (r["priceSell"] as number | null) ?? null,
      unit: (r["unit"] as string | null) ?? null,
      targetUrl: `/jasa/vendor/${r["id"]}`,
      description: (r["description"] as string | null) ?? null,
      vendorName: (r["vendorName"] as string | null) ?? null,
      stockStatus: (r["stockStatus"] as string | null) ?? null,
      location: (r["location"] as string | null) ?? null,
      leadTime: (r["leadTime"] as string | null) ?? null,
      currency: (r["currency"] as string) ?? "IDR",
      categoryKey: (r["categoryKey"] as string | null) ?? null,
      primaryImageUrl: (r["primaryImageUrl"] as string | null) ?? null,
      specValues: r["specValues"],
      templateSnapshot: r["templateSnapshot"],
    };
  });

  // ── Normalize legacy products → ServiceHubItem ──────────────────────────────
  const legacyItems: ServiceHubItem[] = (Array.isArray(servicesRaw) ? servicesRaw : []).map((s: unknown) => {
    const svc = s as Record<string, unknown>;
    const cats = (svc["categories"] as string[] | null) ?? [];
    return {
      source: "product",
      id: svc["id"] as number,
      title: svc["name"] as string,
      category: cats[0] ?? "",
      serviceType: null,
      price: (svc["price"] as number) ?? null,
      unit: (svc["unit"] as string | null) ?? null,
      targetUrl: `/jasa/${svc["id"]}`,
      description: (svc["description"] as string | null) ?? null,
      imageUrl: (svc["imageUrl"] as string | null) ?? null,
      categories: cats,
      currency: "IDR",
    };
  });

  // ── Dedup within each section (by id) ────────────────────────────────────────
  const dedupById = (items: ServiceHubItem[]) => {
    const seen = new Set<number>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  };

  const vendorDeduped = dedupById(vendorItems);
  const legacyDeduped = dedupById(legacyItems);

  // ── Build category list (union from both sources) ────────────────────────────
  const allCategories = Array.from(new Set([
    ...vendorDeduped.map((i) => i.category),
    ...legacyDeduped.flatMap((i) => i.categories ?? [i.category]),
  ].filter(Boolean))).sort();

  // ── Filter ───────────────────────────────────────────────────────────────────
  const matchSearch = (item: ServiceHubItem) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      translateServiceName(item.title, locale).toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q) ||
      (item.categories ?? []).some((c) => c.toLowerCase().includes(q) || translateCategory(c, locale).toLowerCase().includes(q))
    );
  };

  const matchCategory = (item: ServiceHubItem) => {
    if (activeCategory === "__all__") return true;
    if (item.category === activeCategory) return true;
    if ((item.categories ?? []).includes(activeCategory)) return true;
    return false;
  };

  const filteredVendor = vendorDeduped.filter((i) => matchSearch(i) && matchCategory(i));

  const filteredLegacy = legacyDeduped.filter((i) => {
    if (!matchSearch(i)) return false;
    if (activeCategory === "__all__") {
      const cats = i.categories ?? [];
      return !cats.some((c) => (GROUPED_CATEGORIES as unknown as string[]).includes(c));
    }
    return matchCategory(i);
  });

  const handleImageError = (id: number) => setFailedImages((prev) => new Set([...prev, id]));

  return (
    <div className="min-h-screen pb-24" style={{ background: "#F8FAFC" }}>

      {/* ── Hero Banner ──────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0B3D6B 0%, #0D6EBF 55%, #1E9FE8 100%)",
          padding: "clamp(24px, 3.5vw, 36px) 0 clamp(18px, 2.5vw, 26px)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(rgba(255,255,255,0.12) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            background: "linear-gradient(100deg, rgba(5,20,50,0.50) 0%, rgba(5,20,50,0.20) 45%, transparent 70%)",
          }}
        />
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
              "radial-gradient(ellipse at center, rgba(255,255,255,0.10) 0%, transparent 65%)",
            ].join(", "),
            borderRadius: "999px",
            opacity: 0.9,
            filter: "drop-shadow(0 0 36px rgba(255,255,255,0.15))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
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
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/")}
            className="inline-flex items-center gap-1.5 mb-3 text-[12px] font-semibold rounded-lg px-3 py-1.5 select-none"
            style={{
              color: "rgba(255,255,255,0.85)",
              background: "rgba(255,255,255,0.10)",
              border: "1.5px solid rgba(255,255,255,0.20)",
              transition: "all 0.16s ease",
            }}
            onMouseEnter={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "rgba(255,255,255,0.18)";
              el.style.color = "white";
              el.style.transform = "translateY(-1px)";
            }}
            onMouseLeave={e => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "rgba(255,255,255,0.10)";
              el.style.color = "rgba(255,255,255,0.85)";
              el.style.transform = "translateY(0)";
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali
          </button>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p
                className="font-semibold uppercase tracking-widest mb-1.5"
                style={{ fontSize: "10px", letterSpacing: "0.18em", color: "rgba(255,255,255,0.72)" }}
              >
                {t("jasa.catalogLabel")}
              </p>
              <h1
                className="font-display text-white"
                style={{ fontSize: "clamp(20px, 2.8vw, 34px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.01em", textShadow: "0 4px 24px rgba(0,0,0,0.22)" }}
              >
                {t("jasa.title")}
              </h1>
              <p className="mt-1.5 hidden md:block" style={{ fontSize: "13px", color: "rgba(255,255,255,0.62)", maxWidth: "340px", lineHeight: 1.55 }}>
                Temukan layanan logistik dari vendor terpercaya dan kalkulator layanan internal kami
              </p>
            </div>

            {/* Search */}
            <div className="relative w-full md:w-72 shrink-0">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ width: "15px", height: "15px", color: "rgba(255,255,255,0.80)" }} />
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

      {/* ── Page Body ──────────────────────────────────────────────────────── */}
      <div className="max-w-6xl mx-auto px-4 md:px-8 mt-7">

        {/* ── Stats + Realtime indicator ── */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-slate-500 font-medium">
              {vendorDeduped.length + legacyDeduped.length} layanan tersedia
            </span>
            <span className="text-[11px] text-slate-400">
              ({vendorDeduped.length} vendor · {legacyDeduped.length} internal)
            </span>
          </div>
          {realtimeConnected && (
            <span
              className="inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-2.5 py-1"
              style={{
                background: realtimeUpdated ? "rgba(245,158,11,0.10)" : "rgba(34,197,94,0.10)",
                color: realtimeUpdated ? "#B45309" : "#15803D",
                border: `1px solid ${realtimeUpdated ? "rgba(245,158,11,0.25)" : "rgba(34,197,94,0.25)"}`,
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: realtimeUpdated ? "#F59E0B" : "#22C55E", animation: "pulse 1.5s ease-in-out infinite" }}
              />
              {realtimeUpdated ? "Diperbarui" : "Live"}
            </span>
          )}
        </div>

        {/* ── Category filter chips ── */}
        <style>{`
          .cat-chip { transition: all 0.20s cubic-bezier(0.4,0,0.2,1); position: relative; overflow: hidden; }
          .cat-chip:not(.active):hover {
            background: linear-gradient(135deg, #EEF4FF 0%, #F5F8FF 100%) !important;
            border-color: rgba(11,92,173,0.35) !important;
            color: #0B5CAD !important;
            transform: translateY(-1px);
            box-shadow: 0 4px 14px rgba(11,92,173,0.12), 0 1px 4px rgba(11,92,173,0.06) !important;
          }
          .cat-chip.active {
            background: linear-gradient(135deg, #0B5CAD 0%, #1A73D4 100%) !important;
            border-color: #0B5CAD !important;
            color: white !important;
            box-shadow: 0 4px 16px rgba(11,92,173,0.30), 0 1px 4px rgba(11,92,173,0.15), inset 0 1px 0 rgba(255,255,255,0.18) !important;
            transform: translateY(-1px);
          }
        `}</style>
        <div className="flex flex-wrap gap-2 mb-7">
          <button
            onClick={() => setActiveCategory("__all__")}
            className={`cat-chip px-4 py-2 rounded-full text-[13px] font-semibold border ${activeCategory === "__all__" ? "active" : ""}`}
            style={{
              background: activeCategory === "__all__" ? undefined : "rgba(255,255,255,0.95)",
              borderColor: activeCategory === "__all__" ? undefined : "rgba(203,213,225,0.8)",
              color: activeCategory === "__all__" ? undefined : "#64748B",
              backdropFilter: "blur(8px)",
              boxShadow: activeCategory === "__all__" ? undefined : "0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)",
            }}
          >
            {t("jasa.all")}
          </button>
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`cat-chip px-4 py-2 rounded-full text-[13px] font-semibold border ${activeCategory === cat ? "active" : ""}`}
              style={{
                background: activeCategory === cat ? undefined : "rgba(255,255,255,0.95)",
                borderColor: activeCategory === cat ? undefined : "rgba(203,213,225,0.8)",
                color: activeCategory === cat ? undefined : "#64748B",
                backdropFilter: "blur(8px)",
                boxShadow: activeCategory === cat ? undefined : "0 1px 3px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.9)",
              }}
            >
              {translateCategory(cat, locale)}
            </button>
          ))}
        </div>

        {/* ── Featured service banners ── */}
        <div className="mb-8 space-y-4">
          {/* Freight Forwarding */}
          <div
            className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5"
            style={{
              background: [
                "radial-gradient(ellipse at 7% 50%, rgba(59,130,246,0.13) 0%, transparent 52%)",
                "linear-gradient(130deg, #EBF5FF 0%, #DBEAFE 50%, #BAE6FD 82%, #DDFAFF 100%)",
              ].join(", "),
              border: "1.5px solid rgba(59,130,246,0.22)",
              boxShadow: "0 6px 28px rgba(59,130,246,0.11), 0 1px 4px rgba(59,130,246,0.06), inset 0 1px 0 rgba(255,255,255,0.88)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 38px rgba(59,130,246,0.18), 0 2px 8px rgba(59,130,246,0.08), inset 0 1px 0 rgba(255,255,255,0.88)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(59,130,246,0.11), 0 1px 4px rgba(59,130,246,0.06), inset 0 1px 0 rgba(255,255,255,0.88)"; }}
          >
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="flex gap-2 shrink-0">
                {["sea-freight", "air-freight"].map((img) => (
                  <div key={img} className="w-11 h-11 rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 3px rgba(37,99,235,0.18), 0 2px 8px rgba(37,99,235,0.22)" }}>
                    <img src={`${import.meta.env.BASE_URL}images/${img}.png`} alt={img} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-tight">Freight Forwarding</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {([
                    { label: t("jasa.importLabel"), dir: "Impor" },
                    { label: t("jasa.exportLabel"), dir: "Ekspor" },
                    { label: t("jasa.domesticLabel"), dir: "Domestic" },
                  ] as Array<{ label: string; dir: string }>).map(({ label, dir }) => (
                    <Badge key={label} variant="secondary" className="text-[10px] px-1.5 py-0" onClick={() => setLocation(`/freight-forwarding?direction=${dir}`)} style={{ cursor: "pointer" }}>{label}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={() => setLocation("/freight-forwarding")} className="gap-2 shrink-0 bg-blue-700 hover:bg-blue-800 text-white shadow-md shadow-blue-200 px-5">
              {t("jasa.createOrder")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* PPJK */}
          <div
            className="rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center gap-5"
            style={{
              background: "linear-gradient(130deg, #FFFBEB 0%, #FEF3C7 40%, #FFEDD5 78%, #FFF7EE 100%)",
              border: "1.5px solid rgba(217,119,6,0.22)",
              boxShadow: "0 6px 28px rgba(217,119,6,0.10), 0 1px 4px rgba(217,119,6,0.05), inset 0 1px 0 rgba(255,255,255,0.95)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 10px 38px rgba(217,119,6,0.17), 0 2px 8px rgba(217,119,6,0.07), inset 0 1px 0 rgba(255,255,255,0.95)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 28px rgba(217,119,6,0.10), 0 1px 4px rgba(217,119,6,0.05), inset 0 1px 0 rgba(255,255,255,0.95)"; }}
          >
            <div className="flex items-start gap-4 flex-1 min-w-0">
              <div className="flex gap-2 shrink-0">
                {["customs-document", "customs-gavel"].map((img) => (
                  <div key={img} className="w-11 h-11 rounded-xl overflow-hidden" style={{ boxShadow: "0 0 0 3px rgba(234,88,12,0.18), 0 2px 8px rgba(234,88,12,0.22)" }}>
                    <img src={`${import.meta.env.BASE_URL}images/${img}.png`} alt={img} className="w-full h-full object-cover" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-tight">{t("jasa.customsTitle")}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(["PIB/PEB", "Handling Clearance", "Undername"] as string[]).map((label) => (
                    <Badge key={label} className="text-[10px] px-1.5 py-0 bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-100" style={{ cursor: "pointer" }}>{label}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <Button onClick={() => setLocation("/pabean")} className="gap-2 shrink-0 bg-orange-600 hover:bg-orange-700 text-white shadow-md shadow-orange-200 px-5">
              {t("jasa.submitService")} <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 1 — Layanan Vendor Marketplace                              */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <div className="mb-10">
          <SectionHeader
            title="Layanan Vendor Marketplace"
            subtitle="Layanan dari vendor terdaftar — harga transparan, langsung pesan"
            count={filteredVendor.length}
            accent="sky"
          />

          {mktLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
            </div>
          ) : filteredVendor.length === 0 ? (
            <div
              className="rounded-2xl py-10 px-6 text-center"
              style={{ background: "rgba(14,165,233,0.04)", border: "1.5px dashed rgba(14,165,233,0.20)" }}
            >
              <Store className="h-8 w-8 text-sky-300 mx-auto mb-2" />
              <p className="text-[13px] text-slate-500">
                {searchQuery || activeCategory !== "__all__"
                  ? "Tidak ada layanan vendor yang cocok dengan filter."
                  : "Belum ada layanan vendor yang dipublikasikan."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredVendor.map((item) => (
                <VendorServiceCard key={`vm-${item.id}`} item={item} />
              ))}
            </div>
          )}
        </div>

        {/* ════════════════════════════════════════════════════════════════════ */}
        {/* SECTION 2 — Kalkulator Layanan Umum                                 */}
        {/* ════════════════════════════════════════════════════════════════════ */}
        <div className="mb-10">
          <SectionHeader
            title="Kalkulator Layanan Umum"
            subtitle="Layanan internal CST — simulasi harga dan estimasi biaya pengiriman"
            count={filteredLegacy.length}
            accent="blue"
          />

          {svcLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-52 rounded-2xl" />)}
            </div>
          ) : filteredLegacy.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
                <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="CST Logistics" className="h-8 w-auto object-contain opacity-60" />
              </div>
              <p className="text-sm">{t("jasa.noMatches")}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredLegacy.map((item) => (
                <LegacyServiceCard
                  key={`lp-${item.id}`}
                  item={item}
                  failedImages={failedImages}
                  onImageError={handleImageError}
                />
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
