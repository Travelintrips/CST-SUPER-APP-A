import { Router, type Request, type Response } from "express";
import { db, suppliersTable, logisticOrderRfqsTable, logisticOrderQuotesTable, logisticOrdersTable } from "@workspace/db";
import { eq, sql, and, desc } from "drizzle-orm";
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

function getAdminPhones(): string[] {
  const raw = process.env.ADMIN_WA_PHONES ?? "";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map(normalizePhone);
}

function getOrderUrl(orderId: number): string {
  const domain = (process.env.REPLIT_DOMAINS ?? "").split(",")[0].trim();
  if (!domain) return "";
  return `https://${domain}/bizportal/logistics/portal-orders/${orderId}`;
}

function parsePrice(raw: string): number {
  const s = raw.replace(/[\[\]]/g, "").trim();
  const dotParts = s.split(".");
  const commaParts = s.split(",");
  let normalized = s;
  if (dotParts.length > 2) {
    normalized = s.replace(/\./g, "");
  } else if (commaParts.length > 2) {
    normalized = s.replace(/,/g, "");
  } else if (dotParts.length === 2 && dotParts[1].length === 3) {
    normalized = s.replace(".", "");
  } else if (commaParts.length === 2 && commaParts[1].length === 3) {
    normalized = s.replace(",", "");
  } else {
    normalized = s.replace(",", ".");
  }
  return parseFloat(normalized);
}

