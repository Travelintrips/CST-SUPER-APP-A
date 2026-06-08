import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, MapPin, Clock, Tag, Building2, Truck, CheckCircle2,
  Phone, User, MessageSquare, Hash, Package,
} from "lucide-react";

interface CatalogDetail {
  id: number;
  vendorId: number;
  vendorName: string | null;
  templateKind: string | null;
  categoryKey: string | null;
  serviceType: string | null;
  name: string;
  description: string | null;
  kategori: string | null;
  subcategory: string | null;
  specValues: unknown;
  templateSnapshot: unknown;
  priceSell: number | null;
  currency: string;
  unit: string | null;
  moq: number | null;
  stockStatus: string | null;
  leadTime: string | null;
  location: string | null;
  origin: string | null;
  primaryImageUrl: string | null;
  hasVideo: boolean;
  media: Array<{
    id: number;
    mediaType: string;
    fileUrl: string | null;
    externalUrl: string | null;
    thumbnailUrl: string | null;
    isPrimary: boolean;
    title: string | null;
  }>;
}

function formatIDR(v: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(v);
}

function SpecGrid({ specValues, templateSnapshot }: { specValues: unknown; templateSnapshot: unknown }) {
  const specs = specValues && typeof specValues === "object" ? specValues as Record<string, unknown> : {};
  const snapshot = templateSnapshot && typeof templateSnapshot === "object" ? templateSnapshot as Record<string, unknown> : {};

  const fields: Array<{ key: string; label: string; type: string; section?: string }> = [];
  if (Array.isArray(snapshot["customFields"])) {
    fields.push(...(snapshot["customFields"] as typeof fields));
  } else if (Array.isArray(snapshot["fields"])) {
    (snapshot["fields"] as typeof fields)
      .filter((f) => f.section === "quotation" || f.section === "both" || !f.section)
      .forEach((f) => fields.push(f));
  }

  const filled = fields.filter(
    (f) => f.type !== "textarea" && specs[f.key] !== undefined && specs[f.key] !== null && String(specs[f.key]).trim() !== "",
  );
  if (filled.length === 0) return null;

  return (
    <div>
      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Spesifikasi</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {filled.map((f) => (
          <div key={f.key} className="bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">
            <div className="text-[10px] text-slate-400 font-semibold mb-0.5">{f.label}</div>
            <div className="text-[13px] font-bold text-slate-800">{String(specs[f.key])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

type QuotePayload = {
  customerName: string;
  phone: string;
  qty: number;
  unit: string;
  notes: string;
};

export default function JasaVendorDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [form, setForm] = useState<QuotePayload>({ customerName: "", phone: "", qty: 1, unit: "", notes: "" });
  const [submitted, setSubmitted] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");

  const { data: item, isLoading, isError } = useQuery<CatalogDetail>({
    queryKey: ["jasa-vendor-detail", id],
    queryFn: async () => {
      const r = await fetch(`/api/portal/marketplace/${id}`);
      if (!r.ok) throw new Error("not_found");
      return r.json();
    },
    enabled: !!id && !isNaN(Number(id)),
    retry: false,
  });

  const quoteMutation = useMutation({
    mutationFn: async (payload: QuotePayload) => {
      const r = await fetch(`/api/portal/marketplace/${id}/quote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: payload.customerName,
          phone: payload.phone,
          qty: payload.qty,
          unit: payload.unit || item?.unit || "unit",
          notes: payload.notes,
        }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(e.error ?? "Gagal mengirim permintaan");
      }
      return r.json() as Promise<{ orderNumber: string }>;
    },
    onSuccess: (data) => {
      setOrderNumber(data.orderNumber);
      setSubmitted(true);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Gagal mengirim", description: err.message });
    },
  });

  function handleBack() {
    window.history.length > 1 ? window.history.back() : setLocation("/marketplace");
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="h-10 w-10 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
          <p className="text-[13px] text-slate-400 font-semibold">Memuat detail layanan…</p>
        </div>
      </div>
    );
  }

  if (isError || !item || item.templateKind !== "service") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-5 bg-slate-50 px-4">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center">
          <Truck className="h-8 w-8 text-slate-300" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Layanan tidak ditemukan</h2>
          <p className="text-[13px] text-slate-500">Item ini tidak tersedia atau belum dipublikasikan.</p>
        </div>
        <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/marketplace")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali ke Marketplace
        </Button>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-slate-50 px-4">
        <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-bold text-slate-800 mb-1">Permintaan Terkirim!</h2>
          <p className="text-[13px] text-slate-500 mb-2">
            Tim kami akan segera menghubungi Anda untuk konfirmasi.
          </p>
          {orderNumber && (
            <div className="inline-flex items-center gap-1.5 bg-sky-50 border border-sky-200 rounded-lg px-3 py-1.5 text-[12px] font-mono font-semibold text-sky-700">
              <Hash className="h-3.5 w-3.5" />
              {orderNumber}
            </div>
          )}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" className="rounded-xl" onClick={() => setLocation("/marketplace")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Kembali ke Marketplace
          </Button>
          <Button className="rounded-xl bg-sky-600 hover:bg-sky-700" onClick={() => setSubmitted(false)}>
            Ajukan Lagi
          </Button>
        </div>
      </div>
    );
  }

  const serviceLabel = item.serviceType ?? item.kategori ?? item.categoryKey ?? "Layanan";
  const hasImage = !!item.primaryImageUrl;

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div
        style={{
          background: "linear-gradient(135deg, #0B3D6B 0%, #0D6EBF 55%, #1E9FE8 100%)",
          paddingTop: "clamp(20px, 3vw, 32px)",
          paddingBottom: "clamp(16px, 2.5vw, 24px)",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "absolute", inset: 0, pointerEvents: "none",
            backgroundImage: "radial-gradient(rgba(255,255,255,0.10) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
        <div className="max-w-4xl mx-auto px-4 md:px-8 relative">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 mb-4 text-[12px] font-semibold rounded-lg px-3 py-1.5"
            style={{
              color: "rgba(255,255,255,0.85)",
              background: "rgba(255,255,255,0.10)",
              border: "1.5px solid rgba(255,255,255,0.20)",
            }}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Kembali
          </button>

          <div className="flex items-start gap-4">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.25)" }}
            >
              <Truck className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span
                  className="text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full"
                  style={{ background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.90)" }}
                >
                  {serviceLabel}
                </span>
                {item.stockStatus === "available" && (
                  <span
                    className="text-[11px] font-semibold px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(34,197,94,0.20)", color: "rgba(255,255,255,0.95)", border: "1px solid rgba(34,197,94,0.35)" }}
                  >
                    Tersedia
                  </span>
                )}
              </div>
              <h1
                className="text-white font-extrabold leading-tight"
                style={{ fontSize: "clamp(18px, 2.5vw, 28px)", textShadow: "0 2px 12px rgba(0,0,0,0.20)" }}
              >
                {item.name}
              </h1>
              {item.vendorName && (
                <div className="flex items-center gap-1.5 mt-1.5">
                  <Building2 className="h-3.5 w-3.5" style={{ color: "rgba(255,255,255,0.65)" }} />
                  <span className="text-[13px] font-semibold" style={{ color: "rgba(255,255,255,0.80)" }}>
                    {item.vendorName}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      <div className="max-w-4xl mx-auto px-4 md:px-8 mt-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Left column: detail ─────────────────────────────────── */}
          <div className="lg:col-span-2 space-y-5">

            {/* Image */}
            {hasImage && (
              <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shadow-sm" style={{ height: 240 }}>
                <img
                  src={item.primaryImageUrl!}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).parentElement!.style.display = "none"; }}
                />
              </div>
            )}

            {/* Price */}
            {item.priceSell != null && (
              <div
                className="rounded-2xl px-5 py-4 border"
                style={{
                  background: "linear-gradient(135deg, #EFF6FF 0%, #DBEAFE 100%)",
                  borderColor: "rgba(59,130,246,0.25)",
                }}
              >
                <p className="text-[11px] font-semibold text-sky-600 uppercase tracking-wider mb-0.5">Harga Jual</p>
                <div className="flex items-baseline gap-2">
                  <span className="text-[26px] font-extrabold text-sky-700 leading-none">
                    {item.currency === "USD"
                      ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(item.priceSell)
                      : formatIDR(item.priceSell)}
                  </span>
                  {item.unit && (
                    <span className="text-[14px] text-sky-500 font-medium">/ {item.unit}</span>
                  )}
                </div>
                {item.moq != null && item.moq > 1 && (
                  <p className="text-[12px] text-sky-600 mt-1">Minimum order: {item.moq} {item.unit ?? "unit"}</p>
                )}
              </div>
            )}

            {/* Description */}
            {item.description && (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Deskripsi</p>
                <p className="text-[13.5px] text-slate-700 leading-relaxed whitespace-pre-line">{item.description}</p>
              </div>
            )}

            {/* Specs */}
            {(item.specValues || item.templateSnapshot) && (
              <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
                <SpecGrid specValues={item.specValues} templateSnapshot={item.templateSnapshot} />
              </div>
            )}

            {/* Meta */}
            <div className="bg-white rounded-2xl border border-slate-200 px-5 py-4 shadow-sm">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Informasi Layanan</p>
              <div className="grid grid-cols-2 gap-3">
                {item.location && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold">Lokasi</p>
                      <p className="text-[13px] text-slate-700 font-medium">{item.location}</p>
                    </div>
                  </div>
                )}
                {item.origin && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold">Asal</p>
                      <p className="text-[13px] text-slate-700 font-medium">{item.origin}</p>
                    </div>
                  </div>
                )}
                {item.leadTime && (
                  <div className="flex items-start gap-2">
                    <Clock className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold">Lead Time</p>
                      <p className="text-[13px] text-slate-700 font-medium">{item.leadTime}</p>
                    </div>
                  </div>
                )}
                {item.moq != null && (
                  <div className="flex items-start gap-2">
                    <Tag className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold">Minimum Order</p>
                      <p className="text-[13px] text-slate-700 font-medium">{item.moq} {item.unit ?? "unit"}</p>
                    </div>
                  </div>
                )}
                {item.stockStatus && (
                  <div className="flex items-start gap-2">
                    <Package className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-slate-400 font-semibold">Status</p>
                      <p className="text-[13px] text-slate-700 font-medium">{item.stockStatus}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Right column: quote form ─────────────────────────────── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-5 sticky top-4">
              <p className="text-[14px] font-bold text-slate-800 mb-1">Minta Penawaran</p>
              <p className="text-[12px] text-slate-500 mb-4 leading-relaxed">
                Isi form berikut — tim kami akan menghubungi Anda secepatnya.
              </p>

              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5" />
                    Nama Lengkap <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Nama perusahaan / perorangan"
                    value={form.customerName}
                    onChange={(e) => setForm((p) => ({ ...p, customerName: e.target.value }))}
                    className="h-9 text-[13px] rounded-xl border-slate-200"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    No. WhatsApp <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="628xxxxxxxxxx"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className="h-9 text-[13px] rounded-xl border-slate-200"
                    type="tel"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[12px] font-semibold text-slate-600">Kuantitas</Label>
                    <Input
                      type="number"
                      min={1}
                      value={form.qty}
                      onChange={(e) => setForm((p) => ({ ...p, qty: Math.max(1, Number(e.target.value) || 1) }))}
                      className="h-9 text-[13px] rounded-xl border-slate-200"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[12px] font-semibold text-slate-600">Satuan</Label>
                    <Input
                      placeholder={item.unit ?? "unit"}
                      value={form.unit}
                      onChange={(e) => setForm((p) => ({ ...p, unit: e.target.value }))}
                      className="h-9 text-[13px] rounded-xl border-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-[12px] font-semibold text-slate-600 flex items-center gap-1.5">
                    <MessageSquare className="h-3.5 w-3.5" />
                    Catatan / Spesifikasi Tambahan
                  </Label>
                  <Textarea
                    placeholder="Rute, tanggal, jenis kargo, atau kebutuhan khusus..."
                    value={form.notes}
                    onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
                    className="text-[13px] rounded-xl border-slate-200 resize-none"
                    rows={3}
                  />
                </div>

                <Button
                  className="w-full h-10 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-[13px]"
                  disabled={quoteMutation.isPending || !form.customerName.trim() || !form.phone.trim()}
                  onClick={() => quoteMutation.mutate(form)}
                >
                  {quoteMutation.isPending ? "Mengirim…" : "Kirim Permintaan"}
                </Button>
              </div>

              <Separator className="my-4" />

              <div className="text-center">
                <p className="text-[11px] text-slate-400 mb-2">Atau langsung hubungi kami</p>
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(`Halo, saya tertarik dengan layanan: ${item.name}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-[12px] font-semibold text-emerald-600 hover:text-emerald-700"
                >
                  <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                  </svg>
                  WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
