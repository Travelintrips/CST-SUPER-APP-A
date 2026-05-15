import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CheckCircle2, Search, LayoutDashboard, Boxes } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { LogisticOrderDetail } from "@workspace/api-client-react";

export default function OrderSuccessPage() {
  const [order, setOrder] = useState<LogisticOrderDetail | null>(null);
  const [, setLocation] = useLocation();

  useEffect(() => {
    try {
      const stored = localStorage.getItem("last_order");
      if (stored) setOrder(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  if (!order) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <p className="text-muted-foreground mb-4">Data pesanan tidak ditemukan.</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="outline" onClick={() => setLocation("/jasa")}>
              <Boxes className="w-4 h-4 mr-2" /> Lihat Jasa
            </Button>
            <Button onClick={() => setLocation("/dashboard")}>
              <LayoutDashboard className="w-4 h-4 mr-2" /> Ke Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="bg-primary text-primary-foreground">
        <div className="max-w-2xl mx-auto px-4 py-10 text-center">
          <CheckCircle2 className="w-14 h-14 text-accent mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Pesanan Berhasil Dikirim!</h1>
          <p className="text-primary-foreground/70 text-sm">
            Tim kami akan menghubungi Anda segera untuk konfirmasi dan penawaran final.
          </p>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Order Number */}
        <div className="bg-card border border-border rounded-xl p-5 text-center">
          <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">Nomor Pesanan</p>
          <p className="text-2xl font-bold text-foreground tracking-wider">{order.orderNumber}</p>
          <p className="text-xs text-muted-foreground mt-2">
            Simpan nomor ini untuk melacak status pesanan Anda
          </p>
        </div>

        {/* Customer Info */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">Data Pemesan</h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <span className="text-muted-foreground">Perusahaan</span><span className="font-medium text-foreground text-right">{order.companyName}</span>
            <span className="text-muted-foreground">PIC</span><span className="font-medium text-foreground text-right">{order.customerName}</span>
            <span className="text-muted-foreground">Email</span><span className="font-medium text-foreground text-right truncate">{order.email}</span>
            <span className="text-muted-foreground">Tipe</span><span className="font-medium text-foreground text-right">{order.shipmentType}</span>
            <span className="text-muted-foreground">Origin</span><span className="font-medium text-foreground text-right">{order.origin}</span>
            <span className="text-muted-foreground">Destination</span><span className="font-medium text-foreground text-right">{order.destination}</span>
          </div>
        </div>

        {/* Order Items */}
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="font-semibold text-foreground text-sm mb-3">Rincian Pesanan</h3>

          {/* Commodity / product row */}
          {(order.commodity || order.cargoDescription) && (
            <div className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2.5 space-y-0.5">
              <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide">Barang / Komoditi</p>
              {order.commodity && (
                <p className="text-sm font-semibold text-foreground">{order.commodity}</p>
              )}
              {order.cargoDescription && (
                <p className="text-xs text-muted-foreground">{order.cargoDescription}</p>
              )}
            </div>
          )}

          {/* Services */}
          <div className="space-y-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 py-2 border-b border-border last:border-0">
                <div>
                  <Badge variant="outline" className="text-xs mr-2">{item.category}</Badge>
                  <span className="text-sm font-medium text-foreground">{item.serviceName}</span>
                </div>
                {item.subtotal > 0
                  ? <span className="text-sm font-bold text-accent flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                  : item.calculatorType === "trucking"
                    ? <span className="text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 flex-shrink-0">Harga menyusul</span>
                    : <span className="text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 flex-shrink-0">Harga nego</span>
                }
              </div>
            ))}
          </div>
          <Separator className="my-3" />
          {order.grandTotal > 0 ? (
            <>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    {order.items.length === 1 ? order.items[0].serviceName : "Subtotal"}
                  </span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">PPN {order.subtotal > 0 && Math.round(order.tax / order.subtotal * 1000) === 11 ? "1,1%" : "11%"}</span>
                  <span>{formatCurrency(order.tax)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total Estimasi</span>
                  <span className="text-accent">{formatCurrency(order.grandTotal)}</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground italic mt-3">
                Ini adalah estimasi harga. Penawaran final akan dikonfirmasi oleh tim kami.
              </p>
            </>
          ) : (
            <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-blue-700 space-y-0.5">
              <p className="font-semibold">Harga Akan Diberikan oleh Vendor</p>
              <p>Vendor akan membalas pesanan Anda dengan penawaran harga. Tim kami akan segera menghubungi Anda.</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setLocation(`/track?order=${order.orderNumber}`)}
          >
            <Search className="w-4 h-4 mr-2" /> Lacak Pesanan
          </Button>
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => setLocation("/jasa")}
          >
            <Boxes className="w-4 h-4 mr-2" /> Lihat Jasa Lainnya
          </Button>
          <Button
            className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground"
            onClick={() => setLocation("/dashboard")}
          >
            <LayoutDashboard className="w-4 h-4 mr-2" /> Ke Dashboard Saya
          </Button>
        </div>
      </div>
    </div>
  );
}
