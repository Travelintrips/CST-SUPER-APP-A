import { db, portalContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_WA_KEY = "fonnte_admin_wa";
const ADMIN_GROUP_WA_KEY = "fonnte_admin_group_wa";

const CACHE_TTL_MS = 5 * 60 * 1000;
let adminWaCache: { value: string; expiresAt: number } | null = null;
let adminGroupWaCache: { value: string; expiresAt: number } | null = null;

export function invalidateAdminWaCache() {
  adminWaCache = null;
  adminGroupWaCache = null;
}

export async function getAdminWa(): Promise<string> {
  if (adminWaCache && Date.now() < adminWaCache.expiresAt) {
    return adminWaCache.value;
  }
  try {
    const [row] = await db
      .select()
      .from(portalContentTable)
      .where(eq(portalContentTable.key, ADMIN_WA_KEY));
    const value = row?.value?.trim() || process.env.FONNTE_ADMIN_WA || "";
    adminWaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return process.env.FONNTE_ADMIN_WA ?? "";
  }
}

export async function setAdminWa(value: string): Promise<void> {
  await db
    .insert(portalContentTable)
    .values({ key: ADMIN_WA_KEY, value: value.trim(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: value.trim(), updatedAt: new Date() },
    });
  adminWaCache = null;
}

export async function getAdminGroupWa(): Promise<string> {
  if (adminGroupWaCache && Date.now() < adminGroupWaCache.expiresAt) {
    return adminGroupWaCache.value;
  }
  try {
    const [row] = await db
      .select()
      .from(portalContentTable)
      .where(eq(portalContentTable.key, ADMIN_GROUP_WA_KEY));
    const value = row?.value?.trim() || process.env.FONNTE_ADMIN_GROUP_ID || "";
    adminGroupWaCache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
    return value;
  } catch {
    return process.env.FONNTE_ADMIN_GROUP_ID ?? "";
  }
}

export async function setAdminGroupWa(value: string): Promise<void> {
  await db
    .insert(portalContentTable)
    .values({ key: ADMIN_GROUP_WA_KEY, value: value.trim(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: value.trim(), updatedAt: new Date() },
    });
  adminGroupWaCache = null;
}
