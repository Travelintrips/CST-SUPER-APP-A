import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";

type PageData = {
  orderNumber: string;
  customerName: string;
  origin: string | null;
  destination: string | null;
  driverName: string | null;
  completedSteps: string[];
  completedStepsMeta: Record<string, { photoUrl?: string }>;
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

const PHOTO_REQUIRED = new Set(["PICKUP", "ARRIVED", "DELIVERED"]);

export default function DriverProgressPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useEffect(() => {
    fetch(`/api/driver-progress/${token}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) { setError(d.error); } else { setData(d); }
      })
      .catch(() => setError("Gagal memuat data."))
      .finally(() => setLoading(false));
  }, [token]);

  async function handlePhotoChange(stepKey: string, file: File) {
    setUploading(stepKey);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("stepKey", stepKey);
      const r = await fetch(`/api/driver-progress/${token}/photo`, { method: "POST", body: form });
      const d = await r.json();
      if (!r.ok || d.error) {
        alert(d.error ?? "Upload foto gagal.");
        if (fileRefs.current[stepKey]) fileRefs.current[stepKey]!.value = "";
      } else {
        setPendingPhotos((prev) => ({ ...prev, [stepKey]: d.url as string }));
      }
    } catch {
      alert("Gagal mengunggah foto.");
    } finally {
      setUploading(null);
    }
  }

  async function handleUpdate(stepKey: string) {
    if (!data) return;
    const photoUrl = pendingPhotos[stepKey];
    if (PHOTO_REQUIRED.has(stepKey) && !photoUrl) {
      alert(`Foto wajib diunggah untuk step ${data.stepLabel[stepKey] ?? stepKey}.`);
      return;
    }
    setSubmitting(stepKey);
    try {
      const r = await fetch(`/api/driver-progress/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stepKey, photoUrl: photoUrl ?? undefined }),
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
                completedStepsMeta: photoUrl
                  ? { ...prev.completedStepsMeta, [stepKey]: { photoUrl } }
                  : prev.completedStepsMeta,
                allowedSteps: prev.allowedSteps.filter((s) => s !== stepKey),
              }
            : prev
        );
        setPendingPhotos((prev) => {
          const next = { ...prev };
          delete next[stepKey];
          return next;
        });
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
            <div className="space-y-3">
              {data.completedSteps.map((s) => {
                const thumb = data.completedStepsMeta?.[s]?.photoUrl;
                return (
                  <div key={s} className="flex items-start gap-2 text-sm text-gray-400">
                    <span className="mt-0.5">{STEP_ICON[s] ?? "•"}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="line-through">{data.stepLabel[s] ?? s}</span>
                        <span className="ml-auto text-green-500 text-xs flex-shrink-0">✓</span>
                      </div>
                      {thumb && (
                        <a href={thumb} target="_blank" rel="noopener noreferrer">
                          <img
                            src={thumb}
                            alt={`Foto ${data.stepLabel[s] ?? s}`}
                            className="mt-1 w-20 h-20 rounded-lg object-cover border border-gray-200"
                          />
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Allowed steps */}
        {data.allowedSteps.length > 0 ? (
          <div className="bg-white rounded-xl shadow p-4">
            <p className="text-xs text-gray-400 font-semibold uppercase tracking-wide mb-3">Pilih Status Sekarang</p>
            <div className="space-y-4">
              {data.allowedSteps.map((s) => {
                const isRequired = PHOTO_REQUIRED.has(s);
                const photoUrl = pendingPhotos[s];
                const isUploading = uploading === s;
                const canSubmit = !isRequired || !!photoUrl;
                return (
                  <div key={s} className="space-y-2">
                    {/* Photo upload section */}
                    <div className="rounded-lg border border-gray-200 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-lg">{STEP_ICON[s] ?? "•"}</span>
                        <span className="text-sm font-medium text-gray-700">{data.stepLabel[s] ?? s}</span>
                        {isRequired && (
                          <span className="ml-auto text-xs text-red-500 font-medium">Foto wajib</span>
                        )}
                        {!isRequired && (
                          <span className="ml-auto text-xs text-gray-400">Foto opsional</span>
                        )}
                      </div>

                      {/* Photo preview */}
                      {photoUrl && (
                        <img
                          src={photoUrl}
                          alt="Preview"
                          className="w-full rounded-lg object-cover mb-2 border border-gray-100"
                          style={{ maxHeight: 180 }}
                        />
                      )}

                      {/* File input */}
                      <label className={`flex items-center justify-center gap-2 w-full py-2 px-3 rounded-md border text-sm cursor-pointer transition ${
                        photoUrl
                          ? "border-green-300 bg-green-50 text-green-700"
                          : "border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:bg-gray-100"
                      }`}>
                        {isUploading ? (
                          <span>Mengunggah...</span>
                        ) : photoUrl ? (
                          <span>📷 Ganti Foto</span>
                        ) : (
                          <span>📷 {isRequired ? "Ambil / Pilih Foto" : "Tambah Foto (opsional)"}</span>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          className="hidden"
                          disabled={isUploading || submitting !== null}
                          ref={(el) => { fileRefs.current[s] = el; }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handlePhotoChange(s, file);
                          }}
                        />
                      </label>
                    </div>

                    {/* Submit button */}
                    <button
                      onClick={() => handleUpdate(s)}
                      disabled={submitting !== null || isUploading || !canSubmit}
                      className="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition"
                    >
                      <span>Update: {data.stepLabel[s] ?? s}</span>
                      {submitting === s && (
                        <span className="text-xs opacity-70">Menyimpan...</span>
                      )}
                    </button>
                  </div>
                );
              })}
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
