import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";
import {
  Package, Search, Plus, Minus, Trash2, ShoppingCart,
  User, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Tag,
} from "lucide-react";
import { DynamicProductForm } from "@/components/DynamicProductForm";
import type { ProductTemplate, DynamicFormValues } from "@workspace/product-templates";
import {
  getInCodeTemplate as getLocalTemplate,
  getAllInCodeTemplates as getAllLocalTemplates,
  validateTemplatePayload,
} from "@workspace/product-templates";

interface PortalProduct {
  id: number;
  name: string;
  sku: string;
  price: number;
  unit: string | null;
  description: string | null;
  imageUrl: string | null;
  subcategory: string | null;
  stock: number;
}

interface CartItem {
  product: PortalProduct;
  qty: number;
}

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchProducts(search?: string): Promise<PortalProduct[]> {
  const params = new URLSearchParams();
  if (search) params.set("search", search);
  const res = await fetch(`${BASE}/api/portal-product/products?${params}`);
  if (!res.ok) throw new Error("Gagal memuat produk");
  return res.json();
}

async function submitOrder(body: unknown): Promise<{ orderNumber: string }> {
  const res = await fetch(`${BASE}/api/portal-product/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string }).message ?? "Gagal mengirim pesanan");
  }
  return res.json();
}

const EMPTY_FORM: DynamicFormValues = {
  customFieldValues: {},
  uploadedDocuments: [],
  checklistStatus: {},
  packagingNotes: "",
  conditionalFlags: {},
};

export default function ProductOrderPage() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // ── Templates from DB ──
  const [allTemplates, setAllTemplates] = useState<ProductTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);

  // Step 0: product browsing
  const [products, setProducts] = useState<PortalProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);

  // Step 1: commodity category + dynamic form
  const [productCategory, setProductCategory] = useState("general");
  const [dynamicValues, setDynamicValues] = useState<DynamicFormValues>(EMPTY_FORM);

  // Step 1 continued: customer info
  const [customerName, setCustomerName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  // ── Fetch templates from DB on mount ──
  useEffect(() => {
    // Backend returns RESOLVED ProductTemplate[] (in-code + DB overrides merged).
    fetch(`${BASE}/api/product-templates`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((templates: ProductTemplate[]) => {
        setAllTemplates(templates.length > 0 ? templates : getAllLocalTemplates());
      })
      .catch(() => {
        setAllTemplates(getAllLocalTemplates());
      })
      .finally(() => setTemplatesLoading(false));
  }, []);

  useEffect(() => {
    setLoadingProducts(true);
    fetchProducts(search)
      .then(setProducts)
      .catch(() => toast({ title: "Gagal memuat produk", variant: "destructive" }))
      .finally(() => setLoadingProducts(false));
  }, [search]);

  // Reset dynamic form when category changes
  useEffect(() => {
    setDynamicValues(EMPTY_FORM);
  }, [productCategory]);

  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  // Template lookup: DB first, fallback to hardcoded
  const template: ProductTemplate =
    allTemplates.find((t) => t.category === productCategory) ??
    getLocalTemplate(productCategory);

  function addToCart(product: PortalProduct) {
    setCart((prev) => {
      const existing = prev.find((i) => i.product.id === product.id);
      if (existing) return prev.map((i) => i.product.id === product.id ? { ...i, qty: i.qty + 1 } : i);
      return [...prev, { product, qty: 1 }];
    });
  }

  function changeQty(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((i) => i.product.id === productId ? { ...i, qty: i.qty + delta } : i)
        .filter((i) => i.qty > 0)
    );
  }

  function removeFromCart(productId: number) {
    setCart((prev) => prev.filter((i) => i.product.id !== productId));
  }

  async function handleSubmit() {
    if (!customerName.trim() || !email.trim() || !phone.trim() || !address.trim()) {
      toast({ title: "Isi semua kolom data pemesan", variant: "destructive" });
      return;
    }

    const formErrors = validateTemplatePayload(template, dynamicValues);
    if (formErrors.length > 0) {
      toast({ title: formErrors[0], variant: "destructive" });
      return;
    }

    setSubmitting(true);
    try {
      const items = cart.map((i) => ({
        productId: i.product.id,
        productName: i.product.name,
        productSku: i.product.sku,
        unit: i.product.unit ?? "pcs",
        unitPrice: i.product.price,
        qty: i.qty,
        subtotal: i.product.price * i.qty,
      }));
      const result = await submitOrder({
        customerName: customerName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        shippingAddress: address.trim(),
        notes: notes.trim() || undefined,
        items,
        productCategory,
        templateId: template.category,
        templateVersion: template.version,
        customFieldValues: dynamicValues.customFieldValues,
        uploadedDocuments: dynamicValues.uploadedDocuments,
        checklistStatus: dynamicValues.checklistStatus,
        packagingNotes: dynamicValues.packagingNotes || undefined,
        conditionalFlags: dynamicValues.conditionalFlags,
      });
      setOrderNumber(result.orderNumber);
      setStep(2);
    } catch (err) {
      toast({ title: (err as Error).message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  // ── Step 0 — Pilih Produk ──
  if (step === 0) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground py-10 px-4 text-center">
          <Package className="w-12 h-12 mx-auto mb-3 opacity-90" />
          <h1 className="text-2xl font-bold">Pesan Produk</h1>
          <p className="text-primary-foreground/70 text-sm mt-1">Pilih produk dan tambahkan ke keranjang</p>
        </div>

        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Cari produk..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {loadingProducts ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Package className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p>Tidak ada produk ditemukan</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
              {products.map((product) => {
                const cartItem = cart.find((i) => i.product.id === product.id);
                return (
                  <div key={product.id} className="border rounded-xl bg-card overflow-hidden hover:shadow-md transition-shadow">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt={product.name} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 bg-muted flex items-center justify-center">
                        <Package className="w-12 h-12 text-muted-foreground/40" />
                      </div>
                    )}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-sm leading-tight">{product.name}</h3>
                        {product.subcategory && (
                          <Badge variant="secondary" className="text-[10px] shrink-0">{product.subcategory}</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mb-1">{product.sku}</p>
                      {product.description && (
                        <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{product.description}</p>
                      )}
                      <p className="text-primary font-bold mb-3">
                        {formatCurrency(product.price)}
                        {product.unit && <span className="text-xs font-normal text-muted-foreground"> / {product.unit}</span>}
                      </p>
                      {cartItem ? (
                        <div className="flex items-center gap-2">
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => changeQty(product.id, -1)}>
                            <Minus className="w-3 h-3" />
                          </Button>
                          <span className="flex-1 text-center font-semibold">{cartItem.qty}</span>
                          <Button size="sm" variant="outline" className="h-8 w-8 p-0" onClick={() => changeQty(product.id, 1)}>
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={() => removeFromCart(product.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button size="sm" className="w-full" onClick={() => addToCart(product)}>
                          <Plus className="w-4 h-4 mr-1" /> Tambah
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {cart.length > 0 && (
            <div className="sticky bottom-4 z-10">
              <div className="bg-primary text-primary-foreground rounded-xl shadow-lg px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    {cartCount} item dipilih
                  </p>
                  <p className="text-lg font-bold">{formatCurrency(cartTotal)}</p>
                </div>
                <Button variant="secondary" onClick={() => setStep(1)} className="gap-2">
                  Lanjut <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Step 1 — Informasi Produk + Data Pemesan ──
  if (step === 1) {
    return (
      <div className="min-h-screen bg-background">
        <div className="bg-primary text-primary-foreground py-8 px-4">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <Button variant="ghost" size="sm" className="text-primary-foreground/80 hover:text-primary-foreground" onClick={() => setStep(0)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div>
              <h1 className="text-xl font-bold">Detail Pesanan</h1>
              <p className="text-primary-foreground/70 text-sm">Isi informasi produk dan data pengiriman</p>
            </div>
          </div>
        </div>

        <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

          {/* Order Summary */}
          <div className="border rounded-xl p-5 bg-card">
            <h2 className="font-semibold mb-4 flex items-center gap-2 text-sm">
              <ShoppingCart className="w-4 h-4" /> Ringkasan Pesanan
            </h2>
            <div className="space-y-3">
              {cart.map((item) => (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <div>
                    <p className="font-medium">{item.product.name}</p>
                    <p className="text-muted-foreground">{formatCurrency(item.product.price)} × {item.qty} {item.product.unit ?? "pcs"}</p>
                  </div>
                  <p className="font-semibold">{formatCurrency(item.product.price * item.qty)}</p>
                </div>
              ))}
            </div>
            <Separator className="my-3" />
            <div className="flex justify-between font-bold text-sm">
              <span>Total</span>
              <span className="text-primary">{formatCurrency(cartTotal)}</span>
            </div>
          </div>

          {/* Category Selector */}
          <div className="border rounded-xl p-5 bg-card space-y-3">
            <h2 className="font-semibold flex items-center gap-2 text-sm">
              <Tag className="w-4 h-4" /> Kategori Komoditas
            </h2>
            <p className="text-xs text-muted-foreground">
              Pilih kategori produk untuk menampilkan field dan dokumen yang relevan.
            </p>
            {templatesLoading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Memuat kategori...
              </div>
            ) : (
              <Select value={productCategory} onValueChange={setProductCategory}>
                <SelectTrigger className="h-10">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allTemplates.map((t) => (
                    <SelectItem key={t.category} value={t.category}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Dynamic Product Form */}
          {!templatesLoading && (
            <DynamicProductForm
              template={template}
              values={dynamicValues}
              onChange={setDynamicValues}
            />
          )}

          {/* Customer Data */}
          <div className="border rounded-xl p-5 bg-card space-y-4">
            <h2 className="font-semibold flex items-center gap-2 text-sm">
              <User className="w-4 h-4" /> Data Pemesan
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Nama Lengkap <span className="text-destructive">*</span></Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Nama lengkap" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">No. WhatsApp <span className="text-destructive">*</span></Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="08xxxxxxxxxx" type="tel" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Email <span className="text-destructive">*</span></Label>
                <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" type="email" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Alamat Pengiriman <span className="text-destructive">*</span></Label>
                <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Jl. ..., Kota, Provinsi" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label className="text-xs">Catatan Tambahan (opsional)</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Catatan tambahan untuk pesanan..." />
              </div>
            </div>
          </div>

          <Button className="w-full h-12 text-base" onClick={handleSubmit} disabled={submitting || templatesLoading}>
            {submitting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Mengirim...</> : "Kirim Pesanan"}
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 2 — Sukses ──
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="bg-green-50 border border-green-200 rounded-2xl p-8">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-green-800 mb-2">Pesanan Berhasil!</h1>
          <p className="text-green-700 text-sm mb-4">
            No. Pesanan Anda: <strong className="font-mono">{orderNumber}</strong>
          </p>
          <p className="text-green-600 text-sm">
            Tim kami akan segera menghubungi Anda via WhatsApp atau email untuk konfirmasi dan informasi pembayaran.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button variant="outline" onClick={() => setLocation("/products")}>
            Lihat Produk Lain
          </Button>
          <Button onClick={() => {
            setCart([]);
            setStep(0);
            setCustomerName("");
            setEmail("");
            setPhone("");
            setAddress("");
            setNotes("");
            setProductCategory("general");
            setDynamicValues(EMPTY_FORM);
          }}>
            Pesan Lagi
          </Button>
        </div>
      </div>
    </div>
  );
}
