/**
 * WA Transport Layer — single egress point untuk semua pengiriman WhatsApp.
 *
 * Routing logic:
 *  - Jika WATI_API_TOKEN + WATI_BASE_URL dikonfigurasi → gunakan WATI (session message)
 *  - Fallback → gunakan Fonnte
 *
 * Untuk kirim WATI template (HSM), import sendWatiTemplate langsung dari wati.ts.
 */

import { sendWhatsApp, sendWhatsAppMedia } from "./fonnte.js";
import { sendWatiSession, isWatiConfigured } from "./wati.js";
import { logger } from "./logger.js";

export type WaSendOpts = {
  context?: string;
  refType?: string;
  refId?: string;
  /** Force pakai Fonnte meski WATI tersedia (untuk grup WA admin yang tidak bisa pakai WATI) */
  forceFonnte?: boolean;
};

/**
 * Kirim pesan WA teks. Router otomatis pilih WATI atau Fonnte.
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

  const useWati = !opts?.forceFonnte && (await isWatiConfigured());

  if (useWati) {
    logger.debug({ phone, context: opts?.context, refId: opts?.refId }, "[waTransport] routing ke WATI (session)");
    const result = await sendWatiSession(phone, message, opts);
    if (result?.ok) return;
    // WATI gagal (session window habis / target invalid / error) → fallback ke Fonnte
    // supaya rantai notifikasi tidak putus diam-diam.
    logger.warn(
      { phone, context: opts?.context, refId: opts?.refId, watiError: result?.error },
      "[waTransport] WATI gagal — fallback ke Fonnte",
    );
    return sendWhatsApp(phone, message, opts);
  }

  logger.debug({ phone, context: opts?.context, refId: opts?.refId }, "[waTransport] routing ke Fonnte");
  return sendWhatsApp(phone, message, opts);
}

/**
 * Kirim pesan WA dengan media. Selalu pakai Fonnte (WATI media perlu template).
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
 * Kirim ke grup WA admin — selalu pakai Fonnte karena WATI tidak support group.
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
