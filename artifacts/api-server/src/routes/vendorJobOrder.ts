/**
 * Vendor Job Order Flow
 *
 * Admin:
 *   POST /api/logistic/orders/:orderId/assign-vendor   → pilih vendor pemenang, generate token, siapkan WA
 *   GET  /api/logistic/orders/:orderId/job-order        → ambil data job order + semua quotes
 *   POST /api/logistic/orders/:orderId/job-progress     → admin update progress (tracking)
 *   POST /api/logistic/orders/:orderId/complete-review  → admin konfirmasi penyelesaian
 *
 * Public (Vendor):
 *   GET  /api/vendor-job/:token          → ambil detail job
 *   POST /api/vendor-job/:token/accept   → terima job + isi detail operasional
 *   POST /api/vendor-job/:token/reject   → tolak job
 *   POST /api/vendor-job/:token/progress → vendor update progress
 *   POST /api/vendor-job/:token/pod      → upload POD/invoice/foto (multipart, simpan URL)
 *
 * Public (Customer):
 *   GET  /api/order-track/:trackToken    → lihat tracking progress order
 */

import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, inArray, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db,
  logisticOrdersTable,
  logisticOrderQuotesTable,
  logisticOrderRfqsTable,
  suppliersTable,
  orderUpdatesTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";
import multer from "multer";
import { Client as ObjStoreClient } from "@replit/object-storage";

// ─────────────────────────────────────────────────────────────────────────────
// Migration (idempotent)
// ─────────────────────────────────────────────────────────────────────────────

