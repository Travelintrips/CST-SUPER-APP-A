import { useState, useMemo, useRef } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft, ChevronRight, CalendarDays, Clock, User, Phone, Mail,
  CheckCircle2, XCircle, Clock3, CircleDot, AlertCircle, Plus,
} from "lucide-react";

// ── Constants ────────────────────────────────────────────────────────────────

const FACILITIES = [
  { id: "futsal-01",    name: "Lapangan Futsal",    pricePerHour: 150000 },
  { id: "badminton-01", name: "Lapangan Badminton",  pricePerHour: 75000  },
  { id: "basket-01",    name: "Lapangan Basket",     pricePerHour: 200000 },
  { id: "fitness-01",   name: "Area Fitness",        pricePerHour: 35000  },
  { id: "yoga-01",      name: "Studio Yoga",         pricePerHour: 50000  },
  { id: "zumba-01",     name: "Studio Zumba",        pricePerHour: 60000  },
];

const FACILITIES_WITH_ALL = [
  { id: "all", name: "Semua Fasilitas", pricePerHour: 0 },
  ...FACILITIES,
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
  pending:   { label: "Menunggu",      color: "bg-amber-500/15 text-amber-700 border-amber-400/40",   icon: Clock3 },
  confirmed: { label: "Dikonfirmasi",  color: "bg-emerald-500/15 text-emerald-700 border-emerald-400/40", icon: CheckCircle2 },
  completed: { label: "Selesai",       color: "bg-slate-500/15 text-slate-600 border-slate-400/40",   icon: CircleDot },
  cancelled: { label: "Dibatalkan",    color: "bg-red-500/15 text-red-600 border-red-400/40",         icon: XCircle },
};

const START_HOUR   = 6;
const END_HOUR     = 23;
const TOTAL_HOURS  = END_HOUR - START_HOUR;
const CELL_HEIGHT  = 56; // px per hour

// ── Types ────────────────────────────────────────────────────────────────────

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

interface NewBookingDraft {
  date: string;
  startTime: string;
  endTime: string;
  facilityId: string;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function toDateStr(date: Date) {
  return date.toISOString().slice(0, 10);
}

function timeToPercent(t: string): number {
  const [h, m] = t.split(":").map(Number);
  const mins = (h - START_HOUR) * 60 + m;
  return Math.max(0, Math.min(100, (mins / (TOTAL_HOURS * 60)) * 100));
}

function minsToTimeStr(totalMins: number): string {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeStrToMins(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function calcHours(start: string, end: string): number {
  const diff = timeStrToMins(end) - timeStrToMins(start);
  return Math.max(0, diff / 60);
}

function generateBookingCode(): string {
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SC/${ymd}/${rand}`;
}

function snapToHalfHour(mins: number): number {
  return Math.round(mins / 30) * 30;
}

// Y pixel relative to column → time string snapped to 30-min grid
function yToTime(y: number): string {
  const totalMins = (y / (CELL_HEIGHT * TOTAL_HOURS)) * (TOTAL_HOURS * 60);
  const snapped   = snapToHalfHour(Math.max(0, Math.min(TOTAL_HOURS * 60, totalMins)));
  return minsToTimeStr(START_HOUR * 60 + snapped);
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  }).format(n);
}

const DAYS_SHORT = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
const DAYS_FULL  = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"];

// ── Time options ─────────────────────────────────────────────────────────────

const TIME_OPTIONS: string[] = [];
for (let h = START_HOUR; h <= END_HOUR; h++) {
  TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:00`);
  if (h < END_HOUR) TIME_OPTIONS.push(`${String(h).padStart(2, "0")}:30`);
}

// ── Component ────────────────────────────────────────────────────────────────

export default function SportCenterSchedulePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [facilityFilter, setFacilityFilter] = useState("all");
  const [selected, setSelected] = useState<Booking | null>(null);
  const [view, setView] = useState<"week" | "day">("week");
  const [dayOffset, setDayOffset] = useState(0);

  // New booking state
  const [newDraft, setNewDraft]       = useState<NewBookingDraft | null>(null);
  const [newFacilityId, setNewFacilityId]   = useState("");
  const [newStartTime, setNewStartTime]     = useState("");
  const [newEndTime, setNewEndTime]         = useState("");
  const [newDate, setNewDate]               = useState("");
  const [newCustomerName, setNewCustomerName]   = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerEmail, setNewCustomerEmail] = useState("");
  const [newNotes, setNewNotes]             = useState("");
  const [newPrice, setNewPrice]             = useState<number>(0);
  const [isCreating, setIsCreating]         = useState(false);

  const colRefs = useRef<Record<string, HTMLDivElement | null>>({});

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

