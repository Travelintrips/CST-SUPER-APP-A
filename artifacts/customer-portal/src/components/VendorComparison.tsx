import { useRef } from "react";
import type { ReactNode } from "react";
import { X, ArrowRight, Printer, Building2, MapPin, Clock, Tag, Star, Package, Truck, CheckCircle2, MinusCircle, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MarketplaceItem } from "@/lib/catalogFilters";

// ── helpers ─────────────────────────────────────────────────────────────────

function formatPrice(price: number, currency: string): string {
  if (currency === "USD") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(price);
  }
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(price);
}

function getSpecValues(item: MarketplaceItem): Record<string, unknown> {
  if (!item.specValues || typeof item.specValues !== "object") return {};
  return item.specValues as Record<string, unknown>;
}

function getTemplateFields(snapshot: unknown): Array<{ key: string; label: string; type: string }> {
  if (!snapshot || typeof snapshot !== "object") return [];
  const s = snapshot as Record<string, unknown>;
  if (Array.isArray(s["customFields"])) {
    return (s["customFields"] as Array<{ key: string; label: string; type: string }>)
      .filter((f) => f.type !== "textarea" && f.type !== "date");
  }
  if (Array.isArray(s["fields"])) {
    return (s["fields"] as Array<{ key: string; label: string; type: string; section?: string }>)
      .filter((f) => (f.section === "quotation" || f.section === "both") && f.type !== "textarea" && f.type !== "date");
  }
  return [];
}

function collectSpecFields(items: MarketplaceItem[]): Array<{ key: string; label: string }> {
  const seen = new Map<string, string>();
  for (const item of items) {
    for (const f of getTemplateFields(item.templateSnapshot)) {
      if (!seen.has(f.key)) seen.set(f.key, f.label);
    }
  }
  return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
}

const CATEGORY_PLACEHOLDER: Record<string, { emoji: string; from: string; to: string }> = {
  coffee: { emoji: "☕", from: "#6F4E37", to: "#A0785A" },
  coal: { emoji: "⛏️", from: "#2d3748", to: "#4a5568" },
  iron_steel: { emoji: "🏗️", from: "#2b4162", to: "#546a8c" },
  palm_oil: { emoji: "🌴", from: "#276221", to: "#4a9e41" },
  nickel: { emoji: "🔩", from: "#4a5568", to: "#718096" },
  copper: { emoji: "🔶", from: "#b05c1a", to: "#d4813a" },
  rice: { emoji: "🌾", from: "#7c6d2a", to: "#b8a24a" },
  sugar: { emoji: "🍬", from: "#c05080", to: "#e07095" },
  seafood: { emoji: "🐟", from: "#1a6080", to: "#2a8aad" },
  rubber: { emoji: "🌿", from: "#2d5a1b", to: "#4a8c30" },
  live_fish: { emoji: "🐠", from: "#0d4f6e", to: "#1a7ba8" },
  bird_nest: { emoji: "🪺", from: "#7c5a1a", to: "#b8873a" },
  frozen_food: { emoji: "❄️", from: "#1e4a7a", to: "#2e6aaa" },
  trucking: { emoji: "🚛", from: "#1a3a6c", to: "#2a5aaa" },
  sea_freight: { emoji: "🚢", from: "#0c3057", to: "#1a5080" },
  air_freight: { emoji: "✈️", from: "#1a4060", to: "#2a6090" },
  ppjk: { emoji: "📋", from: "#3a3060", to: "#5a4a90" },
  handling: { emoji: "🏭", from: "#2a4a2a", to: "#4a7a4a" },
};

