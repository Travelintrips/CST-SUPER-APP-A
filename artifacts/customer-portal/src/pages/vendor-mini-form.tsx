import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";

type FieldDef = {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "textarea";
  options?: string[];
  required?: boolean;
  placeholder?: string;
};

type ServiceSchema = {
  label: string;
  emoji: string;
  fields: FieldDef[];
};

type FormMeta = {
  id: number;
  serviceType: string;
  title: string | null;
  notes: string | null;
  vendorName: string | null;
  schema: ServiceSchema | null;
};

export default function VendorMiniFormPage() {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [values, setValues] = useState<Record<string, string>>({});
  const [vendorName, setVendorName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/vendor-form/${token}`)
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
    if (!meta?.schema) return;

    const missing = meta.schema.fields
      .filter(f => f.required && !values[f.key]?.trim())
      .map(f => f.label);
    if (missing.length) {
      setSubmitError(`Field wajib belum diisi: ${missing.join(", ")}`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch(`/api/vendor-form/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vendorName: vendorName.trim() || null,
          contactPerson: contactPerson.trim() || null,
          contactPhone: contactPhone.trim() || null,
          formData: values,
        }),
      });
      const data = await res.json() as { success?: boolean; error?: string };
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
          <div className="h-8 w-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
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
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h2 className="text-xl font-semibold text-slate-800 mb-2">Data Terkirim!</h2>
          <p className="text-sm text-slate-500">
            Terima kasih, data Anda telah kami terima dan akan segera diproses oleh tim kami.
          </p>
        </div>
      </div>
    );
  }

  if (!meta?.schema) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
          <div className="text-4xl mb-4">❓</div>
          <p className="text-sm text-slate-500">Form tidak tersedia.</p>
        </div>
      </div>
    );
  }

  const { schema } = meta;

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-4">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl">{schema.emoji}</span>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {meta.title ?? `Form ${schema.label}`}
              </h1>
              {meta.vendorName && (
                <p className="text-sm text-slate-500">Untuk: {meta.vendorName}</p>
              )}
            </div>
          </div>
          {meta.notes && (
            <p className="mt-3 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              {meta.notes}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identity fields */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
              Identitas Vendor
            </h2>
            <div className="space-y-4">
              <FormField label="Nama Perusahaan / Vendor" required>
                <input
                  type="text"
                  value={vendorName}
                  onChange={e => setVendorName(e.target.value)}
                  required
                  placeholder="Nama perusahaan Anda"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </FormField>
              <FormField label="Nama PIC / Contact Person">
                <input
                  type="text"
                  value={contactPerson}
                  onChange={e => setContactPerson(e.target.value)}
                  placeholder="Nama penghubung"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </FormField>
              <FormField label="Nomor WhatsApp / Telepon">
                <input
                  type="text"
                  value={contactPhone}
                  onChange={e => setContactPhone(e.target.value)}
                  placeholder="Contoh: 0812xxxx"
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
              </FormField>
            </div>
          </div>

          {/* Dynamic service fields */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">
              {schema.emoji} Detail {schema.label}
            </h2>
            <div className="space-y-4">
              {schema.fields.map(field => (
                <FormField key={field.key} label={field.label} required={field.required}>
                  {field.type === "select" ? (
                    <select
                      value={values[field.key] ?? ""}
                      onChange={e => handleChange(field.key, e.target.value)}
                      required={field.required}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white"
                    >
                      <option value="">— Pilih —</option>
                      {field.options?.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === "textarea" ? (
                    <textarea
                      value={values[field.key] ?? ""}
                      onChange={e => handleChange(field.key, e.target.value)}
                      required={field.required}
                      placeholder={field.placeholder}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                    />
                  ) : field.type === "number" ? (
                    <input
                      type="number"
                      value={values[field.key] ?? ""}
                      onChange={e => handleChange(field.key, e.target.value)}
                      required={field.required}
                      placeholder={field.placeholder ?? "0"}
                      min={0}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  ) : (
                    <input
                      type="text"
                      value={values[field.key] ?? ""}
                      onChange={e => handleChange(field.key, e.target.value)}
                      required={field.required}
                      placeholder={field.placeholder}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                    />
                  )}
                </FormField>
              ))}
            </div>
          </div>

          {submitError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {submitError}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-3 text-sm transition-colors active:scale-95"
          >
            {submitting ? "Mengirim..." : "Kirim Data"}
          </button>

          <p className="text-center text-xs text-slate-400">
            Data yang Anda kirimkan akan digunakan untuk keperluan penawaran dan kerjasama.
          </p>
        </form>
      </div>
    </div>
  );
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}
