import { Router, Request, Response } from "express";
import { randomUUID } from "crypto";
import { rfqRateLimit } from "../middlewares/rfqRateLimit.js";
import { db, suppliersTable, logisticOrdersTable, logisticOrderRfqsTable, logisticOrderQuotesTable, logisticOrderItemsTable, vendorCatalogItemsTable, vendorOffersTable, vendorRatesTable, salesDocumentsTable, salesDocumentLinesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { saveAndBroadcast } from "../lib/notificationStore.js";
import { getAdminWa, getAdminGroupWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";
import { getPreferredDomain } from "../lib/domain.js";
import { sendVendorWhatsApp } from "../lib/vendorQuoteWa.js";
import { generateShortLink } from "../lib/shortLink.js";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer.js";

function getConfirmFormUrl(token: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/confirm/${token}`;
}

export const logisticRfqRouter = Router();

/** Map calculatorType → vendor serviceType keyword */
function calcTypeToServiceKeyword(calcType: string): string | null {
  switch (calcType) {
    case "trucking":   return "Trucking";
    case "air_freight": return "Air Freight";
    case "sea_fcl":
    case "sea_lcl":
    case "sea_freight": return "Sea Freight";
    case "product":
    case "product_delivery":
    case "courier":   return "__PRODUCT__";
    default: return null;
  }
}

/** Auto-create RFQ and send WA with form link to matching vendors when a new order is created */
export async function autoCreateRfqAndNotifyVendors(
  orderId: number,
  order: {
    orderNumber: string; shipmentType: string; origin: string; destination: string;
    commodity?: string | null; cargoDescription?: string | null;
    grossWeight?: number | null; volumeCbm?: number | null;
    requiredDate?: string | null; notes?: string | null;
    jamOrder?: string | null; createdAt?: Date | string | null;
    vehicleType?: string | null;
  }
): Promise<void> {
  // Build set of service keywords: from shipmentType + derived from order items
  const keywords = new Set<string>();
  if (order.shipmentType?.trim()) keywords.add(order.shipmentType.trim());
  if (order.vehicleType) keywords.add("Trucking");

  // Fetch order items to derive additional keywords from calculatorType
  const orderItems = await db.select({
      calculatorType: logisticOrderItemsTable.calculatorType,
      serviceName: logisticOrderItemsTable.serviceName,
      category: logisticOrderItemsTable.category,
    })
    .from(logisticOrderItemsTable)
    .where(eq(logisticOrderItemsTable.orderId, orderId));
  for (const item of orderItems) {
    const kw = calcTypeToServiceKeyword(item.calculatorType);
    if (kw) keywords.add(kw);
  }

  if (keywords.size === 0) {
    logger.warn({ orderNumber: order.orderNumber }, "autoCreateRfqAndNotifyVendors: tidak ada keyword — skip");
    return;
  }

  // Search active vendors matching ANY keyword (OR logic)
  const PRODUCT_VENDOR_KEYWORDS = ["trucking", "courier", "kurir", "pengiriman", "logistics", "logistik", "same day", "instant", "delivery"];
  const allActiveVendors = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
  const matchingVendors = allActiveVendors.filter((v) => {
    if (!v.serviceType?.trim()) return false;
    const st = v.serviceType.toLowerCase();
    return [...keywords].some((kw) => {
      if (kw === "__PRODUCT__") return PRODUCT_VENDOR_KEYWORDS.some((p) => st.includes(p));
      return st.includes(kw.toLowerCase());
    });
  });

  // [MULTI-MODE] Trucking: filter by year_vehicle >= (currentYear - 5)
  const isTruckingForFilter = isTruckingOrder(order);
  const vehicleYearCutoff = new Date().getFullYear() - 5;
  const eligible = matchingVendors.filter((v) => {
    if (!v.phone) return false;
    if (isTruckingForFilter) {
      const vy = (v as any).yearVehicle;
      if (vy != null && vy < vehicleYearCutoff) return false;
    }
    return true;
  });
  if (eligible.length === 0) {
    logger.info({ keywords: [...keywords] }, "autoCreateRfqAndNotifyVendors: tidak ada vendor matching — skip");
    return;
  }

  const rfqNumber = generateRfqNumber();
  const [rfq] = await db.insert(logisticOrderRfqsTable).values({  // [TRUCKING-FIX] capture rfq id
    orderId,
    rfqNumber,
    vendorIds: eligible.map((v) => v.id),
    notes: null,
    status: "open",
  }).returning();

  const isTrucking = isTruckingOrder(order);                                                 // [TRUCKING-FIX]

  // [TRUCKING-FIX] Save pickup info + truck type on order for trucking orders
  if (isTrucking) {
    await db.update(logisticOrdersTable).set({
      status: "Under Review",
      pickupDate: order.requiredDate ?? null,
      pickupTime: order.jamOrder ?? null,
      truckType: order.vehicleType ?? null,
    } as any).where(eq(logisticOrdersTable.id, orderId));
    console.log(`[TRUCKING-FLOW] State: PENDING → Under Review (order ${orderId})`);
  } else {
    await db.update(logisticOrdersTable).set({ status: "Under Review" }).where(eq(logisticOrdersTable.id, orderId));
  }

  // [NEW-FLOW] Auto-blast WA ke vendor dinonaktifkan.
  // Admin harus memilih vendor secara manual via halaman comparison.
  // RFQ tetap dibuat agar admin bisa langsung blast dari BizPortal.
  logger.info({ rfqNumber, orderId, vendorCount: eligible.length, isTrucking }, "Auto-RFQ created (WA blast disabled — admin must blast manually)");
}

function generateRfqNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `RFQ-${y}${m}${d}-${rand}`;
}

function calcSellingPrice(vendorPrice: number, markupType: string, markupPct: number, fixedPrice: number | null): number {
  if (markupType === "fixed_price" && fixedPrice != null) return fixedPrice;
  return vendorPrice + (vendorPrice * markupPct / 100);
}

function scoreQuote(q: { vendorPrice: number; estimatedDays: number | null }, allPrices: number[], allDays: (number | null)[]): number {
  const validDays = allDays.filter((d): d is number => d != null);
  const minPrice = Math.min(...allPrices);
  const maxPrice = Math.max(...allPrices);
  const minDays = validDays.length ? Math.min(...validDays) : null;
  const maxDays = validDays.length ? Math.max(...validDays) : null;

  // 40% price competitiveness (lower = better)
  const priceScore = maxPrice === minPrice ? 100
    : ((maxPrice - q.vendorPrice) / (maxPrice - minPrice)) * 100;

  // 25% availability (always available since they replied = 100)
  const availScore = 100;

  // 20% delivery speed (lower days = better)
  const speedScore = q.estimatedDays == null || minDays == null ? 50
    : maxDays === minDays ? 100
    : ((maxDays! - q.estimatedDays) / (maxDays! - minDays)) * 100;

  // 15% vendor rating (placeholder — no rating system yet)
  const ratingScore = 75;

  return (priceScore * 0.40) + (availScore * 0.25) + (speedScore * 0.20) + (ratingScore * 0.15);
}

function isFreightWithDimensions(shipmentType: string): boolean {
  const t = shipmentType.toLowerCase();
  return t.includes("air") || t.includes("sea") || t.includes("laut") || t.includes("udara");
}

const TZ = "Asia/Jakarta";
function formatTanggal(dt: Date | string): string {
  const d = new Date(dt);
  const parts = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" }).formatToParts(d);
  const day  = parts.find(p => p.type === "day")?.value ?? "";
  const mon  = parts.find(p => p.type === "month")?.value ?? "";
  const year = parts.find(p => p.type === "year")?.value ?? "";
  return `${day} ${mon} ${year}`;
}
function formatJam(dt: Date | string): string {
  return new Intl.DateTimeFormat("id-ID", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(dt));
}

function buildRfqWaMessage(order: {
  orderNumber: string; origin: string; destination: string;
  shipmentType: string; commodity?: string | null; cargoDescription?: string | null;
  grossWeight?: number | null; volumeCbm?: number | null; requiredDate?: string | null;
  notes?: string | null; jamOrder?: string | null; createdAt?: Date | string | null;
}, rfqNumber: string, vendorName: string, formUrl?: string, vendorBasePrice?: number | null): string {
  const isFreight = isFreightWithDimensions(order.shipmentType);
  const tgl = order.createdAt ? formatTanggal(order.createdAt) : "";
  const jam = order.jamOrder ?? (order.createdAt ? formatJam(order.createdAt) : "");
  const fmtPrice = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

  const freightHint = isFreight
    ? (
        `📐 *Informasi kargo:*\n` +
        (order.grossWeight ? `   Berat       : *${order.grossWeight} kg*\n` : ``) +
        (order.volumeCbm ? `   Volume      : *${order.volumeCbm} CBM*\n` : ``) +
        `   Berikan harga total pengiriman (bukan per-kg/per-CBM).\n\n`
      )
    : ``;

  return (
    `📋 *REQUEST FOR QUOTATION — CST LOGISTICS*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Kepada Yth. *${vendorName}*,\n\n` +
    `Kami memohon penawaran harga untuk order berikut:\n\n` +
    `No. RFQ       : *${rfqNumber}*\n` +
    `No. Order     : ${order.orderNumber}\n` +
    (tgl ? `Tanggal       : ${tgl}\n` : ``) +
    (jam ? `Jam           : ${jam}\n` : ``) +
    `Rute          : ${order.origin} → ${order.destination}\n` +
    (order.commodity ? `Komoditi      : ${order.commodity}\n` : "") +
    (order.cargoDescription ? `Deskripsi     : ${order.cargoDescription}\n` : "") +
    (order.grossWeight ? `Berat         : ${order.grossWeight} kg\n` : "") +
    (vendorBasePrice != null ? `Harga Vendor  : *${fmtPrice(vendorBasePrice)}*\n` : "") +
    (order.volumeCbm ? `Volume        : ${order.volumeCbm} CBM\n` : "") +
    (order.requiredDate ? `Tgl Butuh     : ${order.requiredDate}\n` : "") +
    (order.notes ? `Catatan       : ${order.notes}\n` : "") +
    `━━━━━━━━━━━━━━━━━━\n` +
    freightHint +
    (formUrl
      ? `📱 *CARA TERMUDAH — ISI FORM ONLINE:*\n${formUrl}\n\nKlik link di atas, isi harga & estimasi, lalu Submit.\n\n`
      : ``) +
    `Terima kasih 🙏`
  );
}

function getOrderUrl(orderId: number): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/portal-orders/${orderId}`;
}

function getApproveFormUrl(orderNumber: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/approve/${orderNumber}`;
}

function getVendorFormUrl(rfqNumber: string, vendorId: number, token: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/vendor-quote?rfq=${encodeURIComponent(rfqNumber)}&v=${vendorId}&token=${encodeURIComponent(token)}`;
}

// [TRUCKING-FIX] Confirm link for vendor YES/NO page
function getVendorConfirmUrl(orderId: number, token: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/vendor-confirm?orderId=${orderId}&token=${encodeURIComponent(token)}`;
}

// [MULTI-MODE] URL for customer to choose from anonymous options
function getChooseOptionUrl(token: string): string {
  const domain = getPreferredDomain();
  if (!domain) return "";
  return `https://${domain}/choose-option/${token}`;
}

// [TRUCKING-FIX] Detect if order is trucking-type (has truck_type or vehicleType set)
function isTruckingOrder(order: { vehicleType?: string | null; truckType?: string | null }): boolean {
  return !!(order.vehicleType || order.truckType);
}

// [TRUCKING-FIX] Format ISO date "2026-05-14" → "14 Mei 2026"
function formatISODate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00+07:00");
  if (isNaN(d.getTime())) return dateStr;
  const parts = new Intl.DateTimeFormat("id-ID", { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" }).formatToParts(d);
  const day  = parts.find(p => p.type === "day")?.value ?? "";
  const mon  = parts.find(p => p.type === "month")?.value ?? "";
  const year = parts.find(p => p.type === "year")?.value ?? "";
  return `${day} ${mon} ${year}`;
}

// [TRUCKING-FIX] New trucking RFQ WA format per spec — vendor gets base price + YES/NO links
function buildTruckingRfqWaMessage(order: {
  orderNumber: string; origin: string; destination: string;
  commodity?: string | null; vehicleType?: string | null;
  requiredDate?: string | null; jamOrder?: string | null;
}, rfqNumber: string, vendorName: string, confirmUrl: string, rejectUrl: string, basePrice: number | null): string {
  const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const pickupDate = order.requiredDate ? formatISODate(order.requiredDate) : "-";
  const pickupTime = order.jamOrder ? order.jamOrder.replace(".", ":") : "-";
  return (
    `🚛 *REQUEST PENAWARAN TRUCKING*\n` +
    `📋 No. RFQ: ${rfqNumber}\n` +
    `   No. Order: ${order.orderNumber}\n\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `📍 RUTE: ${order.origin} → ${order.destination}\n` +
    `   PICKUP: ${pickupDate} Pukul ${pickupTime} WIB\n` +
    `   KOMODITI: ${order.commodity ?? "Umum"}\n` +
    `🚚 TIPE UNIT: ${order.vehicleType ?? "-"}\n\n` +
    (basePrice != null ? `💰 HARGA DASAR: ${fmtRp(basePrice)}\n` : ``) +
    `━━━━━━━━━━━━━━━━━━\n\n` +
    `✅ Terima & tersedia: ${confirmUrl}\n` +
    `   Tolak: ${rejectUrl}\n` +
    `⏳ Batas konfirmasi: 24 jam`
  );
}

function buildAdminQuoteNotif(rfqNumber: string, orderNumber: string, vendorName: string, orderId: number, quote: {
  vendorPrice: number; estimatedPickup?: string | null; estimatedDelivery?: string | null;
  estimatedDays?: number | null; vendorNotes?: string | null;
}, quotePosition?: number): string {
  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const approveUrl = getApproveFormUrl(orderNumber);
  const posLabel = quotePosition != null ? ` (vendor ke-${quotePosition})` : "";
  return (
    `💰 *PENAWARAN VENDOR DITERIMA (Portal)*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `No. RFQ     : \`${rfqNumber}\`\n` +
    `No. Order   : \`${orderNumber}\`\n` +
    `Vendor      : *${vendorName}*${posLabel}\n` +
    `Harga       : *${fmt(quote.vendorPrice)}*\n` +
    (quote.estimatedPickup ? `ETA Pickup  : ${quote.estimatedPickup}\n` : "") +
    (quote.estimatedDelivery ? `ETA Delivery: ${quote.estimatedDelivery}\n` : "") +
    (quote.estimatedDays ? `Est. Hari   : ${quote.estimatedDays} hari\n` : "") +
    (quote.vendorNotes ? `Catatan     : ${quote.vendorNotes}\n` : "") +
    `━━━━━━━━━━━━━━━━━━\n` +
    (approveUrl
      ? `✅ *Approve & Kirim ke Customer:*\n${approveUrl}\n\n`
      : ``) +
    `📋 Lihat semua penawaran:\n\`QUOTES ${orderNumber}\`\n\n` +
    `_Atau ketik: \`APPROVE ${orderNumber} ${quotePosition ?? 1}\`_`
  );
}

const toQuote = (q: typeof logisticOrderQuotesTable.$inferSelect, vendorName: string) => {
  const vp = Number(q.vendorPrice);
  const mt = q.markupType;
  const mp = Number(q.markupPercentage ?? 0);
  const fp = q.fixedSellingPrice != null ? Number(q.fixedSellingPrice) : null;
  const sp = q.sellingPrice != null ? Number(q.sellingPrice) : calcSellingPrice(vp, mt, mp, fp);
  return {
    id: q.id,
    rfqId: q.rfqId,
    orderId: q.orderId,
    vendorId: q.vendorId,
    vendorName,
    vendorPrice: vp,
    estimatedPickup: q.estimatedPickup ?? null,
    estimatedDelivery: q.estimatedDelivery ?? null,
    estimatedDays: q.estimatedDays ?? null,
    vendorNotes: q.vendorNotes ?? null,
    markupType: mt,
    markupPercentage: mp,
    fixedSellingPrice: fp,
    sellingPrice: sp,
    quoteStatus: q.quoteStatus,
    replySource: q.replySource,
    replyTimestamp: q.replyTimestamp?.toISOString() ?? null,
    createdAt: q.createdAt.toISOString(),
  };
};

// [TRUCKING-FIX] GET /api/logistic/orders/vendor-confirm-page?orderId=&token= — data for YES/NO vendor confirm page
logisticRfqRouter.get("/vendor-confirm-page", rfqRateLimit, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.query.orderId ?? ""), 10);
  const token = String(req.query.token ?? "").trim();
  if (isNaN(orderId) || !token) return res.status(400).json({ message: "orderId dan token wajib diisi" });

  const [quote] = await db.select().from(logisticOrderQuotesTable)
    .where(and(eq(logisticOrderQuotesTable.orderId, orderId), eq(logisticOrderQuotesTable.vendorConfirmToken as any, token)));
  if (!quote) return res.status(404).json({ message: "Link konfirmasi tidak valid atau sudah kadaluarsa" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.id, quote.rfqId));
  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, quote.vendorId));

  return res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    rfqNumber: rfq?.rfqNumber ?? "",
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    pickupDate: (order as any).pickupDate ?? order.requiredDate ?? null,
    pickupTime: (order as any).pickupTime ?? order.jamOrder ?? null,
    truckType: (order as any).truckType ?? null,
    basePrice: Number(quote.vendorPrice),
    vendorName: vendor?.name ?? "",
    confirmStatus: quote.quoteStatus,                    // pending / vendor_confirmed / vendor_rejected
  });
});

