import { useRef } from "react";
import { Bell, Package, Ship, ShoppingBag, CheckCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useLink } from "wouter";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useOrderNotifications, type OrderNotification } from "@/hooks/useOrderNotifications";

function typeLabel(type: OrderNotification["type"]) {
  if (type === "logistic") return "Order Logistik";
  if (type === "portal_sales") return "Order Portal";
  return "Order Produk";
}

function typeIcon(type: OrderNotification["type"]) {
  if (type === "logistic") return <Ship size={14} className="text-blue-500 shrink-0" />;
  if (type === "portal_sales") return <ShoppingBag size={14} className="text-purple-500 shrink-0" />;
  return <Package size={14} className="text-green-500 shrink-0" />;
}

function orderHref(n: OrderNotification) {
  if (n.type === "logistic") return `/logistics/portal-orders/${n.orderId}`;
  if (n.type === "portal_sales") return `/logistics/portal-orders`;
  return `/portal-product-orders`;
}

function formatRupiah(amount: number) {
  return `Rp ${amount.toLocaleString("id-ID")}`;
}

function timeAgo(isoDate: string) {
  const diff = Date.now() - new Date(isoDate).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "baru saja";
  if (mins < 60) return `${mins} mnt lalu`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} jam lalu`;
  return `${Math.floor(hrs / 24)} hari lalu`;
}

export function NotificationBell() {
  const { notifications, unreadCount, markAllRead, clearAll, setOnNewOrder } = useOrderNotifications();
  const initialized = useRef(false);

  if (!initialized.current) {
    initialized.current = true;
    setOnNewOrder((n) => {
      const label = typeLabel(n.type);
      const desc = n.type === "logistic"
        ? `${n.shipmentType ?? ""} · ${n.origin ?? ""} → ${n.destination ?? ""}`
        : `${n.itemCount ?? 1} item · ${formatRupiah(n.grandTotal)}`;
      toast.info(`${label} Baru!`, {
        description: `${n.customerName}${n.companyName ? ` (${n.companyName})` : ""} — ${desc}`,
        duration: 8_000,
        action: {
          label: "Lihat",
          onClick: () => { window.location.href = `/bizportal${orderHref(n)}`; },
        },
      });
    });
  }

  return (
    <Popover onOpenChange={(open) => { if (open && unreadCount > 0) markAllRead(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9" aria-label="Notifikasi order baru">
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white leading-none">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0 shadow-lg">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-semibold">Notifikasi Order</span>
          {notifications.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              title="Hapus semua"
            >
              <Trash2 size={12} />
              Hapus semua
            </button>
          )}
        </div>

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground">
            <Bell size={28} className="opacity-30" />
            <span className="text-sm">Belum ada notifikasi</span>
          </div>
        ) : (
          <ScrollArea className="max-h-[360px]">
            <div className="divide-y divide-border">
              {notifications.map((n) => (
                <a
                  key={n.id}
                  href={`/bizportal${orderHref(n)}`}
                  className={`flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors cursor-pointer ${n.readAt === null ? "bg-blue-50/60 dark:bg-blue-950/20" : ""}`}
                >
                  <div className="mt-0.5">{typeIcon(n.type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground truncate">{n.orderNumber}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    <p className="text-xs text-foreground truncate mt-0.5">
                      {n.customerName}{n.companyName ? ` · ${n.companyName}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {n.type === "logistic"
                        ? `${n.shipmentType ?? ""} · ${n.origin ?? ""} → ${n.destination ?? ""}`
                        : `${n.itemCount ?? 1} item · ${formatRupiah(n.grandTotal)}`}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </ScrollArea>
        )}

        {notifications.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <button
              onClick={markAllRead}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <CheckCheck size={12} />
              Tandai semua sudah dibaca
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
