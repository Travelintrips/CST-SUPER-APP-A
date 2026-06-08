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
        </div>
      </div>
    </div>
  );
}
