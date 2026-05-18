import { useState } from "react";
import { Link } from "react-router-dom";
import { Calendar, MapPin, Users, Tag, ChevronRight } from "lucide-react";
import { daySchedules, dayLabels, type DayKey } from "@/data/dummyData";
import { formatCurrency } from "@/utils/bookingCode";

function getTodayKey(): DayKey {
  const map: DayKey[] = ["minggu", "senin", "selasa", "rabu", "kamis", "jumat", "sabtu"];
  return map[new Date().getDay()];
}

export default function Schedule() {
  const [activeDay, setActiveDay] = useState<DayKey>(getTodayKey());
  const [filterCategory, setFilterCategory] = useState("semua");

  const items = daySchedules[activeDay] ?? [];

  const categories = ["semua", ...Array.from(new Set(items.map((i) => {
    const name = i.location;
    if (name.includes("Futsal")) return "Futsal";
    if (name.includes("Badminton")) return "Badminton";
    if (name.includes("Basket")) return "Basket";
    if (name.includes("Tenis")) return "Tenis";
    if (name.includes("Renang")) return "Renang";
    if (name.includes("Gym") || name.includes("Fitness")) return "Gym";
    return "Lainnya";
  })))];

  const filtered = items.filter((i) => {
    if (filterCategory === "semua") return true;
    const loc = i.location;
    if (filterCategory === "Futsal") return loc.includes("Futsal");
    if (filterCategory === "Badminton") return loc.includes("Badminton");
    if (filterCategory === "Basket") return loc.includes("Basket");
    if (filterCategory === "Tenis") return loc.includes("Tenis");
    if (filterCategory === "Renang") return loc.includes("Renang");
    if (filterCategory === "Gym") return loc.includes("Gym") || loc.includes("Fitness");
    return true;
  });

  const fullCount = filtered.filter((i) => i.bookedSlots >= i.totalSlots).length;
  const availCount = filtered.filter((i) => i.bookedSlots < i.totalSlots).length;

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
              const dayItems = daySchedules[d.key] ?? [];
              const hasAvail = dayItems.some((i) => i.bookedSlots < i.totalSlots);
              return (
                <button
                  key={d.key}
                  onClick={() => { setActiveDay(d.key); setFilterCategory("semua"); }}
                  className={`flex-1 min-w-[80px] flex flex-col items-center gap-1 py-4 px-3 text-sm font-semibold transition-all border-b-2 ${
                    isActive
                      ? "border-blue-600 text-blue-600 bg-blue-50"
                      : "border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="hidden sm:block">{d.label}</span>
                  <span className="sm:hidden">{d.short}</span>
                  {isToday && (
                    <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded-full font-bold">
                      Hari Ini
                    </span>
                  )}
                  {!isToday && (
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
              {availCount} slot tersedia
            </span>
            <span className="flex items-center gap-1.5 text-red-500 font-semibold">
              <span className="w-2.5 h-2.5 rounded-full bg-red-400 inline-block" />
              {fullCount} slot penuh
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
                {c.charAt(0).toUpperCase() + c.slice(1)}
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
                    <th className="text-center px-5 py-3.5 font-semibold text-slate-600">Slot</th>
                    <th className="text-right px-5 py-3.5 font-semibold text-slate-600">Harga / Jam</th>
                    <th className="text-center px-5 py-3.5 font-semibold text-slate-600">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => {
                    const isFull = item.bookedSlots >= item.totalSlots;
                    const remaining = item.totalSlots - item.bookedSlots;
                    const pct = Math.round((item.bookedSlots / item.totalSlots) * 100);
                    return (
                      <tr
                        key={item.id}
                        className={`border-b border-slate-50 transition-colors ${
                          idx % 2 === 0 ? "bg-white" : "bg-slate-50/40"
                        } ${isFull ? "opacity-60" : "hover:bg-blue-50/30"}`}
                      >
                        <td className="px-5 py-4">
                          <span className="font-mono font-semibold text-slate-700">{item.time}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="font-medium text-slate-800">{item.activity}</span>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-1.5 text-slate-500">
                            <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                            {item.location}
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex items-center gap-1.5">
                              {isFull ? (
                                <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-0.5 rounded-full">
                                  Penuh
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-0.5 rounded-full">
                                  {remaining} sisa
                                </span>
                              )}
                            </div>
                            <div className="w-20 bg-slate-200 rounded-full h-1.5">
                              <div
                                className={`h-1.5 rounded-full ${isFull ? "bg-red-400" : pct >= 75 ? "bg-orange-400" : "bg-emerald-400"}`}
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-slate-400">
                              {item.bookedSlots}/{item.totalSlots}
                            </span>
                          </div>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="font-bold text-blue-600">{formatCurrency(item.pricePerHour)}</span>
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
                const isFull = item.bookedSlots >= item.totalSlots;
                const remaining = item.totalSlots - item.bookedSlots;
                const pct = Math.round((item.bookedSlots / item.totalSlots) * 100);
                return (
                  <div
                    key={item.id}
                    className={`bg-white rounded-xl border shadow-sm p-4 ${
                      isFull ? "opacity-60 border-slate-100" : "border-slate-100 hover:border-blue-200"
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-mono font-bold text-slate-700 text-base">{item.time}</p>
                        <p className="font-semibold text-slate-800 mt-0.5">{item.activity}</p>
                      </div>
                      {isFull ? (
                        <span className="bg-red-100 text-red-600 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                          Penuh
                        </span>
                      ) : (
                        <span className="bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full shrink-0">
                          {remaining} sisa
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-sm text-slate-500 mb-2">
                      <MapPin className="w-3.5 h-3.5 text-blue-400" />
                      {item.location}
                    </div>

                    <div className="flex items-center gap-3 mb-3">
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full ${isFull ? "bg-red-400" : pct >= 75 ? "bg-orange-400" : "bg-emerald-400"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-slate-400 shrink-0">{item.bookedSlots}/{item.totalSlots}</span>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1 text-sm text-slate-500">
                        <Tag className="w-3.5 h-3.5 text-blue-400" />
                        <span className="font-bold text-blue-600">{formatCurrency(item.pricePerHour)}</span>
                        <span>/jam</span>
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
