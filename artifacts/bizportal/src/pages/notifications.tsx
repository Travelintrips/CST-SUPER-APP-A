import { useState, useEffect, useCallback } from "react";
import {
  Bell, Package, Ship, ShoppingBag, FileText, RefreshCw,
  Container, Layers, Dumbbell, ShoppingCart, Trash2, CheckCheck,
  ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type NotifType =
  | "logistic" | "logistic_status" | "portal_sales" | "sales_update"
  | "freight_new" | "freight_status" | "freight_stage"
  | "sport_booking" | "ecommerce" | "product";

interface DbNotification {
  id: number;
  type: NotifType;
  order_id: number | null;
  order_number: string;
  customer_name: string;
  company_name: string | null;
  payload: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

const TYPE_LABELS: Record<string, string> = {
  logistic:        "Order Logistik",
  logistic_status: "Update Logistik",
  portal_sales:    "Order Portal",
  sales_update:    "Update Sales",
  freight_new:     "Freight Baru",
  freight_status:  "Update Freight",
  freight_stage:   "Stage Freight",
  sport_booking:   "Booking Sport",
  ecommerce:       "E-commerce",
  product:         "Order Produk",
};

const TYPE_HREFS: Record<string, string> = {
  logistic:        "/logistics/portal-orders",
  logistic_status: "/logistics/portal-orders",
  portal_sales:    "/logistics/portal-orders",
  sales_update:    "/sales/documents",
  freight_new:     "/logistics/freight",
  freight_status:  "/logistics/freight",
  freight_stage:   "/logistics/freight",
  sport_booking:   "/sport-center/bookings",
  ecommerce:       "/ecommerce",
  product:         "/portal-product-orders",
};

function TypeIcon({ type }: { type: string }) {
  const cls = "shrink-0";
  if (type === "logistic")        return <Ship size={15} className={`${cls} text-blue-500`} />;
  if (type === "logistic_status") return <RefreshCw size={15} className={`${cls} text-cyan-500`} />;
  if (type === "portal_sales")    return <ShoppingBag size={15} className={`${cls} text-purple-500`} />;
  if (type === "sales_update")    return <FileText size={15} className={`${cls} text-orange-500`} />;
  if (type === "freight_new")     return <Container size={15} className={`${cls} text-indigo-500`} />;
  if (type === "freight_status")  return <RefreshCw size={15} className={`${cls} text-violet-500`} />;
  if (type === "freight_stage")   return <Layers size={15} className={`${cls} text-teal-500`} />;
  if (type === "sport_booking")   return <Dumbbell size={15} className={`${cls} text-emerald-500`} />;
  if (type === "ecommerce")       return <ShoppingCart size={15} className={`${cls} text-pink-500`} />;
  return <Package size={15} className={`${cls} text-green-500`} />;
}

function formatRupiah(v: number) {
  return `Rp ${v.toLocaleString("id-ID")}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} jam lalu`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" });
}

function notifDesc(n: DbNotification): string {
  const p = n.payload;
  if (n.type === "logistic" || n.type === "logistic_status") {
    const route = p.origin && p.destination ? `${p.origin} → ${p.destination}` : "";
    return route || (p.status as string | undefined) || "";
  }
  if (n.type === "sales_update") {
    const label = (p.actionLabel as string | undefined) ?? "";
    const total = typeof p.grandTotal === "number" ? ` · ${formatRupiah(p.grandTotal)}` : "";
    return `${label}${total}`;
  }
  if (n.type === "freight_new") {
    const route = p.origin && p.destination ? ` · ${p.origin} → ${p.destination}` : "";
    return `${p.commodity ?? ""}${route}`;
  }
  if (n.type === "freight_status") {
    return `Status: ${p.status ?? ""}`;
  }
  if (n.type === "freight_stage") {
    const vendor = p.vendorName ? ` · ${p.vendorName}` : "";
    return `${p.stageType ?? ""}: ${p.stageStatus ?? ""}${vendor}`;
  }
  if (n.type === "sport_booking") {
    const time = p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : "";
    const date = p.bookingDate ? ` · ${p.bookingDate}` : "";
    return `${p.facilityName ?? ""}${date}${time ? ` · ${time}` : ""}`;
  }
  if (n.type === "ecommerce") {
    const total = typeof p.grandTotal === "number" ? ` · ${formatRupiah(p.grandTotal)}` : "";
    return `${p.itemCount ?? 1} item${total}`;
  }
  return "";
}

const ALL_TYPES = [
  { value: "all",            label: "Semua" },
  { value: "logistic",       label: "Logistik" },
  { value: "freight_new",    label: "Freight" },
  { value: "sport_booking",  label: "Sport" },
  { value: "ecommerce",      label: "E-commerce" },
  { value: "sales_update",   label: "Sales" },
];

const READ_FILTERS = [
  { value: "all",    label: "Semua" },
  { value: "unread", label: "Belum Dibaca" },
  { value: "read",   label: "Sudah Dibaca" },
];

const PAGE_SIZE = 20;

export default function NotificationsPage() {
  const [data, setData] = useState<DbNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState("all");
  const [readFilter, setReadFilter] = useState("all");
  const [page, setPage] = useState(0);

  const fetch_ = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      type:   typeFilter,
      read:   readFilter,
      limit:  String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    fetch(`/api/notifications?${params}`, { credentials: "include" })
      .then((r) => r.ok ? r.json() : { data: [], total: 0 })
      .then((json) => {
        setData(json.data ?? []);
        setTotal(json.total ?? 0);
        setUnreadTotal(json.unreadTotal ?? 0);
      })
      .finally(() => setLoading(false));
  }, [typeFilter, readFilter, page]);

  useEffect(() => { setPage(0); }, [typeFilter, readFilter]);
  useEffect(() => { fetch_(); }, [fetch_]);

  function markRead(id: number) {
    fetch(`/api/notifications/${id}/read`, { method: "POST", credentials: "include" })
      .then(() => fetch_());
  }

  function markAllRead() {
    fetch(`/api/notifications/mark-all-read`, { method: "POST", credentials: "include" })
      .then(() => fetch_());
  }

  function deleteOne(id: number) {
    fetch(`/api/notifications/${id}`, { method: "DELETE", credentials: "include" })
      .then(() => fetch_());
  }

  function deleteAll() {
    if (!confirm("Hapus semua notifikasi dari database?")) return;
    fetch(`/api/notifications`, { method: "DELETE", credentials: "include" })
      .then(() => { setPage(0); fetch_(); });
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-indigo-500" />
            <h1 className="text-lg font-semibold">Riwayat Notifikasi</h1>
            {total > 0 && (
              <Badge variant="secondary" className="text-xs">{total} total</Badge>
            )}
          </div>
          <div className="flex gap-2">
            {unreadTotal > 0 && (
              <Button size="sm" variant="outline" onClick={markAllRead} className="gap-1 text-xs h-8">
                <CheckCheck size={13} />
                Tandai semua dibaca
                <span className="ml-0.5 bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 rounded-full px-1.5 py-px text-[10px] font-semibold leading-none">
                  {unreadTotal}
                </span>
              </Button>
            )}
            {total > 0 && (
              <Button size="sm" variant="outline" onClick={deleteAll} className="gap-1 text-xs h-8 text-destructive hover:text-destructive border-destructive/30">
                <Trash2 size={13} />
                Hapus semua
              </Button>
            )}
          </div>
        </div>

        {/* Filter: Type */}
        <div className="flex flex-wrap gap-1.5">
          {ALL_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setTypeFilter(t.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                typeFilter === t.value
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-background text-muted-foreground border-border hover:border-indigo-400 hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Filter: Read status */}
        <div className="flex gap-1.5">
          {READ_FILTERS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReadFilter(r.value)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                readFilter === r.value
                  ? "bg-slate-800 text-white border-slate-800 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200"
                  : "bg-background text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* List */}
        <div className="rounded-lg border border-border overflow-hidden">
          {loading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex gap-3 px-4 py-3">
                  <Skeleton className="h-5 w-5 rounded-full shrink-0 mt-0.5" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-muted-foreground">
              <Bell size={32} className="opacity-20" />
              <span className="text-sm">Tidak ada notifikasi</span>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {data.map((n) => {
                const isUnread = !n.read_at;
                const href = `/bizportal${TYPE_HREFS[n.type] ?? "/"}`;
                return (
                  <div
                    key={n.id}
                    className={`flex gap-3 px-4 py-3 group transition-colors ${
                      isUnread ? "bg-blue-50/60 dark:bg-blue-950/20 hover:bg-blue-50 dark:hover:bg-blue-950/30" : "hover:bg-muted/40"
                    }`}
                  >
                    {/* Icon */}
                    <div className="mt-1">
                      <TypeIcon type={n.type} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 justify-between">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {isUnread && (
                            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 shrink-0" />
                          )}
                          <span className="text-xs font-semibold truncate">{n.order_number}</span>
                          <Badge variant="outline" className="text-[10px] h-4 px-1.5 shrink-0 border-border text-muted-foreground">
                            {TYPE_LABELS[n.type] ?? n.type}
                          </Badge>
                        </div>
                        <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.created_at)}</span>
                      </div>

                      <p className="text-xs text-foreground mt-0.5 truncate">
                        {n.customer_name}
                        {n.company_name ? <span className="text-muted-foreground"> · {n.company_name}</span> : null}
                      </p>

                      <p className="text-[11px] text-muted-foreground truncate">
                        {notifDesc(n)}
                      </p>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={href}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Buka"
                      >
                        <Eye size={13} />
                      </a>
                      {isUnread && (
                        <button
                          onClick={() => markRead(n.id)}
                          className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                          title="Tandai dibaca"
                        >
                          <CheckCheck size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => deleteOne(n.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-red-500"
                        title="Hapus"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} dari {total}
            </span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                disabled={page === 0}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={13} />
              </Button>
              <Button
                size="icon"
                variant="outline"
                className="h-7 w-7"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={13} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