let migDone = false;
async function ensureTables() {
  if (migDone) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_job_orders (
        id              SERIAL PRIMARY KEY,
        order_id        INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        quote_id        INTEGER REFERENCES logistic_order_quotes(id) ON DELETE SET NULL,
        vendor_id       INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        token           TEXT NOT NULL UNIQUE,
        status          TEXT NOT NULL DEFAULT 'pending',
        service_type    TEXT NOT NULL DEFAULT '',
        -- Operasional (trucking)
        driver_name     TEXT,
        driver_phone    TEXT,
        vehicle_plate   TEXT,
        vehicle_type    TEXT,
        pickup_time     TEXT,
        -- Operasional (freight)
        carrier         TEXT,
        schedule        TEXT,
        etd             TEXT,
        eta             TEXT,
        awb_bl_number   TEXT,
        -- Operasional (product)
        stock_confirmed TEXT,
        delivery_schedule TEXT,
        -- Operasional (customs/document)
        document_status TEXT,
        -- Umum
        notes           TEXT,
        reject_reason   TEXT,
        -- POD & completion
        pod_files       JSONB NOT NULL DEFAULT '[]'::jsonb,
        completion_notes TEXT,
        -- Timestamps
        accepted_at     TIMESTAMPTZ,
        rejected_at     TIMESTAMPTZ,
        completed_at    TIMESTAMPTZ,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_tracking_progress (
        id           SERIAL PRIMARY KEY,
        order_id     INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        job_order_id INTEGER REFERENCES vendor_job_orders(id) ON DELETE CASCADE,
        status       TEXT NOT NULL,
        notes        TEXT,
        updated_by   TEXT NOT NULL DEFAULT 'admin',
        is_public    BOOLEAN NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      ALTER TABLE logistic_orders
        ADD COLUMN IF NOT EXISTS tracking_token TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS job_status TEXT;

      CREATE INDEX IF NOT EXISTS vjo_order_idx ON vendor_job_orders(order_id);
      CREATE INDEX IF NOT EXISTS vjo_token_idx ON vendor_job_orders(token);
      CREATE INDEX IF NOT EXISTS otp_order_idx ON order_tracking_progress(order_id);
    `);
    migDone = true;
    logger.info("vendorJobOrder migration: ok");
  } catch (err) {
    logger.warn({ err }, "vendorJobOrder migration warn");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const tok = () => randomBytes(24).toString("hex");

function baseUrl() {
  const d = getPreferredDomain();
  return d ? `https://${d}` : "";
}

const JOB_STATUS_LABEL: Record<string, string> = {
  pending:          "Menunggu Respon Vendor",
  accepted:         "Vendor Menerima",
  rejected:         "Vendor Menolak",
  pickup_scheduled: "Pickup Dijadwalkan",
  in_progress:      "Sedang Diproses",
  completed:        "Selesai",
  problem:          "Ada Masalah / Perlu Perhatian",
};

function buildVendorWaMessage(
  orderNumber: string,
  origin: string,
  destination: string,
  serviceType: string,
  jobUrl: string,
  adminNote?: string
): string {
  return (
    `🚚 *Job Order — CST Logistics*\n\n` +
    `Order: *${orderNumber}*\n` +
    `Layanan: ${serviceType}\n` +
    `Rute: ${origin} → ${destination}\n` +
    (adminNote ? `\nCatatan Admin: ${adminNote}\n` : "") +
    `\n✅ Anda telah dipilih sebagai vendor untuk order ini.\n` +
    `\nSilakan buka link berikut untuk menerima atau menolak job, dan mengisi detail operasional:\n${jobUrl}\n\n` +
    `_Link berlaku 7 hari. Hubungi admin jika ada kendala._`
  );
}

function buildCustomerProgressWaMessage(
  orderNumber: string,
  status: string,
  notes: string | undefined,
  trackingUrl: string
): string {
  const statusLabel = JOB_STATUS_LABEL[status.toLowerCase().replace(/\s+/g, "_")] ?? status;
  return (
    `📦 *Update Status Pengiriman Anda*\n\n` +
    `Order: *${orderNumber}*\n` +
    `Status: *${statusLabel}*\n` +
    (notes ? `Keterangan: ${notes}\n` : "") +
    `\n🔗 Pantau progress real-time:\n${trackingUrl}\n\n` +
    `_CST Logistics — kami informasikan setiap perubahan status._`
  );
}

function buildCustomerPodWaMessage(
  orderNumber: string,
  vendorName: string,
  completionNotes: string | undefined,
  trackingUrl: string
): string {
  return (
    `✅ *Pengiriman Selesai!*\n\n` +
    `Order: *${orderNumber}*\n` +
    `Vendor *${vendorName}* telah mengunggah dokumen bukti pengiriman (POD).\n` +
    (completionNotes ? `Catatan: ${completionNotes}\n` : "") +
    `\nMohon konfirmasi penerimaan barang kepada tim CST Logistics jika diperlukan.\n` +
    `\n🔗 Detail tracking:\n${trackingUrl}\n\n` +
    `_CST Logistics_`
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Object storage for POD
// ─────────────────────────────────────────────────────────────────────────────

const objStore = new ObjStoreClient();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─────────────────────────────────────────────────────────────────────────────
// Admin Router
// ─────────────────────────────────────────────────────────────────────────────

export const vendorJobAdminRouter = Router();

/**
 * POST /api/logistic/orders/:orderId/assign-vendor
 * Body: { quoteId, adminNote? }
 */
vendorJobAdminRouter.post("/orders/:orderId/assign-vendor", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTables();
  const orderId = Number(req.params["orderId"]);
  const { quoteId, adminNote } = req.body as { quoteId: number; adminNote?: string };

  if (!quoteId) return res.status(400).json({ message: "quoteId wajib diisi" });

  try {
    // Ambil quote terpilih
    const [quote] = await db.select().from(logisticOrderQuotesTable)
      .where(and(eq(logisticOrderQuotesTable.id, quoteId), eq(logisticOrderQuotesTable.orderId, orderId)));
    if (!quote) return res.status(404).json({ message: "Quote tidak ditemukan" });

    const [order] = await db.select().from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    const [vendor] = await db.select().from(suppliersTable)
      .where(eq(suppliersTable.id, quote.vendorId));
    if (!vendor) return res.status(404).json({ message: "Vendor tidak ditemukan" });

    // Cek apakah sudah ada job order untuk order ini
    const existing = await db.execute(
      sql`SELECT id, token FROM vendor_job_orders WHERE order_id = ${orderId} LIMIT 1`
    );
    if ((existing.rows ?? []).length > 0) {
      const row = existing.rows[0] as { id: number; token: string };
      const jobUrl = `${baseUrl()}/vendor-job/${row.token}`;
      const waMsg = buildVendorWaMessage(order.orderNumber, order.origin, order.destination, order.shipmentType, jobUrl, adminNote);
      return res.json({ ok: true, jobToken: row.token, jobUrl, waMessage: waMsg, vendorPhone: vendor.phone, alreadyExists: true });
    }

    // Generate token job order + tracking token
    const jobToken = tok();
    const trackingToken = tok();

    // Insert job order
    await db.execute(sql`
      INSERT INTO vendor_job_orders (order_id, quote_id, vendor_id, token, status, service_type)
      VALUES (${orderId}, ${quote.id}, ${quote.vendorId}, ${jobToken}, 'pending', ${order.shipmentType})
    `);

    // Update order: set approvedVendorId, tracking_token, status, job_status
    await db.update(logisticOrdersTable).set({
      approvedVendorId: quote.vendorId,
      approvedQuoteId: quote.id,
      status: "Vendor Assigned",
    } as any).where(eq(logisticOrdersTable.id, orderId));

    // Set tracking_token (raw SQL karena kolom baru)
    await db.execute(sql`
      UPDATE logistic_orders SET tracking_token = ${trackingToken}, job_status = 'vendor_assigned'
      WHERE id = ${orderId}
    `);

    // Mark quote terpilih sebagai 'approved', lainnya 'not_selected'
    await db.update(logisticOrderQuotesTable)
      .set({ quoteStatus: "approved" })
      .where(eq(logisticOrderQuotesTable.id, quoteId));

    const allQuotes = await db.select({ id: logisticOrderQuotesTable.id })
      .from(logisticOrderQuotesTable)
      .where(and(eq(logisticOrderQuotesTable.orderId, orderId)));
    const otherIds = allQuotes.map(q => q.id).filter(id => id !== quoteId);
    if (otherIds.length > 0) {
      await db.update(logisticOrderQuotesTable)
        .set({ quoteStatus: "not_selected" })
        .where(inArray(logisticOrderQuotesTable.id, otherIds));
    }

    // Progress tracking entry
    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, status, notes, updated_by, is_public)
      VALUES (${orderId}, 'Vendor Assigned', ${"Vendor " + vendor.name + " telah dipilih untuk order ini."}, 'admin', true)
    `);

    // Activity log
    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorName: "Admin",
      status: "Vendor Assigned",
      notes: `Vendor *${vendor.name}* dipilih. Job order dikirim.${adminNote ? "\nCatatan: " + adminNote : ""}`,
      isPublic: false,
    });

    const jobUrl = `${baseUrl()}/vendor-job/${jobToken}`;
    const waMsg = buildVendorWaMessage(order.orderNumber, order.origin, order.destination, order.shipmentType, jobUrl, adminNote);

    // Kirim WA ke vendor jika ada nomor
    if (vendor.phone) {
      sendWhatsApp(vendor.phone, waMsg).catch(e => logger.warn({ e }, "vendor job WA failed"));
    }

    // Notify admin group
    const adminWa = await getAdminWa();
    if (adminWa) {
      sendWhatsApp(adminWa,
        `📋 *Vendor Ditugaskan*\n\nOrder: ${order.orderNumber}\nVendor: ${vendor.name}\nLink Job: ${jobUrl}`
      ).catch(() => {});
    }

    logger.info({ orderId, jobToken, vendorId: vendor.id }, "Vendor assigned");
    return res.status(201).json({
      ok: true, jobToken, jobUrl,
      trackingToken,
      trackingUrl: `${baseUrl()}/order-track/${trackingToken}`,
      waMessage: waMsg,
      vendorPhone: vendor.phone,
    });
  } catch (err) {
    logger.error({ err }, "assign-vendor error");
    return res.status(500).json({ message: "Gagal menugaskan vendor" });
  }
});

/**
 * GET /api/logistic/orders/:orderId/job-order
 */
vendorJobAdminRouter.get("/orders/:orderId/job-order", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTables();
  const orderId = Number(req.params["orderId"]);

  try {
    const [order] = await db.select().from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    // Job order
    const jobResult = await db.execute(
      sql`SELECT vjo.*, s.name as vendor_name, s.phone as vendor_phone
          FROM vendor_job_orders vjo
          LEFT JOIN suppliers s ON s.id = vjo.vendor_id
          WHERE vjo.order_id = ${orderId}
          ORDER BY vjo.created_at DESC LIMIT 1`
    );
    const jobOrder = jobResult.rows[0] ?? null;

    // Quotes dari semua RFQ order ini
    const rfqs = await db.select({ id: logisticOrderRfqsTable.id })
      .from(logisticOrderRfqsTable)
      .where(eq(logisticOrderRfqsTable.orderId, orderId));
    const rfqIds = rfqs.map(r => r.id);

    let quotes: any[] = [];
    if (rfqIds.length > 0) {
      const qResult = await db.execute(sql`
        SELECT q.*, s.name as vendor_name, s.phone as vendor_phone
        FROM logistic_order_quotes q
        LEFT JOIN suppliers s ON s.id = q.vendor_id
        WHERE q.order_id = ${orderId}
        ORDER BY q.vendor_price ASC NULLS LAST
      `);
      quotes = qResult.rows as any[];
    }

    // Tracking progress
    const progressResult = await db.execute(
      sql`SELECT * FROM order_tracking_progress WHERE order_id = ${orderId} ORDER BY created_at DESC`
    );

    // tracking_token
    const tokenResult = await db.execute(
      sql`SELECT tracking_token FROM logistic_orders WHERE id = ${orderId}`
    );
    const trackingToken = (tokenResult.rows[0] as any)?.tracking_token ?? null;

    return res.json({
      order,
      jobOrder,
      quotes,
      progress: progressResult.rows,
      trackingToken,
      trackingUrl: trackingToken ? `${baseUrl()}/order-track/${trackingToken}` : null,
      jobUrl: jobOrder ? `${baseUrl()}/vendor-job/${(jobOrder as any).token}` : null,
    });
  } catch (err) {
    logger.error({ err }, "get-job-order error");
    return res.status(500).json({ message: "Gagal mengambil data job order" });
  }
});

/**
 * POST /api/logistic/orders/:orderId/job-progress
 * Admin tambah progress tracking
 * Body: { status, notes, isPublic }
 */
vendorJobAdminRouter.post("/orders/:orderId/job-progress", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTables();
  const orderId = Number(req.params["orderId"]);
  const { status, notes, isPublic = true } = req.body as { status: string; notes?: string; isPublic?: boolean };
  if (!status) return res.status(400).json({ message: "status wajib diisi" });

  try {
    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, status, notes, updated_by, is_public)
      VALUES (${orderId}, ${status}, ${notes ?? null}, 'admin', ${isPublic})
    `);

    await db.update(logisticOrdersTable)
      .set({ status } as any)
      .where(eq(logisticOrdersTable.id, orderId));

    await db.execute(sql`
      UPDATE logistic_orders SET job_status = ${status.toLowerCase().replace(/\s+/g, "_")}
      WHERE id = ${orderId}
    `);

    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorName: "Admin",
      status,
      notes: notes ?? null,
      isPublic: isPublic ?? true,
    });

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "job-progress admin error");
    return res.status(500).json({ message: "Gagal update progress" });
  }
});

