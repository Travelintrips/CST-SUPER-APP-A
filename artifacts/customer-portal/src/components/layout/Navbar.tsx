import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Menu, X, LogOut, LayoutDashboard, ShoppingCart, Shield,
  ChevronDown, Ship, FileCheck, Truck,
  Search, Calculator, ChevronRight, MapPin, Phone, Info,
  ImagePlus, Loader2, ClipboardList,
} from "lucide-react";
import { isAuthenticated, removeAuthToken, isPortalAdmin } from "@/lib/auth";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { CART_KEY } from "@/lib/logistic-cart";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLanguage } from "@/i18n/LanguageContext";
import { useEditMode } from "@/contexts/EditModeContext";

const SERVICES_ITEMS = [
  { icon: Ship,      titleKey: "servicesMenu.freight.title",   descKey: "servicesMenu.freight.desc",   href: "/marketplace?type=service&category=sea_freight" },
  { icon: FileCheck, titleKey: "servicesMenu.customs.title",   descKey: "servicesMenu.customs.desc",   href: "/marketplace?type=service&category=ppjk" },
  { icon: Truck,     titleKey: "servicesMenu.domestic.title",  descKey: "servicesMenu.domestic.desc",  href: "/marketplace?type=service&category=trucking" },
  { icon: Truck,     titleKey: "servicesMenu.trucking.title",  descKey: "servicesMenu.trucking.desc",  href: "/marketplace?type=service&category=trucking" },
  { icon: Search,    titleKey: "servicesMenu.tracking.title",  descKey: "servicesMenu.tracking.desc",  href: "/track" },
];

const SEARCH_SUGGESTIONS = [
  { label: "Freight Shipment", href: "/marketplace?type=service&category=sea_freight" },
  { label: "Customs / PPJK", href: "/marketplace?type=service&category=ppjk" },
  { label: "Trucking Domestik", href: "/marketplace?type=service&category=trucking" },
  { label: "Air Freight", href: "/marketplace?type=service&category=air_freight" },
  { label: "Lacak Pesanan", href: "/track" },
  { label: "Kalkulator Biaya", href: "/calculator" },
  { label: "Marketplace Produk", href: "/marketplace?type=product" },
  { label: "Semua Layanan Jasa", href: "/marketplace?type=service" },
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

  const filteredSuggestions = searchQuery.trim()
    ? SEARCH_SUGGESTIONS.filter(s =>
        s.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : SEARCH_SUGGESTIONS;

  const isServicesActive =
    location.startsWith("/jasa") ||
    location.startsWith("/services") ||
    location === "/freight-forwarding" ||
    location === "/pabean" ||
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

            {/* Search */}
            <div className="relative" ref={searchRef}>
              {searchOpen ? (
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
                    <button
                      type="button"
                      onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Suggestions dropdown */}
                  {searchFocused && filteredSuggestions.length > 0 && (
                    <div
                      className="absolute top-full left-0 mt-2 w-full rounded-xl py-1.5 z-50"
                      style={{
                        background: "rgba(255,255,255,0.99)",
                        border: "1px solid #E2E8F0",
                        boxShadow: "0 12px 32px rgba(15,23,42,0.10)",
                      }}
                    >
                      {filteredSuggestions.map((s) => (
                        <button
                          key={s.href}
                          type="button"
                          onMouseDown={() => handleSuggestionClick(s.href)}
                          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] text-slate-700 hover:bg-sky-50 hover:text-sky-700 transition-colors text-left"
                        >
                          <Search className="h-3 w-3 text-slate-400 shrink-0" />
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </form>
              ) : (
                <button
                  onClick={() => {
                    setSearchOpen(true);
                    setTimeout(() => searchInput.current?.focus(), 50);
                  }}
                  className="flex items-center justify-center w-9 h-9 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-all duration-200"
                  title="Cari (⌘K)"
                >
                  <Search className="h-[17px] w-[17px]" />
                </button>
              )}
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
            {filteredSuggestions.length > 0 && (
              <div className="mt-2 rounded-xl border border-slate-100 overflow-hidden bg-white">
                {filteredSuggestions.map((s) => (
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