// [TRUCKING-FIX] POST /api/logistic/orders/vendor-confirm — vendor confirms YES/NO
logisticRfqRouter.post("/vendor-confirm", rfqRateLimit, async (req: Request, res: Response) => {

  const { orderId, token, action, vendorPrice: submittedVendorPrice } = req.body as {
    orderId: number; token: string; action: "accept" | "reject"; vendorPrice?: number;
  };
  if (!orderId || !token || !action) return res.status(400).json({ message: "orderId, token, dan action wajib diisi" });
  if (action !== "accept" && action !== "reject") return res.status(400).json({ message: "action harus 'accept' atau 'reject'" });

  const [quote] = await db.select().from(logisticOrderQuotesTable)
    .where(and(eq(logisticOrderQuotesTable.orderId, orderId), eq(logisticOrderQuotesTable.vendorConfirmToken as any, token)));
  if (!quote) return res.status(404).json({ message: "Token tidak valid" });
  if (quote.quoteStatus !== "pending") return res.status(409).json({ message: "Konfirmasi sudah pernah dikirimkan" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, quote.vendorId));
  const [rfq] = await db.select().from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.id, quote.rfqId));

  const newQuoteStatus = action === "accept" ? "vendor_confirmed" : "vendor_rejected";
  const newOrderStatus = action === "accept" ? "Vendor Confirmed" : "Vendor Rejected";

  // If vendor submitted an updated price (accept only), validate and use it
  const updatedPrice =
    action === "accept" &&
    typeof submittedVendorPrice === "number" &&
    submittedVendorPrice > 0
      ? submittedVendorPrice
      : null;

  await db.update(logisticOrderQuotesTable)
    .set({
      quoteStatus: newQuoteStatus,
      replyTimestamp: new Date(),
      replySource: "vendor_confirm",
      ...(updatedPrice != null ? { vendorPrice: String(updatedPrice) } : {}),
    } as any)
    .where(eq(logisticOrderQuotesTable.id, quote.id));

  const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const basePrice = updatedPrice ?? Number(quote.vendorPrice);
  const markupPct = Number(quote.markupPercentage) || 20;
  const finalPrice = basePrice * (1 + markupPct / 100);

  if (action === "accept") {
    // [TRUCKING-FIX] Save final_price and markup to order, update status
    await db.update(logisticOrdersTable).set({
      status: newOrderStatus,
      markupPercent: String(markupPct),
      finalPrice: String(finalPrice),
    } as any).where(eq(logisticOrdersTable.id, orderId));
    console.log(`[TRUCKING-FLOW] State: Under Review → Vendor Confirmed (order ${orderId}, vendor ${vendor?.name})`);

    // Notify admin: vendor confirmed + pricing info + approve link
    const approveUrl = getApproveFormUrl(order.orderNumber);
    const adminMsg =
      `🔔 *VENDOR CONFIRMED*\n` +
      `📦 Order: ${order.orderNumber}\n` +
      `🏢 Vendor: ${vendor?.name ?? "Unknown"}\n` +
      `💰 Harga Dasar: ${fmtRp(basePrice)}\n` +
      `💵 Harga ke Customer (Markup ${markupPct}%): ${fmtRp(finalPrice)}\n\n` +
      (approveUrl ? `✅ Review & Approve: ${approveUrl}` : ``);

    const adminWa = await getAdminWa();
    if (adminWa) sendWhatsApp(adminWa, adminMsg).catch((e: unknown) => logger.error({ e }, "Admin notify vendor confirmed failed"));
  } else {
    await db.update(logisticOrdersTable).set({ status: newOrderStatus } as any).where(eq(logisticOrdersTable.id, orderId));
    console.log(`[TRUCKING-FLOW] State: Under Review → Vendor Rejected (order ${orderId})`);

    // Notify admin: vendor rejected
    const approveUrl = getApproveFormUrl(order.orderNumber);
    const adminMsg =
      `🔔 *VENDOR REJECTED*\n` +
      `📦 Order: ${order.orderNumber}\n` +
      `🏢 Vendor: ${vendor?.name ?? "Unknown"} menolak order ini.\n\n` +
      (approveUrl ? `📋 Cek & pilih vendor lain: ${approveUrl}` : ``);

    const adminWa = await getAdminWa();
    if (adminWa) sendWhatsApp(adminWa, adminMsg).catch((e: unknown) => logger.error({ e }, "Admin notify vendor rejected failed"));
  }

  logger.info({ orderId, action, vendorId: quote.vendorId }, `[TRUCKING-FIX] Vendor ${action} order`);
  return res.json({ message: action === "accept" ? "Konfirmasi diterima. Terima kasih!" : "Order ditolak." });
});

// GET /api/logistic/orders/vendor-form?rfq=RFQ-XXXXXX&v=vendorId&token=TOKEN — public vendor form data
logisticRfqRouter.get("/vendor-form", rfqRateLimit, async (req: Request, res: Response) => {
  const rfqNumber = String(req.query.rfq ?? "").trim();
  const vendorId = parseInt(String(req.query.v ?? ""), 10);
  const token = String(req.query.token ?? "").trim();

  if (!rfqNumber || isNaN(vendorId) || !token) {
    return res.status(404).json({ error: "Not found" });
  }

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.rfqNumber, rfqNumber));
  if (!rfq) return res.status(404).json({ error: "Not found" });

  const vendorIds = Array.isArray(rfq.vendorIds) ? rfq.vendorIds as number[] : [];
  if (!vendorIds.includes(vendorId)) {
    return res.status(404).json({ error: "Not found" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ error: "Not found" });

  if (!order.publicRfqToken || order.publicRfqToken !== token) {
    return res.status(404).json({ error: "Not found" });
  }

  const [vendor] = await db.select().from(suppliersTable)
    .where(eq(suppliersTable.id, vendorId));
  if (!vendor) return res.status(404).json({ error: "Not found" });

  const [existingQuote] = await db.select().from(logisticOrderQuotesTable)
    .where(and(
      eq(logisticOrderQuotesTable.rfqId, rfq.id),
      eq(logisticOrderQuotesTable.vendorId, vendorId)
    ));

  // Get vehicle type from the first trucking item
  const orderItems = await db.select().from(logisticOrderItemsTable)
    .where(eq(logisticOrderItemsTable.orderId, order.id));
  const truckingItem = orderItems.find((it) => it.calculatorType === "trucking");
  const vehicleType = truckingItem
    ? (truckingItem.inputData as Record<string, unknown>)?.vehicleType as string | null ?? null
    : null;

  // Get vendor's base price from catalog (first active item matching vehicleType, or first active)
  const catalogItems = await db.select().from(vendorCatalogItemsTable)
    .where(and(eq(vendorCatalogItemsTable.vendorId, vendorId), eq(vendorCatalogItemsTable.isActive, true)));
  const matchingItem = vehicleType
    ? catalogItems.find((c) => c.name.toLowerCase().includes(vehicleType.toLowerCase()))
    : null;
  const vendorBasePrice = matchingItem
    ? Number(matchingItem.priceBase)
    : (catalogItems[0] ? Number(catalogItems[0].priceBase) : null);

  // Track that this vendor opened the form
  const currentOpened = Array.isArray(rfq.openedVendorIds) ? (rfq.openedVendorIds as number[]) : [];
  if (!currentOpened.includes(vendorId)) {
    await db.update(logisticOrderRfqsTable)
      .set({ openedVendorIds: [...currentOpened, vendorId] })
      .where(eq(logisticOrderRfqsTable.id, rfq.id))
      .catch(() => { /* non-critical */ });
  }

  return res.json({
    rfqNumber: rfq.rfqNumber,
    rfqStatus: rfq.status,
    rfqNotes: rfq.notes,
    orderNumber: order.orderNumber,
    shipmentType: order.shipmentType,
    vehicleType,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    cargoDescription: order.cargoDescription ?? null,
    grossWeight: order.grossWeight ?? null,
    volumeCbm: order.volumeCbm ?? null,
    requiredDate: order.requiredDate ?? null,
    jamOrder: order.jamOrder ?? null,
    jumlahKoli: order.jumlahKoli ?? null,
    requestedPickup: (order as any).estimatedPickup ?? null,
    requestedDelivery: (order as any).estimatedDelivery ?? null,
    createdAt: order.createdAt.toISOString(),
    vendorId: vendor.id,
    vendorName: vendor.name,
    vendorBasePrice,
    alreadySubmitted: !!existingQuote,
    existingQuote: existingQuote ? {
      vendorPrice: Number(existingQuote.vendorPrice),
      estimatedPickup: existingQuote.estimatedPickup ?? null,
      estimatedDelivery: existingQuote.estimatedDelivery ?? null,
      estimatedDays: existingQuote.estimatedDays ?? null,
      vendorNotes: existingQuote.vendorNotes ?? null,
      quoteStatus: existingQuote.quoteStatus,
    } : null,
  });
});

