import { useState, useEffect, useCallback } from "react";

interface Product {
  id: number;
  name: string;
  description?: string;
  price: string;
  category: string;
  imageUrl?: string;
  isActive: boolean;
  sortOrder: number;
}

interface Settings {
  logoUrl?: string;
  storeName?: string;
}

function resolveImage(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}

function fmt(price: string | number) {
  return "Rp " + Number(price).toLocaleString("id-ID");
}

const CATEGORY_LABELS: Record<string, string> = {
  minuman: "Minuman",
  makanan: "Makanan",
  snack: "Snack",
  paket: "Paket",
  topping: "Topping",
};

const PLACEHOLDER_COLORS = [
  "from-orange-400 to-amber-500",
  "from-amber-400 to-yellow-500",
  "from-orange-500 to-red-400",
  "from-yellow-400 to-orange-400",
  "from-red-400 to-orange-400",
  "from-amber-500 to-orange-600",
];

function ProductCard({ product, colorIdx }: { product: Product; colorIdx: number }) {
  const [imgErr, setImgErr] = useState(false);
  const src = resolveImage(product.imageUrl);
  const gradient = PLACEHOLDER_COLORS[colorIdx % PLACEHOLDER_COLORS.length];

  return (
    <div className="menu-card">
      <div className="menu-card-img-wrap">
        {src && !imgErr ? (
          <img
            src={src}
            alt={product.name}
            className="menu-card-img"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className={`menu-card-placeholder bg-gradient-to-br ${gradient}`}>
            <span className="placeholder-icon">🧋</span>
          </div>
        )}
      </div>
      <div className="menu-card-body">
        <p className="menu-card-name">{product.name}</p>
        {product.description && (
          <p className="menu-card-desc">{product.description}</p>
        )}
        <p className="menu-card-price">{fmt(product.price)}</p>
      </div>
    </div>
  );
}

