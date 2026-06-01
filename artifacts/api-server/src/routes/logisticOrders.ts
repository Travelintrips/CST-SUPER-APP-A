import { Router, Request, Response } from "express";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  logisticOrdersTable,
  logisticOrderItemsTable,
  portalContentTable,
  suppliersTable,
  driverJobsTable,
  driverJobLogsTable,
  driverPhotosTable,
  logisticOrderRfqsTable,
  driverLocationsTable,
  orderUpdatesTable,
  vendorResponsesTable,
  podOcrResultsTable,
  rfqVendorLinksTable,
  freightShipmentsTable,
} from "@workspace/db";
import { deleteFromSupabase } from "../lib/supabaseStorage.js";
import { eq, ilike, and, gte, lte, or, sql, desc, inArray, isNotNull } from "drizzle-orm";
import { salesDocumentsTable } from "@workspace/db";
import { requireClerkUser, requireRole } from "../lib/requireAdmin.js";
import { calcTax, calcGrandTotal } from "../lib/taxHelper.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { requirePortalAdmin } from "../lib/supabaseAuth.js";
import {
  sendLogisticOrderNotification,
  sendVendorOrderStatusChangeNotification,
  sendLogisticOrderStatusCustomerNotification,
  sendLogisticOperationalStatusNotification,
} from "../lib/orderNotification";
import { generateShortLink } from "../lib/shortLink.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logActivity } from "../lib/activityLog.js";
import { logOrderStatusChange, logOrderAudit } from "../lib/auditTrail.js";
// [FLOW BARU] autoCreateRfqAndNotifyVendors dinonaktifkan — vendor tidak boleh dihubungi langsung saat order dibuat.
// Admin harus review dulu via /bizportal/logistics/rfq sebelum blast ke vendor.
// import { autoCreateRfqAndNotifyVendors } from "./logisticRfq";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { saveAndBroadcast } from "../lib/notificationStore";
import { broadcastToPortal } from "../lib/sseManager.js";
import { sendPushToOrder } from "../lib/webPush.js";
import { updateOrderProgress, getOrderProgressEvents, deleteOrderProgress, PROGRESS_STEPS, type StepKey } from "../lib/orderProgress.js";
import {
  CreateLogisticOrderBody,
  ListLogisticOrdersQueryParams,
  GetLogisticOrderByNumberParams,
  GetLogisticOrderParams,
  UpdateLogisticOrderStatusParams,
  UpdateLogisticOrderStatusBody,
} from "@workspace/api-zod";
import {
  STATUS_LABEL_ID,
  CUSTOMER_WA_MESSAGES,
  VENDOR_WA_NOTES,
  VENDOR_NOTIFY_STATUS_SET,
  STATUS_NORMALIZATION_SQL,
} from "../lib/logisticStatusConstants.js";
import {
  transitionLogisticOrderStatus,
  getAllowedTransitions,
} from "../lib/services/logisticOrderStatusService.js";
import { wasRecentlyNotified } from "../lib/notificationLog.js";
import { getAdminWa } from "../lib/adminWa.js";

export const logisticOrdersRouter = Router();

// [C4-FIX] IP-based rate limit for public order creation: max 10 orders per IP per hour
const _publicOrderRateMap = new Map<string, { count: number; resetAt: number }>();
function _checkPublicOrderRate(ip: string): boolean {
  const now = Date.now();
  let entry = _publicOrderRateMap.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60 * 60 * 1000 }; // 1-hour window
  }
  const cap = process.env.NODE_ENV === "production" ? 10 : 1000;
  if (entry.count >= cap) return false;
  entry.count++;
  _publicOrderRateMap.set(ip, entry);
  return true;
}

function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `LOG-${y}${m}${d}-${rand}`;
}

function toOrder(row: typeof logisticOrdersTable.$inferSelect, approvedVendorName?: string | null) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    companyId: row.companyId ?? null,
    companyName: row.companyName,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone,
    orderType: (row as any).orderType ?? "shipment",
    shipmentType: row.shipmentType,
    origin: row.origin,
    destination: row.destination,
    commodity: row.commodity ?? null,
    cargoDescription: row.cargoDescription ?? null,
    grossWeight: row.grossWeight ? parseFloat(row.grossWeight) : null,
    volumeCbm: row.volumeCbm ? parseFloat(row.volumeCbm) : null,
    jumlahKoli: row.jumlahKoli ?? null,
    requiredDate: row.requiredDate ?? null,
    notes: row.notes ?? null,
    paymentType: row.paymentType ?? null,
    paymentMethod: row.paymentMethod ?? null,
    namaPenerima: row.namaPenerima ?? null,
    nomorPenerima: row.nomorPenerima ?? null,
    jamOrder: row.jamOrder ?? null,
    source: row.source ?? "manual",

    subtotal: parseFloat(row.subtotal),
    tax: parseFloat(row.tax),
    grandTotal: parseFloat(row.grandTotal),
    status: row.status,
    approvedQuoteId: row.approvedQuoteId ?? null,
    adminApprovalStatus: row.adminApprovalStatus ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    approvedVendorId: row.approvedVendorId ?? null,
    approvedVendorName: approvedVendorName ?? null,
    finalSellingPrice: row.finalSellingPrice ? parseFloat(row.finalSellingPrice) : null,
    quotationSentAt: row.quotationSentAt?.toISOString() ?? null,
    version: (row as any).version ?? 1,
    createdAt: row.createdAt.toISOString(),
    updatedAt: ((row as any).updatedAt ?? row.createdAt).toISOString(),
  };
}

