import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import { eq, and, inArray, sql } from "drizzle-orm";
import multer from "multer";
import {
  db,
  rfqVendorLinksTable,
  rfqActivityLogsTable,
  logisticOrderRfqsTable,
  logisticOrdersTable,
  logisticOrderItemsTable,
  suppliersTable,
  vendorCatalogItemsTable,
  freightShipmentsTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminGroupWa } from "../lib/adminWa.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  sendVendorRequestNotification,
  sendVendorSubmissionNotification,
  sendVendorRevisionNotification,
  sendVendorRevisionFallbackNotification,
  sendCustomerRfqResponseAdminNotification,
  sendCustomerApprovalNotification,
  getRfqVendorRecapTemplate,
  renderTemplate,
  type LogisticOrderData,
} from "../lib/orderNotification.js";

export const logisticRfqV2Router = Router();

function buildOrderData(order: typeof logisticOrdersTable.$inferSelect): LogisticOrderData {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    companyName: order.companyName ?? "",
    email: order.email,
    phone: order.phone,
    orderType: order.orderType ?? undefined,
    shipmentType: order.shipmentType,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    cargoDescription: order.cargoDescription ?? null,
    grossWeight: order.grossWeight ? Number(order.grossWeight) : null,
    volumeCbm: order.volumeCbm ? Number(order.volumeCbm) : null,
    jumlahKoli: order.jumlahKoli ?? null,
    grandTotal: order.grandTotal ? Number(order.grandTotal) : 0,
    serviceList: order.shipmentType,
    requiredDate: order.requiredDate ?? null,
    notes: order.notes ?? null,
    jamOrder: order.jamOrder ?? null,
    vehicleType: order.truckType ?? null,
    createdAt: order.createdAt ?? null,
    publicRfqToken: order.publicRfqToken ?? null,
  };
}

async function buildOrderDataWithItems(order: typeof logisticOrdersTable.$inferSelect): Promise<LogisticOrderData> {
  const base = buildOrderData(order);
  try {
    const items = await db.select({
      name: logisticOrderItemsTable.serviceName,
      subtotal: logisticOrderItemsTable.subtotal,
    }).from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, order.id));
    base.orderItems = items.map(i => ({
      name: i.name,
      subtotal: i.subtotal ? parseFloat(i.subtotal) : null,
    }));
  } catch { /* non-critical, skip */ }
  return base;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const objectStorage = new ObjectStorageService();

