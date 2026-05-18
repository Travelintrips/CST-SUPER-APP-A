import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Tag, ChevronRight } from "lucide-react";
import { schedules, dayLabels, facilities, type DayKey } from "@/data/dummyData";
import { formatCurrency } from "@/utils/bookingCode";

function getFacilityName(facilityId: string): string {
  return facilities.find((f) => f.id === facilityId)?.name ?? facilityId;
}

function getFacilityCategory(facilityId: string): string {
  return facilities.find((f) => f.id === facilityId)?.category ?? "Lainnya";
}

function getTodayKey(): DayKey {
  const map: DayKey[] = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
  return map[new Date().getDay()];
}

export default function Schedule() {
  const [activeDay, setActiveDay] = useState<DayKey>(getTodayKey());
  const [filterCategory, setFilterCategory] = useState("Semua");

  const dayItems = schedules.filter((s) => s.day === activeDay);

  const categories = ["Semua", ...Array.from(new Set(dayItems.map((i) => getFacilityCategory(i.facilityId))))];

  const filtered = dayItems.filter((i) =>
    filterCategory === "Semua" || getFacilityCategory(i.facilityId) === filterCategory
  );

  const availCount = filtered.filter((i) => i.availableSlots > 0).length;
  const fullCount = filtered.filter((i) => i.availableSlots === 0).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-black text-white mb-3">Jadwal Ketersediaan</h1>
          <p className="text-white/80 text-lg max-w-xl mx-auto">
            Cek slot waktu yang masih tersedia sebelum melakukan booking.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden mb-6">
          <div className="flex overflow-x-auto scrollbar-none">
            {dayLabels.map((d) => {
              const isActive = d.key === activeDay;
              const isToday = d.key === getTodayKey();
              const hasAvail = schedules.filter((s) => s.day === d.key).some((s) => s.availableSlots > 0);
              return (
                <button
                  key={d.key}
                  onClick={() => { setActiveDay(d.key); setFilterCategory("Semua"); }}
                  className={`flex-1 min-w-[80px] flex flex-col items-center gap-1 py-4 px-3 text-sm font-semibold transition-all border-b-2 ${
                    isActive
                      ? "border-blue-600 text-blue-600 bg-blue-50"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="hidden sm:block">{d.key}</span>
                  <span className="sm:hidden">{d.short}</span>
                  {isToday ? (
                    <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                      Hari Ini
                    </span>
                  ) : (
                    <span className={`w-2 h-2 rounded-full ${hasAvail ? "bg-emerald-400" : "bg-slate-200"}`} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div className="flex gap-3 text-sm">
            <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              {availCount} tersedia
            </span>
            <span className="flex items-center gap-1.5 text-red-500 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
              {fullCount} penuh
            </span>
          </div>

          <div className="flex gap-2 flex-wrap">
            {categories.map((c) => (
              <button
                key={c}
                onClick={() => setFilterCategory(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                  filterCategory === c
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 py-16 text-center text-slate-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Tidak ada jadwal untuk filter ini.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100">
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Jam</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Aktivitas</th>
                    <th className="text-left px-5 py-3.5 font-semibold text-slate-600">Lokasi</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-slate-600">Slot Tersedia</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-slate-600">Harga / Sesi</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-slate-600">Booking</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const isFull = item.availableSlots === 0;
                    const facilityName = getFacilityName(item.facilityId);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-50 transition-colors ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        } ${isFull ? "opacity-60" : "hover:bg-blue-50/30"}`}
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono font-semibold text-slate-700">
                            {item.startTime} – {item.endTime}
                          </span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-medium text-slate-800">{item.activity}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            {facilityName}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-center">
                          {isFull ? (
                            <span className="bg-red-100 text-red-600 text-xs font-bold px-3 py-1 rounded-full">
                              Penuh
                            </span>
                          ) : (
                            <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-3 py-1 rounded-full">
                              {item.availableSlots} sisa
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-blue-600">{formatCurrency(item.price)}</span>
                        </td>
                        <td className="px-5 py-4 text-center">
                          {isFull ? (
                            <span className="text-slate-400 text-xs font-medium cursor-not-allowed">
                              Tidak Tersedia
                            </span>
                          ) : (
                            <Link
                              to={`/booking?facility=${item.facilityId}`}
                              className="inline-flex items-center gap-1 bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-4 py-1.5 rounded-full text-xs font-semibold hover:shadow-md transition-all"
                            >
                              Booking
                              <ChevronRight className="w-3 h-3" />
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-3">
              {filtered.map((item) => {
                const isFull = item.availableSlots === 0;
                const facilityName = getFacilityName(item.facilityId);
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border shadow-sm p-4 ${
                      isFull ? "opacity-60 border-slate-100" : "border-slate-100 hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-mono font-bold text-slate-700">
                          {item.startTime} – {item.endTime}
                        </p>
                        <p className="font-semibold text-slate-800 mt-0.5">{item.activity}</p>
                      </div>
                      {isFull ? (
                        <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                          Penuh
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                          {item.availableSlots} sisa
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-3">
                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                      {facilityName}
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <Tag className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-bold text-blue-600">{formatCurrency(item.price)}</span>
                        <span>/sesi</span>
                      </div>
                      {isFull ? (
                        <span className="text-slate-400 text-xs font-medium">Tidak Tersedia</span>
                      ) : (
                        <Link
                          to={`/booking?facility=${item.facilityId}`}
                          className="flex items-center gap-1 bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-4 py-2 rounded-full text-xs font-semibold"
                        >
                          Booking <ChevronRight className="w-3 h-3" />
                        </Link>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div className="mt-8 bg-gradient-to-r from-blue-600 to-emerald-500 rounded-2xl p-6 text-white text-center">
          <h3 className="text-xl font-bold mb-1">Butuh Jadwal Khusus atau Event?</h3>
          <p className="text-white/80 text-sm mb-4">
            Hubungi kami untuk kebutuhan booking regular, turnamen, atau acara khusus.
          </p>
          <a
            href="tel:+622155501234"
            className="inline-block bg-white text-blue-600 px-6 py-2.5 rounded-full font-semibold text-sm hover:shadow-md transition-all"
          >
            +62 21 5550 1234
          </a>
        </div>
      </div>
    </div>
  );
}