function toItem(row: typeof logisticOrderItemsTable.$inferSelect) {
  return {
    id: row.id,
    orderId: row.orderId,
    category: row.category,
    serviceName: row.serviceName,
    calculatorType: row.calculatorType,
    inputData: row.inputData,
    calculationResult: row.calculationResult,
    subtotal: parseFloat(row.subtotal),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Public-safe item projection — strips financial and raw-input data */
function toPublicItem(row: typeof logisticOrderItemsTable.$inferSelect) {
  return {
    id: row.id,
    category: row.category,
    serviceName: row.serviceName,
    calculatorType: row.calculatorType,
    createdAt: row.createdAt.toISOString(),
  };
}

const TRUCKING_RATES_KEY = "logistic_trucking_rates";

const DEFAULT_TRUCKING_RATES: Record<string, { ratePerKm: number; loadingFee: number }> = {
  CDE:      { ratePerKm: 5000,  loadingFee: 500000 },
  CDD:      { ratePerKm: 7000,  loadingFee: 700000 },
  Fuso:     { ratePerKm: 10000, loadingFee: 1000000 },
  Wingbox:  { ratePerKm: 12000, loadingFee: 1200000 },
  Trailer:  { ratePerKm: 15000, loadingFee: 1500000 },
};

async function getTruckingRates() {
  const [row] = await db
    .select()
    .from(portalContentTable)
    .where(eq(portalContentTable.key, TRUCKING_RATES_KEY));
  if (!row) return DEFAULT_TRUCKING_RATES;
  try {
    return JSON.parse(row.value) as typeof DEFAULT_TRUCKING_RATES;
  } catch {
    return DEFAULT_TRUCKING_RATES;
  }
}

// ─── Boot migration: ensure updated_at column exists + normalize legacy statuses
db.execute(sql.raw(`
  ALTER TABLE logistic_orders ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  UPDATE logistic_orders SET updated_at = created_at WHERE updated_at IS NULL;
  ${STATUS_NORMALIZATION_SQL}
`)).catch((e: unknown) => console.warn("[logistic_orders] boot migration warn:", e));

// ─── PUBLIC ROUTES (no auth required) ────────────────────────────────────────

// POST /api/logistic/orders — create order (public customer portal endpoint)
logisticOrdersRouter.post("/", async (req: Request, res: Response) => {
  // [C4-FIX] IP-based rate limit: prevent bot flooding
  const clientIp = ((req.ip ?? req.socket?.remoteAddress) || "unknown").replace(/^::ffff:/, "");
  if (!_checkPublicOrderRate(clientIp)) {
    return res.status(429).json({ message: "Terlalu banyak permintaan. Coba lagi dalam 1 jam." });
  }

  const parsed = CreateLogisticOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Data tidak valid", errors: parsed.error.errors });
  }
  const body = parsed.data;

  // Server-side subtotal validation: jumlahkan subtotal per item, jangan percaya nilai agregat dari client
  const computedSubtotal = body.items.reduce((sum, item) => sum + Number(item.subtotal ?? 0), 0);
  const clientSubtotal = Number(body.subtotal);
  if (Math.abs(computedSubtotal - clientSubtotal) > 1) {
    req.log.warn(
      { clientSubtotal, computedSubtotal, diff: clientSubtotal - computedSubtotal, email: body.email },
      "AUDIT: frontend subtotal mismatch — menggunakan nilai server-computed",
    );
  }
  const verifiedSubtotal = computedSubtotal;

  // Anti-duplicate: tolak jika email yang sama sudah membuat order dalam 60 detik terakhir
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
  const [recentDuplicate] = await db
    .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber })
    .from(logisticOrdersTable)
    .where(and(
      eq(logisticOrdersTable.email, body.email),
      gte(logisticOrdersTable.createdAt, oneMinuteAgo),
    ))
    .limit(1);
  if (recentDuplicate) {
    return res.status(429).json({
      message: "Pesanan sudah dikirim baru-baru ini. Mohon tunggu sebentar atau cek email konfirmasi Anda.",
      orderNumber: recentDuplicate.orderNumber,
    });
  }

  const orderNumber = generateOrderNumber();

  const [order] = await db
    .insert(logisticOrdersTable)
    .values({
      orderNumber,
      companyName: body.companyName,
      customerName: body.customerName,
      email: body.email,
      phone: body.phone,
      orderType: body.orderType ?? "shipment",
      shipmentType: body.shipmentType ?? "",
      origin: body.origin ?? "",
      destination: body.destination ?? "",
      commodity: body.commodity ?? null,
      cargoDescription: body.cargoDescription ?? null,
      grossWeight: body.grossWeight != null ? String(body.grossWeight) : null,
      volumeCbm: body.volumeCbm != null ? String(body.volumeCbm) : null,
      jumlahKoli: body.jumlahKoli ?? null,
      requiredDate: body.requiredDate ?? null,
      notes: body.notes ?? null,
      paymentType: body.paymentType ?? null,
      paymentMethod: body.paymentMethod ?? null,
      namaPenerima: body.namaPenerima ?? null,
      nomorPenerima: body.nomorPenerima ?? null,
      jamOrder: body.jamOrder ?? null,
      // [MULTI-MODE] transport mode fields
      transportMode: body.transportMode ?? null,
      originDistrict: body.originDistrict ?? null,
      destDistrict: body.destDistrict ?? null,
      pickupDate: body.pickupDate ?? null,
      pickupTime: body.pickupTime ?? null,
      truckType: body.truckType ?? null,
      originPort: body.originPort ?? null,
      destPort: body.destPort ?? null,
      weightKg: body.weightKg != null ? String(body.weightKg) : null,
      incoterm: body.incoterm ?? null,
      etd: body.etd ? new Date(body.etd) : null,
      eta: body.eta ? new Date(body.eta) : null,
      source: "portal",
      // Exclusive PPN: subtotal = DPP (server-verified), tax = DPP × 11%, grandTotal = DPP + tax
      subtotal: String(verifiedSubtotal),
      tax: String(calcTax(verifiedSubtotal)),
      grandTotal: String(calcGrandTotal(verifiedSubtotal)),
      status: "New Order",
      publicRfqToken: randomBytes(16).toString("hex"),
    })
    .returning();

  // Auto-generate tracking token saat order dibuat agar customer langsung bisa akses tracking
  const trackingToken = randomBytes(24).toString("hex");
  await db.execute(sql`UPDATE logistic_orders SET tracking_token = ${trackingToken} WHERE id = ${order.id}`);
  const domain = getPreferredDomain();
  const trackUrl = domain
    ? `https://${domain}/order-track/${trackingToken}`
    : `/order-track/${trackingToken}`;
  generateShortLink(trackUrl, {
    context: "order_tracking",
    refType: "order",
    refId: orderNumber,
  }).catch((err: unknown) => req.log.warn({ err }, "shortLink: tracking link generation failed"));

  const itemValues = body.items.map((item) => ({
    orderId: order.id,
    category: item.category,
    serviceName: item.serviceName,
    calculatorType: item.calculatorType,
    inputData: item.inputData as Record<string, unknown>,
    calculationResult: item.calculationResult as Record<string, unknown>,
    subtotal: String(item.subtotal),
  }));

  const items =
    itemValues.length > 0
      ? await db.insert(logisticOrderItemsTable).values(itemValues).returning()
      : [];

  const isProductOrder = (body.orderType ?? "shipment") === "product";
  const serviceList = !isProductOrder
    ? body.items.map((i) => `• ${i.serviceName}`).join("\n")
    : "";
  const orderItems = body.items.map((i) => ({
    name: i.serviceName,
    qty: null as number | null,
    subtotal: i.subtotal != null ? Number(i.subtotal) : null,
  }));

  const vehicleType =
    (body.items.find((i) => i.calculatorType === "trucking")
      ?.inputData as Record<string, unknown> | undefined)
      ?.vehicleType as string ?? null;
sendLogisticOrderNotification({
    id: order.id,
    orderNumber,
    customerName: body.customerName,
    companyName: body.companyName,
    email: body.email,
    phone: body.phone,
    orderType: body.orderType ?? "shipment",
    shipmentType: body.shipmentType ?? "",
    origin: body.origin ?? "",
    destination: body.destination ?? "",
    commodity: body.commodity ?? null,
    cargoDescription: body.cargoDescription ?? null,
    grossWeight: !isProductOrder && body.grossWeight != null ? Number(body.grossWeight) : null,
    volumeCbm: !isProductOrder && body.volumeCbm != null ? Number(body.volumeCbm) : null,
    jumlahKoli: !isProductOrder && body.jumlahKoli != null ? Number(body.jumlahKoli) : null,
    subtotal: body.subtotal != null ? Number(body.subtotal) : null,
    tax: body.tax != null ? Number(body.tax) : null,
    grandTotal: Number(body.grandTotal),
    serviceList,
    orderItems,
    requiredDate: body.requiredDate ?? null,
    notes: body.notes ?? null,
    jamOrder: body.jamOrder ?? null,
    vehicleType,
    createdAt: order.createdAt,
    publicRfqToken: order.publicRfqToken ?? null,
    trackingToken,
  }).catch((err: unknown) => {
    req.log.error({ err }, "sendLogisticOrderNotification failed");
  });

  // Progress bar: ORDER_RECEIVED — set immediately when order is created
  updateOrderProgress(order.id, "ORDER_RECEIVED", "system", body.customerName, "Order baru dibuat oleh customer").catch(() => {});

  // [FLOW BARU] Auto-blast ke vendor DINONAKTIFKAN.
  // Order masuk → status admin_review → Admin review → Admin blast ke vendor.
  // RFQ dibuat manual oleh admin via POST /api/logistic/rfq/create-from-order/:orderId

  saveAndBroadcast("new_logistic_order", {
    type: "logistic",
    orderId: order.id,
    orderNumber,
    customerName: body.customerName,
    companyName: body.companyName ?? null,
    orderType: body.orderType ?? "shipment",
    shipmentType: body.shipmentType ?? "",
    origin: body.origin ?? "",
    destination: body.destination ?? "",
    grandTotal: Number(body.grandTotal),
    createdAt: order.createdAt.toISOString(),
  }).catch(() => {});

  // Broadcast ke Customer Portal agar logistic-admin page auto-refresh
  broadcastToPortal("new_logistic_order", {
    orderId: order.id,
    orderNumber,
    customerName: body.customerName,
    companyName: body.companyName ?? null,
    shipmentType: body.shipmentType ?? "",
    origin: body.origin ?? "",
    destination: body.destination ?? "",
    createdAt: order.createdAt.toISOString(),
  });

  logActivity({
    orderId: order.id,
    actorType: "customer",
    actorName: body.customerName,
    action: "order_created",
    description: `Order ${orderNumber} dibuat oleh ${body.customerName} (${body.companyName ?? "-"}) — ${body.shipmentType} ${body.origin}→${body.destination}`,
    newValue: { orderNumber, grandTotal: body.grandTotal, shipmentType: body.shipmentType },
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  // Audit trail: order_status_history + order_audit_logs
  logOrderStatusChange({
    orderId: order.id,
    orderNumber,
    oldStatus: null,
    newStatus: "New Order",
    changedByType: "customer",
    changedByName: body.customerName,
    changedByIp: req.ip ?? null,
    notes: "Order dibuat",
    source: "POST /logistic/orders",
  }).catch(() => {});
  logOrderAudit({
    orderId: order.id,
    orderNumber,
    actorType: "customer",
    actorName: body.customerName,
    action: "order_created",
    description: `Order ${orderNumber} dibuat oleh ${body.customerName} (${body.companyName ?? "-"}) — ${body.shipmentType} ${body.origin ?? ""}→${body.destination ?? ""}`,
    newValue: { status: "New Order", grandTotal: body.grandTotal, shipmentType: body.shipmentType },
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  return res.status(201).json({
    ...toOrder(order),
    items: items.map(toItem),
  });
});

/** Public-safe order projection — strips PII, payment, financial, and internal approval fields */
function toPublicOrder(row: typeof logisticOrdersTable.$inferSelect) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    orderType: (row as any).orderType ?? "shipment",
    shipmentType: row.shipmentType,
    origin: row.origin,
    destination: row.destination,
    grossWeight: row.grossWeight ? parseFloat(row.grossWeight) : null,
    volumeCbm: row.volumeCbm ? parseFloat(row.volumeCbm) : null,
    jumlahKoli: row.jumlahKoli ?? null,
    requiredDate: row.requiredDate ?? null,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

/** In-memory rate limiter for public order-number lookup endpoints.
 *  Limit: 5 requests / minute / IP (tightened from 20 to reduce enumeration risk). */
const publicLookupHits = new Map<string, { count: number; resetAt: number }>();
function publicLookupRateLimit(req: Request, res: Response, next: () => void) {
  const ip = (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ?? req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  const window = 60_000;
  const limit = 5;
  const entry = publicLookupHits.get(ip);
  if (!entry || now > entry.resetAt) {
    publicLookupHits.set(ip, { count: 1, resetAt: now + window });
    return next();
  }
  if (entry.count >= limit) {
    res.status(429).json({ error: "Terlalu banyak permintaan. Coba lagi sebentar." });
    return;
  }
  entry.count += 1;
  next();
}

// GET /api/logistic/orders/by-number/:orderNumber — minimal public lookup (no PII fields)
logisticOrdersRouter.get(
  "/by-number/:orderNumber",
  publicLookupRateLimit,
  async (req: Request, res: Response) => {
    const parsed = GetLogisticOrderByNumberParams.safeParse(req.params);
    if (!parsed.success) return res.status(400).json({ message: "Parameter tidak valid" });
    const { orderNumber } = parsed.data;

    const [order] = await db
      .select()
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.orderNumber, orderNumber));

    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    const items = await db
      .select()
      .from(logisticOrderItemsTable)
      .where(eq(logisticOrderItemsTable.orderId, order.id));

    // Strip origin/destination to prevent PII enumeration via guessable order numbers.
    // Full tracking detail (incl. route) is available on /track/:orderNumber for the owner.
    const { origin: _o, destination: _d, ...safeOrder } = toPublicOrder(order);
    return res.json({ ...safeOrder, items: items.map(toPublicItem) });
  }
);

// GET /api/logistic/orders/track/:orderNumber — tracking data with driver job (public)
logisticOrdersRouter.get(
  "/track/:orderNumber",
  publicLookupRateLimit,
  async (req: Request, res: Response) => {
    const orderNumber = String(req.params.orderNumber ?? "").toUpperCase().trim();
    if (!orderNumber) return res.status(400).json({ message: "Nomor order tidak valid" });

    const [order] = await db
      .select()
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.orderNumber, orderNumber));

    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    // Run all independent queries in parallel — eliminates N+1 sequential awaits
    const [items, [driverJob], [latestRfq], orderUpdates, progressEvents] = await Promise.all([
      db.select().from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, order.id)),
      db.select().from(driverJobsTable)
        .where(eq(driverJobsTable.logisticOrderId, order.id))
        .orderBy(desc(driverJobsTable.assignedAt))
        .limit(1),
      db.select().from(logisticOrderRfqsTable)
        .where(eq(logisticOrderRfqsTable.orderId, order.id))
        .orderBy(desc(logisticOrderRfqsTable.createdAt))
        .limit(1),
      db.select().from(orderUpdatesTable)
        .where(and(eq(orderUpdatesTable.orderId, order.id), eq(orderUpdatesTable.isPublic, true)))
        .orderBy(desc(orderUpdatesTable.createdAt))
        .limit(50),
      getOrderProgressEvents(order.id),
    ]);

    let driverJobData = null;
    if (driverJob) {
      // Run driver logs + photos in parallel once we know the job ID
      const [logs, photos] = await Promise.all([
        db.select().from(driverJobLogsTable)
          .where(eq(driverJobLogsTable.driverJobId, driverJob.id))
          .orderBy(desc(driverJobLogsTable.timestamp)),
        db.select().from(driverPhotosTable)
          .where(eq(driverPhotosTable.driverJobId, driverJob.id))
          .orderBy(desc(driverPhotosTable.takenAt)),
      ]);

      driverJobData = {
        id: driverJob.id,
        jobNumber: driverJob.jobNumber,
        status: driverJob.status,
        vehicleType: driverJob.vehicleType ?? null,
        pickupDateTime: driverJob.pickupDateTime?.toISOString() ?? null,
        deliveryDateTime: driverJob.deliveryDateTime?.toISOString() ?? null,
        cargoDescription: driverJob.cargoDescription ?? null,
        weight: driverJob.weight ?? null,
        distance: driverJob.distance ?? null,
        assignedAt: driverJob.assignedAt.toISOString(),
        completedAt: driverJob.completedAt?.toISOString() ?? null,
        logs: logs.map((l) => ({
          id: l.id,
          status: l.status,
          timestamp: l.timestamp.toISOString(),
        })),
      };
    }

    // quotedPrice = customer-facing sell price (NOT vendor cost/margin) — safe to show order owner
    const rfqQuote = latestRfq ? {
      rfqId: latestRfq.id,
      rfqStatus: latestRfq.status,
      quotedPrice: latestRfq.quotedPrice ? parseFloat(latestRfq.quotedPrice) : null,
      quotedAt: latestRfq.quotedAt?.toISOString() ?? null,
      quoteNotes: (latestRfq as any).quoteNotes ?? null,
      customerResponseNotes: (latestRfq as any).customerResponseNotes ?? null,
      customerRespondedAt: (latestRfq as any).customerRespondedAt
        ? new Date((latestRfq as any).customerRespondedAt).toISOString() : null,
    } : null;

    const updatesData = orderUpdates.map((u) => ({
      id: u.id,
      status: u.status ?? null,
      notes: u.notes ?? null,
      actorType: u.actorType,
      actorName: u.actorName ?? null,
      createdAt: u.createdAt.toISOString(),
    }));

    const STEP_LABEL_MAP: Record<string, string> = {
      ORDER_RECEIVED:    "Order Diterima",
      ADMIN_REVIEW:      "Ditinjau Admin",
      RFQ_SENT:          "RFQ ke Vendor",
      QUOTE_RECEIVED:    "Penawaran Masuk",
      CUSTOMER_APPROVAL: "Menunggu Persetujuan",
      VENDOR_CONFIRMED:  "Vendor Dikonfirmasi",
      IN_PROGRESS:       "Sedang Diproses",
      PICKUP:            "Penjemputan",
      IN_TRANSIT:        "Dalam Perjalanan",
      ARRIVED:           "Tiba di Tujuan",
      DELIVERED:         "Terkirim",
      POD_UPLOADED:      "Bukti Pengiriman",
      INVOICE_ISSUED:    "Invoice Diterbitkan",
      PAYMENT_RECEIVED:  "Pembayaran Diterima",
      COMPLETED:         "Selesai",
    };

    const progressEventsMapped = (progressEvents as any[]).map((ev) => {
      const lat = ev.gps_latitude != null ? Number(ev.gps_latitude) : null;
      const lng = ev.gps_longitude != null ? Number(ev.gps_longitude) : null;
      const hasGps = lat != null && Number.isFinite(lat) && lng != null && Number.isFinite(lng);
      return {
        id:              ev.id,
        stepKey:         ev.step_key,
        stepLabel:       STEP_LABEL_MAP[String(ev.step_key)] ?? String(ev.step_key),
        source:          ev.source,
        actorName:       ev.actor_name ?? null,
        notes:           ev.notes ?? null,
        gpsLatitude:     hasGps ? lat : null,
        gpsLongitude:    hasGps ? lng : null,
        deviceTimestamp: ev.device_timestamp ? new Date(ev.device_timestamp).toISOString() : null,
        mapUrl:          ev.map_url ?? (hasGps ? `https://www.google.com/maps?q=${lat},${lng}` : null),
        streetViewUrl:   ev.street_view_url ?? null,
        photoUrl:        ev.photo_url ?? (ev.metadata as any)?.photoUrl ?? null,
        createdAt:       ev.created_at ? new Date(ev.created_at).toISOString() : new Date().toISOString(),
      };
    });

    req.log?.info({
      orderId: order.id,
      orderNumber: order.orderNumber,
      progressEventsCount: progressEventsMapped.length,
    }, "tracking: progressEvents debug");

    return res.json({
      ...toPublicOrder(order),
      customerName: order.customerName,
      grandTotal: order.grandTotal ? parseFloat(order.grandTotal) : null,
      subtotal: order.subtotal ? parseFloat(order.subtotal) : null,
      tax: order.tax ? parseFloat(order.tax) : null,
      items: items.map(toPublicItem),
      driverJob: driverJobData,
      rfqQuote,
      orderUpdates: updatesData,
      progressEvents: progressEventsMapped,
    });
  }
);

