import {
  pgTable, serial, integer, text, timestamp,
} from "drizzle-orm/pg-core";
import { logisticOrdersTable, logisticOrderRfqsTable } from "./logisticOrders";

export const adminActionLinksTable = pgTable("admin_action_links", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  actionType: text("action_type").notNull(),
  // review_order | compare_vendors | forward_vendor
  orderId: integer("order_id").notNull().references(() => logisticOrdersTable.id, { onDelete: "cascade" }),
  rfqId: integer("rfq_id").references(() => logisticOrderRfqsTable.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AdminActionLink = typeof adminActionLinksTable.$inferSelect;
