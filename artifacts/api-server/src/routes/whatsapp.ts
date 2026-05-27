import { Router, type Request, type Response } from "express";
import { db, quotationReplyLogsTable, waIncomingMessagesTable } from "@workspace/db";
import { notificationLogsTable } from "@workspace/db/schema";
import { desc, eq, and, gte, lte, sql } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";
import { normalizePhone } from "../lib/phoneUtils.js";
import { getWaTemplateConfig, renderTemplate } from "../lib/orderNotification.js";

export const whatsappRouter = Router();

const DEFAULT_MANUAL_QUOTE_TPL =
  `Halo {{customerName}},\n\n` +
  `Berikut quotation layanan CST Logistics:\n\n` +
  `No. RFQ       : {{rfqId}}\n` +
  `Layanan       : {{serviceType}}\n` +
  `Rute          : {{route}}\n` +
  `Estimasi Pickup   : {{pickupDate}}\n` +
  `Estimasi Delivery : {{deliveryDate}}\n` +
  `Harga Final   : {{finalPrice}}\n` +
  `Status        : {{status}}\n` +
  `\nCatatan:\n{{notes}}\n` +
  `\nSilakan konfirmasi apabila quotation ini disetujui.\n\n` +
  `Terima kasih,\nCST Logistics`;

function calcFinalPrice(vendorPrice: number, markupType: string, markupValue: number): number {
  if (markupType === "percentage") {
    return vendorPrice + (vendorPrice * markupValue / 100);
  }
  return vendorPrice + markupValue;
}

const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

const DEFAULT_QUOTATION_CUSTOMER_TPL = [
  "Halo {{customerName}},",
  "",
  "Berikut quotation layanan CST Logistics:",
  "",
  "No. RFQ       : {{rfqId}}",
  "Layanan       : {{serviceType}}",
  "Rute          : {{route}}",
  "Estimasi Pickup   : {{pickupDate}}",
  "Estimasi Delivery : {{deliveryDate}}",
  "Harga Final   : {{finalPrice}}",
  "Status        : {{status}}",
  "Catatan       : {{notes}}",
  "",
  "Silakan konfirmasi apabila quotation ini disetujui.",
  "",
  "Terima kasih,",
  "CST Logistics",
].join("\n");

const DEFAULT_QUOTATION_ADMIN_TPL = [
  "📋 *QUOTATION DIKIRIM KE CUSTOMER*",
  "━━━━━━━━━━━━━━━━━━",
  "Customer   : {{customerName}}",
  "No. HP     : {{customerPhone}}",
  "No. RFQ    : {{rfqId}}",
  "Layanan    : {{serviceType}}",
  "Rute       : {{route}}",
  "Vendor     : {{vendorName}}",
  "Harga Final: {{finalPrice}}",
  "Status     : {{status}}",
  "━━━━━━━━━━━━━━━━━━",
  "_Dikirim via Mini Form BizPortal_",
].join("\n");