// GET /api/logistic/orders/trucking-rates — [H2-FIX] internal pricing, requires staff session
// Note: customer portal uses /api/portal/trucking-rates (separate public endpoint)
logisticOrdersRouter.get("/trucking-rates", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rates = await getTruckingRates();
  return res.json(rates);
});

// GET /api/logistic/orders/vendors — [H2-FIX] admin, owner & logistics staff only
logisticOrdersRouter.get("/vendors", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  if (!(await requireRole(req, res, ["admin", "owner", "logistics"]))) return;
  const limit = Math.min(Number(req.query["limit"] ?? 500), 1000);
  const offset = Math.max(Number(req.query["offset"] ?? 0), 0);
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.sortOrder).limit(limit).offset(offset);
  return res.json(rows.map((v) => ({ ...v, fee: Number(v.fee ?? 0), email: v.contactEmail })));
});

// ─── AUTH WALL: all routes below require a valid session ─────────────────────

logisticOrdersRouter.use(async (req, res, next) => {
  if (!(await requireClerkUser(req, res))) return;
  next();
});

// ─── STAFF-ONLY ROUTES ────────────────────────────────────────────────────────

// GET /api/logistic/orders — list orders (admin)
logisticOrdersRouter.get("/", async (req: Request, res: Response) => {
  const parsed = ListLogisticOrdersQueryParams.safeParse(req.query);
  const q = parsed.success ? parsed.data : {};

  // Pagination — default 100 per page, max 500
  const limit = Math.min(Number(req.query["limit"] ?? 100), 500);
  const offset = Math.max(Number(req.query["offset"] ?? 0), 0);

  const rawCompany = req.query["company"] ?? req.query["companyId"];
  const isConsolidated = rawCompany === "0" || rawCompany === "all" || rawCompany === undefined;
  const companyId = isConsolidated ? null : resolveCompanyId(req);

  // companyId=0 or "all" = consolidated view (all companies), otherwise filter by specific company
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const conditions: any[] = [];
  if (companyId !== null && companyId > 0) conditions.push(eq(logisticOrdersTable.companyId, companyId));
  if (q.status) conditions.push(eq(logisticOrdersTable.status, q.status));
  if (q.shipmentType) conditions.push(eq(logisticOrdersTable.shipmentType, q.shipmentType));
  if (q.search) {
    conditions.push(
      or(
        ilike(logisticOrdersTable.customerName, `%${q.search}%`),
        ilike(logisticOrdersTable.companyName, `%${q.search}%`),
        ilike(logisticOrdersTable.orderNumber, `%${q.search}%`)
      )!
    );
  }
  if (q.dateFrom) conditions.push(gte(logisticOrdersTable.createdAt, new Date(q.dateFrom)));
  if (q.dateTo) conditions.push(lte(logisticOrdersTable.createdAt, new Date(q.dateTo)));

  const rows =
    conditions.length > 0
      ? await db
          .select()
          .from(logisticOrdersTable)
          .where(and(...conditions))
          .orderBy(sql`${logisticOrdersTable.createdAt} DESC`)
          .limit(limit)
          .offset(offset)
      : await db
          .select()
          .from(logisticOrdersTable)
          .orderBy(sql`${logisticOrdersTable.createdAt} DESC`)
          .limit(limit)
          .offset(offset);

  // Attach linked sales doc info for each order
  const orderIds = rows.map((r) => r.id);
  const linkedDocMap = new Map<number, { id: number; docNumber: string }>();
  if (orderIds.length > 0) {
    const linkedDocs = await db
      .select({ logisticOrderId: salesDocumentsTable.logisticOrderId, id: salesDocumentsTable.id, docNumber: salesDocumentsTable.docNumber })
      .from(salesDocumentsTable)
      .where(and(isNotNull(salesDocumentsTable.logisticOrderId), inArray(salesDocumentsTable.logisticOrderId, orderIds)));
    for (const d of linkedDocs) {
      if (d.logisticOrderId != null) linkedDocMap.set(d.logisticOrderId, { id: d.id, docNumber: d.docNumber });
    }
  }

  // Attach latest RFQ info (including freight_shipment_id via raw SQL)
  const rfqMap = new Map<number, {
    rfqId: number; rfqNumber: string; rfqStatus: string;
    freightShipmentId: number | null; freightShipmentNumber: string | null;
  }>();
  if (orderIds.length > 0) {
    const rfqRows = await db.execute(sql`
      SELECT DISTINCT ON (r.order_id)
        r.order_id AS "orderId",
        r.id AS "rfqId",
        r.rfq_number AS "rfqNumber",
        r.status AS "rfqStatus",
        r.freight_shipment_id AS "freightShipmentId",
        fs.shipment_number AS "freightShipmentNumber"
      FROM logistic_order_rfqs r
      LEFT JOIN freight_shipments fs ON fs.id = r.freight_shipment_id
      WHERE r.order_id = ANY(${sql.raw(`ARRAY[${orderIds.join(",")}]::int[]`)})
      ORDER BY r.order_id, r.created_at DESC
    `);
    for (const row of (rfqRows.rows ?? rfqRows) as any[]) {
      rfqMap.set(Number(row.orderId), {
        rfqId: Number(row.rfqId),
        rfqNumber: row.rfqNumber as string,
        rfqStatus: row.rfqStatus as string,
        freightShipmentId: row.freightShipmentId ? Number(row.freightShipmentId) : null,
        freightShipmentNumber: (row.freightShipmentNumber as string) ?? null,
      });
    }
  }

  // Attach fulfillment status per order
  const fulfillmentStatusMap = new Map<number, string>();
  if (orderIds.length > 0) {
    const fRows = await db.execute(sql`
      SELECT DISTINCT ON (order_id)
        order_id AS "orderId", status
      FROM order_fulfillment_links
      WHERE order_id = ANY(${sql.raw(`ARRAY[${orderIds.join(",")}]::int[]`)})
      ORDER BY order_id, created_at DESC
    `);
    for (const row of (fRows.rows as { orderId: unknown; status: unknown }[])) {
      fulfillmentStatusMap.set(Number(row.orderId), row.status as string);
    }
  }

  // Attach direct freight shipment (via salesDoc path — created by "Konversi ke Shipment")
  const directShipmentMap = new Map<number, { id: number; shipmentNumber: string }>();
  const salesDocIds = [...linkedDocMap.values()].map((d) => d.id);
  if (salesDocIds.length > 0) {
    const fsRows = await db
      .select({ salesDocId: freightShipmentsTable.salesDocId, id: freightShipmentsTable.id, shipmentNumber: freightShipmentsTable.shipmentNumber })
      .from(freightShipmentsTable)
      .where(inArray(freightShipmentsTable.salesDocId, salesDocIds));
    // Build reverse map: salesDocId → shipment, then resolve logisticOrderId
    const salesDocToShipment = new Map(fsRows.map((r) => [r.salesDocId!, { id: r.id, shipmentNumber: r.shipmentNumber }]));
    for (const [orderId, doc] of linkedDocMap.entries()) {
      const shipment = salesDocToShipment.get(doc.id);
      if (shipment) directShipmentMap.set(orderId, shipment);
    }
  }

  return res.json(rows.map((row) => ({
    ...toOrder(row),
    linkedSalesDocId: linkedDocMap.get(row.id)?.id ?? null,
    linkedSalesDocNumber: linkedDocMap.get(row.id)?.docNumber ?? null,
    latestRfq: rfqMap.get(row.id) ?? null,
    fulfillmentStatus: fulfillmentStatusMap.get(row.id) ?? null,
    directFreightShipmentId: directShipmentMap.get(row.id)?.id ?? null,
    directFreightShipmentNumber: directShipmentMap.get(row.id)?.shipmentNumber ?? null,
  })));
});

