/**
 * WA Transport Layer — single egress point untuk semua pengiriman WhatsApp.
 *
 * Prioritas routing:
 *   1. WA Gateway sendiri (Baileys) — jika wa_gateway_url + wa_gateway_api_key +
 *      wa_gateway_device_id dikonfigurasi via DB settings atau env vars.
 *      Jika gateway gagal, otomatis fallback ke Fonnte.
 *   2. Fonnte — provider cloud berbayar, dipakai jika gateway tidak dikonfigurasi
 *      atau pesan eksplisit diminta lewat Fonnte (forceFonnte: true).
 *
 * Konfigurasi WA Gateway (salah satu cara):
 *   a) BizPortal → Settings → WhatsApp → isi "WA Gateway URL", "API Key", "Device ID"
 *   b) Env vars: WA_GATEWAY_URL, WA_GATEWAY_API_KEY, WA_GATEWAY_DEVICE_ID
 */

import { sendWhatsApp, sendWhatsAppMedia } from "./fonnte.js";
import { sendTextViaGateway, sendMediaViaGateway } from "./waGatewayProvider.js";
import { getWaGatewayConfig } from "./appSecrets.js";
import { logger } from "./logger.js";

export type WaSendOpts = {
  context?: string;
  refType?: string;
  refId?: string;
  /**
   * forceFonnte: true → bypass WA Gateway, selalu pakai Fonnte.
   * Berguna untuk grup admin yang mungkin butuh nomor Fonnte khusus.
   */
  forceFonnte?: boolean;
};

/**
 * Kirim pesan WA teks.
 * Routing: WA Gateway (jika dikonfigurasi) → Fonnte (fallback).
 */
export async function sendViaService(
  phone: string,
  message: string,
  opts?: WaSendOpts,
): Promise<void> {
  if (!phone || !message?.trim()) {
    logger.warn({ phone: phone || "(empty)", opts }, "[waTransport] skip — phone atau message kosong");
    return;
  }

  if (!opts?.forceFonnte) {
    const gwConfig = await getWaGatewayConfig();
    if (gwConfig) {
      logger.debug({ phone, context: opts?.context, deviceId: gwConfig.deviceId }, "[waTransport] routing ke WA Gateway");
      try {
        await sendTextViaGateway(gwConfig, phone, message, opts);
        return;
      } catch (err: any) {
        logger.warn({ phone, err: err.message }, "[waTransport] WA Gateway gagal — fallback ke Fonnte");
      }
    }
  }

  logger.debug({ phone, context: opts?.context, refId: opts?.refId }, "[waTransport] routing ke Fonnte");
  return sendWhatsApp(phone, message, opts);
}

/**
 * Kirim pesan WA dengan media (gambar/dokumen).
 * Routing: WA Gateway → Fonnte (fallback).
 */
export async function sendMediaViaService(
  phone: string,
  message: string,
  mediaUrl: string,
  opts?: WaSendOpts,
): Promise<void> {
  if (!phone || !message?.trim()) {
    logger.warn({ phone: phone || "(empty)", opts }, "[waTransport] skip media — phone atau message kosong");
    return;
  }

  if (!opts?.forceFonnte) {
    const gwConfig = await getWaGatewayConfig();
    if (gwConfig) {
      logger.debug({ phone, mediaUrl, context: opts?.context, deviceId: gwConfig.deviceId }, "[waTransport] media routing ke WA Gateway");
      try {
        await sendMediaViaGateway(gwConfig, phone, message, mediaUrl, opts);
        return;
      } catch (err: any) {
        logger.warn({ phone, mediaUrl, err: err.message }, "[waTransport] WA Gateway media gagal — fallback ke Fonnte");
      }
    }
  }

  logger.debug({ phone, mediaUrl, context: opts?.context }, "[waTransport] media routing ke Fonnte");
  return sendWhatsAppMedia(phone, message, mediaUrl, opts);
}

/**
 * Kirim ke grup WA admin.
 * Default pakai Fonnte (grup admin biasanya terikat ke nomor Fonnte).
 * Set forceFonnte: false untuk coba kirim via WA Gateway terlebih dahulu.
 */
export async function sendToAdminGroup(
  groupId: string,
  message: string,
  opts?: Omit<WaSendOpts, "forceFonnte"> & { forceGateway?: boolean },
): Promise<void> {
  if (!groupId || !message?.trim()) return;

  if (opts?.forceGateway) {
    const gwConfig = await getWaGatewayConfig();
    if (gwConfig) {
      logger.debug({ groupId, context: opts?.context }, "[waTransport] admin group → WA Gateway");
      try {
        await sendTextViaGateway(gwConfig, groupId, message, opts);
        return;
      } catch (err: any) {
        logger.warn({ groupId, err: err.message }, "[waTransport] WA Gateway grup gagal — fallback ke Fonnte");
      }
    }
  }

  logger.debug({ groupId, context: opts?.context }, "[waTransport] admin group → Fonnte");
  return sendWhatsApp(groupId, message, { ...opts, forceFonnte: true } as any);
}
