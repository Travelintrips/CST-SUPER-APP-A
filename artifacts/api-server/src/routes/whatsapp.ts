import { Router, type Request, type Response } from "express";
import { db, quotationReplyLogsTable, waIncomingMessagesTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
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

async function buildCustomerMessage(data: {
  customerName: string;
  rfqId: string;
  serviceType: string;
  route: string;
  pickupDate: string;
  deliveryDate: string;
  finalPrice: number;
  status: string;
  notes: string;
}): Promise<string> {
  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  const tplBody = await getWaTemplateConfig("customer", "manual_quote", DEFAULT_MANUAL_QUOTE_TPL);
  return renderTemplate(tplBody, {
    customerName: data.customerName || "-",
    rfqId: data.rfqId || "-",
    serviceType: data.serviceType || "-",
    route: data.route || "-",
    pickupDate: data.pickupDate || null,
    deliveryDate: data.deliveryDate || null,
    finalPrice: fmt(data.finalPrice),
    status: data.status || "Ready",
    notes: data.notes || null,
  }, data.serviceType);
}

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

  const messageBody = await buildCustomerMessage({
    customerName: String(customerName),
    rfqId: rfqId ? String(rfqId) : "",
    serviceType: serviceType ? String(serviceType) : "",
    route: route ? String(route) : "",
    pickupDate: pickupDate ? String(pickupDate) : "",
    deliveryDate: deliveryDate ? String(deliveryDate) : "",
    finalPrice: fp,
    status: status ? String(status) : "Ready",
    notes: notes ? String(notes) : "",
  });

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
          const fmtIdr = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
          const adminMsg =
            `📋 *QUOTATION DIKIRIM KE CUSTOMER*\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `Customer   : ${customerName}\n` +
            `No. HP     : ${normalizedPhone}\n` +
            `No. RFQ    : ${rfqId || "-"}\n` +
            `Layanan    : ${serviceType || "-"}\n` +
            `Rute       : ${route || "-"}\n` +
            (vendorName ? `Vendor     : ${vendorName}\n` : "") +
            `Harga Final: ${fmtIdr(fp)}\n` +
            `Status     : ${status || "Ready"}\n` +
            `━━━━━━━━━━━━━━━━━━\n` +
            `_Dikirim via Mini Form BizPortal_`;
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
