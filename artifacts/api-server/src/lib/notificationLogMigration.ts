import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function runNotificationLogMigration(): Promise<void> {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS notification_logs (
      id         SERIAL PRIMARY KEY,
      channel    TEXT      NOT NULL,
      recipient  TEXT      NOT NULL,
      subject    TEXT,
      message    TEXT      NOT NULL,
      status     TEXT      NOT NULL DEFAULT 'sent',
      error_msg  TEXT,
      context    TEXT      NOT NULL DEFAULT 'general',
      ref_type   TEXT,
      ref_id     TEXT,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);

  await db.execute(sql`CREATE INDEX IF NOT EXISTS notif_logs_channel_idx  ON notification_logs (channel)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notif_logs_status_idx   ON notification_logs (status)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notif_logs_context_idx  ON notification_logs (context)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS notif_logs_created_idx  ON notification_logs (created_at)`);

  // Composite index untuk deduplication query (context + ref_id + created_at + status)
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS notif_logs_dedup_idx
    ON notification_logs (channel, context, ref_id, status, created_at)
    WHERE ref_id IS NOT NULL
  `);

  // Kolom dedup_key + unique index (dipakai logNotification onConflictDoNothing)
  await db.execute(sql`ALTER TABLE notification_logs ADD COLUMN IF NOT EXISTS dedup_key TEXT`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS notif_logs_dedup_key_idx ON notification_logs (dedup_key)`);

  logger.info("Notification log migration: selesai (notification_logs table ready)");
}
