import { pgTable, serial, integer, text, jsonb, timestamp } from "drizzle-orm/pg-core";

export const activityLogsTable = pgTable("activity_logs", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id"),
  orderId: integer("order_id"),
  actorType: text("actor_type").notNull().default("admin"),
  // admin | vendor | customer | driver | system
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  oldValue: jsonb("old_value"),
  newValue: jsonb("new_value"),
  description: text("description"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ActivityLog = typeof activityLogsTable.$inferSelect;
export type InsertActivityLog = typeof activityLogsTable.$inferInsert;
