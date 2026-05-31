import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { db, logisticOrdersTable } from "@workspace/db";
import { updateOrderProgress } from "../lib/orderProgress.js";
import { transitionLogisticOrderStatus } from "../lib/services/logisticOrderStatusService.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";

export const driverProgressPublicRouter = Router();

const ALLOWED_STEPS = ["PICKUP", "IN_TRANSIT", "ARRIVED", "DELIVERED", "COMPLETED"] as const;

const STEP_LABEL: Record<string, string> = {
  PICKUP:     "Penjemputan",
  IN_TRANSIT: "Dalam Perjalanan",
  ARRIVED:    "Tiba di Tujuan",
  DELIVERED:  "Terkirim",
  COMPLETED:  "Selesai",
};

const STEP_TO_LOGISTIC_STATUS: Record<string, string> = {
  PICKUP:     "Pickup",
  IN_TRANSIT: "In Transit",
  ARRIVED:    "Arrived",
  DELIVERED:  "Delivered",
  COMPLETED:  "Delivered",
};

db.execute(sql`
  CREATE TABLE IF NOT EXISTS driver_progress_tokens (
    id           SERIAL PRIMARY KEY,
    token        TEXT NOT NULL UNIQUE,
    order_id     INTEGER NOT NULL,
    driver_name  TEXT,
    driver_phone TEXT,
    created_at   TIMESTAMPTZ DEFAULT NOW(),
    expires_at   TIMESTAMPTZ NOT NULL
  )
`).catch(() => {});

// GET /api/driver-progress/:token
driverProgressPublicRouter.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  try {
    const rows = await db.execute(sql`
      SELECT id, order_id, driver_name, expires_at
      FROM driver_progress_tokens WHERE token = ${token} LIMIT 1
    `);
    const [row] = rows as any[];
    if (!row) return res.status(404).json({ error: "Link tidak valid." });
    if (new Date(row.expires_at as string) < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa." });
    }

    const orderId = Number(row.order_id);
    const [order] = await db.select({
      orderNumber: logisticOrdersTable.orderNumber,
      customerName: logisticOrdersTable.customerName,
      origin: logisticOrdersTable.origin,
      destination: logisticOrdersTable.destination,
    }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan." });

    const evRows = await db.execute(sql`
      SELECT step_key FROM order_progress_events
      WHERE order_id = ${orderId} ORDER BY created_at ASC
    `);
    const completedSteps = (evRows as any[]).map((e) => e.step_key as string);
    const allowedSteps = ALLOWED_STEPS.filter((s) => !completedSteps.includes(s));

    return res.json({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      origin: order.origin ?? null,
      destination: order.destination ?? null,
      driverName: row.driver_name ?? null,
      completedSteps,
      allowedSteps,
      stepLabel: STEP_LABEL,
    });
  } catch (err) {
    logger.error({ err }, "driver-progress GET error");
    return res.status(500).json({ error: "Gagal memuat data." });
  }
});

// POST /api/driver-progress/:token  { stepKey, note? }
driverProgressPublicRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { stepKey, note } = req.body ?? {};
  if (!stepKey || !(ALLOWED_STEPS as readonly string[]).includes(String(stepKey))) {
    return res.status(400).json({ error: "stepKey tidak valid." });
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, order_id, driver_name, driver_phone, expires_at
      FROM driver_progress_tokens WHERE token = ${token} LIMIT 1
    `);
    const [row] = rows as any[];
    if (!row) return res.status(404).json({ error: "Link tidak valid." });
    if (new Date(row.expires_at as string) < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa." });
    }

    const orderId = Number(row.order_id);
    const driverName = (row.driver_name as string | null) ?? "Driver";

    await updateOrderProgress(
      orderId,
      String(stepKey),
      "driver",
      driverName,
      note ? String(note) : `Driver update via WA link: ${stepKey}`,
    );

    const logisticStatus = STEP_TO_LOGISTIC_STATUS[String(stepKey)];
    if (logisticStatus) {
      transitionLogisticOrderStatus(orderId, logisticStatus, {
        actorType: "driver",
        source: `driver-progress-link:${String(stepKey).toLowerCase()}`,
        force: false,
      }).catch(() => {});
    }

    // WA ke customer
    try {
      const [order] = await db.select({
        phone: logisticOrdersTable.phone,
        orderNumber: logisticOrdersTable.orderNumber,
        customerName: logisticOrdersTable.customerName,
      }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));

      if (order?.phone) {
        const domain = getPreferredDomain() || "cstlogistic.co.id";
        const waMsg =
          `🚚 *Update Pengiriman — CST Logistics*\n\n` +
          `Halo ${order.customerName},\n\n` +
          `Order *${order.orderNumber}* telah diperbarui:\n` +
          `📍 Status: *${STEP_LABEL[String(stepKey)] ?? stepKey}*\n\n` +
          `Pantau pengiriman:\nhttps://${domain}/track`;
        sendWhatsApp(order.phone, waMsg).catch(() => {});
      }
    } catch {
      // non-fatal
    }

    return res.json({ ok: true, stepKey, label: STEP_LABEL[String(stepKey)] });
  } catch (err) {
    logger.error({ err }, "driver-progress POST error");
    return res.status(500).json({ error: "Gagal memperbarui status." });
  }
});