// GET /api/logistic/orders/summary — dashboard stats (admin)
logisticOrdersRouter.get("/summary", async (_req: Request, res: Response) => {
  const rows = await db.select().from(logisticOrdersTable);
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  return res.json({
    totalOrders: rows.length,
    newOrders: count("New Order"),
    underReviewOrders: count("Under Review"),
    quotationSentOrders: count("Quotation Sent"),
    confirmedOrders: count("Confirmed"),
    inProgressOrders: count("In Progress"),
    completedOrders: count("Completed"),
    cancelledOrders: count("Cancelled"),
    totalEstimatedRevenue: rows.reduce((acc, r) => acc + parseFloat(r.grandTotal), 0),
  });
});

// PUT /api/logistic/orders/trucking-rates — admin only
// Protected by requirePortalAdmin: caller must present a valid Supabase Bearer token
// belonging to an email on the server-side PORTAL_ADMIN_EMAILS allowlist.
// The shared x-admin-password mechanism has been removed entirely.
logisticOrdersRouter.put("/trucking-rates", requirePortalAdmin, async (req: Request, res: Response) => {
  const rates = req.body as Record<string, { ratePerKm: number; loadingFee: number }>;
  if (!rates || typeof rates !== "object") {
    return res.status(400).json({ message: "Format tarif tidak valid" });
  }
  const json = JSON.stringify(rates);
  const existing = await db
    .select()
    .from(portalContentTable)
    .where(eq(portalContentTable.key, TRUCKING_RATES_KEY));
  if (existing.length > 0) {
    await db
      .update(portalContentTable)
      .set({ value: json })
      .where(eq(portalContentTable.key, TRUCKING_RATES_KEY));
  } else {
    await db
      .insert(portalContentTable)
      .values({ key: TRUCKING_RATES_KEY, value: json });
  }
  return res.json({ message: "Tarif berhasil disimpan" });
});

// ─── Delivery Vendors CRUD (for BizPortal) ───────────────────────────────────

// POST /api/logistic/orders/vendors — [C9-FIX] requires admin or owner role
logisticOrdersRouter.post("/vendors", async (req: Request, res: Response) => {
  if (!(await requireRole(req, res, ["admin", "owner"]))) return;
  const { name, logo, eta, fee, note, phone, email, serviceType } = req.body as Record<string, unknown>;
  if (!name || typeof name !== "string" || !name.trim())
    return res.status(400).json({ message: "Nama vendor harus diisi" });
  const [maxRow] = await db.select({ max: sql<number>`COALESCE(MAX(sort_order), 0)` }).from(suppliersTable);
  const nextSort = Number(maxRow?.max ?? 0) + 1;
  const [created] = await db.insert(suppliersTable).values({
    name: String(name).trim(),
    logo: typeof logo === "string" && logo.trim() ? logo.trim() : "📦",
    eta: typeof eta === "string" && eta.trim() ? eta.trim() : "2-3 hari",
    fee: typeof fee === "number" ? String(fee) : "0",
    note: typeof note === "string" && note.trim() ? note.trim() : null,
    phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    contactEmail: typeof email === "string" && email.trim() ? email.trim() : null,
    serviceType: typeof serviceType === "string" && serviceType.trim() ? serviceType.trim() : null,
    isActive: true,
    sortOrder: nextSort,
  }).returning();
  return res.status(201).json({ ...created, fee: Number(created.fee ?? 0), email: created.contactEmail });
});

