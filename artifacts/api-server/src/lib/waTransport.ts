/**
 * WA Transport Layer — single egress point untuk semua pengiriman WhatsApp.
 *
 * Semua file di codebase yang ingin kirim WA HARUS import sendViaService dari sini,
 * bukan langsung dari fonnte. Fonnte hanya boleh dipanggil dari file ini.
 *
 * Manfaat:
 *  - Uniform logging: setiap WA keluar ter-log dengan workflow/context
 *  - Phone guard: skip kirim jika phone kosong (tidak perlu cek di tiap caller)
 *  - Single point untuk rate limiting, dead-letter queue, dll di masa depan
 */

import { sendWhatsApp, sendWhatsAppMedia } from "./fonnte.js";
import { logger } from "./logger.js";

export type WaSendOpts = {
  context?: string;
  refType?: string;
  refId?: string;
};

/**
 * Drop-in replacement untuk sendWhatsApp dari fonnte.
 * Semua caller di codebase menggunakan alias:
 *   import { sendViaService as sendWhatsApp } from "./waTransport.js"
 * sehingga tidak perlu mengubah call-site.
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
  logger.debug({ phone, context: opts?.context, refId: opts?.refId }, "[waTransport] sending WA");
  return sendWhatsApp(phone, message, opts);
}

/**
 * Kirim pesan WA dengan gambar/media sebagai lampiran.
 * Jika mediaUrl kosong, otomatis fallback ke pesan teks biasa.
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
  logger.debug({ phone, mediaUrl, context: opts?.context, refId: opts?.refId }, "[waTransport] sending WA with media");
  return sendWhatsAppMedia(phone, message, mediaUrl, opts);
}