export default function MenuBoard() {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<Settings>({});
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    try {
      const [pRes, sRes] = await Promise.all([
        fetch("/api/pos-kasir/products"),
        fetch("/api/pos-kasir/settings"),
      ]);
      if (pRes.ok) setProducts(await pRes.json() as Product[]);
      if (sRes.ok) setSettings(await sRes.json() as Settings);
      setLastUpdated(new Date());
    } catch {
      /* silent */
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  // Clock tick every second
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const now = new Date();
  const timeStr = now.toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const dateStr = now.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const categories = Array.from(new Set(products.map((p) => p.category))).sort();
  const logoSrc = resolveImage(settings.logoUrl);
  const storeName = settings.storeName || "Thai Tea CST";

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body, html { background: #0f0a00; height: 100%; overflow: hidden; }

        .board {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: linear-gradient(160deg, #1a0e00 0%, #0f0600 40%, #1a0a00 100%);
          color: #fff;
          font-family: 'Segoe UI', system-ui, sans-serif;
          overflow: hidden;
        }

        /* ── Header ── */
        .board-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 40px;
          background: linear-gradient(90deg, #b45309 0%, #d97706 50%, #b45309 100%);
          box-shadow: 0 4px 24px rgba(180,83,9,0.5);
          flex-shrink: 0;
        }
        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
        }
        .header-logo {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          object-fit: cover;
          border: 3px solid rgba(255,255,255,0.3);
        }
        .header-logo-placeholder {
          width: 56px;
          height: 56px;
          border-radius: 50%;
          background: rgba(255,255,255,0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px;
        }
        .header-title {
          font-size: clamp(22px, 2.8vw, 36px);
          font-weight: 800;
          letter-spacing: 1px;
          text-shadow: 0 2px 8px rgba(0,0,0,0.3);
        }
        .header-subtitle {
          font-size: clamp(11px, 1.2vw, 15px);
          opacity: 0.85;
          margin-top: 2px;
        }
        .header-right {
          text-align: right;
        }
        .header-time {
          font-size: clamp(26px, 3.5vw, 48px);
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          letter-spacing: 2px;
        }
        .header-date {
          font-size: clamp(11px, 1.1vw, 14px);
          opacity: 0.85;
          margin-top: 2px;
          text-transform: capitalize;
        }

        /* ── Content ── */
        .board-content {
          flex: 1;
          overflow-y: auto;
          padding: 24px 32px;
          scrollbar-width: none;
        }
        .board-content::-webkit-scrollbar { display: none; }

        /* ── Category section ── */
        .category-section { margin-bottom: 28px; }
        .category-label {
          font-size: clamp(13px, 1.4vw, 18px);
          font-weight: 700;
          letter-spacing: 3px;
          text-transform: uppercase;
          color: #fbbf24;
          margin-bottom: 14px;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .category-label::after {
          content: '';
          flex: 1;
          height: 1px;
          background: linear-gradient(90deg, #d97706 0%, transparent 100%);
        }

        /* ── Grid ── */
        .menu-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 16px;
        }

        /* ── Card ── */
        .menu-card {
          background: linear-gradient(145deg, #1e1000 0%, #2a1500 100%);
          border: 1px solid rgba(217,119,6,0.25);
          border-radius: 16px;
          overflow: hidden;
          transition: transform 0.2s;
          box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .menu-card:hover { transform: translateY(-3px); }

        .menu-card-img-wrap {
          width: 100%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          background: #1a0e00;
        }
        .menu-card-img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .menu-card-placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .placeholder-icon {
          font-size: clamp(32px, 4vw, 56px);
          filter: drop-shadow(0 2px 8px rgba(0,0,0,0.4));
        }

        .menu-card-body {
          padding: 12px 14px 14px;
        }
        .menu-card-name {
          font-size: clamp(13px, 1.3vw, 16px);
          font-weight: 700;
          color: #fef3c7;
          line-height: 1.3;
          margin-bottom: 4px;
        }
        .menu-card-desc {
          font-size: clamp(10px, 0.9vw, 12px);
          color: #a07050;
          margin-bottom: 8px;
          line-height: 1.4;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .menu-card-price {
          font-size: clamp(15px, 1.6vw, 20px);
          font-weight: 800;
          color: #fbbf24;
          letter-spacing: 0.5px;
        }

        /* ── Footer ── */
        .board-footer {
          flex-shrink: 0;
          background: rgba(0,0,0,0.4);
          border-top: 1px solid rgba(217,119,6,0.2);
          padding: 8px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 11px;
          color: #6b4a20;
        }
        .footer-pulse {
          display: inline-block;
          width: 6px;
          height: 6px;
          background: #22c55e;
          border-radius: 50%;
          margin-right: 6px;
          animation: pulse 2s infinite;
          vertical-align: middle;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        /* ── Empty state ── */
        .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 60vh;
          color: #6b4a20;
          gap: 16px;
        }
        .empty-icon { font-size: 64px; }
        .empty-text { font-size: 18px; }
      `}</style>

      <div className="board" suppressHydrationWarning>
        {/* Header */}
        <header className="board-header">
          <div className="header-left">
            {logoSrc ? (
              <img src={logoSrc} alt="Logo" className="header-logo" />
            ) : (
              <div className="header-logo-placeholder">🧋</div>
            )}
            <div>
              <div className="header-title">{storeName}</div>
              <div className="header-subtitle">Menu &amp; Harga</div>
            </div>
          </div>
          <div className="header-right">
            <div className="header-time" suppressHydrationWarning>{tick >= 0 ? timeStr : ""}</div>
            <div className="header-date" suppressHydrationWarning>{dateStr}</div>
          </div>
        </header>

        {/* Content */}
        <main className="board-content">
          {products.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">🧋</span>
              <span className="empty-text">Memuat menu...</span>
            </div>
          ) : (
            categories.map((cat) => {
              const catProducts = products.filter((p) => p.category === cat);
              if (catProducts.length === 0) return null;
              let colorOffset = 0;
              products.forEach((p, i) => { if (p.category === cat) colorOffset = i; });
              return (
                <div key={cat} className="category-section">
                  <div className="category-label">
                    {CATEGORY_LABELS[cat] ?? cat}
                  </div>
                  <div className="menu-grid">
                    {catProducts.map((p, i) => (
                      <ProductCard key={p.id} product={p} colorIdx={colorOffset + i} />
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </main>

        {/* Footer */}
        <footer className="board-footer">
          <span>
            <span className="footer-pulse" />
            Live · Diperbarui setiap 30 detik
          </span>
          <span suppressHydrationWarning>
            Update terakhir: {lastUpdated.toLocaleTimeString("id-ID")}
          </span>
          <span>{products.length} item tersedia</span>
        </footer>
      </div>
    </>
  );
}
