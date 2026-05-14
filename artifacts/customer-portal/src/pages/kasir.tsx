import { useState, useEffect, useCallback } from "react";
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

function fmt(n: number | string) {
  return Number(n).toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
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

  // History
  const [orders, setOrders] = useState<Order[]>([]);

  // Stock
  const [stocks, setStocks] = useState<StockItem[]>([]);
  const [stockAdjust, setStockAdjust] = useState<{ id: number | null; delta: string; reason: string }>({ id: null, delta: "0", reason: "" });

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
    setCart((prev) => {
      const updated = prev.map((c) => c.product.id === productId ? { ...c, qty: c.qty + delta } : c);
      return updated.filter((c) => c.qty > 0);
    });
  };

  const subtotal = cart.reduce((s, c) => s + Number(c.product.price) * c.qty, 0);
  const discountAmt = Number(discount) || 0;
  const total = subtotal - discountAmt;
  const change = payMethod === "cash" ? (Number(amountPaid) || 0) - total : 0;

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    setCheckingOut(true);
    try {
      const orderRes = await kasirFetch("/api/pos-kasir/orders", {
        method: "POST",
        body: JSON.stringify({
          items: cart.map((c) => ({ productId: c.product.id, qty: c.qty })),
          discount: discountAmt,
        }),
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
      if (res.ok) {
        await loadStocks();
        setStockAdjust({ id: null, delta: "0", reason: "" });
      }
    } catch { /* skip */ }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const categories = Array.from(new Set(products.map((p) => p.category)));

  const handleLogout = () => {
    removeKasirToken();
    setLocation("/kasir/login");
  };

  const printReceipt = () => {
    window.print();
  };

  // Receipt Modal
  if (receipt) {
    return (
      <div className="min-h-screen bg-gray-900 bg-opacity-80 flex items-center justify-center p-4 print:bg-white print:p-0">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm print:shadow-none print:rounded-none">
          <div className="p-6 text-center border-b">
            <div className="text-3xl mb-2">🧋</div>
            <h2 className="font-bold text-lg">Thai Tea CST</h2>
            <p className="text-xs text-gray-500">Struk Pembayaran</p>
            <p className="text-xs text-gray-400 mt-1">{receipt.orderNumber}</p>
            <p className="text-xs text-gray-400">{new Date(receipt.paidAt ?? receipt.createdAt).toLocaleString("id-ID")}</p>
          </div>
          <div className="p-4 space-y-2">
            {receipt.items?.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>{item.productName} x{item.qty}</span>
                <span>{fmt(item.subtotal)}</span>
              </div>
            ))}
            <div className="border-t pt-2 mt-2 space-y-1">
              {Number(receipt.discount ?? 0) > 0 && (
                <div className="flex justify-between text-sm text-green-600">
                  <span>Diskon</span>
                  <span>-{fmt(receipt.discount ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold">
                <span>Total</span>
                <span>{fmt(receipt.total)}</span>
              </div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Bayar ({PAYMENT_LABELS[receipt.paymentMethod as PaymentMethod] ?? receipt.paymentMethod})</span>
                <span>{fmt(receipt.amountPaid ?? receipt.total)}</span>
              </div>
              {Number(receipt.change ?? 0) > 0 && (
                <div className="flex justify-between text-sm font-semibold text-blue-600">
                  <span>Kembalian</span>
                  <span>{fmt(receipt.change ?? 0)}</span>
                </div>
              )}
            </div>
          </div>
          <div className="p-4 border-t text-center text-xs text-gray-400 print:block hidden">
            Terima kasih sudah berbelanja!
          </div>
          <div className="p-4 flex gap-2 print:hidden">
            <button onClick={printReceipt} className="flex-1 py-2 bg-amber-500 text-white rounded-lg text-sm font-semibold hover:bg-amber-600">
              🖨️ Cetak
            </button>
            <button onClick={() => setReceipt(null)} className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-200">
              Tutup
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 flex flex-col print:hidden">
      {/* Header */}
      <header className="bg-amber-500 text-white px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🧋</span>
          <div>
            <h1 className="font-bold text-sm leading-tight">Thai Tea CST</h1>
            <p className="text-xs opacity-80">{profile?.name}</p>
          </div>
        </div>
        <button onClick={handleLogout} className="text-xs bg-amber-600 hover:bg-amber-700 px-3 py-1.5 rounded-lg">
          Keluar
        </button>
      </header>

      {/* Tabs */}
      <div className="flex bg-white border-b shadow-sm">
        {(["pos", "history", "stock"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-3 text-xs font-semibold transition-colors ${activeTab === t ? "text-amber-600 border-b-2 border-amber-500" : "text-gray-500"}`}
          >
            {t === "pos" ? "🛒 Kasir" : t === "history" ? "📋 Riwayat" : "📦 Stok"}
          </button>
        ))}
      </div>

      {/* POS Tab */}
      {activeTab === "pos" && (
        <div className="flex flex-1 overflow-hidden" style={{ height: "calc(100vh - 112px)" }}>
          {/* Product Grid */}
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="p-3 bg-white border-b">
              <input
                value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari menu..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {categories.map((cat) => {
                const catProducts = filteredProducts.filter((p) => p.category === cat);
                if (catProducts.length === 0) return null;
                return (
                  <div key={cat} className="mb-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 px-1">{cat}</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {catProducts.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => addToCart(p)}
                          className="bg-white rounded-xl p-3 text-left shadow-sm hover:shadow-md hover:border-amber-300 border border-gray-100 transition-all active:scale-95"
                        >
                          <div className="text-xl mb-1">🧋</div>
                          <p className="text-xs font-semibold text-gray-800 leading-tight">{p.name}</p>
                          <p className="text-amber-600 font-bold text-sm mt-1">{fmt(p.price)}</p>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Cart */}
          <div className="w-72 bg-white border-l flex flex-col shadow-lg">
            <div className="p-3 border-b">
              <h2 className="font-semibold text-sm text-gray-800">Keranjang ({cart.reduce((s, c) => s + c.qty, 0)} item)</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center text-gray-400 text-sm py-8">Keranjang kosong</div>
              ) : (
                cart.map((c) => (
                  <div key={c.product.id} className="flex items-center gap-2 bg-amber-50 rounded-lg p-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-gray-800 truncate">{c.product.name}</p>
                      <p className="text-xs text-amber-600">{fmt(Number(c.product.price) * c.qty)}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => changeQty(c.product.id, -1)} className="w-6 h-6 bg-gray-200 rounded-full text-xs font-bold hover:bg-gray-300">−</button>
                      <span className="text-xs w-5 text-center font-semibold">{c.qty}</span>
                      <button onClick={() => changeQty(c.product.id, 1)} className="w-6 h-6 bg-amber-400 text-white rounded-full text-xs font-bold hover:bg-amber-500">+</button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Checkout section */}
            <div className="border-t p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <label className="text-xs text-gray-500 w-16">Diskon</label>
                <input
                  type="number" min="0" value={discount}
                  onChange={(e) => setDiscount(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs text-right"
                />
              </div>
              <div className="flex justify-between font-bold text-sm">
                <span>Total</span>
                <span className="text-amber-600">{fmt(total)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    onClick={() => setPayMethod(m)}
                    className={`text-xs py-1.5 rounded-lg font-medium transition-colors ${payMethod === m ? "bg-amber-500 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                  >
                    {PAYMENT_LABELS[m]}
                  </button>
                ))}
              </div>
              {payMethod === "cash" && (
                <div>
                  <input
                    type="number" value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    placeholder="Jumlah bayar"
                    className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                  />
                  {Number(amountPaid) > 0 && (
                    <p className="text-xs text-blue-600 mt-1 text-right">
                      Kembalian: {fmt(Math.max(0, change))}
                    </p>
                  )}
                </div>
              )}
              <button
                onClick={handleCheckout}
                disabled={cart.length === 0 || checkingOut || (payMethod === "cash" && Number(amountPaid) < total)}
                className="w-full py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl disabled:opacity-40 transition-colors text-sm"
              >
                {checkingOut ? "Memproses..." : "Bayar Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Tab */}
      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-gray-800">Transaksi Hari Ini</h2>
            <button onClick={loadOrders} className="text-xs text-amber-600 hover:underline">Refresh</button>
          </div>
          {orders.length === 0 ? (
            <div className="text-center text-gray-400 py-12">Belum ada transaksi hari ini</div>
          ) : (
            <div className="space-y-2">
              {orders.map((o) => (
                <div key={o.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="text-xs font-mono text-gray-500">{o.orderNumber}</p>
                      <p className="font-bold text-amber-600">{fmt(o.total)}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${o.status === "paid" ? "bg-green-100 text-green-700" : o.status === "cancelled" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>
                        {o.status === "paid" ? "Lunas" : o.status === "cancelled" ? "Batal" : "Proses"}
                      </span>
                      <p className="text-xs text-gray-400 mt-1">
                        {new Date(o.createdAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                  {o.paymentMethod && (
                    <p className="text-xs text-gray-500 mt-1">{PAYMENT_LABELS[o.paymentMethod as PaymentMethod] ?? o.paymentMethod}</p>
                  )}
                </div>
              ))}
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 mt-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-gray-700">Total Hari Ini</span>
                  <span className="font-bold text-amber-700">
                    {fmt(orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.total), 0))}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {orders.filter((o) => o.status === "paid").length} transaksi berhasil
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Stock Tab */}
      {activeTab === "stock" && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="font-semibold text-gray-800">Stok Bahan</h2>
            <button onClick={loadStocks} className="text-xs text-amber-600 hover:underline">Refresh</button>
          </div>
          {stocks.length === 0 ? (
            <div className="text-center text-gray-400 py-12">Belum ada data stok</div>
          ) : (
            <div className="space-y-2">
              {stocks.map((s) => (
                <div key={s.id} className="bg-white rounded-xl p-3 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-center mb-2">
                    <p className="font-medium text-sm text-gray-800">{s.name}</p>
                    <span className={`text-sm font-bold ${Number(s.currentStock) <= Number(s.minStock) ? "text-red-600" : "text-green-600"}`}>
                      {Number(s.currentStock).toLocaleString("id-ID")} {s.unit}
                    </span>
                  </div>
                  {Number(s.currentStock) <= Number(s.minStock) && (
                    <p className="text-xs text-red-500 mb-2">⚠️ Stok di bawah minimum ({s.minStock} {s.unit})</p>
                  )}
                  {stockAdjust.id === s.id ? (
                    <div className="flex gap-2 items-center">
                      <input
                        type="number" placeholder="±jumlah"
                        value={stockAdjust.delta}
                        onChange={(e) => setStockAdjust((a) => ({ ...a, delta: e.target.value }))}
                        className="w-20 px-2 py-1 border rounded text-xs text-right"
                      />
                      <input
                        type="text" placeholder="Keterangan"
                        value={stockAdjust.reason}
                        onChange={(e) => setStockAdjust((a) => ({ ...a, reason: e.target.value }))}
                        className="flex-1 px-2 py-1 border rounded text-xs"
                      />
                      <button onClick={() => handleAdjustStock(s.id)} className="text-xs bg-amber-500 text-white px-2 py-1 rounded hover:bg-amber-600">Simpan</button>
                      <button onClick={() => setStockAdjust({ id: null, delta: "0", reason: "" })} className="text-xs text-gray-500 hover:underline">Batal</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setStockAdjust({ id: s.id, delta: "0", reason: "" })}
                      className="text-xs text-amber-600 hover:underline"
                    >
                      + Adjust Stok
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
