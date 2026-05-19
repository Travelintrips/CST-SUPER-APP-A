import { useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import FacilityCard from "@/components/ui/FacilityCard";
import { facilities } from "@/data/dummyData";

const categories = ["Semua", ...Array.from(new Set(facilities.map((f) => f.category))).sort()];

export default function Facilities() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState("Semua");
  const [sortBy, setSortBy] = useState<"name" | "price-asc" | "price-desc" | "rating">("rating");

  const filtered = facilities
    .filter((f) => {
      const matchSearch = f.name.toLowerCase().includes(search.toLowerCase()) || f.category.toLowerCase().includes(search.toLowerCase());
      const matchCategory = activeCategory === "Semua" || f.category === activeCategory;
      return matchSearch && matchCategory;
    })
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "price-asc") return a.pricePerHour - b.pricePerHour;
      if (sortBy === "price-desc") return b.pricePerHour - a.pricePerHour;
      return b.rating - a.rating;
    });

  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Fasilitas Kami</h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto">
            Pilih dari berbagai lapangan dan fasilitas olahraga premium yang tersedia.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="text"
              placeholder="Cari fasilitas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              className="border border-slate-300 rounded-xl px-4 py-3 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="rating">Rating Tertinggi</option>
              <option value="price-asc">Harga Termurah</option>
              <option value="price-desc">Harga Termahal</option>
              <option value="name">Nama A-Z</option>
            </select>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap mb-8">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-4 py-2 rounded-full text-sm font-semibold transition-all ${
                activeCategory === cat
                  ? "bg-gradient-to-r from-blue-600 to-emerald-500 text-white shadow-md"
                  : "bg-white border border-slate-300 text-slate-600 hover:border-blue-400 hover:text-blue-600"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-semibold text-lg">Fasilitas tidak ditemukan</p>
            <p className="text-sm">Coba ubah kata kunci atau filter kategori</p>
          </div>
        ) : (
          <>
            <p className="text-slate-500 text-sm mb-6">{filtered.length} fasilitas ditemukan</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filtered.map((f) => (
                <FacilityCard key={f.id} facility={f} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
