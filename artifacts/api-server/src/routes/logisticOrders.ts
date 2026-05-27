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
} from "@workspace/db";
import { deleteFromSupabase } from "../lib/supabaseStorage.js";
import { eq, ilike, and, gte, lte, or, sql, desc, inArray, isNotNull } from "drizzle-orm";
import { salesDocumentsTable } from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";
import { requirePortalAdmin } from "../lib/supabaseAuth.js";
import { sendLogisticOrderNotification } from "../lib/orderNotification";
import { logActivity } from "../lib/activityLog.js";
// [FLOW BARU] autoCreateRfqAndNotifyVendors dinonaktifkan — vendor tidak boleh dihubungi langsung saat order dibuat.
// Admin harus review dulu via /bizportal/logistics/rfq sebelum blast ke vendor.
// import { autoCreateRfqAndNotifyVendors } from "./logisticRfq";
import { sendWhatsApp } from "../lib/fonnte";
import { saveAndBroadcast } from "../lib/notificationStore";
import {
  CreateLogisticOrderBody,
  ListLogisticOrdersQueryParams,
  GetLogisticOrderByNumberParams,
  GetLogisticOrderParams,
  UpdateLogisticOrderStatusParams,
  UpdateLogisticOrderStatusBody,
} from "@workspace/api-zod";

export const logisticOrdersRouter = Router();

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
    updatedAt: row.updatedAt.toISOString(),
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

// ─── PUBLIC ROUTES (no auth required) ────────────────────────────────────────

