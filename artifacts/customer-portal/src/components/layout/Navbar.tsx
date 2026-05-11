import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Menu, X, LogOut, LayoutDashboard, ShoppingCart, Shield,
  ChevronDown, Ship, FileCheck, Truck,
  Search, Calculator, ChevronRight, MapPin, Phone, Info, ImagePlus, Loader2,
} from "lucide-react";
import { isAuthenticated, removeAuthToken, isPortalAdmin } from "@/lib/auth";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { useCart } from "@/lib/cart";
import { CART_KEY } from "@/lib/logistic-cart";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLanguage } from "@/i18n/LanguageContext";
import { useEditMode } from "@/contexts/EditModeContext";

const SERVICES_ITEMS = [
  { icon: Ship,      titleKey: "servicesMenu.freight.title",   descKey: "servicesMenu.freight.desc",   href: "/freight-forwarding" },
  { icon: FileCheck, titleKey: "servicesMenu.customs.title",   descKey: "servicesMenu.customs.desc",   href: "/pabean" },
  { icon: Truck,     titleKey: "servicesMenu.domestic.title",  descKey: "servicesMenu.domestic.desc",  href: "/jasa" },
  { icon: Truck,     titleKey: "servicesMenu.trucking.title",  descKey: "servicesMenu.trucking.desc",  href: "/jasa/trucking" },
  { icon: Search,    titleKey: "servicesMenu.tracking.title",  descKey: "servicesMenu.tracking.desc",  href: "/track" },
];

const NAV_GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderBottom: "1px solid #E2E8F0",
  boxShadow: "0 8px 30px rgba(15,23,42,0.05)",
};

const NAV_GLASS_SCROLLED: React.CSSProperties = {
  background: "rgba(255,255,255,0.97)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid #E2E8F0",
  boxShadow: "0 8px 30px rgba(15,23,42,0.08)",
};