function parseVendorReply(message: string): {
  rfqNumber: string | null; orderNumber: string | null; vendorPrice: number;
  estimatedPickup: string | null; estimatedDelivery: string | null; vendorNotes: string | null;
} | null {
  const cleaned = message.trim().replace(/\[|\]/g, " ").replace(/\s+/g, " ").trim();

  // Try to match RFQ number first (RFQ-YYMMDD-XXXXX)
  const rfqMatch = cleaned.match(/(?:#)?(RFQ-\d{6}-\d{5})/i);
  const rfqNumber = rfqMatch ? rfqMatch[1].toUpperCase() : null;

  // Try to match order number (LOG-YYMMDD-XXXXX) if no RFQ number
  const orderMatch = !rfqNumber ? cleaned.match(/(?:#)?(LOG-\d{6}-\d+)/i) : null;
  const orderNumber = orderMatch ? orderMatch[1].toUpperCase() : null;

  const prefix = rfqNumber ?? orderNumber;
  const afterPrefix = prefix
    ? cleaned.slice(cleaned.toUpperCase().indexOf(prefix) + prefix.length).trim()
    : cleaned;

  const priceMatch = afterPrefix.match(/^[\s,]*(\d[\d.,]*)/);
  if (!priceMatch) return null;

  const vendorPrice = parsePrice(priceMatch[1]);
  if (isNaN(vendorPrice) || vendorPrice <= 0) return null;

  const rest = afterPrefix.slice(priceMatch[0].length).trim();
  const parts = rest ? rest.split(/\s+/) : [];

  const estimatedPickup = parts.length > 0 ? parts[0] : null;
  const estimatedDelivery = parts.length > 1 ? parts[1] : null;
  const vendorNotes = parts.length > 2 ? parts.slice(2).join(" ") : null;

  return { rfqNumber, orderNumber, vendorPrice, estimatedPickup, estimatedDelivery, vendorNotes };
}

/**
 * Parse admin approve command.
 * Formats:
 *   APPROVE LOG-xxx                    ← list vendors who quoted (no action)
 *   APPROVE LOG-xxx 5500000            ← auto-pick best vendor, price override
 *   APPROVE LOG-xxx 2                  ← pick vendor #2, auto-calculate price
 *   APPROVE LOG-xxx 2 5500000          ← pick vendor #2, price override
 */
function parseAdminApprove(message: string): {
  orderNumber: string; quotePosition: number | null; sellingPrice: number | null;
} | null {
  const cleaned = message.trim();
  const match = cleaned.match(/^APPROVE\s+(LOG-\d{6}-\d+)(?:\s+([\d.,]+))?(?:\s+([\d.,]+))?/i);
  if (!match) return null;
  const orderNumber = match[1].toUpperCase();

  const arg1 = match[2] ? parsePrice(match[2]) : null;
  const arg2 = match[3] ? parsePrice(match[3]) : null;

  let quotePosition: number | null = null;
  let sellingPrice: number | null = null;

  if (arg1 !== null && !isNaN(arg1)) {
    if (Number.isInteger(arg1) && arg1 >= 1 && arg1 <= 50 && arg2 !== null) {
      // arg1 is a vendor position (1–50), arg2 is the price
      quotePosition = arg1;
      sellingPrice = !isNaN(arg2) && arg2 > 0 ? arg2 : null;
    } else if (Number.isInteger(arg1) && arg1 >= 1 && arg1 <= 50 && arg2 === null) {
      // arg1 is a vendor position, no price override
      quotePosition = arg1;
      sellingPrice = null;
    } else {
      // arg1 is the price directly
      sellingPrice = arg1 > 0 ? arg1 : null;
    }
  }

  return { orderNumber, quotePosition, sellingPrice };
}

/** Parse QUOTES command: QUOTES LOG-xxx */
function parseQuotesList(message: string): string | null {
  const match = message.trim().match(/^QUOTES\s+(LOG-\d{6}-\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

/** Build a numbered vendor quote list string for admin messages */
function buildVendorQuoteList(
  quotes: { vendorName: string; vendorPrice: number; estimatedPickup?: string | null; estimatedDelivery?: string | null; quoteStatus: string }[],
  orderNumber: string,
): string {
  if (quotes.length === 0) return `_Belum ada vendor yang membalas._`;
  return quotes
    .map((q, i) => {
      const n = i + 1;
      const eta = [q.estimatedPickup, q.estimatedDelivery].filter(Boolean).join(" / ");
      return (
        `*${n}.* ${q.vendorName}\n` +
        `    Harga: ${fmt(q.vendorPrice)}${eta ? `  ETA: ${eta}` : ""}\n` +
        `    → \`APPROVE ${orderNumber} ${n} [harga_jual]\``
      );
    })
    .join("\n\n");
}

/**
 * Shared approve logic: find quote (by position or best), approve it, send WA to customer.
 */
async function doApproveOrder(
  orderId: number,
  overrideSellingPrice: number | null,
  quotePosition?: number | null,
): Promise<{
  orderNumber: string; vendorName: string; sellingPrice: number; customerPhone: string | null;
} | { error: string }> {
  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return { error: "Order tidak ditemukan" };
  if (order.adminApprovalStatus === "approved") return { error: "Order sudah pernah di-approve" };

  // Only use pending quotes from vendors who have actually replied
  const quotes = await db.select().from(logisticOrderQuotesTable)
    .where(and(eq(logisticOrderQuotesTable.orderId, orderId), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
    .orderBy(logisticOrderQuotesTable.createdAt);
  if (quotes.length === 0) return { error: "Tidak ada quote dari vendor untuk order ini" };

  let best = quotes[0];
  if (quotePosition != null && quotePosition >= 1 && quotePosition <= quotes.length) {
    best = quotes[quotePosition - 1];
  } else if (!quotePosition) {
    // Auto-pick: lowest vendor price
    best = quotes.reduce((a, b) => Number(a.vendorPrice) <= Number(b.vendorPrice) ? a : b);
  }

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

  logger.info({ orderId, quoteId: best.id, sellingPrice, vendorId: best.vendorId, quotePosition }, "Quote approved via WA command");

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
    const member = typeof body.member === "string" ? body.member : null;

    if (!sender || !message) {
      logger.warn({ body }, "Fonnte webhook: missing sender or message");
      return;
    }

    const isGroup = sender.includes("@g.us") || sender.includes("@lid");
    const actualSender = (isGroup && member) ? member : sender;
    const normalizedSender = normalizePhone(actualSender);
    const adminWa = await getAdminWa();

    // ─── 1. Admin commands ───────────────────────────────────────────────────
    const adminPhones = getAdminPhones();
    const isAdmin = adminPhones.length > 0 && adminPhones.includes(normalizedSender);

    if (isAdmin) {
      // QUOTES command: list all pending quotes for an order
      const quotesCmd = parseQuotesList(message);
      if (quotesCmd) {
        const [order] = await db.select().from(logisticOrdersTable)
          .where(sql`${logisticOrdersTable.orderNumber} = ${quotesCmd}`);
        if (!order) {
          sendWhatsApp(sender, `❌ Order *${quotesCmd}* tidak ditemukan.`).catch(() => undefined);
          return;
        }
        const quotes = await db.select().from(logisticOrderQuotesTable)
          .where(and(eq(logisticOrderQuotesTable.orderId, order.id), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
          .orderBy(logisticOrderQuotesTable.createdAt);
        const vendors = await db.select().from(suppliersTable);
        const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
        const quotesWithNames = quotes.map((q) => ({
          vendorName: vendorMap[q.vendorId] ?? `Vendor #${q.vendorId}`,
          vendorPrice: Number(q.vendorPrice),
          estimatedPickup: q.estimatedPickup,
          estimatedDelivery: q.estimatedDelivery,
          quoteStatus: q.quoteStatus,
        }));

        const listMsg =
          `📋 *DAFTAR PENAWARAN — ${order.orderNumber}*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Jenis  : ${order.shipmentType}\n` +
          `Rute   : ${order.origin} → ${order.destination}\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          buildVendorQuoteList(quotesWithNames, order.orderNumber) + `\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Pilih vendor terbaik atau auto-pick:\n` +
          `\`APPROVE ${order.orderNumber}\` ← auto (harga terendah)\n` +
          `\`APPROVE ${order.orderNumber} [N]\` ← pilih vendor ke-N\n` +
          `\`APPROVE ${order.orderNumber} [N] [harga]\` ← pilih vendor + atur harga jual`;
        sendWhatsApp(sender, listMsg).catch(() => undefined);
        return;
      }

      // APPROVE command
      const adminCmd = parseAdminApprove(message);
      if (adminCmd) {
        const [order] = await db.select().from(logisticOrdersTable)
          .where(sql`${logisticOrdersTable.orderNumber} = ${adminCmd.orderNumber}`);

        if (!order) {
          sendWhatsApp(sender, `❌ Order *${adminCmd.orderNumber}* tidak ditemukan.`).catch(() => undefined);
          return;
        }

        // APPROVE without position or price → show vendor list first
        if (adminCmd.quotePosition === null && adminCmd.sellingPrice === null) {
          const quotes = await db.select().from(logisticOrderQuotesTable)
            .where(and(eq(logisticOrderQuotesTable.orderId, order.id), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
            .orderBy(logisticOrderQuotesTable.createdAt);
          if (quotes.length === 0) {
            sendWhatsApp(sender, `⚠️ Belum ada vendor yang membalas untuk order *${adminCmd.orderNumber}*.`).catch(() => undefined);
            return;
          }
          const vendors = await db.select().from(suppliersTable);
          const vendorMap = Object.fromEntries(vendors.map((v) => [v.id, v.name]));
          const quotesWithNames = quotes.map((q) => ({
            vendorName: vendorMap[q.vendorId] ?? `Vendor #${q.vendorId}`,
            vendorPrice: Number(q.vendorPrice),
            estimatedPickup: q.estimatedPickup,
            estimatedDelivery: q.estimatedDelivery,
            quoteStatus: q.quoteStatus,
          }));
          const listMsg =
            `📋 *Pilih vendor untuk ${adminCmd.orderNumber}:*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            buildVendorQuoteList(quotesWithNames, adminCmd.orderNumber) + `\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `\`APPROVE ${adminCmd.orderNumber}\` ← auto-pick harga terendah`;
          sendWhatsApp(sender, listMsg).catch(() => undefined);
          return;
        }

        const result = await doApproveOrder(order.id, adminCmd.sellingPrice, adminCmd.quotePosition);

        if ("error" in result) {
          sendWhatsApp(sender, `❌ Gagal approve *${adminCmd.orderNumber}*:\n${result.error}`).catch(() => undefined);
          return;
        }

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

        if (adminWa && adminWa !== sender) {
          sendWhatsApp(adminWa,
            `✅ Order \`${result.orderNumber}\` di-approve via WA oleh ${senderName ?? sender}.\n` +
            `Vendor: ${result.vendorName}  Harga: ${fmt(result.sellingPrice)}`
          ).catch(() => undefined);
        }
        return;
      }

      // Partial 'approve' keyword → show help
      if (/approve/i.test(message)) {
        sendWhatsApp(sender,
          `ℹ️ *Perintah APPROVE:*\n\n` +
          `\`APPROVE LOG-xxx\`\n_→ tampilkan daftar vendor yang sudah quote_\n\n` +
          `\`APPROVE LOG-xxx 5500000\`\n_→ auto-pick vendor terbaik, harga jual 5.5jt_\n\n` +
          `\`APPROVE LOG-xxx 2\`\n_→ pilih vendor ke-2, harga otomatis_\n\n` +
          `\`APPROVE LOG-xxx 2 5500000\`\n_→ pilih vendor ke-2, harga jual 5.5jt_\n\n` +
          `\`QUOTES LOG-xxx\`\n_→ tampilkan semua penawaran untuk order_`
        ).catch(() => undefined);
        return;
      }
      // Fall through for other admin messages
    }

    // ─── 2. Vendor reply ──────────────────────────────────────────────────────
    const vendors = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
    const matchedVendor = vendors.find((v) => v.phone && normalizePhone(v.phone) === normalizedSender);

    if (matchedVendor) {
      const parsed = parseVendorReply(message);

      if (parsed) {
        // Resolve which RFQ to use:
        // 1. If vendor included RFQ number → find it directly
        // 2. If vendor included order number → find the open RFQ for that order
        // 3. If neither → smart fallback: most recent open RFQ for this vendor
        let rfq: typeof logisticOrderRfqsTable.$inferSelect | undefined;
        let usedFallback = false;

        if (parsed.rfqNumber) {
          const [found] = await db.select().from(logisticOrderRfqsTable)
            .where(eq(logisticOrderRfqsTable.rfqNumber, parsed.rfqNumber));
          rfq = found;
        } else if (parsed.orderNumber) {
          const [order] = await db.select().from(logisticOrdersTable)
            .where(sql`${logisticOrdersTable.orderNumber} = ${parsed.orderNumber}`);
          if (order) {
            const openRfqs = await db.select().from(logisticOrderRfqsTable)
              .where(and(eq(logisticOrderRfqsTable.orderId, order.id), eq(logisticOrderRfqsTable.status, "open")))
              .orderBy(desc(logisticOrderRfqsTable.createdAt));
            rfq = openRfqs.find((r) => (r.vendorIds as number[]).includes(matchedVendor.id));
          }
        } else {
          // Smart fallback: most recent open RFQ including this vendor
          const openRfqs = await db.select().from(logisticOrderRfqsTable)
            .where(eq(logisticOrderRfqsTable.status, "open"))
            .orderBy(desc(logisticOrderRfqsTable.createdAt));
          rfq = openRfqs.find((r) => (r.vendorIds as number[]).includes(matchedVendor.id));
          if (rfq) usedFallback = true;
        }

        if (rfq) {
          const isInRfq = (rfq.vendorIds as number[]).includes(matchedVendor.id);
          if (isInRfq) {
            const [existingQuote] = await db.select().from(logisticOrderQuotesTable)
              .where(sql`${logisticOrderQuotesTable.rfqId} = ${rfq.id} AND ${logisticOrderQuotesTable.vendorId} = ${matchedVendor.id}`);

            const markupPct = Number(matchedVendor.markup ?? 0);
            const sellingPrice = calcSellingPrice(parsed.vendorPrice, "percentage", markupPct, null);
            const now = new Date();
            const resolvedRfqNumber = rfq.rfqNumber;

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
              logger.info({ rfqNumber: resolvedRfqNumber, vendorId: matchedVendor.id, usedFallback }, "Updated WA quote from vendor");
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
              logger.info({ rfqNumber: resolvedRfqNumber, vendorId: matchedVendor.id, usedFallback }, "New WA quote from vendor saved");
            }

            const [order] = await db.select().from(logisticOrdersTable)
              .where(eq(logisticOrdersTable.id, rfq.orderId));

            // Fetch ALL current quotes to build the vendor list for admin
            const allQuotes = await db.select().from(logisticOrderQuotesTable)
              .where(and(eq(logisticOrderQuotesTable.orderId, rfq.orderId), eq(logisticOrderQuotesTable.quoteStatus, "pending")))
              .orderBy(logisticOrderQuotesTable.createdAt);
            const allVendors = await db.select().from(suppliersTable);
            const vendorMap = Object.fromEntries(allVendors.map((v) => [v.id, v.name]));
            const quotesWithNames = allQuotes.map((q) => ({
              vendorName: vendorMap[q.vendorId] ?? `Vendor #${q.vendorId}`,
              vendorPrice: Number(q.vendorPrice),
              estimatedPickup: q.estimatedPickup,
              estimatedDelivery: q.estimatedDelivery,
              quoteStatus: q.quoteStatus,
            }));

            const rfqVendorCount = (rfq.vendorIds as number[]).length;
            const orderNum = order?.orderNumber ?? String(rfq.orderId);
            const orderUrl = getOrderUrl(rfq.orderId);

            const adminMsg =
              `💰 *PENAWARAN VENDOR DITERIMA*\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              (usedFallback ? `⚠️ _No. RFQ/Order tidak disertakan — pakai fallback otomatis_\n` : "") +
              `No. RFQ     : \`${resolvedRfqNumber}\`\n` +
              `No. Order   : \`${orderNum}\`\n` +
              `Vendor      : *${matchedVendor.name}*\n` +
              `Harga Vendor: *${fmt(parsed.vendorPrice)}*\n` +
              (parsed.estimatedPickup ? `ETA Pickup  : ${parsed.estimatedPickup}\n` : "") +
              (parsed.estimatedDelivery ? `ETA Delivery: ${parsed.estimatedDelivery}\n` : "") +
              (parsed.vendorNotes ? `Catatan     : ${parsed.vendorNotes}\n` : "") +
              `Progress    : ${allQuotes.length}/${rfqVendorCount} vendor sudah quote\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              `📋 *Semua penawaran masuk:*\n` +
              buildVendorQuoteList(quotesWithNames, orderNum) + `\n` +
              `━━━━━━━━━━━━━━━━━━\n` +
              (orderUrl ? `🔗 *Buka di BizPortal:*\n${orderUrl}` : `Login ke sistem untuk approve.`);

            if (adminWa) {
              await sendWhatsApp(adminWa, adminMsg);
              logger.info({ vendorId: matchedVendor.id, usedFallback }, "Forwarded vendor RFQ reply to admin group");
            }

            const confirmMsg =
              `✅ Penawaran Anda untuk *${resolvedRfqNumber}* telah kami terima.\n` +
              `Harga: ${fmt(parsed.vendorPrice)}\n\n` +
              `Tim kami akan menghubungi Anda jika penawaran Anda dipilih. Terima kasih 🙏`;
            sendWhatsApp(sender, confirmMsg).catch(() => undefined);
            return;
          }
        }

        // Has price but no matching RFQ
        if (adminWa) {
          const forwardMsg =
            `📩 *Balasan Vendor (Harga Terdeteksi, RFQ Tidak Cocok)*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Vendor      : *${matchedVendor.name}*\n` +
            `No. HP      : ${sender}\n` +
            `Harga Det.  : ${fmt(parsed.vendorPrice)}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Pesan asli:\n${message}\n\n` +
            `_Input harga manual di BizPortal._`;
          await sendWhatsApp(adminWa, forwardMsg);
          logger.info({ vendorId: matchedVendor.id, sender }, "Vendor reply with price but no matching open RFQ — forwarded to admin");
        }
        return;
      }

      // Generic vendor message (no price detected) — forward to admin
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