// POST /api/logistic/orders/vendor-quote — public vendor submits quote via form
logisticRfqRouter.post("/vendor-quote", rfqRateLimit, async (req: Request, res: Response) => {
  const { rfqNumber, vendorId, vendorPrice, estimatedPickup, estimatedDelivery, estimatedDays, notes, token } =
    req.body as {
      rfqNumber: string; vendorId: number; vendorPrice: number;
      estimatedPickup?: string; estimatedDelivery?: string;
      estimatedDays?: number; notes?: string; token?: string;
    };

  if (!rfqNumber || !vendorId || vendorPrice == null || !token) {
    return res.status(404).json({ error: "Not found" });
  }

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.rfqNumber, rfqNumber));
  if (!rfq) return res.status(404).json({ error: "Not found" });

  const vendorIds = Array.isArray(rfq.vendorIds) ? rfq.vendorIds as number[] : [];
  if (!vendorIds.includes(Number(vendorId))) {
    return res.status(404).json({ error: "Not found" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ error: "Not found" });

  if (!order.publicRfqToken || order.publicRfqToken !== token) {
    return res.status(404).json({ error: "Not found" });
  }

  const [existingQuote] = await db.select().from(logisticOrderQuotesTable)
    .where(and(
      eq(logisticOrderQuotesTable.rfqId, rfq.id),
      eq(logisticOrderQuotesTable.vendorId, Number(vendorId))
    ));
  if (existingQuote) {
    return res.status(409).json({ error: "Quote already submitted" });
  }

  const [vendor] = await db.select().from(suppliersTable)
    .where(eq(suppliersTable.id, Number(vendorId)));

  const vp = Number(vendorPrice);

  // Look up markup from vendor catalog items: prefer item matching shipment type, else first active service item
  const catalogItems = await db.select({
    name: vendorCatalogItemsTable.name,
    markupPct: vendorCatalogItemsTable.markupPct,
    type: vendorCatalogItemsTable.type,
  }).from(vendorCatalogItemsTable)
    .where(and(eq(vendorCatalogItemsTable.vendorId, Number(vendorId)), eq(vendorCatalogItemsTable.isActive, true)));

  const shipmentType = order.shipmentType ?? "";
  const matchedItem = catalogItems.find(
    (ci) => ci.name.toLowerCase() === shipmentType.toLowerCase()
  ) ?? catalogItems.find((ci) => ci.type === "service") ?? catalogItems[0] ?? null;

  const vendorMarkupPct = matchedItem ? Number(matchedItem.markupPct ?? 0) : 0;
  const computedSellingPrice = vp * (1 + vendorMarkupPct / 100);

  const [quote] = await db.insert(logisticOrderQuotesTable).values({
    rfqId: rfq.id,
    orderId: rfq.orderId,
    vendorId: Number(vendorId),
    vendorPrice: String(vp),
    estimatedPickup: estimatedPickup?.trim() || null,
    estimatedDelivery: estimatedDelivery?.trim() || null,
    estimatedDays: estimatedDays != null ? Number(estimatedDays) : null,
    vendorNotes: notes?.trim() || null,
    markupType: "percentage",
    markupPercentage: String(vendorMarkupPct),
    fixedSellingPrice: null,
    sellingPrice: String(computedSellingPrice),
    quoteStatus: "pending",
    replySource: "vendor_form",
    replyTimestamp: new Date(),
  }).returning();

  const [adminWa, adminGroupWa] = await Promise.all([getAdminWa(), getAdminGroupWa()]);
  const allQuotes = (adminWa || adminGroupWa)
    ? await db.select().from(logisticOrderQuotesTable)
        .where(and(eq(logisticOrderQuotesTable.orderId, rfq.orderId), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
        .orderBy(logisticOrderQuotesTable.createdAt)
    : [];
  const quotePosition = allQuotes.findIndex((q) => q.id === quote.id) + 1 || undefined;
  const quoteNotifMsg = buildAdminQuoteNotif(
    rfq.rfqNumber, order.orderNumber, vendor?.name ?? `#${vendorId}`, rfq.orderId,
    { vendorPrice: vp, estimatedPickup: quote.estimatedPickup, estimatedDelivery: quote.estimatedDelivery,
      estimatedDays: quote.estimatedDays, vendorNotes: quote.vendorNotes },
    quotePosition
  );
  if (adminWa) {
    sendWhatsApp(adminWa, quoteNotifMsg).catch((e: unknown) => logger.error({ e }, "WA admin vendor-form quote notif failed"));
  }
  if (adminGroupWa) {
    sendWhatsApp(adminGroupWa, quoteNotifMsg).catch((e: unknown) => logger.error({ e }, "WA admin group vendor-form quote notif failed"));
  }

  saveAndBroadcast("vendor_quote_received", {
    type: "vendor_quote",
    orderId: rfq.orderId,
    orderNumber: order.orderNumber,
    customerName: vendor?.name ?? `Vendor #${vendorId}`,
    companyName: null,
    rfqNumber: rfq.rfqNumber,
    vendorPrice: vp,
    quotePosition,
  } as Parameters<typeof saveAndBroadcast>[1] & { rfqNumber: string; vendorPrice: number; quotePosition?: number }).catch(() => {});

  logger.info({ rfqNumber, vendorId, vendorPrice: vp }, "Vendor submitted quote via form");

  return res.status(201).json({
    success: true,
    rfqNumber,
    vendorName: vendor?.name ?? `Vendor #${vendorId}`,
    quoteId: quote.id,
  });
});

// POST /api/logistic/orders/:id/rfq — create RFQ + send WA to vendors
logisticRfqRouter.post("/:id/rfq", async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { vendorIds, notes, responseDeadline } = req.body as { vendorIds: number[]; notes?: string; responseDeadline?: string };
  if (!Array.isArray(vendorIds) || vendorIds.length === 0)
    return res.status(400).json({ message: "Pilih minimal satu vendor" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const deadlineDate = responseDeadline ? new Date(responseDeadline) : null;

  const rfqNumber = generateRfqNumber();
  const [rfq] = await db.insert(logisticOrderRfqsTable).values({
    orderId,
    rfqNumber,
    vendorIds,
    notes: notes ?? null,
    status: "open",
    ...(deadlineDate ? { responseDeadline: deadlineDate } : {}),
  } as any).returning();

  await db.update(logisticOrdersTable).set({ status: "Under Review" }).where(eq(logisticOrdersTable.id, orderId));

  const vendors = await db.select().from(suppliersTable).where(inArray(suppliersTable.id, vendorIds));

  // Get vehicleType from order items (trucking orders)
  const orderItems = await db.select().from(logisticOrderItemsTable)
    .where(eq(logisticOrderItemsTable.orderId, orderId));
  const truckingItem = orderItems.find((it) => it.calculatorType === "trucking");
  const vehicleType = truckingItem
    ? (truckingItem.inputData as Record<string, unknown>)?.vehicleType as string | null ?? null
    : null;

  const orderData = {
    orderNumber: order.orderNumber,
    origin: order.origin,
    destination: order.destination,
    shipmentType: order.shipmentType,
    commodity: order.commodity,
    cargoDescription: order.cargoDescription,
    grossWeight: order.grossWeight ? parseFloat(order.grossWeight) : null,
    volumeCbm: order.volumeCbm ? parseFloat(order.volumeCbm) : null,
    requiredDate: order.requiredDate,
    notes: notes ?? order.notes,
    jamOrder: order.jamOrder ?? null,
    createdAt: order.createdAt,
  };

  const [orderTokenRow2] = await db.select({ publicRfqToken: logisticOrdersTable.publicRfqToken })
    .from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  const orderToken2 = orderTokenRow2?.publicRfqToken ?? "";

  for (const vendor of vendors) {
    if (vendor.phone) {
      // Look up vendor's catalog price for this vehicle type
      const catalogItems = await db.select().from(vendorCatalogItemsTable)
        .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
      const matchingCatalog = vehicleType
        ? catalogItems.find((c) => c.name.toLowerCase().includes(vehicleType.toLowerCase()))
        : null;
      const vendorBasePrice = matchingCatalog
        ? Number(matchingCatalog.priceBase)
        : (catalogItems[0] ? Number(catalogItems[0].priceBase) : null);

      const formUrl = getVendorFormUrl(rfqNumber, vendor.id, orderToken2);
      const isTruckingOrder2 = !!truckingItem;
      const waItems2 = orderItems.map((it) => ({ serviceName: it.serviceName || it.category, category: it.category, subtotal: it.subtotal != null ? parseFloat(String(it.subtotal)) : null }));
      sendVendorWhatsApp({
        vendorPhone: vendor.phone, vendorName: vendor.name, vendorId: vendor.id,
        rfqNumber, orderId, orderNumber: orderData.orderNumber, longUrl: formUrl,
        origin: orderData.origin, destination: orderData.destination,
        vehicleType: vehicleType ?? null, commodity: orderData.commodity,
        grossWeight: orderData.grossWeight, volumeCbm: orderData.volumeCbm,
        requiredDate: orderData.requiredDate, notes: orderData.notes,
        vendorBasePrice, createdAt: orderData.createdAt, jamOrder: orderData.jamOrder,
        orderItems: waItems2,
        isTrucking: isTruckingOrder2,
        orderType: order.orderType ?? null,
      }).catch((err: unknown) =>
        logger.error({ err, vendorId: vendor.id }, "WA RFQ send failed")
      );
    }
  }

  logger.info({ rfqNumber, orderId, vendorCount: vendors.length }, "RFQ created and sent to vendors");

  return res.status(201).json({
    id: rfq.id,
    orderId: rfq.orderId,
    rfqNumber: rfq.rfqNumber,
    vendorIds: rfq.vendorIds,
    notes: rfq.notes,
    status: rfq.status,
    createdAt: rfq.createdAt.toISOString(),
  });
});

// GET /api/logistic/orders/:id/rfq — list RFQs for order
logisticRfqRouter.get("/:id/rfq", async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });
  const rfqs = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.orderId, orderId))
    .orderBy(sql`${logisticOrderRfqsTable.createdAt} DESC`);
  return res.json(rfqs.map((r) => ({
    id: r.id, orderId: r.orderId, rfqNumber: r.rfqNumber,
    vendorIds: r.vendorIds, notes: r.notes, status: r.status,
    createdAt: r.createdAt.toISOString(),
  })));
});

// GET /api/logistic/orders/:id/quotes — list quotes with comparison
logisticRfqRouter.get("/:id/quotes", async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const rows = await db.select().from(logisticOrderQuotesTable)
    .where(eq(logisticOrderQuotesTable.orderId, orderId))
    .orderBy(logisticOrderQuotesTable.createdAt);

  const vendors = await db.select().from(suppliersTable);
  const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));

  const quotes = rows.map((q) => toQuote(q, vendorMap[q.vendorId] ?? `Vendor #${q.vendorId}`));

  const pending = quotes.filter((q) => q.quoteStatus !== "rejected");
  const prices = pending.map((q) => q.vendorPrice);
  const days = pending.map((q) => q.estimatedDays);

  const cheapest = pending.length
    ? pending.reduce((a, b) => a.vendorPrice <= b.vendorPrice ? a : b)
    : null;
  const fastest = pending.filter((q) => q.estimatedDays != null).length
    ? pending.filter((q) => q.estimatedDays != null).reduce((a, b) => (a.estimatedDays ?? 999) <= (b.estimatedDays ?? 999) ? a : b)
    : null;

  const scored = pending.map((q) => ({ q, score: scoreQuote(q, prices, days) }));
  scored.sort((a, b) => b.score - a.score);
  const recommended = scored.length ? scored[0].q : null;

  return res.json({ quotes, cheapest, fastest, recommended });
});