// ─── Migrations ────────────────────────────────────────────────────────────────
db.execute(sql`
  CREATE TABLE IF NOT EXISTS rfq_vendor_links (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES logistic_order_rfqs(id) ON DELETE CASCADE,
    vendor_id INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'waiting_response',
    basic_price NUMERIC(14,2),
    offered_price NUMERIC(14,2),
    eta TEXT,
    notes TEXT,
    attachment_url TEXT,
    is_new_update BOOLEAN NOT NULL DEFAULT FALSE,
    opened_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    last_updated_at TIMESTAMPTZ,
    expired_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch((e: unknown) => logger.warn({ e }, "rfq_vendor_links migration warn"));

db.execute(sql`
  CREATE TABLE IF NOT EXISTS rfq_activity_logs (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT,
    actor_name TEXT,
    action TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch((e: unknown) => logger.warn({ e }, "rfq_activity_logs migration warn"));

// Migrate RFQ status: rename 'open' default → support new status values
// Valid status: admin_review | vendor_blasted | vendor_selected | customer_quoted
//               customer_approved | customer_revision_requested | customer_rejected | closed
db.execute(sql`
  DO $$
  BEGIN
    -- Add customer_response_notes
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='customer_response_notes'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN customer_response_notes TEXT;
    END IF;

    -- Add customer_responded_at
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='customer_responded_at'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN customer_responded_at TIMESTAMPTZ;
    END IF;
  END $$;
`).catch((e: unknown) => logger.warn({ e }, "rfq customer response migration warn"));

db.execute(sql`
  DO $$
  BEGIN
    -- Add response_deadline if missing (older schema)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='response_deadline'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN response_deadline TIMESTAMPTZ;
    END IF;

    -- Add basic_price to rfq for initial admin estimate
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='basic_price'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN basic_price NUMERIC(14,2);
    END IF;

    -- Rename any 'open' status rows to 'admin_review' (migration)
    UPDATE logistic_order_rfqs SET status = 'admin_review'
      WHERE status = 'open';

    -- Change default for new rows
    ALTER TABLE logistic_order_rfqs ALTER COLUMN status SET DEFAULT 'admin_review';

    -- Add customer quote fields
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='quoted_price'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN quoted_price NUMERIC(14,2);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='quoted_at'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN quoted_at TIMESTAMPTZ;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name='logistic_order_rfqs' AND column_name='quote_notes'
    ) THEN
      ALTER TABLE logistic_order_rfqs ADD COLUMN quote_notes TEXT;
    END IF;
  END $$;
`).catch((e: unknown) => logger.warn({ e }, "rfq status migration warn"));

// Migration: add freight_shipment_id to logistic_order_rfqs
db.execute(sql`
  ALTER TABLE logistic_order_rfqs
    ADD COLUMN IF NOT EXISTS freight_shipment_id INTEGER;
`).catch((e: unknown) => logger.warn({ e }, "rfq freight_shipment_id migration warn"));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getVendorFormUrl(token: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/vendor-form/${encodeURIComponent(token)}`;
}

function getComparisonUrl(rfqId: number): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/rfq/${rfqId}/comparison`;
}

const fmtRp = (n: number | string | null | undefined) =>
  n == null ? "—" : `Rp ${Math.round(Number(n)).toLocaleString("id-ID")}`;

const STATUS_LABEL: Record<string, string> = {
  waiting_response: "Menunggu",
  accepted_basic_price: "Terima Harga",
  counter_offer: "Counter Offer",
  rejected: "Tolak",
  expired: "Kadaluarsa",
  selected: "Dipilih",
  not_selected: "Tidak Dipilih",
  late_response: "Terlambat",
};

async function logActivity(
  rfqId: number,
  actorType: string,
  actorName: string,
  action: string,
  description: string,
) {
  await db.insert(rfqActivityLogsTable).values({ rfqId, actorType, actorName, action, description }).catch(() => {});
}

async function sendAdminRecapWa(rfqId: number, rfq: { rfqNumber: string; orderId: number }) {
  const adminTarget = await getAdminGroupWa();
  if (!adminTarget) return;

  const [order] = await db.select({
    shipmentType: logisticOrdersTable.shipmentType,
    origin: logisticOrdersTable.origin,
    destination: logisticOrdersTable.destination,
  }).from(logisticOrdersTable).where(eq(logisticOrdersTable.id, rfq.orderId));

  const links = await db.select().from(rfqVendorLinksTable)
    .where(eq(rfqVendorLinksTable.rfqId, rfqId))
    .orderBy(sql`COALESCE(offered_price, basic_price) ASC NULLS LAST, created_at ASC`);

  const vendorIds = links.map((l) => l.vendorId);
  const vendors = vendorIds.length
    ? await db.select({ id: suppliersTable.id, name: suppliersTable.name })
        .from(suppliersTable).where(inArray(suppliersTable.id, vendorIds))
    : [];
  const vendorMap = new Map(vendors.map((v) => [v.id, v.name]));

  const answered = links.filter((l) => l.submittedAt && l.status !== "waiting_response" && l.status !== "expired");
  const waiting = links.filter((l) => !l.submittedAt && l.status === "waiting_response");
  const rejected = links.filter((l) => l.status === "rejected");
  const sorted = [
    ...answered.filter((l) => l.status !== "rejected").sort((a, b) =>
      Number(a.offeredPrice ?? a.basicPrice ?? 9e9) - Number(b.offeredPrice ?? b.basicPrice ?? 9e9)
    ),
    ...rejected,
  ];

  let listStr = "";
  sorted.forEach((l, i) => {
    const name = vendorMap.get(l.vendorId) ?? `Vendor #${l.vendorId}`;
    const price = l.offeredPrice ?? l.basicPrice;
    const eta = l.eta ? ` — ETA ${l.eta}` : "";
    const stLabel = STATUS_LABEL[l.status] ?? l.status;
    listStr += `${i + 1}. ${name} — ${fmtRp(price)}${eta} — ${stLabel}\n`;
  });

  let waitingStr = "";
  waiting.forEach((l) => {
    waitingStr += `- ${vendorMap.get(l.vendorId) ?? `Vendor #${l.vendorId}`}\n`;
  });

  const compLink = getComparisonUrl(rfqId);

  // Generate compare_vendors mini-form link (no-login) when there is at least one vendor response
  let compareAdminLink = compLink;
  if (answered.length > 0) {
    try {
      const { createAdminActionLink, getAdminActionUrl } = await import("./adminAction.js");
      const { generateShortLink } = await import("../lib/shortLink.js");
      const cmpToken = await createAdminActionLink(rfq.orderId, "compare_vendors", rfqId, 72);
      const cmpUrl = getAdminActionUrl(cmpToken);
      compareAdminLink = await generateShortLink(cmpUrl, { context: "admin_action", refType: "rfq", refId: String(rfqId) });
    } catch (e) {
      logger.warn({ e }, "sendAdminRecapWa: gagal generate compare_vendors link");
    }
  }

  const tplRfqRecap = await getRfqVendorRecapTemplate();
  const vendorListWithHeader = listStr ? `📋 *Daftar penawaran:*\n${listStr.trimEnd()}` : null;
  const waitingListWithHeader = waitingStr ? `⏳ *Belum jawab:*\n${waitingStr.trimEnd()}` : null;
  const msg = renderTemplate(tplRfqRecap, {
    rfqNumber: rfq.rfqNumber,
    shipmentType: order?.shipmentType ?? "—",
    route: order ? `${order.origin} → ${order.destination}` : "—",
    vendorListWithHeader,
    waitingListWithHeader,
    compareLink: compareAdminLink,
    timestamp: new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta" }),
  });

  sendWhatsApp(adminTarget, msg).catch((e: unknown) =>
    logger.error({ e }, "sendAdminRecapWa failed")
  );
}

// ─── ADMIN: GET /rfq/list ─────────────────────────────────────────────────────
// Daftar semua RFQ untuk admin dashboard, diurutkan terbaru dulu
logisticRfqV2Router.get("/rfq/list", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;

  const { status, limit = "50", offset = "0" } = req.query as Record<string, string>;

  let query = db
    .select({
      rfqId: logisticOrderRfqsTable.id,
      rfqNumber: logisticOrderRfqsTable.rfqNumber,
      rfqStatus: logisticOrderRfqsTable.status,
      responseDeadline: logisticOrderRfqsTable.responseDeadline,
      createdAt: logisticOrderRfqsTable.createdAt,
      orderId: logisticOrdersTable.id,
      orderNumber: logisticOrdersTable.orderNumber,
      customerName: logisticOrdersTable.customerName,
      serviceType: logisticOrdersTable.shipmentType,
      origin: logisticOrdersTable.origin,
      destination: logisticOrdersTable.destination,
    })
    .from(logisticOrderRfqsTable)
    .innerJoin(logisticOrdersTable, eq(logisticOrderRfqsTable.orderId, logisticOrdersTable.id))
    .orderBy(sql`${logisticOrderRfqsTable.createdAt} DESC`)
    .limit(Math.min(Number(limit) || 50, 200))
    .offset(Number(offset) || 0);

  if (status) {
    (query as any).where(eq(logisticOrderRfqsTable.status, status));
  }

  const rows = await query;

  // Attach vendor link stats per RFQ
  const rfqIds = rows.map((r) => r.rfqId);
  const allLinks = rfqIds.length
    ? await db.select({ rfqId: rfqVendorLinksTable.rfqId, status: rfqVendorLinksTable.status })
        .from(rfqVendorLinksTable).where(inArray(rfqVendorLinksTable.rfqId, rfqIds))
    : [];

  const linksByRfq = new Map<number, typeof allLinks>();
  for (const l of allLinks) {
    if (!linksByRfq.has(l.rfqId)) linksByRfq.set(l.rfqId, []);
    linksByRfq.get(l.rfqId)!.push(l);
  }

  const result = rows.map((r) => {
    const links = linksByRfq.get(r.rfqId) ?? [];
    return {
      ...r,
      responseDeadline: r.responseDeadline?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      comparisonUrl: `/logistics/rfq/${r.rfqId}/comparison`,
      vendorStats: {
        total: links.length,
        waiting: links.filter((l) => l.status === "waiting_response").length,
        answered: links.filter((l) => ["accepted_basic_price", "counter_offer", "selected", "not_selected", "late_response"].includes(l.status)).length,
        rejected: links.filter((l) => l.status === "rejected").length,
        expired: links.filter((l) => l.status === "expired").length,
      },
    };
  });

  return res.json(result);
});

// ─── ADMIN: POST /rfq/create-from-order/:orderId ──────────────────────────────
// Buat RFQ baru dari order yang sudah ada, status awal = admin_review
logisticRfqV2Router.post("/rfq/create-from-order/:orderId", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(req.params.orderId as string, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const { notes, responseDeadlineHours, basicPrice } = req.body as {
    notes?: string;
    responseDeadlineHours?: number;
    basicPrice?: number;
  };

  // Generate RFQ number
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 9000) + 1000;
  const rfqNumber = `RFQ/${y}${m}${d}/${rand}`;

  const responseDeadline = responseDeadlineHours
    ? new Date(Date.now() + responseDeadlineHours * 60 * 60 * 1000)
    : null;

  const [rfq] = await db.insert(logisticOrderRfqsTable).values({
    orderId,
    rfqNumber,
    status: "admin_review",
    notes: notes ?? null,
    responseDeadline: responseDeadline ?? undefined,
  }).returning();

  const user = (req as any).user;
  await logActivity(rfq.id, "admin", user?.name ?? "Admin", "rfq_created",
    `RFQ ${rfqNumber} dibuat oleh admin untuk order ${order.orderNumber}`);

  return res.status(201).json({
    rfqId: rfq.id,
    rfqNumber: rfq.rfqNumber,
    status: rfq.status,
    orderId,
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    comparisonUrl: getComparisonUrl(rfq.id),
  });
});

