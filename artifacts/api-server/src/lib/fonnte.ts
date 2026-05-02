import { logger } from "./logger";

const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? "";
const FONNTE_URL = "https://api.fonnte.com/send";

export async function sendWhatsApp(
  target: string,
  message: string,
): Promise<void> {
  if (!FONNTE_TOKEN) {
    logger.warn("FONNTE_TOKEN not set — skipping WhatsApp notification");
    return;
  }
  const phone = target.replace(/\D/g, "");
  if (!phone) {
    logger.warn("sendWhatsApp: empty target — skipping");
    return;
  }
  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target: phone, message, countryCode: "62" }).toString(),
    });
    const body = await res.json() as unknown;
    if (!res.ok) {
      logger.warn({ status: res.status, body }, "Fonnte responded with non-OK status");
    } else {
      logger.info({ target: phone }, "WhatsApp sent via Fonnte");
    }
  } catch (err) {
    logger.error({ err }, "Failed to send WhatsApp via Fonnte");
  }
}