// POST /api/logistic/orders/:id/quotes — manually add a quote
logisticRfqRouter.post("/:id/quotes", async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { rfqId, vendorId, vendorPrice, estimatedPickup, estimatedDelivery,
    estimatedDays, vendorNotes, markupType, markupPercentage, fixedSellingPrice } = req.body as Record<string, unknown>;

  if (!rfqId || !vendorId || vendorPrice == null)
    return res.status(400).json({ message: "rfqId, vendorId, vendorPrice wajib diisi" });

  const vp = Number(vendorPrice);
  const mt = typeof markupType === "string" ? markupType : "percentage";
  const mp = Number(markupPercentage ?? 0);
  const fp = fixedSellingPrice != null ? Number(fixedSellingPrice) : null;
  const sp = calcSellingPrice(vp, mt, mp, fp);

  const [quote] = await db.insert(logisticOrderQuotesTable).values({
    rfqId: Number(rfqId),
    orderId,
    vendorId: Number(vendorId),
    vendorPrice: String(vp),
    estimatedPickup: typeof estimatedPickup === "string" ? estimatedPickup || null : null,
    estimatedDelivery: typeof estimatedDelivery === "string" ? estimatedDelivery || null : null,
    estimatedDays: estimatedDays != null ? Number(estimatedDays) : null,
    vendorNotes: typeof vendorNotes === "string" ? vendorNotes || null : null,
    markupType: mt,
    markupPercentage: String(mp),
    fixedSellingPrice: fp != null ? String(fp) : null,
    sellingPrice: String(sp),
    quoteStatus: "pending",
    replySource: "manual",
    replyTimestamp: new Date(),
  }).returning();

  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, Number(vendorId)));

  const adminWa = await getAdminWa();
  if (adminWa) {
    const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
    const [rfq] = await db.select().from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.id, Number(rfqId)));
    if (order && rfq) {
      // Determine position of this quote in the order's pending quote list (1-based)
      const orderQuotes = await db.select().from(logisticOrderQuotesTable)
        .where(and(eq(logisticOrderQuotesTable.orderId, orderId), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
        .orderBy(logisticOrderQuotesTable.createdAt);
      const quotePosition = orderQuotes.findIndex((q) => q.id === quote.id) + 1 || undefined;
      sendWhatsApp(adminWa, buildAdminQuoteNotif(rfq.rfqNumber, order.orderNumber, vendor?.name ?? `#${vendorId}`, orderId, {
        vendorPrice: vp, estimatedPickup: quote.estimatedPickup, estimatedDelivery: quote.estimatedDelivery,
        estimatedDays: quote.estimatedDays, vendorNotes: quote.vendorNotes,
      }, quotePosition)).catch((e: unknown) => logger.error({ e }, "WA admin quote notif failed"));
    }
  }

  return res.status(201).json(toQuote(quote, vendor?.name ?? `Vendor #${vendorId}`));
});

// PUT /api/logistic/orders/quotes/:quoteId — update a quote
logisticRfqRouter.put("/quotes/:quoteId", async (req: Request, res: Response) => {
  const quoteId = parseInt(String(req.params.quoteId), 10);
  if (isNaN(quoteId)) return res.status(400).json({ message: "ID tidak valid" });

  const { vendorPrice, estimatedPickup, estimatedDelivery, estimatedDays,
    vendorNotes, markupType, markupPercentage, fixedSellingPrice, quoteStatus } = req.body as Record<string, unknown>;

  const patch: Record<string, unknown> = {};
  let vp: number | null = null;
  let mt: string | null = null;
  let mp: number | null = null;
  let fp: number | null = null;

  if (vendorPrice != null) { vp = Number(vendorPrice); patch.vendorPrice = String(vp); }
  if (markupType != null) { mt = String(markupType); patch.markupType = mt; }
  if (markupPercentage != null) { mp = Number(markupPercentage); patch.markupPercentage = String(mp); }
  if (fixedSellingPrice != null) { fp = Number(fixedSellingPrice); patch.fixedSellingPrice = String(fp); }
  if (estimatedPickup !== undefined) patch.estimatedPickup = typeof estimatedPickup === "string" ? estimatedPickup || null : null;
  if (estimatedDelivery !== undefined) patch.estimatedDelivery = typeof estimatedDelivery === "string" ? estimatedDelivery || null : null;
  if (estimatedDays != null) patch.estimatedDays = Number(estimatedDays);
  if (vendorNotes !== undefined) patch.vendorNotes = typeof vendorNotes === "string" ? vendorNotes || null : null;
  if (quoteStatus != null) patch.quoteStatus = String(quoteStatus);

  // Recalculate selling price if any pricing field changed
  if (vp != null || mt != null || mp != null || fp !== null) {
    const [existing] = await db.select().from(logisticOrderQuotesTable).where(eq(logisticOrderQuotesTable.id, quoteId));
    if (existing) {
      const finalVp = vp ?? Number(existing.vendorPrice);
      const finalMt = mt ?? existing.markupType;
      const finalMp = mp ?? Number(existing.markupPercentage);
      const finalFp = fp ?? (existing.fixedSellingPrice != null ? Number(existing.fixedSellingPrice) : null);
      patch.sellingPrice = String(calcSellingPrice(finalVp, finalMt, finalMp, finalFp));
    }
  }

  const [updated] = await db.update(logisticOrderQuotesTable)
    .set(patch).where(eq(logisticOrderQuotesTable.id, quoteId)).returning();
  if (!updated) return res.status(404).json({ message: "Quote tidak ditemukan" });

  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, updated.vendorId));
  return res.json(toQuote(updated, vendor?.name ?? `Vendor #${updated.vendorId}`));
});

// GET /api/logistic/orders/rfq-form?rfq=:rfqNumber&v=:vendorId&token=TOKEN — public vendor quote form data
logisticRfqRouter.get("/rfq-form", rfqRateLimit, async (req: Request, res: Response) => {
  const rfqNumber = String(req.query.rfq ?? "").trim();
  const vendorId = parseInt(String(req.query.v ?? ""), 10);
  const token = String(req.query.token ?? "").trim();

  if (!rfqNumber || isNaN(vendorId) || !token) {
    return res.status(404).json({ error: "Not found" });
  }

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.rfqNumber, rfqNumber));
  if (!rfq) return res.status(404).json({ error: "Not found" });

  const vendorIds = Array.isArray(rfq.vendorIds) ? rfq.vendorIds as number[] : [];
  if (!vendorIds.includes(vendorId)) {
    return res.status(404).json({ error: "Not found" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ error: "Not found" });

  if (!order.publicRfqToken || order.publicRfqToken !== token) {
    return res.status(404).json({ error: "Not found" });
  }

  const [vendor] = await db.select().from(suppliersTable)
    .where(eq(suppliersTable.id, vendorId));
  if (!vendor) return res.status(404).json({ error: "Not found" });

  const [existing, catalogItems, orderItemRows] = await Promise.all([
    db.select().from(logisticOrderQuotesTable)
      .where(and(
        eq(logisticOrderQuotesTable.rfqId, rfq.id),
        eq(logisticOrderQuotesTable.vendorId, vendorId),
      )),
    db.select().from(vendorCatalogItemsTable)
      .where(and(eq(vendorCatalogItemsTable.vendorId, vendorId), eq(vendorCatalogItemsTable.isActive, true))),
    db.select({ serviceName: logisticOrderItemsTable.serviceName, category: logisticOrderItemsTable.category, calculatorType: logisticOrderItemsTable.calculatorType })
      .from(logisticOrderItemsTable)
      .where(eq(logisticOrderItemsTable.orderId, rfq.orderId)),
  ]);

  const vt = (order as any).vehicleType ?? (order as any).truckType ?? null;
  const matchingCatalog = vt
    ? catalogItems.find((c) => c.name.toLowerCase().includes(vt.toLowerCase()))
    : null;
  const vendorBasePrice = matchingCatalog
    ? Number(matchingCatalog.priceBase)
    : catalogItems[0] ? Number(catalogItems[0].priceBase) : null;

  const isTrucking = orderItemRows.some((it) => it.calculatorType === "trucking")
    || order.shipmentType?.toLowerCase().includes("trucking")
    || false;

  return res.json({
    rfqNumber: rfq.rfqNumber,
    orderNumber: order.orderNumber,
    vendorName: vendor?.name ?? `Vendor #${vendorId}`,
    shipmentType: order.shipmentType?.trim() || null,
    origin: order.origin?.trim() || null,
    destination: order.destination?.trim() || null,
    commodity: order.commodity?.trim() || null,
    cargoDescription: ((order as any).cargoDescription as string | null)?.trim() || null,
    grossWeight: order.grossWeight ? parseFloat(order.grossWeight) : null,
    volumeCbm: order.volumeCbm ? parseFloat(order.volumeCbm) : null,
    requiredDate: order.requiredDate?.trim() || null,
    vehicleType: vt?.trim() || null,
    vendorBasePrice,
    alreadySubmitted: existing.length > 0,
    orderItems: orderItemRows.map((it) => ({ serviceName: it.serviceName, category: it.category })),
    createdAt: order.createdAt.toISOString(),
    jamOrder: order.jamOrder ?? null,
    isTrucking,
  });
});

// GET /api/logistic/orders/logistic-vendors — list active logistic vendors (public, for approve page)
logisticRfqRouter.get("/logistic-vendors", async (_req: Request, res: Response) => {
  const vendors = await db
    .select({ id: suppliersTable.id, name: suppliersTable.name, serviceType: suppliersTable.serviceType, phone: suppliersTable.phone })
    .from(suppliersTable)
    .where(eq(suppliersTable.isActive, true));
  const logistic = vendors.filter((v) => v.serviceType && v.serviceType.trim() !== "");
  return res.json(logistic.map((v) => ({ id: v.id, name: v.name, serviceType: v.serviceType ?? "", hasPhone: !!v.phone })));
});

// POST /api/logistic/orders/:id/manual-rfq — manually create RFQ and send WA to selected vendors (staff only)
logisticRfqRouter.post("/:id/manual-rfq", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { vendorIds, shipmentType } = req.body as { vendorIds?: number[]; shipmentType?: string };
  if (!vendorIds || !Array.isArray(vendorIds) || vendorIds.length === 0)
    return res.status(400).json({ message: "vendorIds wajib diisi (array of number)" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const finalShipmentType = shipmentType?.trim() || order.shipmentType || "";

  if (finalShipmentType && finalShipmentType !== order.shipmentType) {
    await db.update(logisticOrdersTable).set({ shipmentType: finalShipmentType }).where(eq(logisticOrdersTable.id, orderId));
  }

  const vendors = await db.select().from(suppliersTable).where(inArray(suppliersTable.id, vendorIds));
  const eligible = vendors.filter((v) => v.phone);
  if (eligible.length === 0)
    return res.status(400).json({ message: "Tidak ada vendor terpilih yang memiliki nomor WhatsApp" });

  const existingRfqs = await db.select().from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.orderId, orderId));
  const rfqNumber = existingRfqs.length > 0 ? existingRfqs[0].rfqNumber : generateRfqNumber();

  if (existingRfqs.length === 0) {
    await db.insert(logisticOrderRfqsTable).values({
      orderId,
      rfqNumber,
      vendorIds: eligible.map((v) => v.id),
      notes: null,
      status: "open",
    });
  } else {
    await db.update(logisticOrderRfqsTable)
      .set({ vendorIds: [...new Set([...(existingRfqs[0].vendorIds ?? []), ...eligible.map((v) => v.id)])] })
      .where(eq(logisticOrderRfqsTable.id, existingRfqs[0].id));
  }

  await db.update(logisticOrdersTable).set({ status: "Under Review" }).where(eq(logisticOrdersTable.id, orderId));

  const manualOrderItems = await db.select({ serviceName: logisticOrderItemsTable.serviceName, category: logisticOrderItemsTable.category, calculatorType: logisticOrderItemsTable.calculatorType, subtotal: logisticOrderItemsTable.subtotal })
    .from(logisticOrderItemsTable)
    .where(eq(logisticOrderItemsTable.orderId, orderId));
  const isTruckingManual = manualOrderItems.some((it) => it.calculatorType === "trucking");

  const orderData = {
    orderNumber: order.orderNumber,
    shipmentType: finalShipmentType,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    cargoDescription: order.cargoDescription ?? null,
    grossWeight: order.grossWeight ? parseFloat(order.grossWeight) : null,
    volumeCbm: order.volumeCbm ? parseFloat(order.volumeCbm) : null,
    requiredDate: order.requiredDate ?? null,
    notes: order.notes ?? null,
    createdAt: order.createdAt,
    jamOrder: order.jamOrder ?? null,
  };

  const [orderTokenRow3] = await db.select({ publicRfqToken: logisticOrdersTable.publicRfqToken })
    .from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  const orderToken3 = orderTokenRow3?.publicRfqToken ?? "";

  for (const vendor of eligible) {
    const catalogItems = await db.select().from(vendorCatalogItemsTable)
      .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
    const vendorBasePrice = catalogItems[0] ? Number(catalogItems[0].priceBase) : null;
    const formUrl = getVendorFormUrl(rfqNumber, vendor.id, orderToken3);
    const waItemsManual = manualOrderItems.map((it) => ({ serviceName: it.serviceName || it.category, category: it.category, subtotal: it.subtotal != null ? parseFloat(String(it.subtotal)) : null }));
    sendVendorWhatsApp({
      vendorPhone: vendor.phone!, vendorName: vendor.name, vendorId: vendor.id,
      rfqNumber, orderId, orderNumber: orderData.orderNumber, longUrl: formUrl,
      origin: orderData.origin, destination: orderData.destination,
      commodity: orderData.commodity, grossWeight: orderData.grossWeight,
      volumeCbm: orderData.volumeCbm, requiredDate: orderData.requiredDate,
      notes: orderData.notes, vendorBasePrice, createdAt: orderData.createdAt,
      jamOrder: orderData.jamOrder,
      orderItems: waItemsManual,
      isTrucking: isTruckingManual,
      orderType: order.orderType ?? null,
    }).catch((err: unknown) =>
      logger.error({ err, vendorId: vendor.id }, "manualRFQ WA vendor failed")
    );
  }

  logger.info({ rfqNumber, orderId, vendorCount: eligible.length }, "Manual RFQ created and sent to vendors");
  return res.json({ ok: true, rfqNumber, vendorCount: eligible.length });
});

