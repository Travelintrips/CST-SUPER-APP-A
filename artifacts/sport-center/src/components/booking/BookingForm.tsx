import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle, AlertCircle, Calendar, Clock, User,
  Phone, Mail, FileText, Printer, RotateCcw, Home,
  CreditCard, Building2, Smartphone, Loader2,
  Upload, ImageIcon, X, CheckCircle2,
} from "lucide-react";
import { timeOptions } from "@/data/dummyData";
import { useBookings } from "@/hooks/useBookings";
import { useServices } from "@/hooks/useServices";
import { formatCurrency, formatDate, calculateTotalHours } from "@/utils/bookingCode";
import type { Booking } from "@/types";

interface BookingFormProps {
  preselectedFacilityId?: string;
  preselectedDate?: string;
  preselectedStartTime?: string;
}

// ── Upload Bukti Transfer ──────────────────────────────────────────────────
function PaymentProofUpload({ booking }: { booking: Booking }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(f: File) {
    if (!f.type.startsWith("image/")) {
      setError("Hanya file gambar yang diizinkan (JPG, PNG, HEIC, dll.)");
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      setError("Ukuran file maksimal 5 MB");
      return;
    }
    setError(null);
    setFile(f);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(f);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("proof", file);
      const res = await fetch(`/api/sport-center/payment-proof/${booking.bookingCode}`, {
        method: "POST",
        body: formData,
      });
      const data = await res.json() as { success?: boolean; proofUrl?: string; message?: string };
      if (!res.ok) throw new Error(data.message ?? "Gagal upload");
      setUploadedUrl(data.proofUrl ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengupload. Coba lagi.");
    } finally {
      setUploading(false);
    }
  }

  // Sudah berhasil upload
  if (uploadedUrl) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-bold text-emerald-800 text-sm">Bukti pembayaran berhasil dikirim!</p>
            <p className="text-emerald-700 text-xs mt-1">
              Admin akan memverifikasi dalam 1×24 jam kerja. Konfirmasi akan dikirim ke{" "}
              <strong>{booking.customerEmail}</strong>.
            </p>
          </div>
        </div>
        {preview && (
          <img
            src={preview}
            alt="Bukti transfer"
            className="mt-3 w-full max-h-48 object-contain rounded-lg border border-emerald-200"
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all duration-200 ${
          dragOver
            ? "border-blue-500 bg-blue-50"
            : file
            ? "border-emerald-400 bg-emerald-50"
            : "border-amber-300 bg-amber-50/60 hover:border-amber-400 hover:bg-amber-50"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
        />
        {file && preview ? (
          <div className="space-y-2">
            <img
              src={preview}
              alt="Preview"
              className="mx-auto max-h-40 max-w-full rounded-lg object-contain border border-emerald-200"
            />
            <p className="text-xs text-emerald-700 font-medium">{file.name}</p>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setFile(null); setPreview(null); }}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-500 transition-colors"
            >
              <X className="w-3 h-3" /> Ganti foto
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto">
              <ImageIcon className="w-6 h-6 text-amber-600" />
            </div>
            <p className="text-sm font-semibold text-amber-800">
              Klik atau seret foto bukti transfer di sini
            </p>
            <p className="text-xs text-amber-600">JPG, PNG, HEIC · Maks. 5 MB</p>
          </div>
        )}
      </div>

      {error && (
        <p className="text-red-600 text-xs flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" /> {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-3 rounded-xl font-bold text-sm hover:shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {uploading ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Mengupload...</>
        ) : (
          <><Upload className="w-4 h-4" /> Upload Bukti Transfer</>
        )}
      </button>
    </div>
  );
}

// ── Halaman Konfirmasi ─────────────────────────────────────────────────────
function ConfirmationPage({ booking, onReset }: { booking: Booking; onReset: () => void }) {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-md p-8 text-center">
        <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-10 h-10 text-emerald-600" />
        </div>
        <h2 className="text-2xl font-black text-slate-800 mb-2">Booking Berhasil!</h2>
        <p className="text-slate-500">
          Simpan kode booking berikut sebagai bukti reservasi Anda.
        </p>
      </div>

      <div
        id="booking-summary"
        className="bg-white rounded-2xl shadow-md overflow-hidden print:shadow-none"
      >
        {/* Kode booking */}
        <div className="bg-gradient-to-r from-blue-600 to-emerald-500 px-6 py-5 text-center text-white">
          <p className="text-sm font-medium opacity-80 mb-1">Kode Booking</p>
          <p className="text-4xl font-black tracking-widest">{booking.bookingCode}</p>
          <p className="text-xs opacity-70 mt-2">
            Diterbitkan: {new Date(booking.createdAt).toLocaleString("id-ID")}
          </p>
        </div>

        {/* Ringkasan */}
        <div className="p-6 space-y-4">
          <h3 className="font-bold text-slate-700 text-sm uppercase tracking-wider">Ringkasan Booking</h3>
          <div className="divide-y divide-slate-100">
            {[
              { label: "Nama", value: booking.customerName },
              { label: "Telepon / WA", value: booking.customerPhone },
              { label: "Email", value: booking.customerEmail },
              { label: "Fasilitas", value: booking.facilityName },
              { label: "Tanggal", value: formatDate(booking.date) },
              { label: "Waktu", value: `${booking.startTime} – ${booking.endTime} (${booking.totalHours} jam)` },
              ...(booking.notes ? [{ label: "Catatan", value: booking.notes }] : []),
            ].map((row) => (
              <div key={row.label} className="flex justify-between py-2.5 text-sm">
                <span className="text-slate-500">{row.label}</span>
                <span className="font-semibold text-slate-700 text-right max-w-[60%]">{row.value}</span>
              </div>
            ))}
            <div className="flex justify-between py-3 text-sm">
              <span className="text-slate-500">Total Pembayaran</span>
              <span className="font-black text-xl text-blue-600">{formatCurrency(booking.totalPrice)}</span>
            </div>
            <div className="flex justify-between py-2.5 text-sm">
              <span className="text-slate-500">Status</span>
              <span className="bg-yellow-100 text-yellow-700 px-3 py-0.5 rounded-full text-xs font-bold">
                Menunggu Konfirmasi
              </span>
            </div>
          </div>
        </div>

        {/* Instruksi pembayaran + Upload */}
        <div className="bg-amber-50 border-t border-amber-100 px-6 py-5 space-y-5">
          <h3 className="font-bold text-amber-800 text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4" />
            Instruksi Pembayaran
          </h3>

          {/* Langkah 1: Transfer */}
          <div className="space-y-2 text-sm text-amber-800">
            <div className="flex gap-3">
              <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-amber-900">1</div>
              <p>Lakukan pembayaran sebesar <strong>{formatCurrency(booking.totalPrice)}</strong> ke salah satu rekening berikut:</p>
            </div>
            <div className="ml-9 space-y-2">
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-200">
                <Building2 className="w-4 h-4 text-blue-600 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-700">BCA — 123-456-7890</p>
                  <p className="text-xs text-slate-500">a.n. Sport Center Soekarno Hatta</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-200">
                <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-700">Mandiri — 1400-0123-4567-8</p>
                  <p className="text-xs text-slate-500">a.n. Sport Center Soekarno Hatta</p>
                </div>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-lg px-3 py-2 border border-amber-200">
                <Smartphone className="w-4 h-4 text-purple-600 shrink-0" />
                <div>
                  <p className="font-semibold text-slate-700">GoPay / OVO — 0812-3456-7890</p>
                  <p className="text-xs text-slate-500">a.n. Sport Center SHIA</p>
                </div>
              </div>
            </div>
          </div>

          {/* Langkah 2: Upload bukti */}
          <div className="space-y-3 text-sm text-amber-800">
            <div className="flex gap-3 items-start">
              <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-amber-900 mt-0.5">2</div>
              <p>
                Upload bukti transfer di bawah ini <span className="font-bold">(lebih cepat dari WA)</span>, atau kirim
                manual ke WhatsApp{" "}
                <a
                  href={`https://wa.me/622155501234?text=Bukti%20pembayaran%20booking%20${booking.bookingCode}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline font-bold"
                >
                  +62 21 5550 1234
                </a>{" "}
                dengan menyertakan kode booking <strong>{booking.bookingCode}</strong>.
              </p>
            </div>
            <div className="ml-9">
              <PaymentProofUpload booking={booking} />
            </div>
          </div>

          {/* Langkah 3: Konfirmasi */}
          <div className="flex gap-3 text-sm text-amber-800">
            <div className="w-6 h-6 bg-amber-200 rounded-full flex items-center justify-center shrink-0 font-bold text-xs text-amber-900">3</div>
            <p>Konfirmasi booking akan dikirimkan ke <strong>{booking.customerEmail}</strong> dalam 1×24 jam kerja.</p>
          </div>
        </div>
      </div>

      {/* Aksi */}
      <div className="flex flex-col sm:flex-row gap-3 print:hidden">
        <button
          onClick={() => window.print()}
          className="flex-1 flex items-center justify-center gap-2 border-2 border-slate-300 text-slate-600 py-3 rounded-full font-semibold hover:bg-slate-50 transition-colors"
        >
          <Printer className="w-4 h-4" />
          Download / Cetak Ringkasan
        </button>
        <button
          onClick={onReset}
          className="flex items-center justify-center gap-2 border-2 border-blue-600 text-blue-600 py-3 px-6 rounded-full font-semibold hover:bg-blue-50 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Booking Lagi
        </button>
        <button
          onClick={() => navigate("/")}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-3 px-6 rounded-full font-semibold hover:shadow-md transition-all"
        >
          <Home className="w-4 h-4" />
          Beranda
        </button>
      </div>
    </div>
  );
}

// ── Form Booking Utama ─────────────────────────────────────────────────────
export default function BookingForm({ preselectedFacilityId, preselectedDate, preselectedStartTime }: BookingFormProps) {
  const { addBooking } = useBookings();
  const { services, loading: servicesLoading } = useServices();
  const [success, setSuccess] = useState<Booking | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const [form, setForm] = useState({
    facilityId: preselectedFacilityId ?? "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    date: preselectedDate ?? "",
    startTime: preselectedStartTime ?? "",
    endTime: "",
    notes: "",
  });

  const selectedFacility = services.find((f) => f.id === form.facilityId);
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
    if (!form.facilityId) {
      e.facilityId = "Pilih fasilitas terlebih dahulu";
    } else if (selectedFacility && !selectedFacility.available) {
      e.facilityId = "Fasilitas ini sedang tidak tersedia untuk booking";
    }
    if (!form.customerName.trim()) e.customerName = "Nama wajib diisi";
    if (!form.customerPhone.trim()) e.customerPhone = "Nomor WhatsApp wajib diisi";
    else if (!/^(\+62|62|0)[0-9]{8,13}$/.test(form.customerPhone.replace(/[\s\-]/g, "")))
      e.customerPhone = "Format nomor tidak valid (contoh: 08123456789)";
    if (!form.customerEmail.trim()) e.customerEmail = "Email wajib diisi";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.customerEmail))
      e.customerEmail = "Format email tidak valid";
    if (!form.date) e.date = "Tanggal wajib dipilih";
    if (!form.startTime) e.startTime = "Jam mulai wajib dipilih";
    if (!form.endTime) e.endTime = "Jam selesai wajib dipilih";
    else if (form.startTime && form.endTime && form.endTime <= form.startTime)
      e.endTime = "Jam selesai harus setelah jam mulai";
    else if (totalHours < 1) e.endTime = "Minimum booking 1 jam";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate() || !selectedFacility) return;
    setSubmitting(true);
    try {
      const booking = await addBooking({
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan";
      if (msg.toLowerCase().includes("slot") || msg.toLowerCase().includes("dibooking")) {
        setErrors((prev) => ({ ...prev, endTime: msg }));
      } else {
        setErrors((prev) => ({ ...prev, _global: msg }));
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSuccess(null);
    setForm({
      facilityId: preselectedFacilityId ?? "",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      date: preselectedDate ?? "",
      startTime: preselectedStartTime ?? "",
      endTime: "",
      notes: "",
    });
    setErrors({});
  }

  if (success) {
    return <ConfirmationPage booking={success} onReset={handleReset} />;
  }

  const endTimeOptions = form.startTime
    ? timeOptions.filter((t) => t > form.startTime)
    : timeOptions;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors._global && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {errors._global}
        </div>
      )}

      {/* Pilih Fasilitas */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold flex items-center justify-center">1</span>
          Pilih Fasilitas
        </h2>
        {servicesLoading ? (
          <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Memuat daftar fasilitas...
          </div>
        ) : (
          <select
            value={form.facilityId}
            onChange={(e) => update("facilityId", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.facilityId ? "border-red-400 bg-red-50" : "border-slate-300"
            }`}
          >
            <option value="">-- Pilih fasilitas --</option>
            {services.filter((f) => f.available).map((f) => (
              <option key={f.id} value={f.id}>
                {f.name} — {formatCurrency(f.pricePerHour)}/{f.unit ?? "jam"}
              </option>
            ))}
          </select>
        )}
        {errors.facilityId && (
          <p className="text-red-500 text-xs mt-1.5 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />{errors.facilityId}
          </p>
        )}
        {selectedFacility && (
          <div className={`mt-4 rounded-xl p-4 flex gap-4 items-center ${selectedFacility.available ? "bg-blue-50" : "bg-red-50 border border-red-200"}`}>
            <img src={selectedFacility.image} alt={selectedFacility.name} className="w-16 h-16 rounded-xl object-cover shrink-0" />
            <div>
              <p className="font-bold text-slate-800">{selectedFacility.name}</p>
              <p className="text-blue-600 font-semibold text-sm">{formatCurrency(selectedFacility.pricePerHour)}/{selectedFacility.unit ?? "jam"}</p>
              <p className="text-xs text-slate-500 mt-0.5">Kapasitas: maks. {selectedFacility.capacity} orang</p>
              {!selectedFacility.available && (
                <p className="text-xs text-red-600 font-semibold mt-1">⚠ Fasilitas ini tidak tersedia</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Waktu Booking */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold flex items-center justify-center">2</span>
          Waktu Booking
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              Tanggal <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              min={minDate}
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.date ? "border-red-400 bg-red-50" : "border-slate-300"
              }`}
            />
            {errors.date && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.date}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Jam Mulai <span className="text-red-500">*</span>
            </label>
            <select
              value={form.startTime}
              onChange={(e) => { update("startTime", e.target.value); update("endTime", ""); }}
              className={`w-full border rounded-xl px-4 py-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.startTime ? "border-red-400 bg-red-50" : "border-slate-300"
              }`}
            >
              <option value="">-- Mulai --</option>
              {timeOptions.slice(0, -1).map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.startTime && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.startTime}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Jam Selesai <span className="text-red-500">*</span>
            </label>
            <select
              value={form.endTime}
              onChange={(e) => update("endTime", e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.endTime ? "border-red-400 bg-red-50" : "border-slate-300"
              }`}
            >
              <option value="">-- Selesai --</option>
              {endTimeOptions.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {errors.endTime && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.endTime}</p>}
          </div>
        </div>
        {totalHours > 0 && selectedFacility && (
          <div className="mt-4 bg-gradient-to-r from-blue-600 to-emerald-500 text-white rounded-xl px-5 py-3 flex justify-between items-center">
            <span className="text-sm opacity-90">{totalHours} jam × {formatCurrency(selectedFacility.pricePerHour)}</span>
            <span className="text-2xl font-black">{formatCurrency(totalPrice)}</span>
          </div>
        )}
      </div>

      {/* Data Pemesan */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 space-y-4">
        <h2 className="font-bold text-slate-800 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-600 text-white rounded-full text-xs font-bold flex items-center justify-center">3</span>
          Data Pemesan
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              <User className="w-3.5 h-3.5 inline mr-1" />
              Nama Lengkap <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="Masukkan nama lengkap"
              value={form.customerName}
              onChange={(e) => update("customerName", e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.customerName ? "border-red-400 bg-red-50" : "border-slate-300"
              }`}
            />
            {errors.customerName && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerName}</p>}
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-600 mb-1.5">
              <Phone className="w-3.5 h-3.5 inline mr-1" />
              Nomor WhatsApp <span className="text-red-500">*</span>
            </label>
            <input
              type="tel"
              placeholder="Contoh: 08123456789"
              value={form.customerPhone}
              onChange={(e) => update("customerPhone", e.target.value)}
              className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.customerPhone ? "border-red-400 bg-red-50" : "border-slate-300"
              }`}
            />
            {errors.customerPhone && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerPhone}</p>}
          </div>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1.5">
            <Mail className="w-3.5 h-3.5 inline mr-1" />
            Email <span className="text-red-500">*</span>
          </label>
          <input
            type="email"
            placeholder="contoh@email.com"
            value={form.customerEmail}
            onChange={(e) => update("customerEmail", e.target.value)}
            className={`w-full border rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.customerEmail ? "border-red-400 bg-red-50" : "border-slate-300"
            }`}
          />
          {errors.customerEmail && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" />{errors.customerEmail}</p>}
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-600 mb-1.5">
            <FileText className="w-3.5 h-3.5 inline mr-1" />
            Catatan (Opsional)
          </label>
          <textarea
            placeholder="Contoh: Butuh net tambahan, keperluan event, jumlah peserta, dll."
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="w-full border border-slate-300 rounded-xl px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={submitting || servicesLoading}
        className="w-full bg-gradient-to-r from-blue-600 to-emerald-500 text-white py-4 rounded-full font-bold text-lg hover:shadow-lg hover:scale-[1.01] transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {submitting ? (
          <>
            <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
            Memproses Booking...
          </>
        ) : (
          "Konfirmasi Booking"
        )}
      </button>
      <p className="text-center text-xs text-slate-400">
        Dengan menekan tombol di atas, Anda menyetujui syarat dan ketentuan Sport Center SHIA.
      </p>
    </form>
  );
}
