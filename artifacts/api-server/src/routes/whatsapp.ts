import { Router, type Request, type Response } from "express";
import { db, quotationReplyLogsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";

export const whatsappRouter = Router();

function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

function calcFinalPrice(vendorPrice: number, markupType: string, markupValue: number): number {
  if (markupType === "percentage") {
    return vendorPrice + (vendorPrice * markupValue / 100);
  }
  return vendorPrice + markupValue;
}

function buildCustomerMessage(data: {
  customerName: string;
  rfqId: string;
  serviceType: string;
  route: string;
  pickupDate: string;
  deliveryDate: string;
  finalPrice: number;
  status: string;
  notes: string;
}): string {
  const fmt = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
  return (
    `Halo ${data.customerName},\n\n` +
    `Berikut quotation layanan CST Logistics:\n\n` +
    `No. RFQ       : ${data.rfqId || "-"}\n` +
    `Layanan       : ${data.serviceType || "-"}\n` +
    `Rute          : ${data.route || "-"}\n` +
    (data.pickupDate ? `Estimasi Pickup   : ${data.pickupDate}\n` : "") +
    (data.deliveryDate ? `Estimasi Delivery : ${data.deliveryDate}\n` : "") +
    `Harga Final   : ${fmt(data.finalPrice)}\n` +
    `Status        : ${data.status}\n` +
    (data.notes ? `\nCatatan:\n${data.notes}\n` : "") +
    `\nSilakan konfirmasi apabila quotation ini disetujui.\n\n` +
    `Terima kasih,\nCST Logistics`
  );
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

  const messageBody = buildCustomerMessage({
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
