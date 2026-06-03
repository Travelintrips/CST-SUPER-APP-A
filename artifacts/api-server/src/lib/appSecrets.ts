import { db, portalContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: string; expiresAt: number }>();

export interface SecretDef {
  key: string;
  label: string;
  description: string;
  envFallback: string;
  sensitive: boolean;
  group: string;
}

export const SECRETS_CATALOG: SecretDef[] = [
  {
    key: "fonnte_token",
    label: "Fonnte API Token",
    description: "Token API Fonnte untuk pengiriman WhatsApp",
    envFallback: "FONNTE_TOKEN",
    sensitive: true,
    group: "WhatsApp",
  },
  {
    key: "fonnte_admin_wa",
    label: "WA Admin Personal",
    description: "Nomor WhatsApp admin personal (format: 628xxx)",
    envFallback: "FONNTE_ADMIN_WA",
    sensitive: false,
    group: "WhatsApp",
  },
  {
    key: "fonnte_admin_group_wa",
    label: "WA Admin Group",
    description: "ID grup WhatsApp admin (format: 628xxx-timestamp@g.us)",
    envFallback: "FONNTE_ADMIN_GROUP_ID",
    sensitive: false,
    group: "WhatsApp",
  },
  {
    key: "admin_wa_phones",
    label: "Nomor Admin WA (CSV)",
    description: "Daftar nomor WA berwenang kirim perintah admin, dipisah koma",
    envFallback: "ADMIN_WA_PHONES",
    sensitive: false,
    group: "WhatsApp",
  },
  {
    key: "smtp_pass",
    label: "Resend API Key",
    description: "API Key dari Resend.com untuk pengiriman email",
    envFallback: "SMTP_PASS",
    sensitive: true,
    group: "Email",
  },
  {
    key: "smtp_from",
    label: "Email Pengirim (From)",
    description: "Alamat email pengirim notifikasi",
    envFallback: "SMTP_FROM",
    sensitive: false,
    group: "Email",
  },
  {
    key: "admin_email",
    label: "Email Admin",
    description: "Alamat email admin untuk notifikasi internal",
    envFallback: "ADMIN_EMAIL",
    sensitive: false,
    group: "Email",
  },
  {
    key: "portal_admin_key",
    label: "Portal Admin Key",
    description: "Key untuk klaim role admin di Customer Portal",
    envFallback: "PORTAL_ADMIN_KEY",
    sensitive: true,
    group: "Auth",
  },
];

export function maskSecret(value: string): string {
  if (!value) return "";
  if (value.length <= 8) return "••••••••";
  return "••••" + value.slice(-4);
}

export async function getSetting(key: string, envFallback = ""): Promise<string> {
  const cached = cache.get(key);
  if (cached && Date.now() < cached.expiresAt) return cached.value;
  try {
    const [row] = await db
      .select()
      .from(portalContentTable)
      .where(eq(portalContentTable.key, key));
    const value = row?.value?.trim() || envFallback;
    cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    return value;
  } catch {
    return envFallback;
  }
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(portalContentTable)
    .values({ key, value: value.trim(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: value.trim(), updatedAt: new Date() },
    });
  cache.delete(key);
}

export function invalidateSettingCache(key?: string): void {
  if (key) {
    cache.delete(key);
  } else {
    cache.clear();
  }
}

export async function getFonnteToken(): Promise<string> {
  return getSetting("fonnte_token", process.env.FONNTE_TOKEN ?? "");
}

export async function getSmtpPass(): Promise<string> {
  return getSetting("smtp_pass", process.env.SMTP_PASS ?? "");
}

export async function getSmtpFrom(): Promise<string> {
  return getSetting(
    "smtp_from",
    process.env.SMTP_FROM ?? "noreply@cstlogistic.co.id",
  );
}

export async function getAdminEmail(): Promise<string> {
  return getSetting("admin_email", process.env.ADMIN_EMAIL ?? "");
}

export async function getPortalAdminKey(): Promise<string> {
  return getSetting("portal_admin_key", process.env.PORTAL_ADMIN_KEY ?? "");
}
