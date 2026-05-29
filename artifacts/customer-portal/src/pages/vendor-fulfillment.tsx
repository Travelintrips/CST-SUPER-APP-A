import { useState, useEffect, useRef } from "react";
import { useParams } from "wouter";

/* ─── Types ───────────────────────────────────────────────────────────────── */

type OrderItemInfo = {
  serviceName: string;
  category: string;
  subtotal: string | null;
  quantity: string | null;
  unit: string | null;
};

type OrderInfo = {
  id: number;
  orderNumber: string;
  customerName?: string;
  serviceType: string;
  orderType?: string | null;
  origin: string;
  destination: string;
  commodity: string | null;
  grossWeight: string | null;
  requiredDate: string | null;
  vehicleType: string | null;
  status: string;
  items?: OrderItemInfo[];
  grandTotal?: string | null;
  subtotalBeforeTax?: string | null;
  taxAmount?: string | null;
  taxRate?: number | null;
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
  priceConfirmed: string | null;
  revisedPrice: string | null;
  leadTime: string | null;
  stockPhotoUrl: string | null;
  invoiceUrl: string | null;
  supportingDocUrl: string | null;
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

/* ─── Helpers ─────────────────────────────────────────────────────────────── */

function getServiceIcon(svcType: string) {
  if (svcType.includes("trucking")) return "🚚";
  if (svcType.includes("air"))      return "✈️";
  if (svcType.includes("sea"))      return "🚢";
  if (svcType.includes("product"))  return "🛒";
  if (svcType.includes("customs"))  return "🏛️";
  return "🔧";
}

function getServiceLabel(svcType: string) {
  if (svcType.includes("trucking"))    return "Trucking";
  if (svcType.includes("freight_air")) return "Freight Udara";
  if (svcType.includes("freight_sea")) return "Freight Laut";
  if (svcType.includes("product"))     return "Pemenuhan Produk";
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

function fmtDateLocal(dateStr: string | null): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr + "T00:00:00");
    const BULAN = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agt","Sep","Okt","Nov","Des"];
    return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

function idr(n: number | string | null | undefined): string {
  if (n == null || n === "") return "—";
  const num = Number(n);
  if (isNaN(num)) return String(n);
  return `Rp ${Math.round(num).toLocaleString("id-ID")}`;
}

function needsPickup(serviceType: string): boolean {
  const s = (serviceType ?? "").toLowerCase();
  return s.includes("pickup") || s.includes("ex-warehouse") || s.includes("ex warehouse")
    || s.includes("exw") || s.includes("fca") || s.includes("gudang");
}

const STOCK_LABEL: Record<string, string> = {
  all: "Tersedia Semua ✅",
  partial: "Tersedia Sebagian ⚠️",
  none: "Tidak Tersedia ❌",
};

const PRICE_LABEL: Record<string, string> = {
  agree: "Setuju Harga Asal",
  revised: "Revisi Harga",
};

/* ─── UI Primitives ───────────────────────────────────────────────────────── */

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
        <p className="text-xs text-slate-400 mt-3">Jika Anda merasa ini keliru, hubungi tim admin.</p>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
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

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between items-center py-1.5 ${bold ? "border-t border-amber-200 pt-2.5 mt-1" : ""}`}>
      <span className={`text-sm ${bold ? "font-bold text-slate-800" : "text-slate-600"}`}>{label}</span>
      <span className={`text-sm ${bold ? "font-bold text-emerald-700 text-base" : "font-medium text-slate-700"}`}>{value}</span>
    </div>
  );
}

/* ─── Submitted Review ────────────────────────────────────────────────────── */

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
  const order      = data.order;

  const TAX_RATE = order.taxRate ?? 11;
  const stockStatus = val("stockConfirmed");
  const priceChoice = val("priceConfirmed");
  const isRevised = priceChoice === "revised";
  const isPartial = stockStatus === "partial";

  let dpp = 0, ppn = 0, total = 0;
  if (isProduct && stockStatus !== "none") {
    if (isRevised && val("revisedPrice")) {
      dpp   = Number(val("revisedPrice"));
      ppn   = Math.round(dpp * TAX_RATE / 100);
      total = dpp + ppn;
    } else {
      dpp   = Number(order.subtotalBeforeTax ?? 0);
      ppn   = Number(order.taxAmount ?? 0);
      total = Number(order.grandTotal ?? 0);
    }
  }

  const hasAnyData =
    val("driverName") || val("carrierName") || val("stockConfirmed") ||
    val("customsPicName") || val("plateNumber") || val("awbBlNumber");

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-10 px-4">
      <div className="max-w-lg mx-auto space-y-4">

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
            <OrderRow label="No. Order" value={order.orderNumber} />
            {order.customerName && <OrderRow label="Customer" value={order.customerName} />}
            <OrderRow label="Layanan" value={order.serviceType} />
            {!isProduct && <OrderRow label="Rute" value={`${order.origin} → ${order.destination}`} />}
            {order.commodity && <OrderRow label="Komoditi" value={order.commodity} />}
          </div>
        </div>

        {hasAnyData && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-1">
              {icon} Data Fulfillment yang Dikirim
            </h2>
            <p className="text-xs text-slate-400 mb-4">Read-only — tidak dapat diubah.</p>

            {isTrucking && (
              <>
                <Row label="Nama Driver"    value={val("driverName")} />
                <Row label="No. HP Driver"  value={val("driverPhone")} />
                <Row label="Nomor Plat"     value={val("plateNumber")} />
                <Row label="Tipe Kendaraan" value={val("vehicleType")} />
                <Row label="Est. Pickup"    value={val("pickupTime")} />
              </>
            )}
            {isFreight && (
              <>
                <Row label="Carrier / Maskapai"     value={val("carrierName")} />
                <Row label="No. AWB / BL"            value={val("awbBlNumber")} />
                <Row label="No. Penerbangan/Vessel"  value={val("flightVessel")} />
                <Row label="No. Booking"             value={val("bookingNumber")} />
                <Row label="ETD"                     value={val("etd")} />
                <Row label="ETA"                     value={val("eta")} />
              </>
            )}
            {isProduct && (
              <>
                {/* Product items table */}
                {order.items && order.items.length > 0 && (
                  <div className="mb-4 overflow-x-auto rounded-xl border border-slate-100">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-slate-400 text-xs">
                          <th className="text-left px-3 py-2 font-medium">Produk</th>
                          <th className="text-right px-3 py-2 font-medium">Qty</th>
                          <th className="text-right px-3 py-2 font-medium">Satuan</th>
                          <th className="text-right px-3 py-2 font-medium">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {order.items.map((it, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-slate-700">{it.serviceName || "—"}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{it.quantity ?? "—"}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{it.unit ?? "—"}</td>
                            <td className="px-3 py-2 text-right font-medium text-slate-700">{idr(it.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <Row label="Status Stok"      value={stockStatus ? STOCK_LABEL[stockStatus] ?? stockStatus : null} />
                {isPartial && <Row label="Qty Dipenuhi"   value={val("qtyConfirmed")} />}
                <Row label="Tanggal Siap Kirim" value={val("readyDate") ? fmtDateLocal(val("readyDate")) : null} />
                <Row label="Lead Time"          value={val("leadTime")} />
                <Row label="Lokasi Gudang"      value={val("warehouseLocation")} />
                <Row label="Konfirmasi Harga"   value={priceChoice ? PRICE_LABEL[priceChoice] ?? priceChoice : null} />
                {isRevised && <Row label="Harga Revisi (DPP)" value={val("revisedPrice") ? idr(val("revisedPrice")) : null} />}
                {stockStatus !== "none" && total > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">DPP</span>
                      <span className="text-slate-700">{idr(dpp)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">PPN {TAX_RATE}%</span>
                      <span className="text-slate-700">{idr(ppn)}</span>
                    </div>
                    <div className="flex justify-between font-bold border-t border-slate-100 pt-2">
                      <span className="text-slate-700">Grand Total</span>
                      <span className="text-emerald-700">{idr(total)}</span>
                    </div>
                  </div>
                )}
                {val("stockPhotoUrl") && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-400 mb-1.5">Foto Stok</p>
                    {val("stockPhotoUrl")!.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i) ? (
                      <img src={val("stockPhotoUrl")!} alt="Foto stok" className="max-h-40 rounded-lg border border-slate-200" />
                    ) : (
                      <a href={val("stockPhotoUrl")!} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Lihat file foto stok</a>
                    )}
                  </div>
                )}
                {val("invoiceUrl") && (
                  <div className="mt-2">
                    <a href={val("invoiceUrl")!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 underline">
                      📄 Lihat Invoice
                    </a>
                  </div>
                )}
                {val("supportingDocUrl") && (
                  <div className="mt-1">
                    <a href={val("supportingDocUrl")!} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-xs text-blue-600 underline">
                      📎 Lihat Dokumen Pendukung
                    </a>
                  </div>
                )}
              </>
            )}
            {isCustoms && (
              <>
                <Row label="Nama PIC Kepabeanan"      value={val("customsPicName")} />
                <Row label="Dokumen Dibutuhkan"        value={val("customsDocuments")} />
                <Row label="Est. Selesai Bea Cukai"   value={val("customsProcessEta")} />
              </>
            )}
            {!isTrucking && !isFreight && !isProduct && !isCustoms && (
              <>
                <Row label="Driver"         value={val("driverName")} />
                <Row label="No. Plat"       value={val("plateNumber")} />
                <Row label="Carrier"        value={val("carrierName")} />
                <Row label="AWB/BL"         value={val("awbBlNumber")} />
                <Row label="ETD"            value={val("etd")} />
                <Row label="ETA"            value={val("eta")} />
                <Row label="Stok"           value={val("stockConfirmed")} />
                <Row label="PIC Kepabeanan" value={val("customsPicName")} />
              </>
            )}
            {val("notes") && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <p className="text-xs text-slate-400 mb-1">Catatan Tambahan</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{val("notes")}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Field primitives ────────────────────────────────────────────────────── */

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

function UploadField({
  label, fileType, url, uploading, onUpload,
}: {
  label: string;
  fileType: string;
  url: string;
  uploading: boolean;
  onUpload: (fileType: string, file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const isImage = url && url.match(/\.(jpg|jpeg|png|webp|heic|heif)$/i);

  return (
    <div className="space-y-1.5">
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,.pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(fileType, file);
          e.target.value = "";
        }}
      />
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
            url
              ? "border-emerald-300 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"
          } disabled:opacity-50`}
        >
          {uploading ? (
            <>
              <span className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
              Mengupload...
            </>
          ) : url ? (
            "✅ Terupload — Ganti"
          ) : (
            "📎 Pilih File"
          )}
        </button>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 underline truncate max-w-[160px]"
          >
            {isImage ? "Lihat foto" : "Lihat dokumen"}
          </a>
        )}
      </div>
      {url && isImage && (
        <img
          src={url}
          alt={label}
          className="mt-1 max-h-32 rounded-lg border border-slate-200 object-cover"
        />
      )}
    </div>
  );
}

