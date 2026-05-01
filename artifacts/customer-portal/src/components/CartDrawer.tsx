import { useState } from "react";
import { useLocation } from "wouter";
import { X, Minus, Plus, Trash2, ShoppingCart, ArrowRight, CheckCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { getAuthToken, getAuthHeaders } from "@/lib/auth";

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

type Step = "cart" | "checkout" | "success";

export function CartDrawer() {
  const { items, removeItem, updateQty, updatePrice, clearCart, total, count, isOpen, closeCart } = useCart();
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("cart");
  const [notes, setNotes] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [paymentType, setPaymentType] = useState<"cash" | "termin" | "dp" | "">("");
  const [paymentTerm, setPaymentTerm] = useState<"net7" | "net14" | "net30" | "net60" | "">("");
  const [dpNext, setDpNext] = useState<"lunas-delivery" | "lunas-net30" | "lunas-net60" | "cicil" | "">("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successOrder, setSuccessOrder] = useState<{ docNumber: string; id: number } | null>(null);

  const token = getAuthToken();
  const hasNegotiatedItems = items.some((i) => i.unitPrice === 0);

  function resetAndClose() {
    closeCart();
    setTimeout(() => {
      setStep("cart");
      setNotes("");
      setExpectedDate("");
      setPaymentType("");
      setPaymentTerm("");
      setDpNext("");
      setErrorMsg("");
      setSuccessOrder(null);
    }, 300);
  }

  async function handleCheckout() {
    if (!token) {
      closeCart();
      setLocation("/login");
      return;
    }
    setStep("checkout");
  }

  async function submitOrder() {
    setIsSubmitting(true);
    setErrorMsg("");
    try {
      const headers = getAuthHeaders() as Record<string, string>;
      const res = await fetch("/api/portal/orders", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          notes: notes || undefined,
          expectedDate: expectedDate || undefined,
          paymentType: paymentType
            ? paymentType === "termin" && paymentTerm
              ? `termin:${paymentTerm}`
              : paymentType === "dp" && dpNext
              ? `dp:${dpNext}`
              : paymentType
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message ?? "Gagal membuat pesanan");
        return;
      }
      setSuccessOrder({ docNumber: data.docNumber, id: data.id });
      clearCart();
      setStep("success");
    } catch {
      setErrorMsg("Terjadi kesalahan jaringan. Silakan coba lagi.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 transition-opacity"
        onClick={resetAndClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-background shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ShoppingCart className="h-5 w-5 text-accent" />
            <h2 className="font-display font-bold text-lg">
              {step === "cart" && "Keranjang Pesanan"}
              {step === "checkout" && "Konfirmasi Pesanan"}
              {step === "success" && "Pesanan Berhasil"}
            </h2>
            {step === "cart" && count > 0 && (
              <span className="bg-accent text-accent-foreground text-xs font-bold px-2 py-0.5 rounded-full">
                {count}
              </span>
            )}
          </div>
          <button
            onClick={resetAndClose}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">

          {/* ── STEP: CART ── */}
          {step === "cart" && (
            <div className="p-6 space-y-4">
              {items.length === 0 ? (
                <div className="text-center py-16 text-muted-foreground">
                  <ShoppingCart className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p className="font-medium">Keranjang Anda kosong</p>
                  <p className="text-sm mt-1">Tambahkan layanan atau produk untuk mulai memesan</p>
                </div>
              ) : (
                items.map((item) => (
                  <div
                    key={item.productId}
                    className="flex gap-4 items-start bg-gray-50 rounded-xl p-4"
                  >
                    <div className="flex-1 min-w-0">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        item.itemType === "jasa"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-orange-100 text-orange-700"
                      }`}>
                        {item.itemType === "jasa" ? "Layanan" : "Produk"}
                      </span>
                      <p className="font-semibold mt-1 text-sm leading-tight">{item.name}</p>
                      {item.unitPrice > 0 ? (
                        <p className="text-accent font-bold text-sm mt-1">{formatIDR(item.unitPrice)}</p>
                      ) : (
                        <p className="text-amber-600 font-medium text-xs mt-1">Harga akan dikonfirmasi</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <button
                        onClick={() => removeItem(item.productId)}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      <div className="flex items-center gap-2 border border-border rounded-lg bg-white">
                        <button
                          className="p-1.5 hover:bg-muted transition-colors rounded-l-lg"
                          onClick={() => updateQty(item.productId, item.quantity - 1)}
                        >
                          <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                        <button
                          className="p-1.5 hover:bg-muted transition-colors rounded-r-lg"
                          onClick={() => updateQty(item.productId, item.quantity + 1)}
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {item.unitPrice > 0 && (
                        <p className="text-xs text-muted-foreground">
                          {formatIDR(item.unitPrice * item.quantity)}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── STEP: CHECKOUT ── */}
          {step === "checkout" && (
            <div className="p-6 space-y-5">
              {/* Order summary + price editing */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="font-semibold text-sm text-muted-foreground">Ringkasan & Konfirmasi Harga</p>
                {items.map((item) => (
                  <div key={item.productId} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground truncate max-w-[180px]">
                        {item.name} × {item.quantity}
                      </span>
                      {item.unitPrice > 0 && (
                        <span className="font-medium shrink-0">{formatIDR(item.unitPrice * item.quantity)}</span>
                      )}
                    </div>
                    {/* Editable price field */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground shrink-0">Harga satuan (Rp):</span>
                      <input
                        type="number"
                        min="0"
                        step="1000"
                        placeholder={item.unitPrice === 0 ? "Masukkan harga estimasi..." : ""}
                        value={item.unitPrice === 0 ? "" : item.unitPrice}
                        onChange={(e) => {
                          const v = parseFloat(e.target.value);
                          updatePrice(item.productId, isNaN(v) ? 0 : v);
                        }}
                        className="flex-1 text-xs rounded-md border border-input bg-white px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/50"
                      />
                    </div>
                    {item.unitPrice === 0 && (
                      <p className="text-xs text-amber-600">
                        Kosongkan jika ingin harga dikonfirmasi oleh tim kami.
                      </p>
                    )}
                  </div>
                ))}
                <div className="border-t border-border pt-2 mt-1 flex justify-between font-bold text-sm">
                  <span>Total Estimasi</span>
                  <span className="text-accent">
                    {total > 0 ? formatIDR(total) : "Akan dikonfirmasi"}
                  </span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Catatan Pesanan <span className="text-muted-foreground font-normal">(opsional)</span>
                </label>
                <textarea
                  rows={3}
                  placeholder="Asal & tujuan pengiriman, spesifikasi muatan, jadwal, dll..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 resize-none"
                />
              </div>

              {/* Expected date */}
              <div>
                <label className="block text-sm font-medium mb-1.5">
                  Tanggal yang Diharapkan <span className="text-muted-foreground font-normal">(opsional)</span>
                </label>
                <input
                  type="date"
                  value={expectedDate}
                  min={new Date().toISOString().split("T")[0]}
                  onChange={(e) => setExpectedDate(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                />
              </div>

              {/* Payment type */}
              <div className="space-y-3">
                <label className="block text-sm font-medium">
                  Jenis Pembayaran <span className="text-muted-foreground font-normal">(opsional)</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["cash", "termin", "dp"] as const).map((type) => {
                    const labels: Record<string, { title: string; desc: string }> = {
                      cash: { title: "Cash", desc: "Bayar lunas" },
                      termin: { title: "Termin", desc: "Cicil berkala" },
                      dp: { title: "DP / Advance", desc: "Uang muka" },
                    };
                    const selected = paymentType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setPaymentType(selected ? "" : type);
                          setPaymentTerm("");
                          setDpNext("");
                        }}
                        className={`flex flex-col items-center gap-0.5 rounded-xl border-2 px-2 py-3 text-center transition-all ${
                          selected
                            ? "border-accent bg-accent/10 text-accent"
                            : "border-border bg-background text-foreground hover:border-accent/50"
                        }`}
                      >
                        <span className="font-semibold text-xs leading-tight">{labels[type].title}</span>
                        <span className="text-[10px] text-muted-foreground leading-tight">{labels[type].desc}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Termin sub-options */}
                {paymentType === "termin" && (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-accent">Pilih Jangka Waktu Termin</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(["net7", "net14", "net30", "net60"] as const).map((term) => {
                        const termLabels: Record<string, string> = {
                          net7: "Net 7 Hari", net14: "Net 14 Hari",
                          net30: "Net 30 Hari", net60: "Net 60 Hari",
                        };
                        return (
                          <button
                            key={term}
                            type="button"
                            onClick={() => setPaymentTerm(paymentTerm === term ? "" : term)}
                            className={`rounded-lg border-2 py-2 text-[11px] font-semibold transition-all text-center ${
                              paymentTerm === term
                                ? "border-accent bg-accent text-white"
                                : "border-border bg-white text-foreground hover:border-accent/50"
                            }`}
                          >
                            {termLabels[term]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* DP sub-options */}
                {paymentType === "dp" && (
                  <div className="rounded-xl border border-accent/30 bg-accent/5 p-3 space-y-2">
                    <p className="text-xs font-medium text-accent">Pembayaran Selanjutnya Setelah DP</p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(["lunas-delivery", "lunas-net30", "lunas-net60", "cicil"] as const).map((opt) => {
                        const dpLabels: Record<string, { title: string; desc: string }> = {
                          "lunas-delivery": { title: "Pelunasan Setelah Pengiriman", desc: "Sisa dibayar saat barang tiba" },
                          "lunas-net30":    { title: "Pelunasan Net 30 Hari", desc: "Sisa lunas maks. 30 hari" },
                          "lunas-net60":    { title: "Pelunasan Net 60 Hari", desc: "Sisa lunas maks. 60 hari" },
                          "cicil":          { title: "Cicilan Bertahap", desc: "Sisa dibayar secara cicil" },
                        };
                        return (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setDpNext(dpNext === opt ? "" : opt)}
                            className={`flex flex-col gap-0.5 rounded-lg border-2 px-3 py-2.5 text-left transition-all ${
                              dpNext === opt
                                ? "border-accent bg-accent text-white"
                                : "border-border bg-white text-foreground hover:border-accent/50"
                            }`}
                          >
                            <span className="font-semibold text-[11px] leading-tight">{dpLabels[opt].title}</span>
                            <span className={`text-[10px] leading-tight ${dpNext === opt ? "text-white/80" : "text-muted-foreground"}`}>{dpLabels[opt].desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {hasNegotiatedItems && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>Pesanan dengan harga 0 akan diproses sebagai permintaan penawaran. Tim kami akan menghubungi Anda untuk konfirmasi harga.</span>
                </div>
              )}

              {errorMsg && (
                <div className="flex gap-2 items-start p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}

          {/* ── STEP: SUCCESS ── */}
          {step === "success" && successOrder && (
            <div className="p-6 text-center py-16">
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="font-display font-bold text-xl mb-2">Pesanan Diterima!</h3>
              <p className="text-muted-foreground mb-2">Nomor pesanan Anda:</p>
              <p className="font-bold text-accent text-lg mb-4">{successOrder.docNumber}</p>
              <p className="text-sm text-muted-foreground">
                Tim kami akan segera memproses pesanan Anda dan menghubungi Anda dalam waktu 1×24 jam kerja.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border space-y-3">
          {step === "cart" && items.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total Estimasi</span>
                <span className="font-bold text-lg text-accent">
                  {total > 0 ? formatIDR(total) : "Akan dikonfirmasi"}
                </span>
              </div>
              <Button className="w-full h-11 gap-2" onClick={handleCheckout}>
                {token ? "Lanjut ke Konfirmasi" : "Masuk untuk Memesan"}
                <ArrowRight className="h-4 w-4" />
              </Button>
              {!token && (
                <p className="text-xs text-muted-foreground text-center">
                  Anda harus masuk atau daftar terlebih dahulu
                </p>
              )}
            </>
          )}

          {step === "checkout" && (
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setStep("cart")}>
                Kembali
              </Button>
              <Button
                className="flex-1 gap-2"
                onClick={submitOrder}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Mengirim..." : "Kirim Pesanan"}
                {!isSubmitting && <ArrowRight className="h-4 w-4" />}
              </Button>
            </div>
          )}

          {step === "success" && (
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  resetAndClose();
                  setLocation("/orders");
                }}
              >
                Lihat Riwayat
              </Button>
              <Button className="flex-1" onClick={resetAndClose}>
                Tutup
              </Button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
