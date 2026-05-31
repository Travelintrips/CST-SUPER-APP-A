import { useEffect, useState } from "react";
import { useParams } from "wouter";

type PageData = {
  orderNumber: string;
  customerName: string;
  origin: string | null;
  destination: string | null;
  driverName: string | null;
  completedSteps: string[];
  allowedSteps: string[];
  stepLabel: Record<string, string>;
};

const STEP_ICON: Record<string, string> = {
  PICKUP:     "🚛",
  IN_TRANSIT: "🛣️",
  ARRIVED:    "📍",
  DELIVERED:  "📦",
  COMPLETED:  "✅",
};

export default function DriverProgressPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/driver-progress/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); } else { setData(d); }
      })
      .catch(() => setError("Gagal memuat data."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleUpdate(stepKey: string) {
    if (!data) return;
    setSubmitting(stepKey);
    try {
      const r = await fetch(`/api/driver-progress/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey }),
      });
      const d = await r.json();
      if (!r.ok || d.error) {
        alert(d.error ?? "Gagal memperbarui status.");
      } else {
        setSuccess(`Status "${data.stepLabel[stepKey] ?? stepKey}" berhasil diperbarui.`);
        setData((prev) =>
          prev
            ? {
                ...prev,
                completedSteps: [...prev.completedSteps, stepKey],
                allowedSteps: prev.allowedSteps.filter((s) => s !== stepKey),
              }
            : prev
        );
      }
    } catch {
      alert("Gagal terhubung ke server.");
    } finally {
      setSubmitting(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-500 text-sm">Memuat...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-xl shadow p-6 max-w-sm w-full text-center">
          <p className="text-2xl mb-2">⚠️</p>
          <p className="text-gray-700 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-4 flex flex-col items-center">
      <div className="w-full max-w-sm space-y-4 mt-6">
        {/* Header */}
        <div className="bg-white rounded-xl shadow p-4">
          <p className="text-xs text-gray-400 uppercase font-semibold tracking-wide mb-1">Update Pengiriman</p>
          <p className="text-lg font-bold text-gray-800">{data.orderNumber}</p>
          <p className="text-sm text-gray-600">{data.customerName}</p>
          {data.origin && data.destination && (
            <p className="text-xs text-gray-500 mt-1">{data.origin} → {data.destination}</p>
          )}
          {data.driverName && (
            <p className="text-xs text-gray-500 mt-0.5">👤 {data.driverName}</p>
          )}
        </div>

        {/* Success */}
        {success && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
            ✅ {success}
          </div>
        )}

        {/* Completed steps */}
        {data.completedSteps.length > 0 && (
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Sudah Diupdate</p>
            <div className="space-y-2">
              {data.completedSteps.map((s) => (
                <div key={s} className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{STEP_ICON[s] ?? "•"}</span>
                  <span className="line-through">{data.stepLabel[s] ?? s}</span>
                  <span className="ml-auto text-green-500 text-xs">✓</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Allowed steps */}
        {data.allowedSteps.length > 0 ? (
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Pilih Status Sekarang</p>
            <div className="space-y-2">
              {data.allowedSteps.map((s) => (
                <button
                  key={s}
                  onClick={() => handleUpdate(s)}
                  disabled={submitting !== null}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition"
                >
                  <span className="text-lg">{STEP_ICON[s] ?? "•"}</span>
                  <span>{data.stepLabel[s] ?? s}</span>
                  {submitting === s && (
                    <span className="ml-auto text-xs opacity-70">Menyimpan...</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow p-4 text-center">
            <p className="text-2xl mb-2">🎉</p>
            <p className="text-sm text-gray-600 font-medium">Semua status pengiriman sudah diupdate.</p>
          </div>
        )}

        <p className="text-center text-xs text-gray-400 pb-6">CST Logistics — Driver Update Link</p>
      </div>
    </div>
  );
}
