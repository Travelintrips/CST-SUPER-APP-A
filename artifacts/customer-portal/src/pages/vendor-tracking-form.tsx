import { useState } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";

const STATUSES = [
  { value: "RECEIVED_DATA",      label: "Data Diterima",          icon: "📥" },
  { value: "BOOKING_PROCESS",    label: "Proses Booking",         icon: "📋" },
  { value: "SCHEDULE_CONFIRMED", label: "Jadwal Terkonfirmasi",   icon: "📅" },
  { value: "PICKUP_ARRANGED",    label: "Pickup Diatur",          icon: "🚛" },
  { value: "DOCUMENT_PROCESS",   label: "Proses Dokumen",         icon: "📄" },
  { value: "CUSTOMS_PROCESS",    label: "Proses Kepabeanan",      icon: "🏛️" },
  { value: "IN_TRANSIT",         label: "Dalam Perjalanan",       icon: "✈️" },
  { value: "DELIVERED",          label: "Terkirim",               icon: "📦" },
  { value: "COMPLETED",          label: "Selesai",                icon: "✅" },
];

const STATUS_ORDER: Record<string, number> = Object.fromEntries(
  STATUSES.map((s, i) => [s.value, i]),
);

interface TrackingLog {
  status: string;
  label: string;
  notes: string | null;
  createdAt: string;
}

interface TrackingData {
  token: string;
  vendorName: string;
  orderNumber: string;
  customerName: string;
  shipmentType: string;
  origin: string;
  destination: string;
  commodity: string | null;
  currentStatus: string;
  completedAt: string | null;
  logs: TrackingLog[];
}

