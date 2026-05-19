import { AppShell } from "@/components/layout/AppShell";
import { useEffect, useState } from "react";
import { Link } from "wouter";
import {
  Calendar, TrendingUp, Clock, CheckCircle, XCircle,
  AlertCircle, Users, DollarSign, BarChart2, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";

interface Stats {
  totalBookings: number;
  todayBookings: number;
  monthBookings: number;
  monthRevenue: number;
  pendingConfirmation: number;
  byStatus: Record<string, number>;
}

interface BookingRow {
  id: number;
  booking_code: string;
  customer_name: string;
  facility_name: string;
  date: string;
  start_time: string;
  end_time: string;
  total_price: number;
  status: string;
  created_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  pending: { label: "Menunggu", color: "bg-amber-100 text-amber-700" },
  confirmed: { label: "Dikonfirmasi", color: "bg-blue-100 text-blue-700" },
  completed: { label: "Selesai", color: "bg-emerald-100 text-emerald-700" },
  cancelled: { label: "Dibatalkan", color: "bg-red-100 text-red-600" },
};

export default function SportCenterDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentBookings, setRecentBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/sport-center/admin/stats").then((r) => r.json()),
      fetch("/api/sport-center/admin/bookings").then((r) => r.json()),
    ]).then(([s, b]) => {
      setStats(s);
      setRecentBookings((b as BookingRow[]).slice(0, 8));
    }).finally(() => setLoading(false));
  }, []);

  const statCards = stats
    ? [
        {
          title: "Booking Hari Ini",
          value: stats.todayBookings,
          icon: Calendar,
          color: "text-blue-600",
          bg: "bg-blue-50",
        },
        {
          title: "Menunggu Konfirmasi",
          value: stats.pendingConfirmation,
          icon: Clock,
          color: "text-amber-600",
          bg: "bg-amber-50",
        },
        {
          title: "Booking Bulan Ini",
          value: stats.monthBookings,
          icon: Users,
          color: "text-violet-600",
          bg: "bg-violet-50",
        },
        {
          title: "Revenue Bulan Ini",
          value: formatCurrency(stats.monthRevenue),
          icon: DollarSign,
          color: "text-emerald-600",
          bg: "bg-emerald-50",
          isText: true,
        },
      ]
    : [];

  return (
    <AppShell>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Sport Center</h1>
            <p className="text-sm text-slate-500 mt-0.5">Dashboard pengelolaan Sport Center SHIA</p>
          </div>
          <Link
            href="/sport-center/bookings"
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Kelola Booking
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 rounded-xl bg-slate-100 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {statCards.map((card) => (
              <Card key={card.title} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <div className={`w-10 h-10 rounded-xl ${card.bg} flex items-center justify-center mb-3`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                  <p className="text-2xl font-bold text-slate-900">
                    {card.isText ? card.value : card.value.toLocaleString("id-ID")}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">{card.title}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-4 gap-3">
            {Object.entries(STATUS_MAP).map(([key, { label, color }]) => (
              <div key={key} className={`rounded-xl px-4 py-3 ${color.replace("text-", "bg-").replace("-700", "-50").replace("-600", "-50")}`}>
                <p className="text-xs font-medium text-slate-500">{label}</p>
                <p className={`text-xl font-bold ${color}`}>{stats.byStatus[key] ?? 0}</p>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {[
            { title: "Produk & Layanan", desc: "Kelola fasilitas dan layanan Sport Center", href: "/sport-center/services", icon: BarChart2, color: "bg-violet-600" },
            { title: "Purchase Request", desc: "Ajukan kebutuhan pembelian & maintenance", href: "/sport-center/purchase-requests", icon: TrendingUp, color: "bg-emerald-600" },
            { title: "Laporan", desc: "Laporan revenue dan statistik booking", href: "/sport-center/reports", icon: BarChart2, color: "bg-blue-600" },
          ].map((item) => (
            <Link key={item.href} href={item.href}>
              <Card className="border-0 shadow-sm hover:shadow-md transition-shadow cursor-pointer group">
                <CardContent className="p-5 flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl ${item.color} flex items-center justify-center shrink-0`}>
                    <item.icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-slate-800 text-sm">{item.title}</p>
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{item.desc}</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors shrink-0" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Booking Terbaru</CardTitle>
              <Link href="/sport-center/bookings" className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                Lihat semua <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-6 space-y-3">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-slate-100 rounded animate-pulse" />)}
              </div>
            ) : recentBookings.length === 0 ? (
              <div className="py-12 text-center text-slate-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Belum ada booking</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Kode</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs">Pelanggan</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs hidden md:table-cell">Fasilitas</th>
                      <th className="text-left px-4 py-2.5 font-medium text-slate-500 text-xs hidden lg:table-cell">Tanggal</th>
                      <th className="text-right px-4 py-2.5 font-medium text-slate-500 text-xs">Total</th>
                      <th className="text-center px-4 py-2.5 font-medium text-slate-500 text-xs">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b) => {
                      const st = STATUS_MAP[b.status] ?? { label: b.status, color: "bg-slate-100 text-slate-600" };
                      return (
                        <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-700">{b.booking_code}</td>
                          <td className="px-4 py-3 font-medium text-slate-800">{b.customer_name}</td>
                          <td className="px-4 py-3 text-slate-600 hidden md:table-cell">{b.facility_name}</td>
                          <td className="px-4 py-3 text-slate-500 hidden lg:table-cell">
                            {b.date} · {b.start_time}–{b.end_time}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-slate-800">
                            {formatCurrency(b.total_price)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${st.color}`}>
                              {st.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
