import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { Link, useLocation } from "wouter";
import {
  Plane, Ship, Layers, ClipboardList, FileText, Truck,
  MapPin, Package, Building2, Globe, Search, ChevronRight,
  ArrowRight, Clock, Users, Warehouse, Plus, X,
  MessageSquare, PhoneCall,
} from "lucide-react";
import { useListPortalServices } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { resolveImageUrl } from "@/lib/utils";
import { getServiceFallbackImage } from "@/lib/categoryImages";
import { useLanguage } from "@/i18n/LanguageContext";
import { translateServiceName } from "@/i18n/serviceData";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ServiceHubItem {
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
  location?: string | null;
  leadTime?: string | null;
  currency?: string;
  categories?: string[];
  primaryImageUrl?: string | null;
  categoryKey?: string | null;
}

// ── Category definition ───────────────────────────────────────────────────────

const CATEGORY_PLACEHOLDER: Record<string, { emoji: string; from: string; to: string }> = {
  trucking:    { emoji: "🚛", from: "#1a3a6c", to: "#2a5aaa" },
  sea_freight: { emoji: "🚢", from: "#0c3057", to: "#1a5080" },
  air_freight: { emoji: "✈️", from: "#1a4060", to: "#2a6090" },
  ppjk:        { emoji: "📋", from: "#3a3060", to: "#5a4a90" },
  handling:    { emoji: "🏭", from: "#2a4a2a", to: "#4a7a4a" },
  document:    { emoji: "📄", from: "#3a4a5a", to: "#5a6a7a" },
  exim_service:{ emoji: "🌍", from: "#1a4a4a", to: "#2a7070" },
};

interface SubService {
  title: string;
  titleId: string;
  desc: string;
  href: string;
  icon: React.ElementType;
  eta: string;
  categoryKeys: string[];
}

interface MainCategory {
  id: string;
  title: string;
  icon: React.ElementType;
  gradient: string;
  lightBg: string;
  textColor: string;
  badgeCls: string;
  services: SubService[];
}