// GET /api/logistic/orders/approve-form/:orderNumber — approve form data (staff only)
logisticRfqRouter.get("/approve-form/:orderNumber", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderNumber = req.params["orderNumber"] as string;
  if (!orderNumber) return res.status(400).json({ message: "orderNumber wajib diisi" });

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.orderNumber, orderNumber));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [quotes, rfqs] = await Promise.all([
    db.select().from(logisticOrderQuotesTable).where(eq(logisticOrderQuotesTable.orderId, order.id)),
    db.select().from(logisticOrderRfqsTable).where(eq(logisticOrderRfqsTable.orderId, order.id)),
  ]);

  const latestRfq = rfqs.sort((a, b) => (b.id ?? 0) - (a.id ?? 0))[0] ?? null;

  const vendorIds = [...new Set(quotes.map((q) => q.vendorId))];
  const rfqVendorIds = Array.isArray(latestRfq?.vendorIds) ? (latestRfq.vendorIds as number[]) : [];
  const allVendorIds = [...new Set([...vendorIds, ...rfqVendorIds])];
  const vendors = allVendorIds.length
    ? await db.select({ id: suppliersTable.id, name: suppliersTable.name, phone: suppliersTable.phone })
        .from(suppliersTable).where(inArray(suppliersTable.id, allVendorIds))
    : [];
  const vendorMap = new Map(vendors.map((v) => [v.id, v]));

  const respondedVendorIds = new Set(quotes.map((q) => q.vendorId));
  const pendingVendors = rfqVendorIds
    .filter((vid) => !respondedVendorIds.has(vid))
    .map((vid) => {
      const v = vendorMap.get(vid);
      return { id: vid, name: v?.name ?? `Vendor #${vid}`, hasPhone: !!v?.phone };
    });

  return res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    shipmentType: order.shipmentType,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    customerName: order.customerName,
    phone: order.phone ?? null,
    adminApprovalStatus: order.adminApprovalStatus ?? "pending",
    approvedQuoteId: order.approvedQuoteId ?? null,
    finalSellingPrice: order.finalSellingPrice != null ? Number(order.finalSellingPrice) : null,
    rfqId: latestRfq?.id ?? null,
    rfqNumber: latestRfq?.rfqNumber ?? null,
    pendingVendors,
    quotes: quotes.map((q) => ({
      id: q.id,
      vendorId: q.vendorId,
      vendorName: vendorMap.get(q.vendorId)?.name ?? `Vendor #${q.vendorId}`,
      estimatedPickup: q.estimatedPickup ?? null,
      estimatedDelivery: q.estimatedDelivery ?? null,
      estimatedDays: q.estimatedDays ?? null,
      vendorNotes: q.vendorNotes ?? null,
      vendorPrice: Number(q.vendorPrice),
      markupType: q.markupType,
      markupPercentage: Number(q.markupPercentage ?? 0),
      fixedSellingPrice: q.fixedSellingPrice != null ? Number(q.fixedSellingPrice) : null,
      sellingPrice: q.sellingPrice != null
        ? Number(q.sellingPrice)
        : calcSellingPrice(Number(q.vendorPrice), q.markupType, Number(q.markupPercentage ?? 0), q.fixedSellingPrice != null ? Number(q.fixedSellingPrice) : null),
      quoteStatus: q.quoteStatus,
      replySource: q.replySource,
    })),
  });
});

// GET /api/logistic/orders/:id/vendor-form-links — return form URLs + tracker status per vendor for latest RFQ (staff only)
logisticRfqRouter.get("/:id/vendor-form-links", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.orderId, orderId))
    .orderBy(sql`created_at desc`).limit(1);
  if (!rfq) return res.status(404).json({ message: "RFQ belum dibuat untuk order ini" });

  const rfqVendorIds = Array.isArray(rfq.vendorIds) ? (rfq.vendorIds as number[]) : [];
  const openedVendorIds = new Set(Array.isArray(rfq.openedVendorIds) ? (rfq.openedVendorIds as number[]) : []);

  const submittedQuotes = await db.select({
    vendorId: logisticOrderQuotesTable.vendorId,
    vendorPrice: logisticOrderQuotesTable.vendorPrice,
    estimatedDays: logisticOrderQuotesTable.estimatedDays,
    estimatedPickup: logisticOrderQuotesTable.estimatedPickup,
    estimatedDelivery: logisticOrderQuotesTable.estimatedDelivery,
    vendorNotes: logisticOrderQuotesTable.vendorNotes,
    createdAt: logisticOrderQuotesTable.createdAt,
    replySource: logisticOrderQuotesTable.replySource,
    quoteStatus: logisticOrderQuotesTable.quoteStatus,
  }).from(logisticOrderQuotesTable)
    .where(eq(logisticOrderQuotesTable.orderId, orderId));

  const quoteByVendor = new Map<number, typeof submittedQuotes[0]>();
  for (const q of submittedQuotes) {
    if (q.vendorId != null) quoteByVendor.set(q.vendorId, q);
  }

  const vendors = rfqVendorIds.length > 0
    ? await db.select().from(suppliersTable).where(inArray(suppliersTable.id, rfqVendorIds))
    : [];

  const token = order.publicRfqToken ?? "";

  const result = vendors.map((v) => {
    const quote = quoteByVendor.get(v.id);
    return {
      vendorId: v.id,
      vendorName: v.name,
      phone: v.phone ?? null,
      hasPhone: !!v.phone,
      hasOpened: openedVendorIds.has(v.id),
      hasSubmitted: !!quote,
      formUrl: token ? getVendorFormUrl(rfq.rfqNumber, v.id, token) : null,
      quote: quote ? {
        vendorPrice: Number(quote.vendorPrice),
        estimatedDays: quote.estimatedDays ?? null,
        estimatedPickup: quote.estimatedPickup ?? null,
        estimatedDelivery: quote.estimatedDelivery ?? null,
        vendorNotes: quote.vendorNotes ?? null,
        submittedAt: quote.createdAt?.toISOString() ?? null,
        replySource: quote.replySource,
        quoteStatus: quote.quoteStatus,
      } : null,
    };
  });

  return res.json({ rfqNumber: rfq.rfqNumber, orderId, vendors: result });
});

// POST /api/logistic/orders/:id/resend-rfq — resend WA to vendors who haven't submitted quotes yet (staff only)
logisticRfqRouter.post("/:id/resend-rfq", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { vendorIds: bodyVendorIds } = req.body as { vendorIds?: number[] };

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [rfqs] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.orderId, orderId));
  if (!rfqs) return res.status(404).json({ message: "RFQ belum dibuat untuk order ini" });

  const rfqVendorIds = Array.isArray(rfqs.vendorIds) ? (rfqs.vendorIds as number[]) : [];
  if (rfqVendorIds.length === 0) return res.status(400).json({ message: "Tidak ada vendor di RFQ ini" });

  // Determine which vendors to resend to
  const targetVendorIds = bodyVendorIds?.length
    ? bodyVendorIds.filter((id) => rfqVendorIds.includes(id))
    : rfqVendorIds;

  if (targetVendorIds.length === 0) return res.status(400).json({ message: "Tidak ada vendor yang valid untuk dikirim ulang" });

  const vendors = await db.select().from(suppliersTable)
    .where(inArray(suppliersTable.id, targetVendorIds));
  const eligible = vendors.filter((v) => v.phone);
  if (eligible.length === 0)
    return res.status(400).json({ message: "Tidak ada vendor terpilih yang memiliki nomor WhatsApp" });

  const orderToken = order.publicRfqToken ?? "";
  const resendOrderItems = await db.select({ serviceName: logisticOrderItemsTable.serviceName, category: logisticOrderItemsTable.category, subtotal: logisticOrderItemsTable.subtotal })
    .from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, orderId));

  const results: { vendorId: number; vendorName: string; sent: boolean }[] = [];
  for (const vendor of eligible) {
    const catalogItems = await db.select().from(vendorCatalogItemsTable)
      .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
    const vt = (order as any).vehicleType ?? (order as any).truckType ?? null;
    const matchingCatalog = vt
      ? catalogItems.find((c) => c.name.toLowerCase().includes(vt.toLowerCase()))
      : null;
    const vendorBasePrice = matchingCatalog
      ? Number(matchingCatalog.priceBase)
      : catalogItems[0] ? Number(catalogItems[0].priceBase) : null;

    const formUrl = getVendorFormUrl(rfqs.rfqNumber, vendor.id, orderToken);
    const waResendItems = resendOrderItems.map((it) => ({ serviceName: it.serviceName || it.category, category: it.category, subtotal: it.subtotal != null ? parseFloat(String(it.subtotal)) : null }));
    try {
      await sendVendorWhatsApp({
        vendorPhone: vendor.phone!, vendorName: vendor.name, vendorId: vendor.id,
        rfqNumber: rfqs.rfqNumber, orderId, orderNumber: order.orderNumber, longUrl: formUrl,
        origin: order.origin, destination: order.destination,
        commodity: order.commodity ?? null, grossWeight: order.grossWeight ? parseFloat(order.grossWeight) : null,
        volumeCbm: order.volumeCbm ? parseFloat(order.volumeCbm) : null,
        requiredDate: order.requiredDate ?? null,
        notes: order.notes ?? null, vendorBasePrice, createdAt: order.createdAt,
        jamOrder: order.jamOrder ?? null,
        orderItems: waResendItems,
        orderType: order.orderType ?? null,
      });
      results.push({ vendorId: vendor.id, vendorName: vendor.name, sent: true });
    } catch (err) {
      logger.error({ err, vendorId: vendor.id }, "resend-rfq WA failed");
      results.push({ vendorId: vendor.id, vendorName: vendor.name, sent: false });
    }
  }

  const sentCount = results.filter((r) => r.sent).length;
  logger.info({ rfqNumber: rfqs.rfqNumber, orderId, sentCount }, "Resend RFQ WA");
  return res.json({ ok: true, rfqNumber: rfqs.rfqNumber, sentCount, results });
});


