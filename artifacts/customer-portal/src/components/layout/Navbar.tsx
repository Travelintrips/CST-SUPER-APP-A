import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Menu, X, LogOut, LayoutDashboard, ShoppingCart, Shield,
  ChevronDown, Ship, FileCheck, Truck,
  Search, Calculator, ChevronRight, MapPin, Phone, Info,
  ImagePlus, Loader2, ClipboardList,
  Package, Wind, Globe, FileText, Factory, Coffee, Flame,
  Droplets, Fish, Feather,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { isAuthenticated, removeAuthToken, isPortalAdmin } from "@/lib/auth";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { CART_KEY } from "@/lib/logistic-cart";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLanguage } from "@/i18n/LanguageContext";
import { useEditMode } from "@/contexts/EditModeContext";

const SERVICES_ITEMS = [
  { icon: Ship,      titleKey: "servicesMenu.freight.title",   descKey: "servicesMenu.freight.desc",   href: "/marketplace?type=service&category=sea_freight" },
  { icon: FileCheck, titleKey: "servicesMenu.customs.title",   descKey: "servicesMenu.customs.desc",   href: "/marketplace?type=service&category=ppjk" },
  { icon: Truck,     titleKey: "servicesMenu.trucking.title",  descKey: "servicesMenu.trucking.desc",  href: "/trucking" },
  { icon: Search,    titleKey: "servicesMenu.tracking.title",  descKey: "servicesMenu.tracking.desc",  href: "/track" },
];

type AutocompleteEntry = {
  icon: LucideIcon;
  label: string;
  description: string;
  kind: "Layanan" | "Produk";
  href: string;
  terms: string[];
};

type MarketplaceResult = {
  id: number;
  name: string;
  description: string | null;
  templateKind: string;
  serviceType: string | null;
  categoryKey: string | null;
};

