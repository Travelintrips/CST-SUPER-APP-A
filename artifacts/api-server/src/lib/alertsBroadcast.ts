import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger.js";

let wss: WebSocketServer | null = null;

export interface AlertBroadcastPayload {
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

export function initAlertsBroadcast(server: Server): void {
  wss = new WebSocketServer({ server, path: "/api/alerts/ws" });

  wss.on("connection", (ws) => {
    ws.on("error", () => {});

    const ping = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.ping();
    }, 30_000);

    ws.on("close", () => clearInterval(ping));

    try {
      ws.send(JSON.stringify({ type: "connected" }));
    } catch {}
  });

  logger.info("Intelligence Alerts WebSocket ready at /api/alerts/ws");
}

export function broadcastNewAlert(alert: AlertBroadcastPayload): void {
  if (!wss || wss.clients.size === 0) return;
  const payload = JSON.stringify({ type: "new_alert", alert });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try {
        client.send(payload);
      } catch {}
    }
  }
  logger.debug({ alertId: alert.id, severity: alert.severity }, "Alert broadcast sent");
}
