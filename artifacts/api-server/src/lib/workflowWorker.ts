/**
 * Workflow Worker — Phase 1 L1 Reminders
 *
 * Polls every 5 minutes and executes time-based automation:
 *
 *  TASK 1 — Vendor RFQ no-response (T+24h):  WA digest to admin group
 *  TASK 2 — Vendor RFQ no-response (T+48h):  Escalate + create intelligence_alert (critical)
 *  TASK 3 — Customer quote reminder (T+3d):   WA reminder to customer
 *  TASK 4 — Customer quote expire  (T+7d or validUntil past): mark expired + alert admin
 *  TASK 5 — Late order (ETA breach): create intelligence_alert (critical)
 */

import {
  db,
  logisticOrderRfqsTable,
  logisticOrderQuotesTable,
  logisticOrdersTable,
  customerQuoteLinksTable,
  intelligenceAlertsTable,
} from "@workspace/db";
import { and, eq, lt, lte, notInArray, inArray, ne, isNull } from "drizzle-orm";
import { sendWhatsApp } from "./fonnte.js";
import { getAdminGroupWa } from "./adminWa.js";
import { wasRecentlyNotified } from "./notificationLog.js";
import { logger } from "./logger.js";

const POLL_INTERVAL_MS = 5 * 60 * 1000;  // 5 minutes
const INITIAL_DELAY_MS = 3 * 60 * 1000;  // 3 min after boot

const DEDUP_23H = 23 * 60 * 60 * 1000;

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waAlreadySent(context: string, refId: string): Promise<boolean> {
  return wasRecentlyNotified(context, refId, DEDUP_23H);
}

async function createAlert(data: {
  companyId?: number | null;
  alertType: string;
  entityType: string;
  entityId?: number | null;
  entityRef?: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  contextJson?: Record<string, unknown>;
}): Promise<void> {
  // Prevent duplicate open alerts for same type+entity
  const existing = await db
    .select({ id: intelligenceAlertsTable.id })
    .from(intelligenceAlertsTable)
    .where(
      and(
        eq(intelligenceAlertsTable.alertType, data.alertType),
        eq(intelligenceAlertsTable.entityType, data.entityType),
        data.entityId != null
          ? eq(intelligenceAlertsTable.entityId, data.entityId)
          : isNull(intelligenceAlertsTable.entityId),
        eq(intelligenceAlertsTable.status, "open"),
      )
    )
    .limit(1);

  if (existing.length > 0) return;

  await db.insert(intelligenceAlertsTable).values({
    companyId: data.companyId ?? null,
    alertType: data.alertType,
    entityType: data.entityType,
    entityId: data.entityId ?? null,
    entityRef: data.entityRef,
    severity: data.severity,
    title: data.title,
    message: data.message,
    contextJson: data.contextJson ?? {},
  });
}

// ── TASK 1 & 2: Vendor RFQ no-response ───────────────────────────────────────

