import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "textarea" | "datetime-local";
  required: boolean;
  placeholder?: string;
};

type FormMeta = {
  token: string;
  orderNumber: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  cargoDescription: string | null;
  grossWeight: string | null;
  expiresAt: string | null;
  serviceType: string;
  categoryLabel: string;
  vendorName: string | null;
  fields: FieldDef[];
};

const CATEGORY_ICON: Record<string, string> = {
  trucking: "🚛",
  freight: "✈️",
  product: "📦",
  customs: "🛃",
};

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

export default function FulfillmentFormPage() {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/fulfillment/${token}`)
      .then(async (r) => {
        const data = await r.json() as FormMeta & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Terjadi kesalahan");
        setMeta(data);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleChange = useCallback((key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!meta) return;

    const missing = meta.fields
      .filter(f => f.required && !values[f.key]?.trim())
      .map(f => f.label);
    if (missing.length) {
      setSubmitError(`Field wajib belum diisi: ${missing.join(", ")}`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/fulfillment/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim data");
      setSubmitted(true);
    } catch (e: unknown) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm">Memuat form...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Tidak Valid</h2>
          <p className="text-sm text-slate-500">{error}</p>
          <p className="text-xs text-slate-400 mt-3">
            Jika Anda merasa ini keliru, hubungi tim CST Logistics.
          </p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Data Fulfillment Terkirim!</h2>
          <p className="text-sm text-slate-500">
            Terima kasih. Data Anda telah kami terima dan tim CST Logistics akan segera memprosesnya.
          </p>
          <div className="mt-4 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-left text-sm text-green-800">
            <p className="font-medium">Status order: <span className="font-bold">Vendor Confirmed</span></p>
            <p className="text-green-600 text-xs mt-1">Order: {meta?.orderNumber}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!meta) return null;

  const icon = CATEGORY_ICON[meta.serviceType] ?? "📋";
  const expiresLabel = meta.expiresAt
    ? new Date(meta.expiresAt).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" })
    : null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-4">
          <div className="flex items-start gap-4">
            <div className="text-4xl flex-shrink-0">{icon}</div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-slate-800 leading-tight">
                Form Fulfillment — {meta.categoryLabel}
              </h1>
              {meta.vendorName && (
                <p className="text-sm text-slate-500 mt-0.5">Vendor: {meta.vendorName}</p>
              )}
            </div>
          </div>

          <div className="mt-4 bg-slate-50 rounded-xl px-4 py-3 space-y-1 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">No. Order</span>
              <span className="font-mono font-semibold text-slate-800">{meta.orderNumber}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Layanan</span>
              <span className="text-slate-700">{meta.shipmentType}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Rute</span>
              <span className="text-slate-700 text-right max-w-[60%]">
                {meta.origin} → {meta.destination}
              </span>
            </div>
            {meta.commodity && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Komoditi</span>
                <span className="text-slate-700">{meta.commodity}</span>
              </div>
            )}
            {meta.grossWeight && (
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Berat</span>
                <span className="text-slate-700">{meta.grossWeight} kg</span>
              </div>
            )}
          </div>

          {expiresLabel && (
            <p className="text-xs text-amber-600 mt-3 flex items-center gap-1">
              <span>⏳</span> Form berlaku hingga {expiresLabel}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
              {icon} Detail {meta.categoryLabel}
            </h2>

            {meta.fields.map(field => (
              <FormField key={field.key} label={field.label} required={field.required}>
                {field.type === "textarea" ? (
                  <textarea
                    value={values[field.key] ?? ""}
                    onChange={e => handleChange(field.key, e.target.value)}
                    required={field.required}
                    placeholder={field.placeholder}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none transition"
                  />
                ) : field.type === "datetime-local" ? (
                  <input
                    type="datetime-local"
                    value={values[field.key] ?? ""}
                    onChange={e => handleChange(field.key, e.target.value)}
                    required={field.required}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                ) : (
                  <input
                    type="text"
                    value={values[field.key] ?? ""}
                    onChange={e => handleChange(field.key, e.target.value)}
                    required={field.required}
                    placeholder={field.placeholder}
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
                  />
                )}
              </FormField>
            ))}
          </div>

          {submitError && (
            <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-4 w-full rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300
                       text-white font-semibold py-3.5 text-sm transition-colors active:scale-95"
          >
            {submitting ? "Mengirim..." : "Kirim Data Fulfillment"}
          </button>

          <p className="text-center text-xs text-slate-400 mt-3">
            Data yang Anda kirimkan akan digunakan untuk proses operasional CST Logistics.
          </p>
        </form>
      </div>
    </div>
  );
}