  const createMutation = useMutation({
    mutationFn: (payload: object) =>
      apiFetch("/sport-center/bookings", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sport-center-bookings"] });
      setNewDraft(null);
      toast({ title: "Booking berhasil dibuat", description: `${newCustomerName} · ${newDate}` });
    },
    onError: (err: Error) => toast({ title: "Gagal membuat booking", description: err.message, variant: "destructive" }),
  });

  // ── Derived ────────────────────────────────────────────────────────────────

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

  const displayDates = view === "week" ? weekDates : [addDays(weekStart, dayOffset)];
  const today = toDateStr(new Date());

  const totalThisView     = bookingsInView.length;
  const confirmedThisView = bookingsInView.filter(b => b.status === "confirmed").length;
  const pendingThisView   = bookingsInView.filter(b => b.status === "pending").length;

  // ── Handlers ───────────────────────────────────────────────────────────────

  function navigateWeek(dir: number) { setWeekStart(prev => addDays(prev, dir * 7)); }

  function navigateDay(dir: number) {
    const n = dayOffset + dir;
    if (n < 0)      { setWeekStart(prev => addDays(prev, -7)); setDayOffset(6); }
    else if (n > 6) { setWeekStart(prev => addDays(prev, 7));  setDayOffset(0); }
    else              setDayOffset(n);
  }

  function openNewBookingFromClick(date: Date, y: number) {
    const startT = yToTime(y);
    const startMins = timeStrToMins(startT);
    const endMins   = Math.min(startMins + 60, END_HOUR * 60);
    const endT      = minsToTimeStr(endMins);
    const ds        = toDateStr(date);

    // pre-select facility from filter (if specific)
    const preselect = facilityFilter !== "all" ? facilityFilter : (FACILITIES[0]?.id ?? "");
    const fac       = FACILITIES.find(f => f.id === preselect) ?? FACILITIES[0];
    const hours     = calcHours(startT, endT);

    setNewDate(ds);
    setNewStartTime(startT);
    setNewEndTime(endT);
    setNewFacilityId(fac?.id ?? "");
    setNewPrice(Math.round(hours * (fac?.pricePerHour ?? 0)));
    setNewCustomerName("");
    setNewCustomerPhone("");
    setNewCustomerEmail("");
    setNewNotes("");
    setNewDraft({ date: ds, startTime: startT, endTime: endT, facilityId: fac?.id ?? "" });
  }

  function handleNewFacilityChange(id: string) {
    setNewFacilityId(id);
    const fac   = FACILITIES.find(f => f.id === id);
    const hours = calcHours(newStartTime, newEndTime);
    setNewPrice(Math.round(hours * (fac?.pricePerHour ?? 0)));
  }

  function handleNewTimeChange(field: "start" | "end", val: string) {
    const start = field === "start" ? val : newStartTime;
    const end   = field === "end"   ? val : newEndTime;
    if (field === "start") setNewStartTime(val);
    if (field === "end")   setNewEndTime(val);
    const fac   = FACILITIES.find(f => f.id === newFacilityId);
    const hours = calcHours(start, end);
    setNewPrice(Math.round(hours * (fac?.pricePerHour ?? 0)));
  }