/* ─── Trucking & Freight & Customs (unchanged) ────────────────────────────── */

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

function CustomsFields({ fields, setField }: { fields: Record<string, string>; setField: (k: string, v: string) => void }) {
  return (
    <>
      <Field label="Nama PIC Kepabeanan" name="customsPicName" value={fields.customsPicName ?? ""} onChange={(v) => setField("customsPicName", v)} placeholder="Nama PIC / PPJK" required />
      <Field label="Dokumen Dibutuhkan" name="customsDocuments" value={fields.customsDocuments ?? ""} onChange={(v) => setField("customsDocuments", v)} placeholder="PIB, BC 2.3, Invoice, Packing List, dll" />
      <Field label="Estimasi Selesai Proses Bea Cukai" name="customsProcessEta" value={fields.customsProcessEta ?? ""} onChange={(v) => setField("customsProcessEta", v)} placeholder="dd/mm/yyyy atau rentang waktu" />
    </>
  );
}

/* ─── Product Fulfillment Form ───────────────────────────────────────────── */

function ProductFulfillmentForm({
  order,
  fields,
  setField,
  token,
}: {
  order: OrderInfo;
  fields: Record<string, string>;
  setField: (k: string, v: string) => void;
  token: string;
}) {
  const [uploading, setUploading] = useState<Record<string, boolean>>({});

  const stockStatus = fields.stockConfirmed ?? "";
  const priceChoice = fields.priceConfirmed ?? "";
  const isPartial   = stockStatus === "partial";
  const isRevised   = priceChoice === "revised";
  const showWarehouse = needsPickup(order.serviceType ?? "");
  const TAX_RATE = order.taxRate ?? 11;

  const origGrand = Number(order.grandTotal ?? 0);
  const origDpp   = Number(order.subtotalBeforeTax ?? Math.round(origGrand * 100 / (100 + TAX_RATE)));
  const origPpn   = Number(order.taxAmount ?? origGrand - origDpp);

  let summaryDpp = origDpp, summaryPpn = origPpn, summaryTotal = origGrand;
  if (isRevised && fields.revisedPrice && Number(fields.revisedPrice) > 0) {
    summaryDpp   = Number(fields.revisedPrice);
    summaryPpn   = Math.round(summaryDpp * TAX_RATE / 100);
    summaryTotal = summaryDpp + summaryPpn;
  }

  const hasSummary = stockStatus && priceChoice && fields.readyDate;

  const handleUpload = async (fileType: string, file: File) => {
    setUploading((p) => ({ ...p, [fileType]: true }));
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`/api/vendor-fulfillment/${token}/upload?type=${fileType}`, {
        method: "POST",
        body: fd,
      });
      const d = await r.json() as { url?: string; error?: string };
      if (!r.ok) throw new Error(d.error ?? "Upload gagal");
      setField(`${fileType}Url`, d.url!);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading((p) => ({ ...p, [fileType]: false }));
    }
  };

  return (
    <>
      {/* ── 1. Detail Produk ── */}
      {order.items && order.items.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
          <div className="px-5 py-3 bg-slate-50 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Detail Produk</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 text-xs border-b border-slate-100">
                  <th className="text-left px-4 py-2.5 font-medium">Nama Produk</th>
                  <th className="text-right px-4 py-2.5 font-medium">Qty Order</th>
                  <th className="text-right px-4 py-2.5 font-medium">Satuan</th>
                  <th className="text-right px-4 py-2.5 font-medium">Subtotal</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {order.items.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-slate-700 font-medium">{item.serviceName || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-600">{item.quantity ?? "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500">{item.unit ?? "—"}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-700">{idr(item.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {origGrand > 0 && (
            <div className="px-5 py-4 border-t border-slate-100 bg-slate-50/50 space-y-1.5">
              {origDpp > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">DPP (Harga Dasar)</span>
                  <span className="text-slate-700">{idr(origDpp)}</span>
                </div>
              )}
              {origPpn > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">PPN {TAX_RATE}%</span>
                  <span className="text-slate-700">{idr(origPpn)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t border-slate-200 pt-2">
                <span className="text-slate-700">Grand Total Order</span>
                <span className="text-emerald-700 text-base">{idr(origGrand)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 2. Konfirmasi Stok ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-800">📦 Konfirmasi Stok</h2>
          <p className="text-xs text-slate-400 mt-0.5">Pilih ketersediaan stok untuk order ini</p>
        </div>
        <div className="flex flex-col gap-2">
          {[
            { val: "all",     label: "✅ Tersedia Semua",     desc: "Semua qty dapat dipenuhi" },
            { val: "partial", label: "⚠️ Tersedia Sebagian",  desc: "Hanya sebagian qty tersedia" },
            { val: "none",    label: "❌ Tidak Tersedia",      desc: "Stok kosong saat ini" },
          ].map((opt) => (
            <button
              key={opt.val}
              type="button"
              onClick={() => setField("stockConfirmed", opt.val)}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all flex items-center justify-between gap-2 ${
                stockStatus === opt.val
                  ? opt.val === "all"
                    ? "border-emerald-500 bg-emerald-50"
                    : opt.val === "partial"
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-400 bg-red-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div>
                <p className={`text-sm font-semibold ${stockStatus === opt.val ? (opt.val === "all" ? "text-emerald-800" : opt.val === "partial" ? "text-amber-800" : "text-red-800") : "text-slate-700"}`}>
                  {opt.label}
                </p>
                <p className={`text-xs mt-0.5 ${stockStatus === opt.val ? "text-slate-600" : "text-slate-400"}`}>
                  {opt.desc}
                </p>
              </div>
              {stockStatus === opt.val && (
                <span className="text-slate-400 shrink-0">✓</span>
              )}
            </button>
          ))}
        </div>
        {isPartial && (
          <div className="pt-1">
            <Field
              label="Jumlah yang Dapat Dipenuhi"
              name="qtyConfirmed"
              value={fields.qtyConfirmed ?? ""}
              onChange={(v) => setField("qtyConfirmed", v)}
              placeholder="Contoh: 50 karton atau 200 kg"
              required
            />
          </div>
        )}
      </div>

      {/* ── 3. Jadwal ── */}
      {stockStatus && stockStatus !== "none" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">📅 Jadwal Pemenuhan</h2>
            <p className="text-xs text-slate-400 mt-0.5">Kapan produk siap dikirim?</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              Tanggal Siap Kirim<span className="text-red-500 ml-0.5">*</span>
            </label>
            <input
              type="date"
              value={fields.readyDate ?? ""}
              onChange={(e) => setField("readyDate", e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
            {fields.readyDate && (
              <p className="text-xs text-emerald-600 font-medium">
                📅 {fmtDateLocal(fields.readyDate)}
              </p>
            )}
          </div>
          <Field
            label="Lead Time"
            name="leadTime"
            value={fields.leadTime ?? ""}
            onChange={(v) => setField("leadTime", v)}
            placeholder="Contoh: 3 hari kerja"
          />
        </div>
      )}

      {/* ── 4. Lokasi Gudang (conditional) ── */}
      {showWarehouse && stockStatus && stockStatus !== "none" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">📍 Lokasi Gudang / Pickup</h2>
            <p className="text-xs text-slate-400 mt-0.5">Alamat gudang untuk pengambilan barang</p>
          </div>
          <Field
            label="Alamat Gudang"
            name="warehouseLocation"
            value={fields.warehouseLocation ?? ""}
            onChange={(v) => setField("warehouseLocation", v)}
            placeholder="Jl. Industri No. 10, Kawasan Pabrik, Jakarta Utara"
            required
          />
        </div>
      )}

      {/* ── 5. Konfirmasi Harga ── */}
      {stockStatus && stockStatus !== "none" && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-800">💰 Konfirmasi Harga</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Harga order: <span className="font-semibold text-slate-600">{idr(order.grandTotal)}</span>
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => setField("priceConfirmed", "agree")}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                priceChoice === "agree"
                  ? "border-emerald-500 bg-emerald-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className={`text-sm font-semibold ${priceChoice === "agree" ? "text-emerald-800" : "text-slate-700"}`}>
                ✅ Setuju Harga Asal
              </p>
              <p className={`text-xs mt-0.5 ${priceChoice === "agree" ? "text-slate-600" : "text-slate-400"}`}>
                Harga sesuai {idr(order.grandTotal)} (sudah termasuk PPN)
              </p>
            </button>
            <button
              type="button"
              onClick={() => setField("priceConfirmed", "revised")}
              className={`w-full text-left px-4 py-3 rounded-xl border-2 transition-all ${
                priceChoice === "revised"
                  ? "border-amber-400 bg-amber-50"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <p className={`text-sm font-semibold ${priceChoice === "revised" ? "text-amber-800" : "text-slate-700"}`}>
                ✏️ Ajukan Revisi Harga
              </p>
              <p className={`text-xs mt-0.5 ${priceChoice === "revised" ? "text-amber-600" : "text-slate-400"}`}>
                Input harga baru yang Anda tawarkan (sebelum PPN)
              </p>
            </button>
          </div>
          {isRevised && (
            <div className="space-y-1.5 pt-1">
              <Field
                label={`Harga Total Penawaran (sebelum PPN, Rp)`}
                name="revisedPrice"
                type="number"
                value={fields.revisedPrice ?? ""}
                onChange={(v) => setField("revisedPrice", v)}
                placeholder="Contoh: 5000000"
                required
              />
              {fields.revisedPrice && Number(fields.revisedPrice) > 0 && (
                <div className="bg-amber-50 rounded-lg px-3 py-2.5 text-xs space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">DPP (Anda input)</span>
                    <span className="font-medium text-slate-700">{idr(fields.revisedPrice)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">PPN {TAX_RATE}%</span>
                    <span className="font-medium text-slate-700">{idr(Math.round(Number(fields.revisedPrice) * TAX_RATE / 100))}</span>
                  </div>
                  <div className="flex justify-between font-bold border-t border-amber-200 pt-1.5">
                    <span className="text-slate-700">Total inkl. PPN</span>
                    <span className="text-amber-700">{idr(Number(fields.revisedPrice) + Math.round(Number(fields.revisedPrice) * TAX_RATE / 100))}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── 6. Upload Dokumen ── */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-5 space-y-5">
        <div>
          <h2 className="text-sm font-bold text-slate-800">📎 Upload Dokumen</h2>
          <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, WebP, HEIC, atau PDF — max 20 MB per file</p>
        </div>
        <UploadField
          label="Foto Stok"
          fileType="stockPhoto"
          url={fields.stockPhotoUrl ?? ""}
          uploading={!!uploading["stockPhoto"]}
          onUpload={handleUpload}
        />
        <UploadField
          label="Invoice / Faktur"
          fileType="invoice"
          url={fields.invoiceUrl ?? ""}
          uploading={!!uploading["invoice"]}
          onUpload={handleUpload}
        />
        <UploadField
          label="Dokumen Pendukung Lainnya"
          fileType="supportingDoc"
          url={fields.supportingDocUrl ?? ""}
          uploading={!!uploading["supportingDoc"]}
          onUpload={handleUpload}
        />
      </div>

      {/* ── 7. Ringkasan Fulfillment ── */}
      {hasSummary && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-5">
          <h2 className="text-sm font-bold text-slate-800 mb-3">📋 Ringkasan Fulfillment</h2>
          <div className="space-y-0.5">
            <SummaryRow label="Status Stok" value={STOCK_LABEL[stockStatus] ?? stockStatus} />
            {isPartial && fields.qtyConfirmed && (
              <SummaryRow label="Qty Dipenuhi" value={fields.qtyConfirmed} />
            )}
            <SummaryRow label="Tanggal Siap Kirim" value={fmtDateLocal(fields.readyDate)} />
            {fields.leadTime && <SummaryRow label="Lead Time" value={fields.leadTime} />}
            {stockStatus !== "none" && summaryTotal > 0 && (
              <>
                <SummaryRow label="DPP (Harga Dasar)" value={idr(summaryDpp)} />
                <SummaryRow label={`PPN ${TAX_RATE}%`} value={idr(summaryPpn)} />
                <SummaryRow label="Grand Total" value={idr(summaryTotal)} bold />
              </>
            )}
            {priceChoice && (
              <div className="pt-1.5">
                <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                  priceChoice === "agree" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                }`}>
                  {priceChoice === "agree" ? "✅ Setuju harga asal" : "✏️ Revisi harga diajukan"}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Main Page ───────────────────────────────────────────────────────────── */

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
    if (!data) return;

    const svc = data.serviceType;
    const isProduct = svc.includes("product");

    if (isProduct) {
      if (!fields.stockConfirmed) { alert("Pilih status konfirmasi stok terlebih dahulu."); return; }
      if (fields.stockConfirmed !== "none") {
        if (!fields.readyDate) { alert("Tanggal siap kirim wajib diisi."); return; }
        if (!fields.priceConfirmed) { alert("Pilih konfirmasi harga terlebih dahulu."); return; }
        if (fields.priceConfirmed === "revised" && !fields.revisedPrice) {
          alert("Masukkan harga revisi."); return;
        }
      }
    }

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

  if (data.isSubmitted) {
    return <SubmittedReview data={data} justSubmitted={false} />;
  }

  if (justSubmitted) {
    return <SubmittedReview data={data} localFields={{ ...fields, notes }} justSubmitted />;
  }

  const svc      = data.serviceType;
  const icon     = getServiceIcon(svc);
  const svcLabel = getServiceLabel(svc);
  const isProduct = svc.includes("product");
  const order    = data.order;

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-teal-50 py-10 px-4">
      <form onSubmit={handleSubmit}>
        <div className="max-w-lg mx-auto space-y-4">

          {/* Header */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
            <div className="flex items-center gap-3 mb-1">
              <span className="text-3xl">{icon}</span>
              <div>
                <h1 className="text-xl font-bold text-slate-800">
                  {isProduct ? "Konfirmasi Pemenuhan Produk" : `Form Fulfillment ${svcLabel}`}
                </h1>
                {data.vendorName && (
                  <p className="text-sm text-slate-500">Vendor: {data.vendorName}</p>
                )}
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              {isProduct
                ? "Lengkapi data konfirmasi produk, stok, harga, dan jadwal pengiriman."
                : "Lengkapi data di bawah ini untuk mengkonfirmasi penugasan order Anda."}
            </p>
          </div>

          {/* Order info */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-4">Detail Order</h2>
            <div className="space-y-2.5">
              <OrderRow label="No. Order" value={order.orderNumber} />
              {order.customerName && <OrderRow label="Customer" value={order.customerName} />}
              {!isProduct && <OrderRow label="Layanan" value={order.serviceType} />}
              {!isProduct && <OrderRow label="Rute" value={`${order.origin} → ${order.destination}`} />}
              {order.commodity && <OrderRow label="Komoditi" value={order.commodity} />}
              {order.grossWeight && !isProduct && <OrderRow label="Berat" value={`${order.grossWeight} kg`} />}
              {order.requiredDate && <OrderRow label="Tgl Butuh" value={order.requiredDate} />}
              {order.vehicleType && !isProduct && <OrderRow label="Tipe Kendaraan" value={order.vehicleType} />}
            </div>
          </div>

          {/* Fulfillment fields */}
          <div className={`${isProduct ? "" : "bg-white rounded-2xl shadow-sm border border-emerald-100 p-5 space-y-4"}`}>
            {!isProduct && (
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                {icon} Data Fulfillment
              </h2>
            )}
            {svc.includes("trucking") && <TruckingFields fields={fields} setField={setField} />}
            {(svc.includes("freight_air") || svc.includes("freight_sea") || svc.includes("freight")) &&
              !svc.includes("trucking") && <FreightFields fields={fields} setField={setField} />}
            {isProduct && (
              <ProductFulfillmentForm
                order={order}
                fields={fields}
                setField={setField}
                token={token!}
              />
            )}
            {svc.includes("customs") && <CustomsFields fields={fields} setField={setField} />}
            {svc.includes("general") && (
              <p className="text-sm text-slate-500">Isi catatan di bawah untuk mendeskripsikan detail fulfillment.</p>
            )}

            {/* Catatan tambahan */}
            <div className={`${isProduct ? "bg-white rounded-2xl shadow-sm border border-slate-100 px-5 py-5" : ""} space-y-1.5`}>
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

          {/* Submit button */}
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold text-base transition-colors active:scale-95 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Mengirim...
              </>
            ) : isProduct ? (
              "✓ Konfirmasi Pemenuhan Produk"
            ) : (
              "Kirim Data Fulfillment"
            )}
          </button>

          <p className="text-center text-xs text-slate-400 pb-8">
            {isProduct
              ? "Data Anda akan langsung diproses oleh tim kami"
              : "Data tidak dapat diubah setelah dikirim"}
          </p>

        </div>
      </form>
    </div>
  );
}