// ─── PUBLIC: GET /vendor-form/:token ─────────────────────────────────────────
logisticRfqV2Router.get("/vendor-form/:token", async (req: Request, res: Response) => {
  const token = (req.params.token as string | undefined)?.trim();
  if (!token) return res.status(400).json({ message: "Token tidak valid" });

  const [link] = await db.select().from(rfqVendorLinksTable)
    .where(eq(rfqVendorLinksTable.token, token));
  if (!link) return res.status(404).json({ message: "Link tidak valid atau sudah kadaluarsa" });

  if (link.expiredAt && link.expiredAt < new Date() && link.status === "waiting_response") {
    await db.update(rfqVendorLinksTable).set({ status: "expired" })
      .where(eq(rfqVendorLinksTable.id, link.id));
    return res.status(410).json({ message: "Link sudah kadaluarsa" });
  }
  if (link.status === "expired") return res.status(410).json({ message: "Link sudah kadaluarsa" });

  if (!link.openedAt) {
    await db.update(rfqVendorLinksTable).set({ openedAt: new Date() })
      .where(eq(rfqVendorLinksTable.id, link.id)).catch(() => {});
  }

  // Use raw SQL to include freight_shipment_id (added via migration, not in Drizzle schema)
  const rfqRows = await db.execute(sql`
    SELECT *, freight_shipment_id FROM logistic_order_rfqs WHERE id = ${link.rfqId}
  `);
  const rfqRaw = rfqRows.rows?.[0] as Record<string, unknown> | undefined;
  if (!rfqRaw) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const rfqId = Number(rfqRaw.id);
  const rfqNumber = String(rfqRaw.rfq_number ?? "");
  const orderId = Number(rfqRaw.order_id);
  const freightShipmentId: number | null = rfqRaw.freight_shipment_id
    ? Number(rfqRaw.freight_shipment_id) : null;
  const rfqResponseDeadline = rfqRaw.response_deadline
    ? new Date(rfqRaw.response_deadline as string) : null;

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [vendor] = await db.select({ name: suppliersTable.name })
    .from(suppliersTable).where(eq(suppliersTable.id, link.vendorId));

  // Fetch order items for additional context
  const orderItems = await db.select({
    serviceName: logisticOrderItemsTable.serviceName,
    category: logisticOrderItemsTable.category,
    calculatorType: logisticOrderItemsTable.calculatorType,
    inputData: logisticOrderItemsTable.inputData,
    subtotal: logisticOrderItemsTable.subtotal,
  }).from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, orderId));

  // Prefer order items subtotal sum as reference price (most accurate)
  const orderSubtotal = orderItems.reduce(
    (sum, i) => sum + (i.subtotal ? parseFloat(i.subtotal) : 0), 0
  );
  let basicPrice: number | null = orderSubtotal > 0 ? orderSubtotal : null;
  if (basicPrice == null) {
    basicPrice = link.basicPrice ? Number(link.basicPrice) : null;
  }
  if (basicPrice == null) {
    const catalog = await db.select().from(vendorCatalogItemsTable)
      .where(and(eq(vendorCatalogItemsTable.vendorId, link.vendorId), eq(vendorCatalogItemsTable.isActive, true)));
    basicPrice = catalog[0] ? Number(catalog[0].priceBase) : null;
  }

  // Fallback to freight shipment data when order fields are empty
  let serviceType = order.shipmentType ?? "";
  let origin = order.origin ?? "";
  let destination = order.destination ?? "";
  let commodity = order.commodity ?? null;
  let cargoDescription = order.cargoDescription ?? null;
  let grossWeight = order.grossWeight ? parseFloat(order.grossWeight) : null;
  let volumeCbm = order.volumeCbm ? parseFloat(order.volumeCbm) : null;

  if (freightShipmentId && (!origin || !destination || !serviceType)) {
    const [shipment] = await db.select().from(freightShipmentsTable)
      .where(eq(freightShipmentsTable.id, freightShipmentId));
    if (shipment) {
      if (!origin) origin = shipment.origin ?? "";
      if (!destination) destination = shipment.destination ?? "";
      if (!serviceType) serviceType = shipment.transportMode ?? shipment.cargoType ?? "Freight";
      if (!commodity) commodity = shipment.commodity ?? null;
      if (!cargoDescription) cargoDescription = shipment.packingType ?? null;
      if (grossWeight == null && shipment.grossWeight) grossWeight = parseFloat(shipment.grossWeight);
    }
  }

  // Derive serviceType from order items if still empty
  if (!serviceType && orderItems.length > 0) {
    const uniqueCategories = [...new Set(orderItems.map((i) => i.category).filter(Boolean))];
    serviceType = uniqueCategories.join(", ");
  }

  // Extract origin/destination from item inputData for trucking items
  if ((!origin || !destination) && orderItems.length > 0) {
    for (const item of orderItems) {
      const input = item.inputData as Record<string, unknown> | null;
      if (!origin && input?.origin) origin = String(input.origin);
      if (!destination && input?.destination) destination = String(input.destination);
      if (origin && destination) break;
    }
  }

  return res.json({
    linkId: link.id,
    rfqNumber,
    vendorName: vendor?.name ?? `Vendor #${link.vendorId}`,
    orderType: (() => {
      if (order.orderType) return order.orderType;
      // Derive dari orderItems jika order.orderType null (order lama)
      const hasProduct = orderItems.some(
        (i) => i.calculatorType === "product" ||
               i.category?.toLowerCase().includes("produk") ||
               i.category?.toLowerCase().includes("product")
      );
      if (hasProduct) return "product";
      const hasService = orderItems.some(
        (i) => i.calculatorType === "service" ||
               i.category?.toLowerCase().includes("servis") ||
               i.category?.toLowerCase().includes("service") ||
               i.category?.toLowerCase().includes("jasa")
      );
      if (hasService) return "service";
      return "shipment";
    })(),
    serviceType,
    origin,
    destination,
    commodity,
    cargoDescription,
    grossWeight,
    volumeCbm,
    requiredDate: order.requiredDate ?? null,
    basicPrice,
    responseDeadline: link.expiredAt?.toISOString() ?? rfqResponseDeadline?.toISOString() ?? null,
    alreadySubmitted: !!link.submittedAt,
    currentStatus: link.status,
    currentOfferedPrice: link.offeredPrice ? Number(link.offeredPrice) : null,
    currentEta: link.eta ?? null,
    currentNotes: link.notes ?? null,
    orderItems: orderItems.map((i) => ({
      serviceName: i.serviceName,
      category: i.category,
      calculatorType: i.calculatorType,
      subtotal: i.subtotal ? parseFloat(i.subtotal) : null,
    })),
  });
});

// ─── PUBLIC: POST /vendor-form/:token ────────────────────────────────────────
logisticRfqV2Router.post("/vendor-form/:token/upload", upload.single("file") as any, async (req: Request, res: Response) => {
  const token = (req.params.token as string | undefined)?.trim();
  if (!token) return res.status(400).json({ message: "Token tidak valid" });
  const [link] = await db.select({ id: rfqVendorLinksTable.id, status: rfqVendorLinksTable.status })
    .from(rfqVendorLinksTable).where(eq(rfqVendorLinksTable.token, token));
  if (!link) return res.status(404).json({ message: "Token tidak valid" });
  if (!req.file) return res.status(400).json({ message: "Tidak ada file" });
  try {
    const objectId = randomUUID();
    const storagePath = `public/rfq-attachments/${objectId}`;
    await objectStorage.uploadFile(req.file.buffer, storagePath, req.file.mimetype);
    const url = objectStorage.getPublicUrl(storagePath);
    return res.json({ url });
  } catch (e) {
    logger.error({ e }, "rfq attachment upload failed");
    return res.status(500).json({ message: "Gagal upload" });
  }
});

