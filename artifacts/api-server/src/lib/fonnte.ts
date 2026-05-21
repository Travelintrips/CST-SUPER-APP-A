import { logger } from "./logger.js";
import { logNotification } from "./notificationLog.js";

const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? "";
const FONNTE_URL = "https://api.fonnte.com/send";

/**
 * Normalizes an Indonesian phone number to the international format (628...).
 * Group IDs (containing @g.us) are returned unchanged.
 * Handles: 08..., +62..., 62..., +628..., spaces/dashes.
 */
function normalizePhoneID(raw: string): string {
  if (raw.includes("@")) return raw.trim();
  let digits = raw.replace(/[^\d+]/g, "");
  digits = digits.replace(/^\+/, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

export async function sendWhatsApp(
  target: string,
  message: string,
  opts?: { context?: string; refType?: string; refId?: string },
): Promise<void> {
  if (!FONNTE_TOKEN) {
    logger.warn("FONNTE_TOKEN not set — skipping WhatsApp notification");
    await logNotification({
      channel: "wa", recipient: target, message,
      status: "failed", errorMsg: "FONNTE_TOKEN not configured",
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
    });
    return;
  }
  if (!target?.trim()) {
    logger.warn("sendWhatsApp: empty target — skipping");
    return;
  }

  const phone = normalizePhoneID(target);
  if (!phone.includes("@") && phone.length < 10) {
    logger.warn({ raw: target, normalized: phone }, "sendWhatsApp: phone too short — skipping");
    await logNotification({
      channel: "wa", recipient: target, message,
      status: "failed", errorMsg: "Phone number too short",
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
    });
    return;
  }

  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: phone, message }).toString(),
    });
    const body = await res.json() as unknown;
    if (!res.ok) {
      logger.warn({ status: res.status, body, phone }, "Fonnte responded with non-OK status");
      await logNotification({
        channel: "wa", recipient: phone, message,
        status: "failed", errorMsg: `HTTP ${res.status}`,
        context: opts?.context, refType: opts?.refType, refId: opts?.refId,
      });
    } else {
      const b = body as Record<string, unknown>;
      if (b.status === false || b.status === "false") {
        logger.warn({ body, phone }, "Fonnte returned status:false (send failed)");
        await logNotification({
          channel: "wa", recipient: phone, message,
          status: "failed", errorMsg: String(b.reason ?? b.message ?? "Fonnte status:false"),
          context: opts?.context, refType: opts?.refType, refId: opts?.refId,
        });
      } else {
        logger.info({ phone }, "WhatsApp sent via Fonnte");
        await logNotification({
          channel: "wa", recipient: phone, message,
          status: "sent",
          context: opts?.context, refType: opts?.refType, refId: opts?.refId,
        });
      }
    }
  } catch (err) {
    logger.error({ err, phone }, "Failed to send WhatsApp via Fonnte");
    await logNotification({
      channel: "wa", recipient: phone, message,
      status: "failed", errorMsg: String(err),
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
    });
  }
}