const AUTOCOMPLETE_MAP: AutocompleteEntry[] = [
  // ── Jasa / Services ───────────────────────────────────────────────────────
  {
    icon: Truck, label: "Trucking Domestik",
    description: "Angkutan darat dalam kota & antar kota",
    kind: "Layanan", terms: ["truck", "truk", "angkut", "darat", "trucking"],
    href: "/trucking",
  },
  {
    icon: Ship, label: "Sea Freight",
    description: "Pengiriman laut internasional FCL / LCL",
    kind: "Layanan", terms: ["sea", "freight", "fcl", "lcl", "kapal", "laut", "forwarding", "ekspedisi"],
    href: "/marketplace?type=service&category=sea_freight&q=sea+freight",
  },
  {
    icon: Wind, label: "Air Freight",
    description: "Pengiriman udara cepat domestik & internasional",
    kind: "Layanan", terms: ["air", "udara", "pesawat", "fly"],
    href: "/marketplace?type=service&category=air_freight&q=air+freight",
  },
  {
    icon: FileCheck, label: "PPJK / Customs Clearance",
    description: "Pengurusan kepabeanan, bea cukai & dokumen",
    kind: "Layanan", terms: ["ppjk", "custom", "kepabeanan", "bea", "cukai", "pabean", "customs"],
    href: "/marketplace?type=service&category=ppjk&q=ppjk",
  },
  {
    icon: Factory, label: "Cargo Handling",
    description: "Bongkar muat & penanganan kargo di gudang",
    kind: "Layanan", terms: ["handling", "bongkar", "muat", "gudang", "cargo"],
    href: "/marketplace?type=service&category=handling&q=handling",
  },
  {
    icon: FileText, label: "Pengurusan Dokumen",
    description: "Perizinan, surat jalan & dokumen ekspor-impor",
    kind: "Layanan", terms: ["dokumen", "document", "surat", "perizinan", "lisensi"],
    href: "/marketplace?type=service&category=document&q=dokumen",
  },
  {
    icon: Globe, label: "Exim Service",
    description: "Layanan ekspor & impor terintegrasi",
    kind: "Layanan", terms: ["exim", "ekspor", "impor", "export", "import"],
    href: "/marketplace?type=service&category=exim_service&q=exim",
  },
  // ── Produk ────────────────────────────────────────────────────────────────
  {
    icon: Coffee, label: "Kopi / Coffee",
    description: "Arabica, Robusta, biji & olahan",
    kind: "Produk", terms: ["kopi", "coffee", "arabica", "robusta"],
    href: "/marketplace?type=product&category=coffee&q=kopi",
  },
  {
    icon: Flame, label: "Batubara",
    description: "Batubara thermal & coking berbagai kalori",
    kind: "Produk", terms: ["batubara", "coal", "batu bara"],
    href: "/marketplace?type=product&category=coal&q=batubara",
  },
  {
    icon: Package, label: "Minyak Sawit / CPO",
    description: "Crude Palm Oil & turunannya",
    kind: "Produk", terms: ["sawit", "palm", "cpo", "minyak sawit"],
    href: "/marketplace?type=product&category=palm_oil&q=sawit",
  },
  {
    icon: Package, label: "Nikel",
    description: "Ore nikel & produk olahan",
    kind: "Produk", terms: ["nikel", "nickel", "ore"],
    href: "/marketplace?type=product&category=nickel&q=nikel",
  },
  {
    icon: Package, label: "Beras",
    description: "Beras premium & medium berbagai varietas",
    kind: "Produk", terms: ["beras", "rice", "gabah"],
    href: "/marketplace?type=product&category=rice&q=beras",
  },
  {
    icon: Package, label: "Seafood",
    description: "Ikan, udang, cumi & produk laut segar/beku",
    kind: "Produk", terms: ["seafood", "ikan", "udang", "cumi", "fish"],
    href: "/marketplace?type=product&category=seafood&q=seafood",
  },
  {
    icon: Package, label: "Besi & Baja",
    description: "Besi beton, plat baja & profil baja",
    kind: "Produk", terms: ["besi", "baja", "iron", "steel", "beton"],
    href: "/marketplace?type=product&category=iron_steel&q=besi",
  },
  {
    icon: Droplets, label: "Karet Alam",
    description: "SIR, RSS, lateks pekat & crumb rubber",
    kind: "Produk", terms: ["karet", "rubber", "lateks", "latex", "sir20", "rss"],
    href: "/marketplace?type=product&category=rubber&q=karet",
  },
  {
    icon: Fish, label: "Ikan Hidup",
    description: "Ikan hias, kerapu, arwana & biota laut hidup",
    kind: "Produk", terms: ["ikan hidup", "live fish", "arwana", "kerapu", "ikan hias", "biota laut"],
    href: "/marketplace?type=product&category=live_fish&q=ikan+hidup",
  },
  {
    icon: Feather, label: "Sarang Walet",
    description: "Sarang burung walet putih, merah & emas",
    kind: "Produk", terms: ["sarang walet", "bird nest", "walet", "sarang burung", "edible bird nest"],
    href: "/marketplace?type=product&category=bird_nest&q=sarang+walet",
  },
];

// Default popular suggestions shown before user types
const DEFAULT_SUGGESTIONS: AutocompleteEntry[] = [
  AUTOCOMPLETE_MAP.find(e => e.label === "Trucking Domestik")!,
  AUTOCOMPLETE_MAP.find(e => e.label === "Sea Freight")!,
  AUTOCOMPLETE_MAP.find(e => e.label === "PPJK / Customs Clearance")!,
  AUTOCOMPLETE_MAP.find(e => e.label === "Kopi / Coffee")!,
  AUTOCOMPLETE_MAP.find(e => e.label === "Batubara")!,
  AUTOCOMPLETE_MAP.find(e => e.label === "Minyak Sawit / CPO")!,
];

const NAV_BASE: React.CSSProperties = {
  background: "rgba(255,255,255,0.95)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid rgba(226,232,240,0.8)",
  boxShadow: "0 1px 24px rgba(15,23,42,0.04)",
};

const NAV_SCROLLED: React.CSSProperties = {
  background: "rgba(255,255,255,0.98)",
  backdropFilter: "blur(24px)",
  WebkitBackdropFilter: "blur(24px)",
  borderBottom: "1px solid rgba(226,232,240,0.9)",
  boxShadow: "0 4px 32px rgba(15,23,42,0.07)",
};

