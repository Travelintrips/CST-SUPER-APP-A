import { useState } from "react";
import { Link } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search, Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
  ArrowRight,
} from "lucide-react";
import { CATEGORIES, SERVICE_ITEMS, ServiceCategory } from "@/lib/services-data";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Ship, Plane, Download, Upload, MapPin, Home,
  Package, Warehouse, Truck, FileCheck, Shield, FileText,
};

const CATEGORY_COLORS: Record<ServiceCategory, { bg: string; text: string; badge: string }> = {
  Freight:    { bg: "bg-blue-50",    text: "text-blue-700",   badge: "bg-blue-100 text-blue-700" },
  Customs:    { bg: "bg-orange-50",  text: "text-orange-700", badge: "bg-orange-100 text-orange-700" },
  Handling:   { bg: "bg-purple-50",  text: "text-purple-700", badge: "bg-purple-100 text-purple-700" },
  Storage:    { bg: "bg-teal-50",    text: "text-teal-700",   badge: "bg-teal-100 text-teal-700" },
  Trucking:   { bg: "bg-amber-50",   text: "text-amber-700",  badge: "bg-amber-100 text-amber-700" },
  Document:   { bg: "bg-indigo-50",  text: "text-indigo-700", badge: "bg-indigo-100 text-indigo-700" },
  Additional: { bg: "bg-pink-50",    text: "text-pink-700",   badge: "bg-pink-100 text-pink-700" },
};

export default function Jasa() {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<ServiceCategory | "All">("All");

  const filtered = SERVICE_ITEMS.filter((item) => {
    const matchSearch =
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.category.toLowerCase().includes(searchQuery.toLowerCase());
    const matchCategory = activeCategory === "All" || item.category === activeCategory;
    return matchSearch && matchCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-primary text-primary-foreground py-16 md:py-24">
        <div className="container px-4 md:px-6">
          <div className="max-w-2xl">
            <p className="text-accent font-semibold text-sm uppercase tracking-widest mb-3">Katalog Jasa</p>
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">Jasa / Services</h1>
            <p className="text-lg text-primary-foreground/80 mb-8">
              Temukan layanan logistik, kepabeanan, dan pengiriman internasional kami yang dirancang sesuai kebutuhan bisnis Anda.
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-primary-foreground/50" />
              <Input
                type="text"
                placeholder="Cari jasa atau kategori..."
                className="w-full h-12 pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/50 focus-visible:ring-accent"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <div className="container px-4 md:px-6 mt-10">
        {/* Category filter tabs */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setActiveCategory("All")}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-all border ${
              activeCategory === "All"
                ? "bg-primary text-primary-foreground border-primary shadow-sm"
                : "bg-white text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
            }`}
          >
            Semua
          </button>
          {CATEGORIES.map((cat) => {
            const IconComp = ICON_MAP[cat.icon] ?? Package;
            const colors = CATEGORY_COLORS[cat.name];
            const isActive = activeCategory === cat.name;
            return (
              <button
                key={cat.name}
                onClick={() => setActiveCategory(isActive ? "All" : cat.name)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition-all border ${
                  isActive
                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                    : `bg-white ${colors.text} border-border hover:border-primary/40`
                }`}
              >
                <IconComp className="h-3.5 w-3.5" />
                {cat.name}
              </button>
            );
          })}
        </div>

        {/* Category overview cards (shown when no search + All selected) */}
        {!searchQuery && activeCategory === "All" && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-10">
            {CATEGORIES.map((cat) => {
              const IconComp = ICON_MAP[cat.icon] ?? Package;
              const colors = CATEGORY_COLORS[cat.name];
              const count = SERVICE_ITEMS.filter((i) => i.category === cat.name).length;
              return (
                <button
                  key={cat.name}
                  onClick={() => setActiveCategory(cat.name)}
                  className={`${colors.bg} rounded-xl p-4 text-left hover:shadow-md transition-all border border-transparent hover:border-${colors.text.replace("text-", "")}/20 group`}
                >
                  <IconComp className={`h-7 w-7 ${colors.text} mb-2 group-hover:scale-110 transition-transform`} />
                  <p className={`text-sm font-semibold ${colors.text}`}>{cat.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{count} jasa</p>
                </button>
              );
            })}
          </div>
        )}

        {/* Service grid */}
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filtered.map((item) => {
              const cat = CATEGORIES.find((c) => c.name === item.category);
              const IconComp = cat ? (ICON_MAP[cat.icon] ?? Package) : Package;
              const colors = CATEGORY_COLORS[item.category];
              return (
                <Card
                  key={item.id}
                  className="group flex flex-col h-full border-border/50 hover:shadow-lg transition-all duration-300 overflow-hidden"
                >
                  {/* Icon banner */}
                  <div className={`${colors.bg} flex items-center justify-center h-36 relative`}>
                    <IconComp className={`h-16 w-16 ${colors.text} opacity-30`} />
                    <div className="absolute top-3 left-3">
                      <Badge className={`${colors.badge} border-0 font-medium`}>{item.category}</Badge>
                    </div>
                  </div>

                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg leading-tight">{item.name}</CardTitle>
                    <CardDescription className="text-sm leading-relaxed">
                      {item.description}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="mt-auto pt-0 space-y-3">
                    <div className="bg-gray-50 rounded-lg p-3 flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Harga</span>
                      <span className="font-semibold text-amber-600 text-sm">Negosiasi / Quotation</span>
                    </div>
                    <Link href={`/jasa/${item.id}`}>
                      <Button className="w-full gap-2">
                        <ArrowRight className="h-4 w-4" />
                        Pesan Sekarang
                      </Button>
                    </Link>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-24 bg-white rounded-xl border border-dashed border-border">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4 opacity-40" />
            <h3 className="text-xl font-medium mb-2">Tidak ada jasa ditemukan</h3>
            <p className="text-muted-foreground">Coba kata kunci atau kategori yang berbeda.</p>
          </div>
        )}
      </div>
    </div>
  );
}
