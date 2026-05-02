import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Menu, X, LogOut, LayoutDashboard, ShoppingCart, Shield,
  ChevronDown, Ship, Plane, FileCheck, Truck, Package, Globe,
  Search, Warehouse, Calculator, ChevronRight,
} from "lucide-react";
import { isAuthenticated, removeAuthToken, isPortalAdmin } from "@/lib/auth";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { useCart } from "@/lib/cart";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLanguage } from "@/i18n/LanguageContext";

const SERVICES_ITEMS = [
  { icon: Ship, titleKey: "servicesMenu.seaFreight.title", descKey: "servicesMenu.seaFreight.desc", href: "/freight-forwarding" },
  { icon: Plane, titleKey: "servicesMenu.airFreight.title", descKey: "servicesMenu.airFreight.desc", href: "/freight-forwarding" },
  { icon: FileCheck, titleKey: "servicesMenu.customs.title", descKey: "servicesMenu.customs.desc", href: "/pabean" },
  { icon: Truck, titleKey: "servicesMenu.domestic.title", descKey: "servicesMenu.domestic.desc", href: "/jasa" },
  { icon: Warehouse, titleKey: "servicesMenu.warehousing.title", descKey: "servicesMenu.warehousing.desc", href: "/jasa" },
  { icon: Package, titleKey: "servicesMenu.project.title", descKey: "servicesMenu.project.desc", href: "/jasa" },
  { icon: Globe, titleKey: "servicesMenu.consultation.title", descKey: "servicesMenu.consultation.desc", href: "/services" },
  { icon: Search, titleKey: "servicesMenu.tracking.title", descKey: "servicesMenu.tracking.desc", href: "/track" },
];

const NAV_GLASS: React.CSSProperties = {
  background: "rgba(255,255,255,0.92)",
  backdropFilter: "blur(16px)",
  WebkitBackdropFilter: "blur(16px)",
  borderBottom: "1px solid #E2E8F0",
  boxShadow: "0 4px 24px rgba(15,23,42,0.06)",
};

const NAV_GLASS_SCROLLED: React.CSSProperties = {
  background: "rgba(255,255,255,0.96)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  borderBottom: "1px solid #E2E8F0",
  boxShadow: "0 8px 30px rgba(15,23,42,0.08)",
};