/**
 * POST /api/logistic/orders/:orderId/complete-review
 * Admin konfirmasi penyelesaian, kirim notif ke customer
 */
vendorJobAdminRouter.post("/orders/:orderId/complete-review", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTables();
  const orderId = Number(req.params["orderId"]);
  const { adminNotes, sendCustomerNotif = true } = req.body as { adminNotes?: string; sendCustomerNotif?: boolean };

  try {
    const [order] = await db.select().from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    // Update status
    await db.update(logisticOrdersTable)
      .set({ status: "Completed" } as any)
      .where(eq(logisticOrdersTable.id, orderId));

    await db.execute(sql`
      UPDATE logistic_orders SET job_status = 'completed' WHERE id = ${orderId}
    `);

    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, status, notes, updated_by, is_public)
      VALUES (${orderId}, 'Completed', ${adminNotes ?? "Order telah diselesaikan dan dikonfirmasi oleh admin."}, 'admin', true)
    `);

    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorName: "Admin",
      status: "Completed",
      notes: adminNotes ?? "Admin mengkonfirmasi penyelesaian order.",
      isPublic: true,
    });

    // Ambil tracking token untuk customer
    const tokenResult = await db.execute(
      sql`SELECT tracking_token FROM logistic_orders WHERE id = ${orderId}`
    );
    const trackingToken = (tokenResult.rows[0] as any)?.tracking_token ?? null;

    // Kirim WA ke customer
    if (sendCustomerNotif && order.phone) {
      const trackUrl = trackingToken ? `${baseUrl()}/order-track/${trackingToken}` : "";
      const waMsg =
        `✅ *Order Anda Telah Selesai — CST Logistics*\n\n` +
        `Order: *${order.orderNumber}*\n` +
        `Rute: ${order.origin} → ${order.destination}\n\n` +
        `Order Anda telah berhasil diselesaikan.\n` +
        (adminNotes ? `Catatan: ${adminNotes}\n` : "") +
        (trackUrl ? `\nLihat detail & dokumen di:\n${trackUrl}\n` : "") +
        `\nTerima kasih telah mempercayakan pengiriman Anda kepada CST Logistics! 🙏`;
      sendWhatsApp(order.phone, waMsg).catch(e => logger.warn({ e }, "complete WA to customer failed"));
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "complete-review error");
    return res.status(500).json({ message: "Gagal konfirmasi penyelesaian" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Public Vendor Router
// ─────────────────────────────────────────────────────────────────────────────

export const vendorJobPublicRouter = Router();

/** GET /api/vendor-job/:token */
vendorJobPublicRouter.get("/:token", async (req: Request, res: Response) => {
  await ensureTables();
  const { token } = req.params as { token: string };

  try {
    const result = await db.execute(sql`
      SELECT vjo.*,
             s.name as vendor_name, s.phone as vendor_phone,
             o.order_number, o.shipment_type, o.origin, o.destination,
             o.commodity, o.cargo_description, o.gross_weight, o.volume_cbm,
             o.required_date, o.customer_name, o.notes as order_notes,
             o.status as order_status
      FROM vendor_job_orders vjo
      LEFT JOIN suppliers s ON s.id = vjo.vendor_id
      LEFT JOIN logistic_orders o ON o.id = vjo.order_id
      WHERE vjo.token = ${token}
    `);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Link tidak ditemukan atau tidak valid" });
    }

    const job = result.rows[0] as any;

    // Progress tracking
    const progressResult = await db.execute(
      sql`SELECT * FROM order_tracking_progress WHERE order_id = ${job.order_id} ORDER BY created_at ASC`
    );

    return res.json({
      token,
      status: job.status,
      serviceType: job.service_type,
      vendorName: job.vendor_name,
      vendorPhone: job.vendor_phone,
      order: {
        orderNumber: job.order_number,
        shipmentType: job.shipment_type,
        origin: job.origin,
        destination: job.destination,
        commodity: job.commodity,
        cargoDescription: job.cargo_description,
        grossWeight: job.gross_weight,
        volumeCbm: job.volume_cbm,
        requiredDate: job.required_date,
        customerName: job.customer_name,
        notes: job.order_notes,
        status: job.order_status,
      },
      operationalDetails: {
        driverName: job.driver_name,
        driverPhone: job.driver_phone,
        vehiclePlate: job.vehicle_plate,
        vehicleType: job.vehicle_type,
        pickupTime: job.pickup_time,
        carrier: job.carrier,
        schedule: job.schedule,
        etd: job.etd,
        eta: job.eta,
        awbBlNumber: job.awb_bl_number,
        stockConfirmed: job.stock_confirmed,
        deliverySchedule: job.delivery_schedule,
        documentStatus: job.document_status,
        notes: job.notes,
      },
      podFiles: job.pod_files ?? [],
      completionNotes: job.completion_notes,
      acceptedAt: job.accepted_at,
      rejectedAt: job.rejected_at,
      rejectReason: job.reject_reason,
      progress: progressResult.rows,
    });
  } catch (err) {
    logger.error({ err }, "get-vendor-job error");
    return res.status(500).json({ error: "Gagal memuat data job order" });
  }
});

/** POST /api/vendor-job/:token/accept */
vendorJobPublicRouter.post("/:token/accept", async (req: Request, res: Response) => {
  await ensureTables();
  const { token } = req.params as { token: string };
  const body = req.body as Record<string, string>;

  try {
    const result = await db.execute(
      sql`SELECT vjo.*, o.order_number, o.origin, o.destination, o.phone as customer_phone, o.shipment_type, s.name as vendor_name, s.phone as vendor_phone
          FROM vendor_job_orders vjo
          LEFT JOIN logistic_orders o ON o.id = vjo.order_id
          LEFT JOIN suppliers s ON s.id = vjo.vendor_id
          WHERE vjo.token = ${token}`
    );
    if (!result.rows.length) return res.status(404).json({ error: "Link tidak ditemukan" });

    const job = result.rows[0] as any;
    if (job.status !== "pending") {
      return res.status(409).json({ error: "Job sudah direspon sebelumnya" });
    }

    const now = new Date().toISOString();

    // Update job order dengan detail operasional + status accepted
    await db.execute(sql`
      UPDATE vendor_job_orders SET
        status = 'accepted',
        accepted_at = NOW(),
        driver_name = ${body.driverName ?? null},
        driver_phone = ${body.driverPhone ?? null},
        vehicle_plate = ${body.vehiclePlate ?? null},
        vehicle_type = ${body.vehicleType ?? null},
        pickup_time = ${body.pickupTime ?? null},
        carrier = ${body.carrier ?? null},
        schedule = ${body.schedule ?? null},
        etd = ${body.etd ?? null},
        eta = ${body.eta ?? null},
        awb_bl_number = ${body.awbBlNumber ?? null},
        stock_confirmed = ${body.stockConfirmed ?? null},
        delivery_schedule = ${body.deliverySchedule ?? null},
        document_status = ${body.documentStatus ?? null},
        notes = ${body.notes ?? null}
      WHERE token = ${token}
    `);

    // Update order status
    await db.update(logisticOrdersTable)
      .set({ status: "Vendor Accepted" } as any)
      .where(eq(logisticOrdersTable.id, job.order_id));

    await db.execute(sql`
      UPDATE logistic_orders SET job_status = 'vendor_accepted' WHERE id = ${job.order_id}
    `);

    // Progress tracking
    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, job_order_id, status, notes, updated_by, is_public)
      SELECT ${job.order_id}, id, 'Vendor Accepted',
             ${"Vendor " + (job.vendor_name ?? "") + " menerima job order dan mengisi detail operasional."},
             'vendor', true
      FROM vendor_job_orders WHERE token = ${token}
    `);

    // Activity log
    await db.insert(orderUpdatesTable).values({
      orderId: job.order_id,
      actorType: "vendor",
      actorName: job.vendor_name,
      status: "Vendor Accepted",
      notes: `Vendor menerima job order.\n` +
        (body.driverName ? `Driver: ${body.driverName}\n` : "") +
        (body.vehiclePlate ? `Plat: ${body.vehiclePlate}\n` : "") +
        (body.pickupTime ? `Pickup: ${body.pickupTime}\n` : "") +
        (body.carrier ? `Carrier: ${body.carrier}\n` : "") +
        (body.awbBlNumber ? `AWB/BL: ${body.awbBlNumber}\n` : "") +
        (body.notes ? `Catatan: ${body.notes}` : ""),
      isPublic: true,
    });

    // Notify admin
    const adminWa = await getAdminWa();
    if (adminWa) {
      sendWhatsApp(adminWa,
        `✅ *Vendor Menerima Job Order*\n\n` +
        `Order: ${job.order_number}\nVendor: ${job.vendor_name ?? "—"}\nRute: ${job.origin} → ${job.destination}\n` +
        (body.driverName ? `Driver: ${body.driverName} | Plat: ${body.vehiclePlate ?? "—"}\n` : "") +
        (body.pickupTime ? `Pickup: ${body.pickupTime}\n` : "") +
        (body.carrier ? `Carrier: ${body.carrier}\n` : "") +
        (body.notes ? `Catatan: ${body.notes}` : "")
      ).catch(() => {});
    }

    return res.json({ ok: true, message: "Job berhasil diterima. Terima kasih!" });
  } catch (err) {
    logger.error({ err }, "accept-vendor-job error");
    return res.status(500).json({ error: "Gagal memproses penerimaan job" });
  }
});

