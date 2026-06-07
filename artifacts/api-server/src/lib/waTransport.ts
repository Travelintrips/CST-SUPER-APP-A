/**
 * WA Transport Layer — single egress point untuk semua pengiriman WhatsApp.
 *
 * Semua pengiriman WA (teks, media, grup admin) memakai Fonnte.
 */

import { sendWhatsApp, sendWhatsAppMedia } from "./fonnte.js";
import { logger } from "./logger.js";

export type WaSendOpts = {
  context?: string;
  refType?: string;
  refId?: string;
  /** Disimpan untuk kompatibilitas pemanggil lama; semua pengiriman sudah via Fonnte. */
  forceFonnte?: boolean;
};

/**
 * Kirim pesan WA teks via Fonnte.
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

  logger.debug({ phone, context: opts?.context, refId: opts?.refId }, "[waTransport] routing ke Fonnte");
  return sendWhatsApp(phone, message, opts);
}

/**
 * Kirim pesan WA dengan media via Fonnte.
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
  logger.debug({ phone, mediaUrl, context: opts?.context, refId: opts?.refId }, "[waTransport] sending WA with media (Fonnte)");
  return sendWhatsAppMedia(phone, message, mediaUrl, opts);
}

/**
 * Kirim ke grup WA admin via Fonnte.
 */
export async function sendToAdminGroup(
  groupId: string,
  message: string,
  opts?: Omit<WaSendOpts, "forceFonnte">,
): Promise<void> {
  if (!groupId || !message?.trim()) return;
  logger.debug({ groupId, context: opts?.context }, "[waTransport] admin group → Fonnte");
  return sendWhatsApp(groupId, message, { ...opts, forceFonnte: true } as any);
}
