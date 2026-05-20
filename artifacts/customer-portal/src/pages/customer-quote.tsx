import { useState, useEffect } from "react";
import { useParams } from "wouter";

type QuoteData = {
  token: string;
  status: string;
  isExpired: boolean;
  isResponded: boolean;
  rfqNumber: string;
  serviceType: string;
  origin: string;
  destination: string;
  cargoDetail: string;
  finalCustomerPrice: number | null;
  etaFinal: string | null;
  termsConditions: string | null;
  quoteNotes: string | null;
  validUntil: string | null;
};

const idr = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export default function CustomerQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<QuoteData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [action, setAction] = useState<"approve" | "revise" | "reject" | null>(null);
  const [revisionNotes, setRevisionNotes] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/customer-quote/${token}`)
      .then(async (r) => {
        const d = await r.json() as QuoteData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Terjadi kesalahan");
        setData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async () => {
    if (!action) return;
    if (action === "revise" && !revisionNotes.trim()) {
      alert("Catatan revisi wajib diisi.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/customer-quote/${token}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: action, revisionNotes, rejectionReason }),
      });
      const d = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal mengirim respons");
      setSubmitResult({ ok: true, message: d.message ?? "Berhasil" });
    } catch (e: unknown) {
      setSubmitResult({ ok: false, message: (e as Error).message });
    } finally {
      setSubmitting(false);
      setConfirmOpen(false);
      setAction(null);
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorPage message={error} />;
  if (!data) return <ErrorPage message="Data tidak ditemukan" />;

  if (submitResult?.ok) {
    const emoji = action === "approve" ? "✅" : action === "revise" ? "🔄" : "❌";
    return (
      <SuccessPage
        emoji={emoji}
        title={action === "approve" ? "Penawaran Disetujui!" : action === "revise" ? "Revisi Terkirim" : "Penolakan Dicatat"}
        message={submitResult.message}
      />
    );
  }

  if (data.isExpired) {
    return <ErrorPage message="Link penawaran ini sudah kadaluarsa. Silakan hubungi tim kami." />;
  }

  if (data.isResponded) {
    const statusMap: Record<string, string> = {
      approved: "Anda sudah menyetujui penawaran ini.",
      revision_requested: "Anda sudah mengirimkan permintaan revisi.",
      rejected: "Anda sudah menolak penawaran ini.",
    };
    return <ErrorPage message={statusMap[data.status] ?? "Penawaran ini sudah dijawab."} type="info" />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">📋</span>
            <div>
              <h1 className="text-xl font-bold text-slate-800">Penawaran Harga</h1>
              <p className="text-sm text-slate-500">Nomor: {data.rfqNumber}</p>
            </div>
          </div>
          {data.quoteNotes && (
            <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
              {data.quoteNotes}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Detail Pengiriman</h2>
          <div className="space-y-3">
            <Row label="Layanan" value={data.serviceType} />
            <Row label="Asal" value={data.origin} />
            <Row label="Tujuan" value={data.destination} />
            <Row label="Kargo" value={data.cargoDetail} />
          </div>
        </div>

        {/* Pricing */}
        <div className="bg-white rounded-2xl shadow-sm border border-blue-100 p-6">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Detail Penawaran</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-slate-600">Harga Final</span>
              <span className="text-xl font-bold text-blue-700">{idr(data.finalCustomerPrice)}</span>
            </div>
            {data.etaFinal && <Row label="Estimasi Waktu" value={data.etaFinal} />}
            {data.validUntil && (
              <Row label="Berlaku Hingga" value={new Date(data.validUntil).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })} />
            )}
          </div>
        </div>

        {data.termsConditions && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3">Syarat &amp; Ketentuan</h2>
            <p className="text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">{data.termsConditions}</p>
          </div>
        )}

        {/* Actions */}
        {!action ? (
          <div className="space-y-3">
            <button
              onClick={() => { setAction("approve"); setConfirmOpen(true); }}
              className="w-full py-3.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              ✅ Setuju &amp; Konfirmasi
            </button>
            <button
              onClick={() => setAction("revise")}
              className="w-full py-3.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-semibold text-sm transition-colors active:scale-95"
            >
              🔄 Minta Revisi
            </button>
            <button
              onClick={() => setAction("reject")}
              className="w-full py-3.5 rounded-xl bg-white border border-red-300 hover:bg-red-50 text-red-600 font-semibold text-sm transition-colors active:scale-95"
            >
              ❌ Tolak Penawaran
            </button>
          </div>
        ) : action === "revise" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-amber-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Catatan Revisi</h2>
            <p className="text-sm text-slate-500">Tuliskan hal yang ingin direvisi. Tim kami akan segera menindaklanjuti.</p>
            <textarea
              value={revisionNotes}
              onChange={e => setRevisionNotes(e.target.value)}
              rows={4}
              required
              placeholder="Contoh: Mohon review harga karena budget terbatas, atau ETA terlalu lama..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setAction(null)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium">
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !revisionNotes.trim()}
                className="flex-1 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white text-sm font-semibold"
              >
                {submitting ? "Mengirim..." : "Kirim Revisi"}
              </button>
            </div>
          </div>
        ) : action === "reject" ? (
          <div className="bg-white rounded-2xl shadow-sm border border-red-200 p-6 space-y-4">
            <h2 className="font-semibold text-slate-800">Tolak Penawaran</h2>
            <textarea
              value={rejectionReason}
              onChange={e => setRejectionReason(e.target.value)}
              rows={3}
              placeholder="Alasan penolakan (opsional)..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300 resize-none"
            />
            <div className="flex gap-2">
              <button onClick={() => setAction(null)} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm font-medium">
                Batal
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="flex-1 py-2.5 rounded-lg bg-red-500 hover:bg-red-600 disabled:bg-slate-300 text-white text-sm font-semibold"
              >
                {submitting ? "Mengirim..." : "Konfirmasi Tolak"}
              </button>
            </div>
          </div>
        ) : null}

        {/* Approve confirmation modal */}
        {confirmOpen && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
              <h2 className="text-lg font-bold text-slate-800 mb-2">Konfirmasi Persetujuan</h2>
              <p className="text-sm text-slate-600 mb-1">Anda akan menyetujui penawaran berikut:</p>
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm mb-4">
                <p className="font-semibold text-green-800">{data.rfqNumber}</p>
                <p className="text-green-700">{data.origin} → {data.destination}</p>
                <p className="text-lg font-bold text-green-700 mt-1">{idr(data.finalCustomerPrice)}</p>
              </div>
              <p className="text-xs text-slate-400 mb-4">Dengan menekan Setuju, Anda menyetujui penawaran dan syarat yang berlaku.</p>
              <div className="flex gap-2">
                <button onClick={() => { setConfirmOpen(false); setAction(null); }} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 text-sm">
                  Batal
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 py-2.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold"
                >
                  {submitting ? "Mengirim..." : "✅ Setuju"}
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400 pb-4">
          CST Logistics · Pertanyaan? Hubungi tim kami.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

function Loader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Memuat penawaran...</span>
      </div>
    </div>
  );
}

function ErrorPage({ message, type = "error" }: { message: string; type?: "error" | "info" }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">{type === "info" ? "ℹ️" : "⚠️"}</div>
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}

function SuccessPage({ emoji, title, message }: { emoji: string; title: string; message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
        <div className="text-6xl mb-4">{emoji}</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}
