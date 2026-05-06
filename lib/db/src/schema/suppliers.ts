import { pgTable, serial, text, integer, timestamp, boolean, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country"),
  contactEmail: text("contact_email"),
  phone: text("phone"),
  address: text("address"),
  taxId: text("tax_id"),
  defaultPurchaseTaxId: integer("default_purchase_tax_id"),
  serviceType: text("service_type"),
  isActive: boolean("is_active").notNull().default(true),
  logo: text("logo").notNull().default("📦"),
  eta: text("eta"),
  fee: numeric("fee", { precision: 12, scale: 2 }).default("0"),
  markup: numeric("markup", { precision: 5, scale: 2 }).default("0"),
  note: text("note"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vendorCatalogItemsTable = pgTable("vendor_catalog_items", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => suppliersTable.id),
  type: text("type").notNull().default("service"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit"),
  priceBase: numeric("price_base", { precision: 15, scale: 2 }).notNull().default("0"),
  markupPct: numeric("markup_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

export const insertVendorCatalogItemSchema = createInsertSchema(vendorCatalogItemsTable).omit({ id: true, createdAt: true });
export type InsertVendorCatalogItem = z.infer<typeof insertVendorCatalogItemSchema>;
export type VendorCatalogItem = typeof vendorCatalogItemsTable.$inferSelect;
