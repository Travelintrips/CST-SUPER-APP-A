import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, User, Phone, Mail,
  CheckCircle2, XCircle, Clock3, CircleDot, AlertCircle,
} from "lucide-react";

const FACILITIES = [
  { id: "all",          name: "Semua Fasilitas" },
  { id: "futsal-01",    name: "Lapangan Futsal" },
  { id: "badminton-01", name: "Lapangan Badminton" },
  { id: "basket-01",    name: "Lapangan Basket" },
  { id: "fitness-01",   name: "Area Fitness" },
  { id: "yoga-01",      name: "Studio Yoga" },
  { id: "zumba-01",     name: "Studio Zumba" },
];

const FACILITY_COLORS: Record<string, string> = {
  "futsal-01":    "bg-blue-500",
  "badminton-01": "bg-emerald-500",
  "basket-01":    "bg-orange-500",
  "fitness-01":   "bg-purple-500",
  "yoga-01":      "bg-pink-500",
  "zumba-01":     "bg-yellow-500",
};

const STATUS_CONFIG = {
  pending:   { label: "Menunggu",   color: "bg-amber-500/15 text-amber-700 border-amber-400/40",   icon: Clock3 },
  confirmed: { label: "Dikonfirmasi", color: "bg-emerald-500/15 text-emerald-700 border-emerald-400/40", icon: CheckCircle2 },
  completed: { label: "Selesai",    color: "bg-slate-500/15 text-slate-600 border-slate-400/40",   icon: CircleDot },
  cancelled: { label: "Dibatalkan", color: "bg-red-500/15 text-red-600 border-red-400/40",         icon: XCircle },
};

const START_HOUR = 6;
const END_HOUR   = 23;
const TOTAL_HOURS = END_HOUR - START_HOUR;

interface Booking {
  id: number;
  bookingCode: string;
  facilityId: string;
  facilityName: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  totalPrice: number;
  notes: string;
  status: "pending" | "confirmed" | "completed" | "cancelled";
  createdAt: string;
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function timeToPercent(t: string): number {
  const [h, m] = t.split(":").map(Number);
  const mins = (h - START_HOUR) * 60 + m;
  return Math.max(0, Math.min(100, (mins / (TOTAL_HOURS * 60)) * 100));
}

const DAYS_ID = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAYS_FULL = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

export default function SportCenterSchedulePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [view, setView] = useState<"week" | "day">("week");
  const [dayOffset, setDayOffset] = useState(0);

