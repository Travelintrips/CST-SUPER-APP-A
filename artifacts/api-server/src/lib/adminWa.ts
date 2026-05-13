import { db, portalContentTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const ADMIN_WA_KEY = "fonnte_admin_wa";
const ADMIN_GROUP_WA_KEY = "fonnte_admin_group_wa";

export async function getAdminWa(): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(portalContentTable)
      .where(eq(portalContentTable.key, ADMIN_WA_KEY));
    if (row && row.value.trim()) return row.value.trim();
  } catch {
    // fall through to env var
  }
  return process.env.FONNTE_ADMIN_WA ?? "";
}

export async function setAdminWa(value: string): Promise<void> {
  await db
    .insert(portalContentTable)
    .values({ key: ADMIN_WA_KEY, value: value.trim(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: value.trim(), updatedAt: new Date() },
    });
}

/**
 * Returns the WhatsApp group ID for admin group notifications.
 * Group IDs look like: 1234567890-1234567890@g.us
 * Can be set via DB (admin panel) or env var FONNTE_ADMIN_GROUP_ID.
 */
export async function getAdminGroupWa(): Promise<string> {
  try {
    const [row] = await db
      .select()
      .from(portalContentTable)
      .where(eq(portalContentTable.key, ADMIN_GROUP_WA_KEY));
    if (row && row.value.trim()) return row.value.trim();
  } catch {
    // fall through to env var
  }
  return process.env.FONNTE_ADMIN_GROUP_ID ?? "";
}

export async function setAdminGroupWa(value: string): Promise<void> {
  await db
    .insert(portalContentTable)
    .values({ key: ADMIN_GROUP_WA_KEY, value: value.trim(), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: value.trim(), updatedAt: new Date() },
    });
}
