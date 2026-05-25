import { useState, useEffect } from "react";
import { useParams } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderInfo = {
  id: number;
  orderNumber: string;
  customerName: string;
  companyName: string | null;
  email: string | null;
  phone: string | null;
  serviceType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  cargoDescription: string | null;
  grossWeight: string | null;
  volumeCbm: string | null;
  jumlahKoli: number | null;
  requiredDate: string | null;
  notes: string | null;
  paymentType: string | null;
  grandTotal: string | null;
  status: string;
};

type Vendor = {
  id: number;
  name: string;
  phone: string | null;
  serviceType?: string | null;
  isMatching?: boolean;
  hasCommodityMatch?: boolean;
};

type VendorRow = {
  linkId: number;
  vendorId: number;
  vendorName: string;
  status: string;
  basicPrice: number | null;
  offeredPrice: number | null;
  eta: string | null;
  notes: string | null;
  submittedAt: string | null;
};

type Rfq = { id: number; rfqNumber: string; status: string };

type BaseData = {
  token: string;
  actionType: string;
  isUsed: boolean;
  usedAt: string | null;
  order: OrderInfo;
};

type ReviewData = BaseData & { vendors: Vendor[]; rfqs: Rfq[]; vendorFilterApplied: boolean; filterMode: "service" | "commodity" | "etalase" | "none"; shipmentType: string; commodity: string | null };
type CompareData = BaseData & { rfq: Rfq; vendors: VendorRow[] };
type ForwardData = BaseData & {
  rfq: Rfq | null;
  selectedVendor: Vendor | null;
  selectedVendorLink: { id: number; vendorId: number; offeredPrice: string | null } | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const idr = (n: number | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(n).toLocaleString("id-ID")}`;

function Loader({ label = "Memuat data..." }: { label?: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-400">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">{label}</span>
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

function SuccessCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
        <div className="text-6xl mb-4">✅</div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">{title}</h2>
        <p className="text-sm text-slate-500">{message}</p>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex justify-between gap-2 py-1 border-b border-slate-50 last:border-0">
      <span className="text-xs text-slate-400 shrink-0">{label}</span>
      <span className="text-xs text-slate-700 text-right font-medium">{value}</span>
    </div>
  );
}

function OrderCard({ order }: { order: OrderInfo }) {
  const hasRoute = order.origin || order.destination;
  const idr = (v: string | null) => v && Number(v) > 0 ? `Rp ${Math.round(Number(v)).toLocaleString("id-ID")}` : null;

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-3xl">🚢</span>
        <div>
          <h1 className="text-lg font-bold text-slate-800">{order.orderNumber}</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {order.companyName ? `${order.companyName} · ` : ""}{order.customerName}
          </p>
        </div>
        <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 uppercase tracking-wide">{order.status}</span>
      </div>

      <div className="space-y-0.5">
        <DetailRow label="Tipe Layanan" value={order.serviceType || "—"} />
        {hasRoute && (
          <div className="flex justify-between gap-2 py-1 border-b border-slate-50">
            <span className="text-xs text-slate-400 shrink-0">Rute</span>
            <span className="text-xs text-slate-700 text-right font-medium">
              {order.origin || "?"} → {order.destination || "?"}
            </span>
          </div>
        )}
        <DetailRow label="Komoditi" value={order.commodity} />
        <DetailRow label="Deskripsi Kargo" value={order.cargoDescription} />
        {(order.grossWeight || order.volumeCbm || order.jumlahKoli) && (
          <div className="flex justify-between gap-2 py-1 border-b border-slate-50">
            <span className="text-xs text-slate-400 shrink-0">Dimensi / Berat</span>
            <span className="text-xs text-slate-700 text-right font-medium">
              {[
                order.grossWeight ? `${Number(order.grossWeight).toLocaleString("id-ID")} kg` : null,
                order.volumeCbm ? `${Number(order.volumeCbm).toLocaleString("id-ID")} CBM` : null,
                order.jumlahKoli ? `${order.jumlahKoli} koli` : null,
              ].filter(Boolean).join(" · ")}
            </span>
          </div>
        )}
        <DetailRow label="Tanggal Diperlukan" value={order.requiredDate} />
        <DetailRow label="Pembayaran" value={order.paymentType} />
        <DetailRow label="Total" value={idr(order.grandTotal)} />
        {order.notes && (
          <div className="pt-2 mt-1">
            <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wide mb-1">Catatan Customer</p>
            <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">{order.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  waiting_response: "bg-yellow-100 text-yellow-800",
  accepted_basic_price: "bg-green-100 text-green-800",
  counter_offer: "bg-blue-100 text-blue-800",
  rejected: "bg-red-100 text-red-800",
  expired: "bg-gray-100 text-gray-500",
  not_selected: "bg-gray-100 text-gray-500",
  selected: "bg-emerald-100 text-emerald-800",
};

const STATUS_LABEL: Record<string, string> = {
  waiting_response: "Menunggu",
  accepted_basic_price: "Terima Harga Dasar",
  counter_offer: "Counter Offer",
  rejected: "Menolak",
  expired: "Kadaluarsa",
  not_selected: "Tidak Dipilih",
  selected: "Dipilih",
};

// ─── Review Order View (blast vendors) ───────────────────────────────────────

function ReviewOrderView({ token, data }: { token: string; data: ReviewData }) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [deadline, setDeadline] = useState(48);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const toggle = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  const handleBlast = async () => {
    if (!selectedIds.length) { alert("Pilih minimal satu vendor."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin-action/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorIds: selectedIds, deadlineHours: deadline }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; rfqNumber?: string; results?: { vendorName: string; sent: boolean }[] };
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      const sent = (d.results ?? []).filter((r) => r.sent).map((r) => r.vendorName).join(", ");
      setResult({ ok: true, message: `RFQ ${d.rfqNumber} berhasil di-blast ke: ${sent || "vendor terpilih"}.` });
    } catch (e: unknown) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.ok) return <SuccessCard title="RFQ Terkirim!" message={result.message} />;

  const hasServiceType = !!(data.shipmentType && data.shipmentType.trim());
  const hasCommodity   = !!(data.commodity && data.commodity.trim());
  const filterMode     = data.filterMode ?? "none";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📋</span>
            <h1 className="text-xl font-bold text-slate-800">Review Order & Blast Vendor</h1>
          </div>
          <p className="text-sm text-slate-500">Pilih vendor yang akan menerima RFQ untuk order ini.</p>
        </div>

        <OrderCard order={data.order} />

        {data.isUsed && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            ⚠️ Link ini sudah pernah digunakan. Anda masih bisa blast ulang ke vendor lain.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-1">
            <h2 className="font-semibold text-slate-800">
              Vendor Tersedia ({data.vendors.length})
            </h2>
            {filterMode === "service" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                Filter: {data.shipmentType}
              </span>
            )}
            {filterMode === "commodity" && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                Filter: {data.commodity}
              </span>
            )}
          </div>

          {/* Kasus: shipmentType ada, tidak ada vendor yg cocok */}
          {hasServiceType && !data.vendorFilterApplied && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-500">
              ℹ️ Tidak ada vendor yang cocok dengan "<strong>{data.shipmentType}</strong>" — menampilkan semua vendor aktif.
            </div>
          )}
          {/* Kasus: shipmentType kosong, ada commodity, ada vendor etalase match */}
          {filterMode === "commodity" && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-xs text-green-700">
              ✅ Menampilkan vendor yang menjual "<strong>{data.commodity}</strong>" di etalase.
            </div>
          )}
          {/* Kasus: shipmentType kosong, menampilkan hanya vendor yg punya etalase */}
          {filterMode === "etalase" && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700">
              🛍️ Order produk — menampilkan vendor yang memiliki katalog produk/etalase.
            </div>
          )}
          {/* Kasus: tidak ada etalase sama sekali, fallback ke serviceType */}
          {!hasServiceType && !data.vendorFilterApplied && filterMode === "none" && (
            <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-700">
              ⚠️ Belum ada vendor dengan etalase produk — menampilkan vendor berdasarkan tipe layanan terdaftar.
            </div>
          )}

          {data.vendors.length === 0 ? (
            <p className="text-sm text-slate-500">Tidak ada vendor aktif yang bisa dihubungi.</p>
          ) : (
            <div className="space-y-2 mt-3">
              {data.vendors.map((v) => (
                <label key={v.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedIds.includes(v.id) ? "border-blue-400 bg-blue-50" : "border-slate-200 hover:bg-slate-50"}`}>
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(v.id)}
                    onChange={() => toggle(v.id)}
                    className="w-4 h-4 accent-blue-600"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-medium text-slate-800 text-sm">{v.name}</p>
                      {v.hasCommodityMatch && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 border border-green-200">✓ Komoditi</span>
                      )}
                      {v.isMatching && !v.hasCommodityMatch && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">✓ Layanan</span>
                      )}
                    </div>
                    {v.serviceType && <p className="text-xs text-slate-400 truncate">{v.serviceType}</p>}
                  </div>
                  {v.phone && <span className="text-xs text-slate-400 shrink-0">{v.phone}</span>}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <label className="text-sm font-medium text-slate-700 block mb-2">
            Batas Waktu Respons Vendor
          </label>
          <select
            value={deadline}
            onChange={(e) => setDeadline(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
          >
            <option value={24}>24 jam</option>
            <option value={48}>48 jam</option>
            <option value={72}>72 jam</option>
          </select>
        </div>

        {result && !result.ok && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            ⚠️ {result.message}
          </div>
        )}

        <button
          onClick={handleBlast}
          disabled={submitting || selectedIds.length === 0}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors"
        >
          {submitting ? "Mengirim..." : `🚀 Blast RFQ ke ${selectedIds.length} Vendor`}
        </button>

        <p className="text-center text-xs text-slate-400 pb-4">CST Logistics · Admin Action</p>
      </div>
    </div>
  );
}