/** POST /api/vendor-job/:token/reject */
vendorJobPublicRouter.post("/:token/reject", async (req: Request, res: Response) => {
  await ensureTables();
  const { token } = req.params as { token: string };
  const { reason } = req.body as { reason?: string };

  try {
    const result = await db.execute(
      sql`SELECT vjo.*, o.order_number, s.name as vendor_name
          FROM vendor_job_orders vjo
          LEFT JOIN logistic_orders o ON o.id = vjo.order_id
          LEFT JOIN suppliers s ON s.id = vjo.vendor_id
          WHERE vjo.token = ${token}`
    );
    if (!result.rows.length) return res.status(404).json({ error: "Link tidak ditemukan" });

    const job = result.rows[0] as any;
    if (job.status !== "pending") return res.status(409).json({ error: "Job sudah direspon sebelumnya" });

    await db.execute(sql`
      UPDATE vendor_job_orders SET status = 'rejected', rejected_at = NOW(), reject_reason = ${reason ?? null}
      WHERE token = ${token}
    `);

    await db.update(logisticOrdersTable)
      .set({ status: "Vendor Rejected" } as any)
      .where(eq(logisticOrdersTable.id, job.order_id));

    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, status, notes, updated_by, is_public)
      VALUES (${job.order_id}, 'Vendor Rejected', ${(reason ? "Alasan: " + reason : "Vendor menolak job order.")}, 'vendor', false)
    `);

    await db.insert(orderUpdatesTable).values({
      orderId: job.order_id,
      actorType: "vendor",
      actorName: job.vendor_name,
      status: "Vendor Rejected",
      notes: reason ? `Vendor menolak job. Alasan: ${reason}` : "Vendor menolak job order.",
      isPublic: false,
    });

    const adminWa = await getAdminWa();
    if (adminWa) {
      sendWhatsApp(adminWa,
        `❌ *Vendor Menolak Job Order*\n\nOrder: ${job.order_number}\nVendor: ${job.vendor_name ?? "—"}\n` +
        (reason ? `Alasan: ${reason}` : "")
      ).catch(() => {});
    }

    return res.json({ ok: true, message: "Job ditolak. Admin akan segera ditindaklanjuti." });
  } catch (err) {
    logger.error({ err }, "reject-vendor-job error");
    return res.status(500).json({ error: "Gagal memproses penolakan" });
  }
});

/** POST /api/vendor-job/:token/progress — vendor update progress */
vendorJobPublicRouter.post("/:token/progress", async (req: Request, res: Response) => {
  await ensureTables();
  const { token } = req.params as { token: string };
  const { status, notes } = req.body as { status: string; notes?: string };
  if (!status) return res.status(400).json({ error: "status wajib diisi" });

  try {
    const result = await db.execute(
      sql`SELECT vjo.*, o.order_number, o.phone, o.tracking_token, s.name as vendor_name
          FROM vendor_job_orders vjo
          LEFT JOIN logistic_orders o ON o.id = vjo.order_id
          LEFT JOIN suppliers s ON s.id = vjo.vendor_id
          WHERE vjo.token = ${token}`
    );
    if (!result.rows.length) return res.status(404).json({ error: "Link tidak ditemukan" });

    const job = result.rows[0] as any;
    if (job.status === "pending" || job.status === "rejected") {
      return res.status(409).json({ error: "Job belum diterima, tidak dapat update progress" });
    }

    // Map status ke job_status
    const newJobStatus = status.toLowerCase().replace(/\s+/g, "_");

    await db.execute(sql`
      UPDATE vendor_job_orders SET status = ${newJobStatus} WHERE token = ${token}
    `);

    await db.update(logisticOrdersTable)
      .set({ status } as any)
      .where(eq(logisticOrdersTable.id, job.order_id));

    await db.execute(sql`
      UPDATE logistic_orders SET job_status = ${newJobStatus} WHERE id = ${job.order_id}
    `);

    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, job_order_id, status, notes, updated_by, is_public)
      SELECT ${job.order_id}, id, ${status}, ${notes ?? null}, 'vendor', true
      FROM vendor_job_orders WHERE token = ${token}
    `);

    await db.insert(orderUpdatesTable).values({
      orderId: job.order_id,
      actorType: "vendor",
      actorName: job.vendor_name,
      status,
      notes: notes ?? null,
      isPublic: true,
    });

    // Notify admin
    const adminWa = await getAdminWa();
    if (adminWa) {
      sendWhatsApp(adminWa,
        `📍 *Update Progress Order*\n\nOrder: ${job.order_number}\nStatus: ${status}\n` +
        (notes ? `Catatan: ${notes}` : "")
      ).catch(() => {});
    }

    // Notify customer via WA
    const customerPhone = job.phone as string | null;
    if (customerPhone) {
      const trackingUrl = job.tracking_token
        ? `${baseUrl()}/order-track/${job.tracking_token}`
        : `${baseUrl()}/order-track`;
      sendWhatsApp(
        customerPhone,
        buildCustomerProgressWaMessage(job.order_number, status, notes, trackingUrl)
      ).catch((e) => logger.warn({ e, phone: customerPhone }, "customer progress WA failed"));
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "vendor-progress error");
    return res.status(500).json({ error: "Gagal update progress" });
  }
});

