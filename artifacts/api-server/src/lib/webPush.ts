import webpush from "web-push";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

// ── VAPID Init ────────────────────────────────────────────────────────────────
const VAPID_PUBLIC  = process.env.VAPID_PUBLIC_KEY  ?? "";
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const VAPID_EMAIL   = process.env.VAPID_EMAIL       ?? "mailto:admin@example.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);
}

export { VAPID_PUBLIC };

// ── DB Migration ──────────────────────────────────────────────────────────────
export async function migratePushSubscriptions() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id          SERIAL PRIMARY KEY,
      order_number TEXT NOT NULL,
      endpoint    TEXT NOT NULL UNIQUE,
      p256dh      TEXT NOT NULL,
      auth        TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_push_subs_order_number
    ON push_subscriptions (order_number)
  `);
}

// ── Send push to all subscribers of an order ─────────────────────────────────
export async function sendPushToOrder(
  orderNumber: string,
  payload: { title: string; body: string; url?: string }
) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;

  const rows = await db.execute(sql`
    SELECT endpoint, p256dh, auth FROM push_subscriptions
    WHERE order_number = ${orderNumber}
  `);

  const dead: string[] = [];

  await Promise.allSettled(
    rows.rows.map(async (row) => {
      const sub = {
        endpoint: row.endpoint as string,
        keys: { p256dh: row.p256dh as string, auth: row.auth as string },
      };
      try {
        await webpush.sendNotification(sub, JSON.stringify(payload));
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 410 || status === 404) {
          dead.push(row.endpoint as string);
        }
      }
    })
  );

  if (dead.length > 0) {
    for (const ep of dead) {
      await db.execute(sql`DELETE FROM push_subscriptions WHERE endpoint = ${ep}`).catch(() => {});
    }
  }
}
