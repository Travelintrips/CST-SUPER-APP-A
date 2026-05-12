import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resolveImageUrl } from "@/lib/utils";
import { getProductFallbackImage } from "@/lib/categoryImages";
import {
  ShoppingBag, Search, ChevronLeft, ChevronRight,
  Play, Package, Star, Clock, Check, Layers, ExternalLink, Truck, ArrowRight,
} from "lucide-react";
import { Link } from "wouter";
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
  subcategory: string | null;
  imageUrl: string | null;
  mediaItems: MediaItem[];
  categories: string[];
}


const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

const formatUSD = (v: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);

function isUsdProduct(product: Product): boolean {
  return product.subcategory === "Green Bean";
}

// ── USD/IDR exchange rate — cached in localStorage for 6 h ─────────────────
const _USD_IDR_KEY = "cst_usd_idr_rate";
const _USD_IDR_TTL = 6 * 60 * 60 * 1000;
const _USD_IDR_FALLBACK = 16_300;

function _readCachedRate(): { rate: number; fresh: boolean } {
  try {
    const raw = localStorage.getItem(_USD_IDR_KEY);
    if (raw) {
      const { rate, ts } = JSON.parse(raw) as { rate: number; ts: number };
      if (rate > 1000) return { rate, fresh: Date.now() - ts < _USD_IDR_TTL };
    }
  } catch { /* ignore */ }
  return { rate: _USD_IDR_FALLBACK, fresh: false };
}

