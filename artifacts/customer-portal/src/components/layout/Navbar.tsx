import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Menu,
  X,
  LogOut,
  LayoutDashboard,
  ShoppingCart,
  Shield,
} from "lucide-react";
import { isAuthenticated, removeAuthToken, isPortalAdmin } from "@/lib/auth";
import { useGetPortalCompany } from "@workspace/api-client-react";
import { useCart } from "@/lib/cart";
import { LanguageSelector } from "@/components/layout/LanguageSelector";
import { useLanguage } from "@/i18n/LanguageContext";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location, setLocation] = useLocation();
  const isAuth = isAuthenticated();
  const isAdmin = isPortalAdmin();
  const { count, openCart } = useCart();
  const { t } = useLanguage();

  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] },
  });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
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

  const navLinks: Array<
    | { name: string; type: "link"; path: string }
    | { name: string; type: "scroll"; anchor: string }
  > = [
    { name: t("nav.home"), type: "link", path: "/" },
    { name: t("nav.products"), type: "link", path: "/products" },
    { name: t("nav.services"), type: "link", path: "/jasa" },
    { name: t("nav.about"), type: "scroll", anchor: "tentang" },
    { name: t("nav.contact"), type: "scroll", anchor: "kontak" },
    { name: t("nav.trackOrder"), type: "link", path: "/track" },
  ];

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
              {navLinks.map((link) =>
                link.type === "link" ? (
                  <Link
                    key={link.name}
                    href={link.path}
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:text-primary hover:bg-primary/10 ${
                      (location === link.path && link.path !== "/") ||
                      (location === "/" && link.path === "/")
                        ? "text-primary bg-primary/10 font-semibold"
                        : "text-muted-foreground"
                    }`}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <button
                    key={link.name}
                    onClick={() => scrollToSection(link.anchor)}
                    className="px-3 py-2 text-sm font-medium rounded-md transition-colors duration-200 hover:text-primary hover:bg-primary/10 text-muted-foreground"
                  >
                    {link.name}
                  </button>
                ),
              )}
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
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                      >
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
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleLogout}
                    className="gap-2"
                  >
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm">
                      {t("nav.login")}
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button
                      size="sm"
                      className="bg-accent text-accent-foreground hover:bg-accent/90"
                    >
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
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
            >
              {isOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      {isOpen && (
        <div className="md:hidden border-t border-border bg-background">
          <div className="space-y-1 px-4 pb-4 pt-2">
            {navLinks.map((link) =>
              link.type === "link" ? (
                <Link
                  key={link.name}
                  href={link.path}
                  onClick={() => setIsOpen(false)}
                >
                  <div
                    className={`block rounded-md px-3 py-2 text-base font-medium cursor-pointer ${
                      location === link.path
                        ? "bg-primary/5 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {link.name}
                  </div>
                </Link>
              ) : (
                <button
                  key={link.name}
                  onClick={() => scrollToSection(link.anchor)}
                  className="w-full text-left block rounded-md px-3 py-2 text-base font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  {link.name}
                </button>
              ),
            )}

            <div className="px-1 py-2 border-t border-border mt-2 pt-2">
              <LanguageSelector />
            </div>

            <div className="my-2 border-t border-border pt-4">
              {isAuth ? (
                <div className="space-y-2">
                  {isAdmin && (
                    <Link href="/admin" onClick={() => setIsOpen(false)}>
                      <Button
                        variant="outline"
                        className="w-full justify-start gap-2 text-amber-600 border-amber-200"
                      >
                        <Shield className="h-4 w-4" />
                        {t("nav.admin")}
                      </Button>
                    </Link>
                  )}
                  <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button
                      variant="outline"
                      className="w-full justify-start gap-2"
                    >
                      <LayoutDashboard className="h-4 w-4" />
                      {t("nav.dashboard")}
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    className="w-full justify-start gap-2"
                    onClick={() => {
                      handleLogout();
                      setIsOpen(false);
                    }}
                  >
                    <LogOut className="h-4 w-4" />
                    {t("nav.logout")}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full">
                      {t("nav.login")}
                    </Button>
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
