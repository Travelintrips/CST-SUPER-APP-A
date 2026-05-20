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

  logger.info("Notification log migration: selesai (notification_logs table ready)");
}