// ─── Compare Vendors View ─────────────────────────────────────────────────────

function CompareVendorsView({ token, data }: { token: string; data: CompareData }) {
  const [selectedLinkId, setSelectedLinkId] = useState<number | null>(null);
  const [sellingPrice, setSellingPrice] = useState("");
  const [quoteNotes, setQuoteNotes] = useState("");
  const [sendToCustomer, setSendToCustomer] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const handleSelect = async () => {
    if (!selectedLinkId) { alert("Pilih vendor terlebih dahulu."); return; }
    if (sendToCustomer && !sellingPrice) { alert("Harga jual ke customer wajib diisi."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin-action/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          linkId: selectedLinkId,
          sellingPrice: sellingPrice ? Number(sellingPrice) : undefined,
          quoteNotes: quoteNotes || undefined,
          sendQuoteToCustomer: sendToCustomer,
        }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; vendorName?: string; quoteUrl?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      const msg = `Vendor ${d.vendorName ?? ""} dipilih.${d.quoteUrl ? ` Penawaran terkirim ke customer.` : ""}`;
      setResult({ ok: true, message: msg });
    } catch (e: unknown) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.ok) return <SuccessCard title="Vendor Dipilih!" message={result.message} />;

  const answered = data.vendors.filter((v) => v.offeredPrice !== null || v.status === "accepted_basic_price");

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">⚖️</span>
            <h1 className="text-xl font-bold text-slate-800">Bandingkan Penawaran Vendor</h1>
          </div>
          <p className="text-sm text-slate-500">RFQ: {data.rfq.rfqNumber} · {answered.length}/{data.vendors.length} vendor merespons</p>
        </div>

        <OrderCard order={data.order} />

        <div className="space-y-3">
          {data.vendors.map((v) => {
            const price = v.offeredPrice ?? v.basicPrice;
            const isSelected = selectedLinkId === v.linkId;
            const hasResponse = v.offeredPrice !== null || v.status === "accepted_basic_price";
            return (
              <button
                key={v.linkId}
                onClick={() => hasResponse && setSelectedLinkId(v.linkId)}
                disabled={!hasResponse}
                className={`w-full text-left p-4 rounded-2xl border transition-all ${
                  isSelected
                    ? "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200"
                    : hasResponse
                    ? "border-slate-200 bg-white hover:border-indigo-200 hover:bg-indigo-50/30"
                    : "border-slate-100 bg-slate-50 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-800 text-sm">{v.vendorName}</p>
                      {isSelected && <span className="text-xs bg-indigo-600 text-white rounded-full px-2 py-0.5">✓ Dipilih</span>}
                    </div>
                    {v.eta && <p className="text-xs text-slate-500 mt-0.5">ETA: {v.eta}</p>}
                    {v.notes && <p className="text-xs text-slate-400 mt-0.5 italic">{v.notes}</p>}
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="font-bold text-slate-800">{idr(price)}</p>
                    <span className={`text-xs rounded-full px-2 py-0.5 mt-1 inline-block ${STATUS_BADGE[v.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {STATUS_LABEL[v.status] ?? v.status}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {selectedLinkId && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
            <h2 className="font-semibold text-slate-800">Detail Penjualan</h2>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={sendToCustomer}
                onChange={(e) => setSendToCustomer(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              <span className="text-sm text-slate-700">Kirim penawaran langsung ke customer via WA</span>
            </label>

            {sendToCustomer && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Harga Jual ke Customer (Rp)</label>
                  <input
                    type="number"
                    value={sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value)}
                    placeholder="Contoh: 5500000"
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-slate-700">Catatan Penawaran (opsional)</label>
                  <textarea
                    value={quoteNotes}
                    onChange={(e) => setQuoteNotes(e.target.value)}
                    rows={2}
                    placeholder="Syarat, catatan tambahan..."
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {result && !result.ok && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            ⚠️ {result.message}
          </div>
        )}

        <button
          onClick={handleSelect}
          disabled={submitting || !selectedLinkId}
          className="w-full py-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors"
        >
          {submitting ? "Memproses..." : "✅ Konfirmasi Pilihan Vendor"}
        </button>

        <p className="text-center text-xs text-slate-400 pb-4">CST Logistics · Admin Action</p>
      </div>
    </div>
  );
}

// ─── Forward Vendor View ──────────────────────────────────────────────────────

const SERVICE_TYPES = [
  { value: "trucking", label: "🚚 Trucking" },
  { value: "freight_air", label: "✈️ Freight Udara" },
  { value: "freight_sea", label: "🚢 Freight Laut" },
  { value: "product", label: "📦 Produk / Gudang" },
  { value: "customs", label: "🏛️ Kepabeanan" },
  { value: "general", label: "🔧 Umum" },
];

function ForwardVendorView({ token, data }: { token: string; data: ForwardData }) {
  const [serviceType, setServiceType] = useState("trucking");
  const [customVendorId, setCustomVendorId] = useState<number | null>(
    data.selectedVendor?.id ?? null
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const vendorId = customVendorId ?? data.selectedVendor?.id;

  const handleForward = async () => {
    if (!vendorId) { alert("Pilih vendor terlebih dahulu."); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin-action/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vendorId, serviceType }),
      });
      const d = await res.json() as { ok?: boolean; error?: string; vendorName?: string };
      if (!res.ok) throw new Error(d.error ?? "Gagal");
      setResult({ ok: true, message: `Link fulfillment dikirim ke ${d.vendorName ?? "vendor"} via WhatsApp.` });
    } catch (e: unknown) {
      setResult({ ok: false, message: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  if (result?.ok) return <SuccessCard title="Vendor Diteruskan!" message={result.message} />;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-emerald-50 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">📤</span>
            <h1 className="text-xl font-bold text-slate-800">Forward ke Vendor untuk Eksekusi</h1>
          </div>
          <p className="text-sm text-slate-500">Kirim link fulfillment ke vendor untuk mengisi data operasional.</p>
        </div>

        <OrderCard order={data.order} />

        {data.selectedVendor && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
            <p className="text-sm font-medium text-emerald-800">✅ Vendor Terpilih: {data.selectedVendor.name}</p>
            {data.selectedVendorLink?.offeredPrice && (
              <p className="text-xs text-emerald-600 mt-0.5">Harga: {idr(Number(data.selectedVendorLink.offeredPrice))}</p>
            )}
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">Jenis Layanan untuk Fulfillment</label>
            <select
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          {!data.selectedVendor && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Vendor ID (jika belum ada di RFQ)</label>
              <input
                type="number"
                value={customVendorId ?? ""}
                onChange={(e) => setCustomVendorId(Number(e.target.value) || null)}
                placeholder="Masukkan vendor ID..."
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400"
              />
            </div>
          )}
        </div>

        {result && !result.ok && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            ⚠️ {result.message}
          </div>
        )}

        <button
          onClick={handleForward}
          disabled={submitting || !vendorId}
          className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-semibold text-sm transition-colors"
        >
          {submitting ? "Mengirim..." : "📨 Kirim Link Fulfillment ke Vendor"}
        </button>

        <p className="text-center text-xs text-slate-400 pb-4">CST Logistics · Admin Action</p>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminActionPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ReviewData | CompareData | ForwardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/admin-action/${token}`)
      .then(async (r) => {
        const d = await r.json() as (ReviewData | CompareData | ForwardData) & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Terjadi kesalahan");
        setData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) return <Loader />;
  if (error) return <ErrorCard message={error} />;
  if (!data) return <ErrorCard message="Data tidak ditemukan" />;

  if (data.actionType === "review_order") {
    return <ReviewOrderView token={token!} data={data as ReviewData} />;
  }
  if (data.actionType === "compare_vendors") {
    return <CompareVendorsView token={token!} data={data as CompareData} />;
  }
  if (data.actionType === "forward_vendor") {
    return <ForwardVendorView token={token!} data={data as ForwardData} />;
  }

  return <ErrorCard message={`Tipe aksi tidak dikenal: ${data.actionType}`} />;
}
