import { useState, useEffect } from "react";
import { useParams } from "wouter";

/* ─── Types ──────────────────────────────────────────────────── */

type OrderInfo = {
  id: number;
  orderNumber: string;
  serviceType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  grossWeight: string | null;
  requiredDate: string | null;
  vehicleType: string | null;
  status: string;
};

type SubmittedData = {
  driverName: string | null;
  driverPhone: string | null;
  plateNumber: string | null;
  vehicleType: string | null;
  pickupTime: string | null;
  carrierName: string | null;
  awbBlNumber: string | null;
  flightVessel: string | null;
  bookingNumber: string | null;
  etd: string | null;
  eta: string | null;
  stockConfirmed: string | null;
  qtyConfirmed: string | null;
  readyDate: string | null;
  warehouseLocation: string | null;
  customsPicName: string | null;
  customsDocuments: string | null;
  customsProcessEta: string | null;
  notes: string | null;
  submittedAt: string | null;
};

type PageData = {
  token: string;
  isSubmitted: boolean;
  serviceType: string;
  vendorName: string | null;
  order: OrderInfo;
  submittedData?: SubmittedData;
};

/* ─── Helpers ────────────────────────────────────────────────── */

function getServiceIcon(svcType: string) {
  if (svcType.includes("trucking")) return "🚚";
  if (svcType.includes("air"))      return "✈️";
  if (svcType.includes("sea"))      return "🚢";
  if (svcType.includes("product"))  return "📦";
  if (svcType.includes("customs"))  return "🏛️";
  return "🔧";
}

function getServiceLabel(svcType: string) {
  if (svcType.includes("trucking"))    return "Trucking";
  if (svcType.includes("freight_air")) return "Freight Udara";
  if (svcType.includes("freight_sea")) return "Freight Laut";
  if (svcType.includes("product"))     return "Produk / Gudang";
  if (svcType.includes("customs"))     return "Kepabeanan";
  return "Fulfillment";
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
  return `${pad(d.getDate())} ${BULAN[d.getMonth()]} ${d.getFullYear()}, ${pad(d.getHours())}:${pad(d.getMinutes())} WIB`;
}

/* ─── UI primitives ──────────────────────────────────────────── */

function Loader() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Memuat form fulfillment...</span>
      </div>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Tidak Valid</h2>
        <p className="text-sm text-slate-600">{message}</p>
        <p className="text-xs text-slate-400 mt-3">
          Jika Anda merasa ini keliru, hubungi tim admin.
        </p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between items-start gap-3 py-2 border-b border-slate-50 last:border-0">
      <span className="text-sm text-slate-500 flex-shrink-0 min-w-[130px]">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right break-words">{value}</span>
    </div>
  );
}

function OrderRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

/* ─── Submitted Review ───────────────────────────────────────── */

