import {
  pgTable, serial, integer, text, numeric, boolean, timestamp,
} from "drizzle-orm/pg-core";
import { logisticOrderRfqsTable } from "./logisticOrders";
import { suppliersTable } from "./suppliers";

export const rfqVendorLinksTable = pgTable("rfq_vendor_links", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => logisticOrderRfqsTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  status: text("status").notNull().default("waiting_response"),
  // waiting_response | accepted_basic_price | counter_offer | rejected
  // expired | selected | not_selected | late_response
  basicPrice: numeric("basic_price", { precision: 14, scale: 2 }),
  offeredPrice: numeric("offered_price", { precision: 14, scale: 2 }),
  eta: text("eta"),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"),
  isNewUpdate: boolean("is_new_update").notNull().default(false),
  openedAt: timestamp("opened_at"),
  submittedAt: timestamp("submitted_at"),
  lastUpdatedAt: timestamp("last_updated_at"),
  expiredAt: timestamp("expired_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rfqActivityLogsTable = pgTable("rfq_activity_logs", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull(),
  actorType: text("actor_type").notNull(),
  actorId: text("actor_id"),
  actorName: text("actor_name"),
  action: text("action").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type RfqVendorLink = typeof rfqVendorLinksTable.$inferSelect;
export type InsertRfqVendorLink = typeof rfqVendorLinksTable.$inferInsert;
export type RfqActivityLog = typeof rfqActivityLogsTable.$inferSelect;
