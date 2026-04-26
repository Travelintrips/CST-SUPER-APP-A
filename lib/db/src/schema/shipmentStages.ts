import { pgTable, serial, integer, text, date, timestamp } from "drizzle-orm/pg-core";

export const shipmentStagesTable = pgTable("shipment_stages", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id").notNull(),
  stageType: text("stage_type").notNull(),
  vendorName: text("vendor_name"),
  date: date("date"),
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