function navItemCls(active: boolean) {
  return [
    "flex items-center gap-1 px-3.5 py-2 text-[14px] font-medium rounded-xl",
    "transition-all duration-200 whitespace-nowrap cursor-pointer select-none tracking-[-0.01em]",
    active
      ? "bg-sky-50 text-sky-700"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

export function Navbar() {
  const [isOpen, setIsOpen]                         = useState(false);
  const [scrolled, setScrolled]                     = useState(false);
  const [servicesOpen, setServicesOpen]             = useState(false);
  const [moreOpen, setMoreOpen]                     = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen]         = useState(false);
  const [searchOpen, setSearchOpen]                 = useState(false);
  const [searchQuery, setSearchQuery]               = useState("");
  const [searchFocused, setSearchFocused]           = useState(false);
  const [logoUploading, setLogoUploading]           = useState(false);

  const [location, setLocation] = useLocation();
  const isAuth  = isAuthenticated();
  const isAdmin = isPortalAdmin();
  const { t } = useLanguage();
  const { editMode, content, uploadImage, updateField } = useEditMode();
  const logoFileRef  = useRef<HTMLInputElement>(null);
  const servicesRef  = useRef<HTMLDivElement>(null);
  const moreRef      = useRef<HTMLDivElement>(null);
  const searchRef    = useRef<HTMLDivElement>(null);
  const searchInput  = useRef<HTMLInputElement>(null);

  const logoSrc = content["navbar_logo"]
    ? content["navbar_logo"]
    : `${import.meta.env.BASE_URL}images/logo.png`;

  async function handleLogoUpload(file: File) {
    setLogoUploading(true);
    try {
      const path = await uploadImage(file);
      updateField("navbar_logo", path);
      updateField("footer_logo", path);
    } catch {
      alert("Gagal upload logo");
    } finally {
      setLogoUploading(false);
    }
  }

  const [logisticCount, setLogisticCount] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (!raw) return 0;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch { return 0; }
  });

  useEffect(() => {
    function sync() {
      try {
        const raw = localStorage.getItem(CART_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        setLogisticCount(Array.isArray(parsed) ? parsed.length : 0);
      } catch { setLogisticCount(0); }
    }
    window.addEventListener("logistic-cart-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("logistic-cart-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const totalCount = logisticCount;

  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] },
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) setServicesOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
        setSearchFocused(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setServicesOpen(false);
        setMoreOpen(false);
        setIsOpen(false);
        setSearchOpen(false);
        setSearchFocused(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInput.current?.focus(), 50);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleLogout = () => { removeAuthToken(); setLocation("/login"); };

  function scrollToSection(id: string) {
    setIsOpen(false);
    if (location !== "/") {
      setLocation("/");
      setTimeout(() => { document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }); }, 150);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setLocation(`/marketplace?q=${encodeURIComponent(searchQuery.trim())}`);
    setSearchOpen(false);
    setSearchQuery("");
  }

  function handleSuggestionClick(href: string) {
    setSearchOpen(false);
    setSearchQuery("");
    setLocation(href);
  }

  // Pre-fetch live marketplace items for real search autocomplete
  const { data: liveItems = [] } = useQuery<MarketplaceResult[]>({
    queryKey: ["navbar-marketplace-all"],
    queryFn: async () => {
      const [svc, prod] = await Promise.all([
        fetch("/api/portal/marketplace?kind=service").then((r) => r.ok ? r.json() : []),
        fetch("/api/portal/marketplace?kind=product").then((r) => r.ok ? r.json() : []),
      ]);
      return [...(svc as MarketplaceResult[]), ...(prod as MarketplaceResult[])];
    },
    staleTime: 5 * 60 * 1000,
  });

  // Smart autocomplete: ≥2 chars → search live items + static, else show defaults
  const autocompleteSuggestions: AutocompleteEntry[] = (() => {
    const q = searchQuery.trim().toLowerCase();
    if (q.length < 2) return DEFAULT_SUGGESTIONS;

    // Search live items first
    const liveResults: AutocompleteEntry[] = liveItems
      .filter((item) =>
        item.name.toLowerCase().includes(q) ||
        (item.description ?? "").toLowerCase().includes(q),
      )
      .slice(0, 5)
      .map((item) => {
        const isSvc = item.templateKind === "service";
        const cat = isSvc ? item.serviceType : item.categoryKey;
        return {
          icon: isSvc ? Truck : Package,
          label: item.name,
          description: item.description ?? (isSvc ? "Layanan" : "Produk"),
          kind: isSvc ? ("Layanan" as const) : ("Produk" as const),
          href: `/marketplace?type=${isSvc ? "service" : "product"}${cat ? `&category=${cat}` : ""}&q=${encodeURIComponent(item.name)}`,
          terms: [],
        };
      });

    // Supplement with static suggestions (deduplicate by label)
    const liveLabels = new Set(liveResults.map((r) => r.label.toLowerCase()));
    const staticResults = AUTOCOMPLETE_MAP.filter(
      (e) =>
        !liveLabels.has(e.label.toLowerCase()) &&
        (e.label.toLowerCase().includes(q) ||
          e.description.toLowerCase().includes(q) ||
          e.terms.some((t) => t.includes(q) || q.includes(t))),
    ).slice(0, 3);

    return [...liveResults, ...staticResults].slice(0, 8);
  })();

  const isServicesActive =
    location.startsWith("/jasa") ||
    location.startsWith("/services") ||
    location === "/freight-forwarding" ||
    location === "/pabean" ||
    location === "/trucking" ||
    (location.startsWith("/marketplace") && location.includes("type=service"));

  const brandName = company?.name
    ? company.name.length > 22 ? "CST Logistics" : company.name
    : "CST Logistics";

  return (
    <nav
      className="sticky top-0 z-50 w-full transition-all duration-300"
      style={scrolled ? NAV_SCROLLED : NAV_BASE}
    >
      <div className="max-w-[1440px] mx-auto px-5 md:px-8">
        <div className="flex h-[68px] items-center gap-6">

          {/* ── Logo & Brand ──────────────────────────────── */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative group">
              {editMode ? (
                <button
                  className="relative flex items-center"
                  onClick={() => logoFileRef.current?.click()}
                  title="Ganti Logo"
                >
                  <img src={logoSrc} alt="Logo" className="h-9 w-auto object-contain" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    {logoUploading
                      ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                      : <ImagePlus className="h-4 w-4 text-white" />
                    }
                  </span>
                </button>
              ) : (
                <Link href="/">
                  <img src={logoSrc} alt="Logo" className="h-9 w-auto object-contain" />
                </Link>
              )}
              <input
                ref={logoFileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleLogoUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
            <Link href="/">
              <span className="font-bold text-[17px] tracking-[-0.02em] text-slate-900 whitespace-nowrap select-none">
                {brandName}
              </span>
            </Link>
          </div>

          {/* ── Desktop Nav — center ─────────────────────── */}
          <div className="hidden lg:flex items-center gap-0.5 flex-1">

            <Link href="/" className={navItemCls(location === "/")}>
              {t("nav.home")}
            </Link>

            <Link href="/marketplace" className={navItemCls(location.startsWith("/marketplace"))}>
              Marketplace
            </Link>

            {/* Services dropdown */}
            <div className="relative" ref={servicesRef}>
              <button
                className={navItemCls(isServicesActive)}
                onClick={() => setServicesOpen((v) => !v)}
                onMouseEnter={() => setServicesOpen(true)}
                aria-expanded={servicesOpen}
              >
                {t("nav.services")}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${servicesOpen ? "rotate-180" : ""}`} />
              </button>

              {servicesOpen && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
                  style={{ width: "680px" }}
                  onMouseLeave={() => setServicesOpen(false)}
                >
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "rgba(255,255,255,0.99)",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 20px 60px rgba(15,23,42,0.12)",
                    }}
                  >
                    <div className="px-5 py-3 border-b border-slate-100">
                      <p className="text-[11px] font-semibold text-sky-600 uppercase tracking-widest">
                        {t("servicesMenu.tagline")}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 p-3">
                      {SERVICES_ITEMS.map(({ icon: Icon, titleKey, descKey, href }) => (
                        <Link key={titleKey} href={href} onClick={() => setServicesOpen(false)}>
                          <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-sky-50 transition-colors duration-150 group cursor-pointer">
                            <div className="w-8 h-8 rounded-lg bg-sky-50 flex items-center justify-center shrink-0 group-hover:bg-sky-100 transition-colors">
                              <Icon className="h-4 w-4 text-sky-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-slate-800 group-hover:text-sky-700 transition-colors leading-tight">
                                {t(titleKey)}
                              </p>
                              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5 line-clamp-2">
                                {t(descKey)}
                              </p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                    <div className="px-3 pb-3">
                      <Link href="/services" onClick={() => setServicesOpen(false)}>
                        <div className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-sky-600 text-white hover:bg-sky-700 transition-all cursor-pointer">
                          <span className="text-[13px] font-semibold">{t("servicesMenu.viewAll")}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* More dropdown */}
            <div className="relative" ref={moreRef}>
              <button
                className={navItemCls(location === "/track" || location === "/calculator")}
                onClick={() => setMoreOpen((v) => !v)}
                onMouseEnter={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
              >
                {t("nav.more")}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`} />
              </button>

              {moreOpen && (
                <div
                  className="absolute top-full left-0 mt-2 z-50 w-52"
                  onMouseLeave={() => setMoreOpen(false)}
                >
                  <div
                    className="rounded-2xl overflow-hidden py-1.5"
                    style={{
                      background: "rgba(255,255,255,0.99)",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 16px 40px rgba(15,23,42,0.10)",
                    }}
                  >
                    <Link href="/calculator" onClick={() => setMoreOpen(false)}>
                      <div className={`flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium cursor-pointer transition-colors ${
                        location === "/calculator" ? "text-sky-700 bg-sky-50" : "text-slate-700 hover:bg-slate-50 hover:text-sky-700"
                      }`}>
                        <Calculator className="h-4 w-4 text-slate-400 shrink-0" />
                        {t("nav.calculator")}
                      </div>
                    </Link>
                    <Link href="/track" onClick={() => setMoreOpen(false)}>
                      <div className={`flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium cursor-pointer transition-colors ${
                        location === "/track" ? "text-sky-700 bg-sky-50" : "text-slate-700 hover:bg-slate-50 hover:text-sky-700"
                      }`}>
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                        {t("nav.trackOrder")}
                      </div>
                    </Link>
                    <button
                      onClick={() => { setMoreOpen(false); scrollToSection("tentang"); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-sky-700 transition-colors"
                    >
                      <Info className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.about")}
                    </button>
                    <button
                      onClick={() => { setMoreOpen(false); scrollToSection("kontak"); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[13.5px] font-medium text-slate-700 hover:bg-slate-50 hover:text-sky-700 transition-colors"
                    >
                      <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.contact")}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Actions ──────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-1.5 shrink-0 ml-auto">

            {/* Search — always visible */}
            <div className="relative" ref={searchRef}>
              <form onSubmit={handleSearchSubmit} className="flex items-center">
                <div
                  className="flex items-center gap-2 px-3 py-2 rounded-xl border transition-all duration-200"
                  style={{
                    width: "240px",
                    background: "rgba(248,250,252,0.9)",
                    borderColor: searchFocused ? "#0ea5e9" : "#E2E8F0",
                    boxShadow: searchFocused ? "0 0 0 3px rgba(14,165,233,0.12)" : "none",
                  }}
                >
                  <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <input
                    ref={searchInput}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
                    placeholder="Cari layanan, produk…"
                    className="flex-1 bg-transparent text-[13px] text-slate-800 placeholder-slate-400 outline-none"
                    autoComplete="off"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>

                {/* Smart autocomplete dropdown */}
                {searchFocused && (
                  <div
                    className="absolute top-full left-0 mt-2 rounded-2xl overflow-hidden z-50"
                    style={{
                      width: "340px",
                      background: "rgba(255,255,255,0.99)",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 16px 48px rgba(15,23,42,0.13)",
                    }}
                  >
                    <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest">
                        {searchQuery.trim().length >= 2 ? "Saran pencarian" : "Populer"}
                      </span>
                      <span className="text-[10px] text-slate-300">Enter untuk cari semua</span>
                    </div>

                    {autocompleteSuggestions.length > 0 ? (
                      <div className="py-1">
                        {autocompleteSuggestions.map((s) => {
                          const Icon = s.icon;
                          const isService = s.kind === "Layanan";
                          return (
                            <button
                              key={s.href}
                              type="button"
                              onMouseDown={() => handleSuggestionClick(s.href)}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-sky-50 transition-colors text-left group"
                            >
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                isService ? "bg-sky-50 group-hover:bg-sky-100" : "bg-emerald-50 group-hover:bg-emerald-100"
                              }`}>
                                <Icon className={`h-3.5 w-3.5 ${isService ? "text-sky-600" : "text-emerald-600"}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-semibold text-slate-800 group-hover:text-sky-700 transition-colors truncate">
                                    {s.label}
                                  </span>
                                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                                    isService ? "bg-sky-100 text-sky-600" : "bg-emerald-100 text-emerald-600"
                                  }`}>
                                    {s.kind}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-tight truncate mt-0.5">
                                  {s.description}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="px-4 py-6 text-center">
                        <Search className="h-5 w-5 text-slate-300 mx-auto mb-1.5" />
                        <p className="text-[13px] text-slate-400 font-medium">Tidak ada saran</p>
                        <p className="text-[11px] text-slate-300 mt-0.5">Tekan Enter untuk cari "{searchQuery}"</p>
                      </div>
                    )}
                  </div>
                )}
              </form>
            </div>

            {/* Cart */}
            <button
              onClick={() => window.dispatchEvent(new Event("open-cart-drawer"))}
              className="relative flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all duration-200"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart className="h-[17px] w-[17px]" />
              {totalCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-sky-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5 leading-none">
                  {totalCount}
                </span>
              )}
            </button>

            {/* Language */}
            <LanguageSelector />

            {/* Divider */}
            <div className="w-px h-5 bg-slate-200 mx-0.5" />

            {/* Auth */}
            {isAuth ? (
              <div className="flex items-center gap-1">
                {isAdmin && (
                  <Link href="/admin">
                    <button className="flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium rounded-xl text-amber-600 hover:bg-amber-50 transition-all duration-200 whitespace-nowrap">
                      <Shield className="h-3.5 w-3.5" />
                      {t("nav.admin")}
                    </button>
                  </Link>
                )}
                <Link href="/dashboard">
                  <button className="flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium rounded-xl text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-all duration-200 whitespace-nowrap">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    {t("nav.dashboard")}
                  </button>
                </Link>
                <Link href="/orders">
                  <button className={`flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium rounded-xl transition-all duration-200 whitespace-nowrap ${
                    location === "/orders" ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  }`}>
                    <ClipboardList className="h-3.5 w-3.5" />
                    Pesanan Saya
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-2 text-[13.5px] font-medium rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-all duration-200 whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <button className="px-4 py-2 text-[13.5px] font-medium text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-100 transition-all duration-200">
                    {t("nav.login")}
                  </button>
                </Link>
                <Link href="/register">
                  <button className="px-4 py-2 text-[13.5px] font-semibold rounded-xl text-white transition-all duration-200 whitespace-nowrap"
                    style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)", boxShadow: "0 2px 12px rgba(14,165,233,0.35)" }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(14,165,233,0.45)"}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 12px rgba(14,165,233,0.35)"}
                  >
                    {t("nav.register")}
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* ── Mobile Header Right ─────────────────────── */}
          <div className="lg:hidden flex items-center gap-1 ml-auto">
            <button
              onClick={() => {
                setSearchOpen((v) => !v);
                setTimeout(() => searchInput.current?.focus(), 50);
              }}
              className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 transition-all"
            >
              <Search className="h-[17px] w-[17px]" />
            </button>
            <button
              onClick={() => window.dispatchEvent(new Event("open-cart-drawer"))}
              className="relative flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:bg-slate-100 transition-all"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart className="h-[17px] w-[17px]" />
              {totalCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-sky-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5 leading-none">
                  {totalCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-600 hover:bg-slate-100 transition-all"
              aria-label="Menu"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* ── Mobile Search Bar ───────────────────────────── */}
        {searchOpen && (
          <div className="lg:hidden pb-3" ref={searchRef}>
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2">
              <div
                className="flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border"
                style={{
                  background: "#f8fafc",
                  borderColor: "#E2E8F0",
                }}
              >
                <Search className="h-4 w-4 text-slate-400 shrink-0" />
                <input
                  ref={searchInput}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari layanan, produk…"
                  className="flex-1 bg-transparent text-[14px] text-slate-800 placeholder-slate-400 outline-none"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "#0ea5e9" }}
              >
                Cari
              </button>
            </form>
            {autocompleteSuggestions.length > 0 && (
              <div className="mt-2 rounded-xl border border-slate-100 overflow-hidden bg-white">
                {autocompleteSuggestions.map((s) => (
                  <button
                    key={s.href}
                    type="button"
                    onClick={() => handleSuggestionClick(s.href)}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors text-left border-b border-slate-50 last:border-0"
                  >
                    <Search className="h-3 w-3 text-slate-400 shrink-0" />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Mobile Drawer ──────────────────────────────────── */}
      {isOpen && (
        <div
          className="lg:hidden max-h-[85vh] overflow-y-auto"
          style={{
            background: "rgba(255,255,255,0.99)",
            borderTop: "1px solid #F1F5F9",
          }}
        >
          <div className="max-w-[1440px] mx-auto px-5 pb-6 pt-3 space-y-0.5">

            <Link href="/" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-xl text-[15px] font-medium cursor-pointer ${
                location === "/" ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"
              }`}>
                {t("nav.home")}
              </div>
            </Link>

            <Link href="/marketplace" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-xl text-[15px] font-medium cursor-pointer ${
                location.startsWith("/marketplace") ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"
              }`}>
                Marketplace
              </div>
            </Link>

            {/* Services Accordion */}
            <div>
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${
                  isServicesActive ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setMobileServicesOpen((v) => !v)}
              >
                {t("nav.services")}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileServicesOpen ? "rotate-180" : ""}`} />
              </button>

              {mobileServicesOpen && (
                <div className="mt-1 ml-3 pl-3 border-l-2 border-sky-100 space-y-0.5">
                  {SERVICES_ITEMS.map(({ icon: Icon, titleKey, href }) => (
                    <Link key={titleKey} href={href} onClick={() => setIsOpen(false)}>
                      <div className="flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] text-slate-600 hover:bg-slate-50 cursor-pointer">
                        <Icon className="h-4 w-4 text-sky-500 shrink-0" />
                        {t(titleKey)}
                      </div>
                    </Link>
                  ))}
                  <Link href="/services" onClick={() => setIsOpen(false)}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[14px] font-semibold text-sky-600 hover:bg-sky-50 cursor-pointer">
                      <ChevronRight className="h-3.5 w-3.5" />
                      {t("servicesMenu.viewAll")}
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* More Accordion */}
            <div>
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-[15px] font-medium transition-colors ${
                  location === "/track" || location === "/calculator" ? "bg-sky-50 text-sky-700" : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setMobileMoreOpen((v) => !v)}
              >
                {t("nav.more")}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileMoreOpen ? "rotate-180" : ""}`} />
              </button>

              {mobileMoreOpen && (
                <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100 space-y-0.5">
                  <Link href="/calculator" onClick={() => setIsOpen(false)}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] cursor-pointer ${
                      location === "/calculator" ? "text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                    }`}>
                      <Calculator className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.calculator")}
                    </div>
                  </Link>
                  <Link href="/track" onClick={() => setIsOpen(false)}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] cursor-pointer ${
                      location === "/track" ? "text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                    }`}>
                      <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.trackOrder")}
                    </div>
                  </Link>
                  <button
                    onClick={() => scrollToSection("tentang")}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <Info className="h-4 w-4 text-slate-400 shrink-0" />
                    {t("nav.about")}
                  </button>
                  <button
                    onClick={() => scrollToSection("kontak")}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] text-slate-600 hover:bg-slate-50 cursor-pointer"
                  >
                    <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                    {t("nav.contact")}
                  </button>
                </div>
              )}
            </div>

            {/* Language */}
            <div className="pt-2 border-t border-slate-100">
              <LanguageSelector />
            </div>

            {/* Auth */}
            <div className="pt-2 border-t border-slate-100">
              {isAuth ? (
                <div className="space-y-1.5">
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full justify-start gap-2 text-amber-600 border-amber-200 rounded-xl">
                        <Shield className="h-4 w-4" />
                        {t("nav.admin")}
                      </Button>
                    </Link>
                  )}
                  <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                      <LayoutDashboard className="h-4 w-4" />
                      {t("nav.dashboard")}
                    </Button>
                  </Link>
                  <Link href="/orders" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2 rounded-xl">
                      <ClipboardList className="h-4 w-4" />
                      Pesanan Saya
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 rounded-xl"
                    onClick={() => { handleLogout(); setIsOpen(false); }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <button className="w-full py-2.5 text-sm font-medium text-slate-600 rounded-xl border border-slate-200 hover:bg-slate-50 transition-all">
                      {t("nav.login")}
                    </button>
                  </Link>
                  <Link href="/register" onClick={() => setIsOpen(false)}>
                    <button className="w-full py-2.5 text-sm font-semibold rounded-xl text-white transition-all"
                      style={{ background: "linear-gradient(135deg,#0ea5e9,#0284c7)" }}>
                      {t("nav.register")}
                    </button>
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