// POST /api/logistic/orders/:id/approve — admin approves + send quotation to customer (staff only)
logisticRfqRouter.post("/:id/approve", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { quoteId, sellingPrice: overrideSellingPrice } = req.body as { quoteId: number; sellingPrice?: number };
  if (!quoteId) return res.status(400).json({ message: "quoteId wajib diisi" });

  const [quote] = await db.select().from(logisticOrderQuotesTable)
    .where(and(eq(logisticOrderQuotesTable.id, quoteId), eq(logisticOrderQuotesTable.orderId, orderId)));
  if (!quote) return res.status(404).json({ message: "Quote tidak ditemukan" });

  const sellingPrice = overrideSellingPrice != null ? overrideSellingPrice
    : quote.sellingPrice != null ? Number(quote.sellingPrice)
    : calcSellingPrice(Number(quote.vendorPrice), quote.markupType, Number(quote.markupPercentage),
        quote.fixedSellingPrice != null ? Number(quote.fixedSellingPrice) : null);

  const now = new Date();
  const confirmToken = randomUUID();

  await db.update(logisticOrderQuotesTable)
    .set({ quoteStatus: "approved" })
    .where(eq(logisticOrderQuotesTable.id, quoteId));

  const [updatedOrder] = await db.update(logisticOrdersTable)
    .set({
      status: "Quotation Sent",
      approvedQuoteId: quoteId,
      approvedVendorId: quote.vendorId,
      adminApprovalStatus: "approved",
      approvedAt: now,
      finalSellingPrice: String(sellingPrice),
      quotationSentAt: now,
      customerConfirmToken: confirmToken,
      customerConfirmStatus: "pending",
    })
    .where(eq(logisticOrdersTable.id, orderId))
    .returning();

  if (!updatedOrder) return res.status(500).json({ message: "Gagal update order" });

  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, quote.vendorId));
  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

  const confirmUrl = getConfirmFormUrl(confirmToken);

  // [TRUCKING-FIX] Use trucking-specific customer WA format if this is a trucking order
  const orderAny = updatedOrder as any;
  const truckType = orderAny.truckType ?? null;
  const pickupDate = orderAny.pickupDate ?? null;
  const pickupTime = orderAny.pickupTime ?? null;
  const isTrucking = !!(truckType || (updatedOrder as any).vehicleType);

  const customerMsg = isTrucking
    ? (
        `✅ *PENAWARAN TRUCKING - CST Logistics*\n` +
        `📦 Order: ${updatedOrder.orderNumber}\n\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📍 Rute: ${updatedOrder.origin} → ${updatedOrder.destination}\n` +
        (pickupDate ? `📅 Pickup: ${formatISODate(pickupDate)}${pickupTime ? ` ${pickupTime} WIB` : ""}\n` : "") +
        `🚚 Unit: ${truckType ?? "-"} | ${updatedOrder.commodity ?? "Umum"}\n\n` +
        `💰 TOTAL BIAYA: ${fmt(sellingPrice)}\n` +
        `━━━━━━━━━━━━━━━━━━\n\n` +
        (confirmUrl ? `✅ Setuju & lanjutkan: ${confirmUrl}\n` : "") +
        (confirmUrl ? `❌ Batalkan: ${confirmUrl}?cancel=1\n` : "") +
        `⏳ Berlaku: 3 hari`
      )
    : (
        `✅ *PENAWARAN HARGA ANDA TELAH SIAP*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Halo *${updatedOrder.customerName}*,\n\n` +
        `Kami telah memproses permintaan Anda dan menyiapkan penawaran terbaik.\n\n` +
        `No. Order   : \`${updatedOrder.orderNumber}\`\n` +
        `Jenis       : ${updatedOrder.shipmentType}\n` +
        `Rute        : ${updatedOrder.origin} → ${updatedOrder.destination}\n` +
        (updatedOrder.commodity ? `Komoditi    : ${updatedOrder.commodity}\n` : "") +
        (quote.estimatedPickup ? `ETA Pickup  : ${quote.estimatedPickup}\n` : "") +
        (quote.estimatedDelivery ? `ETA Kirim   : ${quote.estimatedDelivery}\n` : "") +
        `━━━━━━━━━━━━━━━━━━\n` +
        `💰 *Total Harga  : ${fmt(sellingPrice)}*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        (confirmUrl ? `📋 *Konfirmasi persetujuan Anda di sini:*\n${confirmUrl}\n\n` : "") +
        `Atau balas pesan ini / hubungi kami:\n` +
        `📞 Jakarta: (021) 6241234`
      );

  if (isTrucking) console.log(`[TRUCKING-FLOW] State: Vendor Confirmed → Waiting Customer (order ${orderId})`);

  if (updatedOrder.phone) {
    sendWhatsApp(updatedOrder.phone, customerMsg).catch((e: unknown) =>
      logger.error({ e }, "WA customer quotation failed")
    );
  }

  // Email ke customer saat quote diapprove
  if (isSmtpConfigured() && updatedOrder.email) {
    const fmtRpEmail = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
    const emailHtmlRows = [
      `<tr><td style="padding:6px 12px;color:#555;font-weight:600">No. Order</td><td style="padding:6px 12px;color:#222"><strong>${updatedOrder.orderNumber}</strong></td></tr>`,
      `<tr><td style="padding:6px 12px;color:#555;font-weight:600">Jenis</td><td style="padding:6px 12px;color:#222">${updatedOrder.shipmentType}</td></tr>`,
      `<tr><td style="padding:6px 12px;color:#555;font-weight:600">Rute</td><td style="padding:6px 12px;color:#222">${updatedOrder.origin} → ${updatedOrder.destination}</td></tr>`,
      updatedOrder.commodity ? `<tr><td style="padding:6px 12px;color:#555;font-weight:600">Komoditi</td><td style="padding:6px 12px;color:#222">${updatedOrder.commodity}</td></tr>` : "",
      quote.estimatedPickup ? `<tr><td style="padding:6px 12px;color:#555;font-weight:600">ETA Pickup</td><td style="padding:6px 12px;color:#222">${quote.estimatedPickup}</td></tr>` : "",
      quote.estimatedDelivery ? `<tr><td style="padding:6px 12px;color:#555;font-weight:600">ETA Kirim</td><td style="padding:6px 12px;color:#222">${quote.estimatedDelivery}</td></tr>` : "",
      `<tr style="background:#f0f9ff"><td style="padding:6px 12px;color:#1e40af;font-weight:700">Total Harga</td><td style="padding:6px 12px;color:#1e40af;font-weight:700">${fmtRpEmail(sellingPrice)}</td></tr>`,
    ].filter(Boolean).join("");
    const confirmBtnHtml = confirmUrl
      ? `<div style="margin-top:24px;text-align:center">
          <a href="${confirmUrl}" style="display:inline-block;background:#1d4ed8;color:#fff;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">✅ Setuju & Konfirmasi</a>
          <a href="${confirmUrl}?cancel=1" style="display:inline-block;margin-left:12px;background:#ef4444;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:700;font-size:15px">❌ Tolak</a>
         </div>`
      : "";
    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px"><tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<tr><td style="background:#1e40af;padding:24px 32px">
  <h1 style="margin:0;color:#fff;font-size:20px">🚢 CST Logistics</h1>
  <p style="margin:4px 0 0;color:#bfdbfe;font-size:14px">Penawaran Harga Anda Telah Siap</p>
</td></tr>
<tr><td style="padding:24px 32px">
  <p style="margin:0 0 20px;color:#374151;font-size:15px">Halo <strong>${updatedOrder.customerName}</strong>,<br><br>Tim CST Logistics telah menyiapkan penawaran terbaik untuk permintaan Anda. Silakan tinjau detailnya dan konfirmasi persetujuan Anda.</p>
  <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">${emailHtmlRows}</table>
  ${confirmBtnHtml}
  <p style="margin:24px 0 0;color:#6b7280;font-size:13px">Penawaran berlaku selama 3 hari. Hubungi kami jika ada pertanyaan: <strong>(021) 6241234</strong></p>
</td></tr>
<tr><td style="background:#f9fafb;padding:16px 32px;border-top:1px solid #e5e7eb">
  <p style="margin:0;color:#9ca3af;font-size:12px">CST Logistics — Jln. Ternate No. 10B/C, Jakarta 10150</p>
</td></tr>
</table></td></tr></table>
</body></html>`;
    sendMail({
      to: updatedOrder.email,
      subject: `Penawaran Harga Siap — ${updatedOrder.orderNumber}`,
      html: emailHtml,
      text: `Halo ${updatedOrder.customerName},\n\nPenawaran harga untuk order ${updatedOrder.orderNumber} telah siap.\nRute: ${updatedOrder.origin} → ${updatedOrder.destination}\nTotal: ${fmtRpEmail(sellingPrice)}\n${confirmUrl ? `\nKonfirmasi: ${confirmUrl}` : ""}`,
    }).catch((e: unknown) => logger.error({ e }, "Email customer quotation failed"));
  }

  logger.info({ orderId, quoteId, sellingPrice, vendorId: quote.vendorId }, "Quote approved, quotation sent to customer via WA + email");

  return res.json({
    id: updatedOrder.id,
    orderNumber: updatedOrder.orderNumber,
    status: updatedOrder.status,
    finalSellingPrice: sellingPrice,
    approvedVendorName: vendor?.name ?? null,
    quotationSentAt: now.toISOString(),
    confirmUrl,
  });
});

// GET /api/logistic/orders/confirm-form/:token — public: load data for customer confirmation page
logisticRfqRouter.get("/confirm-form/:token", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  if (!token) return res.status(400).json({ message: "Token wajib diisi" });

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.customerConfirmToken, token));
  if (!order) return res.status(404).json({ message: "Link konfirmasi tidak valid atau sudah kadaluarsa" });

  // Get approved quote for ETA + vendor info
  let estimatedPickup: string | null = null;
  let estimatedDelivery: string | null = null;
  let vendorName: string | null = null;
  if (order.approvedQuoteId) {
    const [quote] = await db.select().from(logisticOrderQuotesTable)
      .where(eq(logisticOrderQuotesTable.id, order.approvedQuoteId));
    if (quote) {
      estimatedPickup = quote.estimatedPickup ?? null;
      estimatedDelivery = quote.estimatedDelivery ?? null;
      if (order.approvedVendorId) {
        const [vendor] = await db.select().from(suppliersTable)
          .where(eq(suppliersTable.id, order.approvedVendorId));
        vendorName = vendor?.name ?? null;
      }
    }
  }

  const orderAny2 = order as any;
  return res.json({
    orderId: order.id,
    orderNumber: order.orderNumber,
    shipmentType: order.shipmentType,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    customerName: order.customerName,
    phone: order.phone ?? null,
    finalSellingPrice: order.finalSellingPrice != null ? Number(order.finalSellingPrice) : 0,
    estimatedPickup,
    estimatedDelivery,
    pickupDate: orderAny2.pickupDate ?? order.requiredDate ?? null,
    pickupTime: orderAny2.pickupTime ?? order.jamOrder ?? null,
    truckType: orderAny2.truckType ?? null,
    vendorName,
    customerConfirmStatus: order.customerConfirmStatus ?? "pending",
    weight: order.grossWeight != null ? Number(order.grossWeight) : null,
    volume: order.volumeCbm != null ? Number(order.volumeCbm) : null,
    notes: order.notes ?? null,
  });
});

