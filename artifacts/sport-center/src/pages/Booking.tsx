import { useSearchParams } from "react-router-dom";
import BookingForm from "@/components/booking/BookingForm";
import { CheckCircle } from "lucide-react";

const steps = [
  { num: 1, label: "Pilih Fasilitas" },
  { num: 2, label: "Isi Data" },
  { num: 3, label: "Konfirmasi" },
];

export default function Booking() {
  const [searchParams] = useSearchParams();
  const facilityId = searchParams.get("facility") ?? undefined;
  const preselectedDate = searchParams.get("date") ?? undefined;
  const preselectedStart = searchParams.get("start") ?? undefined;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Booking Lapangan</h1>
          <p className="text-white/80 text-lg">Reservasi mudah dan cepat dalam beberapa langkah saja.</p>
          <div className="flex items-center justify-center gap-3 mt-8">
            {steps.map((step, idx) => (
              <div key={step.num} className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-white/20 border-2 border-white/50 text-white font-bold text-sm flex items-center justify-center">
                    {step.num}
                  </div>
                  <span className="text-white/80 text-sm hidden sm:block">{step.label}</span>
                </div>
                {idx < steps.length - 1 && (
                  <div className="w-8 h-px bg-white/30" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
          <CheckCircle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-semibold">Informasi Booking</p>
            <ul className="mt-1 space-y-0.5 list-disc list-inside text-blue-600">
              <li>Booking minimum 1 hari sebelumnya</li>
              <li>Pembatalan gratis hingga 24 jam sebelum jadwal</li>
              <li>Kode booking dikirim ke email Anda</li>
            </ul>
          </div>
        </div>
        <BookingForm
          preselectedFacilityId={facilityId}
          preselectedDate={preselectedDate}
          preselectedStartTime={preselectedStart}
        />
      </div>
    </div>
  );
}
