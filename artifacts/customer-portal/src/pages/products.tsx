import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ShoppingBag, Search, ShoppingCart } from "lucide-react";
import { useCart } from "@/lib/cart";

interface Product {
  id: number;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  categories: string[];
}

const formatIDR = (v: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(v);

export default function Products() {
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { addItem, items } = useCart();

  useEffect(() => {
    fetch("/api/portal/products")
      .then((r) => r.json())
      .then((data) => setProducts(Array.isArray(data) ? data : []))
      .catch(() => setProducts([]))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = products.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.categories.some((c) => c.toLowerCase().includes(searchQuery.toLowerCase()))
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
            <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Katalog Produk</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Produk Kami</h1>
            <p className="text-lg text-primary-foreground/80 mb-8">
              Temukan berbagai produk berkualitas yang kami sediakan untuk memenuhi kebutuhan bisnis Anda.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary-foreground/50" />
              <Input
                type="text"
                placeholder="Cari produk atau kategori..."
                className="w-full h-12 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="container px-4 md:px-6 mt-12">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Card key={i} className="animate-pulse h-[340px]">
                <div className="h-48 bg-gray-200 rounded-t-lg" />
                <CardHeader className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded w-1/4" />
                  <div className="h-6 bg-gray-200 rounded w-3/4" />
                </CardHeader>
              </Card>
            ))}
          </div>
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filtered.map((product) => (
              <Card
                key={product.id}
                className="group overflow-hidden flex flex-col h-full border-border/50 hover:shadow-lg transition-all duration-300"
              >
                <div className="aspect-video w-full overflow-hidden bg-gray-100 relative">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gray-100">
                      <ShoppingBag className="h-12 w-12 text-gray-300" />
                    </div>
                  )}
                  <div className="absolute top-3 left-3 flex flex-wrap gap-2">
                    {product.categories.map((cat, i) => (
                      <Badge
                        key={i}
                        className="bg-background/90 text-foreground backdrop-blur-sm border-none shadow-sm"
                      >
                        {cat}
                      </Badge>
                    ))}
                  </div>
                </div>

                <CardHeader>
                  <CardTitle className="text-xl">{product.name}</CardTitle>
                  {product.description && (
                    <CardDescription className="text-sm mt-2 leading-relaxed line-clamp-2">
                      {product.description}
                    </CardDescription>
                  )}
                </CardHeader>

                <CardContent className="mt-auto pt-0 space-y-3">
                  <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">Harga</span>
                    <span className="font-bold text-lg text-primary">{formatIDR(product.price)}</span>
                  </div>
                  <Button
                    className="w-full gap-2"
                    variant={isInCart(product.id) ? "outline" : "default"}
                    onClick={() => addItem({
                      productId: product.id,
                      name: product.name,
                      unitPrice: product.price,
                      itemType: "barang",
                    })}
                  >
                    <ShoppingCart className="h-4 w-4" />
                    {isInCart(product.id) ? "Tambah Lagi" : "Pesan Sekarang"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-xl border border-dashed border-border">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-xl font-medium mb-2">Tidak ada produk ditemukan</h3>
            <p className="text-muted-foreground">
              {searchQuery ? "Coba kata kunci yang berbeda." : "Belum ada produk yang tersedia saat ini."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
