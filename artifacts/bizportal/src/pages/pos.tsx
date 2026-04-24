import { AppShell } from "@/components/layout/AppShell";
import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Banknote, CreditCard, Wallet, QrCode, Search, Plus, Minus, Trash2, ChevronRight, ShoppingBag, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useGetPosSummary,
  useListTransactions,
  useCreateTransaction,
  useListProducts,
  getGetPosSummaryQueryKey,
  getListTransactionsQueryKey,
  type Product,
} from "@workspace/api-client-react";

type CartItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
};

type PaymentMethod = "cash" | "debit" | "credit" | "qris" | "transfer";
const PAYMENT_OPTS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "cash", label: "Tunai", icon: <Banknote className="h-4 w-4" /> },
  { value: "qris", label: "QRIS", icon: <QrCode className="h-4 w-4" /> },
  { value: "debit", label: "Debit", icon: <CreditCard className="h-4 w-4" /> },
  { value: "credit", label: "Kredit", icon: <CreditCard className="h-4 w-4" /> },
  { value: "transfer", label: "Transfer", icon: <Wallet className="h-4 w-4" /> },
];

export default function PosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [location, setLocation] = useLocation();

  const params = useMemo(() => new URLSearchParams(window.location.search), [location]);
  const initialTab = params.get("tab") === "history" ? "history" : "kasir";
  const [tab, setTab] = useState<"kasir" | "history">(initialTab);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (tab === "history") sp.set("tab", "history"); else sp.delete("tab");
    const next = sp.toString();
    setLocation(`/pos${next ? `?${next}` : ""}`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const { data: summary, isLoading: isLoadingSummary } = useGetPosSummary();
  const { data: transactions, isLoading: isLoadingTx } = useListTransactions();
  const { data: products, isLoading: isLoadingProducts } = useListProducts();
  const createTransaction = useCreateTransaction();

  const formatIDR = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);

  // ── Cashier (cart) state ─────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
  }, [products, search]);

  const addToCart = (p: Product) => {
    setCart((cur) => {
      const existing = cur.find((c) => c.id === p.id);
      if (existing) return cur.map((c) => c.id === p.id ? { ...c, qty: c.qty + 1 } : c);
      return [...cur, { id: p.id, name: p.name, price: p.price, qty: 1 }];
    });
  };
  const decFromCart = (id: number) => setCart((cur) => cur.flatMap((c) => c.id === id ? (c.qty <= 1 ? [] : [{ ...c, qty: c.qty - 1 }]) : [c]));
  const removeFromCart = (id: number) => setCart((cur) => cur.filter((c) => c.id !== id));
  const clearCart = () => setCart([]);

  const cartSubtotal = cart.reduce((s, c) => s + c.price * c.qty, 0);
  const cartItems = cart.reduce((s, c) => s + c.qty, 0);

  const handleCheckout = async () => {
    if (isCheckingOut) return;
    if (cart.length === 0) return;
    const snapshot = cart;
    const snapshotItems = cartItems;
    const snapshotSubtotal = cartSubtotal;
    setIsCheckingOut(true);
    const succeeded: number[] = [];
    try {
      for (const item of snapshot) {
        await createTransaction.mutateAsync({
          data: {
            productName: item.name,
            quantity: item.qty,
            unitPrice: item.price,
            totalPrice: item.price * item.qty,
            paymentMethod: payment,
          },
        });
        succeeded.push(item.id);
      }
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPosSummaryQueryKey() });
      toast({ title: "Pembayaran berhasil", description: `${snapshotItems} item · ${formatIDR(snapshotSubtotal)}` });
      clearCart();
    } catch {
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPosSummaryQueryKey() });
      setCart((cur) => cur.filter((c) => !succeeded.includes(c.id)));
      toast({
        title: succeeded.length > 0 ? "Sebagian transaksi gagal" : "Gagal memproses transaksi",
        description: succeeded.length > 0
          ? `${succeeded.length} item sudah tersimpan, sisanya tetap di keranjang. Coba bayar ulang.`
          : "Coba lagi atau cek koneksi.",
        variant: "destructive",
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const getPaymentIcon = (method: string) => {
    switch (method) {
      case 'cash': return <Banknote className="h-3 w-3 mr-1" />;
      case 'debit': case 'credit': return <CreditCard className="h-3 w-3 mr-1" />;
      case 'qris': return <QrCode className="h-3 w-3 mr-1" />;
      case 'transfer': return <Wallet className="h-3 w-3 mr-1" />;
      default: return null;
    }
  };

  return (
    <AppShell>
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Point of Sale</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">Kelola transaksi toko fisik dan ringkasan penjualan harian.</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "kasir" | "history")} className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="kasir" className="flex-1 sm:flex-none" data-testid="tab-kasir">Kasir</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-none" data-testid="tab-history">Riwayat & Statistik</TabsTrigger>
          </TabsList>

          {/* ─── KASIR ─── */}
          <TabsContent value="kasir" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              {/* Products grid */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">Pilih Produk</CardTitle>
                    <div className="relative w-full max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Cari produk / SKU..."
                        className="pl-8 h-9"
                        data-testid="input-search-product"
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingProducts ? (
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 rounded-md" />
                      ))}
                    </div>
                  ) : filteredProducts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center text-muted-foreground py-12">
                      <ShoppingBag className="h-10 w-10 mb-3 opacity-40" />
                      <p className="text-sm">{search ? `Tidak ada produk untuk "${search}".` : "Belum ada produk. Tambahkan dari halaman E-Commerce."}</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                      {filteredProducts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          disabled={isCheckingOut}
                          onClick={() => addToCart(p)}
                          className="text-left rounded-md border bg-card hover:bg-accent hover:border-primary/50 transition-colors p-3 flex flex-col gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                          data-testid={`product-${p.id}`}
                          aria-label={`Tambah ${p.name} ke keranjang`}
                        >
                          <Badge variant="outline" className="self-start text-[10px] uppercase tracking-wide">{p.category}</Badge>
                          <p className="text-sm font-medium line-clamp-2 leading-snug min-h-[2.5rem]">{p.name}</p>
                          <p className="text-xs text-muted-foreground">{p.sku}</p>
                          <p className="text-sm font-bold mt-auto">{formatIDR(p.price)}</p>
                          {p.stock <= 5 && p.stock > 0 && (
                            <p className="text-[10px] text-amber-500">Stock: {p.stock}</p>
                          )}
                          {p.stock === 0 && (
                            <p className="text-[10px] text-destructive">Stok habis</p>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Cart panel */}
              <Card className="lg:sticky lg:top-4 self-start">
                <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base flex items-center gap-2">
                    <ShoppingBag className="h-4 w-4" /> Keranjang
                    {cartItems > 0 && <Badge variant="secondary">{cartItems}</Badge>}
                  </CardTitle>
                  {cart.length > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearCart} disabled={isCheckingOut} data-testid="button-clear-cart" className="h-7 text-xs text-muted-foreground hover:text-destructive">
                      <X className="h-3 w-3 mr-1" /> Kosongkan
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  {cart.length === 0 ? (
                    <div className="text-center text-muted-foreground py-6">
                      <ShoppingBag className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Keranjang kosong.</p>
                      <p className="text-xs mt-1">Klik produk untuk menambahkan.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                      {cart.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40" data-testid={`cart-item-${item.id}`}>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{formatIDR(item.price)} × {item.qty}</p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Button size="icon" variant="outline" className="h-7 w-7" disabled={isCheckingOut} onClick={() => decFromCart(item.id)} data-testid={`button-dec-${item.id}`} aria-label="Kurangi"><Minus className="h-3 w-3" /></Button>
                            <span className="text-sm font-medium w-6 text-center">{item.qty}</span>
                            <Button size="icon" variant="outline" className="h-7 w-7" disabled={isCheckingOut} onClick={() => addToCart({ id: item.id, name: item.name, price: item.price } as Product)} data-testid={`button-inc-${item.id}`} aria-label="Tambah"><Plus className="h-3 w-3" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={isCheckingOut} onClick={() => removeFromCart(item.id)} data-testid={`button-remove-${item.id}`} aria-label="Hapus"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {cart.length > 0 && (
                    <>
                      <div className="border-t pt-3 space-y-1">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>Item</span><span>{cartItems}</span>
                        </div>
                        <div className="flex items-center justify-between text-base font-bold">
                          <span>Total</span><span data-testid="text-cart-total">{formatIDR(cartSubtotal)}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Metode Pembayaran</p>
                        <div className="grid grid-cols-3 gap-1.5">
                          {PAYMENT_OPTS.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setPayment(opt.value)}
                              data-testid={`payment-${opt.value}`}
                              className={`text-xs rounded-md border p-2 flex flex-col items-center gap-1 transition-colors ${
                                payment === opt.value
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-card hover:bg-accent"
                              }`}
                            >
                              {opt.icon}
                              <span className="leading-none">{opt.label}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <Button
                        size="lg"
                        className="w-full"
                        onClick={handleCheckout}
                        disabled={isCheckingOut}
                        data-testid="button-checkout"
                      >
                        {isCheckingOut ? "Memproses..." : `Bayar · ${formatIDR(cartSubtotal)}`}
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ─── HISTORY & STATS ─── */}
          <TabsContent value="history" className="space-y-4">
            <div className="grid gap-3 sm:gap-4 grid-cols-2 lg:grid-cols-4">
              <PosStatCard
                title="Penjualan Hari Ini"
                href="/pos?tab=history&filter=today"
                icon={<Banknote className="h-4 w-4 text-emerald-500" />}
                isLoading={isLoadingSummary}
                value={formatIDR(summary?.todayTotal || 0)}
                testId="stat-today-total"
              />
              <PosStatCard
                title="Tx Hari Ini"
                href="/pos?tab=history&filter=today"
                icon={<Receipt className="h-4 w-4 text-blue-500" />}
                isLoading={isLoadingSummary}
                value={String(summary?.todayCount || 0)}
                testId="stat-today-count"
              />
              <PosStatCard
                title="Penjualan Bulan Ini"
                href="/pos?tab=history&filter=month"
                icon={<Wallet className="h-4 w-4 text-indigo-500" />}
                isLoading={isLoadingSummary}
                value={formatIDR(summary?.monthTotal || 0)}
                testId="stat-month-total"
              />
              <PosStatCard
                title="Tx Bulan Ini"
                href="/pos?tab=history&filter=month"
                icon={<Receipt className="h-4 w-4 text-violet-500" />}
                isLoading={isLoadingSummary}
                value={String(summary?.monthCount || 0)}
                testId="stat-month-count"
              />
            </div>

            <h2 className="text-lg sm:text-xl font-semibold tracking-tight pt-2">Riwayat Transaksi</h2>

            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Waktu</TableHead>
                      <TableHead>Produk</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Harga</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Pembayaran</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoadingTx ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-4 w-[60px]" /></TableCell>
                          <TableCell><Skeleton className="h-4 w-[150px]" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[20px] ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-4 w-[80px] ml-auto" /></TableCell>
                          <TableCell className="text-right"><Skeleton className="h-6 w-[80px] rounded-full ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : transactions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Receipt className="h-8 w-8 mb-2 opacity-50" />
                            <p>Belum ada transaksi.</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      transactions?.slice().reverse().map((tx) => (
                        <TableRow key={tx.id}>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </TableCell>
                          <TableCell className="font-medium">{tx.productName}</TableCell>
                          <TableCell className="text-right">{tx.quantity}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{formatIDR(tx.unitPrice)}</TableCell>
                          <TableCell className="text-right font-bold">{formatIDR(tx.totalPrice)}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="secondary" className="uppercase font-normal">
                              {getPaymentIcon(tx.paymentMethod)}
                              {tx.paymentMethod}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="md:hidden space-y-3">
              {isLoadingTx ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i}><CardContent className="p-4 space-y-2">
                    <Skeleton className="h-5 w-2/3" />
                    <Skeleton className="h-4 w-1/2" />
                  </CardContent></Card>
                ))
              ) : !transactions || transactions.length === 0 ? (
                <Card><CardContent className="p-8 text-center">
                  <Receipt className="h-8 w-8 mb-2 opacity-50 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Belum ada transaksi.</p>
                </CardContent></Card>
              ) : (
                transactions.slice().reverse().map((tx) => (
                  <Card key={tx.id}><CardContent className="p-4 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{tx.productName}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {new Date(tx.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {tx.quantity} × {formatIDR(tx.unitPrice)}
                        </p>
                      </div>
                      <Badge variant="secondary" className="uppercase font-normal shrink-0 text-xs">
                        {getPaymentIcon(tx.paymentMethod)}
                        {tx.paymentMethod}
                      </Badge>
                    </div>
                    <div className="flex justify-end pt-1 border-t border-border">
                      <p className="text-base font-bold">{formatIDR(tx.totalPrice)}</p>
                    </div>
                  </CardContent></Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

interface PosStatCardProps {
  title: string;
  href: string;
  icon: React.ReactNode;
  isLoading: boolean;
  value: string;
  testId?: string;
}

function PosStatCard({ title, href, icon, isLoading, value, testId }: PosStatCardProps) {
  return (
    <Link href={href} data-testid={testId} className="block group focus:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
      <Card className="bg-card border-border transition-all hover:border-primary/50 hover:shadow-md group-hover:bg-accent/40 cursor-pointer h-full">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <div className="flex items-center gap-1">
            {icon}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-7 w-[100px] bg-muted" /> : (
            <div className="text-xl sm:text-2xl font-bold truncate">{value}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
