import { useState } from "react";
import { Search, CheckCircle, XCircle, Clock, Trash2, Filter } from "lucide-react";
import { useBookings } from "@/hooks/useBookings";
import { formatCurrency } from "@/utils/bookingCode";
import type { Booking } from "@/types";

const statusConfig = {
  pending: { label: "Menunggu", class: "bg-yellow-100 text-yellow-700", icon: Clock },
  confirmed: { label: "Dikonfirmasi", class: "bg-emerald-100 text-emerald-700", icon: CheckCircle },
  cancelled: { label: "Dibatalkan", class: "bg-red-100 text-red-600", icon: XCircle },
};

export default function BookingTable() {
  const { bookings, updateStatus, deleteBooking } = useBookings();
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<Booking["status"] | "all">("all");

  const filtered = bookings.filter((b) => {
    const matchSearch =
      b.customerName.toLowerCase().includes(search.toLowerCase()) ||
      b.bookingCode.toLowerCase().includes(search.toLowerCase()) ||
      b.facilityName.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || b.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const stats = {
    total: bookings.length,
    pending: bookings.filter((b) => b.status === "pending").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    revenue: bookings.filter((b) => b.status === "confirmed").reduce((s, b) => s + b.totalPrice, 0),
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-sm text-slate-500">Total Booking</p>
          <p className="text-3xl font-black text-slate-800">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-sm text-slate-500">Menunggu</p>
          <p className="text-3xl font-black text-yellow-600">{stats.pending}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-sm text-slate-500">Dikonfirmasi</p>
          <p className="text-3xl font-black text-emerald-600">{stats.confirmed}</p>
        </div>
        <div className="bg-white rounded-xl shadow-md p-4">
          <p className="text-sm text-slate-500">Total Pendapatan</p>
          <p className="text-xl font-black text-blue-600">{formatCurrency(stats.revenue)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-md p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Cari nama, kode, atau fasilitas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as typeof filterStatus)}
              className="border border-slate-300 rounded-xl px-3 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Menunggu</option>
              <option value="confirmed">Dikonfirmasi</option>
              <option value="cancelled">Dibatalkan</option>
            </select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Belum ada data booking</p>
            <p className="text-sm">Data booking akan muncul di sini</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="pb-3 font-semibold text-slate-600">Kode</th>
                  <th className="pb-3 font-semibold text-slate-600">Pelanggan</th>
                  <th className="pb-3 font-semibold text-slate-600">Fasilitas</th>
                  <th className="pb-3 font-semibold text-slate-600">Jadwal</th>
                  <th className="pb-3 font-semibold text-slate-600">Total</th>
                  <th className="pb-3 font-semibold text-slate-600">Status</th>
                  <th className="pb-3 font-semibold text-slate-600">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((b) => {
                  const s = statusConfig[b.status];
                  const Icon = s.icon;
                  return (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-3 font-mono font-bold text-blue-600 text-xs">{b.bookingCode}</td>
                      <td className="py-3">
                        <p className="font-semibold text-slate-800">{b.customerName}</p>
                        <p className="text-xs text-slate-400">{b.customerPhone}</p>
                      </td>
                      <td className="py-3 text-slate-600">{b.facilityName}</td>
                      <td className="py-3 text-slate-600">
                        <p>{new Date(b.date).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })}</p>
                        <p className="text-xs text-slate-400">{b.startTime} – {b.endTime}</p>
                      </td>
                      <td className="py-3 font-bold text-slate-800">{formatCurrency(b.totalPrice)}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.class}`}>
                          <Icon className="w-3 h-3" />
                          {s.label}
                        </span>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-1">
                          {b.status === "pending" && (
                            <>
                              <button
                                onClick={() => updateStatus(b.id, "confirmed")}
                                className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 transition-colors"
                                title="Konfirmasi"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => updateStatus(b.id, "cancelled")}
                                className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
                                title="Batalkan"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => { if (window.confirm("Hapus booking ini?")) deleteBooking(b.id); }}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors"
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
      </div>
    </div>
  );
}
