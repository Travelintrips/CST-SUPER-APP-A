import { useState, useEffect } from "react";
import { useParams } from "wouter";

type Vendor = {
  id: number;
  name: string;
  phone: string | null;
  email: string | null;
  serviceType: string | null;
  eta: string | null;
  fee: string | null;
  note: string | null;
  isMatching: boolean;
};

type Rfq = {
  id: number;
  rfqNumber: string;
  status: string;
  createdAt: string;
};

type OrderInfo = {
  id: number;
  orderNumber: string;
  customerName: string;
  serviceType: string | null;
  origin: string;
  destination: string;
  commodity: string | null;
  status: string;
};

type ReviewData = {
  token: string;
  actionType: string;
  isUsed: boolean;
  usedAt: string | null;
  order: OrderInfo;
  vendors: Vendor[];
  rfqs: Rfq[];
};

type BlastResult = {
  vendorId: number;
  vendorName: string;
  sent: boolean;
};

type BlastResponse = {
  ok: boolean;
  rfqId: number;
  rfqNumber: string;
  results: BlastResult[];
  compareUrl: string;
};

const idr = (n: number | string | null | undefined) =>
  n == null ? "—" : `Rp ${Number(n).toLocaleString("id-ID")}`;

const RFQ_STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  admin_review: "Review",
  rfq_sent: "Terkirim",
  vendor_blasted: "Di-blast",
  vendor_selected: "Vendor Dipilih",
  customer_quoted: "Quoted",
  customer_approved: "Disetujui",
  customer_rejected: "Ditolak",
  closed: "Ditutup",
};

