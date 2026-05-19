import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

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
}, (t) => [
  index("notif_logs_channel_idx").on(t.channel),
  index("notif_logs_status_idx").on(t.status),
  index("notif_logs_context_idx").on(t.context),
  index("notif_logs_created_idx").on(t.createdAt),
]);

export type NotificationLog = typeof notificationLogsTable.$inferSelect;
export type InsertNotificationLog = typeof notificationLogsTable.$inferInsert;
