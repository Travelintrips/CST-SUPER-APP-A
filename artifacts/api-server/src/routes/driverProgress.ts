import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import multer from "multer";
import { db, logisticOrdersTable } from "@workspace/db";
import { updateOrderProgress } from "../lib/orderProgress.js";
import { transitionLogisticOrderStatus } from "../lib/services/logisticOrderStatusService.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getPreferredDomain } from "../lib/domain.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { logger } from "../lib/logger.js";

export const driverProgressPublicRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const objectStorage = new ObjectStorageService();

const ALLOWED_STEPS = ["PICKUP", "IN_TRANSIT", "ARRIVED", "DELIVERED", "COMPLETED"] as const;
const PHOTO_REQUIRED_STEPS = new Set(["PICKUP", "ARRIVED", "DELIVERED", "COMPLETED"]);

const STEP_LABEL: Record<string, string> = {
  PICKUP:     "Penjemputan",
  IN_TRANSIT: "Dalam Perjalanan",
  ARRIVED:    "Tiba di Tujuan",
  DELIVERED:  "Terkirim",
  COMPLETED:  "Bukti Pengiriman",
};

const STEP_TO_LOGISTIC_STATUS: Record<string, string> = {
  PICKUP:     "Pickup",
  IN_TRANSIT: "In Transit",
  ARRIVED:    "Arrived",
  DELIVERED:  "Delivered",
  COMPLETED:  "POD Uploaded",
};

const LOGISTIC_STATUS_RANK: Record<string, number> = {
  "Pickup": 7, "In Transit": 8, "Arrived": 9, "Delivered": 10, "POD Uploaded": 11,
};

const ALLOWED_PHOTO_MIME = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]);

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
    const [row] = (rows.rows ?? []) as any[];
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
      SELECT step_key, metadata FROM order_progress_events
      WHERE order_id = ${orderId} ORDER BY created_at ASC
    `);
    const evData = (evRows.rows ?? []) as any[];
    const completedSteps = evData.map((e) => e.step_key as string);
    const completedStepsMeta: Record<string, { photoUrl?: string }> = {};
    evData.forEach((e) => {
      if (e.metadata?.photoUrl) {
        completedStepsMeta[e.step_key as string] = { photoUrl: e.metadata.photoUrl as string };
      }
    });

    return res.json({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      origin: order.origin ?? null,
      destination: order.destination ?? null,
      driverName: row.driver_name ?? null,
      completedSteps,
      completedStepsMeta,
      allowedSteps: (() => {
        const next = ALLOWED_STEPS.find((s) => !completedSteps.includes(s));
        return next ? [next] : [];
      })(),
      stepLabel: STEP_LABEL,
    });
  } catch (err) {
    logger.error({ err }, "driver-progress GET error");
    return res.status(500).json({ error: "Gagal memuat data." });
  }
});

// POST /api/driver-progress/:token/photo
driverProgressPublicRouter.post("/:token/photo", upload.single("file"), async (req: Request, res: Response) => {
  const { token } = req.params;
  const stepKey = String(req.body?.stepKey ?? "");
  if (!stepKey || !(ALLOWED_STEPS as readonly string[]).includes(stepKey)) {
    return res.status(400).json({ error: "stepKey tidak valid." });
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, expires_at FROM driver_progress_tokens WHERE token = ${token} LIMIT 1
    `);
    const [row] = (rows.rows ?? []) as any[];
    if (!row) return res.status(404).json({ error: "Link tidak valid." });
    if (new Date(row.expires_at as string) < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa." });
    }
    if (!req.file) return res.status(400).json({ error: "File diperlukan." });
    if (!ALLOWED_PHOTO_MIME.has(req.file.mimetype)) {
      return res.status(400).json({ error: "Hanya JPG, PNG, WebP, atau HEIC yang diizinkan." });
    }

    const ext = req.file.originalname?.split(".").pop()?.toLowerCase() ?? "jpg";
    const subPath = `driver-progress/${token}/${stepKey}-${randomUUID()}.${ext}`;
    const url = await objectStorage.uploadPublicRaw(subPath, req.file.buffer, req.file.mimetype);
    return res.json({ url });
  } catch (err) {
    logger.error({ err }, "driver-progress photo upload error");
    return res.status(500).json({ error: "Upload foto gagal." });
  }
});

// POST /api/driver-progress/:token  { stepKey, note?, photoUrl? }
driverProgressPublicRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  const { stepKey, note, photoUrl } = req.body ?? {};
  if (!stepKey || !(ALLOWED_STEPS as readonly string[]).includes(String(stepKey))) {
    return res.status(400).json({ error: "stepKey tidak valid." });
  }
  if (PHOTO_REQUIRED_STEPS.has(String(stepKey)) && !photoUrl) {
    return res.status(400).json({ error: `Foto wajib untuk step ${STEP_LABEL[String(stepKey)] ?? stepKey}.` });
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, order_id, driver_name, driver_phone, expires_at
      FROM driver_progress_tokens WHERE token = ${token} LIMIT 1
    `);
    const [row] = (rows.rows ?? []) as any[];
    if (!row) return res.status(404).json({ error: "Link tidak valid." });
    if (new Date(row.expires_at as string) < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa." });
    }

    const orderId = Number(row.order_id);
    const driverName = (row.driver_name as string | null) ?? "Driver";

    // Validate stepKey harus next step berikutnya (strict order)
    const evCheck = await db.execute(sql`
      SELECT step_key FROM order_progress_events
      WHERE order_id = ${orderId} ORDER BY created_at ASC
    `);
    const doneSteps = ((evCheck.rows ?? []) as any[]).map((e) => e.step_key as string);
    const nextStep = ALLOWED_STEPS.find((s) => !doneSteps.includes(s));
    if (!nextStep) {
      return res.status(409).json({ error: "Semua step sudah selesai." });
    }
    if (String(stepKey) !== nextStep) {
      return res.status(400).json({
        error: `Step tidak sesuai urutan. Step berikutnya: ${STEP_LABEL[nextStep] ?? nextStep}.`,
      });
    }

    await updateOrderProgress(
      orderId,
      String(stepKey),
      "driver",
      driverName,
      note ? String(note) : `Driver update via WA link: ${stepKey}`,
      photoUrl ? { photoUrl: String(photoUrl) } : undefined,
    );

    const logisticStatus = STEP_TO_LOGISTIC_STATUS[String(stepKey)];
    if (logisticStatus) {
      const [cur] = await db.select({ status: logisticOrdersTable.status })
        .from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
      const curRank = LOGISTIC_STATUS_RANK[cur?.status ?? ""] ?? -1;
      const newRank = LOGISTIC_STATUS_RANK[logisticStatus] ?? -1;
      if (newRank > curRank) {
        transitionLogisticOrderStatus(orderId, logisticStatus, {
          actorType: "driver",
          source: `driver-progress-link:${String(stepKey).toLowerCase()}`,
          force: false,
        }).catch((e: unknown) => logger.warn({ e, orderId, logisticStatus }, "driver-progress: status transition failed"));
      }
    }

    // WA ke customer
    try {
      const [order] = await db.select({
        phone: logisticOrdersTable.phone,
        orderNumber: logisticOrdersTable.orderNumber,
        customerName: logisticOrdersTable.customerName,
      }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));

      if (order?.phone) {
        const domain = process.env.REPLIT_DEV_DOMAIN || getPreferredDomain() || "cstlogistic.co.id";
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