// POST /api/logistic/orders/confirm/:token — public: customer confirms or rejects
logisticRfqRouter.post("/confirm/:token", async (req: Request, res: Response) => {
  const token = req.params["token"] as string;
  const { action } = req.body as { action: "confirmed" | "rejected" };

  if (!token) return res.status(400).json({ message: "Token wajib diisi" });
  if (action !== "confirmed" && action !== "rejected") {
    return res.status(400).json({ message: "Action harus 'confirmed' atau 'rejected'" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.customerConfirmToken, token));
  if (!order) return res.status(404).json({ message: "Link konfirmasi tidak valid atau sudah kadaluarsa" });

  if (order.customerConfirmStatus !== "pending") {
    return res.status(409).json({ message: "Konfirmasi sudah pernah dikirimkan sebelumnya" });
  }

  const now = new Date();
  const newStatus = action === "confirmed" ? "Confirmed" : "Quotation Sent";

  await db.update(logisticOrdersTable)
    .set({
      customerConfirmStatus: action,
      customerConfirmedAt: now,
      ...(action === "confirmed" ? { status: newStatus } : {}),
    })
    .where(eq(logisticOrdersTable.id, order.id));

  // ── Auto-create Sales Order saat customer konfirmasi setuju ─────────────────
  let createdSoNumber: string | null = null;
  if (action === "confirmed") {
    try {
      // Idempotency: cek apakah SO sudah pernah dibuat untuk logistic order ini
      const [existingSo] = await db
        .select({ id: salesDocumentsTable.id, docNumber: salesDocumentsTable.docNumber })
        .from(salesDocumentsTable)
        .where(eq(salesDocumentsTable.logisticOrderId, order.id));

      if (existingSo) {
        createdSoNumber = existingSo.docNumber;
        logger.info({ orderId: order.id, soId: existingSo.id }, "SO sudah ada, skip auto-create");
      } else {
        // Generate nomor SO: SO/YYYY/NNNNN
        const soYear = new Date().getFullYear();
        const soPattern = `SO/${soYear}/%`;
        const [soRow] = await db
          .select({ maxSeq: sql<number>`COALESCE(MAX(CAST(SPLIT_PART(doc_number, '/', 3) AS int)), 0)` })
          .from(salesDocumentsTable)
          .where(sql`doc_number LIKE ${soPattern}`);
        const soSeq = (Number(soRow?.maxSeq ?? 0) + 1).toString().padStart(5, "0");
        const soNumber = `SO/${soYear}/${soSeq}`;

        const sellingPrice = order.finalSellingPrice != null ? Number(order.finalSellingPrice) : 0;
        const orderAnyCreate = order as any;

        const [newSo] = await db.insert(salesDocumentsTable).values({
          docNumber: soNumber,
          kind: "order",
          status: "confirmed",
          invoiceStatus: "to_invoice",
          deliveryStatus: "to_deliver",
          paymentStatus: "unpaid",
          customerName: order.customerName,
          totalAmount: String(sellingPrice),
          taxAmount: "0",
          grandTotal: String(sellingPrice),
          origin: order.origin ?? null,
          destination: order.destination ?? null,
          transportMode: order.shipmentType ?? null,
          logisticOrderId: order.id,
          companyId: order.companyId ?? null,
          confirmedAt: now,
          notes: `Auto-dibuat dari konfirmasi customer — Order Logistik: ${order.orderNumber}`,
          ...(orderAnyCreate.pickupDate ? { etd: orderAnyCreate.pickupDate } : {}),
        }).returning({ id: salesDocumentsTable.id, docNumber: salesDocumentsTable.docNumber });

        if (newSo) {
          createdSoNumber = newSo.docNumber;
          // Insert 1 line: jasa pengiriman
          await db.insert(salesDocumentLinesTable).values({
            documentId: newSo.id,
            name: `Jasa Pengiriman ${order.origin} → ${order.destination}`,
            description: [
              order.shipmentType,
              order.commodity ? `Komoditi: ${order.commodity}` : null,
              order.grossWeight ? `Berat: ${order.grossWeight} kg` : null,
            ].filter(Boolean).join(" | ") || null,
            quantity: "1",
            unitPrice: String(sellingPrice),
            subtotal: String(sellingPrice),
          });
          logger.info({ orderId: order.id, soNumber, soId: newSo.id }, "Sales Order auto-created dari customer confirm");
        }
      }
    } catch (soErr) {
      logger.error({ soErr, orderId: order.id }, "Auto-create SO gagal — tidak memblokir response");
    }
  }

  // Notify admin via WA
  const adminWa = await getAdminWa();
  if (adminWa) {
    const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
    const sp = order.finalSellingPrice != null ? Number(order.finalSellingPrice) : 0;
    const orderUrl = getOrderUrl(order.id);
    const orderAny3 = order as any;
    const truckType  = orderAny3.truckType ?? null;
    const pickupDate = orderAny3.pickupDate ? formatISODate(orderAny3.pickupDate) : null;
    const pickupTime = orderAny3.pickupTime ?? null;
    const isTrucking = !!truckType;

    const adminMsg = action === "confirmed"
      ? `✅ *CUSTOMER SETUJU — ${order.orderNumber}*\n\n` +
        `Customer *${order.customerName}* menyetujui penawaran:\n` +
        `💰 *${fmtRp(sp)}*\n\n` +
        `📍 Rute: ${order.origin} → ${order.destination}\n` +
        (isTrucking && pickupDate ? `📅 Pickup: ${pickupDate}${pickupTime ? ` ${pickupTime} WIB` : ""}\n` : "") +
        (truckType ? `🚚 Unit: ${truckType}\n` : "") +
        (createdSoNumber ? `\n📄 *Sales Order dibuat: ${createdSoNumber}*\n` : "") +
        `\n🔗 Detail order:\n${orderUrl}`
      : `❌ *CUSTOMER TOLAK — ${order.orderNumber}*\n\n` +
        `Customer *${order.customerName}* menolak penawaran:\n` +
        `💰 *${fmtRp(sp)}*\n\n` +
        `📍 Rute: ${order.origin} → ${order.destination}\n` +
        `Silakan hubungi customer untuk negosiasi lebih lanjut.\n\n` +
        (orderUrl ? `🔗 Detail order:\n${orderUrl}` : "");
    sendWhatsApp(adminWa, adminMsg).catch((e: unknown) =>
      logger.error({ e }, "WA admin customer confirm notif failed")
    );
    if (action === "confirmed") console.log(`[TRUCKING-FLOW] State: Confirmed → SO_CREATED:${createdSoNumber} (order ${order.id})`);
  }

  logger.info({ orderId: order.id, action, orderNumber: order.orderNumber, soNumber: createdSoNumber }, "Customer confirmation received");
  return res.json({ ok: true, action, salesOrderNumber: createdSoNumber });
});

// ─── [MULTI-MODE] Vendor Offers — Admin-Select Flow ──────────────────────────

// GET /:id/vendor-offers — list vendor offers for admin (with vendor name)
logisticRfqRouter.get("/:id/vendor-offers", async (req: Request, res: Response) => {
  const orderId = parseInt(req.params["id"] as string, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const offers = await db.select({
    id: vendorOffersTable.id,
    orderId: vendorOffersTable.orderId,
    vendorId: vendorOffersTable.vendorId,
    vendorName: suppliersTable.name,
    transportMode: vendorOffersTable.transportMode,
    offerPrice: vendorOffersTable.offerPrice,
    vehicleYear: vendorOffersTable.vehicleYear,
    carrierName: vendorOffersTable.carrierName,
    transitDays: vendorOffersTable.transitDays,
    notes: vendorOffersTable.notes,
    isSelectedByAdmin: vendorOffersTable.isSelectedByAdmin,
    finalCustomerPrice: vendorOffersTable.finalCustomerPrice,
    optionLabel: vendorOffersTable.optionLabel,
    status: vendorOffersTable.status,
    chosenAt: vendorOffersTable.chosenAt,
    createdAt: vendorOffersTable.createdAt,
  })
    .from(vendorOffersTable)
    .leftJoin(suppliersTable, eq(vendorOffersTable.vendorId, suppliersTable.id))
    .where(eq(vendorOffersTable.orderId, orderId))
    .orderBy(vendorOffersTable.createdAt);

  return res.json(offers.map((o) => ({
    ...o,
    offerPrice: o.offerPrice != null ? Number(o.offerPrice) : 0,
    finalCustomerPrice: o.finalCustomerPrice != null ? Number(o.finalCustomerPrice) : null,
  })));
});

// POST /:id/vendor-offers — admin creates a vendor offer
logisticRfqRouter.post("/:id/vendor-offers", async (req: Request, res: Response) => {
  const orderId = parseInt(req.params["id"] as string, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { vendorId, offerPrice, finalCustomerPrice, vehicleYear, carrierName, transitDays, notes, transportMode } =
    req.body as {
      vendorId?: number; offerPrice: number; finalCustomerPrice?: number;
      vehicleYear?: number; carrierName?: string; transitDays?: number;
      notes?: string; transportMode?: string;
    };

  if (offerPrice == null || offerPrice <= 0) {
    return res.status(400).json({ message: "offerPrice wajib diisi" });
  }

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Lookup vendor info if vendorId provided
  let resolvedCarrierName = carrierName?.trim() || null;
  let resolvedVehicleYear = vehicleYear ?? null;
  if (vendorId) {
    const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, vendorId));
    if (vendor) {
      if (!resolvedCarrierName) resolvedCarrierName = vendor.name;
      if (!resolvedVehicleYear) resolvedVehicleYear = (vendor as any).yearVehicle ?? null;
    }
  }

  const [offer] = await db.insert(vendorOffersTable).values({
    orderId,
    vendorId: vendorId ?? null,
    transportMode: transportMode ?? (order as any).transportMode ?? null,
    offerPrice: String(offerPrice),
    finalCustomerPrice: finalCustomerPrice != null ? String(finalCustomerPrice) : null,
    vehicleYear: resolvedVehicleYear,
    carrierName: resolvedCarrierName,
    transitDays: transitDays ?? null,
    notes: notes?.trim() || null,
    isSelectedByAdmin: true,
    status: "PENDING",
  } as any).returning();

  logger.info({ orderId, offerId: offer.id }, "[MULTI-MODE] Vendor offer created by admin");
  return res.status(201).json({ ...offer, offerPrice: Number(offer.offerPrice) });
});

// DELETE /vendor-offers/:offerId — admin removes an offer
logisticRfqRouter.delete("/vendor-offers/:offerId", async (req: Request, res: Response) => {
  const offerId = parseInt(req.params["offerId"] as string, 10);
  if (isNaN(offerId)) return res.status(400).json({ message: "ID tidak valid" });

  await db.delete(vendorOffersTable).where(eq(vendorOffersTable.id, offerId));
  return res.json({ ok: true });
});

// POST /:id/send-customer-options — admin sends anonymous options to customer via WA
logisticRfqRouter.post("/:id/send-customer-options", async (req: Request, res: Response) => {
  const orderId = parseInt(req.params["id"] as string, 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const offers = await db.select().from(vendorOffersTable)
    .where(and(eq(vendorOffersTable.orderId, orderId), eq(vendorOffersTable.isSelectedByAdmin, true)))
    .orderBy(vendorOffersTable.createdAt);

  if (offers.length === 0) {
    return res.status(400).json({ message: "Belum ada opsi yang dipilih admin. Tambahkan minimal 1 opsi vendor." });
  }

  // Generate options token
  const token = randomUUID();
  const optionUrl = getChooseOptionUrl(token);

  // Label each offer: Opsi 1, Opsi 2, ...
  for (let i = 0; i < offers.length; i++) {
    await db.update(vendorOffersTable)
      .set({ optionLabel: `Opsi ${i + 1}`, status: "OPTIONS_SENT" } as any)
      .where(eq(vendorOffersTable.id, offers[i].id));
  }

  await db.update(logisticOrdersTable)
    .set({ optionsToken: token, optionsSentAt: new Date(), status: "Quotation Sent" } as any)
    .where(eq(logisticOrdersTable.id, orderId));

  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const orderAny = order as any;
  const isTrucking = !!(orderAny.truckType || orderAny.transportMode === "TRUCKING");

  // [MULTI-MODE] Compact WA format per spec — NO vendor names shown
  const NUM_EMOJI = ["1️⃣","2️⃣","3️⃣","4️⃣","5️⃣"];
  const modeLabel = orderAny.transportMode === "TRUCKING" ? "TRUCKING"
    : orderAny.transportMode === "AIR_FREIGHT" ? "AIR FREIGHT"
    : orderAny.transportMode === "SEA_FREIGHT" ? "SEA FREIGHT"
    : "LOGISTIK";
  const labelChar = (i: number) => String.fromCharCode(65 + i); // A, B, C...

  let optLines = "";
  for (let i = 0; i < offers.length; i++) {
    const o = offers[i];
    const price = o.finalCustomerPrice != null ? Number(o.finalCustomerPrice) : Number(o.offerPrice);
    const numEmoji = NUM_EMOJI[i] ?? `${i + 1}.`;
    let line = `${numEmoji} Opsi ${labelChar(i)} | 💰${fmt(price)}`;
    if (isTrucking && o.vehicleYear) line += ` | 🚗${o.vehicleYear}`;
    if (!isTrucking && o.transitDays) line += ` | ⏱️${o.transitDays}hr`;
    if (isTrucking && orderAny.truckType) line += ` | ${orderAny.truckType}`;
    if (o.notes) line += ` | ${o.notes}`;
    optLines += line + "\n";
  }

  const pickupLine = isTrucking && orderAny.pickupDate
    ? `📅 Pickup: ${formatISODate(orderAny.pickupDate)}${orderAny.pickupTime ? ` ${orderAny.pickupTime}` : ""}\n`
    : "";

  const waMsg =
    `✅ PENAWARAN ${modeLabel} - CST Logistics\n` +
    `📦 Order: ${order.orderNumber}\n` +
    `📍 ${order.origin} → ${order.destination}\n` +
    pickupLine +
    `━━━━━━━━━━━━━━\n` +
    optLines +
    `━━━━━━━━━━━━━━\n` +
    `👉 Pilih opsi Anda:\n${optionUrl}`;

  if (order.phone) {
    sendWhatsApp(order.phone, waMsg).catch((e: unknown) =>
      logger.error({ e }, "[MULTI-MODE] WA send-options to customer failed")
    );
  }

  logger.info({ orderId, optionCount: offers.length }, "[MULTI-MODE] Options sent to customer");
  return res.json({ ok: true, optionUrl, optionCount: offers.length });
});

// GET /choose-option-form/:token — public: customer views anonymous options
logisticRfqRouter.get("/choose-option-form/:token", async (req: Request, res: Response) => {
  const { token } = req.params;
  if (!token) return res.status(400).json({ message: "Token wajib diisi" });

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.optionsToken as any, token));
  if (!order) return res.status(404).json({ message: "Link tidak valid atau sudah kadaluarsa" });

  const offers = await db.select().from(vendorOffersTable)
    .where(and(eq(vendorOffersTable.orderId, order.id), eq(vendorOffersTable.isSelectedByAdmin, true)))
    .orderBy(vendorOffersTable.createdAt);

  const orderAny = order as any;
  const isTrucking = !!(orderAny.truckType || orderAny.transportMode === "TRUCKING");

  const options = offers.map((o, i) => ({
    id: o.id,
    label: o.optionLabel ?? `Opsi ${i + 1}`,
    price: o.finalCustomerPrice != null ? Number(o.finalCustomerPrice) : Number(o.offerPrice),
    vehicleYear: isTrucking ? (o.vehicleYear ?? null) : null,
    truckType: isTrucking ? (orderAny.truckType ?? null) : null,
    carrierInfo: !isTrucking ? (o.transitDays != null ? `Transit ${o.transitDays} hari` : null) : null,
    transitDays: o.transitDays ?? null,
    notes: o.notes ?? null,
    status: o.status,
    isChosen: o.status === "CUSTOMER_CHOSEN",
  }));

  const alreadyChosen = options.some((o) => o.isChosen);

  return res.json({
    orderNumber: order.orderNumber,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    pickupDate: orderAny.pickupDate ?? null,
    pickupTime: orderAny.pickupTime ?? null,
    truckType: orderAny.truckType ?? null,
    transportMode: orderAny.transportMode ?? null,
    originPort: orderAny.originPort ?? null,
    destPort: orderAny.destPort ?? null,
    etd: orderAny.etd ? (orderAny.etd instanceof Date ? orderAny.etd.toISOString().split("T")[0] : String(orderAny.etd).split("T")[0]) : null,
    eta: orderAny.eta ? (orderAny.eta instanceof Date ? orderAny.eta.toISOString().split("T")[0] : String(orderAny.eta).split("T")[0]) : null,
    isTrucking,
    customerConfirmStatus: order.customerConfirmStatus ?? "pending",
    alreadyChosen,
    options,
  });
});

