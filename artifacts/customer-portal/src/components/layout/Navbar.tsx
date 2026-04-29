import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Menu, X, Package, LogOut, LayoutDashboard } from "lucide-react";
import { isAuthenticated, removeAuthToken } from "@/lib/auth";
import { useGetPortalCompany } from "@workspace/api-client-react";

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [location, setLocation] = useLocation();
  const isAuth = isAuthenticated();

  const { data: company } = useGetPortalCompany({
    query: { queryKey: ["getPortalCompany"] }
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
    { name: "Beranda", type: "link", path: "/" },
    { name: "Layanan", type: "link", path: "/services" },
    { name: "Produk", type: "link", path: "/products" },
    { name: "Tentang Kami", type: "scroll", anchor: "tentang" },
    { name: "Kontak", type: "scroll", anchor: "kontak" },
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
            <div className="bg-primary text-primary-foreground p-2 rounded-lg group-hover:bg-accent transition-colors">
              <Package className="h-6 w-6" />
            </div>
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
                    className={`px-3 py-2 text-sm font-medium rounded-md transition-colors hover:text-accent hover:bg-accent/5 ${
                      (location === link.path && link.path !== "/") ||
                      (location === "/" && link.path === "/")
                        ? "text-accent bg-accent/5"
                        : "text-muted-foreground"
                    }`}
                  >
                    {link.name}
                  </Link>
                ) : (
                  <button
                    key={link.name}
                    onClick={() => scrollToSection(link.anchor)}
                    className="px-3 py-2 text-sm font-medium rounded-md transition-colors hover:text-accent hover:bg-accent/5 text-muted-foreground"
                  >
                    {link.name}
                  </button>
                )
              )}
            </div>

            <div className="flex items-center gap-3 border-l border-border pl-6">
              {isAuth ? (
                <>
                  <Link href="/dashboard">
                    <Button variant="ghost" size="sm" className="gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" onClick={handleLogout} className="gap-2">
                    <LogOut className="h-4 w-4" />
                    Keluar
                  </Button>
                </>
              ) : (
                <>
                  <Link href="/login">
                    <Button variant="ghost" size="sm">
                      Masuk
                    </Button>
                  </Link>
                  <Link href="/register">
                    <Button size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                      Daftar Sekarang
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Mobile Menu Button */}
          <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={() => setIsOpen(!isOpen)}>
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
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
                <Link key={link.name} href={link.path} onClick={() => setIsOpen(false)}>
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
              )
            )}

            <div className="my-4 border-t border-border pt-4">
              {isAuth ? (
                <div className="space-y-2">
                  <Link href="/dashboard" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full justify-start gap-2">
                      <LayoutDashboard className="h-4 w-4" />
                      Dashboard
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
                    Keluar
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    <Button variant="outline" className="w-full">
                      Masuk
                    </Button>
                  </Link>
                  <Link href="/register" onClick={() => setIsOpen(false)}>
                    <Button className="w-full bg-accent text-accent-foreground hover:bg-accent/90">
                      Daftar Sekarang
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