function useUsdIdrRate(): number {
  const [rate, setRate] = useState<number>(() => _readCachedRate().rate);
  useEffect(() => {
    const { fresh } = _readCachedRate();
    if (fresh) return;
    fetch("https://open.er-api.com/v6/latest/USD")
      .then((r) => r.json())
      .then((data) => {
        const idr = (data?.rates?.IDR as number) ?? 0;
        if (idr > 1000) {
          localStorage.setItem(_USD_IDR_KEY, JSON.stringify({ rate: idr, ts: Date.now() }));
          setRate(idr);
        }
      })
      .catch(() => { /* keep fallback */ });
  }, []);
  return rate;
}

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
  const [imgFailed, setImgFailed] = useState(false);
  const fallbackSrc = getProductFallbackImage(product.categories, product.name, product.subcategory);

  if (media.length === 0) {
    return (
      <img
        src={fallbackSrc}
        alt={product.name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
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
          src={imgFailed ? fallbackSrc : (resolveImageUrl(current.url) ?? fallbackSrc)}
          alt={product.name}
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            if (!imgFailed) {
              setImgFailed(true);
              (e.currentTarget as HTMLImageElement).src = fallbackSrc;
            }
          }}
          loading="lazy"
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
  const [galleryFailed, setGalleryFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fallbackSrc = getProductFallbackImage(product.categories, product.name, product.subcategory);

  const current = media[idx];
  const isVideo = current?.type === "video";
  const videoSrc = isVideo ? (resolveImageUrl(current.url) ?? null) : null;
  const videoPoster = useVideoThumbnail(videoSrc);

  function prev() { setIdx((i) => (i - 1 + media.length) % media.length); setPlaying(false); setGalleryFailed(false); }
  function next() { setIdx((i) => (i + 1) % media.length); setPlaying(false); setGalleryFailed(false); }

  if (media.length === 0) {
    return (
      <div className="w-full aspect-square rounded-xl overflow-hidden">
        <img src={fallbackSrc} alt={product.name} className="w-full h-full object-cover" />
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
            src={galleryFailed ? fallbackSrc : (resolveImageUrl(current.url) ?? fallbackSrc)}
            alt={product.name}
            className="w-full h-full object-contain"
            onError={(e) => {
              if (!galleryFailed) {
                setGalleryFailed(true);
                (e.currentTarget as HTMLImageElement).src = fallbackSrc;
              }
            }}
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
  const usdIdrRate = useUsdIdrRate();

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
              <div>
                {isUsdProduct(product) ? (
                  <>
                    <p className="text-2xl font-bold text-primary">USD {product.price.toLocaleString()}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">≈ {formatIDR(Math.round(product.price * usdIdrRate))}</p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-primary">{formatIDR(product.price)}</p>
                    <p className="text-sm text-muted-foreground mt-0.5">≈ {formatUSD(product.price / usdIdrRate)}</p>
                  </>
                )}
              </div>
            ) : (
              <p className="text-lg font-semibold text-amber-600">{t("products.negotiable")}</p>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t("products.descriptionLabel")}</p>
              <pre className="text-sm text-foreground leading-relaxed whitespace-pre-wrap font-sans">{product.description}</pre>
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
                <span>{isUsdProduct(product) ? `USD ${product.price * qty}` : formatIDR(product.price * qty)}</span>
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
  const usdIdrRate = useUsdIdrRate();

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
    <div className="min-h-screen pb-24" style={{ background: "linear-gradient(180deg,#F1F5F9 0%,#F8FAFC 100%)" }}>

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden"
        style={{
          backgroundImage: [
            "linear-gradient(105deg,rgba(7,17,36,0.85) 0%,rgba(11,92,173,0.78) 38%,rgba(29,111,216,0.52) 68%,rgba(14,165,233,0.28) 100%)",
            `url(${PRODUCT_HERO_BG})`,
          ].join(", "),
          backgroundSize: "cover",
          backgroundPosition: "center 40%",
          backgroundRepeat: "no-repeat",
          padding: "clamp(68px,9vw,112px) 0 clamp(56px,7.5vw,96px)",
        }}
      >
        {/* bottom fade into page bg */}
        <div
          className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
          style={{ background: "linear-gradient(to bottom,transparent,rgba(241,245,249,0.28))" }}
        />

        <div className="mx-auto px-6 md:px-10" style={{ maxWidth: "900px" }}>
          {/* Eyebrow */}
          <div className="flex items-center gap-2.5 mb-5">
            <div className="h-px w-10 rounded-full" style={{ background: "rgba(255,255,255,0.45)" }} />
            <p className="font-bold uppercase text-white/80" style={{ fontSize: "11.5px", letterSpacing: "0.20em" }}>
              {t("products.catalogLabel")}
            </p>
          </div>

          {/* Title */}
          <h1
            className="font-display font-extrabold text-white mb-5"
            style={{
              fontSize: "clamp(36px,5.5vw,74px)",
              lineHeight: 1.04,
              letterSpacing: "-0.026em",
              textShadow: "0 4px 28px rgba(7,17,36,0.32)",
            }}
          >
            {t("products.title")}
          </h1>

          {/* Desc */}
          <p
            className="mb-10"
            style={{
              fontSize: "clamp(15px,1.85vw,19px)",
              color: "rgba(255,255,255,0.87)",
              maxWidth: "590px",
              lineHeight: 1.72,
              textShadow: "0 2px 10px rgba(7,17,36,0.22)",
            }}
          >
            {t("products.description")}
          </p>

          {/* Search */}
          <div className="relative" style={{ maxWidth: "600px" }}>
            <Search
              className="absolute left-5 top-1/2 -translate-y-1/2 pointer-events-none"
              style={{ width: "17px", height: "17px", color: "rgba(255,255,255,0.65)" }}
            />
            <input
              type="text"
              placeholder={t("products.search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full focus:outline-none"
              style={{
                paddingLeft: "50px",
                paddingRight: "22px",
                paddingTop: "16px",
                paddingBottom: "16px",
                background: "rgba(255,255,255,0.12)",
                border: "1.5px solid rgba(255,255,255,0.30)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
                borderRadius: "20px",
                fontSize: "15px",
                boxShadow: "0 4px 22px rgba(7,17,36,0.20),inset 0 1px 0 rgba(255,255,255,0.09)",
                color: "white",
                transition: "border-color 0.18s,box-shadow 0.18s,background 0.18s",
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = "0 0 0 2.5px rgba(255,255,255,0.48),0 4px 22px rgba(7,17,36,0.20)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.68)";
                e.currentTarget.style.background = "rgba(255,255,255,0.17)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = "0 4px 22px rgba(7,17,36,0.20),inset 0 1px 0 rgba(255,255,255,0.09)";
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.30)";
                e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              }}
            />
            <style>{`input[type="text"]::placeholder{color:rgba(255,255,255,0.50);}`}</style>
          </div>
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="mx-auto px-4 md:px-6 lg:px-10 mt-10" style={{ maxWidth: "1320px" }}>

        {/* CTA Banner — redirect ke Jasa/Services */}
        <div
          className="flex items-center justify-between gap-4 px-5 py-4 rounded-2xl mb-8"
          style={{
            background: "linear-gradient(135deg,rgba(14,165,233,0.08) 0%,rgba(11,92,173,0.06) 100%)",
            border: "1.5px solid rgba(14,165,233,0.20)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(14,165,233,0.12)" }}
            >
              <Truck className="h-4.5 w-4.5 text-sky-600" style={{ width: "18px", height: "18px" }} />
            </div>
            <div>
              <p className="text-[13.5px] font-semibold text-slate-800 leading-tight">
                Ingin memesan layanan pengiriman?
              </p>
              <p className="text-[12px] text-slate-500 mt-0.5">
                Temukan layanan Freight, Trucking, dan lainnya di halaman Jasa/Services.
              </p>
            </div>
          </div>
          <Link href="/jasa">
            <button
              className="shrink-0 flex items-center gap-1.5 font-semibold whitespace-nowrap transition-all duration-200"
              style={{
                padding: "9px 18px",
                borderRadius: "12px",
                fontSize: "13px",
                background: "linear-gradient(135deg,#0B5CAD 0%,#0EA5E9 100%)",
                color: "white",
                boxShadow: "0 2px 10px rgba(11,92,173,0.25)",
                border: "none",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 4px 16px rgba(11,92,173,0.38)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.boxShadow = "0 2px 10px rgba(11,92,173,0.25)"; }}
            >
              Lihat Jasa/Services <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </Link>
        </div>

        {/* Category filter chips */}
        {allCategories.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1 mb-8" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setSelectedCategory("")}
              className="shrink-0 font-semibold transition-all duration-200"
              style={{
                padding: "8px 20px",
                borderRadius: "999px",
                fontSize: "13px",
                ...(!selectedCategory
                  ? {
                      background: "#0B5CAD",
                      color: "white",
                      boxShadow: "0 3px 10px rgba(11,92,173,0.32)",
                      border: "1.5px solid #0B5CAD",
                    }
                  : {
                      background: "white",
                      color: "#475569",
                      border: "1.5px solid #E2E8F0",
                      boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
                    }),
              }}
            >
              {t("products.all")}
            </button>
            {allCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? "" : cat)}
                className="shrink-0 font-semibold transition-all duration-200"
                style={{
                  padding: "8px 20px",
                  borderRadius: "999px",
                  fontSize: "13px",
                  ...(selectedCategory === cat
                    ? {
                        background: "#0B5CAD",
                        color: "white",
                        boxShadow: "0 3px 10px rgba(11,92,173,0.32)",
                        border: "1.5px solid #0B5CAD",
                      }
                    : {
                        background: "white",
                        color: "#475569",
                        border: "1.5px solid #E2E8F0",
                        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
                      }),
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        {/* Product grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {[1,2,3,4,5,6,7,8].map((i) => (
              <div key={i} className="bg-white rounded-2xl animate-pulse overflow-hidden" style={{ boxShadow: "0 1px 4px rgba(15,23,42,0.07)" }}>
                <div className="bg-slate-200" style={{ aspectRatio: "4/3" }} />
                <div className="p-4 space-y-3">
                  <div className="h-2.5 bg-slate-200 rounded-full w-1/3" />
                  <div className="h-4 bg-slate-200 rounded-lg w-4/5" />
                  <div className="h-4 bg-slate-200 rounded-lg w-3/5" />
                  <div className="h-7 bg-slate-200 rounded-lg w-2/3" />
                  <div className="h-9 bg-slate-200 rounded-xl" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="group bg-white rounded-2xl overflow-hidden cursor-pointer flex flex-col"
                style={{
                  border: "1px solid #E2E8F0",
                  boxShadow: "0 1px 4px rgba(15,23,42,0.06)",
                  transition: "box-shadow 0.22s,border-color 0.22s,transform 0.22s",
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = "0 12px 36px rgba(11,92,173,0.15),0 2px 8px rgba(15,23,42,0.08)";
                  el.style.borderColor = "#BFDBFE";
                  el.style.transform = "translateY(-3px)";
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLElement;
                  el.style.boxShadow = "0 1px 4px rgba(15,23,42,0.06)";
                  el.style.borderColor = "#E2E8F0";
                  el.style.transform = "translateY(0)";
                }}
                onClick={() => setSelectedProduct(product)}
              >
                {/* Image */}
                <div className="w-full overflow-hidden relative bg-slate-100" style={{ aspectRatio: "4/3" }}>
                  <CardCarousel product={product} />
                  {/* Video badge */}
                  {product.mediaItems?.some((m) => m.type === "video") && (
                    <div className="absolute bottom-2.5 right-2.5 bg-black/60 text-white text-[10px] px-2 py-0.5 rounded-md flex items-center gap-1 backdrop-blur-sm">
                      <Play className="h-2.5 w-2.5 fill-white" /> Video
                    </div>
                  )}
                  {/* Category floating badge */}
                  {product.categories.length > 0 && (
                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className="text-[10px] font-semibold text-slate-700 backdrop-blur-sm"
                        style={{
                          background: "rgba(255,255,255,0.90)",
                          padding: "3px 9px",
                          borderRadius: "999px",
                          boxShadow: "0 1px 4px rgba(15,23,42,0.12)",
                        }}
                      >
                        {product.categories[0]}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="px-4 pt-3.5 pb-0 flex-1 flex flex-col">
                  {/* Product name */}
                  <p className="text-[13.5px] font-semibold text-slate-800 line-clamp-2 leading-snug mb-1.5" style={{ minHeight: "2.5rem" }}>
                    {product.name}
                  </p>

                  {/* Short description */}
                  {product.description && (
                    <p className="text-[11.5px] text-slate-500 leading-snug line-clamp-2 mb-2">
                      {product.description.split("\n")[0]}
                    </p>
                  )}

                  {/* Price */}
                  <div className="mb-2">
                    {product.price > 0 ? (
                      <>
                        <div className="flex items-baseline gap-1.5">
                          <span className="font-bold text-[#0B5CAD]" style={{ fontSize: "15px", lineHeight: 1 }}>
                            {isUsdProduct(product)
                              ? `USD ${product.price.toLocaleString()}`
                              : formatIDR(product.price)}
                          </span>
                          {product.unit && (
                            <span className="text-[10.5px] text-slate-400 font-medium">/{product.unit}</span>
                          )}
                          {(product.unitOptions ?? []).length > 1 && (
                            <span
                              className="ml-auto text-[10px] font-semibold text-amber-700"
                              style={{
                                background: "#FFFBEB",
                                border: "1px solid #FCD34D",
                                padding: "1.5px 6px",
                                borderRadius: "5px",
                              }}
                            >
                              {product.unitOptions.length} satuan
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-none">
                          {isUsdProduct(product)
                            ? `≈ ${formatIDR(Math.round(product.price * usdIdrRate))}`
                            : `≈ ${formatUSD(product.price / usdIdrRate)}`}
                        </p>
                      </>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <p className="text-sm font-bold text-amber-600 leading-none">{t("products.negotiable")}</p>
                        {product.unit && (
                          <span className="text-[10.5px] text-slate-400 font-medium">/{product.unit}</span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Rating */}
                  <div className="flex items-center gap-1.5 mb-3.5">
                    <div className="flex text-amber-400">
                      {[1,2,3,4,5].map((s) => <Star key={s} className="h-2.5 w-2.5 fill-current" />)}
                    </div>
                    <span className="text-[10px] text-slate-400">· {t("products.sold")}</span>
                  </div>
                </div>

                {/* CTA button */}
                <div className="px-4 pb-4">
                  <button
                    onClick={(e) => { e.stopPropagation(); setSelectedProduct(product); }}
                    className="w-full font-bold flex items-center justify-center gap-1.5 transition-all duration-200"
                    style={{
                      padding: "10px 0",
                      borderRadius: "12px",
                      fontSize: "13px",
                      background: "linear-gradient(135deg,#0B5CAD 0%,#1D6FD8 100%)",
                      color: "white",
                      boxShadow: "0 2px 10px rgba(11,92,173,0.30)",
                      border: "none",
                    }}
                    onMouseEnter={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "linear-gradient(135deg,#0A4F98 0%,#1761C0 100%)";
                      el.style.boxShadow = "0 4px 16px rgba(11,92,173,0.42)";
                      el.style.transform = "translateY(-1px)";
                    }}
                    onMouseLeave={(e) => {
                      const el = e.currentTarget as HTMLElement;
                      el.style.background = "linear-gradient(135deg,#0B5CAD 0%,#1D6FD8 100%)";
                      el.style.boxShadow = "0 2px 10px rgba(11,92,173,0.30)";
                      el.style.transform = "translateY(0)";
                    }}
                  >
                    <ShoppingBag className="h-3.5 w-3.5" /> {t("products.viewOrder")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div
            className="text-center py-24 bg-white rounded-2xl"
            style={{ border: "1.5px dashed #CBD5E1", boxShadow: "0 1px 4px rgba(15,23,42,0.05)" }}
          >
            <img
              src={`${import.meta.env.BASE_URL}images/logo.png`}
              alt="CST Logistics"
              className="h-14 w-auto mx-auto mb-5 object-contain opacity-30"
            />
            <h3 className="text-[17px] font-semibold text-slate-700 mb-2">{t("products.noProducts")}</h3>
            <p className="text-slate-400 text-sm max-w-xs mx-auto">
              {searchQuery ? t("products.tryOtherKeyword") : t("products.noProductsYet")}
            </p>
          </div>
        )}
        {/* ── CTA — Pemesanan Jasa ──────────────────────────────────── */}
        <div
          className="mt-14 mb-2 rounded-2xl overflow-hidden flex flex-col sm:flex-row items-center justify-between gap-5 px-7 py-6"
          style={{
            background: "linear-gradient(110deg,#0B5CAD 0%,#1D6FD8 60%,#0EA5E9 100%)",
            boxShadow: "0 8px 32px rgba(11,92,173,0.22)",
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="shrink-0 flex items-center justify-center rounded-xl"
              style={{ width: 48, height: 48, background: "rgba(255,255,255,0.18)" }}
            >
              <Truck className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-[15px] leading-snug">
                Ingin memesan layanan pengiriman?
              </p>
              <p className="text-blue-100 text-[13px] mt-0.5">
                Pilih jasa pengiriman kami — Domestik, Trucking, Freight &amp; Customs.
              </p>
            </div>
          </div>
          <a
            href={`${import.meta.env.BASE_URL}jasa`}
            className="shrink-0 flex items-center gap-2 font-semibold text-[13.5px] rounded-xl px-5 py-2.5 transition-all duration-200 whitespace-nowrap"
            style={{
              background: "rgba(255,255,255,0.18)",
              color: "white",
              border: "1.5px solid rgba(255,255,255,0.32)",
              backdropFilter: "blur(8px)",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.28)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.18)"; }}
          >
            Buka Jasa/Services
            <ChevronRight className="h-4 w-4" />
          </a>
        </div>
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