// POST /api/whatsapp/send-quotation
whatsappRouter.post("/send-quotation", async (req: Request, res: Response) => {
  const {
    rfqId, orderId, customerName, customerPhone, vendorName, vendorPhone,
    serviceType, route, vendorPrice, markupType, markupValue, finalPrice,
    pickupDate, deliveryDate, notes, status, sendToAdminGroup, isDraft,
  } = req.body as Record<string, unknown>;

  if (!customerName || !customerPhone) {
    return res.status(400).json({ message: "customerName dan customerPhone wajib diisi" });
  }

  const fp = finalPrice != null ? Number(finalPrice) : (
    vendorPrice != null
      ? calcFinalPrice(Number(vendorPrice), String(markupType ?? "percentage"), Number(markupValue ?? 0))
      : 0
  );
  if (isNaN(fp) || fp < 0) {
    return res.status(400).json({ message: "finalPrice tidak valid" });
  }

  const vars: Record<string, string | null> = {
    customerName: String(customerName),
    rfqId: rfqId ? String(rfqId) : "-",
    serviceType: serviceType ? String(serviceType) : "-",
    route: route ? String(route) : "-",
    pickupDate: pickupDate ? String(pickupDate) : "-",
    deliveryDate: deliveryDate ? String(deliveryDate) : "-",
    finalPrice: fmt(fp),
    status: status ? String(status) : "Ready",
    notes: notes ? String(notes) : "-",
    customerPhone: normalizePhone(String(customerPhone)),
    vendorName: vendorName ? String(vendorName) : "-",
  };

  const [customerTplBody, adminTplBody] = await Promise.all([
    getWaTemplateConfig("customer", "quotation_send", DEFAULT_QUOTATION_CUSTOMER_TPL),
    getWaTemplateConfig("admin_group", "quotation_send", DEFAULT_QUOTATION_ADMIN_TPL),
  ]);

  const messageBody = renderTemplate(customerTplBody, vars);

  const normalizedPhone = normalizePhone(String(customerPhone));
  let fonnteResponse: unknown = null;
  let sentStatus = "draft";
  let sentAt: Date | null = null;
  let sentToAdmin = false;

  if (!isDraft) {
    try {
      const fRes = await fetch("https://api.fonnte.com/send", {
        method: "POST",
        headers: {
          Authorization: process.env.FONNTE_TOKEN ?? "",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ target: normalizedPhone, message: messageBody }).toString(),
      });
      fonnteResponse = await fRes.json();
      sentStatus = fRes.ok ? "sent" : "failed";
      sentAt = new Date();
      logger.info({ phone: normalizedPhone, status: sentStatus }, "Quotation WA sent to customer");
    } catch (err) {
      logger.error({ err, phone: normalizedPhone }, "Failed to send quotation WA");
      sentStatus = "failed";
    }

    if (sendToAdminGroup) {
      try {
        const adminWa = await getAdminWa();
        if (adminWa) {
          const adminMsg = renderTemplate(adminTplBody, vars);
          await sendWhatsApp(adminWa, adminMsg);
          sentToAdmin = true;
        }
      } catch (err) {
        logger.error({ err }, "Failed to send quotation notif to admin group");
      }
    }
  }

  const [log] = await db.insert(quotationReplyLogsTable).values({
    rfqId: rfqId ? String(rfqId) : null,
    orderId: orderId ? Number(orderId) : null,
    customerName: String(customerName),
    customerPhone: normalizedPhone,
    vendorName: vendorName ? String(vendorName) : null,
    vendorPhone: vendorPhone ? String(vendorPhone) : null,
    serviceType: serviceType ? String(serviceType) : null,
    route: route ? String(route) : null,
    vendorPrice: vendorPrice != null ? String(Number(vendorPrice)) : null,
    markupType: String(markupType ?? "percentage"),
    markupValue: String(Number(markupValue ?? 0)),
    finalPrice: String(fp),
    pickupDate: pickupDate ? String(pickupDate) : null,
    deliveryDate: deliveryDate ? String(deliveryDate) : null,
    notes: notes ? String(notes) : null,
    status: String(status ?? "Ready"),
    messageBody,
    fonnteResponse: fonnteResponse ?? null,
    sentStatus,
    sentToAdmin,
    sentAt: sentAt ?? undefined,
  }).returning();

  return res.status(201).json({
    id: log.id,
    sentStatus,
    sentToAdmin,
    messageBody,
    sentAt: sentAt?.toISOString() ?? null,
  });
});

// GET /api/whatsapp/quotation-logs
whatsappRouter.get("/quotation-logs", async (_req: Request, res: Response) => {
  const logs = await db
    .select()
    .from(quotationReplyLogsTable)
    .orderBy(desc(quotationReplyLogsTable.createdAt))
    .limit(100);

  return res.json(
    logs.map((l) => ({
      id: l.id,
      rfqId: l.rfqId,
      orderId: l.orderId,
      customerName: l.customerName,
      customerPhone: l.customerPhone,
      vendorName: l.vendorName,
      serviceType: l.serviceType,
      route: l.route,
      vendorPrice: l.vendorPrice ? Number(l.vendorPrice) : null,
      finalPrice: l.finalPrice ? Number(l.finalPrice) : null,
      status: l.status,
      sentStatus: l.sentStatus,
      sentToAdmin: l.sentToAdmin,
      sentAt: l.sentAt?.toISOString() ?? null,
      createdAt: l.createdAt.toISOString(),
    })),
  );
});

// POST /api/whatsapp/webhook  — dipanggil oleh Fonnte saat ada pesan masuk
// Fonnte mengirim form-urlencoded atau JSON dengan field: sender, message, name, device, type
whatsappRouter.post("/webhook", async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const sender = String(body.sender ?? body.from ?? "");
    const message = String(body.message ?? body.text ?? body.body ?? "");
    const senderName = body.name ? String(body.name) : null;
    const deviceId = body.device ? String(body.device) : null;
    const messageType = body.type ? String(body.type) : "text";

    if (!sender || !message) {
      return res.status(200).json({ ok: true, skipped: true });
    }

    await db.insert(waIncomingMessagesTable).values({
      sender: normalizePhone(sender),
      senderName,
      message,
      deviceId,
      messageType,
      rawPayload: body,
    });

    logger.info({ sender, senderName }, "WA incoming message saved from webhook");
    return res.status(200).json({ ok: true });
  } catch (err) {
    logger.error({ err }, "Error saving WA webhook message");
    return res.status(200).json({ ok: true });
  }
});

// GET /api/whatsapp/inbox — daftar pesan masuk dari vendor/customer
whatsappRouter.get("/inbox", async (req: Request, res: Response) => {
  const unreadOnly = req.query.unread === "true";
  let query = db
    .select()
    .from(waIncomingMessagesTable)
    .orderBy(desc(waIncomingMessagesTable.receivedAt))
    .limit(100);

  if (unreadOnly) {
    const rows = await db
      .select()
      .from(waIncomingMessagesTable)
      .where(eq(waIncomingMessagesTable.isRead, false))
      .orderBy(desc(waIncomingMessagesTable.receivedAt))
      .limit(100);
    return res.json(rows.map(mapIncoming));
  }

  const rows = await query;
  return res.json(rows.map(mapIncoming));
});