function SubmittedReview({
  data,
  localFields,
  justSubmitted,
}: {
  data: PageData;
  localFields?: Record<string, string>;
  justSubmitted?: boolean;
}) {
  const svc = data.serviceType;
  const icon = getServiceIcon(svc);
  const svcLabel = getServiceLabel(svc);

  // Use server-returned submittedData, or fall back to locally captured fields
  const sd = data.submittedData;
  const lf = localFields ?? {};

  function val(key: keyof SubmittedData): string | null {
    if (sd?.[key]) return String(sd[key]);
    if (lf[key]) return lf[key];
    return null;
  }

  const isTrucking = svc.includes("trucking");
  const isFreight  = (svc.includes("freight_air") || svc.includes("freight_sea") || svc.includes("freight")) && !isTrucking;
  const isProduct  = svc.includes("product");
  const isCustoms  = svc.includes("customs");

  const hasAnyData =
    val("driverName") || val("carrierName") || val("stockConfirmed") ||
    val("customsPicName") || val("plateNumber") || val("awbBlNumber");

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header status */}
        <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-6 text-center">
          <div className="text-5xl mb-3">{justSubmitted ? "✅" : "📋"}</div>
          <h1 className="text-xl font-bold text-slate-800 mb-1">
            {justSubmitted ? "Data Berhasil Dikirim!" : "Data Fulfillment Telah Disubmit"}
          </h1>
          <p className="text-sm text-slate-500 mb-4">
            {justSubmitted
              ? "Terima kasih. Tim kami akan segera memprosesnya."
              : "Data di bawah adalah isian yang telah dikirimkan untuk order ini."}
          </p>
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-full px-4 py-1.5 text-xs font-semibold text-emerald-700">
            <span>✓ Submitted</span>
            {sd?.submittedAt && (
              <span className="text-emerald-500 font-normal">{fmtDateTime(sd.submittedAt)}</span>
            )}
          </div>
        </div>

        {/* Order info */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xl">{icon}</span>
            <div>
              <h2 className="text-sm font-semibold text-slate-700">Detail Order — {svcLabel}</h2>
              {data.vendorName && (
                <p className="text-xs text-slate-400">Vendor: {data.vendorName}</p>
              )}
            </div>
          </div>
          <div className="space-y-2.5">
            <OrderRow label="No. Order" value={data.order.orderNumber} />
            <OrderRow label="Layanan" value={data.order.serviceType} />
            <OrderRow label="Rute" value={`${data.order.origin} → ${data.order.destination}`} />
            {data.order.commodity && <OrderRow label="Komoditi" value={data.order.commodity} />}
            {data.order.grossWeight && <OrderRow label="Berat" value={`${data.order.grossWeight} kg`} />}
            {data.order.requiredDate && <OrderRow label="Tgl Butuh" value={data.order.requiredDate} />}
          </div>
        </div>

        {/* Submitted fulfillment data */}
        {hasAnyData && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {icon} Data Fulfillment yang Dikirim
            </h2>
            <p className="text-xs text-slate-400 mb-4">Read-only — tidak dapat diubah.</p>

            <div>
              {isTrucking && (
                <>
                  <Row label="Nama Driver"      value={val("driverName")} />
                  <Row label="No. HP Driver"    value={val("driverPhone")} />
                  <Row label="Nomor Plat"       value={val("plateNumber")} />
                  <Row label="Tipe Kendaraan"   value={val("vehicleType")} />
                  <Row label="Est. Pickup"      value={val("pickupTime")} />
                </>
              )}
              {isFreight && (
                <>
                  <Row label="Carrier / Maskapai" value={val("carrierName")} />
                  <Row label="No. AWB / BL"        value={val("awbBlNumber")} />
                  <Row label="No. Penerbangan/Vessel" value={val("flightVessel")} />
                  <Row label="No. Booking"         value={val("bookingNumber")} />
                  <Row label="ETD"                 value={val("etd")} />
                  <Row label="ETA"                 value={val("eta")} />
                </>
              )}
              {isProduct && (
                <>
                  <Row label="Konfirmasi Stok"    value={val("stockConfirmed")} />
                  <Row label="Qty Terpenuhi"      value={val("qtyConfirmed")} />
                  <Row label="Tanggal Siap Kirim" value={val("readyDate")} />
                  <Row label="Lokasi Gudang"      value={val("warehouseLocation")} />
                </>
              )}
              {isCustoms && (
                <>
                  <Row label="Nama PIC Kepabeanan"  value={val("customsPicName")} />
                  <Row label="Dokumen Dibutuhkan"   value={val("customsDocuments")} />
                  <Row label="Est. Selesai Bea Cukai" value={val("customsProcessEta")} />
                </>
              )}
              {/* Fallback: show all non-null fields for unknown service types */}
              {!isTrucking && !isFreight && !isProduct && !isCustoms && (
                <>
                  <Row label="Driver"          value={val("driverName")} />
                  <Row label="No. Plat"        value={val("plateNumber")} />
                  <Row label="Carrier"         value={val("carrierName")} />
                  <Row label="AWB/BL"          value={val("awbBlNumber")} />
                  <Row label="ETD"             value={val("etd")} />
                  <Row label="ETA"             value={val("eta")} />
                  <Row label="Stok"            value={val("stockConfirmed")} />
                  <Row label="PIC Kepabeanan"  value={val("customsPicName")} />
                </>
              )}
              {val("notes") && (
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-xs text-slate-400 mb-1">Catatan Tambahan</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{val("notes")}</p>
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

/* ─── Form fields ────────────────────────────────────────────── */

function Field({
  label, name, value, onChange, placeholder = "", required = false, type = "text",
}: {
  label: string; name: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type} name={name} value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} required={required}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
      />
    </div>
  );
}

function TruckingFields({ fields, setField }: { fields: Record<string, string>; setField: (k: string, v: string) => void }) {
  return (
    <>
      <Field label="Nama Driver" name="driverName" value={fields.driverName ?? ""} onChange={(v) => setField("driverName", v)} placeholder="Contoh: Budi Santoso" required />
      <Field label="No. HP Driver" name="driverPhone" value={fields.driverPhone ?? ""} onChange={(v) => setField("driverPhone", v)} placeholder="08xxxxxxxxxx" />
      <Field label="Nomor Plat Kendaraan" name="plateNumber" value={fields.plateNumber ?? ""} onChange={(v) => setField("plateNumber", v)} placeholder="B 1234 XYZ" required />
      <Field label="Tipe Kendaraan" name="vehicleType" value={fields.vehicleType ?? ""} onChange={(v) => setField("vehicleType", v)} placeholder="Engkel, Tronton, CDD, dll" />
      <Field label="Estimasi Waktu Pickup" name="pickupTime" value={fields.pickupTime ?? ""} onChange={(v) => setField("pickupTime", v)} placeholder="Contoh: 14 Jun 2026, 09:00 WIB" />
    </>
  );
}

function FreightFields({ fields, setField }: { fields: Record<string, string>; setField: (k: string, v: string) => void }) {
  return (
    <>
      <Field label="Nama Carrier / Maskapai" name="carrierName" value={fields.carrierName ?? ""} onChange={(v) => setField("carrierName", v)} placeholder="Garuda Cargo, Evergreen, dll" required />
      <Field label="No. AWB / BL" name="awbBlNumber" value={fields.awbBlNumber ?? ""} onChange={(v) => setField("awbBlNumber", v)} placeholder="AWB/BL number" />
      <Field label="No. Penerbangan / Vessel" name="flightVessel" value={fields.flightVessel ?? ""} onChange={(v) => setField("flightVessel", v)} placeholder="GA-123, MSC Elbe, dll" />
      <Field label="No. Booking" name="bookingNumber" value={fields.bookingNumber ?? ""} onChange={(v) => setField("bookingNumber", v)} placeholder="Nomor booking jika ada" />
      <Field label="ETD (Tanggal Keberangkatan)" name="etd" value={fields.etd ?? ""} onChange={(v) => setField("etd", v)} placeholder="dd/mm/yyyy" required />
      <Field label="ETA (Tanggal Kedatangan)" name="eta" value={fields.eta ?? ""} onChange={(v) => setField("eta", v)} placeholder="dd/mm/yyyy" />
    </>
  );
}

function ProductFields({ fields, setField }: { fields: Record<string, string>; setField: (k: string, v: string) => void }) {
  return (
    <>
      <Field label="Konfirmasi Stok" name="stockConfirmed" value={fields.stockConfirmed ?? ""} onChange={(v) => setField("stockConfirmed", v)} placeholder="Tersedia / Tidak tersedia / Parsial" required />
      <Field label="Jumlah yang Dapat Dipenuhi" name="qtyConfirmed" value={fields.qtyConfirmed ?? ""} onChange={(v) => setField("qtyConfirmed", v)} placeholder="Jumlah unit/kg/karton" />
      <Field label="Tanggal Siap Kirim" name="readyDate" value={fields.readyDate ?? ""} onChange={(v) => setField("readyDate", v)} placeholder="dd/mm/yyyy" required />
      <Field label="Lokasi Gudang" name="warehouseLocation" value={fields.warehouseLocation ?? ""} onChange={(v) => setField("warehouseLocation", v)} placeholder="Alamat gudang" />
    </>
  );
}

function CustomsFields({ fields, setField }: { fields: Record<string, string>; setField: (k: string, v: string) => void }) {
  return (
    <>
      <Field label="Nama PIC Kepabeanan" name="customsPicName" value={fields.customsPicName ?? ""} onChange={(v) => setField("customsPicName", v)} placeholder="Nama PIC / PPJK" required />
      <Field label="Dokumen Dibutuhkan" name="customsDocuments" value={fields.customsDocuments ?? ""} onChange={(v) => setField("customsDocuments", v)} placeholder="PIB, BC 2.3, Invoice, Packing List, dll" />
      <Field label="Estimasi Selesai Proses Bea Cukai" name="customsProcessEta" value={fields.customsProcessEta ?? ""} onChange={(v) => setField("customsProcessEta", v)} placeholder="dd/mm/yyyy atau rentang waktu" />
    </>
  );
}

/* ─── Main Page ──────────────────────────────────────────────── */

export default function VendorFulfillmentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData]       = useState<PageData | null>(null);
  const [error, setError]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields]   = useState<Record<string, string>>({});
  const [notes, setNotes]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [justSubmitted, setJustSubmitted] = useState(false);

  const setField = (k: string, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!token) return;
    fetch(`/api/vendor-fulfillment/${token}`)
      .then(async (r) => {
        const d = await r.json() as PageData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Terjadi kesalahan");
        setData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch(`/api/vendor-fulfillment/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, notes }),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal mengirim");
      setJustSubmitted(true);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader />;
  if (error)   return <ErrorCard message={error} />;
  if (!data)   return <ErrorCard message="Data tidak ditemukan" />;

  // Already submitted (from server) — show read-only review
  if (data.isSubmitted) {
    return <SubmittedReview data={data} justSubmitted={false} />;
  }

  // Just submitted locally — show review with locally-captured fields
  if (justSubmitted) {
    return <SubmittedReview data={data} localFields={{ ...fields, notes }} justSubmitted />;
  }

  const svc      = data.serviceType;
  const icon     = getServiceIcon(svc);
  const svcLabel = getServiceLabel(svc);

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-10 px-4">
      <form onSubmit={handleSubmit}>
        <div className="max-w-lg mx-auto space-y-4">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">{icon}</span>
              <div>
                <h1 className="text-xl font-bold text-slate-800">Form Fulfillment {svcLabel}</h1>
                {data.vendorName && (
                  <p className="text-sm text-slate-500">Vendor: {data.vendorName}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Lengkapi data di bawah ini untuk mengkonfirmasi penugasan order Anda.
            </p>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Detail Order</h2>
            <div className="space-y-2.5">
              <OrderRow label="No. Order" value={data.order.orderNumber} />
              <OrderRow label="Layanan" value={data.order.serviceType} />
              <OrderRow label="Rute" value={`${data.order.origin} → ${data.order.destination}`} />
              {data.order.commodity && <OrderRow label="Komoditi" value={data.order.commodity} />}
              {data.order.grossWeight && <OrderRow label="Berat" value={`${data.order.grossWeight} kg`} />}
              {data.order.requiredDate && <OrderRow label="Tgl Butuh" value={data.order.requiredDate} />}
              {data.order.vehicleType && <OrderRow label="Tipe Kendaraan" value={data.order.vehicleType} />}
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
              {icon} Data Fulfillment
            </h2>
            {svc.includes("trucking") && <TruckingFields fields={fields} setField={setField} />}
            {(svc.includes("freight_air") || svc.includes("freight_sea") || svc.includes("freight")) &&
              !svc.includes("trucking") && <FreightFields fields={fields} setField={setField} />}
            {svc.includes("product") && <ProductFields fields={fields} setField={setField} />}
            {svc.includes("customs") && <CustomsFields fields={fields} setField={setField} />}
            {svc.includes("general") && (
              <p className="text-sm text-slate-500">Isi catatan di bawah untuk mendeskripsikan detail fulfillment.</p>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Catatan Tambahan (opsional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Catatan operasional, kendala, atau informasi lain yang relevan..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 resize-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors active:scale-95"
          >
            {submitting ? "Mengirim..." : "Kirim Data Fulfillment"}
          </button>

        </div>
      </form>
    </div>
  );
}
