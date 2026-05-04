import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resolveImageUrl } from "@/lib/utils";
import {
  ShoppingBag, Search, ChevronLeft, ChevronRight,
  Play, Package, Star, Clock, Check, Layers, ExternalLink, Truck,
} from "lucide-react";
import { useCart } from "@/lib/cart";
import { useLanguage } from "@/i18n/LanguageContext";

type MediaItem = { type: "image" | "video"; url: string };

interface ShippingOption {
  id: string;
  name: string;
  logo: string;
  eta: string;
  fee: number;
  note: string | null;
  kind: "vendor" | "service";
  serviceId?: number;
}

function useShippingOptions() {
  const [options, setOptions] = useState<ShippingOption[]>([]);
  useEffect(() => {
    Promise.all([
      fetch("/api/portal/delivery-vendors").then((r) => r.json()).catch(() => []),
      fetch("/api/portal/services").then((r) => r.json()).catch(() => []),
    ]).then(([vendors, services]) => {
      const vendorOpts: ShippingOption[] = (Array.isArray(vendors) ? vendors : []).map(
        (v: { id: number; name: string; logo: string; eta: string; fee: number; note: string | null }) => ({
          id: `vendor-${v.id}`, name: v.name, logo: v.logo, eta: v.eta,
          fee: v.fee, note: v.note, kind: "vendor" as const,
        })
      );
      const serviceOpts: ShippingOption[] = (Array.isArray(services) ? services : []).map(
        (s: { id: number; name: string; price: number }) => ({
          id: `service-${s.id}`, name: s.name, logo: "🏢",
          eta: "Sesuai kesepakatan",
          fee: s.price ?? 0,
          note: s.price === 0 ? "Harga nego" : null,
          kind: "service" as const,
          serviceId: s.id,
        })
      );
      setOptions([...vendorOpts, ...serviceOpts]);
    });
  }, []);
  return options;
}

interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  unit: string;
  unitOptions: string[];
  imageUrl: string | null;
  mediaItems: MediaItem[];
  categories: string[];
}


const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

function getMedia(product: Product): MediaItem[] {
  const items = product.mediaItems ?? [];
  if (items.length > 0) return items;
  if (product.imageUrl) return [{ type: "image", url: product.imageUrl }];
  return [];
}

// ── Video first-frame thumbnail capture ────────────────────────────────────
function useVideoThumbnail(src: string | null) {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    if (!src) return;
    let cancelled = false;
    const vid = document.createElement("video");
    vid.preload = "auto";
    vid.muted = true;
    vid.playsInline = true;
    vid.src = src;
    const capture = () => {
      if (cancelled || vid.videoWidth === 0) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = vid.videoWidth;
        canvas.height = vid.videoHeight;
        canvas.getContext("2d")?.drawImage(vid, 0, 0, canvas.width, canvas.height);
        const data = canvas.toDataURL("image/jpeg", 0.7);
        if (data.length > 100) setThumb(data);
      } catch { /* tainted canvas — leave null */ }
    };
    vid.addEventListener("loadeddata", () => { if (!cancelled) capture(); }, { once: true });
    vid.addEventListener("seeked", () => { if (!cancelled) capture(); }, { once: true });
    vid.addEventListener("canplay", () => { if (!cancelled) capture(); }, { once: true });
    vid.addEventListener("error", () => { /* silent */ });
    vid.load();
    return () => {
      cancelled = true;
      vid.src = "";
    };
  }, [src]);
  return thumb;
}

function VideoThumb({ src, className }: { src: string; className?: string }) {
  const thumb = useVideoThumbnail(src);
  return thumb ? (
    <img src={thumb} alt="video preview" className={className ?? "w-full h-full object-cover"} />
  ) : (
    <div className={`bg-gray-900 flex items-center justify-center ${className ?? "w-full h-full"}`}>
      <Play className="h-5 w-5 text-white/70 fill-white/70" />
    </div>
  );
}