function navItemCls(active: boolean) {
  return [
    "flex items-center gap-1 px-2.5 py-[7px] text-[13px] font-medium rounded-[14px]",
    "transition-all duration-200 whitespace-nowrap cursor-pointer select-none",
    active
      ? "bg-sky-50 text-sky-600 font-semibold"
      : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
  ].join(" ");
}

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [servicesOpen, setServicesOpen] = useState(false);
  const [mobileServicesOpen, setMobileServicesOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const isAuth = isAuthenticated();
  const isAdmin = isPortalAdmin();
  const { count, openCart } = useCart();
  const { t } = useLanguage();
  const servicesRef = useRef<HTMLDivElement>(null);

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
      if (servicesRef.current && !servicesRef.current.contains(e.target as Node)) {
        setServicesOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") { setServicesOpen(false); setIsOpen(false); }
    }
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const handleLogout = () => {
    removeAuthToken();
    setLocation("/login");
  };

  function scrollToSection(id: string) {
    setIsOpen(false);
    if (location !== "/") {
      setLocation("/");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 150);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  }

  const isServicesActive =
    location.startsWith("/jasa") ||
    location === "/services" ||
    location === "/freight-forwarding" ||
    location === "/pabean";

  const brandName = company?.name
    ? company.name.length > 22
      ? "CST Logistics"
      : company.name
    : "CST Logistics";

  return (
    <nav
      className="sticky top-0 z-50 w-full transition-all duration-300"
      style={scrolled ? NAV_GLASS_SCROLLED : NAV_GLASS}
    >
      <div className="max-w-[1440px] mx-auto px-4 md:px-6">
        <div className="flex h-[72px] items-center justify-between gap-4">

          {/* ── Logo & Brand ─────────────────────────────────────── */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0 group">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="Logo"
              className="h-[44px] w-auto object-contain"
            />
            <span
              className="font-bold text-[15px] leading-tight tracking-tight whitespace-nowrap"
              style={{
                background: "linear-gradient(135deg, #0F172A 0%, #0369A1 60%, #0EA5E9 100%)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {brandName}
            </span>
          </Link>

          {/* ── Desktop Navigation ───────────────────────────────── */}
          <div className="hidden lg:flex lg:items-center lg:gap-1 flex-1 justify-center">
            {/* Home */}
            <Link href="/" className={navItemCls(location === "/")}>
              {t("nav.home")}
            </Link>

            {/* Products */}
            <Link href="/products" className={navItemCls(location === "/products")}>
              {t("nav.products")}
            </Link>

            {/* Services with Mega Menu */}
            <div className="relative" ref={servicesRef}>
              <button
                className={navItemCls(isServicesActive)}
                onClick={() => setServicesOpen((v) => !v)}
                onMouseEnter={() => setServicesOpen(true)}
                aria-expanded={servicesOpen}
                aria-haspopup="true"
              >
                {t("nav.services")}
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${servicesOpen ? "rotate-180" : ""}`}
                />
              </button>

              {servicesOpen && (
                <div
                  className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
                  style={{ width: "640px" }}
                  onMouseLeave={() => setServicesOpen(false)}
                >
                  <div
                    className="rounded-2xl overflow-hidden"
                    style={{
                      background: "rgba(255,255,255,0.98)",
                      backdropFilter: "blur(20px)",
                      WebkitBackdropFilter: "blur(20px)",
                      border: "1px solid #E2E8F0",
                      boxShadow: "0 20px 50px rgba(15,23,42,0.13)",
                    }}
                  >
                    <div className="px-5 py-3.5 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-slate-100">
                      <p className="text-[11px] font-semibold text-sky-700 uppercase tracking-widest">
                        {t("servicesMenu.tagline")}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-0.5 p-2.5">
                      {SERVICES_ITEMS.map(({ icon: Icon, titleKey, descKey, href }) => (
                        <Link key={titleKey} href={href} onClick={() => setServicesOpen(false)}>
                          <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-sky-50 transition-colors duration-150 group cursor-pointer">
                            <div className="w-8 h-8 rounded-lg bg-sky-100 flex items-center justify-center shrink-0 group-hover:bg-sky-200 transition-colors">
                              <Icon className="h-4 w-4 text-sky-600" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-slate-800 group-hover:text-sky-700 transition-colors">
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

            {/* Calculator */}
            <Link href="/calculator" className={navItemCls(location === "/calculator")}>
              {t("nav.calculator")}
            </Link>

            {/* About */}
            <button
              onClick={() => scrollToSection("tentang")}
              className={navItemCls(false)}
            >
              {t("nav.about")}
            </button>

            {/* Contact */}
            <button
              onClick={() => scrollToSection("kontak")}
              className={navItemCls(false)}
            >
              {t("nav.contact")}
            </button>

            {/* Track */}
            <Link href="/track" className={navItemCls(location === "/track")}>
              {t("nav.trackOrder")}
            </Link>
          </div>

          {/* ── Right Actions ────────────────────────────────────── */}
          <div className="hidden lg:flex items-center gap-2 shrink-0">
            {/* Cart */}
            <button
              onClick={openCart}
              className="relative flex items-center justify-center w-9 h-9 rounded-[14px] text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all duration-200"
              aria-label="Keranjang"
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-sky-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5 leading-none">
                  {count}
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
                    <button className="flex items-center gap-1.5 px-2.5 py-[7px] text-[13px] font-medium rounded-[14px] text-amber-600 hover:bg-amber-50 transition-all duration-200 whitespace-nowrap">
                      <Shield className="h-3.5 w-3.5" />
                      {t("nav.admin")}
                    </button>
                  </Link>
                )}
                <Link href="/dashboard">
                  <button className="flex items-center gap-1.5 px-2.5 py-[7px] text-[13px] font-medium rounded-[14px] text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 whitespace-nowrap">
                    <LayoutDashboard className="h-3.5 w-3.5" />
                    {t("nav.dashboard")}
                  </button>
                </Link>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-2.5 py-[7px] text-[13px] font-medium rounded-[14px] text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-all duration-200 whitespace-nowrap border border-slate-200"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  {t("nav.logout")}
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link href="/login">
                  <button className="px-3 py-[7px] text-[13px] font-medium text-slate-600 hover:text-slate-900 rounded-[14px] hover:bg-slate-50 transition-all duration-200 whitespace-nowrap">
                    {t("nav.login")}
                  </button>
                </Link>
                <Link href="/register">
                  <button
                    className="px-4 py-[9px] text-[13px] font-semibold rounded-[14px] whitespace-nowrap transition-all duration-200"
                    style={{
                      background: "#0F172A",
                      color: "#ffffff",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#1E293B"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "#0F172A"; }}
                  >
                    {t("nav.register")}
                  </button>
                </Link>
              </div>
            )}
          </div>

          {/* ── Mobile Header Right ──────────────────────────────── */}
          <div className="lg:hidden flex items-center gap-1">
            <button
              onClick={openCart}
              className="relative flex items-center justify-center w-9 h-9 rounded-[14px] text-slate-500 hover:text-slate-900 hover:bg-slate-50 transition-all"
              aria-label="Keranjang"
            >
              <ShoppingCart className="h-[18px] w-[18px]" />
              {count > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-sky-500 text-white text-[9px] font-bold min-w-[16px] h-4 flex items-center justify-center rounded-full px-0.5 leading-none">
                  {count}
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

      {/* ── Mobile Drawer ─────────────────────────────────────────── */}
      {isOpen && (
        <div
          className="lg:hidden max-h-[85vh] overflow-y-auto"
          style={{
            background: "rgba(255,255,255,0.98)",
            backdropFilter: "blur(16px)",
            borderTop: "1px solid #F1F5F9",
          }}
        >
          <div className="max-w-[1440px] mx-auto px-4 pb-6 pt-3 space-y-0.5">

            <Link href="/" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-[14px] text-[15px] font-medium cursor-pointer ${
                location === "/" ? "bg-sky-50 text-sky-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
              }`}>
                {t("nav.home")}
              </div>
            </Link>

            <Link href="/products" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-[14px] text-[15px] font-medium cursor-pointer ${
                location === "/products" ? "bg-sky-50 text-sky-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
              }`}>
                {t("nav.products")}
              </div>
            </Link>

            {/* Services Accordion */}
            <div>
              <button
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-[14px] text-[15px] font-medium transition-colors ${
                  isServicesActive ? "bg-sky-50 text-sky-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
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

            <Link href="/calculator" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[14px] text-[15px] font-medium cursor-pointer ${
                location === "/calculator" ? "bg-sky-50 text-sky-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
              }`}>
                <Calculator className="h-4 w-4" />
                {t("nav.calculator")}
              </div>
            </Link>

            <button
              onClick={() => scrollToSection("tentang")}
              className="w-full text-left px-3 py-2.5 rounded-[14px] text-[15px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {t("nav.about")}
            </button>

            <button
              onClick={() => scrollToSection("kontak")}
              className="w-full text-left px-3 py-2.5 rounded-[14px] text-[15px] font-medium text-slate-600 hover:bg-slate-50 transition-colors"
            >
              {t("nav.contact")}
            </button>

            <Link href="/track" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center px-3 py-2.5 rounded-[14px] text-[15px] font-medium cursor-pointer ${
                location === "/track" ? "bg-sky-50 text-sky-600 font-semibold" : "text-slate-600 hover:bg-slate-50"
              }`}>
                {t("nav.trackOrder")}
              </div>
            </Link>

            {/* Divider + Language */}
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
                    <Button variant="outline" className="w-full rounded-[14px] text-[14px]">
                      {t("nav.login")}
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setIsOpen(false)}>
                    <button
                      className="w-full py-2 text-[14px] font-semibold rounded-[14px] text-white transition-all"
                      style={{ background: "#0F172A" }}
                    >
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
