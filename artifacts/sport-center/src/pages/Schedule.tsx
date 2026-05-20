import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Info,
  X,
  MapPin,
  Clock,
  Tag,
} from "lucide-react";
import { schedules, facilities } from "@/data/dummyData";
import { formatCurrency } from "@/utils/bookingCode";

type DayKey = "Senin" | "Selasa" | "Rabu" | "Kamis" | "Jumat" | "Sabtu" | "Minggu";

const DAY_KEYS: DayKey[] = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];
const DAY_SHORT: Record<DayKey, string> = {
  Senin: "Sen", Selasa: "Sel", Rabu: "Rab", Kamis: "Kam",
  Jumat: "Jum", Sabtu: "Sab", Minggu: "Min",
};
const HOURS = Array.from({ length: 17 }, (_, i) => `${String(i + 6).padStart(2, "0")}:00`);

const MONTHS_ID = [
  "Januari","Februari","Maret","April","Mei","Juni",
  "Juli","Agustus","September","Oktober","November","Desember",
];

function getMonday(d: Date): Date {
  const copy = new Date(d);
  const day = copy.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  copy.setDate(copy.getDate() + diff);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function formatDay(d: Date): string {
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function getSlotStatus(available: number): "tersedia" | "hampir" | "penuh" {
  if (available === 0) return "penuh";
  if (available <= 3) return "hampir";
  return "tersedia";
}

const STATUS_COLOR = {
  tersedia: "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200 cursor-pointer",
  hampir: "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-200 cursor-pointer",
  penuh: "bg-red-100 text-red-500 border-red-200 cursor-not-allowed opacity-70",
  buka: "bg-slate-100 text-slate-400 border-slate-200 cursor-default",
};
const STATUS_DOT = {
  tersedia: "bg-emerald-500",
  hampir: "bg-amber-400",
  penuh: "bg-red-400",
  buka: "bg-slate-300",
};
const STATUS_LABEL = {
  tersedia: "Tersedia",
  hampir: "Hampir Penuh",
  penuh: "Penuh",
  buka: "Buka",
};

type SlotPopupData = {
  dayKey: DayKey;
  date: Date;
  hour: string;
  items: typeof schedules;
};

const CATEGORIES = ["Semua", "Gym", "Futsal", "Badminton", "Basket", "Yoga", "Aerobik"];

function getCategoryColor(cat: string) {
  const map: Record<string, string> = {
    Gym: "bg-violet-500", Futsal: "bg-blue-500", Badminton: "bg-emerald-500",
    Basket: "bg-orange-500", Yoga: "bg-pink-500", Aerobik: "bg-red-500",
  };
  return map[cat] ?? "bg-slate-400";
}

export default function Schedule() {
  const navigate = useNavigate();
  const today = useMemo(() => { const d = new Date(); d.setHours(0,0,0,0); return d; }, []);
  const [weekStart, setWeekStart] = useState<Date>(getMonday(today));
  const [filterCategory, setFilterCategory] = useState("Semua");
  const [filterActivity, setFilterActivity] = useState("Semua Aktivitas");
  const [popup, setPopup] = useState<SlotPopupData | null>(null);

  const weekDays = DAY_KEYS.map((key, i) => ({
    key,
    date: addDays(weekStart, i),
  }));

  const monthLabel = useMemo(() => {
    const months = new Set(weekDays.map((d) => d.date.getMonth()));
    const years = new Set(weekDays.map((d) => d.date.getFullYear()));
    const parts = Array.from(months).map((m) => MONTHS_ID[m]);
    return `${parts.join("/")} ${Array.from(years).join("/")}`;
  }, [weekStart]);

  const filteredSchedules = useMemo(() => {
    return schedules.filter((s) => {
      if (filterCategory === "Semua") return true;
      const fac = facilities.find((f) => f.id === s.facilityId);
      return fac?.category === filterCategory;
    });
  }, [filterCategory]);

  function getCell(dayKey: DayKey, hour: string) {
    const items = filteredSchedules.filter(
      (s) => s.day === dayKey && s.startTime === hour
    );
    if (items.length === 0) return null;
    const totalSlots = items.reduce((sum, s) => sum + s.availableSlots, 0);
    return { items, totalSlots };
  }

  function prevWeek() { setWeekStart(addDays(weekStart, -7)); }
  function nextWeek() { setWeekStart(addDays(weekStart, 7)); }
  function goToday() { setWeekStart(getMonday(today)); }

  const weekSummary = useMemo(() => {
    const todayKey = DAY_KEYS[today.getDay() === 0 ? 6 : today.getDay() - 1];
    const todayItems = schedules.filter((s) => s.day === todayKey);
    const tersedia = todayItems.filter((s) => s.availableSlots >= 4).length;
    const hampir = todayItems.filter((s) => s.availableSlots > 0 && s.availableSlots <= 3).length;
    const penuh = todayItems.filter((s) => s.availableSlots === 0).length;
    return { tersedia, hampir, penuh };
  }, [today]);

  const allActivities = useMemo(() => {
    const acts = Array.from(new Set(schedules.map((s) => s.activity)));
    return ["Semua Aktivitas", ...acts];
  }, []);

  function openPopup(dayKey: DayKey, date: Date, hour: string, items: typeof schedules) {
    const filtered = filterActivity === "Semua Aktivitas"
      ? items
      : items.filter((s) => s.activity === filterActivity);
    setPopup({ dayKey, date, hour, items: filtered.length > 0 ? filtered : items });
  }

  function bookSlot(item: (typeof schedules)[0], date: Date) {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    navigate(`/booking?facility=${item.facilityId}&date=${dateStr}&startTime=${item.startTime}`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="bg-gradient-to-r from-blue-600 to-emerald-500 py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-white/90 text-base font-medium">
            Cek slot waktu yang masih tersedia sebelum melakukan booking.
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-4 border-b border-slate-100">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-slate-800">Kalender Ketersediaan</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Pilih tanggal untuk melihat slot yang tersedia</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={goToday}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-600 hover:bg-blue-50 transition-colors"
                    >
                      Hari Ini
                    </button>
                    <button
                      onClick={prevWeek}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                      onClick={nextWeek}
                      className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                    <span className="text-sm font-semibold text-slate-700 min-w-[130px] text-right">{monthLabel}</span>
                  </div>
                </div>

                <div className="flex gap-1.5 mt-3 flex-wrap">
                  {CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                        filterCategory === cat
                          ? "bg-blue-600 text-white border-blue-600"
                          : "bg-white text-slate-600 border-slate-200 hover:border-blue-400"
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse" style={{ minWidth: 640 }}>
                  <thead>
                    <tr>
                      <th className="w-14 bg-slate-50 border-b border-r border-slate-100 sticky left-0 z-10" />
                      {weekDays.map(({ key, date }) => {
                        const isToday = isSameDay(date, today);
                        return (
                          <th
                            key={key}
                            className={`border-b border-r border-slate-100 px-2 py-3 text-center font-semibold ${
                              isToday ? "bg-blue-50" : "bg-slate-50"
                            }`}
                          >
                            <div className={`text-xs font-bold ${isToday ? "text-blue-600" : "text-slate-600"}`}>
                              {key}
                            </div>
                            <div
                              className={`text-[11px] mt-0.5 font-medium rounded-full px-1 inline-block ${
                                isToday
                                  ? "bg-blue-600 text-white px-2"
                                  : "text-slate-400"
                              }`}
                            >
                              {formatDay(date)}
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {HOURS.map((hour) => (
                      <tr key={hour} className="group">
                        <td className="bg-slate-50 border-b border-r border-slate-100 px-2 py-2 text-center sticky left-0 z-10">
                          <span className="text-[11px] font-mono font-semibold text-slate-500">{hour}</span>
                        </td>
                        {weekDays.map(({ key: dayKey, date }) => {
                          const cell = getCell(dayKey, hour);
                          const isToday = isSameDay(date, today);

                          if (!cell) {
                            return (
                              <td
                                key={dayKey}
                                className={`border-b border-r border-slate-100 p-1 h-12 ${
                                  isToday ? "bg-blue-50/30" : ""
                                }`}
                              >
                                <div className={`w-full h-full rounded-lg border text-[11px] font-semibold px-1 py-1 flex flex-col items-center justify-center ${STATUS_COLOR.buka}`}>
                                  <span className="flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT.buka}`} />
                                    {STATUS_LABEL.buka}
                                  </span>
                                </div>
                              </td>
                            );
                          }

                          const status = getSlotStatus(cell.totalSlots);
                          const canBook = status !== "penuh";

                          return (
                            <td
                              key={dayKey}
                              className={`border-b border-r border-slate-100 p-1 h-12 ${
                                isToday ? "bg-blue-50/30" : ""
                              }`}
                            >
                              <button
                                disabled={!canBook}
                                onClick={() => canBook && openPopup(dayKey, date, hour, cell.items)}
                                className={`w-full h-full rounded-lg border text-[11px] font-semibold px-1 py-1 flex flex-col items-center justify-center transition-all ${STATUS_COLOR[status]}`}
                              >
                                <span className="flex items-center gap-1">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[status]}`} />
                                  {STATUS_LABEL[status]}
                                </span>
                                <span className="text-[10px] font-bold opacity-80">{cell.totalSlots}</span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center gap-4 px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex-wrap">
                {([["buka","Buka (Tidak ada kelas)"],["tersedia","Tersedia (4+)"],["hampir","Hampir Penuh (2–3)"],["penuh","Penuh (0–1)"]] as const).map(([status, label]) => (
                  <span key={status} className="flex items-center gap-1.5 text-xs text-slate-500">
                    <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 flex items-start gap-2 text-sm text-blue-700">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span><strong>Jam Operasional:</strong> Setiap hari 06:00 – 22:00</span>
            </div>
          </div>

          <div className="lg:w-64 shrink-0 space-y-4">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3">Filter dan Keterangan</h3>

              <div className="mb-3">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
                  Pilih Aktivitas
                </label>
                <select
                  value={filterActivity}
                  onChange={(e) => setFilterActivity(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  {allActivities.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>

              <div className="mb-4">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1 block">
                  Kategori
                </label>
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="bg-blue-50 rounded-lg px-3 py-2.5 flex items-start gap-2 text-xs text-blue-700">
                <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Klik pada slot waktu untuk melihat detail dan melakukan booking.
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-4">
              <h3 className="font-bold text-slate-800 text-sm mb-3">
                Ringkasan Ketersediaan
                <span className="text-xs font-normal text-slate-400 ml-1">(Hari Ini)</span>
              </h3>
              <div className="space-y-2.5 mb-4">
                {([
                  ["tersedia", "Tersedia", weekSummary.tersedia, "text-emerald-600"],
                  ["hampir", "Hampir Penuh", weekSummary.hampir, "text-amber-600"],
                  ["penuh", "Penuh", weekSummary.penuh, "text-red-500"],
                ] as const).map(([status, label, count, textColor]) => (
                  <div key={status} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_DOT[status]}`} />
                      <span className="text-slate-600">{label}</span>
                    </span>
                    <span className={`font-bold ${textColor}`}>{count} slot</span>
                  </div>
                ))}
              </div>
              <button
                onClick={goToday}
                className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-2.5 rounded-xl text-sm font-bold hover:shadow-md transition-all"
              >
                Lihat Slot Hari Ini
              </button>
            </div>

            <div className="bg-gradient-to-r from-blue-600 to-emerald-500 rounded-2xl p-4 text-white">
              <h3 className="font-bold text-sm mb-1">Butuh Jadwal Khusus?</h3>
              <p className="text-white/80 text-xs mb-3">Untuk event, turnamen, atau booking reguler, hubungi kami.</p>
              <a
                href="tel:+622155501234"
                className="block text-center bg-white text-blue-600 py-2 rounded-xl text-xs font-bold hover:shadow-md transition-all"
              >
                +62 21 5550 1234
              </a>
            </div>
          </div>
        </div>
      </div>

      {popup && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setPopup(null)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-gradient-to-r from-blue-600 to-emerald-500 px-5 py-4 flex items-center justify-between">
              <div>
                <p className="text-white font-bold text-base">
                  {popup.dayKey}, {formatDay(popup.date)}
                </p>
                <p className="text-white/80 text-sm flex items-center gap-1.5 mt-0.5">
                  <Clock className="w-3.5 h-3.5" />
                  Mulai pukul {popup.hour}
                </p>
              </div>
              <button
                onClick={() => setPopup(null)}
                className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 rounded-full text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {popup.items.length === 0 ? (
                <p className="text-center text-slate-400 py-6 text-sm">Tidak ada slot untuk filter ini.</p>
              ) : (
                popup.items.map((item) => {
                  const isFull = item.availableSlots === 0;
                  const status = getSlotStatus(item.availableSlots);
                  const fac = facilities.find((f) => f.id === item.facilityId);
                  return (
                    <div
                      key={item.id}
                      className={`rounded-xl border p-3.5 transition-all ${
                        isFull ? "border-red-100 bg-red-50/50 opacity-70" : "border-slate-200 hover:border-blue-200 hover:bg-blue-50/30"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div>
                          <p className="font-semibold text-slate-800 text-sm">{item.activity}</p>
                          <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-3 h-3 text-blue-400" />
                            {fac?.name ?? item.facilityId}
                          </p>
                        </div>
                        <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full border ${
                          isFull
                            ? "bg-red-100 text-red-600 border-red-200"
                            : status === "hampir"
                            ? "bg-amber-100 text-amber-700 border-amber-200"
                            : "bg-emerald-100 text-emerald-700 border-emerald-200"
                        }`}>
                          {isFull ? "Penuh" : `${item.availableSlots} sisa`}
                        </span>
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-500 mb-3">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-blue-400" />
                          {item.startTime} – {item.endTime}
                        </span>
                        <span className="flex items-center gap-1 font-bold text-blue-600">
                          <Tag className="w-3 h-3" />
                          {formatCurrency(item.price)}/sesi
                        </span>
                      </div>

                      {fac?.category && (
                        <div className="flex items-center gap-1.5 mb-3">
                          <span className={`w-2 h-2 rounded-full ${getCategoryColor(fac.category)}`} />
                          <span className="text-[11px] text-slate-500">{fac.category}</span>
                        </div>
                      )}

                      {!isFull && (
                        <button
                          onClick={() => bookSlot(item, popup.date)}
                          className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-2 rounded-xl text-xs font-bold hover:shadow-md transition-all flex items-center justify-center gap-1.5"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          Book Sekarang
                        </button>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
