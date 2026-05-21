import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar, Clock, Search, Loader2, ChevronDown } from "lucide-react";
import { useServices } from "@/hooks/useServices";
import { timeOptions } from "@/data/dummyData";

export default function MiniBookingForm() {
  const navigate = useNavigate();
  const { services, loading } = useServices();
  const [form, setForm] = useState({ facilityId: "", date: "", startTime: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  function update(field: keyof typeof form, value: string) {
    setForm((p) => ({ ...p, [field]: value }));
    setErrors((p) => ({ ...p, [field]: "" }));
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!form.facilityId) e2.facilityId = "Pilih fasilitas";
    if (!form.date) e2.date = "Pilih tanggal";
    if (!form.startTime) e2.startTime = "Pilih jam";
    setErrors(e2);
    if (Object.keys(e2).length > 0) return;

    const params = new URLSearchParams({
      facility: form.facilityId,
      date: form.date,
      start: form.startTime,
    });
    navigate(`/booking?${params.toString()}`);
  }

  const activeServices = services.filter((s) => s.available);

  return (
    <form
      onSubmit={handleSearch}
      className="w-full max-w-3xl mx-auto bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-4 mt-8"
    >
      <div className="flex flex-col sm:flex-row gap-3 items-end">
        {/* Fasilitas */}
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
            Fasilitas
          </label>
          <div className="relative">
            {loading ? (
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-4 py-3 text-slate-400 text-sm bg-slate-50">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                Memuat...
              </div>
            ) : (
              <select
                value={form.facilityId}
                onChange={(e) => update("facilityId", e.target.value)}
                className={`w-full appearance-none border rounded-xl px-4 py-3 pr-9 text-slate-700 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.facilityId ? "border-red-400 bg-red-50" : "border-slate-200"
                }`}
              >
                <option value="">Semua Fasilitas</option>
                {activeServices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {errors.facilityId && (
            <p className="text-red-500 text-xs mt-1 px-1">{errors.facilityId}</p>
          )}
        </div>

        {/* Tanggal */}
        <div className="flex-1 min-w-0">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
            <Calendar className="w-3 h-3 inline mr-1" />
            Tanggal
          </label>
          <input
            type="date"
            min={minDate}
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.date ? "border-red-400 bg-red-50" : "border-slate-200"
            }`}
          />
          {errors.date && (
            <p className="text-red-500 text-xs mt-1 px-1">{errors.date}</p>
          )}
        </div>

        {/* Jam Mulai */}
        <div className="w-36 shrink-0">
          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 px-1">
            <Clock className="w-3 h-3 inline mr-1" />
            Jam Mulai
          </label>
          <div className="relative">
            <select
              value={form.startTime}
              onChange={(e) => update("startTime", e.target.value)}
              className={`w-full appearance-none border rounded-xl px-4 py-3 pr-9 text-slate-700 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.startTime ? "border-red-400 bg-red-50" : "border-slate-200"
              }`}
            >
              <option value="">-- Jam --</option>
              {timeOptions.slice(0, -1).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {errors.startTime && (
            <p className="text-red-500 text-xs mt-1 px-1">{errors.startTime}</p>
          )}
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="shrink-0 bg-gradient-to-r from-blue-600 to-emerald-500 text-white px-6 py-3 rounded-xl font-bold text-sm hover:shadow-lg hover:scale-[1.02] transition-all duration-200 flex items-center gap-2 whitespace-nowrap"
        >
          <Search className="w-4 h-4" />
          Cek & Booking
        </button>
      </div>
    </form>
  );
}