// POST /choose-option — public: customer picks one option
logisticRfqRouter.post("/choose-option", async (req: Request, res: Response) => {
  const { token, optionId } = req.body as { token: string; optionId: number };
  if (!token || !optionId) return res.status(400).json({ message: "token dan optionId wajib diisi" });

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.optionsToken as any, token));
  if (!order) return res.status(404).json({ message: "Link tidak valid" });

  const allOffers = await db.select().from(vendorOffersTable)
    .where(eq(vendorOffersTable.orderId, order.id));

  const alreadyChosen = allOffers.some((o) => o.status === "CUSTOMER_CHOSEN");
  if (alreadyChosen) return res.status(409).json({ message: "Anda sudah memilih opsi sebelumnya" });

  const chosen = allOffers.find((o) => o.id === Number(optionId));
  if (!chosen) return res.status(404).json({ message: "Opsi tidak ditemukan" });

  const chosenPrice = chosen.finalCustomerPrice != null ? Number(chosen.finalCustomerPrice) : Number(chosen.offerPrice);

  // Mark chosen offer
  await db.update(vendorOffersTable)
    .set({ status: "CUSTOMER_CHOSEN", chosenAt: new Date() } as any)
    .where(eq(vendorOffersTable.id, chosen.id));

  // Mark others as rejected
  const othersIds = allOffers.filter((o) => o.id !== chosen.id).map((o) => o.id);
  if (othersIds.length > 0) {
    await db.update(vendorOffersTable)
      .set({ status: "CUSTOMER_REJECTED" } as any)
      .where(inArray(vendorOffersTable.id, othersIds));
  }

  // Update order: confirmed + final selling price
  const confirmToken = randomUUID();
  await db.update(logisticOrdersTable).set({
    status: "Confirmed",
    customerConfirmStatus: "confirmed",
    customerConfirmedAt: new Date(),
    finalSellingPrice: String(chosenPrice),
    customerConfirmToken: confirmToken,
  }).where(eq(logisticOrdersTable.id, order.id));

  const fmtRp = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const orderUrl = getOrderUrl(order.id);
  const orderAny = order as any;
  const isTrucking = !!(orderAny.truckType || orderAny.transportMode === "TRUCKING");
  const pickupDate = orderAny.pickupDate ? formatISODate(orderAny.pickupDate) : null;
  const pickupTime = orderAny.pickupTime ?? null;

  // Notify admin via WA with SO link
  const adminWa = await getAdminWa();
  if (adminWa) {
    const adminMsg =
      `✅ *CUSTOMER MEMILIH OPSI — ${order.orderNumber}*\n\n` +
      `Customer *${order.customerName}* memilih: *${chosen.optionLabel ?? "Opsi"}*\n` +
      `💰 *${fmtRp(chosenPrice)}*\n\n` +
      `📍 Rute: ${order.origin} → ${order.destination}\n` +
      (isTrucking && pickupDate ? `📅 Pickup: ${pickupDate}${pickupTime ? ` ${pickupTime} WIB` : ""}\n` : "") +
      (orderAny.truckType ? `🚚 Unit: ${orderAny.truckType}\n` : "") +
      (chosen.vehicleYear ? `📅 Tahun Unit: ${chosen.vehicleYear}\n` : "") +
      `\n🔗 *Buat Sales Order:*\n${orderUrl}`;
    sendWhatsApp(adminWa, adminMsg).catch((e: unknown) =>
      logger.error({ e }, "[MULTI-MODE] WA admin choose-option failed")
    );
  }

  console.log(`[MULTI-MODE] State: Options Sent → Confirmed (order ${order.id}, chose offer ${chosen.id})`);
  logger.info({ orderId: order.id, offerId: chosen.id, price: chosenPrice }, "[MULTI-MODE] Customer chose option");
  return res.json({ ok: true, chosenLabel: chosen.optionLabel ?? "Opsi", price: chosenPrice });
});

// GET /estimate-price — public: auto-estimate lowest vendor rate for a given mode/route
logisticRfqRouter.get("/estimate-price", async (req: Request, res: Response) => {
  const { transport_mode, origin, dest, truck_type, distance_km } = req.query as Record<string, string>;
  if (!transport_mode) {
    return res.status(400).json({ message: "transport_mode wajib diisi" });
  }

  const DISCLAIMER = "Estimasi berdasarkan tarif vendor aktif. Harga final mengikuti penawaran yang dikonfirmasi admin.";
  const distKm = distance_km ? parseFloat(distance_km) : null;

  try {
    const yearCutoff = new Date().getFullYear() - 5;
    const candidates: number[] = [];

    if (transport_mode === "TRUCKING") {
      // 1) vendorRatesTable — per_trip (flat) OR per_km × distance
      const rateRows = await db
        .select({ baseRate: vendorRatesTable.baseRate, unit: vendorRatesTable.unit })
        .from(vendorRatesTable)
        .innerJoin(suppliersTable, eq(vendorRatesTable.vendorId, suppliersTable.id))
        .where(
          and(
            eq(vendorRatesTable.transportMode, "TRUCKING"),
            eq(vendorRatesTable.isActive, true),
            ...(truck_type ? [eq(vendorRatesTable.truckType, truck_type)] : []),
            sql`(${suppliersTable.yearVehicle} IS NULL OR ${suppliersTable.yearVehicle} >= ${yearCutoff})`
          )
        );
      for (const r of rateRows) {
        const base = Number(r.baseRate);
        if (r.unit === "per_km" && distKm && distKm > 0) {
          candidates.push(base * distKm);
        } else if (r.unit !== "per_km") {
          candidates.push(base);
        }
        // per_km without distance → skip (can't compute)
      }

      // 2) vendor_catalog_items — unit contains 'km', price_base × (1+markup/100) × distance
      if (distKm && distKm > 0) {
        const catalogRows = await db
          .select({ priceBase: vendorCatalogItemsTable.priceBase, markupPct: vendorCatalogItemsTable.markupPct })
          .from(vendorCatalogItemsTable)
          .innerJoin(suppliersTable, eq(vendorCatalogItemsTable.vendorId, suppliersTable.id))
          .where(
            and(
              eq(vendorCatalogItemsTable.isActive, true),
              sql`LOWER(${vendorCatalogItemsTable.unit}) LIKE '%km%'`
            )
          );
        for (const c of catalogRows) {
          const base = Number(c.priceBase);
          const markup = Number(c.markupPct) || 0;
          if (base > 0) {
            candidates.push(base * (1 + markup / 100) * distKm);
          }
        }
      }
    } else if (transport_mode === "AIR_FREIGHT" || transport_mode === "SEA_FREIGHT") {
      const rows = await db
        .select({ baseRate: vendorRatesTable.baseRate, unit: vendorRatesTable.unit })
        .from(vendorRatesTable)
        .where(
          and(
            eq(vendorRatesTable.transportMode, transport_mode),
            eq(vendorRatesTable.isActive, true)
          )
        );
      for (const r of rows) {
        candidates.push(Number(r.baseRate));
      }
    }

    const estimatedPrice = candidates.length > 0 ? Math.min(...candidates) : null;
    return res.json({ estimated_price: estimatedPrice, disclaimer: DISCLAIMER });
  } catch (e: unknown) {
    logger.error({ e }, "[estimate-price] Error querying vendor_rates");
    return res.json({ estimated_price: null, disclaimer: DISCLAIMER });
  }
});

// POST /api/logistic/orders/:id/duplicate-rfq — duplicate RFQ to new vendors (staff only)
logisticRfqRouter.post("/:id/duplicate-rfq", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { newVendorIds, notes, responseDeadline } = req.body as {
    newVendorIds?: number[]; notes?: string; responseDeadline?: string;
  };

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  // Get the latest existing RFQ to duplicate from
  const [existingRfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.orderId, orderId))
    .orderBy(sql`created_at desc`).limit(1);

  const vendorIds: number[] = newVendorIds?.length
    ? newVendorIds
    : (existingRfq?.vendorIds as number[] ?? []);

  if (!vendorIds.length) return res.status(400).json({ message: "Tidak ada vendor untuk RFQ baru" });

  const deadlineDate = responseDeadline ? new Date(responseDeadline) : null;
  const rfqNumber = generateRfqNumber();

  const [newRfq] = await db.insert(logisticOrderRfqsTable).values({
    orderId,
    rfqNumber,
    vendorIds,
    notes: notes ?? existingRfq?.notes ?? null,
    status: "open",
    ...(deadlineDate ? { responseDeadline: deadlineDate } : {}),
  } as any).returning();

  const vendors = await db.select().from(suppliersTable).where(inArray(suppliersTable.id, vendorIds));
  const eligible = vendors.filter((v) => v.phone);

  const orderToken = order.publicRfqToken ?? "";
  const orderItems = await db.select().from(logisticOrderItemsTable).where(eq(logisticOrderItemsTable.orderId, orderId));
  const isTrucking = orderItems.some((it) => it.calculatorType === "trucking");
  const waItems = orderItems.map((it) => ({ serviceName: it.serviceName || it.category, category: it.category, subtotal: it.subtotal != null ? parseFloat(String(it.subtotal)) : null }));

  for (const vendor of eligible) {
    const catalogItems = await db.select().from(vendorCatalogItemsTable)
      .where(and(eq(vendorCatalogItemsTable.vendorId, vendor.id), eq(vendorCatalogItemsTable.isActive, true)));
    const vendorBasePrice = catalogItems[0] ? Number(catalogItems[0].priceBase) : null;
    const formUrl = getVendorFormUrl(rfqNumber, vendor.id, orderToken);
    sendVendorWhatsApp({
      vendorPhone: vendor.phone!, vendorName: vendor.name, vendorId: vendor.id,
      rfqNumber, orderId, orderNumber: order.orderNumber, longUrl: formUrl,
      origin: order.origin, destination: order.destination,
      commodity: order.commodity ?? null,
      grossWeight: order.grossWeight ? parseFloat(order.grossWeight) : null,
      volumeCbm: order.volumeCbm ? parseFloat(order.volumeCbm) : null,
      requiredDate: order.requiredDate ?? null,
      notes: notes ?? order.notes ?? null,
      vendorBasePrice,
      createdAt: order.createdAt,
      jamOrder: order.jamOrder ?? null,
      orderItems: waItems,
      isTrucking,
      orderType: order.orderType ?? null,
    }).catch((err: unknown) => logger.error({ err, vendorId: vendor.id }, "duplicate-rfq WA vendor failed"));
  }

  logger.info({ rfqNumber, orderId, vendorCount: eligible.length }, "Duplicate RFQ created and sent");
  return res.status(201).json({ ok: true, rfqNumber, rfqId: newRfq.id, vendorCount: eligible.length });
});

// GET /api/logistic/orders/:id/activity-log — get activity log for an order (staff only)
logisticRfqRouter.get("/:id/activity-log", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });
  try {
    const result = await db.execute(sql`
      SELECT * FROM activity_logs WHERE order_id = ${orderId} ORDER BY created_at DESC LIMIT 100
    `);
    return res.json(result.rows);
  } catch {
    return res.json([]);
  }
});

// GET /api/logistic/orders/:id/operational-status — get current operational+payment status
logisticRfqRouter.get("/:id/operational-status", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const orderAny = order as any;
  return res.json({
    id: order.id,
    orderNumber: order.orderNumber,
    status: order.status,
    operationalStatus: orderAny.operationalStatus ?? null,
    paymentStatus: orderAny.paymentStatus ?? "unpaid",
    adminApprovalStatus: order.adminApprovalStatus ?? "pending",
  });
});

// PUT /api/logistic/orders/:id/operational-status — update operational + payment status
logisticRfqRouter.put("/:id/operational-status", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ message: "ID tidak valid" });

  const { operationalStatus, paymentStatus } = req.body as { operationalStatus?: string; paymentStatus?: string };
  const patch: Record<string, unknown> = {};
  if (operationalStatus !== undefined) patch.operationalStatus = operationalStatus;
  if (paymentStatus !== undefined) patch.paymentStatus = paymentStatus;
  if (!Object.keys(patch).length) return res.status(400).json({ message: "Tidak ada field yang diupdate" });

  try {
    const orderRows = await db.execute(sql`
      SELECT order_number, customer_name, phone, company_name FROM logistic_orders WHERE id = ${orderId}
    `);
    const order = orderRows.rows[0] as { order_number: string; customer_name: string; phone: string | null; company_name: string | null } | undefined;

    await db.execute(sql`
      UPDATE logistic_orders SET
        ${operationalStatus !== undefined ? sql`operational_status = ${operationalStatus},` : sql``}
        ${paymentStatus !== undefined ? sql`payment_status = ${paymentStatus},` : sql``}
        updated_at = NOW()
      WHERE id = ${orderId}
    `);

    // WA milestone notification
    if (order && operationalStatus) {
      const OP_LABEL: Record<string, string> = {
        pending: "Menunggu Penjemputan",
        picking_up: "Sedang Dijemput",
        in_transit: "Dalam Pengiriman",
        delivered: "Terkirim",
        cancelled: "Dibatalkan",
      };
      const label = OP_LABEL[operationalStatus] ?? operationalStatus;
      const emoji = operationalStatus === "delivered" ? "✅" : operationalStatus === "cancelled" ? "❌" : operationalStatus === "in_transit" ? "🚚" : operationalStatus === "picking_up" ? "📦" : "🕐";
      const msg =
        `${emoji} *Update Status Pengiriman*\n\n` +
        `No. Order: *${order.order_number}*\n` +
        `Customer: ${order.customer_name}${order.company_name ? ` (${order.company_name})` : ""}\n` +
        `Status Operasional: *${label}*\n\n` +
        `CST Logistics — Terima kasih telah menggunakan layanan kami.`;

      if (order.phone) {
        sendWhatsApp(order.phone, msg).catch((err: unknown) =>
          logger.error({ err }, "WA milestone notification to customer failed")
        );
      }

      const adminWa = await getAdminWa();
      if (adminWa) {
        sendWhatsApp(adminWa,
          `${emoji} *Status Update* — ${order.order_number}\nCustomer: ${order.customer_name}\nStatus: *${label}*`
        ).catch(() => {});
      }
    }

    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "update operational status failed");
    return res.status(500).json({ message: "Gagal update status" });
  }
});