logisticRfqV2Router.post("/vendor-form/:token", async (req: Request, res: Response) => {
  const token = (req.params.token as string | undefined)?.trim();
  if (!token) return res.status(400).json({ message: "Token tidak valid" });

  const [link] = await db.select().from(rfqVendorLinksTable)
    .where(eq(rfqVendorLinksTable.token, token));
  if (!link) return res.status(404).json({ message: "Link tidak valid" });

  if (link.expiredAt && link.expiredAt < new Date() && link.status === "waiting_response") {
    await db.update(rfqVendorLinksTable).set({ status: "expired" }).where(eq(rfqVendorLinksTable.id, link.id));
    return res.status(410).json({ message: "Link sudah kadaluarsa" });
  }
  if (link.status === "expired") return res.status(410).json({ message: "Link sudah kadaluarsa" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.id, link.rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const { action, offeredPrice, eta, notes, attachmentUrl } = req.body as {
    action: "accept" | "counter" | "reject";
    offeredPrice?: number;
    eta?: string;
    notes?: string;
    attachmentUrl?: string;
  };

  if (!action || !["accept", "counter", "reject"].includes(action)) {
    return res.status(400).json({ message: "action harus accept, counter, atau reject" });
  }
  if (action === "counter") {
    if (!offeredPrice || Number(offeredPrice) <= 0) return res.status(400).json({ message: "Harga penawaran harus diisi" });
    if (!eta) return res.status(400).json({ message: "ETA harus diisi" });
  }

  const isLate = !!(rfq.status && ["vendor_selected", "closed"].includes(rfq.status));
  let newStatus: string;
  if (isLate) {
    newStatus = "late_response";
  } else if (action === "accept") {
    newStatus = "accepted_basic_price";
  } else if (action === "counter") {
    newStatus = "counter_offer";
  } else {
    newStatus = "rejected";
  }

  const [vendor] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
    .where(eq(suppliersTable.id, link.vendorId));
  const vendorName = vendor?.name ?? `Vendor #${link.vendorId}`;

  const now = new Date();
  const isUpdate = !!link.submittedAt;
  await db.update(rfqVendorLinksTable).set({
    status: newStatus,
    offeredPrice: action === "accept"
      ? (link.basicPrice ?? (await (async () => {
          const items = await db.select({ subtotal: logisticOrderItemsTable.subtotal })
            .from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, rfq.orderId));
          const sum = items.reduce((s, i) => s + (i.subtotal ? parseFloat(i.subtotal) : 0), 0);
          return sum > 0 ? String(Math.round(sum)) : null;
        })()))
      : (offeredPrice ? String(offeredPrice) : null),
    eta: eta ?? null,
    notes: notes ?? null,
    attachmentUrl: attachmentUrl ?? link.attachmentUrl,
    isNewUpdate: true,
    submittedAt: link.submittedAt ?? now,
    lastUpdatedAt: now,
  }).where(eq(rfqVendorLinksTable.id, link.id));

  const actionLabel = action === "accept" ? "Terima Harga Basic"
    : action === "counter" ? `Counter Offer ${fmtRp(offeredPrice)}`
    : "Tolak";
  const actDesc = isUpdate
    ? `${vendorName} memperbarui penawaran: ${actionLabel}`
    : `${vendorName} submit penawaran: ${actionLabel}`;
  await logActivity(link.rfqId, "vendor", vendorName, isUpdate ? "vendor_update" : "vendor_submit", actDesc);

  await sendAdminRecapWa(link.rfqId, rfq);

  // Notifikasi template ke admin saat vendor submit penawaran
  db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, rfq.orderId)).limit(1)
    .then(([orderRow]) => {
      if (!orderRow) return;
      const priceNum = action === "accept"
        ? (link.basicPrice ? Number(link.basicPrice) : null)
        : (offeredPrice ? Number(offeredPrice) : null);
      sendVendorSubmissionNotification(
        buildOrderData(orderRow),
        vendorName,
        priceNum != null ? fmtRp(priceNum) : "—",
      ).catch((e: unknown) => logger.error({ e }, "sendVendorSubmissionNotification failed"));
    }).catch(() => {});

  return res.json({ success: true, message: "Penawaran berhasil dikirim", isUpdate });
});

// ─── ADMIN: POST /orders/:orderId/rfq-blast ─ create-or-reuse RFQ + blast ────
logisticRfqV2Router.post("/orders/:orderId/rfq-blast", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(req.params.orderId as string, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const { vendorIds, deadlineHours = 48, notes } = req.body as {
    vendorIds: number[];
    deadlineHours?: number;
    notes?: string;
  };
  if (!vendorIds?.length) return res.status(400).json({ message: "vendorIds wajib diisi" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Reuse existing RFQ or create new one
  const existingRfqs = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.orderId, orderId))
    .orderBy(sql`created_at DESC`)
    .limit(1);
  let rfq = existingRfqs[0];
  if (!rfq) {
    const now = new Date();
    const seq = String(Date.now()).slice(-6);
    const rfqNumber = `RFQ/${now.getFullYear()}/${seq}`;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [inserted] = await (db.insert(logisticOrderRfqsTable) as any).values({
      orderId,
      rfqNumber,
      vendorIds: [],
      notes: notes ?? null,
      status: "admin_review",
    }).returning();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rfq = inserted as any;
  }

  const rfqId = rfq.id;
  const expiredAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);

  const vendors = await db.select().from(suppliersTable).where(inArray(suppliersTable.id, vendorIds));
  const eligible = vendors.filter((v) => v.phone);
  if (!eligible.length) return res.status(400).json({ message: "Tidak ada vendor dengan nomor WA" });

  const existingLinks = await db.select().from(rfqVendorLinksTable).where(eq(rfqVendorLinksTable.rfqId, rfqId));
  const results: { vendorId: number; vendorName: string; sent: boolean }[] = [];

  // Compute basicPrice from order items subtotal sum (preferred) or catalog fallback
  const orderItemsForPrice = await db.select({ subtotal: logisticOrderItemsTable.subtotal })
    .from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, orderId));
  const orderSubtotalSum = orderItemsForPrice.reduce(
    (sum, i) => sum + (i.subtotal ? parseFloat(i.subtotal) : 0), 0
  );

  for (const vendor of eligible) {
    let linkToken: string;
    const existingLink = existingLinks.find((l) => l.vendorId === vendor.id);
    if (existingLink) {
      linkToken = existingLink.token;
    } else {
      let basicPrice: string | null = null;
      if (orderSubtotalSum > 0) {
        basicPrice = String(Math.round(orderSubtotalSum));
      } else {
        const catalogItems = await db.select().from(vendorCatalogItemsTable)
          .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
        basicPrice = catalogItems[0] ? String(catalogItems[0].priceBase) : null;
      }
      linkToken = randomUUID();
      await db.insert(rfqVendorLinksTable).values({
        rfqId,
        vendorId: vendor.id,
        token: linkToken,
        status: "waiting_response",
        basicPrice: basicPrice ?? undefined,
        expiredAt,
      });
    }

    const formUrl = getVendorFormUrl(linkToken);
    const existingLinkRow = existingLinks.find((l) => l.vendorId === vendor.id);
    const basicPriceNum = existingLinkRow?.basicPrice ?? null;
    const fmtBasic = basicPriceNum ? ` (Harga Dasar: ${fmtRp(basicPriceNum)})` : "";

    try {
      await sendVendorRequestNotification(await buildOrderDataWithItems(order), vendor.name, vendor.phone!, formUrl);
      results.push({ vendorId: vendor.id, vendorName: vendor.name, sent: true });
    } catch (e) {
      logger.error({ e, vendorId: vendor.id }, "rfq-blast WA failed");
      results.push({ vendorId: vendor.id, vendorName: vendor.name, sent: false });
    }
  }

  // Update RFQ vendorIds + status
  const allVendorIds = [
    ...new Set([
      ...(Array.isArray(rfq.vendorIds) ? (rfq.vendorIds as number[]) : []),
      ...eligible.map((v) => v.id),
    ]),
  ];
  await db.update(logisticOrderRfqsTable).set({
    vendorIds: allVendorIds,
    status: "vendor_blasted",
    responseDeadline: expiredAt,
  }).where(eq(logisticOrderRfqsTable.id, rfqId));

  // Bump order status to Under Review if still New Order
  if (order.status === "New Order") {
    await db.update(logisticOrdersTable)
      .set({ status: "Under Review" })
      .where(eq(logisticOrdersTable.id, orderId));
  }

  const sentCount = results.filter((r) => r.sent).length;
  await logActivity(rfqId, "admin", "Admin", "admin_blast",
    `Admin blast ke ${sentCount} vendor: ${eligible.map((v) => v.name).join(", ")}`);

  return res.json({ ok: true, rfqId, rfqNumber: rfq.rfqNumber, sentCount, comparisonUrl: getComparisonUrl(rfqId) });
});