// PUT /api/logistic/orders/vendors/:id — [C9-FIX] requires admin or owner role
logisticOrdersRouter.put("/vendors/:id", async (req: Request, res: Response) => {
  if (!(await requireRole(req, res, ["admin", "owner"]))) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { name, logo, eta, fee, note, phone, email, serviceType, isActive, sortOrder } = req.body as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof name === "string" && name.trim()) patch.name = name.trim();
  if (typeof logo === "string") patch.logo = logo.trim() || "📦";
  if (typeof eta === "string" && eta.trim()) patch.eta = eta.trim();
  if (typeof fee === "number") patch.fee = String(fee);
  if (note !== undefined) patch.note = typeof note === "string" && note.trim() ? note.trim() : null;
  if (phone !== undefined) patch.phone = typeof phone === "string" && phone.trim() ? phone.trim() : null;
  if (email !== undefined) patch.contactEmail = typeof email === "string" && email.trim() ? email.trim() : null;
  if (serviceType !== undefined) patch.serviceType = typeof serviceType === "string" && serviceType.trim() ? serviceType.trim() : null;
  if (typeof isActive === "boolean") patch.isActive = isActive;
  if (typeof sortOrder === "number") patch.sortOrder = sortOrder;
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: "Tidak ada data yang diperbarui" });
  const [updated] = await db.update(suppliersTable).set(patch).where(eq(suppliersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ message: "Vendor tidak ditemukan" });
  return res.json({ ...updated, fee: Number(updated.fee ?? 0), email: updated.contactEmail });
});

// DELETE /api/logistic/orders/vendors/:id — [C9-FIX] requires admin or owner role
logisticOrdersRouter.delete("/vendors/:id", async (req: Request, res: Response) => {
  if (!(await requireRole(req, res, ["admin", "owner"]))) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const [deleted] = await db.delete(suppliersTable).where(eq(suppliersTable.id, id)).returning();
  if (!deleted) return res.status(404).json({ message: "Vendor tidak ditemukan" });
  // Cascade storage cleanup — logo (hanya jika berupa URL, bukan emoji)
  if (deleted.logo && (deleted.logo.startsWith("http") || deleted.logo.startsWith("/api/storage"))) {
    deleteFromSupabase(deleted.logo).catch(() => {});
  }
  return res.json({ success: true });
});

// GET /api/logistic/orders/:id/progress — timeline events untuk order
logisticOrdersRouter.get("/:id/progress", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const events = await getOrderProgressEvents(id);
  return res.json({ events });
});

// POST /api/logistic/orders/:id/progress/set — admin set step manual
logisticOrdersRouter.post("/:id/progress/set", requireClerkUser, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { stepKey, notes } = req.body as { stepKey: string; notes?: string };
  const validKeys = PROGRESS_STEPS.map((s) => s.key);
  if (!validKeys.includes(stepKey as StepKey))
    return res.status(400).json({ message: "Step tidak valid" });
  const user = (req as any).user;
  const actor = user?.name || user?.email || "Admin";
  await updateOrderProgress(id, stepKey as StepKey, "admin", actor, notes ?? `Manual set oleh ${actor}`);
  return res.json({ ok: true });
});

// PUT /api/logistic/orders/:id/progress/:stepKey/photo — admin set/replace foto untuk step tertentu
logisticOrdersRouter.put("/:id/progress/:stepKey/photo", requireClerkUser, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { stepKey } = req.params;
  const validKeys = PROGRESS_STEPS.map((s) => s.key);
  if (!validKeys.includes(stepKey as StepKey))
    return res.status(400).json({ message: "Step tidak valid" });
  const { photoUrl } = req.body as { photoUrl?: string };
  if (!photoUrl || typeof photoUrl !== "string" || !photoUrl.startsWith("http"))
    return res.status(400).json({ message: "photoUrl tidak valid (harus URL http/https)" });

  try {
    const result = await db.execute(sql`
      UPDATE order_progress_events
        SET photo_url = ${photoUrl}
      WHERE order_id = ${id} AND step_key = ${stepKey}
      RETURNING id, step_key, photo_url
    `);
    if ((result.rows ?? []).length === 0)
      return res.status(404).json({ message: "Progress event tidak ditemukan untuk order + step ini" });
    return res.json({ ok: true, updated: (result.rows as any[])[0] });
  } catch (err) {
    logger.error({ err, id, stepKey }, "admin set progress photo failed");
    return res.status(500).json({ message: "Gagal update foto" });
  }
});

// DELETE /api/logistic/orders/:id/progress/:stepKey — admin undo step
logisticOrdersRouter.delete("/:id/progress/:stepKey", requireClerkUser, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { stepKey } = req.params;
  const validKeys = PROGRESS_STEPS.map((s) => s.key);
  if (!validKeys.includes(stepKey as StepKey))
    return res.status(400).json({ message: "Step tidak valid" });
  await deleteOrderProgress(id, stepKey as StepKey);
  return res.json({ ok: true });
});

// GET /api/logistic/orders/:id — get order detail (admin)
logisticOrdersRouter.get("/:id", async (req: Request, res: Response) => {
  const parsed = GetLogisticOrderParams.safeParse({
    id: parseInt(String(req.params.id), 10),
  });
  if (!parsed.success || isNaN(parsed.data.id))
    return res.status(400).json({ message: "ID tidak valid" });
  const { id } = parsed.data;

  const [order] = await db
    .select()
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, id));

  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // [C5-FIX] Cross-company data leak prevention: non-admin/owner users can only access their company's orders
  const u = req.user as { role?: string | null; companyId?: number | null } | undefined;
  const isAdminOrOwner = u?.role === "admin" || u?.role === "owner";
  if (!isAdminOrOwner && order.companyId !== null && order.companyId !== (u?.companyId ?? null)) {
    return res.status(403).json({ message: "Akses ditolak: order ini bukan milik perusahaan Anda" });
  }

  const [items, linkedDocRows] = await Promise.all([
    db.select().from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, id)),
    db.select({ id: salesDocumentsTable.id, docNumber: salesDocumentsTable.docNumber })
      .from(salesDocumentsTable)
      .where(eq(salesDocumentsTable.logisticOrderId, id))
      .limit(1),
  ]);

  let approvedVendorName: string | null = null;
  if (order.approvedVendorId) {
    const [v] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.approvedVendorId));
    approvedVendorName = v?.name ?? null;
  }

  const linkedDoc = linkedDocRows[0] ?? null;
  return res.json({
    ...toOrder(order, approvedVendorName),
    items: items.map(toItem),
    linkedSalesDocId: linkedDoc?.id ?? null,
    linkedSalesDocNumber: linkedDoc?.docNumber ?? null,
  });
});

// POST /api/logistic/orders/:id/resend-wa-group — resend order_new notif ke Admin Group
logisticOrdersRouter.post("/:id/resend-wa-group", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const items = await db.select().from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, id));

  const orderType = (order as any).orderType ?? "shipment";
  const isProduct = orderType === "product";

  const serviceList = !isProduct
    ? items.map(i => `• ${i.serviceName}`).join("\n")
    : "";

  const orderItems = items.map(i => ({
    name: i.serviceName,
    qty: null as number | null,
    subtotal: i.subtotal != null ? parseFloat(String(i.subtotal)) : null,
  }));

  const vehicleType =
    (items.find(i => i.calculatorType === "trucking")?.inputData as Record<string, unknown> | undefined)
      ?.vehicleType as string ?? null;

  sendLogisticOrderNotification({
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    companyName: order.companyName,
    email: order.email,
    phone: order.phone,
    orderType,
    shipmentType: order.shipmentType ?? "",
    origin: order.origin ?? "",
    destination: order.destination ?? "",
    commodity: order.commodity ?? null,
    cargoDescription: order.cargoDescription ?? null,
    grossWeight: !isProduct && order.grossWeight ? parseFloat(String(order.grossWeight)) : null,
    volumeCbm: !isProduct && order.volumeCbm ? parseFloat(String(order.volumeCbm)) : null,
    jumlahKoli: !isProduct && order.jumlahKoli ? order.jumlahKoli : null,
    subtotal: order.subtotal != null ? parseFloat(String(order.subtotal)) : null,
    tax: order.tax != null ? parseFloat(String(order.tax)) : null,
    grandTotal: parseFloat(String(order.grandTotal)),
    serviceList,
    orderItems,
    requiredDate: order.requiredDate ?? null,
    notes: order.notes ?? null,
    jamOrder: order.jamOrder ?? null,
    vehicleType,
    createdAt: order.createdAt,
    publicRfqToken: order.publicRfqToken ?? null,
  }).catch((err: unknown) => req.log.error({ err }, "resend-wa-group failed"));

  return res.json({ ok: true, message: "Notifikasi WA dikirim ke Admin Group" });
});

