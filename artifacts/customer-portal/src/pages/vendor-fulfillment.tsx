import { useState, useEffect } from "react";
import { useParams } from "wouter";

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

type PageData = {
  token: string;
  isSubmitted: boolean;
  serviceType: string;
  vendorName: string | null;
  order: OrderInfo;
};

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
        <p className="text-sm text-slate-600">{message}</p>
      </div>
    </div>
  );
}

function SuccessCard() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">Data Terkirim!</h2>
        <p className="text-sm text-slate-500">
          Detail fulfillment Anda telah kami terima. Tim CST Logistics akan segera memproses.
        </p>
      </div>
    </div>
  );
}

function Field({
  label, name, value, onChange, placeholder = "", required = false, type = "text",
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start gap-3">
      <span className="text-sm text-slate-500 flex-shrink-0">{label}</span>
      <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

function getServiceIcon(svcType: string) {
  if (svcType.includes("trucking")) return "🚚";
  if (svcType.includes("air")) return "✈️";
  if (svcType.includes("sea")) return "🚢";
  if (svcType.includes("product")) return "📦";
  if (svcType.includes("customs")) return "🏛️";
  return "🔧";
}

function getServiceLabel(svcType: string) {
  if (svcType.includes("trucking")) return "Trucking";
  if (svcType.includes("freight_air")) return "Freight Udara";
  if (svcType.includes("freight_sea")) return "Freight Laut";
  if (svcType.includes("product")) return "Produk / Gudang";
  if (svcType.includes("customs")) return "Kepabeanan";
  return "Fulfillment";
}

export default function VendorFulfillmentPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const setField = (k: string, v: string) =>
    setFields((prev) => ({ ...prev, [k]: v }));

  useEffect(() => {
    if (!token) return;
    fetch(`/api/vendor-fulfillment/${token}`)
      .then(async (r) => {
        const d = await r.json() as PageData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Terjadi kesalahan");
        setData(d);
        if (d.isSubmitted) setSubmitted(true);
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
      setSubmitted(true);
    } catch (e: unknown) {
      alert((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loader />;
  if (error) return <ErrorCard message={error} />;
  if (submitted) return <SuccessCard />;
  if (!data) return <ErrorCard message="Data tidak ditemukan" />;

  const svc = data.serviceType;
  const icon = getServiceIcon(svc);
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
              <Row label="No. Order" value={data.order.orderNumber} />
              <Row label="Layanan" value={data.order.serviceType} />
              <Row label="Rute" value={`${data.order.origin} → ${data.order.destination}`} />
              {data.order.commodity && <Row label="Komoditi" value={data.order.commodity} />}
              {data.order.grossWeight && <Row label="Berat" value={`${data.order.grossWeight} kg`} />}
              {data.order.requiredDate && <Row label="Tgl Butuh" value={data.order.requiredDate} />}
              {data.order.vehicleType && <Row label="Tipe Kendaraan" value={data.order.vehicleType} />}
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
            {submitting ? "Mengirim..." : "✅ Kirim Data Fulfillment"}
          </button>

          <p className="text-center text-xs text-slate-400 pb-4">
            CST Logistics · Formulir Vendor Fulfillment
          </p>
        </div>
      </form>
    </div>
  );
}
