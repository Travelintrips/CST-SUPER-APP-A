import { useState } from "react";
import {
  Search, CheckCircle, XCircle, Clock, Trash2, Filter,
  CalendarDays, TrendingUp, Users, Trophy,
} from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { formatCurrency, formatDate } from "@/utils/bookingCode";
import type { Booking } from "@/types";

const statusConfig: Record<
  Booking["status"],
  { label: string; badge: string; dot: string }
> = {
  pending: {
    label: "Menunggu",
    badge: "bg-yellow-100 text-yellow-700 border border-yellow-200",
    dot: "bg-yellow-400",
  },
  confirmed: {
    label: "Dikonfirmasi",
    badge: "bg-blue-100 text-blue-700 border border-blue-200",
    dot: "bg-blue-500",
  },
  completed: {
    label: "Selesai",
    badge: "bg-emerald-100 text-emerald-700 border border-emerald-200",
    dot: "bg-emerald-500",
  },
  cancelled: {
    label: "Dibatalkan",
    badge: "bg-red-100 text-red-600 border border-red-200",
    dot: "bg-red-400",
  },
};

const ALL_STATUSES: Array<{ value: Booking["status"] | "all"; label: string }> = [
  { value: "all", label: "Semua Status" },
  { value: "pending", label: "Menunggu" },
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

export default function BookingTable() {
  const { bookings, updateStatus, deleteBooking } = useBookings();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Booking["status"] | "all">("all");
  const [filterDate, setFilterDate] = useState("");

  const today = new Date().toISOString().split("T")[0];

  const todayBookings = bookings.filter((b) => b.date === today);
  const todayRevenue = todayBookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((s, b) => s + b.totalPrice, 0);
  const pendingCount = bookings.filter((b) => b.status === "pending").length;
  const completedCount = bookings.filter((b) => b.status === "completed").length;

  const filtered = bookings.filter((b) => {
    const q = search.toLowerCase();
    const matchSearch =
      b.customerName.toLowerCase().includes(q) ||
      b.bookingCode.toLowerCase().includes(q) ||
      b.facilityName.toLowerCase().includes(q);
    const matchStatus = filterStatus === "all" || b.status === filterStatus;
    const matchDate = !filterDate || b.date === filterDate;
    return matchSearch && matchStatus && matchDate;
  });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
              <CalendarDays className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-xs text-slate-400 font-medium">Hari ini</span>
          </div>
          <p className="text-3xl font-black text-slate-800">{todayBookings.length}</p>
          <p className="text-sm text-slate-500 mt-0.5">Booking Hari Ini</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center">
              <Clock className="w-5 h-5 text-yellow-500" />
            </div>
            <span className="text-xs text-slate-400 font-medium">Perlu aksi</span>
          </div>
          <p className="text-3xl font-black text-yellow-500">{pendingCount}</p>
          <p className="text-sm text-slate-500 mt-0.5">Menunggu Konfirmasi</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center">
              <Trophy className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-xs text-slate-400 font-medium">Total</span>
          </div>
          <p className="text-3xl font-black text-emerald-600">{completedCount}</p>
          <p className="text-sm text-slate-500 mt-0.5">Booking Selesai</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-5">
          <div className="flex items-start justify-between mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-xl flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <span className="text-xs text-slate-400 font-medium">Hari ini</span>
          </div>
          <p className="text-lg font-black text-blue-600 leading-tight">{formatCurrency(todayRevenue)}</p>
          <p className="text-sm text-slate-500 mt-0.5">Revenue Hari Ini</p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-100">
        <div className="p-5 border-b border-slate-100">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Cari nama, kode booking, atau fasilitas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 border border-slate-200 rounded-xl px-3 py-2">
                <Filter className="w-4 h-4 text-slate-400 shrink-0" />
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
                  className="text-sm bg-transparent focus:outline-none text-slate-700"
                >
                  {ALL_STATUSES.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-700"
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate("")}
                  className="text-xs text-slate-400 hover:text-red-500 px-2"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          {(search || filterStatus !== "all" || filterDate) && (
            <p className="text-xs text-slate-400 mt-2">
              Menampilkan {filtered.length} dari {bookings.length} booking
            </p>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400">
            <Users className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p className="font-semibold">Belum ada data booking</p>
            <p className="text-sm mt-1">Data booking pelanggan akan muncul di sini</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  <th className="px-5 py-3.5 font-semibold text-slate-600">Kode</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600">Nama</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600">Fasilitas</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600">Tanggal</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600">Jam</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-right">Total</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-center">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-600 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((b) => {
                  const s = statusConfig[b.status];
                  return (
                    <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-4">
                        <span className="font-mono font-bold text-blue-600 text-xs bg-blue-50 px-2 py-1 rounded-lg">
                          {b.bookingCode}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-800">{b.customerName}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{b.customerPhone}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600 max-w-[160px]">
                        <p className="truncate">{b.facilityName}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">
                        {new Date(b.date + "T00:00:00").toLocaleDateString("id-ID", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-5 py-4 font-mono text-slate-600">
                        {b.startTime} – {b.endTime}
                      </td>
                      <td className="px-5 py-4 font-bold text-slate-800 text-right">
                        {formatCurrency(b.totalPrice)}
                      </td>
                      <td className="px-5 py-4 text-center">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.badge}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
                          {s.label}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <select
                            value={b.status}
                            onChange={(e) =>
                              updateStatus(b.id, e.target.value as Booking["status"])
                            }
                            className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-slate-600"
                          >
                            <option value="pending">Menunggu</option>
                            <option value="confirmed">Dikonfirmasi</option>
                            <option value="completed">Selesai</option>
                            <option value="cancelled">Dibatalkan</option>
                          </select>
                          <button
                            onClick={() => {
                              if (window.confirm(`Hapus booking ${b.bookingCode}?`))
                                deleteBooking(b.id);
                            }}
                            className="p-1.5 rounded-lg text-slate-300 hover:bg-red-50 hover:text-red-500 transition-colors"
                            title="Hapus"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-400 flex justify-between">
            <span>{filtered.length} booking ditampilkan</span>
            <span>
              Revenue filtered:{" "}
              <strong className="text-slate-600">
                {formatCurrency(
                  filtered
                    .filter((b) => b.status === "confirmed" || b.status === "completed")
                    .reduce((s, b) => s + b.totalPrice, 0)
                )}
              </strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
