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
  const info = (status && MAP[status]) ?? { label: status ?? "—", cls: "bg-slate-100 text-slate-600 border-slate-200" };
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