function StockIcon({ status }: { status: string | null }) {
  if (!status) return <span className="text-slate-400">—</span>;
  const s = status.toLowerCase();
  if (s === "available" || s === "ready stock" || s === "tersedia") {
    return <span className="flex items-center gap-1 text-emerald-600 font-semibold text-[12px]"><CheckCircle2 className="h-3.5 w-3.5" />{status}</span>;
  }
  if (s === "limited" || s === "terbatas" || s === "indent" || s === "pre-order") {
    return <span className="flex items-center gap-1 text-amber-600 font-semibold text-[12px]"><AlertCircle className="h-3.5 w-3.5" />{status}</span>;
  }
  return <span className="flex items-center gap-1 text-red-500 font-semibold text-[12px]"><MinusCircle className="h-3.5 w-3.5" />{status}</span>;
}

// ── Compare Tray (sticky bottom bar) ────────────────────────────────────────

export function CompareTray({
  compareIds,
  allItems,
  onRemove,
  onClear,
  onOpen,
}: {
  compareIds: number[];
  allItems: MarketplaceItem[];
  onRemove: (id: number) => void;
  onClear: () => void;
  onOpen: () => void;
}) {
  if (compareIds.length === 0) return null;
  const MAX = 4;
  const selected = compareIds.map((id) => allItems.find((i) => i.id === id)).filter(Boolean) as MarketplaceItem[];

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t-2 border-sky-400 shadow-2xl print:hidden">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">

        {/* Label */}
        <div className="shrink-0">
          <p className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider">Bandingkan</p>
          <p className="text-[12px] text-slate-600 font-medium">{selected.length} dari maks. {MAX} dipilih</p>
        </div>

        {/* Item slots */}
        <div className="flex gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-none">
          {selected.map((item) => {
            const catKey = item.categoryKey ?? item.serviceType ?? "";
            const cat = CATEGORY_PLACEHOLDER[catKey];
            return (
              <div
                key={item.id}
                className="relative flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 shrink-0 max-w-[200px]"
              >
                {/* Category emoji */}
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg shrink-0"
                  style={cat ? { background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` } : { background: "#e2e8f0" }}
                >
                  {cat ? cat.emoji : (item.templateKind === "service" ? "🚚" : "📦")}
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-bold text-slate-700 leading-tight line-clamp-1">{item.name}</p>
                  <p className="text-[10px] text-slate-400 truncate">{item.vendorName ?? "Vendor"}</p>
                </div>
                <button
                  onClick={() => onRemove(item.id)}
                  className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center hover:bg-red-600 transition-colors"
                >
                  <X className="h-2.5 w-2.5 text-white" />
                </button>
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: Math.max(0, 2 - selected.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center justify-center w-[120px] h-[56px] rounded-xl border-2 border-dashed border-slate-200 shrink-0"
            >
              <span className="text-[11px] text-slate-300 font-medium">+ Tambah item</span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 shrink-0 ml-auto">
          <button
            onClick={onClear}
            className="px-3 py-2 rounded-xl text-[12px] font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition-all"
          >
            Hapus Semua
          </button>
          <Button
            onClick={onOpen}
            disabled={selected.length < 2}
            className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl px-4 py-2 text-[13px] font-bold flex items-center gap-2 disabled:opacity-40"
          >
            Bandingkan ({selected.length})
            <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Comparison Modal ─────────────────────────────────────────────────────────

export function CompareModal({
  items,
  onClose,
  onRemove,
  onRequestQuote,
}: {
  items: MarketplaceItem[];
  onClose: () => void;
  onRemove: (id: number) => void;
  onRequestQuote: (item: MarketplaceItem) => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);

  if (items.length === 0) return null;

  // Find min/max price for highlighting
  const prices = items.map((i) => i.priceSell).filter((p) => p !== null) as number[];
  const minPrice = prices.length > 0 ? Math.min(...prices) : null;

  // Collect all dynamic spec fields (union across all selected items)
  const specFields = collectSpecFields(items);

  function handlePrint() {
    window.print();
  }

  // Build rows config
  const FIXED_ROWS: Array<{
    key: string;
    label: string;
    render: (item: MarketplaceItem, idx: number) => ReactNode;
    highlight?: (item: MarketplaceItem) => string;
  }> = [
    {
      key: "vendor",
      label: "Vendor",
      render: (item) => (
        <div className="flex items-start gap-1.5">
          <Building2 className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
          <span className="font-semibold text-slate-800 text-[13px] leading-snug">{item.vendorName ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "price",
      label: "Harga",
      render: (item) => (
        item.priceSell != null
          ? <div>
              <span className="text-[15px] font-extrabold text-sky-700">{formatPrice(item.priceSell, item.currency)}</span>
              {item.unit && <span className="text-[11px] text-slate-400 ml-1">/ {item.unit}</span>}
            </div>
          : <span className="text-[12px] text-slate-400 italic">Harga nego</span>
      ),
      highlight: (item) => {
        if (item.priceSell === null) return "";
        if (minPrice !== null && item.priceSell === minPrice && prices.length > 1)
          return "bg-emerald-50 ring-1 ring-emerald-300";
        return "";
      },
    },
    {
      key: "origin",
      label: "Asal / Lokasi",
      render: (item) => (
        <div className="flex items-start gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-slate-400 mt-0.5 shrink-0" />
          <span className="text-[13px] text-slate-700">{item.origin ?? item.location ?? "—"}</span>
        </div>
      ),
    },
    {
      key: "stock",
      label: "Stok",
      render: (item) => <StockIcon status={item.stockStatus} />,
    },
    {
      key: "leadTime",
      label: "Lead Time",
      render: (item) => (
        item.leadTime
          ? <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-slate-400" /><span className="text-[13px] text-slate-700">{item.leadTime}</span></div>
          : <span className="text-slate-400">—</span>
      ),
    },
    {
      key: "moq",
      label: "MOQ",
      render: (item) => (
        item.moq != null
          ? <div className="flex items-center gap-1.5"><Tag className="h-3.5 w-3.5 text-slate-400" /><span className="text-[13px] text-slate-700">{item.moq.toLocaleString("id-ID")} {item.unit ?? ""}</span></div>
          : <span className="text-slate-400">—</span>
      ),
    },
    {
      key: "rating",
      label: "Rating",
      render: () => (
        <div className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5 text-slate-300" />
          <span className="text-[12px] text-slate-400 italic">Segera hadir</span>
        </div>
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] w-full max-h-[90vh] overflow-hidden flex flex-col rounded-2xl p-0">

        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-gradient-to-r from-sky-700 to-blue-700 rounded-t-2xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold text-sky-200 uppercase tracking-widest">Vendor Comparison Report</p>
              <DialogTitle className="text-[18px] font-extrabold text-white">
                Perbandingan {items.length} Vendor
              </DialogTitle>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handlePrint}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-[12px] font-semibold transition-all"
              >
                <Printer className="h-4 w-4" />
                Print / PDF
              </button>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-xl bg-white/15 hover:bg-white/25 flex items-center justify-center text-white transition-all"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </DialogHeader>

        {/* Scrollable table area */}
        <div className="overflow-auto flex-1" ref={printRef}>
          <table className="w-full border-collapse min-w-[600px]">

            {/* Item header row */}
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr>
                {/* Row label column */}
                <th className="w-36 min-w-[120px] bg-slate-50 border-b border-r border-slate-200 px-4 py-3 text-left">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Atribut</span>
                </th>

                {/* Item columns */}
                {items.map((item) => {
                  const catKey = item.categoryKey ?? item.serviceType ?? "";
                  const cat = CATEGORY_PLACEHOLDER[catKey];
                  return (
                    <th key={item.id} className="border-b border-r border-slate-200 px-4 py-3 text-left min-w-[200px] bg-white">
                      <div className="flex items-start gap-3">
                        {/* Category thumbnail */}
                        {item.primaryImageUrl ? (
                          <img src={item.primaryImageUrl} alt={item.name} className="w-12 h-12 rounded-xl object-cover shrink-0 border border-slate-200" />
                        ) : (
                          <div
                            className="w-12 h-12 rounded-xl flex items-center justify-center text-xl shrink-0"
                            style={cat ? { background: `linear-gradient(135deg, ${cat.from}, ${cat.to})` } : {}}
                          >
                            {cat ? cat.emoji : (item.templateKind === "service" ? <Truck className="h-5 w-5 text-white" /> : <Package className="h-5 w-5 text-white" />)}
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] font-bold text-slate-800 leading-snug line-clamp-2">{item.name}</p>
                          <p className="text-[11px] text-slate-400 mt-0.5 truncate">{item.vendorName}</p>
                          {/* Remove button */}
                          {items.length > 2 && (
                            <button
                              onClick={() => onRemove(item.id)}
                              className="mt-1 text-[10px] text-red-400 hover:text-red-600 font-semibold flex items-center gap-0.5 print:hidden"
                            >
                              <X className="h-3 w-3" /> Hapus
                            </button>
                          )}
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>

            <tbody>
              {/* Fixed rows */}
              {FIXED_ROWS.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/70 transition-colors">
                  {/* Label */}
                  <td className="bg-slate-50 border-b border-r border-slate-200 px-4 py-3 text-[12px] font-semibold text-slate-600 whitespace-nowrap align-top">
                    {row.label}
                  </td>
                  {/* Values */}
                  {items.map((item) => {
                    const highlightClass = row.highlight ? row.highlight(item) : "";
                    return (
                      <td key={item.id} className={`border-b border-r border-slate-200 px-4 py-3 align-top ${highlightClass}`}>
                        {row.render(item, 0)}
                        {row.key === "price" && item.priceSell === minPrice && prices.length > 1 && (
                          <div className="mt-1">
                            <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full font-bold">
                              💚 Harga Terbaik
                            </span>
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}

              {/* Dynamic spec rows */}
              {specFields.length > 0 && (
                <tr>
                  <td colSpan={items.length + 1} className="bg-sky-50 border-b border-slate-200 px-4 py-2">
                    <span className="text-[11px] font-bold text-sky-700 uppercase tracking-wider">Spesifikasi Teknis</span>
                  </td>
                </tr>
              )}
              {specFields.map(({ key, label }) => {
                // Only show row if at least 1 item has a value
                const hasAnyValue = items.some((item) => {
                  const v = getSpecValues(item)[key];
                  return v !== undefined && v !== null && String(v).trim() !== "";
                });
                if (!hasAnyValue) return null;

                return (
                  <tr key={key} className="hover:bg-slate-50/70 transition-colors">
                    <td className="bg-slate-50 border-b border-r border-slate-200 px-4 py-3 text-[12px] font-semibold text-slate-600 whitespace-nowrap align-top">
                      {label}
                    </td>
                    {items.map((item) => {
                      const specVals = getSpecValues(item);
                      const val = specVals[key];
                      const hasVal = val !== undefined && val !== null && String(val).trim() !== "";
                      return (
                        <td key={item.id} className="border-b border-r border-slate-200 px-4 py-3 align-top">
                          {hasVal
                            ? <span className="text-[13px] font-semibold text-slate-800">{String(val)}</span>
                            : <span className="text-slate-300 text-[12px]">—</span>
                          }
                        </td>
                      );
                    })}
                  </tr>
                );
              })}

              {/* CTA row */}
              <tr className="bg-slate-50">
                <td className="border-r border-slate-200 px-4 py-4 text-[12px] font-semibold text-slate-500">Aksi</td>
                {items.map((item) => (
                  <td key={item.id} className="border-r border-slate-200 px-4 py-4">
                    <Button
                      onClick={() => onRequestQuote(item)}
                      className="bg-sky-600 hover:bg-sky-700 text-white rounded-xl w-full text-[12px] font-semibold print:hidden"
                    >
                      Request Quote
                    </Button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        {/* Footer note */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 rounded-b-2xl print:hidden">
          <p className="text-[11px] text-slate-400">
            💡 Klik <strong>Print / PDF</strong> untuk menyimpan laporan perbandingan ini. Pilih item dengan checkbox di kartu produk (maks. 4 item).
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
