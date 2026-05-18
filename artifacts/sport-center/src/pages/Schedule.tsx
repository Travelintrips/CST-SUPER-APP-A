import ScheduleCard from "@/components/ui/ScheduleCard";
import { schedules } from "@/data/dummyData";
import { Calendar, Info } from "lucide-react";

export default function Schedule() {
  return (
    <div className="min-h-screen">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Jadwal Ketersediaan</h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto">
            Cek ketersediaan slot waktu sebelum melakukan booking.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl p-4 mb-8">
          <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700">
            <p className="font-semibold mb-1">Cara Membaca Jadwal</p>
            <p>Tanda <strong>✓ (hijau)</strong> berarti slot tersedia. Tanda <strong>✗ (merah)</strong> berarti sudah terisi atau tutup. Jadwal diperbarui setiap hari.</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-6">
          <Calendar className="w-6 h-6 text-blue-600" />
          <h2 className="text-xl font-bold text-slate-800">Jadwal Minggu Ini</h2>
        </div>

        {schedules.length > 0 ? (
          <div className="space-y-6">
            {schedules.map((s) => (
              <ScheduleCard key={s.facilityId} schedule={s} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16 text-slate-400">
            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>Jadwal belum tersedia</p>
          </div>
        )}

        <div className="mt-10 bg-gradient-to-r from-blue-600 to-emerald-500 rounded-xl p-6 text-white text-center">
          <h3 className="text-xl font-bold mb-2">Butuh Jadwal Khusus?</h3>
          <p className="text-white/80 text-sm mb-4">
            Hubungi kami untuk kebutuhan booking regular atau event khusus.
          </p>
          <a
            href="tel:+622155501234"
            className="inline-block bg-white text-blue-600 px-6 py-2 rounded-full font-semibold text-sm hover:shadow-md transition-all"
          >
            +62 21 5550 1234
          </a>
        </div>
      </div>
    </div>
  );
}
