import { AppShell } from "@/components/layout/AppShell";
import { useState, useEffect, useCallback } from "react";
import { Calendar, Search, RefreshCw, Trash2, ChevronDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

interface BookingRow {
  id: number;
  booking_code: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  facility_id: string;
  facility_name: string;
  date: string;
  start_time: string;
  end_time: string;
  total_hours: string;
  total_price: number;
  notes: string | null;
  status: string;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "all", label: "Semua Status" },
  { value: "pending", label: "Menunggu" },
  { value: "confirmed", label: "Dikonfirmasi" },
  { value: "completed", label: "Selesai" },
  { value: "cancelled", label: "Dibatalkan" },
];

const STATUS_STYLE: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
};
const STATUS_LABEL: Record<string, string> = {
  pending: "Menunggu",
  confirmed: "Dikonfirmasi",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};

export default function SportCenterBookingsPage() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (search) params.set("search", search);
      const r = await fetch(`/api/sport-center/admin/bookings?${params}`);
      setBookings(await r.json());
    } finally {
      setLoading(false);
    }
  }, [statusFilter, dateFrom, dateTo, search]);

  useEffect(() => { fetchBookings(); }, [fetchBookings]);

  async function updateStatus(id: number, status: string) {
    setUpdatingId(id);
    try {
      const r = await fetch(`/api/sport-center/admin/bookings/${id}/status`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error();
      setBookings((prev) => prev.map((b) => b.id === id ? { ...b, status } : b));
      toast({ title: "Status diperbarui" });
    } catch {
      toast({ title: "Gagal memperbarui", variant: "destructive" });
    } finally {
      setUpdatingId(null);
    }
  }

  async function deleteBooking(id: number, code: string) {
    if (!confirm(`Hapus booking ${code}?`)) return;
    try {
      await fetch(`/api/sport-center/admin/bookings/${id}`, { method: "DELETE" });
      setBookings((prev) => prev.filter((b) => b.id !== id));
      toast({ title: "Booking dihapus" });
    } catch {
      toast({ title: "Gagal menghapus", variant: "destructive" });
    }
  }

  return (
    <AppShell>
      <div className="p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Manajemen Booking</h1>
            <p className="text-sm text-slate-500 mt-0.5">Kelola semua booking Sport Center</p>
          </div>
          <Button onClick={fetchBookings} variant="outline" size="sm" className="gap-2">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-48">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  placeholder="Cari nama, kode, fasilitas..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-36" placeholder="Dari" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-36" placeholder="Sampai" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 space-y-3">
                {[...Array(6)].map((_, i) => <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />)}
              </div>
            ) : bookings.length === 0 ? (
              <div className="py-16 text-center text-slate-400">
                <Calendar className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">Tidak ada booking ditemukan</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      {["Kode Booking", "Pelanggan", "Fasilitas", "Jadwal", "Durasi", "Total", "Status", "Aksi"].map((h) => (
                        <th key={h} className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {bookings.map((b) => (
                      <tr key={b.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-bold text-slate-700">{b.booking_code}</span>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium text-slate-800">{b.customer_name}</p>
                          <p className="text-xs text-slate-500">{b.customer_phone}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{b.facility_name}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          <p>{b.date}</p>
                          <p className="text-xs text-slate-500">{b.start_time} – {b.end_time}</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{parseFloat(b.total_hours)} jam</td>
                        <td className="px-4 py-3 font-semibold text-slate-800">{formatCurrency(b.total_price)}</td>
                        <td className="px-4 py-3">
                          <Select
                            value={b.status}
                            onValueChange={(v) => updateStatus(b.id, v)}
                            disabled={updatingId === b.id}
                          >
                            <SelectTrigger className={`h-7 w-36 text-xs font-semibold border-0 ${STATUS_STYLE[b.status] ?? ""}`}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUS_OPTIONS.filter((o) => o.value !== "all").map((o) => (
                                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="px-4 py-3">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => deleteBooking(b.id, b.booking_code)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-xs text-slate-400 text-right">{bookings.length} data ditemukan</p>
      </div>
    </AppShell>
  );
}