/** POST /api/vendor-job/:token/pod — vendor upload POD/invoice/foto */
vendorJobPublicRouter.post("/:token/pod", upload.array("files", 10), async (req: Request, res: Response) => {
  await ensureTables();
  const { token } = req.params as { token: string };
  const { completionNotes } = req.body as { completionNotes?: string };
  const files = (req.files ?? []) as Express.Multer.File[];

  try {
    const result = await db.execute(
      sql`SELECT vjo.*, o.order_number, o.id as order_id_num, o.phone, o.tracking_token, s.name as vendor_name
          FROM vendor_job_orders vjo
          LEFT JOIN logistic_orders o ON o.id = vjo.order_id
          LEFT JOIN suppliers s ON s.id = vjo.vendor_id
          WHERE vjo.token = ${token}`
    );
    if (!result.rows.length) return res.status(404).json({ error: "Link tidak ditemukan" });

    const job = result.rows[0] as any;

    // Upload files ke object storage
    const uploadedUrls: { name: string; url: string; type: string }[] = [];
    for (const file of files) {
      const key = `private/pod/${job.order_id}/${Date.now()}_${file.originalname}`;
      try {
        const uploadResult = await objStore.uploadFromBytes(key, file.buffer, {
          contentType: file.mimetype,
        });
        if (uploadResult.ok) {
          uploadedUrls.push({
            name: file.originalname,
            url: key,
            type: file.mimetype,
          });
        }
      } catch (e) {
        logger.warn({ e, key }, "POD upload to objstore failed");
      }
    }

    // Merge dengan pod_files yang ada
    const existingFiles = job.pod_files ?? [];
    const allFiles = [...existingFiles, ...uploadedUrls];

    await db.execute(sql`
      UPDATE vendor_job_orders
      SET pod_files = ${JSON.stringify(allFiles)}::jsonb,
          completion_notes = ${completionNotes ?? null},
          status = 'completed',
          completed_at = NOW()
      WHERE token = ${token}
    `);

    await db.update(logisticOrdersTable)
      .set({ status: "POD Uploaded" } as any)
      .where(eq(logisticOrdersTable.id, job.order_id));

    await db.execute(sql`
      UPDATE logistic_orders SET job_status = 'pod_uploaded' WHERE id = ${job.order_id}
    `);

    await db.execute(sql`
      INSERT INTO order_tracking_progress (order_id, status, notes, updated_by, is_public)
      VALUES (${job.order_id}, 'POD Uploaded',
              ${"Vendor mengunggah " + files.length + " dokumen/foto. Menunggu konfirmasi admin."},
              'vendor', true)
    `);

    await db.insert(orderUpdatesTable).values({
      orderId: job.order_id,
      actorType: "vendor",
      actorName: job.vendor_name,
      status: "POD Uploaded",
      notes: `Vendor mengunggah ${files.length} file POD/dokumen.${completionNotes ? "\nCatatan: " + completionNotes : ""}`,
      isPublic: true,
    });

    const adminWa = await getAdminWa();
    if (adminWa) {
      sendWhatsApp(adminWa,
        `📎 *Vendor Upload POD*\n\nOrder: ${job.order_number}\nVendor: ${job.vendor_name ?? "—"}\n` +
        `File diunggah: ${files.length}\n` +
        (completionNotes ? `Catatan: ${completionNotes}` : "")
      ).catch(() => {});
    }

    // Notify customer via WA
    const customerPhonePod = job.phone as string | null;
    if (customerPhonePod) {
      const trackingUrlPod = job.tracking_token
        ? `${baseUrl()}/order-track/${job.tracking_token}`
        : `${baseUrl()}/order-track`;
      sendWhatsApp(
        customerPhonePod,
        buildCustomerPodWaMessage(job.order_number, job.vendor_name ?? "Vendor", completionNotes, trackingUrlPod)
      ).catch((e) => logger.warn({ e, phone: customerPhonePod }, "customer POD WA failed"));
    }

    return res.json({ ok: true, uploadedFiles: uploadedUrls.length, message: "POD berhasil diunggah. Menunggu konfirmasi admin." });
  } catch (err) {
    logger.error({ err }, "pod-upload error");
    return res.status(500).json({ error: "Gagal mengunggah POD" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Customer Tracking Router
// ─────────────────────────────────────────────────────────────────────────────

export const orderTrackingPublicRouter = Router();

/** GET /api/order-track/:trackToken */
orderTrackingPublicRouter.get("/:trackToken", async (req: Request, res: Response) => {
  await ensureTables();
  const { trackToken } = req.params as { trackToken: string };

  try {
    const orderResult = await db.execute(
      sql`SELECT o.*, s.name as vendor_name
          FROM logistic_orders o
          LEFT JOIN suppliers s ON s.id = o.approved_vendor_id
          WHERE o.tracking_token = ${trackToken}`
    );
    if (!orderResult.rows.length) {
      return res.status(404).json({ error: "Link tracking tidak ditemukan" });
    }

    const order = orderResult.rows[0] as any;

    // Progress
    const progressResult = await db.execute(
      sql`SELECT * FROM order_tracking_progress
          WHERE order_id = ${order.id} AND is_public = true
          ORDER BY created_at ASC`
    );

    // Job order (operational details, only show if vendor accepted)
    const jobResult = await db.execute(
      sql`SELECT vjo.*, s.name as vendor_name
          FROM vendor_job_orders vjo
          LEFT JOIN suppliers s ON s.id = vjo.vendor_id
          WHERE vjo.order_id = ${order.id}
          ORDER BY vjo.created_at DESC LIMIT 1`
    );
    const jobOrder = jobResult.rows[0] as any ?? null;

    const showOperational = jobOrder && ["accepted", "in_progress", "pickup_scheduled", "completed"].includes(jobOrder.status);

    return res.json({
      order: {
        orderNumber: order.order_number,
        shipmentType: order.shipment_type,
        origin: order.origin,
        destination: order.destination,
        commodity: order.commodity,
        grossWeight: order.gross_weight,
        status: order.status,
        jobStatus: order.job_status,
        customerName: order.customer_name,
        createdAt: order.created_at,
        etd: order.etd,
        eta: order.eta,
      },
      vendor: order.vendor_name ? { name: order.vendor_name } : null,
      progress: progressResult.rows,
      operational: showOperational ? {
        driverName: jobOrder.driver_name,
        driverPhone: jobOrder.driver_phone,
        vehiclePlate: jobOrder.vehicle_plate,
        vehicleType: jobOrder.vehicle_type,
        pickupTime: jobOrder.pickup_time,
        carrier: jobOrder.carrier,
        etd: jobOrder.etd,
        eta: jobOrder.eta,
        awbBlNumber: jobOrder.awb_bl_number,
        schedule: jobOrder.schedule,
      } : null,
    });
  } catch (err) {
    logger.error({ err }, "order-tracking error");
    return res.status(500).json({ error: "Gagal memuat data tracking" });
  }
});
