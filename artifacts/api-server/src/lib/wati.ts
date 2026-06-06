/**
 * WATI WhatsApp Business API client.
 * Docs: https://docs.wati.io/reference
 *
 * Dua mode pengiriman:
 *  1. sendWatiTemplate  — kirim template (HSM) yang sudah approved di WATI
 *  2. sendWatiSession   — kirim pesan teks bebas dalam session window 24 jam
 *
 * Semua caller harus lewat waTransport.ts, bukan langsung file ini.
 */

import { logger } from "./logger.js";
import { logNotification } from "./notificationLog.js";
import { normalizePhone } from "./phoneUtils.js";
import { getSetting } from "./appSecrets.js";

async function getWatiConfig(): Promise<{ baseUrl: string; token: string } | null> {
  const baseUrl = (await getSetting("wati_base_url", process.env.WATI_BASE_URL ?? "")).trim();
  const rawToken = (await getSetting("wati_api_token", process.env.WATI_API_TOKEN ?? "")).trim();
  if (!baseUrl || !rawToken) return null;
  // Strip "Bearer " prefix jika user paste token lengkap dari WATI dashboard
  const token = rawToken.replace(/^Bearer\s+/i, "");
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

export async function isWatiConfigured(): Promise<boolean> {
  return (await getWatiConfig()) !== null;
}

export interface WatiTemplateParam {
  name: string;
  value: string;
}

export interface WatiSendOpts {
  context?: string;
  refType?: string;
  refId?: string;
}

/**
 * Kirim template WATI (pre-approved HSM).
 * templateName harus sesuai persis dengan nama template di WATI dashboard.
 * broadcastName boleh bebas (untuk tracking di WATI).
 */
export async function sendWatiTemplate(
  phone: string,
  templateName: string,
  params: WatiTemplateParam[],
  opts?: WatiSendOpts & { broadcastName?: string },
): Promise<void> {
  const cfg = await getWatiConfig();
  if (!cfg) {
    logger.warn("[wati] WATI_BASE_URL atau WATI_API_TOKEN belum dikonfigurasi — skip");
    return;
  }

  const normalizedPhone = normalizePhone(phone);
  const broadcastName = opts?.broadcastName ?? `replit_${templateName}_${Date.now()}`;

  const body = {
    template_name: templateName,
    broadcast_name: broadcastName,
    parameters: params,
  };

  const url = `${cfg.baseUrl}/api/v1/sendTemplateMessage?whatsappNumber=${normalizedPhone}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const resBody = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      logger.warn({ status: res.status, resBody, phone: normalizedPhone, templateName }, "[wati] sendTemplateMessage non-OK");
      await logNotification({
        channel: "wa",
        recipient: normalizedPhone,
        message: `[WATI template: ${templateName}]`,
        status: "failed",
        errorMsg: `HTTP ${res.status}: ${JSON.stringify(resBody)}`,
        context: opts?.context,
        refType: opts?.refType,
        refId: opts?.refId,
      });
      return;
    }

    const msgId = String((resBody as any)?.id ?? (resBody as any)?.messageId ?? "");
    logger.info({ phone: normalizedPhone, templateName, msgId }, "[wati] template sent");
    await logNotification({
      channel: "wa",
      recipient: normalizedPhone,
      message: `[WATI template: ${templateName}]`,
      status: "sent",
      waMessageId: msgId || undefined,
      context: opts?.context,
      refType: opts?.refType,
      refId: opts?.refId,
    });
  } catch (err) {
    logger.error({ err, phone: normalizedPhone, templateName }, "[wati] sendTemplateMessage error");
    await logNotification({
      channel: "wa",
      recipient: normalizedPhone,
      message: `[WATI template: ${templateName}]`,
      status: "failed",
      errorMsg: String(err),
      context: opts?.context,
      refType: opts?.refType,
      refId: opts?.refId,
    });
  }
}

/**
 * Kirim pesan teks bebas (session message) via WATI.
 * Hanya berfungsi dalam 24-jam session window setelah pelanggan menghubungi.
 * Di luar session, gunakan sendWatiTemplate.
 */
export async function sendWatiSession(
  phone: string,
  message: string,
  opts?: WatiSendOpts,
): Promise<{ ok: boolean; error?: string; watiResponse?: Record<string, unknown> }> {
  const cfg = await getWatiConfig();
  if (!cfg) {
    logger.warn("[wati] WATI_BASE_URL atau WATI_API_TOKEN belum dikonfigurasi — skip");
    return { ok: false, error: "WATI belum dikonfigurasi" };
  }

  const normalizedPhone = normalizePhone(phone);
  const url = `${cfg.baseUrl}/api/v1/sendSessionMessage/${normalizedPhone}?messageText=${encodeURIComponent(message)}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
      },
    });

    const resBody = await res.json().catch(() => ({})) as Record<string, unknown>;

    // WATI kadang kembalikan HTTP 200 tapi result: false saat gagal
    const watiOk = res.ok && resBody.result !== false;
    if (!watiOk) {
      const errMsg = String((resBody as any)?.info ?? (resBody as any)?.message ?? (resBody as any)?.error ?? `HTTP ${res.status}`);
      logger.warn({ status: res.status, resBody, phone: normalizedPhone }, "[wati] sendSessionMessage non-OK");
      await logNotification({
        channel: "wa",
        recipient: normalizedPhone,
        message,
        status: "failed",
        errorMsg: `HTTP ${res.status}: ${JSON.stringify(resBody)}`,
        context: opts?.context,
        refType: opts?.refType,
        refId: opts?.refId,
      });
      return { ok: false, error: errMsg, watiResponse: resBody };
    }

    const msgId = String((resBody as any)?.id ?? (resBody as any)?.messageId ?? "");
    logger.info({ phone: normalizedPhone, msgId }, "[wati] session message sent");
    await logNotification({
      channel: "wa",
      recipient: normalizedPhone,
      message,
      status: "sent",
      waMessageId: msgId || undefined,
      context: opts?.context,
      refType: opts?.refType,
      refId: opts?.refId,
    });
    return { ok: true, watiResponse: resBody };
  } catch (err) {
    const errMsg = String(err);
    logger.error({ err, phone: normalizedPhone }, "[wati] sendSessionMessage error");
    await logNotification({
      channel: "wa",
      recipient: normalizedPhone,
      message,
      status: "failed",
      errorMsg: errMsg,
      context: opts?.context,
      refType: opts?.refType,
      refId: opts?.refId,
    });
    return { ok: false, error: errMsg };
  }
}

