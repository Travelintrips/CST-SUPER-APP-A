import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import type { ProductTemplate, DynamicFormValues } from "@workspace/product-templates";
import {
  TemplateFieldRenderer,
  TemplateDocumentRenderer,
  TemplateChecklistRenderer,
  TemplateInstructionRenderer,
  TemplatePriceBreakdown,
} from "@/components/template";

type FieldDef = {
  key: string; label: string;
  type: "text" | "number" | "select" | "textarea" | "date";
  options?: string[]; required?: boolean; placeholder?: string;
  section?: "quotation" | "operational" | "both";
};

type ServiceSchema = { label: string; emoji: string; fields: FieldDef[] };

type FormMeta = {
  id: number; serviceType: string; title: string | null; notes: string | null;
  vendorName: string | null; vendorPhone: string | null; vendorContactPerson: string | null;
  schema: ServiceSchema | null; mode: string; orderId: number | null;
  orderNumber: string | null; orderItemId: number | null; phase: string | null;
  alreadySubmitted?: boolean;
  productTemplate?: ProductTemplate | null;
};

// ── Skeleton ──────────────────────────────────────────────────────────────────
function Skeleton({ className }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className ?? ""}`} />;
}

function FormSkeleton() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <div className="flex items-center gap-3 mb-3">
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-48" /><Skeleton className="h-3.5 w-32" />
            </div>
          </div>
          <Skeleton className="h-10 w-full rounded-lg mt-2" />
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <Skeleton className="h-3.5 w-28" />
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-40" /><Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
          <Skeleton className="h-3.5 w-36" />
          {[0, 1, 2].map(i => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3.5 w-44" /><Skeleton className="h-9 w-full rounded-lg" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-full rounded-xl" />
      </div>
    </div>
  );
}

// ── States ────────────────────────────────────────────────────────────────────
function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Tidak Valid</h2>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function SuccessState({ orderNumber }: { orderNumber?: string | null }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-800 mb-2">Penawaran Terkirim!</h2>
        {orderNumber && <p className="text-xs text-slate-400 mb-2">Order Ref: {orderNumber}</p>}
        <p className="text-sm text-slate-500">
          Terima kasih! Penawaran Anda telah kami terima dan akan segera diproses oleh tim kami.
          Kami akan menghubungi Anda apabila ada pertanyaan lebih lanjut.
        </p>
      </div>
    </div>
  );
}

function AlreadySubmittedState() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="w-14 h-14 rounded-full bg-blue-100 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Penawaran Sudah Dikirim</h2>
        <p className="text-sm text-slate-500">
          Penawaran untuk order ini sudah pernah dikirim melalui link ini. Tim kami sedang memproses penawaran Anda.
        </p>
      </div>
    </div>
  );
}

// ── Field component ───────────────────────────────────────────────────────────
function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const INPUT_CLS = "w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400";

// ── Main page ─────────────────────────────────────────────────────────────────
export default function VendorMiniFormPage() {
  const { token } = useParams<{ token: string }>();
  const [meta, setMeta] = useState<FormMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [values, setValues] = useState<Record<string, string>>({});
  const [vendorName, setVendorName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  // Order-based specific price fields
  const [vendorDesc, setVendorDesc] = useState("");
  const [vendorQty, setVendorQty] = useState("1");
  const [vendorUnit, setVendorUnit] = useState("Ls");
  const [vendorUnitPrice, setVendorUnitPrice] = useState("");
  const [currency, setCurrency] = useState("IDR");
  const [eta, setEta] = useState("");
  const [validUntil, setValidUntil] = useState("");

  const [templateValues, setTemplateValues] = useState<DynamicFormValues>({
    customFieldValues: {},
    uploadedDocuments: [],
    checklistStatus: {},
    packagingNotes: "",
    conditionalFlags: {},
  });
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) { setError("Token tidak ditemukan"); setLoading(false); return; }
    const ctrl = new AbortController();
    fetch(`/api/vendor-form/${token}`, { signal: ctrl.signal })
      .then(async (r) => {
        const data = await r.json() as FormMeta & { error?: string };
        if (!r.ok) throw new Error(data.error ?? "Terjadi kesalahan");
        setMeta(data);
        if (data.vendorName) setVendorName(data.vendorName);
        if (data.vendorPhone) setContactPhone(data.vendorPhone);
        if (data.vendorContactPerson) setContactPerson(data.vendorContactPerson);
      })
      .catch((e: Error) => { if (e.name !== "AbortError") setError(e.message); })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
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
    if (missing.length) { setSubmitError(`Field wajib belum diisi: ${missing.join(", ")}`); return; }
    if (meta.mode === "order_based" && (!vendorUnitPrice || Number(vendorUnitPrice) <= 0)) {
      setSubmitError("Harga satuan dasar wajib diisi"); return;
    }

    setSubmitting(true);
    setSubmitError(null);
    try {
      let attachmentUrl: string | undefined;
      if (attachmentFile) {
        setUploading(true);
        const fd = new FormData();
        fd.append("file", attachmentFile);
        const upRes = await fetch(`/api/vendor-form/upload/${token}`, { method: "POST", body: fd });
        const upData = await upRes.json() as { objectPath?: string; error?: string };
        setUploading(false);
        if (!upRes.ok) throw new Error(upData.error ?? "Upload file gagal");
        attachmentUrl = upData.objectPath;
      }

      const qty = Math.max(1, Number(vendorQty) || 1);
      const unitPrice = Number(vendorUnitPrice) || 0;
      const subtotal = qty * unitPrice;
      const body: Record<string, unknown> = {
        vendorName: vendorName.trim() || null,
        contactPerson: contactPerson.trim() || null,
        contactPhone: contactPhone.trim() || null,
        formData: {
          ...values,
          ...templateValues.customFieldValues,
          ...Object.fromEntries(templateValues.uploadedDocuments.map((d) => [`_doc_${d.key}`, d.reference])),
          ...Object.fromEntries(Object.entries(templateValues.checklistStatus).map(([k, v]) => [`_chk_${k}`, v])),
          ...(templateValues.packagingNotes ? { _packagingNotes: templateValues.packagingNotes } : {}),
          ...(meta.mode === "order_based" ? {
            _deskripsi: vendorDesc.trim() || undefined,
            _qty: vendorQty,
            _satuan: vendorUnit,
            _hargaSatuan: vendorUnitPrice,
          } : {}),
        },
        attachmentUrl,
      };
      if (meta.mode === "order_based") {
        body["vendorPrice"] = subtotal > 0 ? subtotal : undefined;
        body["currency"] = currency;
        body["eta"] = eta.trim() || undefined;
        body["validUntil"] = validUntil || undefined;
      }
      const res = await fetch(`/api/vendor-form/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { success?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Gagal mengirim data");
      setSubmitted(true);
    } catch (e: unknown) {
      setUploading(false);
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <FormSkeleton />;
  if (error) return <ErrorState message={error} />;
  if (submitted) return <SuccessState orderNumber={meta?.orderNumber} />;
  if (meta?.alreadySubmitted) return <AlreadySubmittedState />;

  if (!meta?.schema) {
    return <ErrorState message="Form tidak tersedia untuk link ini." />;
  }

  const { schema } = meta;
  const isOrderBased = meta.mode === "order_based";

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-blue-50 py-10 px-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mb-4">
          <div className="flex items-center gap-3 mb-1">
            <span className="text-3xl leading-none">{schema.emoji}</span>
            <div>
              <h1 className="text-xl font-bold text-slate-800">
                {meta.title ?? `Form Penawaran ${schema.label}`}
              </h1>
              {meta.vendorName && <p className="text-sm text-slate-500">Untuk: {meta.vendorName}</p>}
              {meta.orderNumber && (
                <p className="text-xs text-blue-600 font-medium mt-0.5">📦 Order Ref: {meta.orderNumber}</p>
              )}
            </div>
          </div>
          {isOrderBased && (
            <div className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg">
              <span>📋</span> Form ini terkait dengan order customer spesifik
            </div>
          )}
          {meta.notes && (
            <p className="mt-3 text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 whitespace-pre-line">
              {meta.notes}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Identity */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">Identitas Vendor</h2>
            <div className="space-y-4">
              <FormField label="Nama Perusahaan / Vendor" required>
                <input type="text" value={vendorName} onChange={e => setVendorName(e.target.value)}
                  required placeholder="Nama perusahaan Anda" className={INPUT_CLS} />
              </FormField>
              <FormField label="Nama PIC / Contact Person">
                <input type="text" value={contactPerson} onChange={e => setContactPerson(e.target.value)}
                  placeholder="Nama penghubung" className={INPUT_CLS} />
              </FormField>
              <FormField label="Nomor WhatsApp / Telepon">
                <input type="text" value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                  placeholder="Contoh: 0812xxxx" className={INPUT_CLS} />
              </FormField>
            </div>
          </div>

          {/* Order-based: harga penawaran */}
          {isOrderBased && (() => {
            const qty = Math.max(1, Number(vendorQty) || 1);
            const unitPrice = Number(vendorUnitPrice) || 0;
            const subtotal = qty * unitPrice;
            const ppn = Math.round(subtotal * 0.11 * 100) / 100;
            const total = subtotal + ppn;
            const fmtIDR = (n: number) => n.toLocaleString("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
            return (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
                <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">💰 Rincian Harga Dasar</h2>
                <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
                  Isi <strong>Harga Dasar</strong> Anda — belum termasuk margin & PPN. Harga jual ke customer ditentukan oleh admin.
                </p>
                <div className="space-y-4">
                  <FormField label="Deskripsi Layanan / Produk">
                    <input type="text" value={vendorDesc} onChange={e => setVendorDesc(e.target.value)}
                      placeholder="Contoh: Jasa angkutan laut FCL Jakarta–Singapura" className={INPUT_CLS} />
                  </FormField>
                  <div className="grid grid-cols-2 gap-3">
                    <FormField label="Qty">
                      <input type="number" min="1" step="any" value={vendorQty}
                        onChange={e => setVendorQty(e.target.value)}
                        placeholder="1" className={INPUT_CLS} />
                    </FormField>
                    <FormField label="Satuan">
                      <input type="text" value={vendorUnit} onChange={e => setVendorUnit(e.target.value)}
                        placeholder="Ls / kg / CBM / unit" className={INPUT_CLS} />
                    </FormField>
                  </div>
                  <FormField label="Harga Satuan Dasar (belum PPN)" required>
                    <div className="flex gap-2">
                      <select
                        value={currency} onChange={e => setCurrency(e.target.value)}
                        className="rounded-lg border border-slate-200 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 bg-white w-24"
                      >
                        {["IDR", "USD", "SGD", "EUR"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <input
                        type="number" min="0" step="any"
                        value={vendorUnitPrice} onChange={e => setVendorUnitPrice(e.target.value)}
                        required placeholder="Contoh: 5000000" className={`${INPUT_CLS} flex-1`}
                      />
                    </div>
                  </FormField>

                  <TemplatePriceBreakdown
                    role="vendor"
                    basePrice={unitPrice}
                    qty={qty}
                    unit={vendorUnit || "Ls"}
                    currency={currency}
                    hint="Isi Harga Dasar Anda — belum termasuk margin & PPN. Harga jual ke customer ditentukan oleh admin."
                  />

                  <FormField label="Estimasi Pengiriman / Lead Time">
                    <input type="text" value={eta} onChange={e => setEta(e.target.value)}
                      placeholder="Contoh: H+2, 3 hari kerja, 15 Jan 2026" className={INPUT_CLS} />
                  </FormField>
                  <FormField label="Harga Berlaku Sampai">
                    <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)}
                      className={INPUT_CLS} />
                  </FormField>
                </div>
              </div>
            );
          })()}

          {/* Dynamic service fields */}
          {schema.fields.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
              <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">
                {schema.emoji} Detail {schema.label}
              </h2>
              <div className="space-y-4">
                {schema.fields.map(field => (
                  <FormField key={field.key} label={field.label} required={field.required}>
                    {field.type === "select" ? (
                      <select
                        value={values[field.key] ?? ""} onChange={e => handleChange(field.key, e.target.value)}
                        required={field.required}
                        className={`${INPUT_CLS} bg-white`}
                      >
                        <option value="">— Pilih —</option>
                        {field.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                      </select>
                    ) : field.type === "textarea" ? (
                      <textarea
                        value={values[field.key] ?? ""} onChange={e => handleChange(field.key, e.target.value)}
                        required={field.required} placeholder={field.placeholder} rows={3}
                        className={`${INPUT_CLS} resize-none`}
                      />
                    ) : (
                      <input
                        type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                        value={values[field.key] ?? ""} onChange={e => handleChange(field.key, e.target.value)}
                        required={field.required} placeholder={field.placeholder ?? ""} className={INPUT_CLS}
                      />
                    )}
                  </FormField>
                ))}
              </div>
            </div>
          )}

          {/* Attachment upload (optional) */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-4">📎 Lampiran Dokumen</h2>
            <p className="text-xs text-slate-500 mb-3">Opsional — sertakan dokumen pendukung (PDF, gambar, atau spreadsheet, maks. 10 MB).</p>
            <label className="flex items-center gap-3 cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition-colors">
                <span>📂</span> Pilih File
              </span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx"
                className="hidden"
                onChange={e => setAttachmentFile(e.target.files?.[0] ?? null)}
              />
              {attachmentFile ? (
                <span className="text-sm text-slate-700 truncate max-w-[200px]">{attachmentFile.name}</span>
              ) : (
                <span className="text-sm text-slate-400">Belum ada file dipilih</span>
              )}
            </label>
            {attachmentFile && (
              <button type="button" onClick={() => setAttachmentFile(null)}
                className="mt-2 text-xs text-red-500 hover:text-red-700">
                ✕ Hapus lampiran
              </button>
            )}
          </div>

          {meta.productTemplate && (
            <>
              <TemplateFieldRenderer
                template={meta.productTemplate}
                values={templateValues}
                onChange={setTemplateValues}
              />
              <TemplateDocumentRenderer
                documents={meta.productTemplate.requiredDocuments}
                values={templateValues.uploadedDocuments}
                onChange={(docs) => setTemplateValues((v) => ({ ...v, uploadedDocuments: docs }))}
              />
              <TemplateChecklistRenderer
                checklist={meta.productTemplate.checklist}
                values={templateValues.checklistStatus}
                onChange={(key, checked) => setTemplateValues((v) => ({ ...v, checklistStatus: { ...v.checklistStatus, [key]: checked } }))}
              />
              <TemplateInstructionRenderer
                instructions={meta.productTemplate.packagingInstructions}
                notes={templateValues.packagingNotes}
                onNotesChange={(notes) => setTemplateValues((v) => ({ ...v, packagingNotes: notes }))}
              />
            </>
          )}

          {/* Error */}
          {submitError && (
            <div className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3">
              {submitError}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit" disabled={submitting || uploading}
            className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-semibold py-3.5 text-sm transition-colors active:scale-95"
          >
            {uploading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Mengupload file...
              </span>
            ) : submitting ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Mengirim...
              </span>
            ) : (
              isOrderBased ? "✉️ Kirim Penawaran" : "✉️ Kirim Data"
            )}
          </button>

          <p className="text-center text-xs text-slate-400 pb-6">
            Data Anda aman dan hanya digunakan untuk keperluan pengadaan.
          </p>
        </form>
      </div>
    </div>
  );
}
