import { useState, useEffect } from "react";
import { CheckCircle2, AlertCircle, Loader2, Truck, MapPin, Package, User, Phone, ThumbsUp, ThumbsDown } from "lucide-react";

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
function apiUrl(path: string) { return `${BASE}${path}`; }

function fmt(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

function getTokenFromUrl(): string {
  const pathname = window.location.pathname;
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
  const relative = pathname.startsWith(base) ? pathname.slice(base.length) : pathname;
  const match = relative.match(/^\/confirm\/([^/]+)/);
  return match?.[1] ?? "";
}

interface ConfirmData {
  orderId: number;
  orderNumber: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  customerName: string;
  phone: string | null;
  finalSellingPrice: number;
  estimatedPickup: string | null;
  estimatedDelivery: string | null;
  vendorName: string | null;
  customerConfirmStatus: string;
}

export default function ConfirmPage() {
  const token = getTokenFromUrl();
  const [data, setData] = useState<ConfirmData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"confirmed" | "rejected" | null>(null);

  useEffect(() => {
    if (!token) {
      setError("Link konfirmasi tidak valid.");
      setLoading(false);
      return;
    }
    fetch(apiUrl(`/api/logistic/orders/confirm-form/${token}`))
      .then((r) => r.json())
      .then((d) => {
        if (d.message) { setError(d.message); }
        else {
          setData(d as ConfirmData);
          if (d.customerConfirmStatus === "confirmed") setDone("confirmed");
          else if (d.customerConfirmStatus === "rejected") setDone("rejected");
        }
      })
      .catch(() => setError("Gagal memuat data. Coba lagi."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleAction(action: "confirmed" | "rejected") {
    if (!token || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl(`/api/logistic/orders/confirm/${token}`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json() as { message?: string };
      if (!res.ok) { alert(json.message ?? "Terjadi kesalahan"); return; }
      setDone(action);
    } catch {
      alert("Gagal mengirim konfirmasi. Periksa koneksi internet Anda.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm">Memuat data...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Tidak Valid</h2>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (done === "confirmed") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <CheckCircle2 className="h-9 w-9 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Konfirmasi Diterima!</h2>
          <p className="text-sm text-slate-500 mb-4">
            Terima kasih, <strong>{data.customerName}</strong>. Anda telah menyetujui penawaran harga untuk order <strong>{data.orderNumber}</strong>.
          </p>
          <div className="bg-green-50 rounded-xl p-4 text-sm text-green-800 font-semibold text-lg">
            {fmt(data.finalSellingPrice)}
          </div>
          <p className="text-xs text-slate-400 mt-4">Tim kami akan segera menghubungi Anda untuk langkah selanjutnya.</p>
        </div>
      </div>
    );
  }

  if (done === "rejected") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
            <AlertCircle className="h-9 w-9 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800 mb-2">Penawaran Ditolak</h2>
          <p className="text-sm text-slate-500 mb-2">
            Penawaran untuk order <strong>{data.orderNumber}</strong> telah ditolak.
          </p>
          <p className="text-xs text-slate-400">Tim kami akan menghubungi Anda untuk mendiskusikan alternatif.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100">
            <Truck className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <p className="text-xs text-slate-500">Konfirmasi Penawaran</p>
            <p className="font-bold text-slate-800">{data.orderNumber}</p>
          </div>
        </div>

        {/* Detail Order */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Detail Order</h3>
          <div className="space-y-2 text-sm">
            <div className="flex items-start gap-2">
              <User className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-slate-700">{data.customerName}</span>
            </div>
            {data.phone && (
              <div className="flex items-start gap-2">
                <Phone className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <span className="text-slate-700">{data.phone}</span>
              </div>
            )}
            <div className="flex items-start gap-2">
              <Truck className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-slate-700">{data.shipmentType}</span>
            </div>
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
              <span className="text-slate-700">{data.origin} → {data.destination}</span>
            </div>
            {data.commodity && (
              <div className="flex items-start gap-2">
                <Package className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <span className="text-slate-700">{data.commodity}</span>
              </div>
            )}
          </div>
        </div>

        {/* Estimasi */}
        {(data.estimatedPickup || data.estimatedDelivery) && (
          <div className="bg-white rounded-2xl shadow-sm p-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">Estimasi</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {data.estimatedPickup && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Pickup</p>
                  <p className="font-medium text-slate-700">{data.estimatedPickup}</p>
                </div>
              )}
              {data.estimatedDelivery && (
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Delivery</p>
                  <p className="font-medium text-slate-700">{data.estimatedDelivery}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Harga */}
        <div className="bg-blue-600 rounded-2xl p-5 text-white text-center shadow-md">
          <p className="text-sm opacity-80 mb-1">Total Harga Penawaran</p>
          <p className="text-3xl font-bold">{fmt(data.finalSellingPrice)}</p>
          {data.vendorName && (
            <p className="text-xs opacity-70 mt-1">Dilayani oleh {data.vendorName}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="bg-white rounded-2xl shadow-sm p-4 space-y-3">
          <p className="text-sm text-slate-600 text-center">
            Apakah Anda menyetujui penawaran harga di atas?
          </p>
          <button
            onClick={() => handleAction("confirmed")}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:scale-95 text-white font-semibold rounded-xl py-3 transition-all disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsUp className="h-4 w-4" />}
            Ya, Saya Setuju
          </button>
          <button
            onClick={() => handleAction("rejected")}
            disabled={submitting}
            className="w-full flex items-center justify-center gap-2 border border-red-300 text-red-600 hover:bg-red-50 active:scale-95 font-medium rounded-xl py-3 transition-all disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ThumbsDown className="h-4 w-4" />}
            Tidak, Tolak Penawaran
          </button>
        </div>

        <p className="text-xs text-slate-400 text-center pb-4">
          Dengan menekan "Ya, Saya Setuju", Anda mengkonfirmasi persetujuan atas penawaran harga di atas.
        </p>
      </div>
    </div>
  );
}
