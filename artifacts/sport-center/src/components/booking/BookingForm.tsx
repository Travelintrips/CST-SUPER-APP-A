import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle, AlertCircle, Calendar, Clock, User, Phone, Mail, FileText } from "lucide-react";
import { facilities, timeOptions } from "@/data/dummyData";
import { useBookings } from "@/hooks/useBookings";
import { formatCurrency, calculateTotalHours } from "@/utils/bookingCode";
import type { Booking } from "@/types";

interface BookingFormProps {
  preselectedFacilityId?: string;
}

export default function BookingForm({ preselectedFacilityId }: BookingFormProps) {
  const navigate = useNavigate();
  const { addBooking } = useBookings();
  const [success, setSuccess] = useState<Booking | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [form, setForm] = useState({
    facilityId: preselectedFacilityId ?? "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    date: "",
    startTime: "",
    endTime: "",
    notes: "",
  });

  const selectedFacility = facilities.find((f) => f.id === form.facilityId);
  const totalHours = calculateTotalHours(form.startTime, form.endTime);
  const totalPrice = selectedFacility ? totalHours * selectedFacility.pricePerHour : 0;

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDate = tomorrow.toISOString().split("T")[0];

  function update(field: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.facilityId) e.facilityId = "Pilih fasilitas";
    if (!form.customerName.trim()) e.customerName = "Nama wajib diisi";
    if (!form.customerPhone.trim()) e.customerPhone = "Nomor telepon wajib diisi";
    else if (!/^[0-9+\-\s]{8,15}$/.test(form.customerPhone)) e.customerPhone = "Format nomor tidak valid";
    if (!form.customerEmail.trim()) e.customerEmail = "Email wajib diisi";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail)) e.customerEmail = "Format email tidak valid";
    if (!form.date) e.date = "Tanggal wajib dipilih";
    if (!form.startTime) e.startTime = "Jam mulai wajib dipilih";
    if (!form.endTime) e.endTime = "Jam selesai wajib dipilih";
    else if (form.startTime && form.endTime && form.endTime <= form.startTime)
      e.endTime = "Jam selesai harus setelah jam mulai";
    else if (totalHours < 1) e.endTime = "Minimum booking 1 jam";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedFacility) return;
    const booking = addBooking({
      facilityId: form.facilityId,
      facilityName: selectedFacility.name,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      customerEmail: form.customerEmail,
      date: form.date,
      startTime: form.startTime,
      endTime: form.endTime,
      totalHours,
      totalPrice,
      notes: form.notes,
    });
    setSuccess(booking);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (success) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8 text-center max-w-lg mx-auto">
        <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">Booking Berhasil!</h2>
        <p className="text-slate-500 mb-6">Simpan kode booking Anda sebagai bukti reservasi.</p>
        <div className="bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-xl p-5 mb-6">
          <p className="text-sm opacity-80 mb-1">Kode Booking</p>
          <p className="text-3xl font-black tracking-widest">{success.bookingCode}</p>
        </div>
        <div className="text-left bg-slate-50 rounded-xl p-4 mb-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Fasilitas</span>
            <span className="font-semibold text-slate-700">{success.facilityName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Tanggal</span>
            <span className="font-semibold text-slate-700">{new Date(success.date).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Waktu</span>
            <span className="font-semibold text-slate-700">{success.startTime} – {success.endTime} ({success.totalHours} jam)</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Total Bayar</span>
            <span className="font-bold text-blue-600 text-base">{formatCurrency(success.totalPrice)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Status</span>
            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full text-xs font-semibold">Menunggu Konfirmasi</span>
          </div>
        </div>
        <p className="text-xs text-slate-400 mb-6">Konfirmasi akan dikirimkan ke {success.customerEmail} dalam 1x24 jam.</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setSuccess(null); setForm({ facilityId: "", customerName: "", customerPhone: "", customerEmail: "", date: "", startTime: "", endTime: "", notes: "" }); }}
            className="flex-1 border border-blue-600 text-blue-600 py-3 rounded-full font-semibold hover:bg-blue-50 transition-colors"
          >
            Booking Lagi
          </button>
          <button
            onClick={() => navigate("/sport-center/")}
            className="flex-1 bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-3 rounded-full font-semibold hover:shadow-md transition-all"
          >
            Kembali ke Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-md p-6 space-y-6">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          Pilih Fasilitas <span className="text-red-500">*</span>
        </label>
        <select
          value={form.facilityId}
          onChange={(e) => update("facilityId", e.target.value)}
          className={`w-full border rounded-xl px-4 py-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.facilityId ? "border-red-400" : "border-slate-300"}`}
        >
          <option value="">-- Pilih fasilitas --</option>
          {facilities.filter((f) => f.available).map((f) => (
            <option key={f.id} value={f.id}>
              {f.name} — {formatCurrency(f.pricePerHour)}/jam
            </option>
          ))}
        </select>
        {errors.facilityId && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.facilityId}</p>}
      </div>

      {selectedFacility && (
        <div className="bg-blue-50 rounded-xl p-4 flex gap-4 items-center">
          <img src={selectedFacility.image} alt={selectedFacility.name} className="w-16 h-16 rounded-lg object-cover" />
          <div>
            <p className="font-bold text-slate-800">{selectedFacility.name}</p>
            <p className="text-blue-600 font-semibold">{formatCurrency(selectedFacility.pricePerHour)}/jam</p>
            <p className="text-xs text-slate-500">Maks. {selectedFacility.capacity} orang</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="sm:col-span-1">
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <Calendar className="w-4 h-4 inline mr-1" />
            Tanggal <span className="text-red-500">*</span>
          </label>
          <input
            type="date"
            min={minDate}
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.date ? "border-red-400" : "border-slate-300"}`}
          />
          {errors.date && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.date}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <Clock className="w-4 h-4 inline mr-1" />
            Jam Mulai <span className="text-red-500">*</span>
          </label>
          <select
            value={form.startTime}
            onChange={(e) => update("startTime", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.startTime ? "border-red-400" : "border-slate-300"}`}
          >
            <option value="">-- Mulai --</option>
            {timeOptions.slice(0, -1).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.startTime && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.startTime}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <Clock className="w-4 h-4 inline mr-1" />
            Jam Selesai <span className="text-red-500">*</span>
          </label>
          <select
            value={form.endTime}
            onChange={(e) => update("endTime", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.endTime ? "border-red-400" : "border-slate-300"}`}
          >
            <option value="">-- Selesai --</option>
            {timeOptions.slice(1).map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          {errors.endTime && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.endTime}</p>}
        </div>
      </div>

      {totalHours > 0 && selectedFacility && (
        <div className="bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-xl px-5 py-3 flex justify-between items-center">
          <span className="text-sm opacity-90">{totalHours} jam × {formatCurrency(selectedFacility.pricePerHour)}</span>
          <span className="text-xl font-black">{formatCurrency(totalPrice)}</span>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <User className="w-4 h-4 inline mr-1" />
            Nama Lengkap <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            placeholder="Masukkan nama lengkap"
            value={form.customerName}
            onChange={(e) => update("customerName", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.customerName ? "border-red-400" : "border-slate-300"}`}
          />
          {errors.customerName && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerName}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">
            <Phone className="w-4 h-4 inline mr-1" />
            Nomor Telepon <span className="text-red-500">*</span>
          </label>
          <input
            type="tel"
            placeholder="Contoh: 08123456789"
            value={form.customerPhone}
            onChange={(e) => update("customerPhone", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.customerPhone ? "border-red-400" : "border-slate-300"}`}
          />
          {errors.customerPhone && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerPhone}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          <Mail className="w-4 h-4 inline mr-1" />
          Email <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          placeholder="contoh@email.com"
          value={form.customerEmail}
          onChange={(e) => update("customerEmail", e.target.value)}
          className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${errors.customerEmail ? "border-red-400" : "border-slate-300"}`}
        />
        {errors.customerEmail && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerEmail}</p>}
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-2">
          <FileText className="w-4 h-4 inline mr-1" />
          Catatan (Opsional)
        </label>
        <textarea
          placeholder="Contoh: Butuh net tambahan, atau informasi khusus lainnya..."
          value={form.notes}
          onChange={(e) => update("notes", e.target.value)}
          rows={3}
          className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
      </div>

      <button
        type="submit"
        className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-4 rounded-full font-bold text-lg hover:shadow-lg hover:scale-[1.01] transition-all duration-200"
      >
        Konfirmasi Booking
      </button>
      <p className="text-center text-xs text-slate-400">
        Dengan menekan tombol di atas, Anda menyetujui syarat dan ketentuan Sport Center SHIA.
      </p>
    </form>
  );
}
