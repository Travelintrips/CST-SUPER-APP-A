import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { resolveImageUrl } from "@/lib/utils";
import {
  ShoppingBag, Search, ChevronLeft, ChevronRight,
  Play, Package, Star, ArrowRight,
} from "lucide-react";

type MediaItem = { type: "image" | "video"; url: string };

interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
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
  const [, setLocation] = useLocation();

  function handleOrder() {
    const params = new URLSearchParams({
      commodity: product.name,
      productId: String(product.id),
      qty: String(qty),
      ...(product.price > 0 ? { productPrice: String(product.price) } : {}),
    });
    onClose();
    setLocation(`/book?${params.toString()}`);
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

          {/* Rating (decorative) */}
          <div className="flex items-center gap-2 text-sm">
            <div className="flex text-amber-400">
              {[1,2,3,4,5].map((s) => <Star key={s} className="h-4 w-4 fill-current" />)}
            </div>
            <span className="text-muted-foreground">5.0</span>
            <span className="text-muted-foreground">· Terjual 100+</span>
          </div>

          {/* Price */}
          <div className="bg-primary/5 rounded-xl px-4 py-3 border border-primary/10">
            {product.price > 0 ? (
              <p className="text-2xl font-bold text-primary">{formatIDR(product.price)}</p>
            ) : (
              <p className="text-lg font-semibold text-amber-600">Harga Negosiasi</p>
            )}
          </div>

          {/* Description */}
          {product.description && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Deskripsi</p>
              <p className="text-sm text-foreground leading-relaxed">{product.description}</p>
            </div>
          )}

          {/* Quantity */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Jumlah</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-gray-100 transition-colors font-bold"
              >−</button>
              <span className="w-10 text-center font-semibold">{qty}</span>
              <button
                onClick={() => setQty((q) => q + 1)}
                className="w-8 h-8 rounded-lg border border-border flex items-center justify-center hover:bg-gray-100 transition-colors font-bold"
              >+</button>
            </div>
          </div>

          {/* Price estimate */}
          {product.price > 0 && (
            <div className="bg-gray-50 rounded-xl px-4 py-3 border border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal Produk</span>
                <span className="font-bold text-primary">{formatIDR(product.price * qty)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                + Biaya jasa &amp; pengiriman dipilih di langkah berikutnya
              </p>
            </div>
          )}

          {/* Action button */}
          <div className="mt-auto pt-2 space-y-2">
            <Button className="w-full gap-2" onClick={handleOrder}>
              <Package className="h-4 w-4" />
              Pesan Sekarang
              <ArrowRight className="h-4 w-4 ml-auto" />
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Pilih layanan &amp; jasa pengiriman di langkah berikutnya
            </p>
          </div>
        </div>
      </div>
    </DialogContent>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Products() {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");

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
      {/* Hero header */}
      <div className="bg-primary text-primary-foreground py-14 md:py-20">
        <div className="container px-4 md:px-6 max-w-5xl">
          <p className="text-accent font-semibold text-xs uppercase tracking-widest mb-2">Katalog Produk</p>
          <h1 className="text-3xl md:text-4xl font-display font-bold mb-3">Produk Kami</h1>
          <p className="text-primary-foreground/70 mb-6 text-sm max-w-xl">
            Temukan berbagai produk berkualitas untuk kebutuhan bisnis Anda.
          </p>
          <div className="relative max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary-foreground/50" />
            <Input
              type="text"
              placeholder="Cari produk atau kategori..."
              className="w-full pl-9 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-accent"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
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
              Semua
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
                  {product.price > 0 ? (
                    <p className="text-sm font-bold text-primary">{formatIDR(product.price)}</p>
                  ) : (
                    <p className="text-xs font-semibold text-amber-600">Harga Negosiasi</p>
                  )}
                  <div className="flex items-center gap-1 mt-1.5">
                    <div className="flex text-amber-400">
                      {[1,2,3,4,5].map((s) => <Star key={s} className="h-2.5 w-2.5 fill-current" />)}
                    </div>
                    <span className="text-[10px] text-muted-foreground">· Terjual 100+</span>
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
                    <Package className="h-3.5 w-3.5" /> Lihat &amp; Pesan
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-border">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
            <h3 className="text-lg font-medium mb-2">Tidak ada produk</h3>
            <p className="text-muted-foreground text-sm">
              {searchQuery ? "Coba kata kunci yang berbeda." : "Belum ada produk yang tersedia."}
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
