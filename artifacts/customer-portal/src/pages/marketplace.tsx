
import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search, MapPin, Package, ShoppingCart, CheckCircle,
  SlidersHorizontal, X, ChevronDown,
} from "lucide-react";
import { useCart } from "@/lib/logistic-cart";
import { OPEN_CART_EVENT } from "@/components/CartDrawer";
import { useLanguage } from "@/i18n/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types ─────────────────────────────────────────────────────────────────────

interface MarketplaceProduct {
  id: number;
  name: string;
  description: string | null;
  kategori: string | null;
  categoryKey: string | null;
  priceSell: number | null;
  currency: string;
  unit: string | null;
  moq: number | null;
  stockStatus: string | null;
  leadTime: string | null;
  location: string | null;
  origin: string | null;
  vendorId: number;
  vendorName: string | null;
  vendorDisplayName: string;
  specValues: Record<string, string | number> | null;
  templateKind: string | null;
}

interface Vendor { id: number; name: string; }

// ── Helpers ───────────────────────────────────────────────────────────────────

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(v);

const STOCK_CONFIG: Record<string, { label: string; cls: string }> = {
  available:    { label: "Tersedia", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  limited:      { label: "Terbatas", cls: "bg-amber-100  text-amber-700  border-amber-200"  },
  out_of_stock: { label: "Habis",    cls: "bg-red-100    text-red-700    border-red-200"    },
};

const HERO_BG = `${import.meta.env.BASE_URL ?? "/"}images/product-hero-brand.png`;

// ── ProductCard ───────────────────────────────────────────────────────────────

function ProductCard({ product }: { product: MarketplaceProduct }) {
  const [added, setAdded] = useState(false);
  const { addItem } = useCart();

  const status    = STOCK_CONFIG[product.stockStatus ?? "available"] ?? STOCK_CONFIG.available;
  const hasPrice  = product.priceSell != null && product.priceSell > 0;
  const category  = product.categoryKey ?? product.kategori;
  const qty       = product.moq ?? 1;
  const price     = product.priceSell ?? 0;

  function handleAdd() {
    if (product.stockStatus === "out_of_stock") return;
    addItem({
      category:           "Marketplace",
      serviceName:        product.name,
      calculatorType:     "product",
      inputData: {
        vendorCatalogItemId: product.id,
        vendorName:          product.vendorDisplayName,
        qty,
        unit:                product.unit ?? "pcs",
        productPrice:        price,
        location:            product.location ?? product.origin ?? "",
      },
      calculationResult:  {},
      subtotal:           price * qty,
    });
    setAdded(true);
    window.dispatchEvent(new Event(OPEN_CART_EVENT));
    setTimeout(() => setAdded(false), 2500);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden flex flex-col">
      {/* Vendor badge + stock */}
      <div className="flex items-start justify-between gap-2 px-4 pt-4 pb-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-5 h-5 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
            <Package className="w-3 h-3 text-blue-600" />
          </div>
          <span className="text-[11px] font-bold text-slate-500 truncate">
            {product.vendorDisplayName}
          </span>
        </div>
        <span className={`shrink-0 border rounded-full text-[10px] font-semibold px-2 py-0 leading-5 ${status.cls}`}>
          {status.label}
        </span>
      </div>

      {/* Name + category chip */}
      <div className="px-4 pb-2">
        <h3 className="font-bold text-slate-900 text-[15px] leading-snug line-clamp-2">
          {product.name}
        </h3>
        {category && (
          <span className="inline-block mt-1 text-[10px] font-semibold bg-slate-100 text-slate-500 rounded-full px-2 py-0.5">
            {category}
          </span>
        )}
      </div>

      {/* Spec values */}
      {product.specValues && Object.keys(product.specValues).length > 0 && (
        <div className="px-4 pb-2">
          <div className="flex flex-wrap gap-1">
            {Object.entries(product.specValues)
              .slice(0, 4)
              .map(([k, v]) => (
                <span
                  key={k}
                  className="text-[10px] bg-blue-50 text-blue-700 rounded px-1.5 py-0.5 font-medium"
                >
                  {k.replace(/_/g, " ")}: {String(v)}
                </span>
              ))}
          </div>
        </div>
      )}

      {/* Description */}
      {product.description && (
        <div className="px-4 pb-2">
          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
            {product.description}
          </p>
        </div>
      )}

      <div className="flex-1" />

      {/* Location + MOQ + lead time */}
      <div className="px-4 pb-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
        {(product.location || product.origin) && (
          <span className="flex items-center gap-0.5">
            <MapPin className="w-3 h-3" />
            {product.location || product.origin}
          </span>
        )}
        {product.moq != null && product.moq > 1 && (
          <span>MOQ: {product.moq} {product.unit ?? "pcs"}</span>
        )}
        {product.leadTime && (
          <span>Lead: {product.leadTime}</span>
        )}
      </div>

      {/* Price + Add button */}
      <div className="px-4 pb-4 flex items-end justify-between gap-3 border-t border-slate-100 pt-3">
        <div>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            Harga
          </p>
          {hasPrice ? (
            <p className="text-base font-bold text-primary leading-none">
              {product.currency === "USD"
                ? `USD ${product.priceSell?.toLocaleString("en-US")}`
                : formatIDR(product.priceSell!)}
              {product.unit && (
                <span className="text-[10px] font-normal text-slate-400 ml-0.5">
                  /{product.unit}
                </span>
              )}
            </p>
          ) : (
            <p className="text-sm font-bold text-amber-600">Harga Nego</p>
          )}
        </div>
        <Button
          size="sm"
          className="gap-1.5 shrink-0 h-8 text-xs"
          onClick={handleAdd}
          disabled={product.stockStatus === "out_of_stock"}
        >
          {added
            ? <CheckCircle className="w-3.5 h-3.5" />
            : <ShoppingCart className="w-3.5 h-3.5" />}
          {added ? "Ditambahkan!" : "Tambah"}
        </Button>
import { useState, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Store, Search, SlidersHorizontal, X, Building2, Package, Truck,
  Tag, MapPin, Clock, ChevronRight, Filter, RefreshCw,
} from "lucide-react";
import type { MarketplaceItem, FilterFieldDef, ActiveFilters } from "@/lib/catalogFilters";
import { buildCatalogFilters, matchVendorCatalog } from "@/lib/catalogFilters";

// ── Category definitions ─────────────────────────────────────────────────────
const PRODUCT_CATS = [
  { key: "all",        label: "Semua Produk",   emoji: "📦" },
  { key: "coffee",     label: "Kopi",           emoji: "☕" },
  { key: "coal",       label: "Batubara",       emoji: "⛏️" },
  { key: "iron_steel", label: "Besi & Baja",    emoji: "🏗️" },
  { key: "palm_oil",   label: "Sawit",          emoji: "🌴" },
  { key: "nickel",     label: "Nikel",          emoji: "🔩" },
  { key: "copper",     label: "Tembaga",        emoji: "🔶" },
  { key: "rice",       label: "Beras",          emoji: "🌾" },
  { key: "sugar",      label: "Gula",           emoji: "🍬" },
  { key: "seafood",    label: "Seafood",        emoji: "🐟" },
  { key: "frozen_food",label: "Frozen Food",   emoji: "❄️" },
  { key: "furniture",  label: "Furniture",      emoji: "🪑" },
  { key: "chemical",   label: "Kimia",          emoji: "⚗️" },
  { key: "textile",    label: "Tekstil",        emoji: "🧵" },
];

const SERVICE_CATS = [
  { key: "all",          label: "Semua Jasa",  emoji: "🌐" },
  { key: "trucking",     label: "Trucking",    emoji: "🚛" },
  { key: "sea_freight",  label: "Sea Freight", emoji: "🚢" },
  { key: "air_freight",  label: "Air Freight", emoji: "✈️" },
  { key: "ppjk",         label: "PPJK",        emoji: "📋" },
  { key: "handling",     label: "Handling",    emoji: "🏭" },
  { key: "document",     label: "Document",    emoji: "📄" },
  { key: "exim_service", label: "Exim Service",emoji: "🌍" },
];

// ── Currency formatter ────────────────────────────────────────────────────────
function formatPrice(price: number, currency: string): string {
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(price);
  }
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price);
}

// ── Stock badge ───────────────────────────────────────────────────────────────
function StockBadge({ status }: { status: string | null }) {
  const MAP: Record<string, { label: string; cls: string }> = {
    available:    { label: "Tersedia",      cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    limited:      { label: "Terbatas",      cls: "bg-amber-100 text-amber-700 border-amber-200" },
    out_of_stock: { label: "Habis",         cls: "bg-red-100 text-red-700 border-red-200" },
    "Ready Stock":{ label: "Ready Stock",  cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
    "Indent":     { label: "Indent",       cls: "bg-amber-100 text-amber-700 border-amber-200" },
    "Pre-order":  { label: "Pre-order",    cls: "bg-sky-100 text-sky-700 border-sky-200" },
  };
  const info = (status ? MAP[status] : null) ?? { label: status ?? "—", cls: "bg-slate-100 text-slate-600 border-slate-200" };
  return <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${info.cls}`}>{info.label}</span>;
}

// ── Spec chip summary ─────────────────────────────────────────────────────────
function SpecChips({ specValues, templateSnapshot, limit = 3 }: {
  specValues: unknown;
  templateSnapshot: unknown;
  limit?: number;
}) {
  const specs = specValues && typeof specValues === "object" ? specValues as Record<string, unknown> : {};
  const snapshot = templateSnapshot && typeof templateSnapshot === "object" ? templateSnapshot as Record<string, unknown> : {};

  const fields: Array<{ key: string; label: string }> = [];
  if (Array.isArray(snapshot["customFields"])) {
    for (const f of snapshot["customFields"] as Array<{ key: string; label: string; type: string }>) {
      if (f.type !== "textarea" && f.type !== "date") fields.push({ key: f.key, label: f.label });
    }
  } else if (Array.isArray(snapshot["fields"])) {
    for (const f of snapshot["fields"] as Array<{ key: string; label: string; type: string; section?: string }>) {
      if ((f.section === "quotation" || f.section === "both") && f.type !== "textarea" && f.type !== "date") {
        fields.push({ key: f.key, label: f.label });
      }
    }
  }

  const chips = fields
    .filter((f) => specs[f.key] !== undefined && specs[f.key] !== null && String(specs[f.key]).trim() !== "")
    .slice(0, limit)
    .map((f) => ({ label: f.label, value: String(specs[f.key]) }));

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {chips.map((c) => (
        <span key={c.label} className="text-[11px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200 font-medium">
          {c.label}: <span className="text-slate-800">{c.value}</span>
        </span>
      ))}
    </div>
  );
}

// ── Item Card ─────────────────────────────────────────────────────────────────
function ItemCard({ item, onClick }: { item: MarketplaceItem; onClick: () => void }) {
  const isProduct = item.templateKind === "product";
  return (
    <div
      className="bg-white rounded-2xl border border-slate-200 hover:border-sky-300 hover:shadow-md transition-all duration-200 cursor-pointer flex flex-col overflow-hidden"
      onClick={onClick}
    >
      {/* Header band */}
      <div className={`h-1.5 w-full ${isProduct ? "bg-gradient-to-r from-emerald-400 to-teal-400" : "bg-gradient-to-r from-sky-400 to-blue-500"}`} />

      <div className="p-4 flex flex-col flex-1 gap-2">
        {/* Vendor + category */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
            <span className="text-[12px] font-semibold text-slate-500 truncate">{item.vendorName ?? "Vendor"}</span>
          </div>
          <StockBadge status={item.stockStatus} />
        </div>

        {/* Item name */}
        <h3 className="text-[14px] font-bold text-slate-800 leading-snug line-clamp-2 flex-1">
          {item.name}
        </h3>

        {/* Spec chips */}
        <SpecChips specValues={item.specValues} templateSnapshot={item.templateSnapshot} />

        {/* Description */}
        {item.description && (
          <p className="text-[12px] text-slate-500 line-clamp-2 leading-relaxed">{item.description}</p>
        )}

        {/* Meta row */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-500">
          {item.origin && (
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.origin}</span>
          )}
          {item.location && (
            <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.location}</span>
          )}
          {item.leadTime && (
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Lead: {item.leadTime}</span>
          )}
          {item.moq != null && item.unit && (
            <span className="flex items-center gap-1"><Tag className="h-3 w-3" />MOQ: {item.moq} {item.unit}</span>
          )}
        </div>

        {/* Price */}
        <div className="mt-auto pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
          <div>
            {item.priceSell != null
              ? <span className="text-[16px] font-extrabold text-sky-700">{formatPrice(item.priceSell, item.currency)}</span>
              : <span className="text-[12px] text-slate-400 italic">Harga nego</span>
            }
            {item.unit && <span className="text-[11px] text-slate-400 ml-1">/ {item.unit}</span>}
          </div>
          <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Marketplace() {
  const { t } = useLanguage();

  const [search,          setSearch]          = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setCategory]       = useState<string | null>(null);
  const [selectedVendor,   setVendor]         = useState("all");
  const [selectedStock,    setStock]          = useState("all");
  const [selectedLocation, setLocFilter]      = useState("all");

  // Debounce search
  useEffect(() => {
    const tid = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(tid);
  }, [search]);

  // Build query params for server-side filter
  const params = new URLSearchParams();
  if (debouncedSearch) params.set("search", debouncedSearch);
  if (selectedVendor !== "all") params.set("vendor", selectedVendor);
  if (selectedCategory) params.set("category", selectedCategory);

  const { data: products = [], isLoading } = useQuery<MarketplaceProduct[]>({
    queryKey: ["marketplace-products", debouncedSearch, selectedVendor, selectedCategory],
    queryFn: async () => {
      const res = await fetch(`/api/marketplace/products?${params}`);
      if (!res.ok) throw new Error("Gagal memuat produk");
      return res.json();
    },
  });

  const { data: vendors = [] } = useQuery<Vendor[]>({
    queryKey: ["marketplace-vendors"],
    queryFn: async () => {
      const res = await fetch("/api/marketplace/vendors");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: categories = [] } = useQuery<string[]>({
    queryKey: ["marketplace-categories"],
    queryFn: async () => {
      const res = await fetch("/api/marketplace/categories");
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Client-side stock + location filter
  const filtered = useMemo(() => {
    let items = products;
    if (selectedStock !== "all")
      items = items.filter((p) => p.stockStatus === selectedStock);
    if (selectedLocation !== "all")
      items = items.filter(
        (p) =>
          (p.location ?? "").toLowerCase().includes(selectedLocation.toLowerCase()) ||
          (p.origin ?? "").toLowerCase().includes(selectedLocation.toLowerCase()),
      );
    return items;
  }, [products, selectedStock, selectedLocation]);

  // Unique locations from loaded data
  const locations = useMemo(() => {
    const locs = new Set<string>();
    products.forEach((p) => {
      if (p.location) locs.add(p.location);
      else if (p.origin) locs.add(p.origin);
    });
    return Array.from(locs).sort();
  }, [products]);

  const hasActiveFilter =
    selectedVendor !== "all" ||
    selectedStock  !== "all" ||
    selectedLocation !== "all" ||
    !!selectedCategory ||
    !!search;

  function resetAll() {
    setVendor("all");
    setStock("all");
    setLocFilter("all");
    setCategory(null);
    setSearch("");
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Hero ── */}
      <section className="relative overflow-hidden" style={{ minHeight: 340 }}>
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url(${HERO_BG})` }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(120deg,rgba(3,37,76,0.88) 0%,rgba(14,116,144,0.72) 100%)",
          }}
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(to bottom,transparent,rgba(241,245,249,0.28))",
          }}
        />

        <div
          className="relative mx-auto px-6 md:px-10 pt-20 pb-14"
          style={{ maxWidth: 900 }}
        >
          <div className="flex items-center gap-2.5 mb-4">
            <div className="h-px w-10 rounded-full bg-white/40" />
            <p className="font-bold uppercase text-white/80 text-[11px] tracking-[0.20em]">
              MARKETPLACE
            </p>
          </div>
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{
              fontSize: "clamp(34px,5.5vw,68px)",
              lineHeight: 1.06,
              letterSpacing: "-0.026em",
              textShadow: "0 4px 28px rgba(7,17,36,0.32)",
            }}
          >
            Marketplace
          </h1>
          <p
            className="mb-8 text-white/90"
            style={{
              fontSize: "clamp(14px,1.75vw,18px)",
              maxWidth: 560,
              lineHeight: 1.72,
              textShadow: "0 2px 10px rgba(7,17,36,0.22)",
            }}
          >
            Temukan produk unggulan dari vendor terpercaya — komoditas, bahan baku,
            dan produk pilihan siap order dengan notifikasi WhatsApp otomatis.
          </p>

          {/* Search */}
          <div className="relative max-w-[580px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari produk, vendor, atau deskripsi…"
              className="pl-10 h-12 text-[15px] rounded-xl bg-white/95 backdrop-blur border-white/30 shadow-lg"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </section>

      <div
        className="mx-auto px-4 md:px-8 py-8"
        style={{ maxWidth: 1280 }}
      >
        {/* ── Category chips ── */}
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button
              onClick={() => setCategory(null)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                !selectedCategory
                  ? "bg-primary text-white border-primary shadow-sm"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              Semua Produk
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setCategory(selectedCategory === cat ? null : cat)}
                className={`px-3.5 py-1.5 rounded-full text-sm font-semibold border transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="flex gap-6 items-start">
          {/* ── Sidebar ── */}
          <aside className="hidden md:block w-52 shrink-0">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-5 sticky top-24">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-700 pb-2 border-b border-slate-100">
                <SlidersHorizontal className="w-4 h-4" /> Filter
              </div>

              {/* Vendor */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  VENDOR
                </p>
                <Select value={selectedVendor} onValueChange={setVendor}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Semua Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Vendor</SelectItem>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Stock status */}
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  STATUS STOK
                </p>
                <Select value={selectedStock} onValueChange={setStock}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Semua Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Semua Status</SelectItem>
                    <SelectItem value="available">Tersedia</SelectItem>
                    <SelectItem value="limited">Terbatas</SelectItem>
                    <SelectItem value="out_of_stock">Habis</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Location */}
              {locations.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                    LOKASI
                  </p>
                  <Select value={selectedLocation} onValueChange={setLocFilter}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Semua Lokasi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Semua Lokasi</SelectItem>
                      {locations.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {hasActiveFilter && (
                <button
                  onClick={resetAll}
                  className="w-full text-xs text-slate-500 hover:text-red-500 flex items-center gap-1 justify-center py-1 transition-colors"
                >
                  <X className="w-3.5 h-3.5" /> Reset Filter
                </button>
              )}
            </div>
          </aside>

          {/* ── Product grid ── */}
          <main className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-500">
                <span className="font-bold text-slate-800">{filtered.length}</span>{" "}
                produk ditemukan
              </p>
              {hasActiveFilter && (
                <button
                  onClick={resetAll}
                  className="md:hidden text-xs text-slate-400 hover:text-red-500 flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Reset
// ── Detail Modal ──────────────────────────────────────────────────────────────
function ItemDetailModal({ item, onClose }: { item: MarketplaceItem; onClose: () => void }) {
  const [, setLocation] = useLocation();
  const specs = item.specValues && typeof item.specValues === "object" ? item.specValues as Record<string, unknown> : {};
  const snapshot = item.templateSnapshot && typeof item.templateSnapshot === "object" ? item.templateSnapshot as Record<string, unknown> : {};

  const fields: Array<{ key: string; label: string; type: string; section?: string }> = [];
  if (Array.isArray(snapshot["customFields"])) {
    fields.push(...(snapshot["customFields"] as typeof fields));
  } else if (Array.isArray(snapshot["fields"])) {
    (snapshot["fields"] as typeof fields)
      .filter((f) => f.section === "quotation" || f.section === "both")
      .forEach((f) => fields.push(f));
  }

  const filledFields = fields.filter(
    (f) => f.type !== "textarea" && specs[f.key] !== undefined && specs[f.key] !== null && String(specs[f.key]).trim() !== "",
  );

  function handleRequestQuote() {
    onClose();
    if (item.templateKind === "service") {
      setLocation("/jasa");
    } else {
      setLocation("/order-produk");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {item.templateKind === "product"
              ? <Package className="h-4 w-4 text-emerald-500" />
              : <Truck className="h-4 w-4 text-sky-500" />
            }
            <DialogTitle className="text-[16px] font-bold text-slate-800 leading-tight">
              {item.name}
            </DialogTitle>
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-slate-400" />
            <span className="text-[12px] text-slate-500 font-semibold">{item.vendorName ?? "Vendor"}</span>
            <StockBadge status={item.stockStatus} />
          </div>
        </DialogHeader>

        <div className="space-y-4 mt-2">
          {/* Price block */}
          {item.priceSell != null && (
            <div className="bg-sky-50 border border-sky-200 rounded-xl px-4 py-3">
              <div className="text-[11px] text-sky-600 font-semibold uppercase tracking-wider mb-0.5">Harga Jual</div>
              <div className="text-[20px] font-extrabold text-sky-700">
                {formatPrice(item.priceSell, item.currency)}
                {item.unit && <span className="text-[13px] font-medium text-sky-500 ml-1">/ {item.unit}</span>}
              </div>
            </div>
          )}

          {/* Description */}
          {item.description && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Deskripsi</div>
              <p className="text-[13px] text-slate-700 leading-relaxed">{item.description}</p>
            </div>
          )}

          {/* Specs */}
          {filledFields.length > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Spesifikasi</div>
              <div className="grid grid-cols-2 gap-2">
                {filledFields.map((f) => (
                  <div key={f.key} className="bg-slate-50 rounded-lg px-3 py-2">
                    <div className="text-[10px] text-slate-400 font-semibold">{f.label}</div>
                    <div className="text-[13px] font-bold text-slate-800 mt-0.5">{String(specs[f.key])}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta */}
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            {item.origin && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span><span className="text-slate-400">Asal:</span> {item.origin}</span>
              </div>
            )}
            {item.location && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <MapPin className="h-3.5 w-3.5 text-slate-400" />
                <span><span className="text-slate-400">Lokasi:</span> {item.location}</span>
              </div>
            )}
            {item.leadTime && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Clock className="h-3.5 w-3.5 text-slate-400" />
                <span><span className="text-slate-400">Lead Time:</span> {item.leadTime}</span>
              </div>
            )}
            {item.moq != null && (
              <div className="flex items-center gap-1.5 text-slate-600">
                <Tag className="h-3.5 w-3.5 text-slate-400" />
                <span><span className="text-slate-400">MOQ:</span> {item.moq} {item.unit ?? ""}</span>
              </div>
            )}
          </div>

          {/* CTA */}
          <div className="pt-2 border-t border-slate-100 flex gap-2">
            <Button
              className="flex-1 bg-sky-600 hover:bg-sky-700 text-white rounded-xl h-10 text-[13px] font-semibold"
              onClick={handleRequestQuote}
            >
              Request Quote / Pesan
            </Button>
            <Button variant="outline" className="rounded-xl h-10 text-[13px]" onClick={onClose}>
              Tutup
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Filter Sidebar ─────────────────────────────────────────────────────────────
function FilterSidebar({
  filters,
  active,
  onChange,
  onReset,
  searchQuery,
  onSearchChange,
}: {
  filters: FilterFieldDef[];
  active: ActiveFilters;
  onChange: (key: string, value: string | [number | null, number | null] | null) => void;
  onReset: () => void;
  searchQuery: string;
  onSearchChange: (v: string) => void;
}) {
  const hasActive = Object.values(active).some((v) => v !== null) || searchQuery.trim() !== "";

  return (
    <aside className="w-full lg:w-64 shrink-0 space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Cari nama, vendor, deskripsi..."
          className="pl-9 rounded-xl h-10 border-slate-200 bg-white text-[13px]"
        />
        {searchQuery && (
          <button
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            onClick={() => onSearchChange("")}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Reset */}
      {hasActive && (
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 text-[12px] text-sky-600 hover:text-sky-800 font-semibold"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reset semua filter
        </button>
      )}

      {/* Filter cards */}
      {filters.map((f) => (
        <div key={f.key} className="bg-white rounded-xl border border-slate-200 p-3 space-y-2">
          <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{f.label}</div>
          {f.type === "select" && f.options && (
            <Select
              value={(active[f.key] as string | undefined) ?? ""}
              onValueChange={(v) => onChange(f.key, v === "__all__" ? null : v)}
            >
              <SelectTrigger className="h-8 text-[12px] rounded-lg border-slate-200">
                <SelectValue placeholder="Semua" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Semua</SelectItem>
                {f.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {f.type === "number-range" && f.min !== undefined && f.max !== undefined && (
            <div className="space-y-2 px-1">
              <Slider
                min={f.min}
                max={f.max}
                step={f.max > 1000 ? Math.round((f.max - f.min) / 100) : 1}
                value={(() => {
                  const v = active[f.key] as [number | null, number | null] | null;
                  return [v?.[0] ?? f.min!, v?.[1] ?? f.max!];
                })()}
                onValueChange={([a, b]) => onChange(f.key, [a, b])}
                className="w-full"
              />
              <div className="flex justify-between text-[10px] text-slate-500">
                <span>{((active[f.key] as [number | null, number | null] | null)?.[0] ?? f.min)?.toLocaleString("id-ID")}</span>
                <span>{((active[f.key] as [number | null, number | null] | null)?.[1] ?? f.max)?.toLocaleString("id-ID")}</span>
              </div>
            </div>
          )}
        </div>
      ))}

      {filters.length === 0 && (
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 text-center text-[12px] text-slate-400">
          <Filter className="h-4 w-4 mx-auto mb-1 opacity-40" />
          Filter tersedia setelah ada item
        </div>
      )}
    </aside>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────────
export default function MarketplacePage() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<"product" | "service">("product");
  const [activeCategory, setActiveCategory] = useState("all");
  const [activeFilters, setActiveFilters] = useState<ActiveFilters>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showMobileFilter, setShowMobileFilter] = useState(false);

  const categories = activeTab === "product" ? PRODUCT_CATS : SERVICE_CATS;

  // Reset category when tab changes
  function handleTabChange(tab: "product" | "service") {
    setActiveTab(tab);
    setActiveCategory("all");
    setActiveFilters({});
    setSearchQuery("");
  }

  function handleCategoryChange(cat: string) {
    setActiveCategory(cat);
    setActiveFilters({});
    setSearchQuery("");
  }

  // ── Fetch all published items for current tab + category ──────────────────
  const queryKey = ["marketplace", activeTab, activeCategory];
  const { data: items = [], isLoading } = useQuery<MarketplaceItem[]>({
    queryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ kind: activeTab });
      if (activeCategory !== "all") params.set("category", activeCategory);
      const res = await fetch(`/api/portal/marketplace?${params.toString()}`);
      if (!res.ok) throw new Error("Gagal memuat marketplace");
      return res.json() as Promise<MarketplaceItem[]>;
    },
    staleTime: 60_000,
  });

  // ── Build filters from fetched items ──────────────────────────────────────
  const filters = useMemo(() => buildCatalogFilters(items), [items]);

  // ── Apply active filters + search ─────────────────────────────────────────
  const visibleItems = useMemo(() => {
    const merged: ActiveFilters = { ...activeFilters };
    if (searchQuery.trim()) merged["__search"] = searchQuery.trim();
    return items.filter((item) => matchVendorCatalog(item, merged));
  }, [items, activeFilters, searchQuery]);

  const handleFilterChange = useCallback(
    (key: string, value: string | [number | null, number | null] | null) => {
      setActiveFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleReset = useCallback(() => {
    setActiveFilters({});
    setSearchQuery("");
  }, []);

  const activeFilterCount = Object.values(activeFilters).filter((v) => v !== null).length + (searchQuery.trim() ? 1 : 0);

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* ── Hero Header ──────────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-sky-700 via-sky-600 to-blue-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-10 md:py-14">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-white/15 flex items-center justify-center backdrop-blur-sm">
              <Store className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-sky-200 uppercase tracking-widest">Vendor Marketplace</p>
              <h1 className="text-[22px] md:text-[28px] font-extrabold text-white leading-tight">
                Etalase Vendor
              </h1>
            </div>
          </div>
          <p className="text-[14px] text-sky-100 max-w-2xl leading-relaxed">
            Jelajahi produk dan layanan dari vendor kami yang telah terverifikasi. Temukan penawaran terbaik, bandingkan spesifikasi, dan ajukan permintaan penawaran langsung.
          </p>

          {/* ── Tab switcher ────────────────────────────────────────────── */}
          <div className="flex gap-2 mt-6">
            <button
              onClick={() => handleTabChange("product")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                activeTab === "product"
                  ? "bg-white text-sky-700 shadow-md"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Package className="h-4 w-4" />
              Produk
            </button>
            <button
              onClick={() => handleTabChange("service")}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-200 ${
                activeTab === "service"
                  ? "bg-white text-sky-700 shadow-md"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Truck className="h-4 w-4" />
              Layanan / Jasa
            </button>
          </div>
        </div>
      </div>

      {/* ── Category chips ────────────────────────────────────────────────── */}
      <div className="sticky top-[76px] z-30 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex gap-2 py-2.5 overflow-x-auto scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => handleCategoryChange(cat.key)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] font-semibold whitespace-nowrap transition-all duration-200 border ${
                  activeCategory === cat.key
                    ? "bg-sky-600 text-white border-sky-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-700"
                }`}
              >
                <span>{cat.emoji}</span>
                {cat.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div className="max-w-7xl mx-auto px-4 py-6">

        {/* Mobile filter toggle */}
        <div className="lg:hidden mb-4 flex items-center gap-2">
          <button
            onClick={() => setShowMobileFilter(!showMobileFilter)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-[13px] font-semibold text-slate-700 hover:border-sky-300 transition-all"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filter
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-sky-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] flex items-center justify-center rounded-full px-1">
                {activeFilterCount}
              </span>
            )}
          </button>
          <span className="text-[12px] text-slate-500">{visibleItems.length} item ditemukan</span>
        </div>

        <div className="flex gap-6">
          {/* ── Filter Sidebar — desktop always, mobile conditional ────────── */}
          <div className={`${showMobileFilter ? "block" : "hidden"} lg:block`}>
            <FilterSidebar
              filters={filters}
              active={activeFilters}
              onChange={handleFilterChange}
              onReset={handleReset}
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
            />
          </div>

          {/* ── Item grid ─────────────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {/* Desktop count */}
            <div className="hidden lg:flex items-center justify-between mb-4">
              <span className="text-[13px] text-slate-500">
                <span className="font-semibold text-slate-800">{visibleItems.length}</span> item ditemukan
                {items.length !== visibleItems.length && <span className="ml-1">(dari {items.length} total)</span>}
              </span>
              {activeFilterCount > 0 && (
                <button onClick={handleReset} className="text-[12px] text-sky-600 hover:text-sky-800 font-semibold flex items-center gap-1">
                  <X className="h-3.5 w-3.5" /> Reset ({activeFilterCount})
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="bg-white rounded-2xl border border-slate-200 h-64 animate-pulse"
                  />
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20">
                <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-semibold">
                  {search
                    ? `Tidak ada produk untuk "${search}"`
                    : "Tidak ada produk yang sesuai filter"}
                </p>
                <p className="text-sm text-slate-400 mt-1">
                  Coba ubah filter atau kata kunci pencarian
                </p>
                {hasActiveFilter && (
                  <button
                    onClick={resetAll}
                    className="mt-4 text-sm text-primary hover:underline"
                  >
                    Reset semua filter
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((p) => (
                  <ProductCard key={p.id} product={p} />
                ))}
              </div>
            )}
          </main>
            {/* Loading */}
            {isLoading && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-200 h-52 animate-pulse" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!isLoading && visibleItems.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <Store className="h-12 w-12 text-slate-300 mb-3" />
                <p className="text-[16px] font-semibold text-slate-500">Belum ada item tersedia</p>
                <p className="text-[13px] text-slate-400 mt-1 max-w-xs">
                  {activeFilterCount > 0
                    ? "Coba ubah atau hapus filter untuk melihat lebih banyak item."
                    : "Item akan muncul di sini setelah vendor mempublikasikan katalognya."}
                </p>
                {activeFilterCount > 0 && (
                  <button onClick={handleReset} className="mt-4 text-[13px] text-sky-600 font-semibold hover:underline">
                    Hapus semua filter
                  </button>
                )}
              </div>
            )}

            {/* Grid */}
            {!isLoading && visibleItems.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {visibleItems.map((item) => (
                  <ItemCard key={item.id} item={item} onClick={() => setLocation(`/marketplace/${item.id}`)} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