function mapIncoming(r: typeof waIncomingMessagesTable.$inferSelect) {
  return {
    id: r.id,
    sender: r.sender,
    senderName: r.senderName,
    message: r.message,
    messageType: r.messageType,
    isRead: r.isRead,
    repliedAt: r.repliedAt?.toISOString() ?? null,
    replyMessage: r.replyMessage,
    receivedAt: r.receivedAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
  };
}

// PATCH /api/whatsapp/inbox/:id/read — tandai sudah dibaca
whatsappRouter.patch("/inbox/:id/read", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  await db
    .update(waIncomingMessagesTable)
    .set({ isRead: true })
    .where(eq(waIncomingMessagesTable.id, id));

  return res.json({ ok: true });
});

// POST /api/whatsapp/inbox/:id/reply — balas pesan masuk
whatsappRouter.post("/inbox/:id/reply", async (req: Request, res: Response) => {
  const id = parseInt(req.params["id"] as string);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const { message } = req.body as { message?: string };
  if (!message?.trim()) return res.status(400).json({ message: "Pesan balasan wajib diisi" });

  const [row] = await db
    .select()
    .from(waIncomingMessagesTable)
    .where(eq(waIncomingMessagesTable.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ message: "Pesan tidak ditemukan" });

  let sentStatus = "failed";
  try {
    const fRes = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: {
        Authorization: process.env.FONNTE_TOKEN ?? "",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: row.sender, message: message.trim() }).toString(),
    });
    if (fRes.ok) sentStatus = "sent";
    logger.info({ sender: row.sender, sentStatus }, "WA inbox reply sent");
  } catch (err) {
    logger.error({ err }, "Failed to send WA inbox reply");
  }

  await db
    .update(waIncomingMessagesTable)
    .set({ isRead: true, repliedAt: new Date(), replyMessage: message.trim() })
    .where(eq(waIncomingMessagesTable.id, id));

  return res.json({ ok: true, sentStatus });
});

// GET /api/whatsapp/notification-logs — admin: lihat riwayat WA + email + dedup status
// Query params: channel (wa|email), status (sent|failed|deduped), context, refId,
//               from (ISO date), to (ISO date), limit (max 200), offset
whatsappRouter.get("/notification-logs", async (req: Request, res: Response) => {
  const channel  = String(req.query.channel ?? "").trim() || null;
  const status   = String(req.query.status  ?? "").trim() || null;
  const context  = String(req.query.context ?? "").trim() || null;
  const refId    = String(req.query.refId   ?? "").trim() || null;
  const from     = req.query.from ? new Date(String(req.query.from)) : null;
  const to       = req.query.to   ? new Date(String(req.query.to))   : null;
  const limit    = Math.min(parseInt(String(req.query.limit  ?? "50"),  10), 200);
  const offset   = Math.max(parseInt(String(req.query.offset ?? "0"),   10), 0);

  const conditions: ReturnType<typeof eq>[] = [];
  if (channel && (channel === "wa" || channel === "email"))
    conditions.push(eq(notificationLogsTable.channel, channel));
  if (status)
    conditions.push(eq(notificationLogsTable.status, status));
  if (context)
    conditions.push(eq(notificationLogsTable.context, context));
  if (refId)
    conditions.push(eq(notificationLogsTable.refId, refId));
  if (from && !isNaN(from.getTime()))
    conditions.push(gte(notificationLogsTable.createdAt, from));
  if (to && !isNaN(to.getTime()))
    conditions.push(lte(notificationLogsTable.createdAt, to));

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id:        notificationLogsTable.id,
        channel:   notificationLogsTable.channel,
        recipient: notificationLogsTable.recipient,
        subject:   notificationLogsTable.subject,
        status:    notificationLogsTable.status,
        context:   notificationLogsTable.context,
        refType:   notificationLogsTable.refType,
        refId:     notificationLogsTable.refId,
        errorMsg:  notificationLogsTable.errorMsg,
        createdAt: notificationLogsTable.createdAt,
        // message omitted — can be large; use /notification-logs/:id for full body
      })
      .from(notificationLogsTable)
      .where(conditions.length ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])) : undefined)
      .orderBy(desc(notificationLogsTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ total: sql<number>`COUNT(*)::int` })
      .from(notificationLogsTable)
      .where(conditions.length ? and(...(conditions as [ReturnType<typeof eq>, ...ReturnType<typeof eq>[]])) : undefined),
  ]);

  return res.json({ total, limit, offset, rows });
});

// GET /api/whatsapp/notification-logs/:id — admin: full message body for one log entry
whatsappRouter.get("/notification-logs/:id", async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id ?? ""), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const [row] = await db
    .select()
    .from(notificationLogsTable)
    .where(eq(notificationLogsTable.id, id))
    .limit(1);

  if (!row) return res.status(404).json({ message: "Log tidak ditemukan" });
  return res.json(row);
});