  const weekDates = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const { data: bookings = [], isLoading } = useQuery<Booking[]>({
    queryKey: ["sport-center-bookings"],
    queryFn: () => apiFetch("/sport-center/bookings"),
    refetchInterval: 30_000,
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiFetch(`/sport-center/bookings/${id}/status`, {
        method: "PUT",
        body: JSON.stringify({ status }),
      }),
    onSuccess: (updated: Booking) => {
      queryClient.invalidateQueries({ queryKey: ["sport-center-bookings"] });
      setSelected(updated);
      toast({ title: "Status booking diperbarui" });
    },
    onError: () => toast({ title: "Gagal memperbarui status", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      apiFetch(`/sport-center/bookings/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sport-center-bookings"] });
      setSelected(null);
      toast({ title: "Booking dihapus" });
    },
    onError: () => toast({ title: "Gagal menghapus booking", variant: "destructive" }),
  });

  const bookingsInView = useMemo(() => {
    const dates = view === "week"
      ? weekDates.map(toDateStr)
      : [toDateStr(addDays(weekStart, dayOffset))];
    return bookings.filter(b => {
      const dateMatch = dates.includes(b.date);
      const facMatch  = facilityFilter === "all" || b.facilityId === facilityFilter;
      return dateMatch && facMatch;
    });
  }, [bookings, weekDates, weekStart, dayOffset, facilityFilter, view]);

  const bookingsByDate = useMemo(() => {
    const map: Record<string, Booking[]> = {};
    bookingsInView.forEach(b => {
      if (!map[b.date]) map[b.date] = [];
      map[b.date].push(b);
    });
    return map;
  }, [bookingsInView]);

  const displayDates = view === "week"
    ? weekDates
    : [addDays(weekStart, dayOffset)];

  const today = toDateStr(new Date());

  const totalThisView = bookingsInView.length;
  const confirmedThisView = bookingsInView.filter(b => b.status === "confirmed").length;
  const pendingThisView   = bookingsInView.filter(b => b.status === "pending").length;

  function formatCurrency(n: number) {
    return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
  }

  function formatDateHeader(date: Date, idx: number) {
    const ds = toDateStr(date);
    const isToday = ds === today;
    const dayLabel = view === "week" ? DAYS_ID[idx] : DAYS_FULL[idx];
    const dateNum  = date.getDate();
    return { dayLabel, dateNum, isToday };
  }

  function navigateWeek(dir: number) {
    setWeekStart(prev => addDays(prev, dir * 7));
  }

  function navigateDay(dir: number) {
    const newOffset = dayOffset + dir;
    if (newOffset < 0) {
      setWeekStart(prev => addDays(prev, -7));
      setDayOffset(6);
    } else if (newOffset > 6) {
      setWeekStart(prev => addDays(prev, 7));
      setDayOffset(0);
    } else {
      setDayOffset(newOffset);
    }
  }

  const weekLabel = (() => {
    const start = weekDates[0];
    const end   = weekDates[6];
    const sm    = start.toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    const em    = end.toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    return `${sm} – ${em}`;
  })();

  const dayLabel = (() => {
    const d = addDays(weekStart, dayOffset);
    return d.toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  })();

  const hourLabels = Array.from({ length: TOTAL_HOURS }, (_, i) => `${String(START_HOUR + i).padStart(2, "0")}:00`);

  const CELL_HEIGHT = 56; // px per hour

  return (
    <AppShell>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2">
              <CalendarDays className="h-7 w-7 text-primary" />
              Jadwal Booking
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Kalender ketersediaan fasilitas Sport Center</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={facilityFilter} onValueChange={setFacilityFilter}>
              <SelectTrigger className="w-[190px] text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACILITIES.map(f => (
                  <SelectItem key={f.id} value={f.id}>
                    <div className="flex items-center gap-2">
                      {f.id !== "all" && (
                        <span className={`h-2.5 w-2.5 rounded-full ${FACILITY_COLORS[f.id] ?? "bg-muted"}`} />
                      )}
                      {f.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex rounded-md border overflow-hidden text-sm">
              <button
                onClick={() => setView("week")}
                className={`px-3 py-1.5 transition-colors ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Minggu
              </button>
              <button
                onClick={() => setView("day")}
                className={`px-3 py-1.5 transition-colors ${view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
              >
                Hari
              </button>
            </div>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap gap-2 text-sm">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-muted/60 border text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>{totalThisView} booking</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{confirmedThisView} dikonfirmasi</span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-700">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{pendingThisView} menunggu</span>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => view === "week" ? navigateWeek(-1) : navigateDay(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" className="h-8 w-8"
              onClick={() => view === "week" ? navigateWeek(1) : navigateDay(1)}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="h-8 ml-1 text-xs"
              onClick={() => { setWeekStart(getWeekStart(new Date())); setDayOffset(0); }}>
              Hari Ini
            </Button>
          </div>
          <span className="text-sm font-medium text-center flex-1 sm:flex-none">
            {view === "week" ? weekLabel : dayLabel}
          </span>
        </div>

        {/* Calendar */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div style={{ minWidth: view === "week" ? 700 : 320 }}>
                  {/* Day headers */}
                  <div
                    className="grid border-b bg-muted/40 sticky top-0 z-10"
                    style={{ gridTemplateColumns: `56px repeat(${displayDates.length}, 1fr)` }}
                  >
                    <div className="border-r" />
                    {displayDates.map((date, idx) => {
                      const { dayLabel: dl, dateNum, isToday } = formatDateHeader(date, idx);
                      const ds = toDateStr(date);
                      const count = (bookingsByDate[ds] ?? []).length;
                      return (
                        <div
                          key={ds}
                          className={`py-2 px-1.5 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}
                        >
                          <div className={`text-xs font-medium uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>
                            {dl}
                          </div>
                          <div className={`text-lg font-bold leading-tight mt-0.5 ${isToday ? "text-primary" : ""}`}>
                            {isToday ? (
                              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-base">
                                {dateNum}
                              </span>
                            ) : dateNum}
                          </div>
                          {count > 0 && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">{count} booking</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Grid body */}
                  <div
                    className="grid"
                    style={{ gridTemplateColumns: `56px repeat(${displayDates.length}, 1fr)` }}
                  >
                    {/* Hour labels */}
                    <div className="border-r">
                      {hourLabels.map(h => (
                        <div
                          key={h}
                          className="border-b flex items-start justify-end pr-2 pt-1 text-[11px] text-muted-foreground"
                          style={{ height: CELL_HEIGHT }}
                        >
                          {h}
                        </div>
                      ))}
                    </div>

                    {/* Day columns */}
                    {displayDates.map((date) => {
                      const ds = toDateStr(date);
                      const isToday = ds === today;
                      const dayBookings = (bookingsByDate[ds] ?? [])
                        .filter(b => b.status !== "cancelled");

                      return (
                        <div
                          key={ds}
                          className={`border-r last:border-r-0 relative ${isToday ? "bg-primary/[0.02]" : ""}`}
                          style={{ height: CELL_HEIGHT * TOTAL_HOURS }}
                        >
                          {/* Hour grid lines */}
                          {hourLabels.map((_, i) => (
                            <div
                              key={i}
                              className="absolute w-full border-b border-dashed border-border/40"
                              style={{ top: i * CELL_HEIGHT }}
                            />
                          ))}

                          {/* Booking blocks */}
                          {dayBookings.map(b => {
                            const topPct  = timeToPercent(b.startTime);
                            const botPct  = timeToPercent(b.endTime);
                            const heightPct = botPct - topPct;
                            const totalPx = CELL_HEIGHT * TOTAL_HOURS;
                            const topPx    = (topPct / 100) * totalPx;
                            const heightPx = Math.max(22, (heightPct / 100) * totalPx - 2);
                            const facColor = FACILITY_COLORS[b.facilityId] ?? "bg-primary";
                            const isShort  = heightPx < 40;

                            return (
                              <button
                                key={b.id}
                                onClick={() => setSelected(b)}
                                className={`absolute left-0.5 right-0.5 rounded overflow-hidden text-left
                                  transition-all hover:brightness-90 hover:shadow-md border border-white/20
                                  ${facColor} text-white z-[1]`}
                                style={{ top: topPx, height: heightPx }}
                              >
                                <div className="px-1.5 py-0.5 h-full flex flex-col justify-start overflow-hidden">
                                  {!isShort && (
                                    <div className="text-[10px] font-semibold truncate leading-tight">
                                      {b.customerName}
                                    </div>
                                  )}
                                  <div className="text-[9px] opacity-90 truncate leading-tight">
                                    {isShort ? b.customerName : `${b.startTime}–${b.endTime}`}
                                  </div>
                                  {!isShort && facilityFilter === "all" && (
                                    <div className="text-[9px] opacity-80 truncate leading-tight">
                                      {b.facilityName}
                                    </div>
                                  )}
                                  {b.status === "pending" && (
                                    <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-amber-300" />
                                  )}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          <span className="font-medium">Fasilitas:</span>
          {FACILITIES.filter(f => f.id !== "all").map(f => (
            <span key={f.id} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded ${FACILITY_COLORS[f.id]}`} />
              {f.name}
            </span>
          ))}
        </div>
      </div>

      {/* Booking Detail Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (() => {
            const cfg = STATUS_CONFIG[selected.status];
            const StatusIcon = cfg.icon;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-base">
                    <span className={`h-3 w-3 rounded-full ${FACILITY_COLORS[selected.facilityId] ?? "bg-primary"}`} />
                    Detail Booking
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-1">
                  {/* Status */}
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </Badge>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{selected.bookingCode}</code>
                  </div>

                  {/* Info grid */}
                  <div className="rounded-lg border divide-y text-sm">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Fasilitas & Tanggal</div>
                        <div className="font-medium">{selected.facilityName}</div>
                        <div className="text-muted-foreground">
                          {new Date(selected.date).toLocaleDateString("id-ID", {
                            weekday: "long", day: "numeric", month: "long", year: "numeric"
                          })}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Waktu</div>
                        <div className="font-medium">{selected.startTime} – {selected.endTime}</div>
                        <div className="text-muted-foreground">{selected.totalHours} jam · {formatCurrency(selected.totalPrice)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Pelanggan</div>
                        <div className="font-medium">{selected.customerName}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Telepon</div>
                        <div>{selected.customerPhone}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Email</div>
                        <div className="text-muted-foreground text-xs">{selected.customerEmail}</div>
                      </div>
                    </div>
                    {selected.notes && (
                      <div className="px-3 py-2.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Catatan: </span>{selected.notes}
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Ubah Status</p>
                    <div className="flex flex-wrap gap-2">
                      {selected.status !== "confirmed" && (
                        <Button size="sm" variant="outline"
                          className="text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: selected.id, status: "confirmed" })}>
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />Konfirmasi
                        </Button>
                      )}
                      {selected.status !== "completed" && (
                        <Button size="sm" variant="outline"
                          className="text-slate-600 border-slate-400/30 hover:bg-slate-500/10"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: selected.id, status: "completed" })}>
                          <CircleDot className="h-3.5 w-3.5 mr-1" />Selesai
                        </Button>
                      )}
                      {selected.status !== "pending" && (
                        <Button size="sm" variant="outline"
                          className="text-amber-600 border-amber-400/30 hover:bg-amber-500/10"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: selected.id, status: "pending" })}>
                          <Clock3 className="h-3.5 w-3.5 mr-1" />Set Pending
                        </Button>
                      )}
                      {selected.status !== "cancelled" && (
                        <Button size="sm" variant="outline"
                          className="text-red-500 border-red-400/30 hover:bg-red-500/10"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: selected.id, status: "cancelled" })}>
                          <XCircle className="h-3.5 w-3.5 mr-1" />Batalkan
                        </Button>
                      )}
                    </div>
                    <Button size="sm" variant="ghost"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10 w-full mt-1"
                      disabled={deleteMutation.isPending}
                      onClick={() => { if (confirm("Hapus booking ini permanen?")) deleteMutation.mutate(selected.id); }}>
                      Hapus Booking
                    </Button>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
