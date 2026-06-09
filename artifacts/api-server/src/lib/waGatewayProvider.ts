/**
 * WA Gateway Provider — kirim pesan WhatsApp melalui WA Gateway microservice sendiri
 * (Baileys / WhatsApp Web protocol), sebagai alternatif Fonnte yang berbayar per pesan.
 *
 * Aktif jika semua tiga konfigurasi berikut tersedia:
 *   wa_gateway_url      → base URL WA Gateway, contoh: http://localhost:8000
 *   wa_gateway_api_key  → API key bertipe wag_xxx (dibuat di dashboard /wa-gateway)
 *   wa_gateway_device_id → ID device WA yang sudah connected
 *
 * Jika salah satu tidak ada, waTransport.ts akan fallback ke Fonnte.
 */

import { logger } from "./logger.js";
import { logNotification, wasRecentlyNotified } from "./notificationLog.js";

const DEDUP_WINDOW_MS = parseInt(process.env.WA_DEDUP_WINDOW_MS ?? "1800000", 10);

export interface WaGatewayConfig {
  url: string;
  apiKey: string;
  deviceId: number;
}

function normalizePhoneID(raw: string): string {
  if (raw.includes("@")) return raw.trim();
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

async function callGatewaySend(
  config: WaGatewayConfig,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const url = `${config.url.replace(/\/$/, "")}/wa-gateway/api/messages/send`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${json.error ?? JSON.stringify(json)}` };
    }
    return { ok: true, messageId: json.messageId ? String(json.messageId) : undefined };
  } catch (err: any) {
    return { ok: false, error: err.message ?? String(err) };
  }
}

export async function sendTextViaGateway(
  config: WaGatewayConfig,
  target: string,
  message: string,
  opts?: { context?: string; refType?: string; refId?: string },
): Promise<void> {
  if (!target?.trim() || !message?.trim()) return;

  if (opts?.context && opts?.refId) {
    const deduped = await wasRecentlyNotified(opts.context, opts.refId, DEDUP_WINDOW_MS);
    if (deduped) {
      logger.info(
        { context: opts.context, refId: opts.refId, target, windowMs: DEDUP_WINDOW_MS },
        "[waGateway] deduped — same context+refId already sent within window",
      );
      await logNotification({
        channel: "wa", recipient: target, message, status: "deduped",
        errorMsg: `Deduped: context=${opts.context} refId=${opts.refId}`,
        context: opts.context, refType: opts.refType, refId: opts.refId,
      });
      return;
    }
  }

  const phone = normalizePhoneID(target);
  const result = await callGatewaySend(config, {
    device_id: config.deviceId,
    to: phone,
    type: "text",
    message,
  });

  if (result.ok) {
    logger.info({ phone, waMessageId: result.messageId, deviceId: config.deviceId }, "[waGateway] teks terkirim");
    await logNotification({
      channel: "wa", recipient: phone, message, status: "sent",
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
      waMessageId: result.messageId,
    });
  } else {
    logger.warn({ phone, error: result.error, deviceId: config.deviceId }, "[waGateway] gagal kirim teks");
    await logNotification({
      channel: "wa", recipient: phone, message, status: "failed",
      errorMsg: result.error,
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
    });
    // fallback ke Fonnte ditangani di waTransport
    throw new Error(`WA Gateway send failed: ${result.error}`);
  }
}

export async function sendMediaViaGateway(
  config: WaGatewayConfig,
  target: string,
  message: string,
  mediaUrl: string,
  opts?: { context?: string; refType?: string; refId?: string },
): Promise<void> {
  if (!target?.trim() || !message?.trim()) return;

  if (!mediaUrl?.trim()) {
    return sendTextViaGateway(config, target, message, opts);
  }

  if (opts?.context && opts?.refId) {
    const deduped = await wasRecentlyNotified(opts.context, opts.refId, DEDUP_WINDOW_MS);
    if (deduped) {
      logger.info(
        { context: opts.context, refId: opts.refId, target },
        "[waGateway] media deduped — already sent within window",
      );
      await logNotification({
        channel: "wa", recipient: target, message, status: "deduped",
        errorMsg: `Deduped: context=${opts.context} refId=${opts.refId}`,
        context: opts.context, refType: opts.refType, refId: opts.refId,
        mediaUrl,
      });
      return;
    }
  }

  const phone = normalizePhoneID(target);
  const result = await callGatewaySend(config, {
    device_id: config.deviceId,
    to: phone,
    type: "image",
    url: mediaUrl,
    caption: message,
  });

  if (result.ok) {
    logger.info({ phone, mediaUrl, waMessageId: result.messageId }, "[waGateway] media terkirim");
    await logNotification({
      channel: "wa", recipient: phone, message, status: "sent",
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
      mediaUrl, waMessageId: result.messageId,
    });
  } else {
    logger.warn({ phone, mediaUrl, error: result.error }, "[waGateway] gagal kirim media");
    await logNotification({
      channel: "wa", recipient: phone, message, status: "failed",
      errorMsg: result.error,
      context: opts?.context, refType: opts?.refType, refId: opts?.refId,
      mediaUrl,
    });
    throw new Error(`WA Gateway media send failed: ${result.error}`);
  }
}
