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
      if (e.key === "Escape") setServicesOpen(false);
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

  const linkClass = (active: boolean) =>
    `px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:text-primary hover:bg-primary/10 ${
      active ? "text-primary bg-primary/10 font-semibold" : "text-muted-foreground"
    }`;

  return (
    <nav
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? "bg-background/95 backdrop-blur-md shadow-sm border-b border-border"
          : "bg-background/80 backdrop-blur-md border-b border-border"
      }`}
    >
      <div className="container mx-auto px-4 md:px-6">
        <div className="flex h-20 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 group">
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="Logo"
              className="h-10 w-auto object-contain"
            />
            <span className="font-display font-bold text-xl tracking-tight">
              {company?.name || "CST Logistics"}
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex md:items-center md:gap-8">
            <div className="flex items-center gap-1">
              {/* Home */}
              <Link href="/" className={linkClass(location === "/")}>
                {t("nav.home")}
              </Link>

              {/* Products */}
              <Link href="/products" className={linkClass(location === "/products")}>
                {t("nav.products")}
              </Link>

              {/* Services with Mega Menu */}
              <div className="relative" ref={servicesRef}>
                <button
                  className={`flex items-center gap-1 px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:text-primary hover:bg-primary/10 ${
                    isServicesActive ? "text-primary bg-primary/10 font-semibold" : "text-muted-foreground"
                  }`}
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

                {/* Mega Menu Panel */}
                {servicesOpen && (
                  <div
                    className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50"
                    style={{ width: "640px" }}
                    onMouseLeave={() => setServicesOpen(false)}
                  >
                    <div
                      className="rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
                      style={{
                        background: "rgba(255,255,255,0.97)",
                        backdropFilter: "blur(16px)",
                        boxShadow: "0 20px 50px rgba(15,23,42,0.12)",
                      }}
                    >
                      {/* Header */}
                      <div className="px-6 py-4 bg-gradient-to-r from-sky-50 to-blue-50 border-b border-slate-100">
                        <p className="text-xs font-semibold text-sky-700 uppercase tracking-widest">
                          {t("servicesMenu.tagline")}
                        </p>
                      </div>

                      {/* Grid of services */}
                      <div className="grid grid-cols-2 gap-1 p-3">
                        {SERVICES_ITEMS.map(({ icon: Icon, titleKey, descKey, href }) => (
                          <Link
                            key={titleKey}
                            href={href}
                            onClick={() => setServicesOpen(false)}
                          >
                            <div className="flex items-start gap-3 p-3 rounded-xl hover:bg-sky-50 transition-colors duration-150 group cursor-pointer">
                              <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center shrink-0 group-hover:bg-sky-200 transition-colors">
                                <Icon className="h-4 w-4 text-sky-600" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-slate-800 group-hover:text-sky-700 transition-colors">
                                  {t(titleKey)}
                                </p>
                                <p className="text-xs text-slate-500 leading-relaxed mt-0.5 line-clamp-2">
                                  {t(descKey)}
                                </p>
                              </div>
                            </div>
                          </Link>
                        ))}
                      </div>

                      {/* Footer */}
                      <div className="px-4 pb-4">
                        <Link href="/services" onClick={() => setServicesOpen(false)}>
                          <div className="flex items-center justify-between p-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white hover:from-sky-600 hover:to-blue-700 transition-all cursor-pointer">
                            <span className="text-sm font-semibold">{t("servicesMenu.viewAll")}</span>
                            <ChevronRight className="h-4 w-4" />
                          </div>
                        </Link>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Calculator */}
              <Link href="/calculator" className={linkClass(location === "/calculator")}>
                {t("nav.calculator")}
              </Link>

              {/* Tentang */}
              <button
                onClick={() => scrollToSection("tentang")}
                className="px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:text-primary hover:bg-primary/10 text-muted-foreground"
              >
                {t("nav.about")}
              </button>

              {/* Kontak */}
              <button
                onClick={() => scrollToSection("kontak")}
                className="px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:text-primary hover:bg-primary/10 text-muted-foreground"
              >
                {t("nav.contact")}
              </button>

              {/* Track */}
              <Link href="/track" className={linkClass(location === "/track")}>
                {t("nav.trackOrder")}
              </Link>
            </div>

            <div className="flex items-center gap-3 border-l border-border pl-6">
              {/* Cart button */}
              <button
                onClick={openCart}
                className="relative p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
                aria-label="Keranjang"
              >
                <ShoppingCart className="h-5 w-5" />
                {count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-accent text-accent-foreground text-[10px] font-bold w-4.5 h-4.5 min-w-[1.1rem] min-h-[1.1rem] flex items-center justify-center rounded-full leading-none px-1">
                    {count}
                  </span>
                )}
              </button>

              <LanguageSelector />

              {isAuth ? (
                <>
                  {isAdmin && (
                    <Link href="/admin">
                      <Button variant="ghost" size="sm" className="gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50">
                        <Shield className="h-4 w-4" />
                        {t("nav.admin")}
                      </Button>
                    </Link>
                  )}
                  <Link href="/dashboard">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      {t("nav.dashboard")}
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm">{t("nav.login")}</Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                      {t("nav.register")}
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden flex items-center gap-1">
            <LanguageSelector compact />
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden border-t border-border bg-background max-h-[85vh] overflow-y-auto">
          <div className="space-y-1 px-4 pb-4 pt-2">
            {/* Home */}
            <Link href="/" onClick={() => setIsOpen(false)}>
              <div className={`block rounded-md px-3 py-2 text-base font-medium cursor-pointer ${
                location === "/" ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                {t("nav.home")}
              </div>
            </Link>

            {/* Products */}
            <Link href="/products" onClick={() => setIsOpen(false)}>
              <div className={`block rounded-md px-3 py-2 text-base font-medium cursor-pointer ${
                location === "/products" ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                {t("nav.products")}
              </div>
            </Link>

            {/* Services Accordion */}
            <div>
              <button
                className={`w-full flex items-center justify-between rounded-md px-3 py-2 text-base font-medium ${
                  isServicesActive ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
                onClick={() => setMobileServicesOpen((v) => !v)}
                aria-expanded={mobileServicesOpen}
              >
                {t("nav.services")}
                <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${mobileServicesOpen ? "rotate-180" : ""}`} />
              </button>

              {mobileServicesOpen && (
                <div className="mt-1 ml-3 pl-3 border-l-2 border-sky-200 space-y-1">
                  {SERVICES_ITEMS.map(({ icon: Icon, titleKey, href }) => (
                    <Link key={titleKey} href={href} onClick={() => setIsOpen(false)}>
                      <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer">
                        <Icon className="h-4 w-4 text-sky-500 shrink-0" />
                        {t(titleKey)}
                      </div>
                    </Link>
                  ))}
                  <Link href="/services" onClick={() => setIsOpen(false)}>
                    <div className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-sky-600 hover:bg-sky-50 cursor-pointer">
                      <ChevronRight className="h-4 w-4" />
                      {t("servicesMenu.viewAll")}
                    </div>
                  </Link>
                </div>
              )}
            </div>

            {/* Calculator */}
            <Link href="/calculator" onClick={() => setIsOpen(false)}>
              <div className={`flex items-center gap-2 rounded-md px-3 py-2 text-base font-medium cursor-pointer ${
                location === "/calculator" ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                <Calculator className="h-4 w-4" />
                {t("nav.calculator")}
              </div>
            </Link>

            {/* About */}
            <button
              onClick={() => scrollToSection("tentang")}
              className="w-full text-left block rounded-md px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("nav.about")}
            </button>

            {/* Contact */}
            <button
              onClick={() => scrollToSection("kontak")}
              className="w-full text-left block rounded-md px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              {t("nav.contact")}
            </button>

            {/* Track */}
            <Link href="/track" onClick={() => setIsOpen(false)}>
              <div className={`block rounded-md px-3 py-2 text-base font-medium cursor-pointer ${
                location === "/track" ? "bg-primary/5 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}>
                {t("nav.trackOrder")}
              </div>
            </Link>

            <div className="px-1 py-2 border-t border-border mt-2 pt-2">
              <LanguageSelector />
            </div>

            <div className="my-2 border-t border-border pt-4">
              {isAuth ? (
                <div className="space-y-2">
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setIsOpen(false)}>
                      <Button variant="outline" className="w-full justify-start gap-2 text-amber-600 border-amber-200">
                        <Shield className="h-4 w-4" />
                        {t("nav.admin")}
                      </Button>
                    </Link>
                  )}
                  <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      {t("nav.dashboard")}
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => { handleLogout(); setIsOpen(false); }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full">{t("nav.login")}</Button>
                  </Link>
                  <Link href="/register" onClick={() => setIsOpen(false)}>
                    <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                      {t("nav.register")}
                    </Button>
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
