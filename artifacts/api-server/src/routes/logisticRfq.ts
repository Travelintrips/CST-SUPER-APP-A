import { Router, Request, Response } from "express";
import { db, suppliersTable, logisticOrdersTable, logisticOrderRfqsTable, logisticOrderQuotesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";

export const logisticRfqRouter = Router();

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
}, rfqNumber: string, vendorName: string, formUrl?: string): string {
  const isFreight = isFreightWithDimensions(order.shipmentType);
  const tgl = order.createdAt ? formatTanggal(order.createdAt) : "";
  const jam = order.jamOrder ?? (order.createdAt ? formatJam(order.createdAt) : "");

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
    (order.volumeCbm ? `Volume        : ${order.volumeCbm} CBM\n` : "") +
    (order.requiredDate ? `Tgl Butuh     : ${order.requiredDate}\n` : "") +
    (order.notes ? `Catatan       : ${order.notes}\n` : "") +
    `━━━━━━━━━━━━━━━━━━\n` +
    freightHint +
    (formUrl
      ? `📱 *CARA TERMUDAH — ISI FORM ONLINE:*\n${formUrl}\n\nKlik link di atas, isi harga & estimasi, lalu Submit.\n\n` +
        `━━━━━━━━━━━━━━━━━━\n\n`
      : ``) +
    `📝 *ATAU BALAS PESAN INI:*\n\n` +
    `Format balasan:\n` +
    `\`\`\`${rfqNumber} HARGA ETA_PICKUP ETA_DELIVERY CATATAN\`\`\`\n\n` +
    `Contoh:\n` +
    `\`\`\`${rfqNumber} 5000000 besok 3hari muatan-aman\`\`\`\n` +
    `\`\`\`${rfqNumber} 3500000\`\`\`\n\n` +
    `⚠️ Nomor RFQ *${rfqNumber}* wajib ada di awal pesan.\n` +
    `   Isi harga *tanpa titik/koma* pemisah ribuan.\n\n` +
    `Terima kasih 🙏`
  );
}

function getOrderUrl(orderId: number): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/portal-orders/${orderId}`;
}

function getVendorFormUrl(rfqNumber: string, vendorId: number): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/vendor-quote?rfq=${rfqNumber}&v=${vendorId}`;
}

function buildAdminQuoteNotif(rfqNumber: string, orderNumber: string, vendorName: string, orderId: number, quote: {
  vendorPrice: number; estimatedPickup?: string | null; estimatedDelivery?: string | null;
  estimatedDays?: number | null; vendorNotes?: string | null;
}, quotePosition?: number): string {
  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const url = getOrderUrl(orderId);
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
    (quotePosition != null
      ? `✅ Approve vendor ini:\n\`APPROVE ${orderNumber} ${quotePosition}\`\n\n`
      : ``) +
    `📋 Lihat semua penawaran:\n\`QUOTES ${orderNumber}\`\n\n` +
    (url ? `🔗 *Buka di BizPortal:*\n${url}` : `Login ke sistem untuk approve.`)
  );
}

const toQuote = (q: typeof logisticOrderQuotesTable.$inferSelect, vendorName: string) => ({
  id: q.id,
  rfqId: q.rfqId,
  orderId: q.orderId,
  vendorId: q.vendorId,
  vendorName,
  vendorPrice: Number(q.vendorPrice),
  estimatedPickup: q.estimatedPickup ?? null,
  estimatedDelivery: q.estimatedDelivery ?? null,
  estimatedDays: q.estimatedDays ?? null,
  vendorNotes: q.vendorNotes ?? null,
  markupType: q.markupType,
  markupPercentage: Number(q.markupPercentage),
  fixedSellingPrice: q.fixedSellingPrice != null ? Number(q.fixedSellingPrice) : null,
  sellingPrice: q.sellingPrice != null ? Number(q.sellingPrice) : null,
  quoteStatus: q.quoteStatus,
  replySource: q.replySource,
  replyTimestamp: q.replyTimestamp?.toISOString() ?? null,
  createdAt: q.createdAt.toISOString(),
});

