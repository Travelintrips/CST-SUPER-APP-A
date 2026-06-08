import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, Wrench, Search, Send, X, Store, ChevronRight, Tag, Building2, AlertCircle } from "lucide-react";

const idr = (n: number) =>
  n > 0
    ? new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n)
    : "Hubungi Kami";

interface CatalogItem {
  id: number;
  vendorId: number;
  vendorName: string;
  vendorLogo: string | null;
  type: string;
  name: string;
  description: string | null;
  unit: string | null;
  kategori: string | null;
  subcategory: string | null;
  sellPrice: number;
}

interface ProductTemplate {
  id: number;
  categoryKey: string;
  label: string;
  icon: string | null;
  description: string | null;
  customFields: { key: string; label: string; type: string; required?: boolean }[];
  requiredDocuments: { key: string; label: string; required?: boolean }[];
  checklist: { label: string }[];
  packagingInstructions: string | null;
}

interface ServiceTemplate {
  id: number;
  serviceType: string;
  label: string;
  emoji: string;
  description: string | null;
  fields: { key: string; label: string; type: string; required?: boolean }[];
  requiredDocuments: { key: string; label: string; required?: boolean }[];
  checklist: { label: string }[];
}

type Tab = "etalase" | "product-template" | "service-template";

function InquiryModal({
  item,
  onClose,
}: {
  item: { name: string; vendorName?: string; kategori?: string | null; type?: string; templateType?: "product" | "service" };
  onClose: () => void;
}) {
  const [form, setForm] = useState({ name: "", email: "", whatsapp: "", quantity: "", notes: "" });
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.whatsapp.trim()) { setError("Nama dan WhatsApp wajib diisi"); return; }
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/portal/catalog-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name, email: form.email, whatsapp: form.whatsapp,
          itemName: item.name, itemType: item.type ?? (item.templateType === "service" ? "service" : "product"),
          vendorName: item.vendorName, kategori: item.kategori,
          quantity: form.quantity, notes: form.notes,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.message ?? "Gagal");
      setDone(true);
    } catch (err: any) {
      setError(err.message ?? "Gagal mengirim");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-5 py-4 flex items-start justify-between">
          <div>
            <p className="text-white font-bold text-[15px]">Minta Penawaran</p>
            <p className="text-sky-100 text-sm mt-0.5 line-clamp-1">{item.name}</p>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white mt-0.5">
            <X className="h-5 w-5" />
          </button>
        </div>

        {done ? (
          <div className="p-8 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto">
              <Send className="h-6 w-6 text-emerald-600" />
            </div>
            <p className="font-bold text-slate-800">Permintaan Terkirim!</p>
            <p className="text-sm text-slate-500">Tim kami akan menghubungi Anda via WhatsApp segera.</p>
            <button onClick={onClose} className="mt-2 px-5 py-2 rounded-lg bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 transition-colors">
              Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="p-5 space-y-3">
            {error && (
              <div className="flex items-center gap-2 text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />{error}
              </div>
            )}
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Nama Lengkap *</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="Nama Anda" value={form.name} onChange={set("name")} required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">WhatsApp *</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="08xx-xxxx-xxxx" value={form.whatsapp} onChange={set("whatsapp")} type="tel" required
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Email (opsional)</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="email@domain.com" value={form.email} onChange={set("email")} type="email"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Jumlah / Qty</label>
              <input
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
                placeholder="cth: 100 pcs" value={form.quantity} onChange={set("quantity")}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Catatan</label>
              <textarea
                className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 resize-none"
                rows={2} placeholder="Kebutuhan spesifik, spesifikasi, dll." value={form.notes} onChange={set("notes")}
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-xl bg-sky-500 hover:bg-sky-600 text-white font-semibold text-sm transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {loading ? <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? "Mengirim..." : "Kirim Permintaan"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function EtalaseTab({ onInquiry }: { onInquiry: (item: { name: string; vendorName?: string; kategori?: string | null; type?: string }) => void }) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"" | "product" | "service">("");

  const { data: items = [], isLoading } = useQuery<CatalogItem[]>({
    queryKey: ["portal-vendor-catalog", filterType],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (filterType) p.set("type", filterType);
      const res = await fetch(`/api/portal/vendor-catalog?${p}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const filtered = useMemo(() =>
    items.filter((i) =>
      !search ||
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.vendorName ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (i.kategori ?? "").toLowerCase().includes(search.toLowerCase())
    ), [items, search]);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach((i) => { if (i.kategori) cats.add(i.kategori); });
    return Array.from(cats).sort();
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 bg-white"
            placeholder="Cari nama, vendor, kategori..."
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1.5">
          {(["", "product", "service"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium transition-colors border ${filterType === t ? "bg-sky-500 text-white border-sky-500" : "bg-white text-slate-600 border-slate-200 hover:border-sky-300 hover:text-sky-600"}`}
            >
              {t === "" ? "Semua" : t === "product" ? "Produk" : "Layanan"}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-48 rounded-2xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-slate-400">
          <Store className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="font-medium">Belum ada item etalase</p>
          <p className="text-sm mt-1">Vendor belum menambahkan produk atau layanan ke katalog</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-sky-200 transition-all duration-200 flex flex-col overflow-hidden"
            >
              <div className="p-4 flex-1 space-y-2.5">
                {/* Type badge */}
                <div className="flex items-center justify-between gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${item.type === "service" ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
                    {item.type === "service" ? <Wrench className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                    {item.type === "service" ? "Layanan" : "Produk"}
                  </span>
                  {item.kategori && (
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <Tag className="h-3 w-3" />{item.kategori}
                    </span>
                  )}
                </div>
                <div>
                  <p className="font-bold text-slate-800 text-[15px] leading-snug group-hover:text-sky-700 transition-colors">
                    {item.name}
                  </p>
                  {item.description && (
                    <p className="text-sm text-slate-500 mt-1 line-clamp-2">{item.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 text-[12px] text-slate-400">
                  <Building2 className="h-3.5 w-3.5 shrink-0" />
                  <span>{item.vendorName}</span>
                </div>
              </div>
              <div className="px-4 pb-4 flex items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] text-slate-400">Harga mulai</p>
                  <p className={`font-bold text-[15px] ${item.sellPrice > 0 ? "text-sky-700" : "text-slate-400 text-[13px]"}`}>
                    {idr(item.sellPrice)}{item.unit && item.sellPrice > 0 ? ` / ${item.unit}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => onInquiry({ name: item.name, vendorName: item.vendorName, kategori: item.kategori, type: item.type })}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-600 text-white text-[13px] font-semibold transition-colors"
                >
                  Minta Penawaran <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProductTemplateTab({ onInquiry }: { onInquiry: (item: { name: string; kategori?: string | null; templateType: "product" }) => void }) {
  const { data: templates = [], isLoading } = useQuery<ProductTemplate[]>({
    queryKey: ["portal-product-templates"],
    queryFn: async () => {
      const res = await fetch("/api/portal/product-templates");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />)}
    </div>
  );

  if (templates.length === 0) return (
    <div className="text-center py-16 text-slate-400">
      <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
      <p className="font-medium">Belum ada template produk</p>
      <p className="text-sm mt-1">Admin belum menambahkan template produk</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((t) => (
        <div key={t.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-emerald-200 transition-all flex flex-col overflow-hidden">
          <div className="p-4 flex-1 space-y-3">
            <div className="flex items-start gap-3">
              {t.icon ? (
                <span className="text-3xl shrink-0">{t.icon}</span>
              ) : (
                <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <Package className="h-5 w-5 text-emerald-600" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-snug group-hover:text-emerald-700 transition-colors">
                  {t.label}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{t.categoryKey}</p>
              </div>
            </div>
            {t.description && <p className="text-sm text-slate-500 line-clamp-2">{t.description}</p>}

            {/* Highlights */}
            <div className="space-y-1.5">
              {Array.isArray(t.customFields) && t.customFields.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {t.customFields.length} field pengisian data
                </div>
              )}
              {Array.isArray(t.requiredDocuments) && t.requiredDocuments.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {t.requiredDocuments.length} dokumen diperlukan
                </div>
              )}
              {Array.isArray(t.checklist) && t.checklist.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  {t.checklist.length} poin checklist
                </div>
              )}
              {t.packagingInstructions && (
                <div className="flex items-start gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 mt-1" />
                  <span className="line-clamp-1">{t.packagingInstructions}</span>
                </div>
              )}
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => onInquiry({ name: t.label, kategori: t.categoryKey, templateType: "product" })}
              className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />Minta Penawaran
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ServiceTemplateTab({ onInquiry }: { onInquiry: (item: { name: string; kategori?: string | null; templateType: "service" }) => void }) {
  const { data: templates = [], isLoading } = useQuery<ServiceTemplate[]>({
    queryKey: ["portal-service-templates"],
    queryFn: async () => {
      const res = await fetch("/api/portal/service-templates");
      if (!res.ok) return [];
      return res.json();
    },
  });

  if (isLoading) return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-52 rounded-2xl bg-slate-100 animate-pulse" />)}
    </div>
  );

  if (templates.length === 0) return (
    <div className="text-center py-16 text-slate-400">
      <Wrench className="h-12 w-12 mx-auto mb-3 opacity-40" />
      <p className="font-medium">Belum ada template layanan</p>
      <p className="text-sm mt-1">Admin belum menambahkan template layanan</p>
    </div>
  );

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {templates.map((t) => (
        <div key={t.id} className="group bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md hover:border-violet-200 transition-all flex flex-col overflow-hidden">
          <div className="p-4 flex-1 space-y-3">
            <div className="flex items-start gap-3">
              <span className="text-3xl shrink-0">{t.emoji || "📋"}</span>
              <div className="min-w-0">
                <p className="font-bold text-slate-800 text-[15px] leading-snug group-hover:text-violet-700 transition-colors">
                  {t.label}
                </p>
                <p className="text-[11px] text-slate-400 font-mono mt-0.5">{t.serviceType}</p>
              </div>
            </div>
            {t.description && <p className="text-sm text-slate-500 line-clamp-2">{t.description}</p>}

            <div className="space-y-1.5">
              {Array.isArray(t.fields) && t.fields.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 shrink-0" />
                  {t.fields.length} informasi yang dibutuhkan
                </div>
              )}
              {Array.isArray(t.requiredDocuments) && t.requiredDocuments.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                  {t.requiredDocuments.length} dokumen diperlukan
                </div>
              )}
              {Array.isArray(t.checklist) && t.checklist.length > 0 && (
                <div className="flex items-center gap-1.5 text-[12px] text-slate-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                  {t.checklist.length} poin checklist
                </div>
              )}
            </div>
          </div>
          <div className="px-4 pb-4">
            <button
              onClick={() => onInquiry({ name: t.label, kategori: t.serviceType, templateType: "service" })}
              className="w-full py-2.5 rounded-xl bg-violet-500 hover:bg-violet-600 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Send className="h-4 w-4" />Minta Penawaran
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function CatalogPage() {
  const [tab, setTab] = useState<Tab>("etalase");
  const [inquiry, setInquiry] = useState<{ name: string; vendorName?: string; kategori?: string | null; type?: string; templateType?: "product" | "service" } | null>(null);

  const tabs: { key: Tab; label: string; icon: React.ElementType; color: string }[] = [
    { key: "etalase", label: "Etalase Vendor", icon: Store, color: "sky" },
    { key: "product-template", label: "Template Produk", icon: Package, color: "emerald" },
    { key: "service-template", label: "Template Layanan", icon: Wrench, color: "violet" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Hero */}
      <div className="bg-gradient-to-br from-sky-600 via-blue-700 to-indigo-800 text-white py-14 px-4">
        <div className="max-w-5xl mx-auto text-center space-y-3">
          <p className="text-sky-300 text-sm font-semibold uppercase tracking-widest">Katalog Kami</p>
          <h1 className="text-3xl sm:text-4xl font-extrabold leading-tight">Produk & Layanan Vendor</h1>
          <p className="text-sky-100 text-[15px] max-w-xl mx-auto leading-relaxed">
            Temukan produk dan layanan dari vendor terpercaya kami. Hubungi kami untuk mendapatkan penawaran terbaik.
          </p>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        {/* Tabs */}
        <div className="flex flex-wrap gap-2">
          {tabs.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                tab === key
                  ? "bg-white shadow-sm border-slate-200 text-slate-900"
                  : "bg-transparent border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/70"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === "etalase" && (
          <EtalaseTab onInquiry={(item) => setInquiry(item)} />
        )}
        {tab === "product-template" && (
          <ProductTemplateTab onInquiry={(item) => setInquiry(item)} />
        )}
        {tab === "service-template" && (
          <ServiceTemplateTab onInquiry={(item) => setInquiry(item)} />
        )}
      </div>

      {inquiry && (
        <InquiryModal item={inquiry} onClose={() => setInquiry(null)} />
      )}
    </div>
  );
}