// ─── Vendor WA notification on status change ──────────────────────────────────
// Use canonical status set from constants
const VENDOR_STATUS_LABELS: Record<string, string> = {
  "Vendor Confirmed": "Vendor Dikonfirmasi ✅",
  "In Progress":      "Sedang Diproses 🔄",
  "Pickup":           "Proses Penjemputan 🚚",
  "In Transit":       "Dalam Perjalanan 🛣️",
  "Arrived":          "Tiba di Tujuan 📍",
  "Delivered":        "Terkirim ✅",
  "Completed":        "Selesai 🎉",
  "Cancelled":        "Dibatalkan ❌",
  // backward compat
  "Confirmed":        "Dikonfirmasi ✅",
};

async function notifyVendorStatusChange(
  order: { orderNumber: string; customerName: string | null; origin: string | null; destination: string | null; approvedVendorId: number | null },
  status: string,
) {
  if (!VENDOR_NOTIFY_STATUS_SET.has(status)) return;
  if (!order.approvedVendorId) return;

  try {
    const [vendor] = await db
      .select({ name: suppliersTable.name, phone: suppliersTable.phone })
      .from(suppliersTable)
      .where(eq(suppliersTable.id, order.approvedVendorId));

    if (!vendor?.phone) return;

    const { normalizePhone } = await import("../lib/phoneUtils.js");
    const phone = normalizePhone(vendor.phone);
    if (!phone) return;


    const label = VENDOR_STATUS_LABELS[status] ?? STATUS_LABEL_ID[status] ?? status;
    const note  = VENDOR_WA_NOTES[status] ?? "";
    const route = order.origin && order.destination
      ? `${order.origin} → ${order.destination}`
      : "—";

    const msg =
      `🔔 *Update Status Order — CST Logistics*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `No. Order  : \`${order.orderNumber}\`\n` +
      `Customer   : ${order.customerName ?? "—"}\n` +
      `Rute       : ${route}\n` +
      `Vendor     : *${vendor.name ?? "—"}*\n` +
      `Status     : *${label}*\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `${note}\n\n` +
      `_CST Logistics — Notifikasi Otomatis_`;

    sendWhatsApp(phone, msg, {
      context: "vendor_status_change",
      refType: "order",
      refId: order.orderNumber,
    }).catch(() => undefined);

    sendVendorOrderStatusChangeNotification(order, label, note, vendor.name ?? "—", phone);
    const notifLabel = VENDOR_STATUS_LABELS[status] ?? status;
    const notifNote  = VENDOR_STATUS_NOTES[status] ?? "";
    sendVendorOrderStatusChangeNotification(order, notifLabel, notifNote, vendor.name ?? "—", phone);

  } catch {
    // fire-and-forget, never block the response
  }
}

// PUT /api/logistic/orders/:id/status — update status (admin)
logisticOrdersRouter.put("/:id/status", async (req: Request, res: Response) => {
  const paramsParsed = UpdateLogisticOrderStatusParams.safeParse({
    id: parseInt(String(req.params.id), 10),
  });
  const bodyParsed = UpdateLogisticOrderStatusBody.safeParse(req.body);

  if (!paramsParsed.success || isNaN(paramsParsed.data.id))
    return res.status(400).json({ message: "ID tidak valid" });
  if (!bodyParsed.success)
    return res.status(400).json({ message: "Status tidak valid" });

  const { id } = paramsParsed.data;
  const { status } = bodyParsed.data;
  const clientVersion: number | undefined =
    typeof req.body.version === "number" ? req.body.version : undefined;
  const clientUpdatedAt = typeof (req.body as Record<string, unknown>).clientUpdatedAt === "string"
    ? new Date((req.body as Record<string, unknown>).clientUpdatedAt as string)
    : null;

  // Optimistic locking enforcement: setidaknya salah satu harus dikirim agar
  // concurrent-edit conflict dapat terdeteksi. Tolak jika tidak ada keduanya.
  if (clientVersion === undefined && clientUpdatedAt === null) {
    return res.status(400).json({
      message: "Permintaan tidak valid: sertakan 'version' atau 'clientUpdatedAt' untuk mencegah konflik perubahan bersamaan.",
      code: "OPTIMISTIC_LOCK_REQUIRED",
    });
  }

  if (clientUpdatedAt) {
    const [current] = await db
      .select({ updatedAt: logisticOrdersTable.updatedAt })
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, id));
    if (!current) return res.status(404).json({ message: "Order tidak ditemukan" });
    const dbMs = new Date(current.updatedAt).getTime();
    const clientMs = clientUpdatedAt.getTime();
    if (Math.abs(dbMs - clientMs) > 1000) {
      return res.status(409).json({
        message: "Order telah diubah oleh pengguna lain. Muat ulang halaman untuk mendapatkan data terbaru.",
        conflict: true,
        serverUpdatedAt: current.updatedAt,
      });
    }
  }

  const adminName = (req.user as { name?: string } | undefined)?.name ?? "Admin";
  const adminId   = (req.user as { id?: string } | undefined)?.id ?? null;

  if (clientVersion !== undefined) {
    const [currentRow] = await db
      .select({ version: logisticOrdersTable.version })
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, id));
    if (!currentRow) return res.status(404).json({ message: "Order tidak ditemukan" });
    if (currentRow.version !== clientVersion) {
      return res.status(409).json({ message: "Data sudah diubah oleh pengguna lain. Refresh halaman dan coba lagi." });
    }
  }

  const svcResult = await transitionLogisticOrderStatus(id, status, {
    actorType: "admin",
    actorId: adminId,
    actorName: adminName,
    notes: (req.body as Record<string, unknown>).notes as string ?? undefined,
    source: "PUT /logistic/orders/:id/status",
    skipAudit: true,
  });

  if (!svcResult.ok) {
    if (svcResult.allowedTransitions !== undefined) {
      return res.status(422).json({
        message: svcResult.error,
        allowedTransitions: svcResult.allowedTransitions,
        code: "INVALID_TRANSITION",
      });
    }
    if (svcResult.error?.includes("tidak ditemukan")) return res.status(404).json({ message: svcResult.error });
    return res.status(409).json({ message: svcResult.error ?? "Update status gagal" });
  }

  const [updated] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, id));
  if (!updated) return res.status(404).json({ message: "Order tidak ditemukan" });

  logActivity({
    orderId: updated.id,
    actorType: "admin",
    actorName: adminName,
    actorId: adminId,
    action: "status_changed",
    description: `Status order ${updated.orderNumber} diubah menjadi "${status}"`,
    newValue: { status },
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  // Audit trail: catat di order_status_history + order_audit_logs
  logOrderStatusChange({
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    oldStatus: (req.body as Record<string, unknown>).oldStatus as string | null ?? null,
    newStatus: status,
    changedByType: "admin",
    changedById: adminId,
    changedByName: adminName,
    changedByIp: req.ip ?? null,
    notes: (req.body as Record<string, unknown>).notes as string | null ?? null,
    source: "PUT /logistic/orders/:id/status",
  }).catch(() => {});
  logOrderAudit({
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    actorType: "admin",
    actorId: adminId,
    actorName: adminName,
    action: "status_changed",
    description: `Status order ${updated.orderNumber} diubah menjadi "${status}"`,
    newValue: { status },
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  // Persistent timeline entry — visible to customer tracking
  db.insert(orderUpdatesTable).values({
    orderId: updated.id,
    actorType: "admin",
    actorId: adminId,
    actorName: adminName,
    status,
    notes: `Status diubah menjadi "${status}"`,
    isPublic: true,
  }).catch(() => {});


  // Notify customer via WhatsApp (fire-and-forget) — use canonical messages with tracking link
  if (updated.phone) {
    // Fetch tracking token untuk link direct tracking di WA
    const trackingResult = await db.execute(sql`SELECT tracking_token FROM logistic_orders WHERE id = ${updated.id} LIMIT 1`).catch(() => null);
    const trackingToken = (trackingResult?.rows?.[0] as any)?.tracking_token ?? null;
    const domain = getPreferredDomain();
    const trackUrl = (domain && trackingToken)
      ? `https://${domain}/order-track/${trackingToken}`
      : domain ? `https://${domain}/track/${updated.orderNumber}` : null;

    const waBuilder = CUSTOMER_WA_MESSAGES[status];
    const msg = waBuilder
      ? waBuilder(updated.orderNumber, trackUrl ?? undefined)
      : `📦 *Update Status Order Anda*\nNo Order: ${updated.orderNumber}\nStatus: *${STATUS_LABEL_ID[status] ?? status}*\n\nTerima kasih telah menggunakan layanan kami.` +
        (trackUrl ? `\n\n🔗 Pantau status:\n${trackUrl}` : "");
    sendWhatsApp(updated.phone, msg, {
      context: "order_status_change",
      refType: "order",
      refId: updated.orderNumber,
    }).catch(() => undefined);
  }

  // Progress bar event — record for all canonical statuses (generic, covers all status keys)
  updateOrderProgress(
    updated.id,
    status.toUpperCase().replace(/ /g, "_"),
    "admin",
    adminName,
    `Status diubah ke ${STATUS_LABEL_ID[status] ?? status}`,
  ).catch(() => {});

  // Notify vendor via WhatsApp (fire-and-forget)
  notifyVendorStatusChange(updated, status).catch(() => undefined);

  // Web Push ke subscriber halaman tracking (fire-and-forget)
  sendPushToOrder(updated.orderNumber, {
    title: "Update Status Order",
    body: `Order ${updated.orderNumber}: ${STATUS_LABEL_ID[status] ?? status}`,
    url: `/track/${updated.orderNumber}`,
    tag: `order-${updated.orderNumber}`,
  } as { title: string; body: string; url?: string }).catch(() => undefined);

  saveAndBroadcast("logistic_order_status_changed", {
    type: "logistic_status",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    customerName: updated.customerName,
    companyName: updated.companyName ?? null,
    status: updated.status,
    updatedAt: new Date().toISOString(),
  }).catch(() => {});

  // Broadcast ke Customer Portal agar orders page auto-refresh
  broadcastToPortal("logistic_order_status_changed", {
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    status: updated.status,
    updatedAt: new Date().toISOString(),
  });

  return res.json(toOrder(updated));
});

