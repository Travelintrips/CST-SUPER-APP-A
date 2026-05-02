import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useGetLogisticOrderByNumber, getGetLogisticOrderByNumberQueryKey } from "@workspace/api-client-react";
import { ArrowLeft, Search, Package, Ship } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/utils";
import { STATUS_COLORS, OrderStatus } from "@/lib/services-data";
import { useLanguage } from "@/i18n/LanguageContext";

export default function TrackPage() {
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const { t } = useLanguage();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const o = params.get("order");
    if (o) { setInput(o); setSearchTerm(o); }
  }, []);

  const { data: order, isLoading, isError } = useGetLogisticOrderByNumber(
    searchTerm,
    { query: { enabled: !!searchTerm, queryKey: getGetLogisticOrderByNumberQueryKey(searchTerm) } }
  );

  function handleSearch() {
    const trimmed = input.trim().toUpperCase();
    if (!trimmed) return;
    setSearchTerm(trimmed);
  }

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border bg-card sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <button onClick={() => setLocation("/")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="font-semibold text-foreground">{t("tracking.trackOrder")}</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-xl font-bold text-foreground mb-1">{t("tracking.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("tracking.description")}</p>
        </div>

        <div className="flex gap-2">
          <Input
            placeholder={t("tracking.placeholder")}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="font-mono uppercase"
          />
          <Button onClick={handleSearch} disabled={isLoading}>
            <Search className="w-4 h-4 mr-1" />
            {isLoading ? t("tracking.searching") : t("tracking.search")}
          </Button>
        </div>

        {isError && (
          <div className="text-center py-10 text-muted-foreground">
            <Package className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground">{t("tracking.notFound")}</p>
            <p className="text-sm mt-1">{t("tracking.notFoundDesc")}</p>
          </div>
        )}

        {order && (
          <div className="space-y-4">
            {/* Status */}
            <div className="bg-card border border-border rounded-xl p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1 uppercase tracking-wider">{t("tracking.orderNumber")}</p>
                  <p className="text-xl font-bold font-mono text-foreground">{order.orderNumber}</p>
                </div>
                <Badge className={STATUS_COLORS[order.status as OrderStatus] || "bg-gray-100 text-gray-800"}>
                  {order.status}
                </Badge>
              </div>
              <Separator className="mb-4" />
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <span className="text-muted-foreground">{t("tracking.company")}</span>
                <span className="font-medium text-foreground text-right">{order.companyName}</span>
                <span className="text-muted-foreground">{t("tracking.pic")}</span>
                <span className="font-medium text-foreground text-right">{order.customerName}</span>
                <span className="text-muted-foreground">{t("tracking.shipmentType")}</span>
                <span className="font-medium text-foreground text-right">{order.shipmentType}</span>
                <span className="text-muted-foreground">{t("tracking.origin")}</span>
                <span className="font-medium text-foreground text-right">{order.origin}</span>
                <span className="text-muted-foreground">{t("tracking.destination")}</span>
                <span className="font-medium text-foreground text-right">{order.destination}</span>
                <span className="text-muted-foreground">{t("tracking.createdAt")}</span>
                <span className="font-medium text-foreground text-right">{formatDate(order.createdAt)}</span>
              </div>
            </div>

            {/* Items */}
            <div className="bg-card border border-border rounded-xl p-5">
              <h3 className="font-semibold text-foreground text-sm mb-3">
                {t("tracking.services")} ({order.items.length})
              </h3>
              <div className="space-y-2">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-0 gap-3">
                    <div>
                      <Badge variant="outline" className="text-xs mr-1">{item.category}</Badge>
                      <span className="text-sm text-foreground">{item.serviceName}</span>
                    </div>
                    <span className="text-sm font-bold text-accent flex-shrink-0">{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator className="mt-3 mb-3" />
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{t("tracking.subtotal")}</span>
                  <span>{formatCurrency(order.subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">PPN {order.subtotal > 0 && Math.round(order.tax / order.subtotal * 1000) === 11 ? "1,1%" : "11%"}</span>
                  <span>{formatCurrency(order.tax)}</span>
                </div>
                <div className="flex justify-between font-bold">
                  <span>{t("tracking.total")}</span>
                  <span className="text-accent">{formatCurrency(order.grandTotal)}</span>
                </div>
              </div>
            </div>

            <div className="bg-muted/40 rounded-lg p-4 text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">{t("tracking.infoTitle")}</p>
              <p>{t("tracking.infoDesc")}</p>
            </div>

            <Button variant="outline" className="w-full" onClick={() => setLocation("/jasa")}>
              <Ship className="w-4 h-4 mr-2" /> {t("tracking.newOrder")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
