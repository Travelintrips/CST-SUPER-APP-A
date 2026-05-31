import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

interface AlertPayload {
  id: number;
  alertType: string;
  entityType: string;
  entityId?: number | null;
  entityRef?: string | null;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  createdAt: string;
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "🚨 Kritis",
  warning: "⚠️ Peringatan",
  info: "ℹ️ Info",
};

export function useAlertWebSocket() {
  const qc = useQueryClient();
  const esRef = useRef<EventSource | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destroyedRef = useRef(false);

  useEffect(() => {
    destroyedRef.current = false;

    function connect() {
      if (destroyedRef.current) return;

      const es = new EventSource("/api/alerts/stream");
      esRef.current = es;

      es.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; alert?: AlertPayload };
          if (msg.type !== "new_alert" || !msg.alert) return;
          const alert = msg.alert;

          qc.invalidateQueries({ queryKey: ["intelligence-alerts"] });
          qc.invalidateQueries({ queryKey: ["intelligence-alerts-summary"] });

          const label = SEVERITY_LABELS[alert.severity] ?? alert.severity;

          toast({
            title: `${label}: ${alert.title}`,
            description: alert.message,
            variant: alert.severity === "critical" ? "destructive" : "default",
          });
        } catch {
        }
      };

      es.onerror = () => {
        es.close();
        esRef.current = null;
        if (!destroyedRef.current) {
          reconnectTimer.current = setTimeout(connect, 5_000);
        }
      };
    }

    connect();

    return () => {
      destroyedRef.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [qc]);
}