export default function AdminReviewPage() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ReviewData | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deadlineHours, setDeadlineHours] = useState(48);
  const [showAll, setShowAll] = useState(false);
  const [blasting, setBlasting] = useState(false);
  const [blastResult, setBlastResult] = useState<BlastResponse | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin-action/${token}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `Error ${r.status}`);
        }
        return r.json() as Promise<ReviewData>;
      })
      .then((d) => {
        setData(d);
        // Pre-select matching vendors
        const matchingIds = new Set(
          (d.vendors ?? []).filter((v) => v.isMatching).map((v) => v.id)
        );
        setSelected(matchingIds);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const toggleVendor = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBlast = async () => {
    if (!data || selected.size === 0) return;
    setBlasting(true);
    try {
      const r = await fetch(`/api/admin-action/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds: Array.from(selected), deadlineHours }),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? "Gagal blast");
      setBlastResult(body as BlastResponse);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setBlasting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Memuat data order…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-sm w-full text-center space-y-3">
          <div className="text-5xl">⚠️</div>
          <h2 className="text-lg font-semibold text-slate-800">Link Tidak Valid</h2>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { order, vendors = [], rfqs = [] } = data;
  const matching = vendors.filter((v) => v.isMatching);
  const others = vendors.filter((v) => !v.isMatching);
  const visibleOthers = showAll ? others : others.slice(0, 5);
  const latestRfq = rfqs[0] ?? null;

  // ── Blast success screen ──────────────────────────────────────────────────
  if (blastResult) {
    const sentCount = blastResult.results.filter((r) => r.sent).length;
    const failedCount = blastResult.results.filter((r) => !r.sent).length;
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full space-y-5">
          <div className="text-center space-y-2">
            <div className="text-5xl">✅</div>
            <h2 className="text-xl font-bold text-slate-800">RFQ Terkirim!</h2>
            <p className="text-slate-500 text-sm">
              {blastResult.rfqNumber} — {sentCount} vendor berhasil dihubungi
              {failedCount > 0 && `, ${failedCount} gagal`}
            </p>
          </div>
          <div className="space-y-2">
            {blastResult.results.map((r) => (
              <div
                key={r.vendorId}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm ${
                  r.sent ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"
                }`}
              >
                <span>{r.sent ? "✅" : "❌"}</span>
                <span className="font-medium">{r.vendorName}</span>
                <span className="ml-auto text-xs">{r.sent ? "Terkirim" : "Gagal"}</span>
              </div>
            ))}
          </div>
          {blastResult.compareUrl && (
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-4 space-y-2">
              <p className="text-xs text-blue-700 font-semibold uppercase tracking-wide">Langkah Selanjutnya</p>
              <p className="text-sm text-slate-600">
                Setelah vendor mengisi penawaran, bandingkan dan pilih vendor terbaik:
              </p>
              <a
                href={blastResult.compareUrl}
                className="block text-center bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
              >
                🔍 Bandingkan Penawaran Vendor →
              </a>
            </div>
          )}
          <button
            onClick={() => setBlastResult(null)}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-600 underline"
          >
            Kembali ke halaman review
          </button>
        </div>
      </div>
    );
  }

  // ── Main review screen ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <span className="text-2xl">🚀</span>
          <div>
            <h1 className="text-base font-bold text-slate-800 leading-tight">Review & Blast Vendor</h1>
            <p className="text-xs text-slate-400">CST Logistics — Admin Panel</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5 space-y-5">

        {/* Order Summary */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-white/80 text-xs font-medium uppercase tracking-wider">Order Baru</span>
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                order.status === "New Order" ? "bg-yellow-400 text-yellow-900"
                : order.status === "Cancelled" ? "bg-red-400 text-red-900"
                : "bg-green-400 text-green-900"
              }`}>
                {order.status}
              </span>
            </div>
            <p className="text-white font-bold text-lg mt-1 font-mono">{order.orderNumber}</p>
          </div>
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-sm">
              <div>
                <p className="text-slate-400 text-xs">Customer</p>
                <p className="font-semibold text-slate-800">{order.customerName}</p>
              </div>
              <div>
                <p className="text-slate-400 text-xs">Layanan</p>
                <p className="font-semibold text-slate-800">{order.serviceType ?? "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-slate-400 text-xs">Rute</p>
                <p className="font-semibold text-slate-800">
                  {order.origin || "—"} → {order.destination || "—"}
                </p>
              </div>
              {order.commodity && (
                <div className="col-span-2">
                  <p className="text-slate-400 text-xs">Komoditi</p>
                  <p className="font-semibold text-slate-800">{order.commodity}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Existing RFQs banner */}
        {latestRfq && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-3">
            <span className="text-xl mt-0.5">⚠️</span>
            <div>
              <p className="text-amber-800 font-semibold text-sm">RFQ sudah pernah dibuat</p>
              <p className="text-amber-700 text-xs mt-0.5">
                {latestRfq.rfqNumber} — Status: <strong>{RFQ_STATUS_LABEL[latestRfq.status] ?? latestRfq.status}</strong>
              </p>
              <p className="text-amber-600 text-xs mt-1">
                Melanjutkan blast akan menambah vendor ke RFQ yang sudah ada.
              </p>
            </div>
          </div>
        )}

        {/* Deadline */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-4">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            ⏰ Batas Waktu Respon Vendor
          </label>
          <div className="flex items-center gap-3">
            {[24, 48, 72].map((h) => (
              <button
                key={h}
                onClick={() => setDeadlineHours(h)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                  deadlineHours === h
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-300"
                }`}
              >
                {h} jam
              </button>
            ))}
            <div className="flex items-center gap-1.5 flex-1">
              <input
                type="number"
                value={deadlineHours}
                onChange={(e) => setDeadlineHours(Number(e.target.value))}
                min={1}
                max={168}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-300"
              />
              <span className="text-slate-400 text-xs shrink-0">jam</span>
            </div>
          </div>
        </div>

        {/* Vendor Selection */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-800">Pilih Vendor</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {selected.size} vendor dipilih · {vendors.length} total aktif
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setSelected(new Set(vendors.map((v) => v.id)))}
                className="text-xs text-blue-600 hover:underline font-medium"
              >
                Pilih Semua
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={() => setSelected(new Set())}
                className="text-xs text-slate-400 hover:underline"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Matching vendors */}
          {matching.length > 0 && (
            <div>
              <div className="px-5 py-2 bg-emerald-50 border-b border-emerald-100">
                <p className="text-xs font-semibold text-emerald-700 uppercase tracking-wide">
                  ✅ Sesuai Layanan ({matching.length})
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {matching.map((v) => (
                  <VendorRow key={v.id} vendor={v} checked={selected.has(v.id)} onChange={() => toggleVendor(v.id)} />
                ))}
              </div>
            </div>
          )}

          {/* Other vendors */}
          {others.length > 0 && (
            <div>
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  Vendor Lain ({others.length})
                </p>
              </div>
              <div className="divide-y divide-slate-50">
                {visibleOthers.map((v) => (
                  <VendorRow key={v.id} vendor={v} checked={selected.has(v.id)} onChange={() => toggleVendor(v.id)} />
                ))}
              </div>
              {others.length > 5 && (
                <div className="px-5 py-3 border-t border-slate-100">
                  <button
                    onClick={() => setShowAll((p) => !p)}
                    className="text-xs text-blue-600 hover:underline font-medium"
                  >
                    {showAll ? "Tampilkan lebih sedikit ▲" : `Tampilkan ${others.length - 5} vendor lainnya ▼`}
                  </button>
                </div>
              )}
            </div>
          )}

          {vendors.length === 0 && (
            <div className="px-5 py-8 text-center text-slate-400 text-sm">
              Tidak ada vendor aktif dengan nomor HP yang tersimpan.
            </div>
          )}
        </div>

        {/* Blast Button */}
        <button
          onClick={handleBlast}
          disabled={blasting || selected.size === 0}
          className={`w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 transition-all ${
            selected.size === 0
              ? "bg-slate-200 text-slate-400 cursor-not-allowed"
              : "bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md shadow-blue-200"
          }`}
        >
          {blasting ? (
            <>
              <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              Mengirim…
            </>
          ) : (
            <>
              📤 Blast ke {selected.size} Vendor
            </>
          )}
        </button>

        <p className="text-center text-xs text-slate-400 pb-8">
          Vendor akan menerima WA dengan link form penawaran · {deadlineHours} jam batas waktu
        </p>
      </div>
    </div>
  );
}

function VendorRow({
  vendor,
  checked,
  onChange,
}: {
  vendor: Vendor;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label
      className={`flex items-start gap-3.5 px-5 py-3.5 cursor-pointer transition-colors ${
        checked ? "bg-blue-50/60" : "hover:bg-slate-50"
      }`}
    >
      <div className="mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={onChange}
          className="w-4.5 h-4.5 rounded accent-blue-600"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-800 text-sm">{vendor.name}</span>
          {vendor.isMatching && (
            <span className="text-[10px] bg-emerald-100 text-emerald-700 font-medium px-1.5 py-0.5 rounded-full">
              Sesuai
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {vendor.phone && (
            <span className="text-xs text-slate-500">📱 {vendor.phone}</span>
          )}
          {vendor.serviceType && (
            <span className="text-xs text-slate-400">{vendor.serviceType}</span>
          )}
          {vendor.fee && (
            <span className="text-xs text-slate-400">~{vendor.fee}</span>
          )}
          {vendor.eta && (
            <span className="text-xs text-slate-400">ETA {vendor.eta}</span>
          )}
        </div>
        {vendor.note && (
          <p className="text-xs text-slate-400 mt-0.5 italic">{vendor.note}</p>
        )}
      </div>
    </label>
  );
}