// GET /api/logistic/orders/:id/valid-transitions — daftar transisi status yang diizinkan
logisticOrdersRouter.get("/:id/valid-transitions", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const [order] = await db.select({ id: logisticOrdersTable.id, status: logisticOrdersTable.status })
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });
  const allowedTransitions = getAllowedTransitions(order.status);
  return res.json({ status: order.status, allowedTransitions });
});

// PATCH /api/logistic/orders/:id/details — update detail order (admin)
logisticOrdersRouter.patch("/:id/details", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const parsed = z.object({
    shipmentType:    z.string().optional(),
    origin:          z.string().optional(),
    destination:     z.string().optional(),
    commodity:       z.string().optional(),
    cargoDescription: z.string().optional(),
    grossWeight:     z.string().optional(),
    volumeCbm:       z.string().optional(),
    jumlahKoli:      z.number().int().nonnegative().optional(),
    requiredDate:    z.string().optional(),
    notes:           z.string().optional(),
  }).safeParse(req.body);

  if (!parsed.success) return res.status(400).json({ message: "Data tidak valid" });

  const patch: Record<string, unknown> = {};
  const d = parsed.data;
  if (d.shipmentType    !== undefined) patch["shipmentType"]    = d.shipmentType.trim() || null;
  if (d.origin          !== undefined) patch["origin"]          = d.origin.trim() || null;
  if (d.destination     !== undefined) patch["destination"]     = d.destination.trim() || null;
  if (d.commodity       !== undefined) patch["commodity"]       = d.commodity.trim() || null;
  if (d.cargoDescription !== undefined) patch["cargoDescription"] = d.cargoDescription.trim() || null;
  if (d.grossWeight     !== undefined) patch["grossWeight"]     = d.grossWeight.trim() || null;
  if (d.volumeCbm       !== undefined) patch["volumeCbm"]       = d.volumeCbm.trim() || null;
  if (d.jumlahKoli      !== undefined) patch["jumlahKoli"]      = d.jumlahKoli;
  if (d.requiredDate    !== undefined) patch["requiredDate"]    = d.requiredDate.trim() || null;
  if (d.notes           !== undefined) patch["notes"]           = d.notes.trim() || null;

  if (Object.keys(patch).length === 0)
    return res.status(400).json({ message: "Tidak ada field yang diupdate" });

  const detailsClientVersion: number | undefined =
    typeof req.body.version === "number" ? req.body.version : undefined;
  const detailsWhereClause =
    detailsClientVersion !== undefined
      ? and(eq(logisticOrdersTable.id, id), eq(logisticOrdersTable.version, detailsClientVersion))
      : eq(logisticOrdersTable.id, id);

  const [updated] = await db
    .update(logisticOrdersTable)
    .set({ ...patch, version: sql`${logisticOrdersTable.version} + 1` } as any)
    .where(detailsWhereClause)
    .returning();

  if (!updated) {
    const [exists] = await db.select({ id: logisticOrdersTable.id }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, id));
    if (!exists) return res.status(404).json({ message: "Order tidak ditemukan" });
    return res.status(409).json({ message: "Data sudah diubah oleh pengguna lain. Refresh halaman dan coba lagi." });
  }

  logActivity({
    orderId: updated.id,
    actorType: "admin",
    actorName: (req.user as { name?: string } | undefined)?.name ?? "Admin",
    actorId: (req.user as { id?: string } | undefined)?.id ?? null,
    action: "details_updated",
    description: `Detail order ${updated.orderNumber} diperbarui`,
    newValue: patch,
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  return res.json(toOrder(updated));
});

// PATCH /api/logistic/orders/:id/type — update shipment type (admin)
logisticOrdersRouter.patch("/:id/type", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const { shipmentType, version: typeVersion } = req.body as { shipmentType?: unknown; version?: unknown };
  if (!shipmentType || typeof shipmentType !== "string" || shipmentType.trim() === "")
    return res.status(400).json({ message: "shipmentType wajib diisi" });

  const typeClientVersion: number | undefined = typeof typeVersion === "number" ? typeVersion : undefined;
  const typeWhereClause =
    typeClientVersion !== undefined
      ? and(eq(logisticOrdersTable.id, id), eq(logisticOrdersTable.version, typeClientVersion))
      : eq(logisticOrdersTable.id, id);

  const [updated] = await db
    .update(logisticOrdersTable)
    .set({ shipmentType: shipmentType.trim(), version: sql`${logisticOrdersTable.version} + 1` } as any)
    .where(typeWhereClause)
    .returning();

  if (!updated) {
    const [exists] = await db.select({ id: logisticOrdersTable.id }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, id));
    if (!exists) return res.status(404).json({ message: "Order tidak ditemukan" });
    return res.status(409).json({ message: "Data sudah diubah oleh pengguna lain. Refresh halaman dan coba lagi." });
  }

  logActivity({
    orderId: updated.id,
    actorType: "admin",
    actorName: (req.user as { name?: string } | undefined)?.name ?? "Admin",
    actorId: (req.user as { id?: string } | undefined)?.id ?? null,
    action: "shipment_type_changed",
    description: `Jenis pengiriman order ${updated.orderNumber} diubah menjadi "${shipmentType.trim()}"`,
    newValue: { shipmentType: shipmentType.trim() },
    ipAddress: req.ip ?? null,
  }).catch(() => {});

  return res.json(toOrder(updated));
});

