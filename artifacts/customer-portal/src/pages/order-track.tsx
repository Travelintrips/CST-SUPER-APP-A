import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { usePushNotification } from "@/hooks/usePushNotification";

type ProgressEntry = {
  id: number;
  status: string;
  notes: string | null;
  updated_by: string;
  is_public: boolean;
  created_at: string;
};

type OperationalDetails = {
  driverName?: string | null;
  driverPhone?: string | null;
  vehiclePlate?: string | null;
  vehicleType?: string | null;
  pickupTime?: string | null;
  carrier?: string | null;
  schedule?: string | null;
  etd?: string | null;
  eta?: string | null;
  awbBlNumber?: string | null;
} | null;

type TrackData = {
  order: {
    orderNumber: string;
    shipmentType: string;
    origin: string;
    destination: string;
    commodity?: string | null;
    grossWeight?: string | null;
    status: string;
    jobStatus?: string | null;
    customerName: string;
    createdAt: string;
    etd?: string | null;
    eta?: string | null;
  };
  vendor?: { name: string } | null;
  progress: ProgressEntry[];
  operational: OperationalDetails;
};

const JOB_STATUS_STEPS = [
  { key: "vendor_assigned",   label: "Vendor Ditugaskan",   icon: "👤" },
  { key: "vendor_accepted",   label: "Vendor Menerima",     icon: "✅" },
  { key: "pickup_scheduled",  label: "Pickup Dijadwalkan",  icon: "📅" },
  { key: "in_progress",       label: "Dalam Proses",        icon: "🚛" },
  { key: "pod_uploaded",      label: "Dokumen Diunggah",    icon: "📎" },
  { key: "completed",         label: "Selesai",             icon: "🎉" },
];

function mapStatusToStep(status: string | null | undefined): number {
  if (!status) return -1;
  const s = status.toLowerCase().replace(/\s+/g, "_");
  const idx = JOB_STATUS_STEPS.findIndex(st => st.key === s);
  if (idx >= 0) return idx;
  // fallback checks
  if (s.includes("assigned")) return 0;
  if (s.includes("accepted")) return 1;
  if (s.includes("pickup") || s.includes("scheduled")) return 2;
  if (s.includes("progress") || s.includes("transit") || s.includes("picked")) return 3;
  if (s.includes("pod") || s.includes("upload")) return 4;
  if (s.includes("complet") || s.includes("done") || s.includes("delivered")) return 5;
  return -1;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex items-start justify-between gap-2 text-sm">
      <span className="text-slate-500 shrink-0">{label}</span>
      <span className="font-medium text-slate-800 text-right">{value}</span>
    </div>
  );
}