  async function handleCreateSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerName || !newCustomerPhone || !newFacilityId || !newStartTime || !newEndTime) {
      toast({ title: "Lengkapi semua field wajib", variant: "destructive" });
      return;
    }
    if (timeStrToMins(newEndTime) <= timeStrToMins(newStartTime)) {
      toast({ title: "Jam selesai harus setelah jam mulai", variant: "destructive" });
      return;
    }
    setIsCreating(true);
    const fac   = FACILITIES.find(f => f.id === newFacilityId);
    const hours = calcHours(newStartTime, newEndTime);
    try {
      await createMutation.mutateAsync({
        bookingCode:   generateBookingCode(),
        facilityId:    newFacilityId,
        facilityName:  fac?.name ?? newFacilityId,
        customerName:  newCustomerName.trim(),
        customerPhone: newCustomerPhone.trim(),
        customerEmail: newCustomerEmail.trim() || "—",
        date:          newDate,
        startTime:     newStartTime,
        endTime:       newEndTime,
        totalHours:    hours,
        totalPrice:    newPrice,
        notes:         newNotes.trim(),
      });
    } finally {
      setIsCreating(false);
    }
  }

  // ── Labels ─────────────────────────────────────────────────────────────────

  const weekLabel = (() => {
    const s = weekDates[0].toLocaleDateString("id-ID", { day: "numeric", month: "short" });
    const e = weekDates[6].toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
    return `${s} – ${e}`;
  })();

  const dayLabel = addDays(weekStart, dayOffset).toLocaleDateString("id-ID", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const hourLabels = Array.from({ length: TOTAL_HOURS }, (_, i) =>
    `${String(START_HOUR + i).padStart(2, "0")}:00`
  );

  // ── Render ─────────────────────────────────────────────────────────────────

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
            <p className="text-sm text-muted-foreground mt-1">
              Kalender fasilitas Sport Center · <span className="text-primary font-medium">klik slot kosong</span> untuk buat booking baru
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Select value={facilityFilter} onValueChange={setFacilityFilter}>
              <SelectTrigger className="w-[190px] text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FACILITIES_WITH_ALL.map(f => (
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
              <button onClick={() => setView("week")}
                className={`px-3 py-1.5 transition-colors ${view === "week" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                Minggu
              </button>
              <button onClick={() => setView("day")}
                className={`px-3 py-1.5 transition-colors ${view === "day" ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
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
                  <div className="grid border-b bg-muted/40 sticky top-0 z-10"
                    style={{ gridTemplateColumns: `56px repeat(${displayDates.length}, 1fr)` }}>
                    <div className="border-r" />
                    {displayDates.map((date, idx) => {
                      const ds       = toDateStr(date);
                      const isToday  = ds === today;
                      const dl       = view === "week" ? DAYS_SHORT[idx] : DAYS_FULL[idx];
                      const dateNum  = date.getDate();
                      const count    = (bookingsByDate[ds] ?? []).length;
                      return (
                        <div key={ds}
                          className={`py-2 px-1.5 text-center border-r last:border-r-0 ${isToday ? "bg-primary/5" : ""}`}>
                          <div className={`text-xs font-medium uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>{dl}</div>
                          <div className={`text-lg font-bold leading-tight mt-0.5 ${isToday ? "text-primary" : ""}`}>
                            {isToday
                              ? <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground text-base">{dateNum}</span>
                              : dateNum}
                          </div>
                          {count > 0 && <div className="text-[10px] text-muted-foreground mt-0.5">{count} booking</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Grid body */}
                  <div className="grid"
                    style={{ gridTemplateColumns: `56px repeat(${displayDates.length}, 1fr)` }}>

                    {/* Hour labels */}
                    <div className="border-r">
                      {hourLabels.map(h => (
                        <div key={h}
                          className="border-b flex items-start justify-end pr-2 pt-1 text-[11px] text-muted-foreground"
                          style={{ height: CELL_HEIGHT }}>
                          {h}
                        </div>
                      ))}
                    </div>

                    {/* Day columns */}
                    {displayDates.map((date) => {
                      const ds          = toDateStr(date);
                      const isToday     = ds === today;
                      const dayBookings = (bookingsByDate[ds] ?? []).filter(b => b.status !== "cancelled");

                      return (
                        <div
                          key={ds}
                          ref={el => { colRefs.current[ds] = el; }}
                          onClick={(e) => {
                            // only fire when clicking the column background (not a booking block)
                            if ((e.target as HTMLElement).closest("[data-booking]")) return;
                            const rect = colRefs.current[ds]?.getBoundingClientRect();
                            if (!rect) return;
                            const y = e.clientY - rect.top;
                            openNewBookingFromClick(date, y);
                          }}
                          className={`border-r last:border-r-0 relative cursor-pointer group
                            ${isToday ? "bg-primary/[0.02]" : ""}
                            hover:bg-muted/20 transition-colors`}
                          style={{ height: CELL_HEIGHT * TOTAL_HOURS }}
                        >
                          {/* Hour grid lines */}
                          {hourLabels.map((_, i) => (
                            <div key={i}
                              className="absolute w-full border-b border-dashed border-border/40"
                              style={{ top: i * CELL_HEIGHT }} />
                          ))}

                          {/* "+" hint on hover */}
                          <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-0">
                            <Plus className="h-5 w-5 text-primary/30" />
                          </div>

                          {/* Booking blocks */}
                          {dayBookings.map(b => {
                            const topPct    = timeToPercent(b.startTime);
                            const botPct    = timeToPercent(b.endTime);
                            const totalPx   = CELL_HEIGHT * TOTAL_HOURS;
                            const topPx     = (topPct / 100) * totalPx;
                            const heightPx  = Math.max(22, ((botPct - topPct) / 100) * totalPx - 2);
                            const facColor  = FACILITY_COLORS[b.facilityId] ?? "bg-primary";
                            const isShort   = heightPx < 40;

                            return (
                              <button
                                key={b.id}
                                data-booking="1"
                                onClick={(e) => { e.stopPropagation(); setSelected(b); }}
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
          {FACILITIES.map(f => (
            <span key={f.id} className="flex items-center gap-1">
              <span className={`h-3 w-3 rounded ${FACILITY_COLORS[f.id]}`} />
              {f.name}
            </span>
          ))}
        </div>
      </div>

      {/* ── New Booking Dialog ── */}
      <Dialog open={!!newDraft} onOpenChange={(open) => !open && setNewDraft(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-4 w-4 text-primary" />
              Buat Booking Baru
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateSubmit} className="space-y-4 pt-1">

            {/* Fasilitas */}
            <div className="grid gap-1.5">
              <Label className="text-xs">Fasilitas <span className="text-destructive">*</span></Label>
              <Select value={newFacilityId} onValueChange={handleNewFacilityChange}>
                <SelectTrigger className="text-sm">
                  <SelectValue placeholder="Pilih fasilitas" />
                </SelectTrigger>
                <SelectContent>
                  {FACILITIES.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      <div className="flex items-center gap-2">
                        <span className={`h-2.5 w-2.5 rounded-full ${FACILITY_COLORS[f.id]}`} />
                        {f.name}
                        <span className="text-xs text-muted-foreground ml-auto">{formatCurrency(f.pricePerHour)}/jam</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tanggal & Waktu */}
            <div className="grid grid-cols-3 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs">Tanggal <span className="text-destructive">*</span></Label>
                <Input
                  type="date"
                  value={newDate}
                  onChange={e => setNewDate(e.target.value)}
                  className="text-sm"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Jam Mulai <span className="text-destructive">*</span></Label>
                <Select value={newStartTime} onValueChange={v => handleNewTimeChange("start", v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {TIME_OPTIONS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs">Jam Selesai <span className="text-destructive">*</span></Label>
                <Select value={newEndTime} onValueChange={v => handleNewTimeChange("end", v)}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent className="max-h-52">
                    {TIME_OPTIONS.filter(t => t > newStartTime).map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Durasi & Harga */}
            {newStartTime && newEndTime && newStartTime < newEndTime && (
              <div className="flex items-center gap-3 rounded-lg bg-muted/50 border px-3 py-2.5 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  Durasi: <strong className="text-foreground">{calcHours(newStartTime, newEndTime)} jam</strong>
                </span>
                <span className="ml-auto font-semibold text-primary">{formatCurrency(newPrice)}</span>
              </div>
            )}

            <div className="border-t pt-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Data Pelanggan</p>

              <div className="grid gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="nb-name" className="text-xs">
                    Nama Pelanggan <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="nb-name"
                    value={newCustomerName}
                    onChange={e => setNewCustomerName(e.target.value)}
                    placeholder="cth. Budi Santoso"
                    className="text-sm"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="grid gap-1.5">
                    <Label htmlFor="nb-phone" className="text-xs">
                      Telepon <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="nb-phone"
                      value={newCustomerPhone}
                      onChange={e => setNewCustomerPhone(e.target.value)}
                      placeholder="cth. 08123456789"
                      className="text-sm"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="nb-email" className="text-xs">Email</Label>
                    <Input
                      id="nb-email"
                      type="email"
                      value={newCustomerEmail}
                      onChange={e => setNewCustomerEmail(e.target.value)}
                      placeholder="opsional"
                      className="text-sm"
                    />
                  </div>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nb-price" className="text-xs">Total Harga (Rp)</Label>
                  <Input
                    id="nb-price"
                    type="number"
                    value={newPrice}
                    onChange={e => setNewPrice(Number(e.target.value))}
                    className="text-sm"
                    min={0}
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="nb-notes" className="text-xs">Catatan</Label>
                  <Textarea
                    id="nb-notes"
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder="opsional"
                    className="text-sm resize-none"
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setNewDraft(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={isCreating || createMutation.isPending}>
                {isCreating ? "Menyimpan…" : "Buat Booking"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Booking Detail Dialog ── */}
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
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className={`gap-1.5 px-2.5 py-1 ${cfg.color}`}>
                      <StatusIcon className="h-3.5 w-3.5" />
                      {cfg.label}
                    </Badge>
                    <code className="text-xs bg-muted px-2 py-1 rounded font-mono">{selected.bookingCode}</code>
                  </div>

                  <div className="rounded-lg border divide-y text-sm">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div>
                        <div className="text-xs text-muted-foreground">Fasilitas & Tanggal</div>
                        <div className="font-medium">{selected.facilityName}</div>
                        <div className="text-muted-foreground">
                          {new Date(selected.date + "T00:00:00").toLocaleDateString("id-ID", {
                            weekday: "long", day: "numeric", month: "long", year: "numeric",
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
                    {selected.customerEmail && selected.customerEmail !== "—" && (
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="text-xs text-muted-foreground">Email</div>
                          <div className="text-muted-foreground text-xs">{selected.customerEmail}</div>
                        </div>
                      </div>
                    )}
                    {selected.notes && (
                      <div className="px-3 py-2.5 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">Catatan: </span>{selected.notes}
                      </div>
                    )}
                  </div>

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
