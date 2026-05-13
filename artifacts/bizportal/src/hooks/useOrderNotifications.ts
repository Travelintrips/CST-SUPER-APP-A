import { useState, useEffect, useRef, useCallback } from "react";

export interface OrderNotification {
  id: string;
  type: "logistic" | "portal_sales" | "product";
  orderId: number;
  orderNumber: string;
  customerName: string;
  companyName: string | null;
  shipmentType?: string;
  origin?: string;
  destination?: string;
  grandTotal: number;
  itemCount?: number;
  createdAt: string;
  readAt: number | null;
}

const MAX_NOTIFICATIONS = 50;

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useOrderNotifications() {
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const onNewOrderRef = useRef<((n: OrderNotification) => void) | null>(null);

  const unreadCount = notifications.filter((n) => n.readAt === null).length;

  const markAllRead = useCallback(() => {
    setNotifications((prev) =>
      prev.map((n) => (n.readAt === null ? { ...n, readAt: Date.now() } : n))
    );
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const setOnNewOrder = useCallback((fn: (n: OrderNotification) => void) => {
    onNewOrderRef.current = fn;
  }, []);

  useEffect(() => {
    let retryTimer: ReturnType<typeof setTimeout>;
    let mounted = true;

    function connect() {
      if (!mounted) return;
      const es = new EventSource("/api/drivers/events", { withCredentials: true });
      esRef.current = es;

      es.addEventListener("connected", () => {
        if (mounted) setConnected(true);
      });

      es.addEventListener("new_order", (e: MessageEvent) => {
        if (!mounted) return;
        try {
          const data = JSON.parse(e.data);
          const notification: OrderNotification = {
            id: generateId(),
            type: data.type,
            orderId: data.orderId,
            orderNumber: data.orderNumber,
            customerName: data.customerName,
            companyName: data.companyName ?? null,
            shipmentType: data.shipmentType,
            origin: data.origin,
            destination: data.destination,
            grandTotal: data.grandTotal,
            itemCount: data.itemCount,
            createdAt: data.createdAt ?? new Date().toISOString(),
            readAt: null,
          };
          setNotifications((prev) =>
            [notification, ...prev].slice(0, MAX_NOTIFICATIONS)
          );
          onNewOrderRef.current?.(notification);
        } catch {
        }
      });

      es.onerror = () => {
        if (!mounted) return;
        setConnected(false);
        es.close();
        esRef.current = null;
        retryTimer = setTimeout(connect, 5_000);
      };
    }

    connect();

    return () => {
      mounted = false;
      clearTimeout(retryTimer);
      esRef.current?.close();
      esRef.current = null;
    };
  }, []);

  return { notifications, unreadCount, connected, markAllRead, clearAll, setOnNewOrder };
}