function formatDate(s: string) {
  return new Date(s).toLocaleString("id-ID", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PushToggleSimple({ orderNumber }: { orderNumber: string | null }) {
  const { state, subscribe, unsubscribe } = usePushNotification(orderNumber);
  if (state === "unsupported" || !orderNumber) return null;
  if (state === "denied") {
    return (
      <div className="mt-3 text-xs text-slate-500 flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200">
        🔕 Notifikasi diblokir — aktifkan di pengaturan browser
      </div>
    );
  }
  if (state === "subscribed") {
    return (
      <button onClick={unsubscribe} className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-blue-700 font-medium px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 transition-colors">
        🔔 Notifikasi aktif — klik untuk matikan
      </button>
    );
  }
  return (
    <button onClick={subscribe} disabled={state === "loading"} className="mt-3 w-full flex items-center justify-center gap-2 text-xs text-slate-600 font-medium px-3 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors disabled:opacity-50">
      {state === "loading" ? "⏳ Mengaktifkan..." : "🔔 Aktifkan notifikasi browser"}
    </button>
  );
}

export default function OrderTrackPage() {
  const { trackToken } = useParams<{ trackToken: string }>();
  const [data, setData] = useState<TrackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const doFetch = () => {
    if (!trackToken) return;
    fetch(`/api/order-track/${trackToken}`)
      .then(async r => {
        const d = await r.json() as TrackData & { error?: string };
        if (!r.ok) throw new Error(d.error ?? "Terjadi kesalahan");
        setData(d);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    doFetch();
    // Poll setiap 30 detik agar status order selalu terbaru tanpa refresh manual
    const interval = setInterval(doFetch, 30_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackToken]);

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-slate-500">
        <div className="h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-sm">Memuat tracking...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-md p-8 max-w-md w-full text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <h2 className="text-lg font-semibold text-slate-800 mb-2">Link Tidak Valid</h2>
        <p className="text-sm text-slate-500">{error}</p>
        <p className="text-xs text-slate-400 mt-3">Hubungi tim kami untuk informasi lebih lanjut.</p>
      </div>
    </div>
  );

  if (!data) return null;

  const currentStep = mapStatusToStep(data.order.jobStatus ?? data.order.status);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-slate-50 py-8 px-4">
      <div className="max-w-xl mx-auto space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start gap-3">
            <div className="text-3xl">📦</div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-slate-800">Tracking Order</h1>
              <p className="text-sm text-slate-500 mt-0.5 font-mono">{data.order.orderNumber}</p>
            </div>
          </div>

          <div className="mt-4 bg-slate-50 rounded-xl px-4 py-3 space-y-2">
            <InfoRow label="Layanan" value={data.order.shipmentType} />
            <InfoRow label="Rute" value={`${data.order.origin} → ${data.order.destination}`} />
            {data.order.commodity && <InfoRow label="Komoditi" value={data.order.commodity} />}
            {data.order.grossWeight && <InfoRow label="Berat" value={`${data.order.grossWeight} kg`} />}
            {data.vendor && <InfoRow label="Vendor" value={<span className="text-blue-700">{data.vendor.name}</span>} />}
            <InfoRow label="Order Dibuat" value={formatDate(data.order.createdAt)} />
          </div>

          <PushToggleSimple orderNumber={data.order.orderNumber} />
        </div>

        {/* Status stepper */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-5">Status Pengiriman</h2>
          <div className="space-y-0">
            {JOB_STATUS_STEPS.map((step, i) => {
              const isDone = i < currentStep;
              const isCurrent = i === currentStep;
              const isPending = i > currentStep;
              return (
                <div key={step.key} className="flex items-start gap-4">
                  {/* connector */}
                  <div className="flex flex-col items-center">
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold border-2 flex-shrink-0 ${
                      isDone ? "bg-green-500 border-green-500 text-white" :
                      isCurrent ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-200" :
                      "bg-white border-slate-200 text-slate-400"
                    }`}>
                      {isDone ? "✓" : step.icon}
                    </div>
                    {i < JOB_STATUS_STEPS.length - 1 && (
                      <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${isDone ? "bg-green-300" : "bg-slate-100"}`} />
                    )}
                  </div>
                  <div className="pb-5 pt-1.5 min-w-0 flex-1">
                    <p className={`text-sm font-semibold ${isCurrent ? "text-blue-700" : isDone ? "text-green-700" : "text-slate-400"}`}>
                      {step.label}
                    </p>
                    {isCurrent && (
                      <span className="inline-block mt-1 text-xs bg-blue-50 text-blue-600 rounded-full px-2 py-0.5 font-medium">
                        Status saat ini
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Operational details (if available) */}
        {data.operational && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">🚚 Detail Operasional</h2>
            <div className="space-y-2">
              <InfoRow label="Driver" value={data.operational.driverName} />
              <InfoRow label="No. HP Driver" value={data.operational.driverPhone} />
              <InfoRow label="Plat Kendaraan" value={data.operational.vehiclePlate} />
              <InfoRow label="Jenis Kendaraan" value={data.operational.vehicleType} />
              <InfoRow label="Waktu Pickup" value={data.operational.pickupTime} />
              <InfoRow label="Carrier" value={data.operational.carrier} />
              <InfoRow label="Jadwal" value={data.operational.schedule} />
              <InfoRow label="ETD" value={data.operational.etd} />
              <InfoRow label="ETA" value={data.operational.eta} />
              <InfoRow label="AWB / BL" value={data.operational.awbBlNumber} />
            </div>
          </div>
        )}

        {/* Progress timeline */}
        {data.progress.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
            <h2 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-4">📅 Riwayat Aktivitas</h2>
            <div className="relative pl-5">
              <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-slate-100" />
              <div className="space-y-4">
                {[...data.progress].reverse().map((p, i) => (
                  <div key={p.id} className="relative text-sm">
                    <div className={`absolute -left-[15px] top-1 w-2.5 h-2.5 rounded-full border-2 border-white ${i === 0 ? "bg-blue-500" : "bg-slate-300"}`} />
                    <p className="font-semibold text-slate-800">{p.status}</p>
                    {p.notes && <p className="text-slate-600 text-xs mt-0.5">{p.notes}</p>}
                    <p className="text-xs text-slate-400 mt-0.5">{formatDate(p.created_at)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Empty progress */}
        {data.progress.length === 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 text-center text-slate-400 text-sm">
            <p className="text-2xl mb-2">📡</p>
            <p>Belum ada update tracking. Mohon tunggu konfirmasi dari tim kami.</p>
          </div>
        )}

      </div>
    </div>
  );
}