// POST /api/logistic/orders — create order (public)
logisticOrdersRouter.post("/", async (req: Request, res: Response) => {
  const parsed = CreateLogisticOrderBody.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Data tidak valid", errors: parsed.error.errors });
  }
  const body = parsed.data;

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
      subtotal: String(body.subtotal),
      tax: String(body.tax),
      grandTotal: String(body.grandTotal),
      status: "New Order",
      publicRfqToken: randomBytes(16).toString("hex"),
    })
    .returning();

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
  }).catch((err: unknown) => {
    req.log.error({ err }, "sendLogisticOrderNotification failed");
  });

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

  logActivity({
    orderId: order.id,
    actorType: "customer",
    actorName: body.customerName,
    action: "order_created",
    description: `Order ${orderNumber} dibuat oleh ${body.customerName} (${body.companyName ?? "-"}) — ${body.shipmentType} ${body.origin}→${body.destination}`,
    newValue: { orderNumber, grandTotal: body.grandTotal, shipmentType: body.shipmentType },
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

    const items = await db
      .select()
      .from(logisticOrderItemsTable)
      .where(eq(logisticOrderItemsTable.orderId, order.id));

    const [driverJob] = await db
      .select()
      .from(driverJobsTable)
      .where(eq(driverJobsTable.logisticOrderId, order.id))
      .orderBy(desc(driverJobsTable.assignedAt))
      .limit(1);

    let driverJobData = null;
    if (driverJob) {
      const logs = await db
        .select()
        .from(driverJobLogsTable)
        .where(eq(driverJobLogsTable.driverJobId, driverJob.id))
        .orderBy(desc(driverJobLogsTable.timestamp));

      const photos = await db
        .select()
        .from(driverPhotosTable)
        .where(eq(driverPhotosTable.driverJobId, driverJob.id))
        .orderBy(desc(driverPhotosTable.takenAt));

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

    // RFQ quote info untuk customer portal
    const [latestRfq] = await db
      .select()
      .from(logisticOrderRfqsTable)
      .where(eq(logisticOrderRfqsTable.orderId, order.id))
      .orderBy(desc(logisticOrderRfqsTable.createdAt))
      .limit(1);

    // Security: quotedPrice is financial/margin data — never expose on public tracking endpoint.
    // Only status and timing info is safe for unauthenticated callers.
    const rfqQuote = latestRfq ? {
      rfqId: latestRfq.id,
      rfqStatus: latestRfq.status,
      quotedAt: latestRfq.quotedAt?.toISOString() ?? null,
      customerResponseNotes: (latestRfq as any).customerResponseNotes ?? null,
      customerRespondedAt: (latestRfq as any).customerRespondedAt
        ? new Date((latestRfq as any).customerRespondedAt).toISOString() : null,
    } : null;

    return res.json({
      ...toPublicOrder(order),
      items: items.map(toPublicItem),
      driverJob: driverJobData,
      rfqQuote,
    });
  }
);

// GET /api/logistic/orders/trucking-rates — public
logisticOrdersRouter.get("/trucking-rates", async (_req: Request, res: Response) => {
  const rates = await getTruckingRates();
  return res.json(rates);
});

// GET /api/logistic/orders/vendors — admin & logistics staff
logisticOrdersRouter.get("/vendors", async (req: Request, res: Response) => {
  const user = (req as any).user;
  const allowed = ["admin", "owner", "logistics"];
  if (!user || !allowed.includes(user.role)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  const rows = await db.select().from(suppliersTable).orderBy(suppliersTable.sortOrder);
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
      : await db
          .select()
          .from(logisticOrdersTable)
          .orderBy(sql`${logisticOrdersTable.createdAt} DESC`);

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

  return res.json(rows.map((row) => ({
    ...toOrder(row),
    linkedSalesDocId: linkedDocMap.get(row.id)?.id ?? null,
    linkedSalesDocNumber: linkedDocMap.get(row.id)?.docNumber ?? null,
    latestRfq: rfqMap.get(row.id) ?? null,
    fulfillmentStatus: fulfillmentStatusMap.get(row.id) ?? null,
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

// POST /api/logistic/orders/vendors
logisticOrdersRouter.post("/vendors", async (req: Request, res: Response) => {
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

// PUT /api/logistic/orders/vendors/:id
logisticOrdersRouter.put("/vendors/:id", async (req: Request, res: Response) => {
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

// DELETE /api/logistic/orders/vendors/:id
logisticOrdersRouter.delete("/vendors/:id", async (req: Request, res: Response) => {
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
const VENDOR_NOTIFY_STATUSES = new Set([
  "Confirmed", "In Progress", "Completed", "Cancelled",
]);

const VENDOR_STATUS_LABELS: Record<string, string> = {
  "Confirmed":   "Dikonfirmasi ✅",
  "In Progress": "Sedang Diproses 🔄",
  "Completed":   "Selesai 🎉",
  "Cancelled":   "Dibatalkan ❌",
};

const VENDOR_STATUS_NOTES: Record<string, string> = {
  "Confirmed":
    "Customer telah mengkonfirmasi order. Silakan lanjutkan proses pengiriman sesuai rencana.",
  "In Progress":
    "Order kini berstatus In Progress. Pastikan semua berjalan sesuai jadwal dan SOP.",
  "Completed":
    "Order telah diselesaikan oleh tim CST Logistics. Terima kasih atas kerja sama Anda.",
  "Cancelled":
    "⚠️ Order ini telah DIBATALKAN. Mohon hentikan semua proses terkait order ini segera.",
};

async function notifyVendorStatusChange(
  order: { orderNumber: string; customerName: string | null; origin: string | null; destination: string | null; approvedVendorId: number | null },
  status: string,
) {
  if (!VENDOR_NOTIFY_STATUSES.has(status)) return;
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

    const label = VENDOR_STATUS_LABELS[status] ?? status;
    const note  = VENDOR_STATUS_NOTES[status] ?? "";
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

  const whereClause =
    clientVersion !== undefined
      ? and(eq(logisticOrdersTable.id, id), eq(logisticOrdersTable.version, clientVersion))
      : eq(logisticOrdersTable.id, id);

  // H3 — Optimistic locking: if client sends clientUpdatedAt, verify it matches
  // the current DB updatedAt to detect concurrent edits before committing.
  const clientUpdatedAt = typeof (req.body as Record<string, unknown>).clientUpdatedAt === "string"
    ? new Date((req.body as Record<string, unknown>).clientUpdatedAt as string)
    : null;
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

  const [updated] = await db
    .update(logisticOrdersTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(logisticOrdersTable.id, id))
    .set({ status, version: sql`${logisticOrdersTable.version} + 1` } as any)
    .where(whereClause)
    .returning();

  if (!updated) {
    const [exists] = await db.select({ id: logisticOrdersTable.id }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, id));
    if (!exists) return res.status(404).json({ message: "Order tidak ditemukan" });
    return res.status(409).json({ message: "Data sudah diubah oleh pengguna lain. Refresh halaman dan coba lagi." });
  }

  const adminName = (req.user as { name?: string } | undefined)?.name ?? "Admin";
  const adminId   = (req.user as { id?: string } | undefined)?.id ?? null;

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

  // Notify customer via WhatsApp (fire-and-forget)
  if (updated.phone) {
    const statusLabels: Record<string, string> = {
      "New Order": "Order Baru",
      "Under Review": "Sedang Ditinjau",
      "Quotation Sent": "Penawaran Telah Dikirim",
      "Confirmed": "Dikonfirmasi",
      "In Progress": "Sedang Diproses",
      "Completed": "Selesai",
      "Cancelled": "Dibatalkan",
    };
    const label = statusLabels[status] ?? status;
    const msg =
      `📦 *Update Status Order Anda*\n` +
      `No Order: ${updated.orderNumber}\n` +
      `Status: *${label}*\n\n` +
      `Terima kasih telah menggunakan layanan kami. Hubungi kami jika ada pertanyaan.`;
    sendWhatsApp(updated.phone, msg, {
      context: "order_status_change",
      refType: "order",
      refId: updated.orderNumber,
    }).catch(() => undefined);
  }

  // Notify vendor via WhatsApp (fire-and-forget)
  notifyVendorStatusChange(updated, status).catch(() => undefined);

  saveAndBroadcast("logistic_order_status_changed", {
    type: "logistic_status",
    orderId: updated.id,
    orderNumber: updated.orderNumber,
    customerName: updated.customerName,
    companyName: updated.companyName ?? null,
    status: updated.status,
    updatedAt: new Date().toISOString(),
  }).catch(() => {});

  return res.json(toOrder(updated));
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
    status: z.enum(["New Order", "Confirmed", "In Progress", "Completed", "Cancelled"]),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "ids dan status harus valid" });
  const { ids, status } = parsed.data;
  const updated = await db
    .update(logisticOrdersTable)
    .set({ status })
    .where(inArray(logisticOrdersTable.id, ids))
    .returning({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber });

  const adminName = (req.user as { name?: string } | undefined)?.name ?? "Admin";
  const adminId   = (req.user as { id?: string } | undefined)?.id ?? null;

  // Log audit trail + timeline for each affected order (fire-and-forget)
  for (const row of updated) {
    logActivity({
      orderId: row.id,
      actorType: "admin",
      actorName: adminName,
      actorId: adminId,
      action: "bulk_status_changed",
      description: `Bulk status change → "${status}"`,
      newValue: { status },
      ipAddress: req.ip ?? null,
    }).catch(() => {});
    db.insert(orderUpdatesTable).values({
      orderId: row.id,
      actorType: "admin",
      actorId: adminId,
      actorName: adminName,
      status,
      notes: `Status diubah (bulk) menjadi "${status}"`,
      isPublic: false,
    }).catch(() => {});
  }

  return res.json({ message: "Updated", updatedIds: updated.map((r) => r.id), count: updated.length });
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

// GET /api/logistic/orders/:id/locations — GPS history for an order (admin)
logisticOrdersRouter.get("/:id/locations", async (req: Request, res: Response) => {
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