// ─── ADMIN: POST /rfq/:rfqId/blast ────────────────────────────────────────────
logisticRfqV2Router.post("/rfq/:rfqId/blast", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  if (isNaN(rfqId)) return res.status(400).json({ message: "rfqId tidak valid" });

  const { vendorIds, deadlineHours = 48 } = req.body as { vendorIds: number[]; deadlineHours?: number };
  if (!vendorIds?.length) return res.status(400).json({ message: "vendorIds wajib diisi" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.id, rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const vendors = await db.select().from(suppliersTable)
    .where(inArray(suppliersTable.id, vendorIds));
  const eligible = vendors.filter((v) => v.phone);
  if (!eligible.length) return res.status(400).json({ message: "Tidak ada vendor dengan nomor WA" });

  const expiredAt = new Date(Date.now() + deadlineHours * 60 * 60 * 1000);
  const existingLinks = await db.select().from(rfqVendorLinksTable)
    .where(eq(rfqVendorLinksTable.rfqId, rfqId));
  const existingVendorIds = new Set(existingLinks.map((l) => l.vendorId));

  // Compute basicPrice from order items subtotal sum (preferred) or catalog fallback
  const orderItemsForPrice2 = await db.select({ subtotal: logisticOrderItemsTable.subtotal })
    .from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, rfq.orderId));
  const orderSubtotalSum2 = orderItemsForPrice2.reduce(
    (sum, i) => sum + (i.subtotal ? parseFloat(i.subtotal) : 0), 0
  );

  const results: { vendorId: number; vendorName: string; token: string; sent: boolean }[] = [];

  for (const vendor of eligible) {
    let linkToken: string;
    let linkId: number;

    const existingLink = existingLinks.find((l) => l.vendorId === vendor.id);
    if (existingLink) {
      linkToken = existingLink.token;
      linkId = existingLink.id;
    } else {
      let basicPrice: string | null = null;
      if (orderSubtotalSum2 > 0) {
        basicPrice = String(Math.round(orderSubtotalSum2));
      } else {
        const catalogItems = await db.select().from(vendorCatalogItemsTable)
          .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
        basicPrice = catalogItems[0] ? String(catalogItems[0].priceBase) : null;
      }
      linkToken = randomUUID();
      const [inserted] = await db.insert(rfqVendorLinksTable).values({
        rfqId,
        vendorId: vendor.id,
        token: linkToken,
        status: "waiting_response",
        basicPrice: basicPrice ?? undefined,
        expiredAt,
      }).returning({ id: rfqVendorLinksTable.id });
      linkId = inserted.id;
    }

    const formUrl = getVendorFormUrl(linkToken);
    const basicPriceNum = existingLink?.basicPrice ?? null;
    const fmtBasic = basicPriceNum ? ` (Harga Dasar: ${fmtRp(basicPriceNum)})` : "";

    try {
      await sendVendorRequestNotification(await buildOrderDataWithItems(order), vendor.name, vendor.phone!, formUrl);
      results.push({ vendorId: vendor.id, vendorName: vendor.name, token: linkToken, sent: true });
    } catch (e) {
      logger.error({ e, vendorId: vendor.id }, "blast WA vendor failed");
      results.push({ vendorId: vendor.id, vendorName: vendor.name, token: linkToken, sent: false });
    }
  }

  const newVendorIds = [...new Set([...(Array.isArray(rfq.vendorIds) ? rfq.vendorIds as number[] : []), ...eligible.map((v) => v.id)])];
  await db.update(logisticOrderRfqsTable).set({
    vendorIds: newVendorIds,
    status: "vendor_blasted",
    responseDeadline: expiredAt,
  }).where(eq(logisticOrderRfqsTable.id, rfqId));

  const sentCount = results.filter((r) => r.sent).length;
  await logActivity(rfqId, "admin", "Admin", "admin_blast", `Admin blast ke ${sentCount} vendor: ${eligible.map((v) => v.name).join(", ")}`);

  return res.json({ ok: true, rfqNumber: rfq.rfqNumber, sentCount, results, comparisonUrl: getComparisonUrl(rfqId) });
});

