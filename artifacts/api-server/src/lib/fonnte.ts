import { logger } from "./logger";

const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? "";
const FONNTE_URL = "https://api.fonnte.com/send";

/**
 * Normalizes an Indonesian phone number to the international format (628...).
 * Handles: 08..., +62..., 62..., +628..., spaces/dashes.
 */
function normalizePhoneID(raw: string): string {
  // Strip everything except digits and leading +
  let digits = raw.replace(/[^\d+]/g, "");
  // Remove leading +
  digits = digits.replace(/^\+/, "");

  if (digits.startsWith("62")) return digits;          // already international
  if (digits.startsWith("0")) return "62" + digits.slice(1); // 08xxx → 628xxx
  return "62" + digits;                                // bare number → 628xxx
}

export async function sendWhatsApp(
  target: string,
  message: string,
): Promise<void> {
  if (!FONNTE_TOKEN) {
    logger.warn("FONNTE_TOKEN not set — skipping WhatsApp notification");
    return;
  }
  if (!target?.trim()) {
    logger.warn("sendWhatsApp: empty target — skipping");
    return;
  }

  const phone = normalizePhoneID(target);
  if (phone.length < 10) {
    logger.warn({ raw: target, normalized: phone }, "sendWhatsApp: phone too short — skipping");
    return;
  }

  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      // No countryCode — number is already in 628xxx format
      body: new URLSearchParams({ target: phone, message }).toString(),
    });
    const body = await res.json() as unknown;
    if (!res.ok) {
      logger.warn({ status: res.status, body, phone }, "Fonnte responded with non-OK status");
    } else {
      const b = body as Record<string, unknown>;
      if (b.status === false || b.status === "false") {
        logger.warn({ body, phone }, "Fonnte returned status:false (send failed)");
      } else {
        logger.info({ phone }, "WhatsApp sent via Fonnte");
      }
    }
  } catch (err) {
    logger.error({ err, phone }, "Failed to send WhatsApp via Fonnte");
  }
}