/**
 * Ambil daftar template yang terdaftar di WATI.
 */
export async function listWatiTemplates(): Promise<any[]> {
  const cfg = await getWatiConfig();
  if (!cfg) return [];
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/getMessageTemplates`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
    });
    if (!res.ok) return [];
    const body = await res.json() as any;
    return body?.messageTemplates ?? body?.templates ?? body ?? [];
  } catch {
    return [];
  }
}

/**
 * Test koneksi WATI — cek apakah credentials valid.
 */
export async function testWatiConnection(): Promise<{ ok: boolean; error?: string; accountName?: string }> {
  const cfg = await getWatiConfig();
  if (!cfg) return { ok: false, error: "WATI_BASE_URL atau WATI_API_TOKEN tidak dikonfigurasi" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/getMessageTemplates?pageSize=1`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.status === 401) return { ok: false, error: "Token tidak valid (401 Unauthorized)" };
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (err: any) {
    clearTimeout(timer);
    if (err?.name === "AbortError") return { ok: false, error: "Timeout: WATI server tidak merespons dalam 8 detik" };
    return { ok: false, error: String(err) };
  }
}

/**
 * Ambil info akun WATI (nomor WhatsApp & nama).
 * Strategi:
 *  1. Cek setting manual wati_phone_number (paling prioritas).
 *  2. Decode JWT token untuk ekstrak claims tanpa API call tambahan.
 *  3. Fallback ke GET /api/v1/getBusinessProfile (endpoint resmi WATI).
 *  4. Fallback ke GET /api/v1/me jika endpoint di atas tidak tersedia.
 */
export async function getWatiAccountInfo(): Promise<{ phone?: string; name?: string; source?: string }> {
  const cfg = await getWatiConfig();
  if (!cfg) return {};

  // 1. Cek setting manual — paling prioritas
  const manualPhone = (await getSetting("wati_phone_number", process.env.WATI_PHONE_NUMBER ?? "")).trim();
  if (manualPhone) {
    return { phone: manualPhone, source: "manual" };
  }

  // 2. Decode JWT claims
  try {
    const parts = cfg.token.split(".");
    if (parts.length === 3) {
      const pad = (s: string) => s + "=".repeat((4 - (s.length % 4)) % 4);
      const payload = JSON.parse(Buffer.from(pad(parts[1]), "base64").toString("utf-8")) as Record<string, unknown>;
      const phone =
        (payload.phone ?? payload.wa_number ?? payload.waNumber ?? payload.phoneNumber ?? payload.number ?? payload.whatsapp_number) as string | undefined;
      const name =
        (payload.name ?? payload.displayName ?? payload.account_name ?? payload.clientName ?? payload.sub) as string | undefined;
      if (phone) return { phone: String(phone), name: name ? String(name) : undefined, source: "jwt" };
    }
  } catch { /* malformed token */ }

  // 3. Coba GET /api/v1/getBusinessProfile (endpoint resmi WATI untuk info nomor)
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/getBusinessProfile`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const body = await res.json() as Record<string, unknown>;
      // WATI business profile fields
      const phone = String(
        body.displayPhoneNumber ?? body.phoneNumber ?? body.phone ?? body.waNumber ?? body.whatsappNumber ?? ""
      ).replace(/[^0-9]/g, "") || undefined;
      const name = String(body.name ?? body.businessName ?? body.displayName ?? "").trim() || undefined;
      if (phone) return { phone, name, source: "getBusinessProfile" };
    }
  } catch { /* ignore */ }

  // 4. Fallback ke /api/v1/me
  try {
    const res = await fetch(`${cfg.baseUrl}/api/v1/me`, {
      headers: { Authorization: `Bearer ${cfg.token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const body = await res.json() as Record<string, unknown>;
      const phone = String(
        body.phoneNumber ?? body.phone ?? body.waNumber ?? body.whatsappNumber ?? ""
      ).replace(/[^0-9]/g, "") || undefined;
      const name = String(body.name ?? body.displayName ?? body.businessName ?? "").trim() || undefined;
      if (phone) return { phone, name, source: "me" };
    }
  } catch { /* ignore */ }

  return {};
}