// ─── ADMIN: GET /rfq/:rfqId/comparison ───────────────────────────────────────
logisticRfqV2Router.get("/rfq/:rfqId/comparison", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  if (isNaN(rfqId)) return res.status(400).json({ message: "rfqId tidak valid" });

  // Use raw SQL to include freight_shipment_id added via migration
  const rfqRows = await db.execute(sql`
    SELECT *, freight_shipment_id FROM logistic_order_rfqs WHERE id = ${rfqId}
  `);
  const rfqRaw = rfqRows.rows[0] as any;
  if (!rfqRaw) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.id, rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const freightShipmentId: number | null = rfqRaw.freight_shipment_id
    ? Number(rfqRaw.freight_shipment_id) : null;

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));

  const links = await db.select().from(rfqVendorLinksTable)
    .where(eq(rfqVendorLinksTable.rfqId, rfqId))
    .orderBy(sql`created_at ASC`);

  const now = new Date();
  for (const link of links) {
    if (link.status === "waiting_response" && link.expiredAt && link.expiredAt < now) {
      await db.update(rfqVendorLinksTable).set({ status: "expired" })
        .where(eq(rfqVendorLinksTable.id, link.id)).catch(() => {});
      link.status = "expired";
    }
  }

  const vendorIds = links.map((l) => l.vendorId);
  const vendors = vendorIds.length
    ? await db.select({ id: suppliersTable.id, name: suppliersTable.name, phone: suppliersTable.phone, markup: suppliersTable.markup })
        .from(suppliersTable).where(inArray(suppliersTable.id, vendorIds))
    : [];
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));

  const activities = await db.select().from(rfqActivityLogsTable)
    .where(eq(rfqActivityLogsTable.rfqId, rfqId))
    .orderBy(sql`created_at DESC`).limit(50);

  // Compute order items subtotal — fallback basicPrice ketika link.basic_price null
  const orderItemsForComp = await db.select({ subtotal: logisticOrderItemsTable.subtotal })
    .from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, rfq.orderId));
  const orderItemsSubtotal = orderItemsForComp.reduce(
    (s, i) => s + (i.subtotal ? parseFloat(i.subtotal) : 0), 0
  );
  const fallbackBasicPrice = orderItemsSubtotal > 0 ? orderItemsSubtotal : null;

  const vendorRows = links
    .sort((a, b) => {
      if (a.status === "rejected" && b.status !== "rejected") return 1;
      if (b.status === "rejected" && a.status !== "rejected") return -1;
      if (a.status === "expired" && b.status !== "expired") return 1;
      if (b.status === "expired" && a.status !== "expired") return -1;
      const pa = Number(a.offeredPrice ?? a.basicPrice ?? 9e9);
      const pb = Number(b.offeredPrice ?? b.basicPrice ?? 9e9);
      return pa - pb;
    })
    .map((l) => {
      const dbBasic = l.basicPrice ? Number(l.basicPrice) : null;
      const effectiveBasic = dbBasic ?? fallbackBasicPrice;
      const dbOffered = l.offeredPrice ? Number(l.offeredPrice) : null;
      // Jika vendor "terima harga" tapi offeredPrice null (basicPrice null saat blast), pakai effectiveBasic
      const effectiveOffered = dbOffered ?? (l.status === "accepted_basic_price" ? effectiveBasic : null);
      return ({
      linkId: l.id,
      vendorId: l.vendorId,
      vendorName: vendorMap.get(l.vendorId)?.name ?? `Vendor #${l.vendorId}`,
      phone: vendorMap.get(l.vendorId)?.phone ?? null,
      markup: vendorMap.get(l.vendorId)?.markup ? Number(vendorMap.get(l.vendorId)!.markup) : null,
      status: l.status,
      basicPrice: effectiveBasic,
      offeredPrice: effectiveOffered,
      eta: l.eta ?? null,
      notes: l.notes ?? null,
      attachmentUrl: l.attachmentUrl ?? null,
      isNewUpdate: l.isNewUpdate,
      openedAt: l.openedAt?.toISOString() ?? null,
      submittedAt: l.submittedAt?.toISOString() ?? null,
      lastUpdatedAt: l.lastUpdatedAt?.toISOString() ?? null,
      expiredAt: l.expiredAt?.toISOString() ?? null,
      formUrl: getVendorFormUrl(l.token),
    });
  });

  const stats = {
    total: links.length,
    answered: links.filter((l) => ["accepted_basic_price", "counter_offer", "selected", "not_selected", "late_response"].includes(l.status)).length,
    pending: links.filter((l) => l.status === "waiting_response").length,
    rejected: links.filter((l) => l.status === "rejected").length,
    counterOffer: links.filter((l) => l.status === "counter_offer").length,
    expired: links.filter((l) => l.status === "expired").length,
    selected: links.filter((l) => l.status === "selected").length,
  };

  return res.json({
    rfqId,
    rfqNumber: rfq.rfqNumber,
    orderId: rfq.orderId,
    orderNumber: order?.orderNumber ?? "",
    customerName: order?.customerName ?? "",
    customerPhone: order?.phone ?? null,
    customerEmail: order?.email ?? null,
    serviceType: order?.shipmentType ?? "",
    origin: order?.origin ?? "",
    destination: order?.destination ?? "",
    commodity: order?.commodity ?? null,
    rfqStatus: rfq.status,
    quotedPrice: rfq.quotedPrice ? Number(rfq.quotedPrice) : null,
    quotedAt: rfq.quotedAt?.toISOString() ?? null,
    quoteNotes: rfq.quoteNotes ?? null,
    customerResponseNotes: (rfq as any).customerResponseNotes ?? null,
    customerRespondedAt: (rfq as any).customerRespondedAt
      ? new Date((rfq as any).customerRespondedAt).toISOString() : null,
    finalSellingPrice: order?.finalSellingPrice ? Number(order.finalSellingPrice) : null,
    freightShipmentId,
    stats,
    vendors: vendorRows,
    activities: activities.map((a) => ({
      id: a.id,
      actorType: a.actorType,
      actorName: a.actorName,
      action: a.action,
      description: a.description,
      createdAt: a.createdAt.toISOString(),
    })),
  });
});

// ─── ADMIN: POST /rfq/:rfqId/create-freight-shipment ─────────────────────────
logisticRfqV2Router.post("/rfq/:rfqId/create-freight-shipment", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  if (isNaN(rfqId)) return res.status(400).json({ message: "rfqId tidak valid" });

  // Load RFQ
  const rfqRowResult = await db.execute(sql`
    SELECT *, freight_shipment_id FROM logistic_order_rfqs WHERE id = ${rfqId}
  `);
  const rfqRow = rfqRowResult.rows[0];
  const rfq = rfqRow as any;
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  // Block if status not customer_approved or closed
  if (!["customer_approved", "closed"].includes(rfq.status)) {
    return res.status(400).json({
      message: `Freight hanya bisa dibuat setelah customer menyetujui penawaran. Status saat ini: ${rfq.status}`,
    });
  }

  // If already created, return existing shipment ID
  if (rfq.freight_shipment_id) {
    return res.json({ ok: true, shipmentId: rfq.freight_shipment_id, alreadyExists: true });
  }

  // Load order
  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.order_id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Load selected vendor link
  const [selectedLink] = await db.select().from(rfqVendorLinksTable)
    .where(and(eq(rfqVendorLinksTable.rfqId, rfqId), eq(rfqVendorLinksTable.status, "selected")))
    .limit(1);

  let vendorName: string | null = null;
  if (selectedLink) {
    const [vendor] = await db.select({ name: suppliersTable.name })
      .from(suppliersTable).where(eq(suppliersTable.id, selectedLink.vendorId));
    vendorName = vendor?.name ?? null;
  }

  // Compose notes from RFQ data
  const vendorPrice = selectedLink
    ? Number(selectedLink.offeredPrice ?? selectedLink.basicPrice ?? 0) || null
    : null;
  const quotedPrice = rfq.quoted_price ? Number(rfq.quoted_price) : null;
  const noteLines = [
    `Dibuat otomatis dari RFQ ${rfq.rfq_number}`,
    `No. Order: ${order.orderNumber}`,
    `Customer: ${order.customerName}`,
    vendorName ? `Vendor terpilih: ${vendorName}` : null,
    vendorPrice ? `Harga vendor: ${fmtRp(vendorPrice)}` : null,
    quotedPrice ? `Harga jual ke customer: ${fmtRp(quotedPrice)}` : null,
    selectedLink?.eta ? `ETA vendor: ${selectedLink.eta}` : null,
    rfq.quote_notes ? `Catatan: ${rfq.quote_notes}` : null,
  ].filter(Boolean).join("\n");

  // Generate shipment number
  const now = new Date();
  const yr = now.getFullYear();
  const seq = Date.now().toString().slice(-6);
  const shipmentNumber = `FS/${yr}/${seq}`;

  // Create freight shipment
  const [shipment] = await db.insert(freightShipmentsTable).values({
    shipmentNumber,
    shipperName: order.customerName,
    consigneeName: order.namaPenerima || order.customerName,
    commodity: order.commodity || order.shipmentType || "General Cargo",
    origin: order.origin,
    destination: order.destination,
    grossWeight: order.grossWeight ?? order.weightKg ?? null,
    quantity: order.jumlahKoli ?? null,
    transportMode: order.transportMode || order.shipmentType || null,
    portOfLoading: order.originPort ?? null,
    portOfDischarge: order.destPort ?? null,
    approvedVendorName: vendorName,
    actualCost: vendorPrice ? String(vendorPrice) : null,
    notes: noteLines,
    status: "confirmed",
  }).returning();

  // Link freight shipment back to RFQ
  await db.execute(sql`
    UPDATE logistic_order_rfqs SET freight_shipment_id = ${shipment!.id} WHERE id = ${rfqId}
  `);

  // Log activity
  await logActivity(rfqId, "admin", "Admin", "admin_create_freight",
    `Freight Shipment ${shipmentNumber} dibuat otomatis dari RFQ ini`);

  logger.info({ rfqId, shipmentId: shipment!.id, shipmentNumber }, "Freight shipment created from RFQ");

  return res.status(201).json({
    ok: true,
    shipmentId: shipment!.id,
    shipmentNumber: shipment!.shipmentNumber,
    alreadyExists: false,
  });
});

