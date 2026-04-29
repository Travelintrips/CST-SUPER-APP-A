import { useListPortalServices } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Package, Search, ShoppingCart } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useCart } from "@/lib/cart";

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

export default function Services() {
  const [searchQuery, setSearchQuery] = useState("");
  const { addItem, items } = useCart();

  const { data: servicesData, isLoading } = useListPortalServices({
    query: { queryKey: ["listPortalServices"] }
  });

  const services = Array.isArray(servicesData) ? servicesData : [];

  const filteredServices = services.filter((service) =>
    service.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    service.categories?.some((cat: string) => cat.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  function isInCart(id: number) {
    return items.some((i) => i.productId === id);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <div className="max-w-2xl">
            <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Katalog Jasa</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Layanan Kami</h1>
            <p className="text-lg text-primary-foreground/80 mb-8">
              Temukan layanan logistik, kepabeanan, dan pengiriman internasional kami yang dirancang sesuai kebutuhan bisnis Anda.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary-foreground/50" />
              <Input
                type="text"
                placeholder="Cari layanan atau kategori..."
                className="w-full h-12 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Catalog Grid */}
      <div className="container px-4 md:px-6 mt-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1,2,3,4,5,6].map(i => (
              <Card key={i} className="animate-pulse h-[400px]">
                <div className="h-48 bg-gray-200" />
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                  <div className="h-4 bg-gray-200 rounded w-full mt-4" />
                  <div className="h-4 bg-gray-200 rounded w-5/6" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filteredServices.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredServices.map((service) => (
              <Card key={service.id} className="group overflow-hidden flex flex-col h-full border-border/50 hover-elevate transition-all duration-300">
                <div className="aspect-video w-full overflow-hidden bg-gray-100 relative">
                  {service.imageUrl ? (
                    <img
                      src={service.imageUrl}
                      alt={service.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <Package className="h-12 w-12 text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {service.categories?.map((cat: string, i: number) => (
                      <Badge key={i} className="bg-background/90 text-foreground backdrop-blur-sm border-none shadow-sm">
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>
                <CardHeader>
                  <CardTitle className="text-xl">{service.name}</CardTitle>
                  <CardDescription className="text-sm mt-2 leading-relaxed">
                    {service.description}
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0 space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Harga</span>
                    <span className="font-bold text-lg text-primary">
                      {formatIDR(service.price)}
                    </span>
                  </div>
                  <Button
                    className="w-full gap-2"
                    variant={isInCart(service.id) ? "outline" : "default"}
                    onClick={() => addItem({
                      productId: service.id,
                      name: service.name,
                      unitPrice: service.price,
                      itemType: "jasa",
                    })}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {isInCart(service.id) ? "Tambah Lagi" : "Pesan Sekarang"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-xl border border-dashed border-border">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">Tidak ada layanan ditemukan</h3>
            <p className="text-muted-foreground">
              {searchQuery ? "Coba kata kunci yang berbeda." : "Belum ada layanan yang tersedia saat ini."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
