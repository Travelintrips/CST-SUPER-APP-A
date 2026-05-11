import { useListPortalServices } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, ShoppingCart, Truck, ChevronRight, X, Container } from "lucide-react";
import { resolveImageUrl } from "@/lib/utils";
import { getServiceFallbackImage } from "@/lib/categoryImages";
import { useState } from "react";
import { useCart } from "@/lib/cart";
import { useLanguage } from "@/i18n/LanguageContext";
import { translateServiceName, translateCategory } from "@/i18n/serviceData";

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const stripJasa = (name: string) => name.replace(/^Jasa\s+/i, "");

const GROUPED_CATEGORIES = ["Trucking", "Container"];

function isGrouped(service: { categories?: string[] }) {
  return service.categories?.some((c) => GROUPED_CATEGORIES.includes(c));
}

type Service = {
  id: number;
  name: string;
  description?: string;
  price: number;
  imageUrl?: string;
  categories?: string[];
};

function ServiceImage({ service, className = "" }: { service: Service; className?: string }) {
  const [failed, setFailed] = useState(false);
  const resolved = resolveImageUrl(service.imageUrl ?? "");
  const fallbackSrc = getServiceFallbackImage(service.categories, service.name);
  const src = (!failed && service.imageUrl && resolved) ? resolved : fallbackSrc;

  return (
    <img
      src={src}
      alt={service.name}
      className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${className}`}
      onError={(e) => {
        if (!failed) {
          setFailed(true);
          (e.currentTarget as HTMLImageElement).src = fallbackSrc;
        }
      }}
      loading="lazy"
    />
  );
}

export default function Services() {
  const [searchQuery, setSearchQuery] = useState("");
  const [truckingOpen, setTruckingOpen] = useState(false);
  const { addItem, items } = useCart();
  const { t, locale } = useLanguage();

  const { data: servicesData, isLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServices"] }
  });

  const allServices: Service[] = Array.isArray(servicesData) ? servicesData : [];

  const groupedServices = allServices.filter(isGrouped);
  const regularServices = allServices.filter((s) => !isGrouped(s));

  const filteredRegular = regularServices.filter((service) => {
    const q = searchQuery.toLowerCase();
    return (
      service.name.toLowerCase().includes(q) ||
      service.description?.toLowerCase().includes(q) ||
      service.categories?.some((cat: string) => cat.toLowerCase().includes(q))
    );
  });

  const filteredGrouped = groupedServices.filter((service) => {
    const q = searchQuery.toLowerCase();
    return (
      service.name.toLowerCase().includes(q) ||
      service.description?.toLowerCase().includes(q) ||
      service.categories?.some((cat: string) => cat.toLowerCase().includes(q))
    );
  });

  const showGroupedCard = filteredGrouped.length > 0 || searchQuery === "";

  function isInCart(id: number) {
    return items.some((i) => i.productId === id);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Hero header */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0B4F8A 0%, #0F8FD8 50%, #38BDF8 100%)",
          padding: "clamp(56px, 8vw, 96px) 0 clamp(40px, 6vw, 72px)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, rgba(2,34,64,0.55) 0%, rgba(2,34,64,0.25) 40%, rgba(2,34,64,0.05) 100%)",
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.15) 1px, transparent 1px)",
            backgroundSize: "40px 40px",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        />
        <div
          aria-hidden="true"
          className="svc-glow-layer"
          style={{
            position: "absolute",
            right: "-4%",
            top: "50%",
            transform: "translateY(-50%)",
            width: "58%",
            height: "88%",
            background: [
              "radial-gradient(circle at 22% 44%, rgba(255,255,255,0.85) 0 3px, transparent 5px)",
              "radial-gradient(circle at 42% 32%, rgba(255,255,255,0.80) 0 3px, transparent 5px)",
              "radial-gradient(circle at 62% 48%, rgba(255,255,255,0.80) 0 3px, transparent 5px)",
              "radial-gradient(circle at 78% 34%, rgba(255,255,255,0.75) 0 3px, transparent 5px)",
              "radial-gradient(circle at 72% 68%, rgba(255,255,255,0.75) 0 3px, transparent 5px)",
              "radial-gradient(circle at 22% 44%, rgba(255,255,255,0.22) 0 16px, transparent 38px)",
              "radial-gradient(circle at 42% 32%, rgba(255,255,255,0.18) 0 14px, transparent 36px)",
              "radial-gradient(circle at 62% 48%, rgba(255,255,255,0.18) 0 14px, transparent 36px)",
              "radial-gradient(circle at 78% 34%, rgba(255,255,255,0.16) 0 13px, transparent 34px)",
              "linear-gradient(25deg, transparent 17%, rgba(255,255,255,0.16) 18%, transparent 20%)",
              "linear-gradient(145deg, transparent 33%, rgba(255,255,255,0.14) 34%, transparent 36%)",
              "linear-gradient(78deg, transparent 49%, rgba(255,255,255,0.13) 50%, transparent 52%)",
              "radial-gradient(ellipse at center, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.05) 38%, transparent 70%)",
            ].join(", "),
            borderRadius: "999px",
            opacity: 0.95,
            filter: "drop-shadow(0 0 34px rgba(255,255,255,0.18))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <div
          aria-hidden="true"
          className="svc-routes-layer"
          style={{
            position: "absolute",
            right: "3%",
            top: "22%",
            width: "48%",
            height: "56%",
            backgroundImage: "url(/images/logistics-routes.svg)",
            backgroundRepeat: "no-repeat",
            backgroundSize: "contain",
            backgroundPosition: "center right",
            opacity: 0.45,
            filter: "drop-shadow(0 0 18px rgba(255,255,255,0.20))",
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
        <style>{`
          @media (max-width: 768px) {
            .svc-glow-layer { width: 95% !important; height: 75% !important; right: -38% !important; opacity: 0.45 !important; }
            .svc-routes-layer { width: 90% !important; right: -42% !important; opacity: 0.22 !important; filter: none !important; }
          }
        `}</style>

        <div className="container px-4 md:px-6" style={{ maxWidth: "760px", position: "relative", zIndex: 2 }}>
          <p
            className="font-semibold uppercase mb-3"
            style={{ fontSize: "12px", letterSpacing: "0.14em", color: "rgba(255,255,255,0.85)" }}
          >
            {t("services.catalogLabel")}
          </p>
          <h1
            className="font-display mb-4 text-white"
            style={{ fontSize: "clamp(36px, 5vw, 64px)", fontWeight: 800, lineHeight: 1.08, letterSpacing: "-0.02em", textShadow: "0 6px 20px rgba(0,0,0,0.25)" }}
          >
            {t("services.title")}
          </h1>
          <p
            className="mb-8"
            style={{ fontSize: "clamp(16px, 2vw, 22px)", color: "rgba(255,255,255,0.90)", maxWidth: "620px", lineHeight: 1.6 }}
          >
            {t("services.description")}
          </p>

          <div className="relative" style={{ maxWidth: "520px" }}>
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ width: "18px", height: "18px", color: "rgba(255,255,255,0.85)" }}
            />
            <input
              id="services-hero-search"
              type="text"
              placeholder={t("services.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full focus:outline-none"
              style={{
                paddingLeft: "44px", paddingRight: "16px", paddingTop: "14px", paddingBottom: "14px",
                background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)",
                backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
                borderRadius: "14px", fontSize: "15px", color: "white", boxShadow: "0 10px 30px rgba(0,0,0,0.20)",
              }}
              onFocus={(e) => { e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.45), 0 10px 30px rgba(0,0,0,0.20)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.65)"; }}
              onBlur={(e) => { e.currentTarget.style.boxShadow = "0 10px 30px rgba(0,0,0,0.20)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)"; }}
            />
            <style>{`#services-hero-search::placeholder { color: rgba(255,255,255,0.75); }`}</style>
          </div>
        </div>
      </div>

      {/* Catalog Grid */}
      <div className="container px-4 md:px-6 mt-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse h-[400px]">
                <div className="h-48 bg-gray-200" />
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-full mt-4" />
                  <div className="h-4 bg-gray-200 rounded w-5/6" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : (filteredRegular.length > 0 || showGroupedCard) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">

            {/* ── Trucking & Container folder card ── */}
            {showGroupedCard && (
              <Card
                className="group overflow-hidden flex flex-col h-full border-border/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300 cursor-pointer"
                onClick={() => setTruckingOpen(true)}
              >
                {/* Visual: gradient + icons instead of photo */}
                <div className="aspect-video w-full overflow-hidden relative bg-gradient-to-br from-slate-800 via-slate-700 to-slate-600 flex items-center justify-center">
                  <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.4) 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                  <div className="flex items-center gap-5 relative z-10">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                        <Truck className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <div className="text-white/40 text-3xl font-thin">+</div>
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
                        <Container className="w-7 h-7 text-white" />
                      </div>
                    </div>
                  </div>
                  {/* Sub-count badge */}
                  <div className="absolute top-3 left-3">
                    <Badge className="bg-white/20 text-white backdrop-blur-sm border-white/30 text-xs font-semibold">
                      {groupedServices.length} Layanan
                    </Badge>
                  </div>
                  {/* Folder indicator */}
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/20 backdrop-blur-sm rounded-lg px-2 py-1">
                    <ChevronRight className="w-3.5 h-3.5 text-white" />
                    <span className="text-[11px] text-white font-medium">Lihat Isi</span>
                  </div>
                </div>

                <CardHeader>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">Trucking</Badge>
                    <Badge variant="secondary" className="text-xs">Container</Badge>
                  </div>
                  <CardTitle className="text-xl">Trucking &amp; Container</CardTitle>
                  <CardDescription className="text-sm mt-2 leading-relaxed">
                    Layanan transportasi darat dan sewa container untuk kebutuhan pengiriman lokal maupun antar kota.
                  </CardDescription>
                </CardHeader>

                <CardContent className="mt-auto pt-0 space-y-3">
                  {/* Sub-service name chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {groupedServices.slice(0, 4).map((s) => (
                      <span key={s.id} className="text-xs bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 border border-slate-200">
                        {translateServiceName(stripJasa(s.name), locale)}
                      </span>
                    ))}
                    {groupedServices.length > 4 && (
                      <span className="text-xs bg-slate-100 text-slate-500 rounded-full px-2.5 py-0.5 border border-slate-200">
                        +{groupedServices.length - 4} lainnya
                      </span>
                    )}
                  </div>
                  <Button className="w-full gap-2 bg-slate-800 hover:bg-slate-700 text-white">
                    <ChevronRight className="h-4 w-4" />
                    Lihat Semua Layanan
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── Individual service cards ── */}
            {filteredRegular.map((service) => (
              <Card key={service.id} className="group overflow-hidden flex flex-col h-full border-border/50 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                <div className="aspect-video w-full overflow-hidden bg-gray-100 relative">
                  <ServiceImage service={service} />
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {service.categories?.map((cat: string, i: number) => (
                      <Badge key={i} className="bg-background/90 text-foreground backdrop-blur-sm border-none shadow-sm">
                        {translateCategory(cat, locale)}
                      </Badge>
                    ))}
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="text-xl">{translateServiceName(stripJasa(service.name), locale)}</CardTitle>
                  <CardDescription className="text-sm mt-2 leading-relaxed">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0 space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">{t("services.price")}</span>
                    {service.price > 0 ? (
                      <span className="font-bold text-lg text-primary">{formatIDR(service.price)}</span>
                    ) : (
                      <span className="font-semibold text-amber-600 text-sm">{t("services.negotiable")}</span>
                    )}
                  </div>
                  <Button
                    className="w-full gap-2"
                    variant={isInCart(service.id) ? "outline" : "default"}
                    onClick={() =>
                      addItem({
                        productId: service.id,
                        name: stripJasa(service.name),
                        unitPrice: service.price,
                        itemType: "jasa",
                      })
                    }
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {isInCart(service.id) ? t("services.inCart") : t("services.addToCart")}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-xl border border-dashed border-border">
            <img src={`${import.meta.env.BASE_URL}images/logo.png`} alt="CST Logistics" className="h-12 w-auto mx-auto mb-4 object-contain opacity-35" />
            <h3 className="text-xl font-medium mb-2">{t("services.noServices")}</h3>
            <p className="text-muted-foreground">
              {searchQuery ? t("services.tryOther") : t("services.noResults")}
            </p>
          </div>
        )}
      </div>

      {/* ── Trucking & Container Modal ── */}
      <Dialog open={truckingOpen} onOpenChange={setTruckingOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b sticky top-0 bg-white z-10">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center">
                  <Truck className="w-5 h-5 text-white" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold text-slate-800">Trucking &amp; Container</DialogTitle>
                  <p className="text-sm text-slate-500 mt-0.5">Pilih layanan yang sesuai kebutuhan Anda</p>
                </div>
              </div>
            </div>
          </DialogHeader>

          <div className="p-6 space-y-4">
            {groupedServices.map((service) => (
              <div
                key={service.id}
                className="flex flex-col sm:flex-row gap-4 p-4 rounded-xl border border-border hover:border-slate-300 hover:shadow-sm transition-all bg-white"
              >
                {/* Thumbnail */}
                <div className="w-full sm:w-24 h-24 shrink-0 rounded-lg overflow-hidden bg-gray-100">
                  <ServiceImage service={service} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {service.categories?.map((cat: string, i: number) => (
                      <Badge key={i} variant="secondary" className="text-xs">
                        {translateCategory(cat, locale)}
                      </Badge>
                    ))}
                  </div>
                  <h3 className="font-semibold text-slate-800 text-base leading-snug">
                    {translateServiceName(stripJasa(service.name), locale)}
                  </h3>
                  {service.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{service.description}</p>
                  )}
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      <span className="text-xs text-slate-400 block">{t("services.price")}</span>
                      {service.price > 0 ? (
                        <span className="font-bold text-primary">{formatIDR(service.price)}</span>
                      ) : (
                        <span className="font-semibold text-amber-600 text-sm">{t("services.negotiable")}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      className="gap-1.5 shrink-0"
                      variant={isInCart(service.id) ? "outline" : "default"}
                      onClick={() => {
                        addItem({
                          productId: service.id,
                          name: stripJasa(service.name),
                          unitPrice: service.price,
                          itemType: "jasa",
                        });
                        setTruckingOpen(false);
                      }}
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {isInCart(service.id) ? t("services.inCart") : t("services.addToCart")}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