const MAIN_CATEGORIES: MainCategory[] = [
  {
    id: "international",
    title: "Kirim Barang Internasional",
    icon: Globe,
    gradient: "from-blue-600 to-sky-500",
    lightBg: "bg-blue-50",
    textColor: "text-blue-700",
    badgeCls: "bg-blue-100 text-blue-700 border-blue-200",
    services: [
      {
        title: "Air Freight",
        titleId: "Kargo Udara",
        desc: "Pengiriman ekspres via udara ke seluruh dunia",
        href: "/air-freight-booking",
        icon: Plane,
        eta: "1–3 hari",
        categoryKeys: ["air_freight"],
      },
      {
        title: "Ocean Freight",
        titleId: "Kargo Laut",
        desc: "FCL & LCL untuk pengiriman internasional volume besar",
        href: "/ocean-freight-booking",
        icon: Ship,
        eta: "7–30 hari",
        categoryKeys: ["sea_freight"],
      },
      {
        title: "Freight Forwarding",
        titleId: "Multimodal",
        desc: "Door-to-door lintas moda transportasi internasional",
        href: "/freight-forwarding",
        icon: Layers,
        eta: "Fleksibel",
        categoryKeys: ["exim_service"],
      },
    ],
  },
  {
    id: "customs",
    title: "Customs & PPJK",
    icon: ClipboardList,
    gradient: "from-orange-600 to-amber-500",
    lightBg: "bg-orange-50",
    textColor: "text-orange-700",
    badgeCls: "bg-orange-100 text-orange-700 border-orange-200",
    services: [
      {
        title: "Customs Clearance",
        titleId: "Bea Cukai",
        desc: "Pengurusan kepabeanan impor & ekspor",
        href: "/pabean",
        icon: FileText,
        eta: "1–3 hari kerja",
        categoryKeys: ["ppjk"],
      },
      {
        title: "PIB / PEB",
        titleId: "Dokumen Impor-Ekspor",
        desc: "Penyusunan dokumen impor (PIB) dan ekspor (PEB)",
        href: "/pabean",
        icon: ClipboardList,
        eta: "Sesuai kebutuhan",
        categoryKeys: ["ppjk"],
      },
      {
        title: "Undername",
        titleId: "Impor Undername",
        desc: "Layanan impor atas nama vendor terpercaya & berlisensi",
        href: "/pabean",
        icon: Users,
        eta: "Fleksibel",
        categoryKeys: ["ppjk"],
      },
    ],
  },
  {
    id: "domestic",
    title: "Transportasi Domestik",
    icon: Truck,
    gradient: "from-amber-600 to-yellow-500",
    lightBg: "bg-amber-50",
    textColor: "text-amber-700",
    badgeCls: "bg-amber-100 text-amber-700 border-amber-200",
    services: [
      {
        title: "Trucking",
        titleId: "Angkutan Truk",
        desc: "Angkutan darat dalam kota & antar kota",
        href: "/trucking",
        icon: Truck,
        eta: "1–3 hari",
        categoryKeys: ["trucking"],
      },
      {
        title: "Last Mile Delivery",
        titleId: "Pengiriman Akhir",
        desc: "Pengiriman ke tujuan akhir pelanggan",
        href: "/jasa?category=last_mile",
        icon: MapPin,
        eta: "Hari yang sama",
        categoryKeys: ["trucking"],
      },
    ],
  },
  {
    id: "warehouse",
    title: "Gudang & Distribusi",
    icon: Warehouse,
    gradient: "from-teal-600 to-emerald-500",
    lightBg: "bg-teal-50",
    textColor: "text-teal-700",
    badgeCls: "bg-teal-100 text-teal-700 border-teal-200",
    services: [
      {
        title: "Warehousing",
        titleId: "Pergudangan",
        desc: "Penyimpanan barang terkelola dengan sistem WMS",
        href: "/jasa?category=handling",
        icon: Warehouse,
        eta: "Fleksibel",
        categoryKeys: ["handling"],
      },
      {
        title: "Distribution",
        titleId: "Distribusi",
        desc: "Distribusi produk ke seluruh jaringan & outlet",
        href: "/jasa?category=handling",
        icon: Package,
        eta: "Fleksibel",
        categoryKeys: ["handling"],
      },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

const stripJasa = (name: string) => name.replace(/^Jasa\s+/i, "");

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

// ── Realtime hook ─────────────────────────────────────────────────────────────

function useServicesRealtime(queryKey: string) {
  const qc = useQueryClient();

  const handleChange = useCallback(() => {
    qc.invalidateQueries({ queryKey: [queryKey] });
  }, [qc, queryKey]);

  const handleCatalogChange = useCallback((payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
    const row = (payload.new ?? payload.old ?? {}) as Record<string, unknown>;
    const isService = row["template_kind"] === "service" || row["kind"] === "service" || !!row["service_type"] || !!row["serviceType"];
    if (!isService) return;
    qc.invalidateQueries({ queryKey: [queryKey] });
  }, [qc, queryKey]);

  useEffect(() => {
    if (!supabase) return;
    const ch1 = supabase.channel("portal-services-jasa-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, handleChange)
      .subscribe();
    const ch2 = supabase.channel("portal-services-jasa-catalog-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vendor_catalog_items" }, handleCatalogChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "vendor_catalog_items" }, handleCatalogChange)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "vendor_catalog_items" }, handleCatalogChange)
      .subscribe();
    return () => {
      supabase!.removeChannel(ch1);
      supabase!.removeChannel(ch2);
    };
  }, [handleChange, handleCatalogChange]);
}

// ── Vendor item card ──────────────────────────────────────────────────────────

