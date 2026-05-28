import { pgTable, serial, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";

export const notificationLogsTable = pgTable("notification_logs", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  subject: text("subject"),
  message: text("message").notNull(),
  status: text("status").notNull().default("sent"),
  errorMsg: text("error_msg"),
  context: text("context").notNull().default("general"),
  refType: text("ref_type"),
  refId: text("ref_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  /**
   * Dedup key — hash dari (channel:recipient:context:refId:timeBucket) untuk status 'sent'.
   * NULL untuk status 'failed' / 'deduped' supaya retry tetap bisa dilog.
   * UNIQUE constraint mencegah dua concurrent INSERT lolos dedup in-memory bersamaan.
   */
  dedupKey: text("dedup_key"),
}, (t) => [
  index("notif_logs_channel_idx").on(t.channel),
  index("notif_logs_status_idx").on(t.status),
  index("notif_logs_context_idx").on(t.context),
  index("notif_logs_created_idx").on(t.createdAt),
  uniqueIndex("notif_logs_dedup_key_idx").on(t.dedupKey),
]);

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
export type InsertNotificationLog = typeof notificationLogsTable.$inferInsert;
