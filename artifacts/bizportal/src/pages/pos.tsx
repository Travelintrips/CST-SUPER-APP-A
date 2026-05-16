import { AppShell } from "@/components/layout/AppShell";
import { useState, useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Receipt, Banknote, CreditCard, Wallet, QrCode, Search, Plus, Minus, Trash2, ChevronRight, ShoppingBag, X, ImageIcon, Paperclip, FileText, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  useGetPosSummary,
  useListTransactions,
  useCreateTransaction,
  useUpdateTransactionDocument,
  useListProducts,
  getGetPosSummaryQueryKey,
  getListTransactionsQueryKey,
  type Product,
} from "@workspace/api-client-react";
import { useUpload } from "@workspace/object-storage-web";
import { useLanguage } from "@/contexts/LanguageContext";

type CartItem = {
  id: number;
  name: string;
  price: number;
  qty: number;
  imageUrl?: string | null;
};

function resolveStoredUrl(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  if (url.startsWith("/api/")) return url;
  return url;
}

type PaymentMethod = "cash" | "debit" | "credit" | "qris" | "transfer";
const PAYMENT_OPTS: { value: PaymentMethod; label: string; icon: React.ReactNode }[] = [
  { value: "cash", label: "Tunai", icon: <Banknote className="h-4 w-4" /> },
  { value: "qris", label: "QRIS", icon: <QrCode className="h-4 w-4" /> },
  { value: "debit", label: "Debit", icon: <CreditCard className="h-4 w-4" /> },
  { value: "credit", label: "Kredit", icon: <CreditCard className="h-4 w-4" /> },
  { value: "transfer", label: "Transfer", icon: <Wallet className="h-4 w-4" /> },
];

