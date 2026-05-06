import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { SectionTitle } from "@/components/SectionTitle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  useGetLogisticOrderByNumber,
  getGetLogisticOrderByNumberQueryKey,
} from "@workspace/api-client-react";
import { Search, Package, Ship } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STATUS_COLORS, OrderStatus } from "@/lib/services-data";

export default function TrackPage() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  // Read ?order= from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get("order");
    if (o) {
      setInput(o);
      setSearchTerm(o);
    }
  }, []);

  const {
    data: order,
    isLoading,
    isError,
  } = useGetLogisticOrderByNumber(searchTerm, {
    query: {
      enabled: !!searchTerm,
      queryKey: getGetLogisticOrderByNumberQueryKey(searchTerm),
    },
  });

  function handleSearch() {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return;
    setSearchTerm(trimmed);
  }

  return (
    <div className="bg-background">
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <SectionTitle
          title="Lacak Status Pesanan"
          subtitle="Masukkan nomor pesanan untuk melihat status terkini"
        />

        <div className="flex gap-2">
          <Input
            placeholder="Contoh: LOG-250429-12345"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="font-mono uppercase"
          />
          <Button onClick={handleSearch} disabled={isLoading}>
            <Search className="w-4 h-4 mr-1" />
            {isLoading ? "Mencari..." : "Cari"}
          </Button>
        </div>

        {isError && (
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">
              Pesanan tidak ditemukan
            </p>
            <p className="text-sm mt-1">Periksa kembali nomor pesanan Anda</p>
          </div>
        )}

        {order && (
          <div className="space-y-4">
            {/* Status */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">
                    Nomor Pesanan
                  </p>
                  <p className="text-xl font-bold font-mono text-foreground">
                    {order.orderNumber}
                  </p>
                </div>
                <Badge
                  className={
                    STATUS_COLORS[order.status as OrderStatus] ||
                    "bg-gray-100 text-gray-800"
                  }
                >
                  {order.status}
                </Badge>
              </div>
              <Separator className="mb-4" />
              {(() => {
                const firstItem = order.items?.[0];
                const inputData = (firstItem?.inputData ?? {}) as Record<
                  string,
                  unknown
                >;
                const str = (v: unknown) => (v ? String(v) : "");
                const origin =
                  str(order.origin) ||
                  str(inputData.pickupCity) ||
                  str(inputData.originAirport) ||
                  str(inputData.originPort);
                const destination =
                  str(order.destination) ||
                  str(inputData.destCity) ||
                  str(inputData.destinationAirport) ||
                  str(inputData.destinationPort);
                return (
                  <div className="grid grid-cols-2 gap-y-2 text-sm">
                    <span className="text-muted-foreground">Perusahaan1</span>
                    <span className="font-medium text-foreground text-right">
                      {order.companyName}
                    </span>
                    <span className="text-muted-foreground">PIC</span>
                    <span className="font-medium text-foreground text-right">
                      {order.customerName}
                    </span>
                    <span className="text-muted-foreground">
                      Tipe Pengiriman
                    </span>
                    <span className="font-medium text-foreground text-right">
                      {order.shipmentType}
                    </span>
                    <span className="text-muted-foreground">
                      Kategori Barang
                    </span>
                    <span className="font-medium text-foreground text-right">
                      {str(order.commodity) ||
                        str(inputData.cargo_category) ||
                        "-"}
                    </span>
                    {origin && (
                      <>
                        <span className="text-muted-foreground">Origin</span>
                        <span className="font-medium text-foreground text-right">
                          {origin}
                        </span>
                      </>
                    )}
                    {destination && (
                      <>
                        <span className="text-muted-foreground">
                          Destination
                        </span>
                        <span className="font-medium text-foreground text-right">
                          {destination}
                        </span>
                      </>
                    )}
                    <span className="text-muted-foreground">
                      Tanggal Dibuat
                    </span>
                    <span className="font-medium text-foreground text-right">
                      {formatDate(order.createdAt)}
                    </span>
                  </div>
                );
              })()}
            </div>

            {/* Items */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground text-sm mb-3">
                Layanan ({order.items.length})
              </h3>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-3"
                  >
                    <div>
                      <Badge variant="outline" className="text-xs mr-1">
                        {item.category}
                      </Badge>
                      <span className="text-sm text-foreground">
                        {item.serviceName}
                      </span>
                    </div>
                    <span className="text-sm font-bold text-accent flex-shrink-0">
                      {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                ))}
              </div>
              <Separator className="mt-3 mb-3" />
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">
                    PPN{" "}
                    {order.subtotal > 0 &&
                    Math.round((order.tax / order.subtotal) * 1000) === 11
                      ? "1,1%"
                      : "11%"}
                  </span>
                  <span>{formatCurrency(order.tax)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>Total Estimasi</span>
                  <span className="text-accent">
                    {formatCurrency(order.grandTotal)}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">Informasi</p>
              <p>
                Tim kami akan menghubungi Anda untuk konfirmasi dan penawaran
                final. Jika ada pertanyaan, hubungi customer service kami.
              </p>
            </div>

            <Button
              variant="outline"
              className="w-full"
              onClick={() => setLocation("/book")}
            >
              <Ship className="w-4 h-4 mr-2" /> Buat Pesanan Baru
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