// ─── ADMIN: POST /rfq/:rfqId/select-vendor ───────────────────────────────────
logisticRfqV2Router.post("/rfq/:rfqId/select-vendor", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  if (isNaN(rfqId)) return res.status(400).json({ message: "rfqId tidak valid" });

  const { linkId, sellingPrice } = req.body as { linkId: number; sellingPrice?: number };
  if (!linkId) return res.status(400).json({ message: "linkId wajib diisi" });

  const [link] = await db.select().from(rfqVendorLinksTable)
    .where(and(eq(rfqVendorLinksTable.id, linkId), eq(rfqVendorLinksTable.rfqId, rfqId)));
  if (!link) return res.status(404).json({ message: "Link vendor tidak ditemukan" });

  const [vendor] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
    .where(eq(suppliersTable.id, link.vendorId));

  await db.update(rfqVendorLinksTable).set({ status: "selected" })
    .where(eq(rfqVendorLinksTable.id, linkId));

  const otherLinks = await db.select({ id: rfqVendorLinksTable.id, status: rfqVendorLinksTable.status })
    .from(rfqVendorLinksTable)
    .where(and(eq(rfqVendorLinksTable.rfqId, rfqId), sql`id != ${linkId}`));

  for (const other of otherLinks) {
    if (!["rejected", "expired", "late_response"].includes(other.status)) {
      await db.update(rfqVendorLinksTable).set({ status: "not_selected" })
        .where(eq(rfqVendorLinksTable.id, other.id));
    }
  }

  await db.update(logisticOrderRfqsTable).set({ status: "vendor_selected" })
    .where(eq(logisticOrderRfqsTable.id, rfqId));

  if (sellingPrice) {
    await db.update(logisticOrdersTable)
      .set({ finalSellingPrice: String(sellingPrice), approvedVendorId: link.vendorId })
      .where(eq(logisticOrdersTable.id,
        (await db.select({ orderId: logisticOrderRfqsTable.orderId }).from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.id, rfqId)).then((r) => r[0]?.orderId ?? 0))
      ));
  }

  const vendorName = vendor?.name ?? `Vendor #${link.vendorId}`;
  await logActivity(rfqId, "admin", "Admin", "admin_select_vendor",
    `Admin memilih vendor: ${vendorName} — ${fmtRp(link.offeredPrice ?? link.basicPrice)}`);

  return res.json({ ok: true, selectedVendorName: vendorName });
});

// ─── ADMIN: POST /rfq/:rfqId/vendor-link/:linkId/action ──────────────────────
logisticRfqV2Router.post("/rfq/:rfqId/vendor-link/:linkId/action", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  const linkId = parseInt(req.params.linkId as string, 10);
  if (isNaN(rfqId) || isNaN(linkId)) return res.status(400).json({ message: "ID tidak valid" });

  const { action, message: actionMsg } = req.body as { action: "request_revision" | "reject" | "mark_read"; message?: string };
  if (!action) return res.status(400).json({ message: "action wajib diisi" });

  const [link] = await db.select().from(rfqVendorLinksTable)
    .where(and(eq(rfqVendorLinksTable.id, linkId), eq(rfqVendorLinksTable.rfqId, rfqId)));
  if (!link) return res.status(404).json({ message: "Link tidak ditemukan" });

  const [vendor] = await db.select({ name: suppliersTable.name, phone: suppliersTable.phone })
    .from(suppliersTable).where(eq(suppliersTable.id, link.vendorId));
  const vendorName = vendor?.name ?? `Vendor #${link.vendorId}`;

  if (action === "mark_read") {
    await db.update(rfqVendorLinksTable).set({ isNewUpdate: false })
      .where(eq(rfqVendorLinksTable.id, linkId));
    return res.json({ ok: true });
  }

  if (action === "reject") {
    await db.update(rfqVendorLinksTable).set({ status: "not_selected" })
      .where(eq(rfqVendorLinksTable.id, linkId));
    await logActivity(rfqId, "admin", "Admin", "admin_reject_vendor",
      `Admin menolak vendor: ${vendorName}`);
    return res.json({ ok: true });
  }

  if (action === "request_revision") {
    if (vendor?.phone) {
      const [rfq] = await db.select({ rfqNumber: logisticOrderRfqsTable.rfqNumber, orderId: logisticOrderRfqsTable.orderId })
        .from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.id, rfqId));
      const formUrl = getVendorFormUrl(link.token);
      const currentPrice = link.offeredPrice ?? link.basicPrice;
      const [order] = rfq?.orderId
        ? await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, rfq.orderId))
        : [];
      if (order) {
        sendVendorRevisionNotification(
          buildOrderData(order),
          vendorName,
          vendor.phone,
          currentPrice ? fmtRp(currentPrice) : "-",
          formUrl,
        ).catch(() => {});
      } else if (actionMsg) {
        sendVendorRevisionFallbackNotification(
          vendor.phone,
          vendorName,
          rfq?.rfqNumber ?? null,
          actionMsg,
          formUrl,
          String(rfqId),
        ).catch(() => {});
      }
    }
    await logActivity(rfqId, "admin", "Admin", "admin_request_revision",
      `Admin minta revisi dari ${vendorName}: ${actionMsg ?? ""}`);
    return res.json({ ok: true });
  }

  return res.status(400).json({ message: "action tidak dikenal" });
});

