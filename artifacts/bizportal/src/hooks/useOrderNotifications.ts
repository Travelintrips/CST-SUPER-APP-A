import { useState, useEffect, useRef, useCallback } from "react";

function playNotificationChime() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const now = ctx.currentTime;

    const notes = [523.25, 659.25, 783.99, 1046.5];
    const timings = [0, 0.15, 0.3, 0.45];

    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + timings[i]);
      gain.gain.setValueAtTime(0, now + timings[i]);
      gain.gain.linearRampToValueAtTime(0.18, now + timings[i] + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + timings[i] + 0.5);
      osc.start(now + timings[i]);
      osc.stop(now + timings[i] + 0.55);
    });

    setTimeout(() => ctx.close(), 2500);
  } catch {
    // AudioContext not supported or blocked — silently skip
  }
}

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
          playNotificationChime();
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
