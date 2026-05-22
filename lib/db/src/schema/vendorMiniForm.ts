import { pgTable, serial, integer, text, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { suppliersTable } from "./suppliers";

export const vendorMiniFormLinksTable = pgTable("vendor_mini_form_links", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  serviceType: text("service_type").notNull(),
  title: text("title"),
  notes: text("notes"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  shortUrl: text("short_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
});

export const vendorMiniFormSubmissionsTable = pgTable("vendor_mini_form_submissions", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").references(() => vendorMiniFormLinksTable.id, { onDelete: "set null" }),
  token: text("token").notNull(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  serviceType: text("service_type").notNull(),
  vendorName: text("vendor_name"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  formData: jsonb("form_data").notNull().default({}),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
});

export type VendorMiniFormLink = typeof vendorMiniFormLinksTable.$inferSelect;
export type InsertVendorMiniFormLink = typeof vendorMiniFormLinksTable.$inferInsert;
export type VendorMiniFormSubmission = typeof vendorMiniFormSubmissionsTable.$inferSelect;
export type InsertVendorMiniFormSubmission = typeof vendorMiniFormSubmissionsTable.$inferInsert;
