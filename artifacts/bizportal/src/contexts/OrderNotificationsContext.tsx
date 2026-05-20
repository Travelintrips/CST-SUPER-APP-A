import { createContext, useContext, type ReactNode } from "react";
import { useOrderNotifications, type OrderNotification } from "@/hooks/useOrderNotifications";

interface OrderNotificationsContextValue {
  notifications: OrderNotification[];
  unreadCount: number;
  connected: boolean;
  markAllRead: () => void;
  clearAll: () => void;
  setOnNewOrder: (fn: (n: OrderNotification) => void) => void;
  lastFreightEventAt: number | null;
  notifPermission: NotificationPermission;
  requestNotifPermission: () => Promise<NotificationPermission>;
}

const OrderNotificationsContext = createContext<OrderNotificationsContextValue | null>(null);

export function OrderNotificationsProvider({ children }: { children: ReactNode }) {
  const value = useOrderNotifications();
  return (
    <OrderNotificationsContext.Provider value={value}>
      {children}
    </OrderNotificationsContext.Provider>
  );
}

export function useOrderNotificationsContext() {
  const ctx = useContext(OrderNotificationsContext);
  if (!ctx) throw new Error("useOrderNotificationsContext must be used within OrderNotificationsProvider");
  return ctx;
}