function navItemCls(active: boolean) {
  return [
    "flex items-center gap-1 px-[14px] py-[10px] text-[15px] font-semibold rounded-[14px]",
    "transition-all duration-200 whitespace-nowrap cursor-pointer select-none",
    active
      ? "bg-[rgba(14,165,233,0.10)] text-[#0284C7]"
      : "text-[#64748B] hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

export function Navbar() {
  const [isOpen, setIsOpen]                     = useState(false);
  const [scrolled, setScrolled]                 = useState(false);
  const [servicesOpen, setServicesOpen]         = useState(false);
  const [moreOpen, setMoreOpen]                 = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen]     = useState(false);
  const [location, setLocation]                 = useLocation();
  const [logoUploading, setLogoUploading]       = useState(false);
  const isAuth  = isAuthenticated();
  const isAdmin = isPortalAdmin();
  const { count, openCart } = useCart();
  const { t } = useLanguage();
  const { editMode, content, uploadImage, updateField } = useEditMode();
  const logoFileRef = useRef<HTMLInputElement>(null);

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

  // Logistic booking cart count (persisted in localStorage)
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
  const totalCount = count + logisticCount;
  const servicesRef = useRef<HTMLDivElement>(null);
  const moreRef     = useRef<HTMLDivElement>(null);

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
      if (moreRef.current     && !moreRef.current.contains(e.target as Node))     setMoreOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setServicesOpen(false); setMoreOpen(false); setIsOpen(false); }
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

  const isServicesActive =
    location.startsWith("/jasa") ||
    location.startsWith("/services") ||
    location === "/freight-forwarding" ||
    location === "/pabean";

  const brandName = company?.name
    ? company.name.length > 22 ? "CST Logistics" : company.name
    : "CST Logistics";

  return (
    <nav
      className="sticky top-0 z-50 w-full transition-all duration-300"
      style={scrolled ? NAV_GLASS_SCROLLED : NAV_GLASS}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-6">
        <div className="flex h-[76px] items-center justify-between gap-4">

          {/* ── Logo & Brand ──────────────────────────────────── */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="relative group">
              {editMode ? (
                <button
                  className="relative flex items-center"
                  onClick={() => logoFileRef.current?.click()}
                  title="Ganti Logo"
                >
                  <img src={logoSrc} alt="Logo" className="h-[44px] w-auto object-contain" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg">
                    {logoUploading
                      ? <Loader2 className="h-5 w-5 text-white animate-spin" />
                      : <ImagePlus className="h-5 w-5 text-white" />
                    }
                  </span>
                </button>
              ) : (
                <Link href="/">
                  <img src={logoSrc} alt="Logo" className="h-[44px] w-auto object-contain" />
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
              <span
                className="font-extrabold text-[19px] leading-tight tracking-tight whitespace-nowrap"
                style={{ color: "#0F172A" }}
              >
                {brandName}
              </span>
            </Link>
          </div>

          {/* ── Desktop Navigation ───────────────────────────── */}
          <div className="hidden lg:flex lg:items-center flex-1 justify-center" style={{ gap: "4px" }}>

            {/* Beranda */}
            <Link href="/" className={navItemCls(location === "/")}>
              {t("nav.home")}
            </Link>

            {/* Produk */}
            <Link href="/products" className={navItemCls(location === "/products")}>
              {t("nav.products")}
            </Link>

            {/* Services Mega Menu */}
            <div className="relative" ref={servicesRef}>
              <button
                className={navItemCls(isServicesActive)}
                onClick={() => setServicesOpen((v) => !v)}
                onMouseEnter={() => setServicesOpen(true)}
                aria-expanded={servicesOpen}
                aria-haspopup="true"
              >
                {t("nav.services")}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${servicesOpen ? "rotate-180" : ""}`} />
              </button>

              {servicesOpen && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
                  style={{ width: "720px" }}
                  onMouseLeave={() => setServicesOpen(false)}
                >
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "rgba(255,255,255,0.99)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 20px 50px rgba(15,23,42,0.13)",
                    }}
                  >
                    <div className="px-5 py-3 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-slate-100">
                      <p className="text-[11px] font-semibold text-sky-700 uppercase tracking-widest">
                        {t("servicesMenu.tagline")}
                      </p>
                    </div>
                    <div className="grid grid-cols-3 gap-0.5 p-3">
                      {SERVICES_ITEMS.map(({ icon: Icon, titleKey, descKey, href }) => (
                        <Link key={titleKey} href={href} onClick={() => setServicesOpen(false)}>
                          <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-sky-50 transition-colors duration-150 group cursor-pointer">
                            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center shrink-0 group-hover:bg-sky-200 transition-colors">
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
                      <Link href="/jasa" onClick={() => setServicesOpen(false)}>
                        <div className="flex items-center justify-between px-4 py-2.5 rounded-[14px] bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 transition-all cursor-pointer">
                          <span className="text-[13px] font-semibold">{t("servicesMenu.viewAll")}</span>
                          <ChevronRight className="h-4 w-4" />
                        </div>
                      </Link>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Kalkulator — soft pill highlight */}
            <Link
              href="/calculator"
              className="flex items-center gap-1.5 px-[14px] py-[10px] text-[15px] font-semibold rounded-[14px] whitespace-nowrap transition-all duration-200"
              style={
                location === "/calculator"
                  ? { background: "rgba(14,165,233,0.18)", color: "#0284C7" }
                  : { background: "rgba(14,165,233,0.08)", color: "#0284C7" }
              }
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(14,165,233,0.15)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = location === "/calculator" ? "rgba(14,165,233,0.18)" : "rgba(14,165,233,0.08)"; }}
            >
              <Calculator className="h-4 w-4" />
              {t("nav.calculator")}
            </Link>

            {/* Lainnya dropdown — About, Contact, Track */}
            <div className="relative" ref={moreRef}>
              <button
                className={navItemCls(
                  location === "/track"
                )}
                onClick={() => setMoreOpen((v) => !v)}
                onMouseEnter={() => setMoreOpen(true)}
                aria-expanded={moreOpen}
                aria-haspopup="true"
              >
                {t("nav.more")}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${moreOpen ? "rotate-180" : ""}`} />
              </button>

              {moreOpen && (
                <div
                  className="absolute top-full right-0 mt-2 z-50 w-52"
                  onMouseLeave={() => setMoreOpen(false)}
                >
                  <div
                    className="rounded-2xl overflow-hidden py-1.5"
                    style={{
                      background: "rgba(255,255,255,0.99)",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 16px 40px rgba(15,23,42,0.12)",
                    }}
                  >
                    <button
                      onClick={() => { setMoreOpen(false); scrollToSection("tentang"); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50 hover:text-sky-700 transition-colors"
                    >
                      <Info className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.about")}
                    </button>
                    <button
                      onClick={() => { setMoreOpen(false); scrollToSection("kontak"); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium text-slate-700 hover:bg-slate-50 hover:text-sky-700 transition-colors"
                    >
                      <Phone className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.contact")}
                    </button>
                    <Link href="/track" onClick={() => setMoreOpen(false)}>
                      <div className={`flex items-center gap-3 px-4 py-2.5 text-[14px] font-medium transition-colors cursor-pointer ${
                        location === "/track" ? "text-sky-700 bg-sky-50" : "text-slate-700 hover:bg-slate-50 hover:text-sky-700"
                      }`}>
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                        {t("nav.trackOrder")}
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right Actions ─────────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {/* Cart */}
            <button
              onClick={openCart}
              className="relative flex items-center justify-center w-9 h-9 rounded-[14px] text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              {totalCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-sky-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5 leading-none">
                  {totalCount}
                </span>
              )}
            </button>

            {/* Language Selector */}
            <LanguageSelector />

            {/* Auth Buttons */}
            {isAuth ? (
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <Link href="/admin">
                    <button className="flex items-center gap-1.5 px-[14px] py-[10px] text-[15px] font-semibold rounded-[14px] text-amber-600 hover:bg-amber-50 transition-all duration-200 whitespace-nowrap">
                      <Shield className="h-3.5 w-3.5" />
                      {t("nav.admin")}
                    </button>
                  </Link>
                )}
                <Link href="/dashboard">
                  <button className="flex items-center gap-1.5 px-[14px] py-[10px] text-[15px] font-semibold rounded-[14px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 whitespace-nowrap">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    {t("nav.dashboard")}
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-[14px] py-[10px] text-[15px] font-semibold rounded-[14px] text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 whitespace-nowrap border border-slate-200"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <Link href="/login">
                  <button className="px-3.5 py-2 text-sm font-medium text-slate-500 hover:text-slate-800 rounded-lg hover:bg-slate-100/70 transition-all duration-200 whitespace-nowrap">
                    {t("nav.login")}
                  </button>
                </Link>
                <Link href="/register">
                  <button className="px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-all duration-200 text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 hover:border-sky-300">
                    {t("nav.register")}
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* ── Mobile Header Right ──────────────────────────── */}
          <div className="lg:hidden flex items-center gap-1">
            <button
              onClick={openCart}
              className="relative flex items-center justify-center w-9 h-9 rounded-[14px] text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all"
              aria-label={t("nav.cart")}
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              {totalCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-sky-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5 leading-none">
                  {totalCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="flex items-center justify-center w-9 h-9 rounded-[14px] text-slate-600 hover:bg-slate-50 transition-all"
              aria-label="Menu"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ── Mobile Drawer ─────────────────────────────────────── */}
      {isOpen && (
        <div
          className="lg:hidden max-h-[85vh] overflow-y-auto"
          style={{
            background: "rgba(255,255,255,0.99)",
            backdropFilter: "blur(16px)",
            borderTop: "1px solid #F1F5F9",
          }}
        >
          <div className="max-w-[1440px] mx-auto px-4 pb-6 pt-3 space-y-0.5">

            <Link href="/" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-[14px] text-[15px] font-semibold cursor-pointer ${
                location === "/" ? "bg-[rgba(14,165,233,0.10)] text-[#0284C7]" : "text-slate-600 hover:bg-slate-50"
              }`}>
                {t("nav.home")}
              </div>
            </Link>

            <Link href="/products" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-[14px] text-[15px] font-semibold cursor-pointer ${
                location === "/products" ? "bg-[rgba(14,165,233,0.10)] text-[#0284C7]" : "text-slate-600 hover:bg-slate-50"
              }`}>
                {t("nav.products")}
              </div>
            </Link>

            {/* Services Accordion */}
            <div>
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[14px] text-[15px] font-semibold transition-colors ${
                  isServicesActive ? "bg-[rgba(14,165,233,0.10)] text-[#0284C7]" : "text-slate-600 hover:bg-slate-50"
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
                  <Link href="/jasa" onClick={() => setIsOpen(false)}>
                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl text-[14px] font-semibold text-sky-600 hover:bg-sky-50 cursor-pointer">
                      <ChevronRight className="h-3.5 w-3.5" />
                      {t("servicesMenu.viewAll")}
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Kalkulator — pill highlight di mobile */}
            <Link href="/calculator" onClick={() => setIsOpen(false)}>
              <div
                className="flex items-center gap-2 px-3 py-2.5 rounded-[14px] text-[15px] font-semibold cursor-pointer"
                style={
                  location === "/calculator"
                    ? { background: "rgba(14,165,233,0.15)", color: "#0284C7" }
                    : { background: "rgba(14,165,233,0.07)", color: "#0284C7" }
                }
              >
                <Calculator className="h-4 w-4" />
                {t("nav.calculator")}
              </div>
            </Link>

            {/* Lainnya Accordion */}
            <div>
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[14px] text-[15px] font-semibold transition-colors ${
                  location === "/track" ? "bg-[rgba(14,165,233,0.10)] text-[#0284C7]" : "text-slate-600 hover:bg-slate-50"
                }`}
                onClick={() => setMobileMoreOpen((v) => !v)}
              >
                {t("nav.more")}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileMoreOpen ? "rotate-180" : ""}`} />
              </button>

              {mobileMoreOpen && (
                <div className="mt-1 ml-3 pl-3 border-l-2 border-slate-100 space-y-0.5">
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
                  <Link href="/track" onClick={() => setIsOpen(false)}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-xl text-[14px] cursor-pointer ${
                      location === "/track" ? "text-sky-700 font-semibold" : "text-slate-600 hover:bg-slate-50"
                    }`}>
                      <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                      {t("nav.trackOrder")}
                    </div>
                  </Link>
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
                      <Button variant="outline" className="w-full justify-start gap-2 text-amber-600 border-amber-200 rounded-[14px]">
                        <Shield className="h-4 w-4" />
                        {t("nav.admin")}
                      </Button>
                    </Link>
                  )}
                  <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2 rounded-[14px]">
                      <LayoutDashboard className="h-4 w-4" />
                      {t("nav.dashboard")}
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2 rounded-[14px]"
                    onClick={() => { handleLogout(); setIsOpen(false); }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <button className="w-full py-2 text-sm font-medium text-slate-500 hover:text-slate-800 rounded-lg border border-slate-200 hover:bg-slate-50 transition-all duration-200">
                      {t("nav.login")}
                    </button>
                  </Link>
                  <Link href="/register" onClick={() => setIsOpen(false)}>
                    <button className="w-full py-2 text-sm font-medium rounded-lg text-sky-700 bg-sky-50 hover:bg-sky-100 border border-sky-200/80 transition-all duration-200">
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