// PUT /api/logistic/orders/bulk-status — ubah status banyak order sekaligus
logisticOrdersRouter.put("/bulk-status", async (req: Request, res: Response) => {
  const parsed = z.object({
    ids: z.array(z.number().int().positive()).min(1),
    status: z.enum([
      "Order Received", "Admin Review", "RFQ Sent", "Quote Received",
      "Customer Approval", "Vendor Confirmed", "In Progress", "Pickup",
      "In Transit", "Arrived", "Delivered", "POD Uploaded",
      "Invoice Issued", "Payment Received", "Completed", "Cancelled",
      // backward compat
      "New Order", "Confirmed",
    ]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "ids dan status harus valid" });
  const { ids, status } = parsed.data;
  const adminName = (req.user as { name?: string } | undefined)?.name ?? "Admin";
  const adminId   = (req.user as { id?: string } | undefined)?.id ?? null;

  const updatedIds: number[] = [];
  const failedIds: number[] = [];

  for (const oid of ids) {
    const result = await transitionLogisticOrderStatus(oid, status, {
      actorType: "admin",
      actorId: adminId,
      actorName: adminName,
      source: "PUT /logistic/orders/bulk-status",
      force: true,
      skipAudit: false,
    });
    if (result.ok) updatedIds.push(oid);
    else failedIds.push(oid);
  }

  // Log activity + timeline for each succeeded order (fire-and-forget)
  for (const oid of updatedIds) {
    logActivity({
      orderId: oid,
      actorType: "admin",
      actorName: adminName,
      actorId: adminId,
      action: "bulk_status_changed",
      description: `Bulk status change → "${status}"`,
      newValue: { status },
      ipAddress: req.ip ?? null,
    }).catch(() => {});
    db.insert(orderUpdatesTable).values({
      orderId: oid,
      actorType: "admin",
      actorId: adminId,
      actorName: adminName,
      status,
      notes: `Status diubah (bulk) menjadi "${status}"`,
      isPublic: false,
    }).catch(() => {});
  }

  return res.json({ message: "Updated", updatedIds, failedIds, count: updatedIds.length });
});

// Helper: hapus file storage terkait logistic order (driver photos + vendor unit photos)
async function cleanupLogisticOrderStorage(orderIds: number[]): Promise<void> {
  if (orderIds.length === 0) return;
  try {
    // 1. Cari driver jobs terkait order, lalu hapus foto-foto driver
    const jobs = await db
      .select({ id: driverJobsTable.id })
      .from(driverJobsTable)
      .where(inArray(driverJobsTable.logisticOrderId, orderIds));
    if (jobs.length > 0) {
      const jobIds = jobs.map((j) => j.id);
      const photos = await db
        .select({ url: driverPhotosTable.url })
        .from(driverPhotosTable)
        .where(inArray(driverPhotosTable.driverJobId, jobIds));
      for (const p of photos) deleteFromSupabase(p.url).catch(() => {});
    }
    // 2. Hapus unit photo dari vendor response
    const responses = await db
      .select({ unitPhotoUrl: vendorResponsesTable.unitPhotoUrl })
      .from(vendorResponsesTable)
      .where(inArray(vendorResponsesTable.orderId, orderIds));
    for (const r of responses) {
      if (r.unitPhotoUrl) deleteFromSupabase(r.unitPhotoUrl).catch(() => {});
    }
    // 3. Hapus POD OCR images (orderId jadi null setelah delete, jadi fetch sekarang)
    const podOcrRows = await db
      .select({ imageUrl: podOcrResultsTable.imageUrl })
      .from(podOcrResultsTable)
      .where(inArray(podOcrResultsTable.orderId, orderIds));
    for (const p of podOcrRows) {
      if (p.imageUrl) deleteFromSupabase(p.imageUrl).catch(() => {});
    }
    // 4. Hapus RFQ vendor link attachments (cascade delete: order → rfqs → rfq_vendor_links)
    const rfqs = await db
      .select({ id: logisticOrderRfqsTable.id })
      .from(logisticOrderRfqsTable)
      .where(inArray(logisticOrderRfqsTable.orderId, orderIds));
    if (rfqs.length > 0) {
      const rfqIds = rfqs.map((r) => r.id);
      const vendorLinks = await db
        .select({ attachmentUrl: rfqVendorLinksTable.attachmentUrl })
        .from(rfqVendorLinksTable)
        .where(inArray(rfqVendorLinksTable.rfqId, rfqIds));
      for (const vl of vendorLinks) {
        if (vl.attachmentUrl) deleteFromSupabase(vl.attachmentUrl).catch(() => {});
      }
    }
  } catch { /* non-fatal */ }
}

// DELETE /api/logistic/orders/bulk — hapus banyak order sekaligus
logisticOrdersRouter.delete("/bulk", async (req: Request, res: Response) => {
  const parsed = z.object({ ids: z.array(z.number().int().positive()).min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "ids harus array angka yang valid" });
  const { ids } = parsed.data;
  // Cleanup storage dulu sebelum delete DB
  await cleanupLogisticOrderStorage(ids);
  const deleted = await db
    .delete(logisticOrdersTable)
    .where(inArray(logisticOrdersTable.id, ids))
    .returning({ id: logisticOrdersTable.id });
  return res.json({ message: "Deleted", deletedIds: deleted.map((r) => r.id), count: deleted.length });
});

// DELETE /api/logistic/orders/:id
logisticOrdersRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(id)) return res.status(400).json({ message: "Invalid ID" });
  // Cleanup storage dulu sebelum delete DB
  await cleanupLogisticOrderStorage([id]);
  const [deleted] = await db
    .delete(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, id))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Order tidak ditemukan" });
  return res.json({ message: "Deleted", id });
});

// POST /api/logistic/orders/:id/updates — tambah catatan manual ke timeline
logisticOrdersRouter.post("/:id/updates", requireClerkUser, async (req: Request, res: Response) => {
  const id = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const [order] = await db.select({ id: logisticOrdersTable.id }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const notes = String(req.body?.notes ?? "").trim();
  const status = req.body?.status ? String(req.body.status).trim() : null;
  const isPublic = req.body?.isPublic === true || req.body?.isPublic === "true";

  if (!notes && !status) return res.status(400).json({ message: "notes atau status wajib diisi" });

  const actorName = (req as any).user?.fullName ?? (req as any).user?.name ?? "Admin";
  const actorId = (req as any).user?.id ?? null;

  const [inserted] = await db.insert(orderUpdatesTable).values({
    orderId: id,
    actorType: "admin",
    actorId: actorId ? String(actorId) : null,
    actorName,
    status: status || null,
    notes: notes || null,
    isPublic,
    createdAt: new Date(),
  }).returning();

  return res.status(201).json({ ok: true, update: inserted });
});

// GET /api/logistic/orders/:id/locations — GPS history for an order [H2-FIX: admin/owner/logistics only]
logisticOrdersRouter.get("/:id/locations", async (req: Request, res: Response) => {
  if (!(await requireRole(req, res, ["admin", "owner", "logistics"]))) return;
  const id = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const limit = Math.min(parseInt(String(req.query["limit"] ?? "200"), 10), 500);

  const rows = await db
    .select({
      id: driverLocationsTable.id,
      latitude: driverLocationsTable.latitude,
      longitude: driverLocationsTable.longitude,
      accuracy: driverLocationsTable.accuracy,
      speed: driverLocationsTable.speed,
      checkpointType: driverLocationsTable.checkpointType,
      updatedAt: driverLocationsTable.updatedAt,
    })
    .from(driverLocationsTable)
    .where(eq(driverLocationsTable.orderId, id))
    .orderBy(driverLocationsTable.updatedAt)
    .limit(limit);

  return res.json({
    locations: rows.map(r => ({
      id: r.id,
      lat: parseFloat(String(r.latitude)),
      lng: parseFloat(String(r.longitude)),
      accuracy: r.accuracy != null ? parseFloat(String(r.accuracy)) : null,
      speed: r.speed != null ? parseFloat(String(r.speed)) : null,
      checkpointType: r.checkpointType,
      updatedAt: r.updatedAt,
    })),
    total: rows.length,
  });
});

// ── Delivery Phase Transition Endpoints ──────────────────────────────────────
// POST /api/logistic/orders/:id/delivery/:phase
// Manual delivery phase transitions untuk admin/logistics.
// Dedup: invoice-issued skip customer WA jika sudah dikirim via customer-invoice link.

const DELIVERY_PHASE_CONFIG: Record<string, { status: string; emoji: string; label: string }> = {
  "in-progress":      { status: "In Progress",     emoji: "🚀", label: "Dalam Proses" },
  "pickup":           { status: "Pickup",           emoji: "🚚", label: "Barang Diambil" },
  "in-transit":       { status: "In Transit",       emoji: "🛣️",  label: "Dalam Perjalanan" },
  "arrived":          { status: "Arrived",          emoji: "📍", label: "Tiba di Tujuan" },
  "delivered":        { status: "Delivered",        emoji: "✅", label: "Diserahkan ke Customer" },
  "pod-uploaded":     { status: "POD Uploaded",     emoji: "📷", label: "POD Diunggah" },
  "invoice-issued":   { status: "Invoice Issued",   emoji: "🧾", label: "Invoice Diterbitkan" },
  "payment-received": { status: "Payment Received", emoji: "💰", label: "Pembayaran Diterima" },
  "completed":        { status: "Completed",        emoji: "🎉", label: "Order Selesai" },
};

logisticOrdersRouter.post("/:id/delivery/:phase", async (req: Request, res: Response) => {
  if (!(await requireRole(req, res, ["admin", "owner", "logistics"]))) return;
  const id = parseInt(String(req.params["id"] ?? ""));
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });
  const phase = String(req.params["phase"] ?? "");
  const cfg = DELIVERY_PHASE_CONFIG[phase];
  if (!cfg) return res.status(400).json({ message: `Phase '${phase}' tidak dikenal. Gunakan: ${Object.keys(DELIVERY_PHASE_CONFIG).join(", ")}` });

  const [order] = await db
    .select({
      id: logisticOrdersTable.id,
      orderNumber: logisticOrdersTable.orderNumber,
      status: logisticOrdersTable.status,
      customerName: logisticOrdersTable.customerName,
      phone: logisticOrdersTable.phone,
      companyName: logisticOrdersTable.companyName,
    })
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, id))
    .limit(1);
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const actorName = (req as any).user?.fullName ?? (req as any).user?.name ?? "Admin";

  try {
    await transitionLogisticOrderStatus(id, cfg.status as Parameters<typeof transitionLogisticOrderStatus>[1], {
      source: `logisticOrders:delivery/${phase}`,
      actorType: "admin",
      actorName,
      notes: `${cfg.emoji} ${cfg.label} — diubah manual oleh admin`,
    });
  } catch (e: unknown) {
    const errMsg = e instanceof Error ? e.message : "Transisi status gagal";
    return res.status(422).json({ message: errMsg });
  }

  // WA notifications — fire-and-forget
  void (async () => {
    try {
      const adminWa = await getAdminWa();
      // invoice-issued: skip customer WA jika sudah dikirim via customer-invoice link (dedup 30 menit)
      const customerPhone = phase === "invoice-issued"
        ? (await wasRecentlyNotified("customer-invoice-wa", `order:${id}`, 30 * 60 * 1000)
            ? null
            : order.phone)
        : order.phone;
      await sendLogisticOperationalStatusNotification(
        {
          order_number: order.orderNumber,
          customer_name: order.customerName ?? "",
          company_name: order.companyName ?? null,
          phone: customerPhone ?? null,
        },
        cfg.label,
        cfg.emoji,
        adminWa,
      );
    } catch { /* non-fatal */ }
  })();

  return res.json({ ok: true, status: cfg.status, orderId: id, phase });
});