async function checkVendorRfqNoResponse(): Promise<void> {
  const now = new Date();
  const h24 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const h48 = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // RFQs older than 24h that are still open
  const staleRfqs = await db
    .select({
      id: logisticOrderRfqsTable.id,
      rfqNumber: logisticOrderRfqsTable.rfqNumber,
      orderId: logisticOrderRfqsTable.orderId,
      createdAt: logisticOrderRfqsTable.createdAt,
      companyId: logisticOrdersTable.companyId,
      orderNumber: logisticOrdersTable.orderNumber,
    })
    .from(logisticOrderRfqsTable)
    .innerJoin(logisticOrdersTable, eq(logisticOrderRfqsTable.orderId, logisticOrdersTable.id))
    .where(
      and(
        lte(logisticOrderRfqsTable.createdAt, h24),
        notInArray(logisticOrderRfqsTable.status, ["closed", "completed", "cancelled"]),
      )
    );

  if (staleRfqs.length === 0) return;

  // Find which ones have zero vendor quotes
  const rfqIds = staleRfqs.map(r => r.id);
  const quotedRfqIds = (
    await db
      .selectDistinct({ rfqId: logisticOrderQuotesTable.rfqId })
      .from(logisticOrderQuotesTable)
      .where(
        and(
          inArray(logisticOrderQuotesTable.rfqId, rfqIds),
          ne(logisticOrderQuotesTable.quoteStatus, "cancelled"),
        )
      )
  ).map(r => r.rfqId);

  const noResponseRfqs = staleRfqs.filter(r => !quotedRfqIds.includes(r.id));
  if (noResponseRfqs.length === 0) return;

  const adminGroupWa = await getAdminGroupWa();

  for (const rfq of noResponseRfqs) {
    const isOver48h = rfq.createdAt <= h48;
    const context = isOver48h ? "rfq_no_response_48h" : "rfq_no_response_24h";
    const refId = rfq.rfqNumber;

    if (await waAlreadySent(context, refId)) continue;

    const hours = Math.floor((now.getTime() - rfq.createdAt.getTime()) / 3_600_000);

    if (isOver48h) {
      // TASK 2: Escalation
      await createAlert({
        companyId: rfq.companyId,
        alertType: "rfq_no_response",
        entityType: "rfq",
        entityId: rfq.id,
        entityRef: rfq.rfqNumber,
        severity: "critical",
        title: `RFQ ${rfq.rfqNumber} — Tidak Ada Response Vendor (${hours}j)`,
        message: `Order ${rfq.orderNumber}: RFQ sudah ${hours} jam belum ada vendor yang submit quote. Perlu tindakan segera.`,
        contextJson: { rfqNumber: rfq.rfqNumber, orderNumber: rfq.orderNumber, hoursElapsed: hours },
      });

      if (adminGroupWa) {
        const msg =
          `🚨 *ESKALASI RFQ — Tidak Ada Response*\n\n` +
          `RFQ: *${rfq.rfqNumber}*\n` +
          `Order: ${rfq.orderNumber}\n` +
          `Sudah: *${hours} jam* tanpa response vendor\n\n` +
          `Harap segera follow-up vendor atau blast ulang RFQ di BizPortal.`;
        await sendWhatsApp(adminGroupWa, msg, { context, refType: "rfq", refId });
      }
    } else {
      // TASK 1: T+24h reminder to admin group
      if (adminGroupWa) {
        const msg =
          `⏰ *Reminder RFQ — Belum Ada Response*\n\n` +
          `RFQ: *${rfq.rfqNumber}*\n` +
          `Order: ${rfq.orderNumber}\n` +
          `Sudah: ${hours} jam tanpa response vendor\n\n` +
          `Cek BizPortal › Logistik › RFQ untuk detail.`;
        await sendWhatsApp(adminGroupWa, msg, { context, refType: "rfq", refId });
      }
    }
  }
}

// ── TASK 3 & 4: Customer quote reminder & expiry ──────────────────────────────

async function checkCustomerQuoteReminders(): Promise<void> {
  const now = new Date();
  const d3 = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
  const d7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const pendingQuotes = await db
    .select({
      id: customerQuoteLinksTable.id,
      token: customerQuoteLinksTable.token,
      sentAt: customerQuoteLinksTable.sentAt,
      validUntil: customerQuoteLinksTable.validUntil,
      orderId: customerQuoteLinksTable.orderId,
      orderNumber: logisticOrdersTable.orderNumber,
      customerName: logisticOrdersTable.customerName,
      phone: logisticOrdersTable.phone,
      companyId: logisticOrdersTable.companyId,
    })
    .from(customerQuoteLinksTable)
    .innerJoin(logisticOrdersTable, eq(customerQuoteLinksTable.orderId, logisticOrdersTable.id))
    .where(eq(customerQuoteLinksTable.status, "pending"));

  const adminGroupWa = await getAdminGroupWa();

  for (const q of pendingQuotes) {
    const sentAt = q.sentAt ? new Date(q.sentAt) : null;
    if (!sentAt) continue;

    const isExpiredByTime = sentAt <= d7;
    const isExpiredByDate = q.validUntil && new Date(q.validUntil) < now;
    const shouldExpire = isExpiredByTime || isExpiredByDate;
    const isOver3d = sentAt <= d3;

    if (shouldExpire) {
      // TASK 4: Mark expired
      await db
        .update(customerQuoteLinksTable)
        .set({ status: "expired" })
        .where(eq(customerQuoteLinksTable.id, q.id));

      await createAlert({
        companyId: q.companyId,
        alertType: "quote_expired",
        entityType: "customer_quote",
        entityId: q.id,
        entityRef: q.orderNumber,
        severity: "warning",
        title: `Quote Expired — ${q.orderNumber}`,
        message: `Quotation untuk order ${q.orderNumber} (${q.customerName}) telah expired tanpa konfirmasi customer. Perlu tindak lanjut.`,
        contextJson: { orderNumber: q.orderNumber, customerName: q.customerName, token: q.token },
      });

      if (adminGroupWa) {
        const msg =
          `⚠️ *Quote Expired*\n\n` +
          `Order: *${q.orderNumber}*\n` +
          `Customer: ${q.customerName}\n` +
          `Status: Expired tanpa konfirmasi\n\n` +
          `Harap hubungi customer atau buat quotation baru.`;
        await sendWhatsApp(adminGroupWa, msg, {
          context: "quote_expired_admin",
          refType: "customer_quote",
          refId: q.token,
        });
      }

    } else if (isOver3d) {
      // TASK 3: T+3d reminder to customer
      const context = "quote_reminder_3d";
      const refId = q.token;
      if (await waAlreadySent(context, refId)) continue;

      const days = Math.floor((now.getTime() - sentAt.getTime()) / 86_400_000);

      if (q.phone) {
        const msg =
          `Halo *${q.customerName}*,\n\n` +
          `Kami ingin mengingatkan bahwa *penawaran harga* untuk order Anda (${q.orderNumber}) masih menunggu konfirmasi Anda.\n\n` +
          `Penawaran telah dikirimkan ${days} hari yang lalu. Mohon segera konfirmasi agar proses dapat dilanjutkan.\n\n` +
          `Terima kasih 🙏`;
        await sendWhatsApp(q.phone, msg, { context, refType: "customer_quote", refId });
      }
    }
  }
}

