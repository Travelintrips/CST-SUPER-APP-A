import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Building2, Package, Truck, MapPin, Clock,
  Tag, Box, FileText, CheckCircle2, AlertCircle, Info,
  ShoppingCart, MessageSquare, Loader2, Calendar, Images, Play, Link2,
} from "lucide-react";
import type { ProductMediaItem, MarketplaceItem } from "@/lib/catalogFilters";

// ── Formatters ────────────────────────────────────────────────────────────────
const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function StockBadge({ status }: { status?: string | null }) {
  if (!status) return null;
  const cfg: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    in_stock:     { label: "Stok Tersedia",  cls: "bg-emerald-50 text-emerald-700 border-emerald-200", icon: <CheckCircle2 className="h-3 w-3" /> },
    limited:      { label: "Stok Terbatas",  cls: "bg-amber-50 text-amber-700 border-amber-200",   icon: <AlertCircle className="h-3 w-3" /> },
    out_of_stock: { label: "Habis",          cls: "bg-red-50 text-red-600 border-red-200",          icon: <AlertCircle className="h-3 w-3" /> },
    on_order:     { label: "Indent/On Order",cls: "bg-blue-50 text-blue-700 border-blue-200",       icon: <Info className="h-3 w-3" /> },
  };
  const c = cfg[status] ?? { label: status, cls: "bg-slate-100 text-slate-600 border-slate-200", icon: null };
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${c.cls}`}>
      {c.icon}{c.label}
    </span>
  );
}

// ── Media Gallery ─────────────────────────────────────────────────────────────
function getYoutubeThumbnail(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  return null;
}

function MediaGallery({ media }: { media: ProductMediaItem[] }) {
  const [selected, setSelected] = useState<ProductMediaItem | null>(null);
  if (!media || media.length === 0) return null;

  const primaryIdx = media.findIndex((m) => m.isPrimary);
  const initialSelected = media[primaryIdx !== -1 ? primaryIdx : 0];

  const current = selected ?? initialSelected;

  function renderMain(m: ProductMediaItem) {
    if (m.mediaType === "image" && m.fileUrl) {
      return (
        <img
          src={m.fileUrl}
          alt={m.title ?? "foto produk"}
          className="w-full h-full object-contain bg-slate-50"
        />
      );
    }
    if (m.mediaType === "video" && m.fileUrl) {
      return (
        <video
          src={m.fileUrl}
          controls
          className="w-full h-full object-contain bg-slate-900"
        />
      );
    }
    if (m.mediaType === "video_link" && m.externalUrl) {
      const ytId = m.externalUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/)?.[1];
      if (ytId) {
        return (
          <iframe
            src={`https://www.youtube.com/embed/${ytId}`}
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        );
      }
      return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-slate-50">
          <Link2 className="h-10 w-10 text-slate-300" />
          <a href={m.externalUrl} target="_blank" rel="noopener noreferrer"
            className="text-sky-600 hover:underline text-sm font-medium">
            Buka Video Eksternal
          </a>
        </div>
      );
    }
    return null;
  }

  function renderThumb(m: ProductMediaItem) {
    if (m.mediaType === "image" && m.fileUrl) {
      return <img src={m.fileUrl} alt="" className="w-full h-full object-cover" loading="lazy" />;
    }
    if (m.mediaType === "video" && m.fileUrl) {
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-200">
          <Play className="h-5 w-5 text-slate-500 fill-slate-500" />
        </div>
      );
    }
    if (m.mediaType === "video_link" && m.externalUrl) {
      const thumb = getYoutubeThumbnail(m.externalUrl);
      if (thumb) return <img src={thumb} alt="" className="w-full h-full object-cover" />;
      return (
        <div className="w-full h-full flex items-center justify-center bg-slate-200">
          <Play className="h-5 w-5 text-slate-500 fill-slate-500" />
        </div>
      );
    }
    return <div className="w-full h-full bg-slate-200" />;
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <p className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
          <Images className="h-3.5 w-3.5" /> Foto & Video
          <span className="normal-case font-normal text-slate-400">({media.length})</span>
        </p>
      </div>

      {/* Main viewer */}
      <div className="relative w-full aspect-video bg-slate-100 overflow-hidden">
        {renderMain(current)}
      </div>

      {/* Thumbnails */}
      {media.length > 1 && (
        <div className="flex gap-2 p-3 overflow-x-auto">
          {media.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelected(m)}
              className={`relative shrink-0 w-16 h-16 rounded-lg overflow-hidden border-2 transition-all ${
                current.id === m.id ? "border-sky-400 ring-1 ring-sky-200" : "border-transparent hover:border-slate-300"
              }`}
            >
              {renderThumb(m)}
              {(m.mediaType === "video" || m.mediaType === "video_link") && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="h-4 w-4 text-white fill-white" />
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Spec Table ────────────────────────────────────────────────────────────────
function SpecTable({ item }: { item: MarketplaceItem }) {
  const specs = item.specValues && typeof item.specValues === "object"
    ? item.specValues as Record<string, unknown>
    : {};
  const snapshot = item.templateSnapshot && typeof item.templateSnapshot === "object"
    ? item.templateSnapshot as Record<string, unknown>
    : {};

  const fields: Array<{ key: string; label: string; type: string }> = [];
  if (Array.isArray(snapshot["customFields"])) {
    fields.push(...(snapshot["customFields"] as typeof fields));
  } else if (Array.isArray(snapshot["fields"])) {
    (snapshot["fields"] as typeof fields).forEach((f) => fields.push(f));
  }

  const knownKeys = new Set(fields.map((f) => f.key));
  const extraKeys = Object.keys(specs).filter(
    (k) => !knownKeys.has(k) && specs[k] !== null && specs[k] !== undefined && String(specs[k]).trim() !== "",
  );

  const rows: Array<{ label: string; value: string }> = [];

  fields
    .filter((f) => f.type !== "textarea" && specs[f.key] !== undefined && specs[f.key] !== null && String(specs[f.key]).trim() !== "")
    .forEach((f) => rows.push({ label: f.label, value: String(specs[f.key]) }));

  extraKeys.forEach((k) => rows.push({ label: k, value: String(specs[k]) }));

  if (rows.length === 0) return null;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <p className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Spesifikasi Teknis</p>
      </div>
      <div className="divide-y divide-slate-100">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-4 px-4 py-2.5">
            <span className="text-[12px] text-slate-500 min-w-[120px] shrink-0">{r.label}</span>
            <span className="text-[12px] font-medium text-slate-800">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Document List ─────────────────────────────────────────────────────────────
function DocumentList({ docs }: { docs: unknown }) {
  if (!Array.isArray(docs) || docs.length === 0) return null;
  const public_ = (docs as Array<Record<string, unknown>>).filter((d) => d["visibility"] === "public" || !d["visibility"]);
  if (public_.length === 0) return null;
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200">
        <p className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
          <FileText className="h-3.5 w-3.5" /> Dokumen
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {public_.map((d, i) => (
          <div key={i} className="flex items-center justify-between px-4 py-2.5 gap-2">
            <span className="text-[13px] text-slate-700">{String(d["label"] ?? d["name"] ?? `Dokumen ${i + 1}`)}</span>
            {d["url"] ? (
              <a href={String(d["url"])} target="_blank" rel="noopener noreferrer"
                className="text-[12px] text-sky-600 hover:underline font-medium shrink-0">Lihat</a>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Calculator Panel ──────────────────────────────────────────────────────────
interface CalcState {
  qty: number;
  unit: string;
  includePpn: boolean;
}

function PriceCalculator({
  item,
  calc,
  onChange,
}: {
  item: MarketplaceItem;
  calc: CalcState;
  onChange: (c: CalcState) => void;
}) {
  const moq = Number(item.moq) || 1;
  const priceSell = item.priceSell ?? 0;
  const subtotal = priceSell * calc.qty;
  const ppnAmount = calc.includePpn ? subtotal * 0.11 : 0;
  const grandTotal = subtotal + ppnAmount;
  const hasPriceSell = item.priceSell != null;

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
      <p className="text-[12px] font-semibold text-slate-600 uppercase tracking-wide">Kalkulator Harga</p>

      {/* Qty */}
      <div className="space-y-1">
        <Label className="text-[12px] text-slate-600">Jumlah / Quantity</Label>
        <div className="flex items-center gap-2">
          <button
            className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors"
            onClick={() => onChange({ ...calc, qty: Math.max(moq, calc.qty - 1) })}
          >−</button>
          <Input
            type="number"
            min={moq}
            value={calc.qty}
            onChange={(e) => {
              const v = parseInt(e.target.value);
              if (!isNaN(v) && v >= moq) onChange({ ...calc, qty: v });
            }}
            className="text-center h-8 text-sm font-semibold w-20"
          />
          <button
            className="w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-700 font-bold text-sm hover:bg-slate-100 transition-colors"
            onClick={() => onChange({ ...calc, qty: calc.qty + 1 })}
          >+</button>
          <span className="text-[13px] text-slate-500">{calc.unit}</span>
        </div>
        {moq > 1 && (
          <p className="text-[11px] text-slate-400">MOQ: {moq} {item.unit || "unit"}</p>
        )}
      </div>

      {/* Unit */}
      {item.unit && (
        <div className="space-y-1">
          <Label className="text-[12px] text-slate-600">Satuan</Label>
          <Input
            value={calc.unit}
            onChange={(e) => onChange({ ...calc, unit: e.target.value })}
            className="h-8 text-sm max-w-[140px]"
          />
        </div>
      )}

      {/* PPN toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[12px] font-medium text-slate-700">Termasuk PPN 11%</p>
          <p className="text-[11px] text-slate-400">Pajak Pertambahan Nilai</p>
        </div>
        <Switch
          checked={calc.includePpn}
          onCheckedChange={(v) => onChange({ ...calc, includePpn: v })}
        />
      </div>

      {/* Price breakdown */}
      {hasPriceSell && (
        <>
          <Separator />
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between text-slate-600">
              <span>{idr(priceSell)} × {calc.qty} {calc.unit}</span>
              <span className="font-medium">{idr(subtotal)}</span>
            </div>
            {calc.includePpn && (
              <div className="flex justify-between text-slate-500">
                <span>PPN 11%</span>
                <span>{idr(ppnAmount)}</span>
              </div>
            )}
            <Separator className="my-1" />
            <div className="flex justify-between font-extrabold text-[15px] text-slate-900">
              <span>Grand Total</span>
              <span>{idr(grandTotal)}</span>
            </div>
          </div>
        </>
      )}

      {!hasPriceSell && (
        <p className="text-[12px] text-slate-400 italic text-center py-2">
          Harga akan dikonfirmasi setelah permintaan penawaran
        </p>
      )}
    </div>
  );
}

// ── Customer Form (Quote / Order) ─────────────────────────────────────────────
interface CustomerForm {
  customerName: string;
  email: string;
  phone: string;
  shippingAddress: string;
  notes: string;
}

interface SubmitDialogProps {
  mode: "quote" | "order";
  item: MarketplaceItem;
  calc: CalcState;
  onClose: () => void;
}

function SubmitDialog({ mode, item, calc, onClose }: SubmitDialogProps) {
  const [form, setForm] = useState<CustomerForm>({
    customerName: "", email: "", phone: "", shippingAddress: "", notes: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isOrder = mode === "order";
  const priceSell = item.priceSell ?? 0;
  const subtotal = priceSell * calc.qty;
  const ppnAmount = calc.includePpn ? subtotal * 0.11 : 0;
  const grandTotal = subtotal + ppnAmount;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const endpoint = `/api/portal/marketplace/${item.id}/${isOrder ? "order" : "quote"}`;
      const body: Record<string, unknown> = {
        customerName: form.customerName.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        qty: calc.qty,
        unit: calc.unit,
        notes: form.notes.trim() || undefined,
        includePpn: calc.includePpn,
      };
      if (isOrder) body["shippingAddress"] = form.shippingAddress.trim();

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json() as { orderNumber?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim permintaan");
      setSuccess(data.orderNumber ?? "OK");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan");
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-sm rounded-2xl text-center py-8">
          <div className="flex flex-col items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <div>
              <p className="text-[18px] font-bold text-slate-800 mb-1">
                {isOrder ? "Pesanan Diterima!" : "Permintaan Penawaran Terkirim!"}
              </p>
              <p className="text-[13px] text-slate-500">
                No. {isOrder ? "Order" : "Referensi"}: <span className="font-mono font-semibold text-slate-800">{success}</span>
              </p>
              <p className="text-[12px] text-slate-400 mt-2">
                Tim kami akan segera menghubungi Anda melalui WhatsApp.
              </p>
            </div>
            <Button onClick={onClose} className="mt-2 rounded-xl px-8">Tutup</Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            {isOrder ? <ShoppingCart className="h-4 w-4 text-sky-600" /> : <MessageSquare className="h-4 w-4 text-sky-600" />}
            {isOrder ? "Order Sekarang" : "Request Quote"}
          </DialogTitle>
        </DialogHeader>

        {/* Item & Price Summary */}
        <div className="bg-slate-50 rounded-xl p-3 text-[12px] space-y-1">
          <p className="font-semibold text-slate-800 text-[13px]">{item.name}</p>
          <p className="text-slate-500">{item.vendorName}</p>
          <div className="flex justify-between mt-2 pt-2 border-t border-slate-200">
            <span className="text-slate-600">{calc.qty} {calc.unit}</span>
            {item.priceSell != null
              ? <span className="font-bold text-sky-700">{idr(grandTotal)}</span>
              : <span className="italic text-slate-400">Harga nego</span>
            }
          </div>
          {calc.includePpn && item.priceSell != null && (
            <p className="text-slate-400 text-[11px]">Sudah termasuk PPN 11%</p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-[12px]">Nama Lengkap <span className="text-red-500">*</span></Label>
            <Input
              value={form.customerName}
              onChange={(e) => setForm({ ...form, customerName: e.target.value })}
              placeholder="Nama Anda"
              className="h-9 text-sm"
              required
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[12px]">Email</Label>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="email@contoh.com"
              className="h-9 text-sm"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-[12px]">No. WhatsApp <span className="text-red-500">*</span></Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="628xxxxxxxxx"
              className="h-9 text-sm"
              required
            />
          </div>

          {isOrder && (
            <div className="space-y-1">
              <Label className="text-[12px]">Alamat Pengiriman <span className="text-red-500">*</span></Label>
              <Textarea
                value={form.shippingAddress}
                onChange={(e) => setForm({ ...form, shippingAddress: e.target.value })}
                placeholder="Alamat lengkap pengiriman..."
                className="text-sm resize-none"
                rows={2}
                required
              />
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-[12px]">Catatan / Permintaan Khusus</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Catatan tambahan (opsional)..."
              className="text-sm resize-none"
              rows={2}
            />
          </div>

          {error && (
            <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full rounded-xl h-10" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {isOrder ? "Konfirmasi Pesanan" : "Kirim Permintaan Penawaran"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Detail Page ──────────────────────────────────────────────────────────
export default function MarketplaceDetailPage() {
  const [, params] = useRoute<{ id: string }>("/marketplace/:id");
  const [, setLocation] = useLocation();
  const id = params?.id;

  const [calc, setCalc] = useState<CalcState>({ qty: 1, unit: "unit", includePpn: false });
  const [dialog, setDialog] = useState<"quote" | "order" | null>(null);

  const { data: item, isLoading, isError } = useQuery<MarketplaceItem>({
    queryKey: ["marketplace-item", id],
    queryFn: async () => {
      const res = await fetch(`/api/portal/marketplace/${id}`);
      if (!res.ok) throw new Error("Item tidak ditemukan");
      return res.json() as Promise<MarketplaceItem>;
    },
    enabled: !!id,
    staleTime: 60_000,
  });

  // Sync MOQ and unit from fetched item
  useEffect(() => {
    if (item) {
      const moq = Number(item.moq) || 1;
      setCalc({ qty: moq, unit: item.unit || "unit", includePpn: false });
    }
  }, [item?.id]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-sky-500" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center gap-4">
        <AlertCircle className="h-10 w-10 text-red-400" />
        <p className="text-[16px] font-semibold text-slate-600">Item tidak ditemukan atau belum dipublikasikan</p>
        <Button variant="outline" onClick={() => setLocation("/marketplace")} className="rounded-xl gap-2">
          <ArrowLeft className="h-4 w-4" /> Kembali ke Marketplace
        </Button>
      </div>
    );
  }

  const isProduct = item.templateKind === "product";
  const hasPriceSell = item.priceSell != null;
  const priceSell = item.priceSell ?? 0;
  const subtotal = priceSell * calc.qty;
  const ppnAmount = calc.includePpn ? subtotal * 0.11 : 0;
  const grandTotal = subtotal + ppnAmount;

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Header bar */}
      <div className="bg-white border-b border-slate-200 sticky top-[64px] z-20">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => setLocation("/marketplace")}
            className="flex items-center gap-1.5 text-[13px] text-slate-500 hover:text-sky-600 font-medium transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Marketplace
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-[13px] text-slate-700 font-semibold truncate max-w-[300px]">{item.name}</span>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div className="flex flex-col lg:flex-row gap-6">

          {/* ── Left column — main info ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* Item Header */}
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              {/* Top accent */}
              <div className={`h-1.5 w-full ${isProduct ? "bg-gradient-to-r from-emerald-400 to-teal-400" : "bg-gradient-to-r from-sky-400 to-blue-500"}`} />

              <div className="p-5 space-y-3">
                {/* Vendor + type */}
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="h-4 w-4 text-slate-400" />
                    <span className="text-[13px] font-semibold text-slate-500">{item.vendorName ?? "Vendor"}</span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className={`text-[11px] gap-1 ${isProduct ? "border-emerald-300 text-emerald-700 bg-emerald-50" : "border-sky-300 text-sky-700 bg-sky-50"}`}>
                      {isProduct ? <Package className="h-3 w-3" /> : <Truck className="h-3 w-3" />}
                      {isProduct ? "Produk" : "Layanan / Jasa"}
                    </Badge>
                    <StockBadge status={item.stockStatus} />
                  </div>
                </div>

                {/* Name */}
                <h1 className="text-[22px] md:text-[26px] font-extrabold text-slate-900 leading-tight">
                  {item.name}
                </h1>

                {/* Description */}
                {item.description && (
                  <p className="text-[14px] text-slate-600 leading-relaxed">{item.description}</p>
                )}

                {/* Price display */}
                <div className="pt-2 border-t border-slate-100">
                  {hasPriceSell
                    ? (
                      <div className="flex items-baseline gap-2">
                        <span className="text-[28px] font-extrabold text-sky-700">{idr(priceSell)}</span>
                        {item.unit && <span className="text-[13px] text-slate-400">/ {item.unit}</span>}
                        <span className="text-[11px] text-slate-400">{item.currency ?? "IDR"}</span>
                      </div>
                    )
                    : (
                      <p className="text-[16px] font-semibold text-slate-400 italic">Harga nego / hubungi vendor</p>
                    )
                  }
                </div>

                {/* Meta chips */}
                <div className="flex flex-wrap gap-2 mt-1">
                  {item.origin && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-100 rounded-full px-3 py-1">
                      <MapPin className="h-3 w-3" /> Asal: {item.origin}
                    </div>
                  )}
                  {item.location && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-100 rounded-full px-3 py-1">
                      <MapPin className="h-3 w-3" /> Lokasi: {item.location}
                    </div>
                  )}
                  {item.leadTime && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-100 rounded-full px-3 py-1">
                      <Clock className="h-3 w-3" /> Lead Time: {item.leadTime}
                    </div>
                  )}
                  {item.moq != null && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-100 rounded-full px-3 py-1">
                      <Tag className="h-3 w-3" /> MOQ: {item.moq} {item.unit || "unit"}
                    </div>
                  )}
                  {(item as any).validityDate && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-100 rounded-full px-3 py-1">
                      <Calendar className="h-3 w-3" /> Berlaku s/d: {new Date((item as any).validityDate).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" })}
                    </div>
                  )}
                  {item.stockQty != null && (
                    <div className="flex items-center gap-1.5 text-[12px] text-slate-600 bg-slate-100 rounded-full px-3 py-1">
                      <Box className="h-3 w-3" /> Stok: {item.stockQty} {item.unit || "unit"}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Media Gallery */}
            {Array.isArray((item as any).media) && (item as any).media.length > 0 && (
              <MediaGallery media={(item as any).media as ProductMediaItem[]} />
            )}

            {/* Specs */}
            <SpecTable item={item} />

            {/* Documents */}
            <DocumentList docs={(item as any).documents} />

          </div>

          {/* ── Right column — calculator & CTA ────────────────────────────── */}
          <div className="lg:w-80 xl:w-96 shrink-0 space-y-4">

            <PriceCalculator item={item} calc={calc} onChange={setCalc} />

            {/* CTA Buttons */}
            <div className="space-y-2">
              <Button
                className="w-full h-11 rounded-xl font-semibold text-[14px] gap-2"
                onClick={() => setDialog("order")}
              >
                <ShoppingCart className="h-4 w-4" />
                Order Sekarang
              </Button>
              <Button
                variant="outline"
                className="w-full h-11 rounded-xl font-semibold text-[14px] gap-2 border-sky-300 text-sky-700 hover:bg-sky-50"
                onClick={() => setDialog("quote")}
              >
                <MessageSquare className="h-4 w-4" />
                Request Quote / Penawaran
              </Button>
            </div>

            {/* Grand total badge */}
            {hasPriceSell && (
              <div className="text-center text-[11px] text-slate-400">
                Estimasi: <span className="font-semibold text-slate-700">{idr(grandTotal)}</span>
                {calc.includePpn && " (incl. PPN 11%)"}
              </div>
            )}

            {/* Vendor info card */}
            <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-2">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Tentang Vendor</p>
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                <span className="text-[14px] font-semibold text-slate-800">{item.vendorName}</span>
              </div>
              {item.location && (
                <div className="flex items-center gap-2 text-[12px] text-slate-500">
                  <MapPin className="h-3.5 w-3.5 shrink-0" />
                  {item.location}
                </div>
              )}
              <p className="text-[11px] text-slate-400 pt-1">
                Vendor terverifikasi dalam sistem kami. Hubungi via tombol di atas untuk mendapatkan penawaran resmi.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Submit dialogs */}
      {dialog && (
        <SubmitDialog
          mode={dialog}
          item={item}
          calc={calc}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