function VendorItemCard({ item }: { item: ServiceHubItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const catKey = item.categoryKey ?? item.serviceType ?? "";
  const cat = catKey ? CATEGORY_PLACEHOLDER[catKey] : undefined;
  const src = item.primaryImageUrl ?? (item.imageUrl ? resolveImageUrl(item.imageUrl) : null);
  const fallback = getServiceFallbackImage(item.categories ?? (item.category ? [item.category] : []), item.title);
  const imgSrc = (src && !imgFailed) ? src : fallback;

  return (
    <Link href={item.targetUrl} className="block group">
      <div
        className="bg-white rounded-2xl border border-slate-200 overflow-hidden flex flex-col h-full transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:border-sky-200"
        style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.06)" }}
      >
        <div className="relative h-28 overflow-hidden bg-slate-100">
          {(src && !imgFailed) ? (
            <img src={imgSrc} alt={item.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" onError={() => setImgFailed(true)} loading="lazy" />
          ) : cat ? (
            <div className="w-full h-full flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` }}>
              <span className="text-4xl drop-shadow">{cat.emoji}</span>
            </div>
          ) : (
            <img src={fallback} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
          <span className="absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white/90 text-sky-700">
            {item.source === "vendor_catalog_item" ? "Vendor" : "Internal"}
          </span>
        </div>
        <div className="p-3.5 flex flex-col flex-1 gap-1.5">
          {item.vendorName && (
            <p className="text-[11px] text-slate-400 flex items-center gap-1 truncate">
              <Building2 className="h-3 w-3 shrink-0" />{item.vendorName}
            </p>
          )}
          <h3 className="text-[13px] font-bold text-slate-800 leading-snug line-clamp-2">{item.title}</h3>
          {item.description && <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>}
          <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
            <div>
              {item.price != null
                ? <span className="text-[13px] font-extrabold text-sky-700">{item.currency === "USD" ? `$${item.price.toLocaleString("en-US")}` : formatIDR(item.price)}</span>
                : <span className="text-[11px] text-slate-400 italic">Harga nego</span>
              }
              {item.unit && <span className="text-[10px] text-slate-400 ml-1">/ {item.unit}</span>}
            </div>
            <span className="text-[11px] font-semibold text-sky-600 flex items-center gap-0.5">Detail <ChevronRight className="h-3 w-3" /></span>
          </div>
        </div>
      </div>
    </Link>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

type Mode = "mandiri" | "borongan";

export default function Jasa() {
  const [, setLocation] = useLocation();
  const [mode, setMode] = useState<Mode>("mandiri");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCatId, setActiveCatId] = useState<string | null>(null);
  const { locale } = useLanguage();
  const qc = useQueryClient();

  useServicesRealtime("listPortalServicesJasa");

  useEffect(() => {
    const es = new EventSource("/api/ecommerce/events");
    es.addEventListener("price_sync", () => {
      qc.invalidateQueries({ queryKey: ["listPortalServicesJasa"] });
      qc.invalidateQueries({ queryKey: ["jasaMarketplace"] });
    });
    return () => es.close();
  }, [qc]);

  const { data: marketplaceRaw, isLoading: mktLoading } = useQuery<unknown[]>({
    queryKey: ["jasaMarketplace"],
    queryFn: async () => {
      const res = await fetch("/api/portal/marketplace?kind=service");
      if (!res.ok) throw new Error("Gagal memuat marketplace");
      return res.json();
    },
    staleTime: 30_000,
  });

  const { data: servicesRaw, isLoading: svcLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServicesJasa"], staleTime: 0, gcTime: 0, refetchOnWindowFocus: true },
  });

  const isLoading = mktLoading || svcLoading;

  const vendorItems: ServiceHubItem[] = (Array.isArray(marketplaceRaw) ? marketplaceRaw : []).map((raw: unknown) => {
    const r = raw as Record<string, unknown>;
    const resolvedLabel = (r["resolvedCategoryLabel"] as string | null) ?? (r["kategori"] as string | null) ?? (r["categoryKey"] as string | null) ?? "";
    return {
      source:         "vendor_catalog_item",
      id:             r["id"] as number,
      title:          r["name"] as string,
      category:       resolvedLabel,
      serviceType:    (r["serviceType"] as string | null) ?? null,
      price:          (r["priceSell"] as number | null) ?? null,
      unit:           (r["unit"] as string | null) ?? null,
      targetUrl:      `/jasa/vendor/${r["id"]}`,
      description:    (r["description"] as string | null) ?? null,
      vendorName:     (r["vendorName"] as string | null) ?? null,
      location:       (r["location"] as string | null) ?? null,
      leadTime:       (r["leadTime"] as string | null) ?? null,
      currency:       (r["currency"] as string) ?? "IDR",
      categoryKey:    (r["categoryKey"] as string | null) ?? null,
      primaryImageUrl:(r["primaryImageUrl"] as string | null) ?? null,
    };
  });

  const legacyItems: ServiceHubItem[] = (Array.isArray(servicesRaw) ? servicesRaw : []).map((s: unknown) => {
    const svc = s as Record<string, unknown>;
    const cats = (svc["categories"] as string[] | null) ?? [];
    return {
      source:      "product",
      id:          svc["id"] as number,
      title:       svc["name"] as string,
      category:    cats[0] ?? "",
      serviceType: null,
      price:       (svc["price"] as number) ?? null,
      unit:        (svc["unit"] as string | null) ?? null,
      targetUrl:   `/jasa/${svc["id"]}`,
      description: (svc["description"] as string | null) ?? null,
      imageUrl:    (svc["imageUrl"] as string | null) ?? null,
      categories:  cats,
      currency:    "IDR",
    };
  });

  const dedupById = (items: ServiceHubItem[]) => {
    const seen = new Set<number>();
    return items.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
  };

  const allItems = [...dedupById(vendorItems), ...dedupById(legacyItems)];

  const matchSearch = (item: ServiceHubItem) => {
    const q = searchQuery.toLowerCase();
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      translateServiceName(item.title, locale).toLowerCase().includes(q) ||
      (item.description ?? "").toLowerCase().includes(q) ||
      item.category.toLowerCase().includes(q)
    );
  };

  function getItemsForCategory(cat: MainCategory): ServiceHubItem[] {
    return allItems.filter((item) => {
      if (!matchSearch(item)) return false;
      const itemKeys = [item.categoryKey, item.serviceType, ...(item.categories ?? [item.category])].filter(Boolean) as string[];
      return cat.services.some((s) => s.categoryKeys.some((ck) => itemKeys.some((ik) => ik.toLowerCase().includes(ck.toLowerCase()) || ck.toLowerCase().includes(ik.toLowerCase()))));
    });
  }

  const totalVendorItems = allItems.filter(matchSearch).length;

  return (
    <div className="min-h-screen pb-24 bg-slate-50">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-sky-900 pt-8 pb-10 px-4">
        <div className="max-w-5xl mx-auto">
          <button
            onClick={() => window.history.length > 1 ? window.history.back() : setLocation("/")}
            className="inline-flex items-center gap-1.5 mb-5 text-[12px] font-semibold px-3 py-1.5 rounded-lg text-white/70 hover:text-white bg-white/10 hover:bg-white/20 border border-white/15 transition-all"
          >
            ← Kembali
          </button>

          <h1 className="text-2xl md:text-3xl font-bold text-white mb-1.5">Buat Permintaan Layanan</h1>
          <p className="text-white/60 text-sm mb-6">Pilih layanan logistik yang Anda butuhkan</p>

          {/* Mode selector */}
          <div className="inline-flex bg-white/10 border border-white/20 rounded-2xl p-1 gap-1">
            {([ ["mandiri", "Item Mandiri", "Pilih per layanan"], ["borongan", "Paket Borongan", "Bundled solution"] ] as const).map(([id, label, sub]) => (
              <button
                key={id}
                onClick={() => setMode(id)}
                className={`flex flex-col items-start px-5 py-2.5 rounded-xl transition-all duration-200 text-left ${
                  mode === id
                    ? "bg-white text-slate-900 shadow-md"
                    : "text-white/70 hover:text-white hover:bg-white/10"
                }`}
              >
                <span className="text-[13px] font-bold">{label}</span>
                <span className={`text-[11px] ${mode === id ? "text-slate-500" : "text-white/50"}`}>{sub}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 md:px-6 -mt-4">

        {mode === "mandiri" ? (
          <>
            {/* Search */}
            <div className="bg-white rounded-2xl shadow-lg border border-slate-100 p-4 mb-8">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <Input
                  placeholder="Cari layanan, misal: air freight, trucking, pabean..."
                  className="pl-9 pr-9 border-0 bg-slate-50 focus-visible:ring-1 focus-visible:ring-sky-300 rounded-xl"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              {searchQuery && (
                <p className="text-xs text-slate-400 mt-2 px-1">
                  {totalVendorItems} layanan vendor ditemukan untuk "<span className="font-medium text-slate-600">{searchQuery}</span>"
                </p>
              )}
            </div>

            {/* 4 Category Sections */}
            <div className="space-y-10">
              {MAIN_CATEGORIES.map((cat) => {
                const CatIcon = cat.icon;
                const isActive = activeCatId === cat.id;
                const vendorMatches = getItemsForCategory(cat);

                return (
                  <section key={cat.id}>
                    {/* Category header */}
                    <div className="flex items-center gap-3 mb-5">
                      <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${cat.gradient} flex items-center justify-center shrink-0 shadow-sm`}>
                        <CatIcon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <h2 className="text-[17px] font-bold text-slate-800">{cat.title}</h2>
                        <p className="text-xs text-slate-400">{cat.services.length} layanan tersedia</p>
                      </div>
                    </div>

                    {/* Subcategory cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
                      {cat.services.map((svc) => {
                        const SvcIcon = svc.icon;
                        return (
                          <Link key={svc.href + svc.title} href={svc.href}>
                            <div className={`group bg-white rounded-2xl border border-slate-200 p-5 flex flex-col gap-3 cursor-pointer transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-${cat.lightBg.replace("bg-", "")}`}
                              style={{ boxShadow: "0 2px 8px rgba(0,0,0,0.04)" }}>
                              <div className="flex items-start justify-between gap-2">
                                <div className={`w-10 h-10 rounded-xl ${cat.lightBg} flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform`}>
                                  <SvcIcon className={`h-5 w-5 ${cat.textColor}`} />
                                </div>
                                <Badge variant="outline" className={`text-[10px] font-semibold border ${cat.badgeCls} shrink-0`}>
                                  <Clock className="h-2.5 w-2.5 mr-1" />{svc.eta}
                                </Badge>
                              </div>
                              <div>
                                <h3 className="font-bold text-slate-800 text-[14px] leading-snug">{svc.title}</h3>
                                <p className="text-[12px] text-slate-500 leading-relaxed mt-0.5">{svc.desc}</p>
                              </div>
                              <div className={`flex items-center gap-1 text-[12px] font-semibold ${cat.textColor} group-hover:gap-2 transition-all`}>
                                Mulai Request <ChevronRight className="h-3.5 w-3.5" />
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>

                    {/* Vendor catalog items for this category */}
                    {!isLoading && vendorMatches.length > 0 && (
                      <div>
                        <button
                          onClick={() => setActiveCatId(isActive ? null : cat.id)}
                          className="flex items-center gap-2 text-[13px] font-semibold text-slate-600 hover:text-slate-800 mb-3 group"
                        >
                          <span className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-600 group-hover:border-slate-300 transition-colors">
                            {isActive ? "▲" : "▼"} {vendorMatches.length} penawaran vendor tersedia
                          </span>
                        </button>
                        {isActive && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {vendorMatches.map((item) => (
                              <VendorItemCard key={`${item.source}-${item.id}`} item={item} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {isLoading && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[1,2,3].map((i) => (
                          <div key={i} className="h-52 bg-white rounded-2xl border border-slate-200 animate-pulse" />
                        ))}
                      </div>
                    )}

                    <div className="border-b border-slate-100 mt-8" />
                  </section>
                );
              })}
            </div>

            {/* All vendor items when searching */}
            {searchQuery && totalVendorItems > 0 && (
              <div className="mt-10">
                <h2 className="text-[16px] font-bold text-slate-800 mb-4">Semua Hasil Pencarian ({totalVendorItems})</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {allItems.filter(matchSearch).map((item) => (
                    <VendorItemCard key={`${item.source}-${item.id}`} item={item} />
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          /* ── Paket Borongan ──────────────────────────────────────────── */
          <div className="mt-6">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-sky-500 flex items-center justify-center mx-auto mb-5 shadow-md">
                <Layers className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-800 mb-2">Paket Borongan Logistik</h2>
              <p className="text-slate-500 text-sm leading-relaxed mb-6">
                Dapatkan solusi logistik end-to-end dengan harga kontrak yang kompetitif. Cocok untuk bisnis dengan volume pengiriman rutin.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-7 text-left">
                {[
                  { icon: Globe, title: "Full Forwarding", desc: "Kargo udara + bea cukai + trucking dalam satu paket" },
                  { icon: Ship, title: "Sea Freight Bundle", desc: "FCL/LCL + customs clearance + last mile delivery" },
                  { icon: Package, title: "Warehousing+Distribusi", desc: "Gudang, inventory management, dan distribusi nasional" },
                ].map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center mb-2.5">
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <p className="text-[13px] font-semibold text-slate-800 mb-1">{title}</p>
                    <p className="text-[11px] text-slate-500 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>

              <p className="text-xs text-slate-400 mb-5">Tim kami akan menghubungi Anda dalam 1 hari kerja untuk diskusi kebutuhan</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link href="/book">
                  <Button className="gap-2 bg-sky-600 hover:bg-sky-700 shadow-sm">
                    <Plus className="h-4 w-4" /> Ajukan Permintaan
                  </Button>
                </Link>
                <Link href="/contact">
                  <Button variant="outline" className="gap-2">
                    <MessageSquare className="h-4 w-4" /> Konsultasi Gratis
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
