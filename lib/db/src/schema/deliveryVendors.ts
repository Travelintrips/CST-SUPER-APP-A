import { pgTable, serial, text, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const deliveryVendorsTable = pgTable("delivery_vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  logo: text("logo").notNull().default("📦"),
  eta: text("eta").notNull().default("2-3 hari"),
  fee: numeric("fee", { precision: 12, scale: 2 }).notNull().default("0"),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: numeric("sort_order", { precision: 6, scale: 0 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertDeliveryVendorSchema = createInsertSchema(deliveryVendorsTable).omit({ id: true, createdAt: true });
export type InsertDeliveryVendor = z.infer<typeof insertDeliveryVendorSchema>;
export type DeliveryVendor = typeof deliveryVendorsTable.$inferSelect;
