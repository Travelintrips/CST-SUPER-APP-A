import { useState, useEffect } from "react";
import { useParams } from "wouter";

type OrderInfo = {
  id: number;
  orderNumber: string;
  serviceType: string;
  origin: string;
  destination: string;
  cargoDetail: string;
  status: string;
  etaFinal: string | null;
};

type Update = {
  id: number;
  status: string | null;
  notes: string | null;
  attachmentUrl: string | null;
  createdAt: string;
};

type TaskData = {
  token: string;
  roleType: string;
  label: string | null;
  order: OrderInfo;
  updates: Update[];
  availableStatuses: string[];
};

const STATUS_LABELS: Record<string, string> = {
  order_confirmed: "Order Dikonfirmasi",
  assigned_to_vendor: "Ditugaskan ke Vendor",
  waiting_pickup: "Menunggu Pickup",
  picked_up: "Sudah Pickup",
  in_progress: "Dalam Perjalanan",
  delivered: "Terkirim",
  pod_uploaded: "POD Diunggah",
  invoice_created: "Invoice Dibuat",
  payment_pending: "Menunggu Pembayaran",
  paid: "Sudah Dibayar",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export default function OrderTaskPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<TaskData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [newStatus, setNewStatus] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/order-task/${token}`)
      .then(async (r) => {
        const d = await r.json() as TaskData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Terjadi kesalahan");
        setData(d);
        setNewStatus(d.order.status);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!notes.trim() && !newStatus) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/order-task/${token}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus || undefined, notes: notes.trim() || undefined }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      setSubmitted(true);
      // Refresh data
      const r2 = await fetch(`/api/order-task/${token}`);
      const d2 = await r2.json() as TaskData;
      setData(d2);
      setNotes("");
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 text-center max-w-sm w-full shadow-sm">
        <div className="text-4xl mb-3">⚠️</div>
        <p className="text-sm text-slate-600">{error}</p>
      </div>
    </div>
  );

  if (!data) return null;

  const { order } = data;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-3">
            <span className="text-3xl">🚚</span>
            <div>
              <h1 className="text-lg font-bold text-slate-800">{order.orderNumber}</h1>
              <p className="text-sm text-slate-500">{order.serviceType} · {order.origin} → {order.destination}</p>
              {data.label && <p className="text-xs text-indigo-600 font-medium mt-0.5">{data.label}</p>}
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs bg-slate-100 text-slate-600 rounded-full px-3 py-1 font-medium">
              {STATUS_LABELS[order.status] ?? order.status}
            </span>
            {order.etaFinal && (
              <span className="text-xs text-slate-400">ETA: {order.etaFinal}</span>
            )}
          </div>
          {order.cargoDetail !== "—" && (
            <p className="text-xs text-slate-500 mt-2">📦 {order.cargoDetail}</p>
          )}
        </div>

        {/* Update form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <h2 className="font-semibold text-slate-800">📝 Kirim Update</h2>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Update Status</label>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
            >
              {data.availableStatuses.map(s => (
                <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Catatan Operasional</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Contoh: Barang sudah diambil pukul 09.00, estimasi tiba besok..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
            />
          </div>

          {submitted && (
            <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              ✅ Update berhasil dikirim!
            </div>
          )}

          <button
            type="submit"
            disabled={submitting || (!notes.trim() && newStatus === order.status)}
            className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors"
          >
            {submitting ? "Mengirim..." : "Kirim Update"}
          </button>
        </form>

        {/* Timeline */}
        {data.updates.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="font-semibold text-slate-800 mb-4">📅 Riwayat Update</h2>
            <div className="relative pl-4">
              <div className="absolute left-1 top-0 bottom-0 w-0.5 bg-slate-100" />
              <div className="space-y-4">
                {data.updates.map(u => (
                  <div key={u.id} className="relative">
                    <div className="absolute -left-[13px] top-1 w-2.5 h-2.5 rounded-full bg-indigo-400 border-2 border-white" />
                    <div className="pl-2">
                      {u.status && (
                        <span className="text-xs bg-indigo-50 text-indigo-700 rounded-full px-2 py-0.5 font-medium">
                          {STATUS_LABELS[u.status] ?? u.status}
                        </span>
                      )}
                      {u.notes && <p className="text-sm text-slate-700 mt-1">{u.notes}</p>}
                      {u.attachmentUrl && (
                        <a href={u.attachmentUrl} target="_blank" rel="noopener noreferrer"
                          className="text-xs text-blue-600 underline mt-1 block">
                          📎 Lihat Lampiran
                        </a>
                      )}
                      <p className="text-xs text-slate-400 mt-1">
                        {new Date(u.createdAt).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