export default function PosPage() {
  const { t } = useLanguage();
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
  const updateDocument = useUpdateTransactionDocument();
  const [uploadingTxId, setUploadingTxId] = useState<number | null>(null);

  const docUploader = useUpload({
    onError: () => {
      setUploadingTxId(null);
      toast({ title: t.common.error, variant: "destructive" });
    },
  });

  const handleAttachDocument = async (transactionId: number, file: File) => {
    setUploadingTxId(transactionId);
    const result = await docUploader.uploadFile(file);
    if (!result) { setUploadingTxId(null); return; }
    updateDocument.mutate(
      { id: transactionId, data: { documentUrl: result.objectPath } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
          toast({ title: t.common.success });
        },
        onError: () => toast({ title: t.common.error, variant: "destructive" }),
        onSettled: () => setUploadingTxId(null),
      }
    );
  };

  const formatIDR = (v: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(v);

  // ── Cashier (cart) state ─────────────────────────────────────────────
  const [cart, setCart] = useState<CartItem[]>([]);
  const [search, setSearch] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!products) return [];
    const q = search.trim().toLowerCase();
    const barang = products.filter((p) => p.itemType === "barang");
    if (!q) return barang;
    return barang.filter((p) => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.categories ?? []).some((c) => c.toLowerCase().includes(q)));
  }, [products, search]);

  const addToCart = (p: Pick<Product, "id" | "name" | "price"> & { imageUrl?: string | null }) => {
    setCart((cur) => {
      const existing = cur.find((c) => c.id === p.id);
      if (existing) return cur.map((c) => c.id === p.id ? { ...c, qty: c.qty + 1 } : c);
      return [...cur, { id: p.id, name: p.name, price: p.price, qty: 1, imageUrl: p.imageUrl ?? null }];
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
      toast({ title: t.common.success, description: `${snapshotItems} item · ${formatIDR(snapshotSubtotal)}` });
      clearCart();
    } catch {
      queryClient.invalidateQueries({ queryKey: getListTransactionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetPosSummaryQueryKey() });
      setCart((cur) => cur.filter((c) => !succeeded.includes(c.id)));
      toast({
        title: t.common.error,
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
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t.pos.title}</h1>
            <p className="text-sm sm:text-base text-muted-foreground mt-1">{t.pos.subtitle}</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "kasir" | "history")} className="space-y-4">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="kasir" className="flex-1 sm:flex-none" data-testid="tab-kasir">{t.pos.cashierTab}</TabsTrigger>
            <TabsTrigger value="history" className="flex-1 sm:flex-none" data-testid="tab-history">{t.pos.historyStats}</TabsTrigger>
          </TabsList>

          {/* ─── KASIR ─── */}
          <TabsContent value="kasir" className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
              {/* Products grid */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">{t.pos.selectProduct}</CardTitle>
                    <div className="relative w-full max-w-xs">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder={t.pos.searchProductSku}
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
                      <p className="text-sm">{search ? `${t.common.noResults} "${search}"` : t.pos.noProducts}</p>
                    </div>
                  ) : (
                    <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
                      {filteredProducts.map((p) => {
                        const img = resolveStoredUrl(p.imageUrl);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={isCheckingOut}
                            onClick={() => addToCart(p)}
                            className="text-left rounded-md border bg-card hover:bg-accent hover:border-primary/50 transition-colors p-2 flex flex-col gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                            data-testid={`product-${p.id}`}
                            aria-label={`Tambah ${p.name} ke keranjang`}
                          >
                            <div className="relative aspect-square w-full overflow-hidden rounded-md bg-muted flex items-center justify-center">
                              {img ? (
                                <img src={img} alt={p.name} loading="lazy" className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon className="h-7 w-7 text-muted-foreground/60" />
                              )}
                              {(p.categories ?? []).slice(0, 1).map((cat) => (
                                <Badge key={cat} variant="outline" className="absolute top-1 left-1 text-[10px] uppercase tracking-wide bg-background/90 backdrop-blur">
                                  {cat}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-sm font-medium line-clamp-2 leading-snug min-h-[2.5rem] mt-1">{p.name}</p>
                            <p className="text-xs text-muted-foreground">{p.sku}</p>
                            <p className="text-sm font-bold mt-auto">{formatIDR(p.price)}</p>
                            {p.stock <= 5 && p.stock > 0 && (
                              <p className="text-[10px] text-amber-500">Stock: {p.stock}</p>
                            )}
                            {p.stock === 0 && (
                              <p className="text-[10px] text-destructive">Stok habis</p>
                            )}
                          </button>
                        );
                      })}
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
                      <p className="text-sm">{t.pos.emptyCart}</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
                      {cart.map((item) => {
                        const img = resolveStoredUrl(item.imageUrl);
                        return (
                          <div key={item.id} className="flex items-center gap-2 p-2 rounded-md bg-muted/40" data-testid={`cart-item-${item.id}`}>
                            <div className="h-10 w-10 rounded-md bg-background border overflow-hidden flex items-center justify-center shrink-0">
                              {img
                                ? <img src={img} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
                                : <ImageIcon className="h-4 w-4 text-muted-foreground/60" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{item.name}</p>
                              <p className="text-xs text-muted-foreground">{formatIDR(item.price)} × {item.qty}</p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="icon" variant="outline" className="h-7 w-7" disabled={isCheckingOut} onClick={() => decFromCart(item.id)} data-testid={`button-dec-${item.id}`} aria-label="Kurangi"><Minus className="h-3 w-3" /></Button>
                              <span className="text-sm font-medium w-6 text-center">{item.qty}</span>
                              <Button size="icon" variant="outline" className="h-7 w-7" disabled={isCheckingOut} onClick={() => addToCart({ id: item.id, name: item.name, price: item.price, imageUrl: item.imageUrl })} data-testid={`button-inc-${item.id}`} aria-label="Tambah"><Plus className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" disabled={isCheckingOut} onClick={() => removeFromCart(item.id)} data-testid={`button-remove-${item.id}`} aria-label="Hapus"><Trash2 className="h-3 w-3" /></Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {cart.length > 0 && (
                    <>
                      <div className="border-t pt-3 space-y-1">
                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                          <span>{t.pos.items}</span><span>{cartItems}</span>
                        </div>
                        <div className="flex items-center justify-between text-base font-bold">
                          <span>{t.pos.total}</span><span data-testid="text-cart-total">{formatIDR(cartSubtotal)}</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">{t.pos.paymentMethod}</p>
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
                        {isCheckingOut ? t.pos.isProcessing : `${t.pos.pay} · ${formatIDR(cartSubtotal)}`}
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
                title={t.pos.todaySales}
                href="/pos?tab=history&filter=today"
                icon={<Banknote className="h-4 w-4 text-emerald-500" />}
                isLoading={isLoadingSummary}
                value={formatIDR(summary?.todayTotal || 0)}
                testId="stat-today-total"
              />
              <PosStatCard
                title={t.pos.txCount}
                href="/pos?tab=history&filter=today"
                icon={<Receipt className="h-4 w-4 text-blue-500" />}
                isLoading={isLoadingSummary}
                value={String(summary?.todayCount || 0)}
                testId="stat-today-count"
              />
              <PosStatCard
                title={t.pos.monthSales}
                href="/pos?tab=history&filter=month"
                icon={<Wallet className="h-4 w-4 text-indigo-500" />}
                isLoading={isLoadingSummary}
                value={formatIDR(summary?.monthTotal || 0)}
                testId="stat-month-total"
              />
              <PosStatCard
                title={t.pos.monthTxCount}
                href="/pos?tab=history&filter=month"
                icon={<Receipt className="h-4 w-4 text-violet-500" />}
                isLoading={isLoadingSummary}
                value={String(summary?.monthCount || 0)}
                testId="stat-month-count"
              />
            </div>

            <h2 className="text-lg sm:text-xl font-semibold tracking-tight pt-2">{t.pos.historyTitle}</h2>

            <Card className="hidden md:block">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t.pos.time}</TableHead>
                      <TableHead>{t.pos.product}</TableHead>
                      <TableHead className="text-right">{t.pos.qty}</TableHead>
                      <TableHead className="text-right">{t.pos.price}</TableHead>
                      <TableHead className="text-right">{t.pos.total}</TableHead>
                      <TableHead className="text-right">{t.pos.payment}</TableHead>
                      <TableHead className="text-right w-[140px]">{t.pos.document}</TableHead>
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
                          <TableCell className="text-right"><Skeleton className="h-7 w-[100px] ml-auto" /></TableCell>
                        </TableRow>
                      ))
                    ) : transactions?.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="h-32 text-center">
                          <div className="flex flex-col items-center justify-center text-muted-foreground">
                            <Receipt className="h-8 w-8 mb-2 opacity-50" />
                            <p>{t.pos.noTransactions}</p>
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
                          <TableCell className="text-right">
                            <TransactionDocumentControl
                              transactionId={tx.id}
                              documentUrl={tx.documentUrl ?? null}
                              isUploading={uploadingTxId === tx.id}
                              onUpload={(file) => handleAttachDocument(tx.id, file)}
                            />
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
                  <p className="text-sm text-muted-foreground">{t.pos.noTransactions}</p>
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
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                      <TransactionDocumentControl
                        transactionId={tx.id}
                        documentUrl={tx.documentUrl ?? null}
                        isUploading={uploadingTxId === tx.id}
                        onUpload={(file) => handleAttachDocument(tx.id, file)}
                        compact
                      />
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

interface TransactionDocumentControlProps {
  transactionId: number;
  documentUrl: string | null;
  isUploading: boolean;
  onUpload: (file: File) => void;
  compact?: boolean;
}

function TransactionDocumentControl({ transactionId, documentUrl, isUploading, onUpload, compact }: TransactionDocumentControlProps) {
  const inputId = `tx-doc-input-${transactionId}`;
  const resolved = resolveStoredUrl(documentUrl);
  return (
    <div className={`flex items-center gap-1.5 ${compact ? "" : "justify-end"}`}>
      <input
        id={inputId}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        data-testid={`input-tx-doc-${transactionId}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(f);
          e.target.value = "";
        }}
      />
      {resolved && (
        <a
          href={resolved}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center text-xs text-primary hover:underline"
          data-testid={`link-tx-doc-${transactionId}`}
          aria-label="Lihat dokumen transaksi"
        >
          <FileText className="h-3.5 w-3.5 mr-1" /> Lihat
        </a>
      )}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-7 px-2 text-xs"
        disabled={isUploading}
        onClick={() => document.getElementById(inputId)?.click()}
        data-testid={`button-attach-doc-${transactionId}`}
        aria-label={resolved ? "Ganti dokumen" : "Lampirkan dokumen"}
      >
        {isUploading
          ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
          : <Paperclip className="h-3.5 w-3.5 mr-1" />}
        {isUploading ? "Mengunggah" : resolved ? "Ganti" : "Lampirkan"}
      </Button>
    </div>
  );
}
