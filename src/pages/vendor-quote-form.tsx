import { useState, useEffect } from "react";
import { Truck, MapPin, Package, Weight, CheckCircle2, AlertCircle, Loader2, CalendarDays, ClipboardList } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
function apiUrl(path: string) {
  return `${BASE}${path}`;
}

interface RfqFormData {
  rfqNumber: string;
  orderNumber: string;
  vendorName: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  grossWeight: number | null;
  volumeCbm: number | null;
  requiredDate: string | null;
  alreadySubmitted: boolean;
}

function fmt(label: string, value: string | null | undefined) {
  if (!value) return null;
  return { label, value };
}

export default function VendorQuoteFormPage() {
  const params = new URLSearchParams(window.location.search);
  const rfqNumber = params.get("rfq") ?? "";
  const vendorId = params.get("v") ?? "";

  const [data, setData] = useState<RfqFormData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [vendorPrice, setVendorPrice] = useState("");
  const [estimatedPickup, setEstimatedPickup] = useState("");
  const [estimatedDelivery, setEstimatedDelivery] = useState("");
  const [estimatedDays, setEstimatedDays] = useState("");
  const [notes, setNotes] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!rfqNumber || !vendorId) {
      setError("Link tidak valid. Parameter rfq dan v diperlukan.");
      setLoading(false);
      return;
    }
    fetch(apiUrl(`/api/logistic/orders/rfq-form?rfq=${encodeURIComponent(rfqNumber)}&v=${encodeURIComponent(vendorId)}`))
      .then((r) => r.ok ? r.json() : r.json().then((e: { message: string }) => Promise.reject(e.message)))
      .then((d: RfqFormData) => {
        setData(d);
        if (d.alreadySubmitted) setSuccess(true);
      })
      .catch((msg: unknown) => setError(typeof msg === "string" ? msg : "Gagal memuat data RFQ"))
      .finally(() => setLoading(false));
  }, [rfqNumber, vendorId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const price = parseFloat(vendorPrice.replace(/[^\d.]/g, ""));
    if (isNaN(price) || price <= 0) {
      setSubmitError("Harga penawaran tidak valid");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: Record<string, unknown> = {
        rfqNumber,
        vendorId: parseInt(vendorId, 10),
        vendorPrice: price,
      };
      if (estimatedPickup) body.estimatedPickup = estimatedPickup;
      if (estimatedDelivery) body.estimatedDelivery = estimatedDelivery;
      if (estimatedDays) body.estimatedDays = parseInt(estimatedDays, 10);
      if (notes.trim()) body.notes = notes.trim();

      const r = await fetch(apiUrl("/api/logistic/orders/vendor-quote"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) {
        const e = await r.json() as { message?: string };
        throw new Error(e.message ?? "Gagal mengirim penawaran");
      }
      setSuccess(true);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : "Gagal mengirim penawaran");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="text-sm">Memuat data RFQ...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="bg-slate-800 rounded-2xl shadow-xl p-6 max-w-sm w-full text-center space-y-3">
          <AlertCircle className="w-10 h-10 text-red-400 mx-auto" />
          <h2 className="font-semibold text-white">RFQ Tidak Ditemukan</h2>
          <p className="text-sm text-slate-400">{error ?? "Link tidak valid atau sudah kedaluwarsa."}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900 px-4">
        <div className="bg-slate-800 rounded-2xl shadow-xl p-6 max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9 text-green-400" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-white">Penawaran Terkirim!</h2>
            <p className="text-sm text-slate-400 mt-1">Tim CST Logistics akan segera memproses penawaran Anda</p>
          </div>
          <div className="bg-slate-700 rounded-xl p-4 text-left space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-400">No. RFQ</span>
              <span className="font-mono text-white font-medium">{data.rfqNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">No. Order</span>
              <span className="font-mono text-white font-medium">{data.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Vendor</span>
              <span className="text-white font-medium">{data.vendorName}</span>
            </div>
            {vendorPrice && (
              <div className="flex justify-between border-t border-slate-600 pt-2 mt-2">
                <span className="text-slate-400">Harga Ditawarkan</span>
                <span className="text-green-400 font-bold">
                  Rp {Math.round(parseFloat(vendorPrice.replace(/[^\d.]/g, ""))).toLocaleString("id-ID")}
                </span>
              </div>
            )}
          </div>
          <p className="text-xs text-slate-500">Terima kasih atas partisipasi Anda</p>
        </div>
      </div>
    );
  }

  const infoRows = [
    fmt("Jenis", data.shipmentType),
    fmt("Rute", `${data.origin} → ${data.destination}`),
    fmt("Komoditi", data.commodity),
    fmt("Berat", data.grossWeight ? `${data.grossWeight} kg` : null),
    fmt("Volume", data.volumeCbm ? `${data.volumeCbm} CBM` : null),
    fmt("Tgl Butuh", data.requiredDate),
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="min-h-screen bg-slate-900 pb-10">
      {/* Header */}
      <div className="bg-slate-800 border-b border-slate-700 sticky top-0 z-10">
        <div className="max-w-lg mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div>
            <p className="text-xs text-slate-400 leading-none">Form Penawaran Vendor</p>
            <p className="font-mono text-sm font-semibold text-white leading-tight">{data.rfqNumber}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-slate-400">Vendor</p>
            <p className="text-sm font-semibold text-blue-400 max-w-[140px] truncate">{data.vendorName}</p>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 pt-4 space-y-4">
        {/* Detail Order */}
        <div className="bg-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="w-3.5 h-3.5" /> Detail Permintaan
          </h3>
          <div className="space-y-2.5">
            {infoRows.map(({ label, value }) => (
              <div key={label} className="flex items-start gap-3">
                <div className="w-4 mt-0.5 flex-shrink-0 text-slate-500">
                  {label === "Jenis" && <Truck className="w-4 h-4" />}
                  {label === "Rute" && <MapPin className="w-4 h-4" />}
                  {label === "Komoditi" && <Package className="w-4 h-4" />}
                  {(label === "Berat" || label === "Volume") && <Weight className="w-4 h-4" />}
                  {label === "Tgl Butuh" && <CalendarDays className="w-4 h-4" />}
                </div>
                <div>
                  <p className="text-xs text-slate-400">{label}</p>
                  <p className="text-sm text-white font-medium">{value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Form Penawaran */}
        <form onSubmit={handleSubmit} className="bg-slate-800 rounded-2xl p-4 space-y-4">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Isi Penawaran Anda</h3>

          {/* Harga Penawaran */}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">
              Harga Penawaran (Rp) <span className="text-red-400">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-yellow-400">Rp</span>
              <input
                type="number"
                required
                min={1}
                className="w-full bg-slate-700 border border-slate-600 rounded-xl pl-10 pr-4 py-3 text-white font-semibold text-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder-slate-500"
                value={vendorPrice}
                onChange={(e) => setVendorPrice(e.target.value)}
                placeholder="0"
              />
            </div>
            {vendorPrice && !isNaN(parseFloat(vendorPrice)) && parseFloat(vendorPrice) > 0 && (
              <p className="text-xs text-slate-400 mt-1 ml-1">
                = Rp {Math.round(parseFloat(vendorPrice)).toLocaleString("id-ID")}
              </p>
            )}
          </div>

          {/* ETA */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Est. Pickup</label>
              <input
                type="date"
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={estimatedPickup}
                onChange={(e) => setEstimatedPickup(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">Est. Tiba</label>
              <input
                type="date"
                className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={estimatedDelivery}
                onChange={(e) => setEstimatedDelivery(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Estimasi Hari Pengiriman</label>
            <input
              type="number"
              min={1}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500"
              value={estimatedDays}
              onChange={(e) => setEstimatedDays(e.target.value)}
              placeholder="misal: 3"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Catatan Tambahan</label>
            <textarea
              rows={3}
              className="w-full bg-slate-700 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder-slate-500 resize-none"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Syarat & kondisi, catatan khusus, dll..."
            />
          </div>

          {submitError && (
            <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{submitError}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || !vendorPrice}
            className="w-full py-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-base shadow-lg shadow-blue-900/40"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Mengirim...
              </>
            ) : (
              <>
                <CheckCircle2 className="w-5 h-5" />
                Kirim Penawaran
              </>
            )}
          </button>
        </form>

        <p className="text-center text-xs text-slate-500 pb-4">
          CST Logistics · Form ini hanya untuk vendor yang mendapat undangan RFQ
        </p>
      </div>
    </div>
  );
}