// ── Mini image carousel for product cards ──────────────────────────────────
function CardCarousel({ product }: { product: Product }) {
  const media = getMedia(product);
  const [idx, setIdx] = useState(0);

  if (media.length === 0) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-gray-100">
        <ShoppingBag className="h-12 w-12 text-gray-300" />
      </div>
    );
  }

  const current = media[idx];

  return (
    <div className="w-full h-full relative group/car">
      {current.type === "video" ? (
        <div className="relative w-full h-full">
          <VideoThumb src={resolveImageUrl(current.url) ?? ""} className="w-full h-full object-cover" />
        </div>
      ) : (
        <img
          src={resolveImageUrl(current.url) ?? ""}
          alt={product.name}
          className="w-full h-full object-cover"
        />
      )}
      {media.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i - 1 + media.length) % media.length); }}
            className="absolute left-1 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-0.5 opacity-0 group-hover/car:opacity-100 transition-opacity"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setIdx((i) => (i + 1) % media.length); }}
            className="absolute right-1 top-1/2 -translate-y-1/2 bg-black/40 text-white rounded-full p-0.5 opacity-0 group-hover/car:opacity-100 transition-opacity"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {media.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); setIdx(i); }}
                className={`h-1.5 rounded-full transition-all ${i === idx ? "w-4 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Full-screen media gallery inside the modal ─────────────────────────────
function MediaGallery({ product }: { product: Product }) {
  const media = getMedia(product);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const current = media[idx];
  const isVideo = current?.type === "video";
  const videoSrc = isVideo ? (resolveImageUrl(current.url) ?? null) : null;
  const videoPoster = useVideoThumbnail(videoSrc);

  function prev() { setIdx((i) => (i - 1 + media.length) % media.length); setPlaying(false); }
  function next() { setIdx((i) => (i + 1) % media.length); setPlaying(false); }

  if (media.length === 0) {
    return (
      <div className="w-full aspect-square bg-gray-100 flex items-center justify-center rounded-xl">
        <ShoppingBag className="h-20 w-20 text-gray-300" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Main viewer */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-square">
        {isVideo ? (
          <div className="w-full h-full relative">
            <video
              ref={videoRef}
              src={resolveImageUrl(current.url) ?? ""}
              className="w-full h-full object-contain"
              controls={playing}
              playsInline
              preload="metadata"
              poster={videoPoster ?? undefined}
            />
            {!playing && (
              <button
                onClick={() => { setPlaying(true); videoRef.current?.play(); }}
                className="absolute inset-0 flex items-center justify-center bg-black/30"
              >
                <div className="bg-white/90 rounded-full p-4 shadow-lg">
                  <Play className="h-8 w-8 text-primary fill-primary" />
                </div>
              </button>
            )}
          </div>
        ) : (
          <img
            src={resolveImageUrl(current.url) ?? ""}
            alt={product.name}
            className="w-full h-full object-contain"
          />
        )}
        {media.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors">
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
              {idx + 1}/{media.length}
            </div>
          </>
        )}
      </div>

      {/* Thumbnail strip */}
      {media.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {media.map((m, i) => (
            <button
              key={i}
              onClick={() => { setIdx(i); setPlaying(false); }}
              className={`shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${i === idx ? "border-primary" : "border-transparent opacity-60 hover:opacity-100"}`}
            >
              {m.type === "video" ? (
                <div className="relative w-full h-full">
                  <VideoThumb src={resolveImageUrl(m.url) ?? ""} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <Play className="h-4 w-4 text-white fill-white drop-shadow" />
                  </div>
                </div>
              ) : (
                <img src={resolveImageUrl(m.url) ?? ""} alt="" className="w-full h-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Product detail modal ───────────────────────────────────────────────────
function ProductModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [qty, setQty] = useState(1);
  const [shippingTab, setShippingTab] = useState<"vendor" | "service">("service");
  const [selectedShipping, setSelectedShipping] = useState<string | null>(null);
  const { addItemSilent } = useCart();
  const [, setLocation] = useLocation();
  const { t } = useLanguage();

  // Effective unit options: combine unitOptions + default unit, deduplicate
  const effectiveUnitOptions = Array.from(
    new Set([
      ...((product.unitOptions ?? []).length > 0 ? product.unitOptions : []),
      ...(product.unit ? [product.unit] : ["pcs"]),
    ])
  );
  const hasUnitChoice = effectiveUnitOptions.length > 1;
  const [selectedUnit, setSelectedUnit] = useState<string>(
    effectiveUnitOptions[0] ?? product.unit ?? "pcs"
  );

  const allShipping = useShippingOptions();
  const vendorOpts = allShipping.filter((s) => s.kind === "vendor");
  const serviceOpts = allShipping.filter((s) => s.kind === "service");
  const shownOpts = shippingTab === "vendor" ? vendorOpts : serviceOpts;
  const chosen = allShipping.find((s) => s.id === selectedShipping);

  const cartPayload = {
    productId: product.id,
    name: product.name,
    unitPrice: product.price,
    itemType: "barang" as const,
  };

  function handleBuyNow() {
    if (!chosen) return;
    if (chosen.kind === "service" && chosen.serviceId != null) {
      // Jasa flow: add product silently → navigate to /jasa/:id with sticky banner
      addItemSilent(cartPayload);
      sessionStorage.setItem(
        "pendingJasaReview",
        JSON.stringify({ serviceId: chosen.serviceId, productId: product.id, productName: product.name, unit: selectedUnit, qty })
      );
      onClose();
      setLocation(`/jasa/${chosen.serviceId}`);
    } else {
      // Kurir flow: navigate to /book with commodity + unit pre-filled
      const params = new URLSearchParams({
        commodity: product.name,
        productId: String(product.id),
        qty: String(qty),
        unit: selectedUnit,
        ...(product.price > 0 ? { productPrice: String(product.price) } : {}),
      });
      onClose();
      setLocation(`/book?${params.toString()}`);
    }
  }

  return (
    <DialogContent className="max-w-4xl p-0 overflow-hidden max-h-[90vh] overflow-y-auto">
      <div className="grid md:grid-cols-2 gap-0">
        {/* Left: media gallery */}
        <div className="p-4 md:p-6 bg-gray-50/50 border-r border-border">
          <MediaGallery product={product} />
        </div>

        {/* Right: product info */}
        <div className="p-4 md:p-6 space-y-4 flex flex-col">
          {/* Categories */}
          {product.categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {product.categories.map((c, i) => (
                <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
              ))}
            </div>
          )}

          {/* Name */}
          <h2 className="text-xl font-bold text-foreground leading-snug">{product.name}</h2>

          {/* Price */}
          <div className="bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
            {product.price > 0 ? (
              <p className="text-2xl font-bold text-primary">{formatIDR(product.price)}</p>
            ) : (
              <p className="text-lg font-semibold text-amber-600">{t("products.negotiable")}</p>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("products.descriptionLabel")}</p>
              <p className="text-sm text-foreground leading-relaxed line-clamp-3">{product.description}</p>
            </div>
          )}

          {/* Unit Selector — only shown if product has multiple unit options */}
          {hasUnitChoice && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Satuan / Ukuran
              </p>
              <div className="flex flex-wrap gap-2">
                {effectiveUnitOptions.map((u) => (
                  <button
                    key={u}
                    onClick={() => setSelectedUnit(u)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${
                      selectedUnit === u
                        ? "bg-primary text-primary-foreground border-primary shadow-sm"
                        : "bg-white border-border text-foreground hover:border-primary/50"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantity */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{t("products.quantityLabel")}</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-gray-100 transition-colors font-bold"
              >−</button>
              <span className="w-10 text-center font-semibold">{qty}</span>
              <span className="text-xs text-muted-foreground">{selectedUnit}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-gray-100 transition-colors font-bold"
              >+</button>
            </div>
          </div>

          {/* Shipping selector */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1">
              <Truck className="h-3.5 w-3.5" /> {t("products.shippingLabel")}
            </p>
            {/* Tab switcher */}
            <div className="flex gap-1 mb-2">
              <button
                onClick={() => { setShippingTab("service"); setSelectedShipping(null); }}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${shippingTab === "service" ? "bg-primary text-primary-foreground" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"}`}
              >
                <Layers className="h-3 w-3" /> {t("products.serviceTab")} ({serviceOpts.length})
              </button>
              <button
                onClick={() => { setShippingTab("vendor"); setSelectedShipping(null); }}
                className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium transition-all ${shippingTab === "vendor" ? "bg-primary text-primary-foreground" : "bg-gray-100 text-muted-foreground hover:bg-gray-200"}`}
              >
                <Package className="h-3 w-3" /> {t("products.courierTab")} ({vendorOpts.length})
              </button>
            </div>
            <div className="grid grid-cols-1 gap-1.5 max-h-44 overflow-y-auto pr-1">
              {shownOpts.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">{t("products.noShipping")}</p>
              )}
              {shownOpts.map((s) => (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-all text-sm ${
                    selectedShipping === s.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/40 hover:bg-gray-50"
                  }`}
                >
                  <button
                    className="flex items-center gap-2 flex-1 min-w-0"
                    onClick={() => setSelectedShipping(s.id === selectedShipping ? null : s.id)}
                  >
                    <span className="text-lg shrink-0">{s.logo}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{s.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> {s.eta}
                      </p>
                    </div>
                    <div className="text-right shrink-0 mx-1">
                      {s.fee > 0
                        ? <p className="font-semibold text-foreground text-xs">{formatIDR(s.fee)}</p>
                        : <p className="text-xs text-amber-600 font-medium">{s.note ?? "Nego"}</p>
                      }
                    </div>
                    {selectedShipping === s.id && <Check className="h-4 w-4 text-primary shrink-0" />}
                  </button>
                  {s.kind === "service" && s.serviceId != null && (
                    <a
                      href={`${import.meta.env.BASE_URL}jasa/${s.serviceId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="shrink-0 text-muted-foreground hover:text-primary transition-colors"
                      title="Lihat detail layanan"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Total preview */}
          {chosen && product.price > 0 && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 border border-border">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{t("products.subtotal")} ({qty}x)</span>
                <span>{formatIDR(product.price * qty)}</span>
              </div>
              {chosen.kind === "vendor" && (
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{t("products.freight")} ({chosen.name})</span>
                  <span>{chosen.fee > 0 ? formatIDR(chosen.fee) : t("products.negotiable")}</span>
                </div>
              )}
              {chosen.kind === "service" && (
                <p className="text-xs text-muted-foreground">{t("products.serviceNote")}</p>
              )}
            </div>
          )}

          {/* Action button */}
          <div className="mt-auto pt-2">
            <Button
              className="w-full gap-2"
              onClick={handleBuyNow}
              disabled={!chosen}
            >
              <Package className="h-4 w-4" />
              {!chosen
                ? t("products.selectShipping")
                : chosen.kind === "service"
                  ? `${t("products.proceedTo")} ${chosen.name}`
                  : t("products.proceedOrder")}
            </Button>
            {chosen?.kind === "service" && (
              <p className="text-xs text-muted-foreground text-center mt-2">
                {t("products.redirectNote")}
              </p>
            )}
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

// ── Product hero background — swap this path to change the image ───────────
const PRODUCT_HERO_BG = `${import.meta.env.BASE_URL}images/product-hero-brand.png`;

// ── Main page ──────────────────────────────────────────────────────────────
export default function Products() {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const { t } = useLanguage();

  useEffect(() => {
    fetch("/api/portal/products")
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoading(false));
  }, []);

  const allCategories = Array.from(new Set(products.flatMap((p) => p.categories)));

  const filtered = products.filter((p) => {
    const matchSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchCat = !selectedCategory || p.categories.includes(selectedCategory);
    return matchSearch && matchCat;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Hero header ─────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, #0F8FD8 0%, #14A7E8 45%, #38BDF8 100%)",
          padding: "clamp(56px, 8vw, 96px) 0 clamp(40px, 6vw, 72px)",
        }}
      >
        {/* Overlay: radial highlight + dark vignette */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            background: [
              "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.18), transparent 28%)",
              "linear-gradient(90deg, rgba(3,37,76,0.28), rgba(3,37,76,0.05))",
            ].join(", "),
            pointerEvents: "none",
          }}
        />
        {/* Overlay: subtle dot grid */}
        <div
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "radial-gradient(rgba(255,255,255,0.13) 1px, transparent 1px)",
            backgroundSize: "36px 36px",
            opacity: 0.55,
            pointerEvents: "none",
          }}
        />

        {/* Content — above overlays */}
        <div
          className="container px-4 md:px-6"
          style={{ maxWidth: "760px", position: "relative", zIndex: 1 }}
        >
          {/* Label */}
          <p
            className="font-bold uppercase mb-3"
            style={{
              fontSize: "12px",
              letterSpacing: "0.14em",
              color: "rgba(8,47,73,0.90)",
              fontWeight: 700,
            }}
          >
            {t("products.catalogLabel")}
          </p>

          {/* Title */}
          <h1
            className="font-display font-extrabold text-white mb-4"
            style={{
              fontSize: "clamp(40px, 5vw, 68px)",
              lineHeight: 1.05,
              letterSpacing: "-0.02em",
              fontWeight: 800,
              textShadow: "0 6px 20px rgba(0,0,0,0.22)",
            }}
          >
            {t("products.title")}
          </h1>

          {/* Description */}
          <p
            className="mb-8"
            style={{
              fontSize: "clamp(17px, 2vw, 22px)",
              color: "rgba(255,255,255,0.92)",
              maxWidth: "620px",
              lineHeight: 1.6,
              textShadow: "0 2px 8px rgba(3,37,76,0.18)",
            }}
          >
            {t("products.description")}
          </p>

          {/* Glassmorphism search input */}
          <div className="relative" style={{ maxWidth: "560px" }}>
            <Search
              className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ width: "18px", height: "18px", color: "rgba(255,255,255,0.85)" }}
            />
            <input
              id="product-hero-search"
              type="text"
              placeholder={t("products.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full focus:outline-none"
              style={{
                paddingLeft: "44px",
                paddingRight: "16px",
                paddingTop: "14px",
                paddingBottom: "14px",
                background: "rgba(255,255,255,0.18)",
                border: "1px solid rgba(255,255,255,0.35)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                borderRadius: "14px",
                fontSize: "15px",
                boxShadow: "0 12px 30px rgba(2,44,80,0.18)",
                color: "white",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = "0 0 0 2px rgba(255,255,255,0.50), 0 12px 30px rgba(2,44,80,0.18)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.65)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "0 12px 30px rgba(2,44,80,0.18)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.35)";
              }}
            />
            <style>{`
              #product-hero-search::placeholder { color: rgba(255,255,255,0.78); }
            `}</style>
          </div>
        </div>
      </div>

      <div className="container px-4 md:px-6 max-w-5xl mt-8">
        {/* Category filter tabs */}
        {allCategories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
            <button
              onClick={() => setSelectedCategory("")}
              className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                !selectedCategory
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-white border border-border text-foreground hover:border-primary/40"
              }`}
            >
              {t("products.all")}
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? "" : cat)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selectedCategory === cat
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-white border border-border text-foreground hover:border-primary/40"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div key={i} className="bg-white rounded-2xl animate-pulse overflow-hidden shadow-sm">
                <div className="aspect-square bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 cursor-pointer group border border-border/30"
                onClick={() => setSelectedProduct(product)}
              >
                {/* Image/carousel */}
                <div className="aspect-square w-full overflow-hidden relative bg-gray-50">
                  <CardCarousel product={product} />
                  {/* Video badge */}
                  {product.mediaItems?.some((m) => m.type === "video") && (
                    <div className="absolute bottom-2 right-2 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded-md flex items-center gap-1">
                      <Play className="h-3 w-3 fill-white" /> Video
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="p-3">
                  {product.categories.length > 0 && (
                    <p className="text-[10px] text-muted-foreground mb-1 truncate">{product.categories[0]}</p>
                  )}
                  <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug mb-2">
                    {product.name}
                  </p>
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {product.price > 0 ? (
                      <p className="text-sm font-bold text-primary">{formatIDR(product.price)}</p>
                    ) : (
                      <p className="text-xs font-semibold text-amber-600">{t("products.negotiable")}</p>
                    )}
                    {/* Unit badge */}
                    {product.unit && (
                      <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-md font-semibold">
                        /{product.unit}
                      </span>
                    )}
                    {/* Multi-unit indicator */}
                    {(product.unitOptions ?? []).length > 1 && (
                      <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-md font-medium">
                        {product.unitOptions.length} satuan
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 mt-1">
                    <div className="flex text-amber-400">
                      {[1,2,3,4,5].map((s) => <Star key={s} className="h-2.5 w-2.5 fill-current" />)}
                    </div>
                    <span className="text-[10px] text-muted-foreground">· {t("products.sold")}</span>
                  </div>
                </div>

                {/* Order button */}
                <div className="px-3 pb-3">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedProduct(product);
                    }}
                    className="w-full py-1.5 rounded-xl border border-primary text-primary text-xs font-semibold hover:bg-primary hover:text-primary-foreground transition-colors flex items-center justify-center gap-1"
                  >
                    <Package className="h-3.5 w-3.5" /> {t("products.viewOrder")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-border">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
            <h3 className="text-lg font-medium mb-2">{t("products.noProducts")}</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? t("products.tryOtherKeyword") : t("products.noProductsYet")}
            </p>
          </div>
        )}
      </div>

      {/* Product detail modal */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => { if (!open) setSelectedProduct(null); }}>
        {selectedProduct && (
          <ProductModal product={selectedProduct} onClose={() => setSelectedProduct(null)} />
        )}
      </Dialog>
    </div>
  );
}
