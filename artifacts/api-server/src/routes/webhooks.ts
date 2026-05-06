import { Router, type Request, type Response } from "express";
import { db, suppliersTable, logisticOrderRfqsTable, logisticOrderQuotesTable, logisticOrdersTable } from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";

const router = Router();

function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

function calcSellingPrice(vendorPrice: number, markupType: string, markupPct: number, fixedPrice: number | null): number {
  if (markupType === "fixed_price" && fixedPrice != null) return fixedPrice;
  return vendorPrice + (vendorPrice * markupPct / 100);
}

function fmt(n: number): string {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

/**
 * Returns list of authorized admin WA phone numbers (normalized).
 * Source: ADMIN_WA_PHONES env var, comma-separated.
 * Example: ADMIN_WA_PHONES=08123456789,628987654321
 */
function getAdminPhones(): string[] {
  const raw = process.env.ADMIN_WA_PHONES ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map(normalizePhone);
}

function getOrderUrl(orderId: number): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/portal-orders/${orderId}`;
}

/**
 * Parse vendor reply for RFQ format.
 * Expected: RFQ-YYMMDD-XXXXX [price] [optional: eta pickup] [optional: eta delivery] [optional: notes...]
 */
function parseVendorReply(message: string): {
  rfqNumber: string; vendorPrice: number;
  estimatedPickup: string | null; estimatedDelivery: string | null; vendorNotes: string | null;
} | null {
  const cleaned = message.trim();
  const rfqMatch = cleaned.match(/(?:#)?(RFQ-\d{6}-\d{5})/i);
  if (!rfqMatch) return null;
  const rfqNumber = rfqMatch[1].toUpperCase();

  const afterRfq = cleaned.slice(cleaned.indexOf(rfqMatch[1]) + rfqMatch[1].length).trim();
  const priceMatch = afterRfq.match(/^[\s,]*(\d[\d.,]*)/);
  if (!priceMatch) return null;
  const vendorPrice = parseFloat(priceMatch[1].replace(/[.,](?=\d{3}(?:[.,]|$))/g, "").replace(",", "."));
  if (isNaN(vendorPrice) || vendorPrice <= 0) return null;

  const rest = afterRfq.slice(priceMatch[0].length).trim();
  const parts = rest ? rest.split(/\s+/) : [];

  const estimatedPickup = parts.length > 0 ? parts[0] : null;
  const estimatedDelivery = parts.length > 1 ? parts[1] : null;
  const vendorNotes = parts.length > 2 ? parts.slice(2).join(" ") : null;

  return { rfqNumber, vendorPrice, estimatedPickup, estimatedDelivery, vendorNotes };
}

/**
 * Parse admin approve command.
 * Format: APPROVE LOG-XXXXXX-XXXXX [sellingPrice]
 * Examples:
 *   APPROVE LOG-260506-12345 5500000
 *   APPROVE LOG-260506-12345          ← uses recommended quote's calculated price
 */
function parseAdminApprove(message: string): {
  orderNumber: string; sellingPrice: number | null;
} | null {
  const cleaned = message.trim();
  const match = cleaned.match(/^APPROVE\s+(LOG-\d{6}-\d+)(?:\s+([\d.,]+))?/i);
  if (!match) return null;
  const orderNumber = match[1].toUpperCase();
  let sellingPrice: number | null = null;
  if (match[2]) {
    sellingPrice = parseFloat(match[2].replace(/[.,](?=\d{3}(?:[.,]|$))/g, "").replace(",", "."));
    if (isNaN(sellingPrice) || sellingPrice <= 0) sellingPrice = null;
  }
  return { orderNumber, sellingPrice };
}

/**
 * Shared approve logic: find best pending quote for an order, approve it, send WA to customer.
 */
async function doApproveOrder(
  orderId: number,
  overrideSellingPrice: number | null,
): Promise<{
  orderNumber: string; vendorName: string; sellingPrice: number; customerPhone: string | null;
} | { error: string }> {
  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return { error: "Order tidak ditemukan" };
  if (order.adminApprovalStatus === "approved") return { error: "Order sudah pernah di-approve" };

  const quotes = await db.select().from(logisticOrderQuotesTable)
    .where(and(eq(logisticOrderQuotesTable.orderId, orderId), eq(logisticOrderQuotesTable.quoteStatus, "pending")));
  if (quotes.length === 0) return { error: "Tidak ada quote pending untuk order ini" };

  // Pick best quote: lowest vendor price
  const best = quotes.reduce((a, b) => Number(a.vendorPrice) <= Number(b.vendorPrice) ? a : b);

  const sellingPrice = overrideSellingPrice != null
    ? overrideSellingPrice
    : best.sellingPrice != null
    ? Number(best.sellingPrice)
    : calcSellingPrice(Number(best.vendorPrice), best.markupType, Number(best.markupPercentage),
        best.fixedSellingPrice != null ? Number(best.fixedSellingPrice) : null);

  const now = new Date();
  await db.update(logisticOrderQuotesTable)
    .set({ quoteStatus: "approved" })
    .where(eq(logisticOrderQuotesTable.id, best.id));

  await db.update(logisticOrdersTable).set({
    status: "Quotation Sent",
    approvedQuoteId: best.id,
    approvedVendorId: best.vendorId,
    adminApprovalStatus: "approved",
    approvedAt: now,
    finalSellingPrice: String(sellingPrice),
    quotationSentAt: now,
  }).where(eq(logisticOrdersTable.id, orderId));

  const [vendor] = await db.select().from(suppliersTable).where(eq(suppliersTable.id, best.vendorId));
  const vendorName = vendor?.name ?? `Vendor #${best.vendorId}`;

  const customerMsg =
    `✅ *PENAWARAN HARGA ANDA TELAH SIAP*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Halo *${order.customerName}*,\n\n` +
    `Kami telah memproses permintaan Anda dan menyiapkan penawaran terbaik.\n\n` +
    `No. Order   : \`${order.orderNumber}\`\n` +
    `Jenis       : ${order.shipmentType}\n` +
    `Rute        : ${order.origin} → ${order.destination}\n` +
    (order.commodity ? `Komoditi    : ${order.commodity}\n` : "") +
    (best.estimatedPickup ? `ETA Pickup  : ${best.estimatedPickup}\n` : "") +
    (best.estimatedDelivery ? `ETA Kirim   : ${best.estimatedDelivery}\n` : "") +
    `━━━━━━━━━━━━━━━━━━\n` +
    `💰 *Total Harga  : ${fmt(sellingPrice)}*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `Balas pesan ini atau hubungi kami untuk konfirmasi:\n` +
    `📞 Jakarta: (021) 6241234`;

  if (order.phone) {
    sendWhatsApp(order.phone, customerMsg).catch((e: unknown) =>
      logger.error({ e }, "WA customer quotation failed")
    );
  }

  logger.info({ orderId, quoteId: best.id, sellingPrice, vendorId: best.vendorId }, "Quote approved via WA command");

  return {
    orderNumber: order.orderNumber,
    vendorName,
    sellingPrice,
    customerPhone: order.phone ?? null,
  };
}

router.get("/webhook/fonnte", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

router.post("/webhook/fonnte", async (req: Request, res: Response) => {
  res.status(200).json({ status: true });

  try {
    const body = req.body as Record<string, unknown>;
    const sender = typeof body.sender === "string" ? body.sender : null;
    const message = typeof body.message === "string" ? body.message : null;
    const senderName = typeof body.sender_name === "string" ? body.sender_name : null;

    if (!sender || !message) {
      logger.warn({ body }, "Fonnte webhook: missing sender or message");
      return;
    }

    const normalizedSender = normalizePhone(sender);
    const adminWa = await getAdminWa();

    // ─── 1. Check if sender is an authorized admin ───────────────────────────
    const adminPhones = getAdminPhones();
    const isAdmin = adminPhones.length > 0 && adminPhones.includes(normalizedSender);

    if (isAdmin) {
      const adminCmd = parseAdminApprove(message);
      if (adminCmd) {
        // Find order by order number
        const [order] = await db.select().from(logisticOrdersTable)
          .where(sql`${logisticOrdersTable.orderNumber} = ${adminCmd.orderNumber}`);

        if (!order) {
          sendWhatsApp(sender,
            `❌ Order *${adminCmd.orderNumber}* tidak ditemukan.`
          ).catch(() => undefined);
          return;
        }

        const result = await doApproveOrder(order.id, adminCmd.sellingPrice);

        if ("error" in result) {
          sendWhatsApp(sender,
            `❌ Gagal approve *${adminCmd.orderNumber}*:\n${result.error}`
          ).catch(() => undefined);
          return;
        }

        // Confirm to admin
        const confirmMsg =
          `✅ *APPROVE BERHASIL*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `No. Order   : \`${result.orderNumber}\`\n` +
          `Vendor      : ${result.vendorName}\n` +
          `Harga Jual  : *${fmt(result.sellingPrice)}*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          (result.customerPhone
            ? `📤 Penawaran sudah dikirim ke customer`
            : `⚠️ No. HP customer tidak tersedia, WA tidak dikirim`);
        sendWhatsApp(sender, confirmMsg).catch(() => undefined);

        // Also notify admin group if different from sender
        if (adminWa && adminWa !== sender) {
          sendWhatsApp(adminWa,
            `✅ Order \`${result.orderNumber}\` di-approve via WA oleh ${senderName ?? sender}.\n` +
            `Harga: ${fmt(result.sellingPrice)} (vendor: ${result.vendorName})`
          ).catch(() => undefined);
        }
        return;
      }

      // Admin sent something that isn't a recognized command — show help
      if (/approve/i.test(message)) {
        sendWhatsApp(sender,
          `ℹ️ *Format perintah approve:*\n` +
          `APPROVE [No. Order] [Harga Jual]\n\n` +
          `Contoh:\n` +
          `\`\`\`APPROVE LOG-260506-12345 5500000\`\`\`\n\n` +
          `Jika harga tidak dicantumkan, sistem akan pakai harga rekomendasi.`
        ).catch(() => undefined);
        return;
      }
      // Fall through for other admin messages
    }

    // ─── 2. Check if sender is a known vendor ────────────────────────────────
    const vendors = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
    const matchedVendor = vendors.find((v) => v.phone && normalizePhone(v.phone) === normalizedSender);

    if (matchedVendor) {
      const parsed = parseVendorReply(message);

      if (parsed) {
        const [rfq] = await db.select().from(logisticOrderRfqsTable)
          .where(eq(logisticOrderRfqsTable.rfqNumber, parsed.rfqNumber));

        if (rfq) {
          const isInRfq = (rfq.vendorIds as number[]).includes(matchedVendor.id);
          if (isInRfq) {
            const [existingQuote] = await db.select().from(logisticOrderQuotesTable)
              .where(sql`${logisticOrderQuotesTable.rfqId} = ${rfq.id} AND ${logisticOrderQuotesTable.vendorId} = ${matchedVendor.id}`);

            const markupPct = Number(matchedVendor.markup ?? 0);
            const sellingPrice = calcSellingPrice(parsed.vendorPrice, "percentage", markupPct, null);
            const now = new Date();

            if (existingQuote) {
              await db.update(logisticOrderQuotesTable).set({
                vendorPrice: String(parsed.vendorPrice),
                estimatedPickup: parsed.estimatedPickup,
                estimatedDelivery: parsed.estimatedDelivery,
                vendorNotes: parsed.vendorNotes,
                markupPercentage: String(markupPct),
                sellingPrice: String(sellingPrice),
                replySource: "whatsapp",
                replyTimestamp: now,
              }).where(eq(logisticOrderQuotesTable.id, existingQuote.id));
              logger.info({ rfqNumber: parsed.rfqNumber, vendorId: matchedVendor.id }, "Updated WA quote from vendor");
            } else {
              await db.insert(logisticOrderQuotesTable).values({
                rfqId: rfq.id,
                orderId: rfq.orderId,
                vendorId: matchedVendor.id,
                vendorPrice: String(parsed.vendorPrice),
                estimatedPickup: parsed.estimatedPickup,
                estimatedDelivery: parsed.estimatedDelivery,
                vendorNotes: parsed.vendorNotes,
                markupType: "percentage",
                markupPercentage: String(markupPct),
                sellingPrice: String(sellingPrice),
                quoteStatus: "pending",
                replySource: "whatsapp",
                replyTimestamp: now,
              });
              logger.info({ rfqNumber: parsed.rfqNumber, vendorId: matchedVendor.id }, "New WA quote from vendor saved");
            }

            const [order] = await db.select().from(logisticOrdersTable)
              .where(eq(logisticOrdersTable.id, rfq.orderId));

            // Count how many vendors have quoted so far
            const allQuotes = await db.select().from(logisticOrderQuotesTable)
              .where(eq(logisticOrderQuotesTable.orderId, rfq.orderId));
            const quotedCount = allQuotes.length;
            const rfqVendorCount = (rfq.vendorIds as number[]).length;

            const orderNum = order?.orderNumber ?? String(rfq.orderId);
            const orderUrl = getOrderUrl(rfq.orderId);
            const adminMsg =
              `💰 *PENAWARAN VENDOR DITERIMA (via WA)*\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `No. RFQ     : \`${parsed.rfqNumber}\`\n` +
              `No. Order   : \`${orderNum}\`\n` +
              `Vendor      : *${matchedVendor.name}*\n` +
              `Harga Vendor: *${fmt(parsed.vendorPrice)}*\n` +
              (parsed.estimatedPickup ? `ETA Pickup  : ${parsed.estimatedPickup}\n` : "") +
              (parsed.estimatedDelivery ? `ETA Delivery: ${parsed.estimatedDelivery}\n` : "") +
              (parsed.vendorNotes ? `Catatan     : ${parsed.vendorNotes}\n` : "") +
              `Progress    : ${quotedCount}/${rfqVendorCount} vendor sudah quote\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              (orderUrl ? `🔗 *Buka & Approve:*\n${orderUrl}` : `Login ke sistem untuk approve.`);

            if (adminWa) {
              await sendWhatsApp(adminWa, adminMsg);
              logger.info({ vendorId: matchedVendor.id }, "Forwarded vendor RFQ reply to admin group");
            }

            const confirmMsg =
              `✅ Penawaran Anda untuk \`${parsed.rfqNumber}\` telah kami terima.\n` +
              `Harga: ${fmt(parsed.vendorPrice)}\n\n` +
              `Tim kami akan menghubungi Anda jika penawaran Anda dipilih. Terima kasih 🙏`;
            sendWhatsApp(sender, confirmMsg).catch(() => undefined);
            return;
          }
        }
      }

      // Generic vendor message — forward to admin
      if (adminWa) {
        const forwardMsg =
          `📩 *Balasan dari Vendor*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Vendor  : *${matchedVendor.name}*\n` +
          `No. HP  : ${sender}\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `${message}`;
        await sendWhatsApp(adminWa, forwardMsg);
        logger.info({ vendorId: matchedVendor.id, sender }, "Forwarded generic vendor reply to admin group");
      }
    } else {
      // Unknown sender — forward to admin group
      if (adminWa) {
        const displayName = senderName ?? sender;
        const forwardMsg =
          `💬 *Pesan Masuk (WA)*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Dari    : ${displayName}\n` +
          `No. HP  : ${sender}\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `${message}`;
        await sendWhatsApp(adminWa, forwardMsg);
        logger.info({ sender }, "Forwarded unknown sender message to admin group");
      }
    }
  } catch (err: unknown) {
    logger.error({ err }, "Fonnte webhook processing error");
  }
});

export { doApproveOrder };
export default router;
