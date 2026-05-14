import { useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { getKasirProfile, isKasirLoggedIn, removeKasirToken, kasirFetch, type KasirProfile } from "@/lib/kasirAuth";

interface Product {
  id: number;
  name: string;
  price: string;
  category: string;
  description?: string;
  imageUrl?: string;
  isActive: boolean;
}

interface CartItem {
  product: Product;
  qty: number;
}

interface Order {
  id: number;
  orderNumber: string;
  total: string;
  discount?: string;
  amountPaid?: string;
  change?: string;
  status: string;
  paymentMethod?: string;
  paidAt?: string;
  createdAt: string;
}

interface StockItem {
  id: number;
  name: string;
  unit: string;
  currentStock: string;
  minStock: string;
}

type Tab = "pos" | "history" | "stock";
type PaymentMethod = "cash" | "qris" | "debit" | "credit" | "transfer";

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Tunai", qris: "QRIS", debit: "Debit", credit: "Kredit", transfer: "Transfer",
};

const PAYMENT_ICONS: Record<PaymentMethod, string> = {
  cash: "💵", qris: "📱", debit: "💳", credit: "💳", transfer: "🏦",
};

const MENU_IMAGES: Record<string, string> = {
  "Thai Tea Original":    "/menu/thai-tea-original.png",
  "Thai Tea Cheese":      "/menu/thai-tea-cheese.png",
  "Thai Tea Brown Sugar": "/menu/thai-tea-brown-sugar.png",
  "Thai Tea Taro":        "/menu/thai-tea-taro.png",
  "Thai Tea Matcha":      "/menu/thai-tea-matcha.png",
  "Thai Tea Pandan":      "/menu/thai-tea-pandan.png",
  "Milk Tea Original":    "/menu/milk-tea-original.png",
  "Boba Thai Tea":        "/menu/boba-thai-tea.png",
  "Thai Tea Large":       "/menu/thai-tea-large.png",
  "Snack Roti Bakar":     "/menu/roti-bakar.png",
};

function getMenuImage(name: string): string {
  return MENU_IMAGES[name] ?? "/menu/thai-tea-original.png";
}

function fmt(n: number | string) {
  return "Rp " + Number(n).toLocaleString("id-ID");
}