// ─── ADMIN: POST /rfq/:rfqId/send-customer-quote ─────────────────────────────
// Admin kirim penawaran harga ke customer setelah memilih vendor
logisticRfqV2Router.post("/rfq/:rfqId/send-customer-quote", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  if (isNaN(rfqId)) return res.status(400).json({ message: "rfqId tidak valid" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.id, rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  if (!["vendor_selected", "customer_revision_requested"].includes(rfq.status)) {
    return res.status(400).json({
      message: `Status RFQ saat ini '${rfq.status}'. Harus vendor_selected atau customer_revision_requested untuk kirim penawaran.`,
    });
  }

  const { sellingPrice, quoteNotes, sendWhatsApp: doSendWa = true } = req.body as {
    sellingPrice: number;
    quoteNotes?: string;
    sendWhatsApp?: boolean;
  };

  if (!sellingPrice || sellingPrice <= 0) {
    return res.status(400).json({ message: "sellingPrice wajib diisi" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Cari vendor yang dipilih untuk info WA message
  const selectedLink = await db.select().from(rfqVendorLinksTable)
    .where(and(eq(rfqVendorLinksTable.rfqId, rfqId), eq(rfqVendorLinksTable.status, "selected")))
    .limit(1)
    .then((r) => r[0]);

  const [selectedVendor] = selectedLink
    ? await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(eq(suppliersTable.id, selectedLink.vendorId))
    : [];

  // Simpan quote ke RFQ
  await db.execute(sql`
    UPDATE logistic_order_rfqs
    SET status = 'customer_quoted',
        quoted_price = ${sellingPrice},
        quoted_at = NOW(),
        quote_notes = ${quoteNotes ?? null}
    WHERE id = ${rfqId}
  `);

  // Update order: final selling price
  await db.update(logisticOrdersTable)
    .set({ finalSellingPrice: String(sellingPrice) })
    .where(eq(logisticOrdersTable.id, rfq.orderId));

  // Kirim WA ke customer via template
  let waSent = false;
  if (doSendWa && order.phone) {
    const domain = getPreferredDomain();
    const customerApprovalLink = domain
      ? `https://${domain}/approve/${order.orderNumber}`
      : `/approve/${order.orderNumber}`;
    sendCustomerApprovalNotification(
      buildOrderData(order),
      fmtRp(sellingPrice),
      customerApprovalLink,
    ).then(() => { waSent = true; }).catch(() => {});
  }

  await logActivity(rfqId, "admin", "Admin", "admin_send_customer_quote",
    `Admin kirim penawaran ke customer ${order.customerName}: ${fmtRp(sellingPrice)}${waSent ? " — WA terkirim" : ""}`);

  return res.json({
    ok: true,
    rfqId,
    rfqNumber: rfq.rfqNumber,
    customerName: order.customerName,
    sellingPrice,
    waSent,
  });
});

// ─── PUBLIC: POST /rfq/quote-respond — customer merespons penawaran ──────────
// Body: { orderNumber, response: "approved"|"revision_requested"|"rejected", notes? }
logisticRfqV2Router.post("/rfq/quote-respond", async (req: Request, res: Response) => {
  const { orderNumber, response, notes } = req.body as {
    orderNumber: string;
    response: "approved" | "revision_requested" | "rejected";
    notes?: string;
  };

  if (!orderNumber || !response) {
    return res.status(400).json({ message: "orderNumber dan response wajib diisi" });
  }
  if (!["approved", "revision_requested", "rejected"].includes(response)) {
    return res.status(400).json({ message: "response tidak valid" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.orderNumber, orderNumber.toUpperCase().trim()));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Cari RFQ aktif dengan status customer_quoted
  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(and(
      eq(logisticOrderRfqsTable.orderId, order.id),
      eq(logisticOrderRfqsTable.status, "customer_quoted")
    ))
    .orderBy(sql`created_at DESC`)
    .limit(1);

  if (!rfq) {
    return res.status(400).json({
      message: "Tidak ada penawaran aktif untuk order ini. Status mungkin sudah berubah.",
    });
  }

  const newStatus =
    response === "approved" ? "customer_approved" :
    response === "revision_requested" ? "customer_revision_requested" :
    "customer_rejected";

  await db.execute(sql`
    UPDATE logistic_order_rfqs
    SET status = ${newStatus},
        customer_response_notes = ${notes ?? null},
        customer_responded_at = NOW()
    WHERE id = ${rfq.id}
  `);

  // Notif WA ke admin group
  const adminWa = await getAdminGroupWa().catch(() => null);
  if (adminWa) {
    sendCustomerRfqResponseAdminNotification(adminWa, {
      response,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      shipmentType: order.shipmentType,
      origin: order.origin,
      destination: order.destination,
      quotedPrice: rfq.quotedPrice ? fmtRp(rfq.quotedPrice) : null,
      notes: notes ?? null,
    }).catch(() => {});
  }

  await logActivity(rfq.id, "customer", order.customerName, `customer_${response}`,
    `Customer ${order.customerName} ${
      response === "approved" ? "menyetujui" :
      response === "revision_requested" ? "minta revisi" : "menolak"
    } penawaran${notes ? `: ${notes}` : ""}`);

  return res.json({ ok: true, rfqId: rfq.id, newStatus });
});

// ─── ADMIN: POST /rfq/:rfqId/close — tutup RFQ ───────────────────────────────
logisticRfqV2Router.post("/rfq/:rfqId/close", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const rfqId = parseInt(req.params.rfqId as string, 10);
  if (isNaN(rfqId)) return res.status(400).json({ message: "rfqId tidak valid" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.id, rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const { notes, updateOrderStatus } = req.body as { notes?: string; updateOrderStatus?: boolean };

  await db.execute(sql`
    UPDATE logistic_order_rfqs SET status = 'closed' WHERE id = ${rfqId}
  `);

  if (updateOrderStatus !== false) {
    // Jika customer approved, update order ke Processing; jika rejected, biarkan
    const targetStatus = rfq.status === "customer_approved" ? "Processing" : undefined;
    if (targetStatus) {
      await db.update(logisticOrdersTable)
        .set({ status: targetStatus })
        .where(eq(logisticOrdersTable.id, rfq.orderId));
    }
  }

  const [order] = await db.select({ customerName: logisticOrdersTable.customerName, orderNumber: logisticOrdersTable.orderNumber })
    .from(logisticOrdersTable).where(eq(logisticOrdersTable.id, rfq.orderId));

  await logActivity(rfqId, "admin", "Admin", "rfq_closed",
    `RFQ ditutup${notes ? `: ${notes}` : ""}`);

  return res.json({ ok: true, rfqId, rfqNumber: rfq.rfqNumber, orderNumber: order?.orderNumber });
});

// ─── ADMIN: GET /rfq/by-order/:orderId ────────────────────────────────────────
logisticRfqV2Router.get("/rfq/by-order/:orderId", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(req.params.orderId as string, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const rfqs = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.orderId, orderId))
    .orderBy(sql`created_at DESC`);

  const result = await Promise.all(rfqs.map(async (rfq) => {
    const links = await db.select({ status: rfqVendorLinksTable.status })
      .from(rfqVendorLinksTable).where(eq(rfqVendorLinksTable.rfqId, rfq.id));
    return {
      rfqId: rfq.id,
      rfqNumber: rfq.rfqNumber,
      status: rfq.status,
      vendorCount: links.length,
      answeredCount: links.filter((l) => l.status !== "waiting_response" && l.status !== "expired").length,
      comparisonUrl: `/logistics/rfq/${rfq.id}/comparison`,
    };
  }));

  return res.json(result);
});