// ── TASK 5: Late order ETA breach ────────────────────────────────────────────

async function checkLateOrders(): Promise<void> {
  const now = new Date();

  const lateOrders = await db
    .select({
      id: logisticOrdersTable.id,
      orderNumber: logisticOrdersTable.orderNumber,
      status: logisticOrdersTable.status,
      eta: logisticOrdersTable.eta,
      companyId: logisticOrdersTable.companyId,
      customerName: logisticOrdersTable.customerName,
    })
    .from(logisticOrdersTable)
    .where(
      and(
        lt(logisticOrdersTable.eta, now),
        notInArray(logisticOrdersTable.status, ["Completed", "Cancelled", "Delivered", "Selesai"]),
        ne(logisticOrdersTable.status, "New Order"),
      )
    );

  for (const order of lateOrders) {
    if (!order.eta) continue;
    const hoursLate = Math.floor((now.getTime() - new Date(order.eta).getTime()) / 3_600_000);

    await createAlert({
      companyId: order.companyId,
      alertType: "order_eta_breach",
      entityType: "logistic_order",
      entityId: order.id,
      entityRef: order.orderNumber,
      severity: "critical",
      title: `ETA Terlewat — ${order.orderNumber} (${hoursLate}j)`,
      message: `Order ${order.orderNumber} (${order.customerName}) melebihi ETA ${hoursLate} jam. Status saat ini: ${order.status}.`,
      contextJson: { orderNumber: order.orderNumber, customerName: order.customerName, status: order.status, hoursLate },
    });
  }
}

// ── Main worker run ───────────────────────────────────────────────────────────

async function runWorkflowWorker(): Promise<void> {
  try {
    await Promise.allSettled([
      checkVendorRfqNoResponse(),
      checkCustomerQuoteReminders(),
      checkLateOrders(),
    ]);
  } catch (err) {
    logger.error({ err }, "WorkflowWorker: unexpected error");
  }
}

// ── Scheduler ────────────────────────────────────────────────────────────────

export function startWorkflowWorker(): void {
  const run = () =>
    runWorkflowWorker().catch(err =>
      logger.warn({ err }, "WorkflowWorker: uncaught error")
    );

  setTimeout(() => {
    run();
    setInterval(run, POLL_INTERVAL_MS).unref();
  }, INITIAL_DELAY_MS).unref();

  logger.info(
    { intervalMin: POLL_INTERVAL_MS / 60_000, initialDelayMin: INITIAL_DELAY_MS / 60_000 },
    "WorkflowWorker started (L1 reminders: RFQ T+24h/48h, quote T+3d/7d, ETA breach)"
  );
}