export default function KasirPage() {
  const [, setLocation] = useLocation();
  const [profile, setProfile] = useState<KasirProfile | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("pos");

  // POS state
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  const [discount, setDiscount] = useState("0");
  const [checkingOut, setCheckingOut] = useState(false);
  const [receipt, setReceipt] = useState<(Order & { items: Array<{ productName: string; qty: number; price: string; subtotal: string }> }) | null>(null);
  const [cartOpen, setCartOpen] = useState(false); // for mobile cart drawer
  const [selectedCat, setSelectedCat] = useState<string>("all");

  // History
  const [orders, setOrders] = useState<Order[]>([]);

  // Stock
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stockAdjust, setStockAdjust] = useState<{ id: number | null; delta: string; reason: string }>({ id: null, delta: "0", reason: "" });

  const cartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isKasirLoggedIn()) { setLocation("/kasir/login"); return; }
    setProfile(getKasirProfile());
    loadProducts();
  }, [setLocation]);

  const loadProducts = async () => {
    try {
      const res = await kasirFetch("/api/pos-kasir/products");
      if (res.ok) setProducts(await res.json() as Product[]);
    } catch { /* skip */ }
  };

  const loadOrders = useCallback(async () => {
    try {
      const res = await kasirFetch("/api/pos-kasir/orders/today");
      if (res.ok) setOrders(await res.json() as Order[]);
    } catch { /* skip */ }
  }, []);

  const loadStocks = useCallback(async () => {
    try {
      const res = await kasirFetch("/api/pos-kasir/stock");
      if (res.ok) setStocks(await res.json() as StockItem[]);
    } catch { /* skip */ }
  }, []);

  useEffect(() => {
    if (activeTab === "history") loadOrders();
    if (activeTab === "stock") loadStocks();
  }, [activeTab, loadOrders, loadStocks]);

  const addToCart = (product: Product) => {
    setCart((prev) => {
      const existing = prev.find((c) => c.product.id === product.id);
      if (existing) return prev.map((c) => c.product.id === product.id ? { ...c, qty: c.qty + 1 } : c);
      return [...prev, { product, qty: 1 }];
    });
  };

  const changeQty = (productId: number, delta: number) => {
    setCart((prev) => prev.map((c) => c.product.id === productId ? { ...c, qty: c.qty + delta } : c).filter((c) => c.qty > 0));
  };

  const clearCart = () => setCart([]);

  const subtotal = cart.reduce((s, c) => s + Number(c.product.price) * c.qty, 0);
  const discountAmt = Number(discount) || 0;
  const total = Math.max(0, subtotal - discountAmt);
  const change = payMethod === "cash" ? (Number(amountPaid) || 0) - total : 0;
  const cartCount = cart.reduce((s, c) => s + c.qty, 0);

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      const orderRes = await kasirFetch("/api/pos-kasir/orders", {
        method: "POST",
        body: JSON.stringify({ items: cart.map((c) => ({ productId: c.product.id, qty: c.qty })), discount: discountAmt }),
      });
      if (!orderRes.ok) { alert("Gagal membuat order"); return; }
      const order = await orderRes.json() as Order & { items: Array<{ productName: string; qty: number; price: string; subtotal: string }> };

      const payRes = await kasirFetch(`/api/pos-kasir/orders/${order.id}/pay`, {
        method: "PATCH",
        body: JSON.stringify({ paymentMethod: payMethod, amountPaid: payMethod === "cash" ? Number(amountPaid) : total }),
      });
      if (!payRes.ok) { alert("Gagal memproses pembayaran"); return; }
      const paidOrder = await payRes.json() as typeof order;
      setReceipt(paidOrder);
      setCart([]);
      setAmountPaid("");
      setDiscount("0");
      setCartOpen(false);
    } catch {
      alert("Terjadi kesalahan, coba lagi");
    } finally {
      setCheckingOut(false);
    }
  };

  const handleAdjustStock = async (stockId: number) => {
    const delta = Number(stockAdjust.delta);
    if (!delta) return;
    try {
      const res = await kasirFetch("/api/pos-kasir/stock/adjust", {
        method: "POST",
        body: JSON.stringify({ stockItemId: stockId, delta, reason: stockAdjust.reason }),
      });
      if (res.ok) { await loadStocks(); setStockAdjust({ id: null, delta: "0", reason: "" }); }
    } catch { /* skip */ }
  };

  const categories = ["all", ...Array.from(new Set(products.map((p) => p.category)))];

  const filteredProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCat = selectedCat === "all" || p.category === selectedCat;
    return matchSearch && matchCat;
  });

  const handleLogout = () => { removeKasirToken(); setLocation("/kasir/login"); };
  const printReceipt = () => window.print();

  // ── Receipt modal ─────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 print:bg-white print:p-0">
        <div className="bg-white rounded-3xl shadow-2xl w-full max-w-xs overflow-hidden print:shadow-none print:rounded-none print:max-w-full">
          {/* Receipt header */}
          <div className="p-6 text-center" style={{ background: "linear-gradient(135deg, #ff8c00, #e05500)" }}>
            <img src="/thai-tea-cst-logo.jpeg" alt="Thai Tea CST" className="w-16 h-16 rounded-2xl object-cover mx-auto mb-3 shadow-lg border-2 border-white/30" />
            <h2 className="font-black text-xl text-white">Thai Tea CST</h2>
            <p className="text-orange-100 text-xs mt-0.5">Struk Pembayaran</p>
          </div>
          {/* Order info */}
          <div className="px-5 py-3 bg-orange-50 border-b border-orange-100 flex justify-between text-xs text-orange-700">
            <span className="font-mono font-bold">{receipt.orderNumber}</span>
            <span>{new Date(receipt.paidAt ?? receipt.createdAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          </div>

          <div className="p-5 space-y-2.5">
            {receipt.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-gray-700">{item.productName} <span className="text-gray-400">×{item.qty}</span></span>
                <span className="font-semibold text-gray-800">{fmt(item.subtotal)}</span>
              </div>
            ))}

            <div className="border-t border-dashed border-gray-200 pt-2.5 space-y-1.5">
              {Number(receipt.discount ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Diskon</span>
                  <span>-{fmt(receipt.discount ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-base">
                <span>Total</span>
                <span className="text-orange-600">{fmt(receipt.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>{PAYMENT_LABELS[receipt.paymentMethod as PaymentMethod] ?? receipt.paymentMethod}</span>
                <span>{fmt(receipt.amountPaid ?? receipt.total)}</span>
              </div>
              {Number(receipt.change ?? 0) > 0 && (
                <div className="flex justify-between text-sm font-bold text-blue-600 bg-blue-50 rounded-xl px-3 py-1.5">
                  <span>Kembalian</span>
                  <span>{fmt(receipt.change ?? 0)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 pb-2 text-center text-xs text-gray-300 print:block hidden">
            Terima kasih sudah berbelanja! 🧡
          </div>
          <div className="p-4 flex gap-2 print:hidden">
            <button onClick={printReceipt}
              className="flex-1 py-3 rounded-2xl font-bold text-white text-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
              style={{ background: "linear-gradient(135deg, #ff8c00, #e05500)" }}>
              🖨️ Cetak
            </button>
            <button onClick={() => setReceipt(null)}
              className="flex-1 py-3 bg-gray-100 text-gray-600 rounded-2xl font-bold text-sm hover:bg-gray-200 transition-all active:scale-95">
              Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col print:hidden">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 shadow-md" style={{ background: "linear-gradient(135deg, #ff8c00, #e05500)" }}>
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <img src="/thai-tea-cst-logo.jpeg" alt="Thai Tea CST" className="w-10 h-10 rounded-xl object-cover border-2 border-white/30" />
            <div>
              <h1 className="font-black text-white text-base leading-tight">Thai Tea CST</h1>
              <p className="text-orange-100 text-xs">{profile?.name}</p>
            </div>
          </div>
          <button onClick={handleLogout}
            className="text-xs font-bold bg-white/20 hover:bg-white/30 text-white px-3 py-1.5 rounded-xl transition-all">
            Keluar
          </button>
        </div>

        {/* Tab bar */}
        <div className="flex border-t border-white/10">
          {([
            { id: "pos" as Tab, label: "Kasir", icon: "🛒" },
            { id: "history" as Tab, label: "Riwayat", icon: "📋" },
            { id: "stock" as Tab, label: "Stok", icon: "📦" },
          ]).map((t) => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                activeTab === t.id
                  ? "text-white border-b-2 border-white"
                  : "text-orange-200 hover:text-white"
              }`}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </header>

      {/* ── POS Tab ─────────────────────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 112px)" }}>
          {/* Product panel */}
          <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
            {/* Search + category filter */}
            <div className="p-3 bg-white border-b border-gray-100 space-y-2 shadow-sm">
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-300 text-sm">🔍</span>
                <input
                  value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari menu..."
                  className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:bg-white transition-all placeholder-gray-300"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
                {categories.map((cat) => (
                  <button key={cat} onClick={() => setSelectedCat(cat)}
                    className={`flex-shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold capitalize transition-all ${
                      selectedCat === cat
                        ? "text-white shadow-md"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                    style={selectedCat === cat ? { background: "linear-gradient(135deg, #ff8c00, #e05500)" } : {}}>
                    {cat === "all" ? "Semua" : cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid produk */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
                {filteredProducts.map((p) => {
                  const inCart = cart.find((c) => c.product.id === p.id);
                  return (
                    <button key={p.id} onClick={() => addToCart(p)}
                      className={`bg-white rounded-2xl overflow-hidden text-left transition-all duration-150 active:scale-95 relative ${
                        inCart ? "ring-2 ring-orange-400 shadow-lg" : "shadow-sm hover:shadow-md"
                      }`}>
                      {inCart && (
                        <div className="absolute top-2 right-2 z-10 w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-black shadow-lg"
                          style={{ background: "#ff6b00" }}>
                          {inCart.qty}
                        </div>
                      )}
                      <div className="w-full aspect-square overflow-hidden bg-orange-50">
                        <img
                          src={p.imageUrl ?? getMenuImage(p.name)}
                          alt={p.name}
                          className="w-full h-full object-cover"
                          onError={(e) => { (e.target as HTMLImageElement).src = "/menu/thai-tea-original.png"; }}
                        />
                      </div>
                      <div className="p-2.5">
                        <p className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">{p.name}</p>
                        <p className="text-xs font-black mt-1" style={{ color: "#ff6b00" }}>{fmt(p.price)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
              {filteredProducts.length === 0 && (
                <div className="text-center py-16 text-gray-300">
                  <div className="text-4xl mb-2">🔍</div>
                  <p className="text-sm">Menu tidak ditemukan</p>
                </div>
              )}
            </div>
          </div>

          {/* ── Cart panel — desktop ─────────────────────────────────────── */}
          <div className="hidden lg:flex w-80 bg-white border-l border-gray-100 flex-col shadow-xl">
            <CartPanel
              cart={cart} payMethod={payMethod} setPayMethod={setPayMethod}
              amountPaid={amountPaid} setAmountPaid={setAmountPaid}
              discount={discount} setDiscount={setDiscount}
              subtotal={subtotal} discountAmt={discountAmt} total={total} change={change}
              changeQty={changeQty} clearCart={clearCart}
              handleCheckout={handleCheckout} checkingOut={checkingOut}
            />
          </div>
        </div>
      )}

      {/* ── History Tab ──────────────────────────────────────────────────── */}
      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-black text-gray-800 text-lg">Transaksi Hari Ini</h2>
            <button onClick={loadOrders} className="text-xs font-bold text-orange-500 hover:underline">↺ Refresh</button>
          </div>
          {orders.length === 0 ? (
            <div className="text-center py-20 text-gray-300">
              <div className="text-5xl mb-3">📋</div>
              <p>Belum ada transaksi hari ini</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Summary card */}
              <div className="rounded-2xl p-4 mb-4 text-white"
                style={{ background: "linear-gradient(135deg, #ff8c00, #e05500)" }}>
                <p className="text-xs text-orange-100 font-bold uppercase tracking-wide mb-1">Total Pendapatan Hari Ini</p>
                <p className="text-3xl font-black">
                  {fmt(orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.total), 0))}
                </p>
                <p className="text-orange-100 text-xs mt-1">
                  {orders.filter((o) => o.status === "paid").length} transaksi berhasil
                </p>
              </div>

              {orders.map((o) => (
                <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-mono text-gray-400">{o.orderNumber}</p>
                    <p className="font-black text-gray-800">{fmt(o.total)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {PAYMENT_ICONS[o.paymentMethod as PaymentMethod] ?? ""} {PAYMENT_LABELS[o.paymentMethod as PaymentMethod] ?? o.paymentMethod ?? ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold ${
                      o.status === "paid" ? "bg-green-100 text-green-700"
                      : o.status === "cancelled" ? "bg-red-100 text-red-600"
                      : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {o.status === "paid" ? "✓ Lunas" : o.status === "cancelled" ? "✗ Batal" : "⌛ Proses"}
                    </span>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {new Date(o.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Stock Tab ────────────────────────────────────────────────────── */}
      {activeTab === "stock" && (
        <div className="flex-1 overflow-y-auto p-4 max-w-2xl mx-auto w-full">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-black text-gray-800 text-lg">Stok Bahan</h2>
            <button onClick={loadStocks} className="text-xs font-bold text-orange-500 hover:underline">↺ Refresh</button>
          </div>
          {stocks.length === 0 ? (
            <div className="text-center py-20 text-gray-300">
              <div className="text-5xl mb-3">📦</div>
              <p>Belum ada data stok</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {stocks.map((s) => {
                const low = Number(s.currentStock) <= Number(s.minStock);
                return (
                  <div key={s.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${low ? "border-red-100" : "border-gray-50"}`}>
                    <div className="flex justify-between items-start mb-2">
                      <p className="font-bold text-gray-800">{s.name}</p>
                      <span className={`text-base font-black ${low ? "text-red-500" : "text-green-600"}`}>
                        {Number(s.currentStock).toLocaleString("id-ID")} <span className="text-xs font-normal">{s.unit}</span>
                      </span>
                    </div>
                    {low && (
                      <p className="text-xs text-red-400 font-semibold mb-2 flex items-center gap-1">
                        ⚠️ Stok rendah (min: {s.minStock} {s.unit})
                      </p>
                    )}
                    {stockAdjust.id === s.id ? (
                      <div className="flex gap-2 mt-2">
                        <input type="number" placeholder="±jumlah" value={stockAdjust.delta}
                          onChange={(e) => setStockAdjust((a) => ({ ...a, delta: e.target.value }))}
                          className="w-20 px-2.5 py-2 border border-gray-200 rounded-xl text-xs text-right focus:outline-none focus:ring-2 focus:ring-orange-300" />
                        <input type="text" placeholder="Keterangan" value={stockAdjust.reason}
                          onChange={(e) => setStockAdjust((a) => ({ ...a, reason: e.target.value }))}
                          className="flex-1 px-2.5 py-2 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-300" />
                        <button onClick={() => handleAdjustStock(s.id)}
                          className="px-3 py-2 text-white text-xs font-bold rounded-xl"
                          style={{ background: "linear-gradient(135deg,#ff8c00,#e05500)" }}>Simpan</button>
                        <button onClick={() => setStockAdjust({ id: null, delta: "0", reason: "" })}
                          className="text-xs text-gray-400 hover:text-gray-600">Batal</button>
                      </div>
                    ) : (
                      <button onClick={() => setStockAdjust({ id: s.id, delta: "0", reason: "" })}
                        className="text-xs font-bold text-orange-500 hover:underline mt-1">
                        + Adjust Stok
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Mobile cart FAB ─────────────────────────────────────────────── */}
      {activeTab === "pos" && (
        <div className="lg:hidden fixed bottom-5 right-5 z-40">
          <button onClick={() => setCartOpen(true)}
            className="w-16 h-16 rounded-full shadow-2xl flex items-center justify-center relative active:scale-95 transition-all"
            style={{ background: "linear-gradient(135deg, #ff8c00, #e05500)" }}>
            <span className="text-2xl">🛒</span>
            {cartCount > 0 && (
              <div className="absolute -top-1 -right-1 w-6 h-6 bg-white rounded-full flex items-center justify-center text-xs font-black shadow-md" style={{ color: "#ff6b00" }}>
                {cartCount}
              </div>
            )}
          </button>
        </div>
      )}

      {/* ── Mobile cart drawer ──────────────────────────────────────────── */}
      {cartOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCartOpen(false)} />
          <div className="relative bg-white rounded-t-3xl shadow-2xl max-h-[85vh] flex flex-col overflow-hidden" ref={cartRef}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50">
              <h3 className="font-black text-gray-800">Keranjang ({cartCount} item)</h3>
              <button onClick={() => setCartOpen(false)}
                className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <CartPanel
                cart={cart} payMethod={payMethod} setPayMethod={setPayMethod}
                amountPaid={amountPaid} setAmountPaid={setAmountPaid}
                discount={discount} setDiscount={setDiscount}
                subtotal={subtotal} discountAmt={discountAmt} total={total} change={change}
                changeQty={changeQty} clearCart={clearCart}
                handleCheckout={handleCheckout} checkingOut={checkingOut}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── CartPanel component ───────────────────────────────────────────────────────
function CartPanel({
  cart, payMethod, setPayMethod, amountPaid, setAmountPaid,
  discount, setDiscount, subtotal, discountAmt, total, change,
  changeQty, clearCart, handleCheckout, checkingOut,
}: {
  cart: CartItem[];
  payMethod: PaymentMethod;
  setPayMethod: (m: PaymentMethod) => void;
  amountPaid: string;
  setAmountPaid: (v: string) => void;
  discount: string;
  setDiscount: (v: string) => void;
  subtotal: number;
  discountAmt: number;
  total: number;
  change: number;
  changeQty: (id: number, delta: number) => void;
  clearCart: () => void;
  handleCheckout: () => void;
  checkingOut: boolean;
}) {
  return (
    <>
      {/* Cart items */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {cart.length === 0 ? (
          <div className="text-center py-12 text-gray-300">
            <div className="text-4xl mb-2">🛒</div>
            <p className="text-sm font-medium">Keranjang kosong</p>
            <p className="text-xs mt-1">Pilih menu untuk mulai</p>
          </div>
        ) : (
          <>
            {cart.map((c) => (
              <div key={c.product.id} className="flex items-center gap-3 bg-orange-50 rounded-2xl p-2.5">
                <img src={c.product.imageUrl ?? getMenuImage(c.product.name)} alt={c.product.name}
                  className="w-12 h-12 rounded-xl object-cover flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).src = "/menu/thai-tea-original.png"; }} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-gray-800 truncate">{c.product.name}</p>
                  <p className="text-xs font-black" style={{ color: "#ff6b00" }}>
                    {("Rp " + (Number(c.product.price) * c.qty).toLocaleString("id-ID"))}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button onClick={() => changeQty(c.product.id, -1)}
                    className="w-7 h-7 rounded-xl bg-white text-gray-500 text-sm font-bold hover:bg-gray-100 shadow-sm flex items-center justify-center">
                    −
                  </button>
                  <span className="text-sm font-black text-gray-800 w-5 text-center">{c.qty}</span>
                  <button onClick={() => changeQty(c.product.id, 1)}
                    className="w-7 h-7 rounded-xl text-white text-sm font-bold shadow-sm flex items-center justify-center"
                    style={{ background: "#ff6b00" }}>
                    +
                  </button>
                </div>
              </div>
            ))}
            <button onClick={clearCart} className="text-xs text-gray-300 hover:text-red-400 transition-colors w-full text-center py-1">
              Kosongkan keranjang
            </button>
          </>
        )}
      </div>

      {/* Checkout section */}
      <div className="border-t border-gray-50 px-4 py-4 space-y-3 bg-white">
        {/* Diskon */}
        <div className="flex items-center gap-2 bg-gray-50 rounded-2xl px-3 py-2">
          <span className="text-xs text-gray-500 font-semibold w-14">Diskon</span>
          <input type="number" min="0" value={discount} onChange={(e) => setDiscount(e.target.value)}
            className="flex-1 bg-transparent text-sm font-bold text-right text-gray-700 focus:outline-none" />
        </div>

        {/* Subtotal & Total */}
        <div className="space-y-1 px-1">
          {discountAmt > 0 && (
            <div className="flex justify-between text-xs text-gray-400">
              <span>Subtotal</span><span>{"Rp " + subtotal.toLocaleString("id-ID")}</span>
            </div>
          )}
          {discountAmt > 0 && (
            <div className="flex justify-between text-xs text-green-500 font-semibold">
              <span>Diskon</span><span>-{"Rp " + discountAmt.toLocaleString("id-ID")}</span>
            </div>
          )}
          <div className="flex justify-between font-black text-base">
            <span className="text-gray-800">Total</span>
            <span style={{ color: "#ff6b00" }}>{"Rp " + total.toLocaleString("id-ID")}</span>
          </div>
        </div>

        {/* Payment method */}
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.entries(PAYMENT_LABELS) as [PaymentMethod, string][]).map(([m, label]) => (
            <button key={m} onClick={() => setPayMethod(m)}
              className={`py-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
                payMethod === m ? "text-white shadow-md" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
              style={payMethod === m ? { background: "linear-gradient(135deg, #ff8c00, #e05500)" } : {}}>
              <span className="text-base">{PAYMENT_ICONS[m]}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Cash input */}
        {payMethod === "cash" && (
          <div className="space-y-1.5">
            <input type="number" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)}
              placeholder="Jumlah bayar (Rp)"
              className="w-full px-4 py-2.5 bg-gray-50 border border-gray-100 rounded-2xl text-sm text-right font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-orange-300 placeholder-gray-300" />
            {Number(amountPaid) > 0 && change >= 0 && (
              <div className="flex justify-between items-center bg-blue-50 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-blue-600">Kembalian</span>
                <span className="text-sm font-black text-blue-700">{"Rp " + Math.max(0, change).toLocaleString("id-ID")}</span>
              </div>
            )}
          </div>
        )}

        {/* Checkout button */}
        <button onClick={handleCheckout}
          disabled={cart.length === 0 || checkingOut || (payMethod === "cash" && Number(amountPaid) < total)}
          className="w-full py-3.5 rounded-2xl font-black text-white text-sm transition-all duration-200 active:scale-95 disabled:opacity-40 shadow-lg shadow-orange-100"
          style={{ background: "linear-gradient(135deg, #ff8c00, #e05500)" }}>
          {checkingOut ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Memproses...
            </span>
          ) : (
            <span>💳 Bayar {total > 0 ? "Rp " + total.toLocaleString("id-ID") : ""}</span>
          )}
        </button>
      </div>
    </>
  );
}
