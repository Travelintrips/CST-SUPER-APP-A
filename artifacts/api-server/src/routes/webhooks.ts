import { Router, type Request, type Response } from "express";
import { db, suppliersTable, logisticOrderRfqsTable, logisticOrderQuotesTable, logisticOrdersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
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

/**
 * Parse vendor reply for RFQ format.
 * Expected: RFQ-YYMMDD-XXXXX [price] [optional: eta pickup] [optional: eta delivery] [optional: notes...]
 * Examples:
 *   RFQ-260506-12345 5000000
 *   RFQ-260506-12345 5500000 besok lusa harga sudah termasuk handling
 */
function parseVendorReply(message: string): {
  rfqNumber: string; vendorPrice: number;
  estimatedPickup: string | null; estimatedDelivery: string | null; vendorNotes: string | null;
} | null {
  const cleaned = message.trim();
  // Match RFQ number pattern (flexible: #RFQ-... or RFQ-...)
  const rfqMatch = cleaned.match(/(?:#)?(RFQ-\d{6}-\d{5})/i);
  if (!rfqMatch) return null;
  const rfqNumber = rfqMatch[1].toUpperCase();

  // Find price — first number after the RFQ number
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

    const vendors = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
    const matchedVendor = vendors.find((v) => v.phone && normalizePhone(v.phone) === normalizedSender);

    if (matchedVendor) {
      // Try to parse as RFQ reply
      const parsed = parseVendorReply(message);

      if (parsed) {
        // Find the RFQ
        const [rfq] = await db.select().from(logisticOrderRfqsTable)
          .where(eq(logisticOrderRfqsTable.rfqNumber, parsed.rfqNumber));

        if (rfq) {
          // Check if vendor is in the RFQ vendor list
          const isInRfq = (rfq.vendorIds as number[]).includes(matchedVendor.id);
          if (isInRfq) {
            // Check for existing quote from this vendor on this RFQ
            const [existingQuote] = await db.select().from(logisticOrderQuotesTable)
              .where(sql`${logisticOrderQuotesTable.rfqId} = ${rfq.id} AND ${logisticOrderQuotesTable.vendorId} = ${matchedVendor.id}`);

            // Get vendor's default markup from their profile
            const markupPct = Number(matchedVendor.markup ?? 0);
            const sellingPrice = calcSellingPrice(parsed.vendorPrice, "percentage", markupPct, null);
            const now = new Date();

            if (existingQuote) {
              // Update existing quote
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
              // Insert new quote
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

            // Get order info for admin notification
            const [order] = await db.select().from(logisticOrdersTable)
              .where(eq(logisticOrdersTable.id, rfq.orderId));

            const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
            const adminMsg =
              `💰 *PENAWARAN VENDOR DITERIMA (via WA)*\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `No. RFQ     : *${parsed.rfqNumber}*\n` +
              `No. Order   : *${order?.orderNumber ?? rfq.orderId}*\n` +
              `Vendor      : *${matchedVendor.name}*\n` +
              `Harga Vendor: *${fmt(parsed.vendorPrice)}*\n` +
              (parsed.estimatedPickup ? `ETA Pickup  : ${parsed.estimatedPickup}\n` : "") +
              (parsed.estimatedDelivery ? `ETA Delivery: ${parsed.estimatedDelivery}\n` : "") +
              (parsed.vendorNotes ? `Catatan     : ${parsed.vendorNotes}\n` : "") +
              `━━━━━━━━━━━━━━━━━━\n` +
              `Login ke sistem untuk melihat perbandingan dan memberi approval.`;

            if (adminWa) {
              await sendWhatsApp(adminWa, adminMsg);
              logger.info({ vendorId: matchedVendor.id }, "Forwarded vendor RFQ reply to admin group");
            }

            // Auto-reply to vendor confirming receipt
            const confirmMsg =
              `✅ Penawaran Anda untuk *${parsed.rfqNumber}* telah kami terima.\n` +
              `Harga: ${fmt(parsed.vendorPrice)}\n\n` +
              `Tim kami akan menghubungi Anda jika penawaran Anda dipilih. Terima kasih 🙏`;
            sendWhatsApp(sender, confirmMsg).catch(() => undefined);
            return;
          }
        }
      }

      // Generic vendor message (not an RFQ reply or RFQ not found) — forward to admin
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

export default router;