export default function VendorTrackingFormPage() {
  const { token } = useParams<{ token: string }>();
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery<TrackingData>({
    queryKey: ["vendor-tracking", token],
    queryFn: async () => {
      const r = await fetch(`/api/vendor-tracking/${encodeURIComponent(token ?? "")}`);
      if (!r.ok) {
        const err = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Link tidak valid");
      }
      return r.json();
    },
    enabled: !!token,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ status, notes: n }: { status: string; notes: string }) => {
      const r = await fetch(`/api/vendor-tracking/${encodeURIComponent(token ?? "")}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes: n || undefined }),
      });
      const result = await r.json() as { ok?: boolean; message?: string; error?: string };
      if (!r.ok) throw new Error(result.error ?? "Gagal update status");
      return result;
    },
    onSuccess: () => {
      setSubmitted(true);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });

  const currentIdx = data ? (STATUS_ORDER[data.currentStatus] ?? -1) : -1;

  const availableStatuses = STATUSES.filter((s) => {
    const idx = STATUS_ORDER[s.value] ?? -1;
    return idx >= currentIdx;
  });

  const handleSubmit = () => {
    if (!selectedStatus) { setError("Pilih status terlebih dahulu"); return; }
    setError(null);
    updateMutation.mutate({ status: selectedStatus, notes });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mx-auto mb-3"></div>
          <p className="text-gray-500 text-sm">Memuat form tracking...</p>
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">❌</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Link Tidak Valid</h2>
          <p className="text-gray-500 text-sm">Link tracking tidak ditemukan atau sudah kadaluarsa.</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    const updatedLabel = STATUSES.find((s) => s.value === selectedStatus)?.label ?? selectedStatus;
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-lg font-bold text-gray-800 mb-2">Update Berhasil!</h2>
          <p className="text-gray-500 text-sm mb-4">
            Status order <strong>{data.orderNumber}</strong> telah diupdate ke:
          </p>
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-800 font-semibold mb-4">
            {STATUSES.find((s) => s.value === selectedStatus)?.icon} {updatedLabel}
          </div>
          {selectedStatus === "COMPLETED" && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-blue-700 text-sm">
              Terima kasih! Tim admin akan memproses penyelesaian order dan menerbitkan invoice.
            </div>
          )}
          <p className="text-xs text-gray-400 mt-4">
            Notifikasi telah dikirim ke admin dan customer.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-lg mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow p-5">
          <div className="flex items-start gap-3">
            <div className="text-3xl">🚢</div>
            <div>
              <h1 className="text-lg font-bold text-gray-800">Update Progress Pengiriman</h1>
              <p className="text-sm text-gray-500">CST Logistics</p>
            </div>
          </div>
          <div className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">No. Order</span>
              <span className="font-mono font-semibold text-gray-800">{data.orderNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Customer</span>
              <span className="text-gray-800">{data.customerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Layanan</span>
              <span className="text-gray-800">{data.shipmentType}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Rute</span>
              <span className="text-gray-800 text-right max-w-[180px]">{data.origin} → {data.destination}</span>
            </div>
            {data.commodity && (
              <div className="flex justify-between">
                <span className="text-gray-500">Komoditi</span>
                <span className="text-gray-800">{data.commodity}</span>
              </div>
            )}
          </div>
        </div>

        {/* Status Saat Ini */}
        <div className="bg-white rounded-2xl shadow p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Status Saat Ini</h2>
          <div className="flex items-center gap-2">
            <span className="text-2xl">{STATUSES.find((s) => s.value === data.currentStatus)?.icon ?? "📍"}</span>
            <div>
              <p className="font-semibold text-gray-800">
                {STATUSES.find((s) => s.value === data.currentStatus)?.label ?? data.currentStatus}
              </p>
              <p className="text-xs text-gray-400">Status terakhir diperbarui</p>
            </div>
          </div>

          {/* Timeline mini */}
          {data.logs.length > 0 && (
            <div className="mt-4 border-t pt-3">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">Riwayat Update</p>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {[...data.logs].reverse().map((log, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <span className="text-base leading-none mt-0.5">
                      {STATUSES.find((s) => s.value === log.status)?.icon ?? "•"}
                    </span>
                    <div className="flex-1">
                      <span className="font-medium text-gray-700">{log.label}</span>
                      {log.notes && <p className="text-xs text-gray-500">{log.notes}</p>}
                      <p className="text-xs text-gray-400">
                        {new Date(log.createdAt).toLocaleString("id-ID")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Form Update */}
        {data.completedAt ? (
          <div className="bg-green-50 rounded-2xl border border-green-200 p-5 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <p className="font-semibold text-green-800">Order Sudah Selesai</p>
            <p className="text-sm text-green-600 mt-1">Terima kasih atas penyelesaian pengiriman ini.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow p-5">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Update Status Terbaru</h2>

            <div className="space-y-2 mb-4">
              {availableStatuses.map((s) => (
                <label
                  key={s.value}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selectedStatus === s.value
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <input
                    type="radio"
                    name="status"
                    value={s.value}
                    checked={selectedStatus === s.value}
                    onChange={() => setSelectedStatus(s.value)}
                    className="accent-blue-600"
                  />
                  <span className="text-lg">{s.icon}</span>
                  <span className={`text-sm font-medium ${selectedStatus === s.value ? "text-blue-800" : "text-gray-700"}`}>
                    {s.label}
                  </span>
                  {s.value === data.currentStatus && (
                    <span className="ml-auto text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">Saat ini</span>
                  )}
                </label>
              ))}
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (opsional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Misal: Sudah di-booking, jadwal pickup besok pagi..."
                rows={3}
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>

            {selectedStatus === "COMPLETED" && (
              <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
                ⚠️ Memilih <strong>Selesai</strong> akan memberitahu admin untuk menutup order dan menerbitkan invoice ke customer.
              </div>
            )}

            {error && (
              <div className="mb-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={handleSubmit}
              disabled={!selectedStatus || updateMutation.isPending}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white font-semibold rounded-xl px-4 py-3 text-sm transition-colors flex items-center justify-center gap-2"
            >
              {updateMutation.isPending ? (
                <>
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                  Menyimpan...
                </>
              ) : (
                "Kirim Update Status"
              )}
            </button>
          </div>
        )}

        <div className="text-center text-xs text-gray-400 pb-4">
          Powered by CST Logistics
        </div>
      </div>
    </div>
  );
}