// GET /api/logistic/orders/vendor-form?rfq=RFQ-XXXXXX&v=vendorId — public vendor form data
logisticRfqRouter.get("/vendor-form", async (req: Request, res: Response) => {
  const rfqNumber = String(req.query.rfq ?? "").trim();
  const vendorId = parseInt(String(req.query.v ?? ""), 10);

  if (!rfqNumber || isNaN(vendorId)) {
    return res.status(400).json({ message: "Parameter rfq dan v wajib diisi" });
  }

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.rfqNumber, rfqNumber));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const vendorIds = Array.isArray(rfq.vendorIds) ? rfq.vendorIds as number[] : [];
  if (!vendorIds.includes(vendorId)) {
    return res.status(403).json({ message: "Vendor tidak diundang dalam RFQ ini" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [vendor] = await db.select().from(suppliersTable)
    .where(eq(suppliersTable.id, vendorId));
  if (!vendor) return res.status(404).json({ message: "Vendor tidak ditemukan" });

  const [existingQuote] = await db.select().from(logisticOrderQuotesTable)
    .where(and(
      eq(logisticOrderQuotesTable.rfqId, rfq.id),
      eq(logisticOrderQuotesTable.vendorId, vendorId)
    ));

  return res.json({
    rfqNumber: rfq.rfqNumber,
    rfqStatus: rfq.status,
    rfqNotes: rfq.notes,
    orderNumber: order.orderNumber,
    shipmentType: order.shipmentType,
    origin: order.origin,
    destination: order.destination,
    commodity: order.commodity ?? null,
    cargoDescription: order.cargoDescription ?? null,
    grossWeight: order.grossWeight ?? null,
    volumeCbm: order.volumeCbm ?? null,
    requiredDate: order.requiredDate ?? null,
    jamOrder: order.jamOrder ?? null,
    jumlahKoli: order.jumlahKoli ?? null,
    namaPenerima: order.namaPenerima ?? null,
    nomorPenerima: order.nomorPenerima ?? null,
    requestedPickup: (order as any).estimatedPickup ?? null,
    requestedDelivery: (order as any).estimatedDelivery ?? null,
    createdAt: order.createdAt.toISOString(),
    vendorId: vendor.id,
    vendorName: vendor.name,
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
logisticRfqRouter.post("/vendor-quote", async (req: Request, res: Response) => {
  const { rfqNumber, vendorId, vendorPrice, estimatedPickup, estimatedDelivery, estimatedDays, notes } =
    req.body as {
      rfqNumber: string; vendorId: number; vendorPrice: number;
      estimatedPickup?: string; estimatedDelivery?: string;
      estimatedDays?: number; notes?: string;
    };

  if (!rfqNumber || !vendorId || vendorPrice == null) {
    return res.status(400).json({ message: "rfqNumber, vendorId, vendorPrice wajib diisi" });
  }

  const [rfq] = await db.select().from(logisticOrderRfqsTable)
    .where(eq(logisticOrderRfqsTable.rfqNumber, rfqNumber));
  if (!rfq) return res.status(404).json({ message: "RFQ tidak ditemukan" });

  const vendorIds = Array.isArray(rfq.vendorIds) ? rfq.vendorIds as number[] : [];
  if (!vendorIds.includes(Number(vendorId))) {
    return res.status(403).json({ message: "Vendor tidak diundang dalam RFQ ini" });
  }

  const [order] = await db.select().from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, rfq.orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const [vendor] = await db.select().from(suppliersTable)
    .where(eq(suppliersTable.id, Number(vendorId)));

  const vp = Number(vendorPrice);
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
    markupPercentage: "0",
    fixedSellingPrice: null,
    sellingPrice: String(vp),
    quoteStatus: "pending",
    replySource: "vendor_form",
    replyTimestamp: new Date(),
  }).returning();

  const adminWa = await getAdminWa();
  if (adminWa) {
    const allQuotes = await db.select().from(logisticOrderQuotesTable)
      .where(and(eq(logisticOrderQuotesTable.orderId, rfq.orderId), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
      .orderBy(logisticOrderQuotesTable.createdAt);
    const quotePosition = allQuotes.findIndex((q) => q.id === quote.id) + 1 || undefined;
    sendWhatsApp(adminWa, buildAdminQuoteNotif(
      rfq.rfqNumber, order.orderNumber, vendor?.name ?? `#${vendorId}`, rfq.orderId,
      { vendorPrice: vp, estimatedPickup: quote.estimatedPickup, estimatedDelivery: quote.estimatedDelivery,
        estimatedDays: quote.estimatedDays, vendorNotes: quote.vendorNotes },
      quotePosition
    )).catch((e: unknown) => logger.error({ e }, "WA admin vendor-form quote notif failed"));
  }

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

  const { vendorIds, notes } = req.body as { vendorIds: number[]; notes?: string };
  if (!Array.isArray(vendorIds) || vendorIds.length === 0)
    return res.status(400).json({ message: "Pilih minimal satu vendor" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const rfqNumber = generateRfqNumber();
  const [rfq] = await db.insert(logisticOrderRfqsTable).values({
    orderId,
    rfqNumber,
    vendorIds,
    notes: notes ?? null,
    status: "open",
  }).returning();

  await db.update(logisticOrdersTable).set({ status: "Under Review" }).where(eq(logisticOrdersTable.id, orderId));

  const vendors = await db.select().from(suppliersTable).where(inArray(suppliersTable.id, vendorIds));

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

  for (const vendor of vendors) {
    if (vendor.phone) {
      const formUrl = getVendorFormUrl(rfqNumber, vendor.id);
      const msg = buildRfqWaMessage(orderData, rfqNumber, vendor.name, formUrl);
      sendWhatsApp(vendor.phone, msg).catch((err: unknown) =>
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

// POST /api/logistic/orders/:id/approve — admin approves + send quotation to customer
logisticRfqRouter.post("/:id/approve", async (req: Request, res: Response) => {
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
    })
    .where(eq(logisticOrdersTable.id, orderId))
    .returning();

  if (!updatedOrder) return res.status(500).json({ message: "Gagal update order" });

  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, quote.vendorId));
  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

  const customerMsg =
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
    `Balas pesan ini atau hubungi kami untuk konfirmasi:\n` +
    `📞 Jakarta: (021) 6241234`;

  if (updatedOrder.phone) {
    sendWhatsApp(updatedOrder.phone, customerMsg).catch((e: unknown) =>
      logger.error({ e }, "WA customer quotation failed")
    );
  }

  logger.info({ orderId, quoteId, sellingPrice, vendorId: quote.vendorId }, "Quote approved, quotation sent to customer");

  return res.json({
    id: updatedOrder.id,
    orderNumber: updatedOrder.orderNumber,
    status: updatedOrder.status,
    finalSellingPrice: sellingPrice,
    approvedVendorName: vendor?.name ?? null,
    quotationSentAt: now.toISOString(),
  });
});
