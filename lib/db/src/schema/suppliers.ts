import { pgTable, serial, text, integer, timestamp, boolean, numeric, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";
import { productsTable } from "./products";

export const suppliersTable = pgTable("suppliers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  country: text("country"),
  contactEmail: text("contact_email"),
  contactPerson: text("contact_person"),
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
  yearVehicle: integer("year_vehicle"),
  supportedModes: text("supported_modes").array(),
  // ── Phase 1: Structured ETA (replaces free-text eta field) ────────────────
  etaDaysMin: integer("eta_days_min"),
  etaDaysMax: integer("eta_days_max"),
  // ── Truck support fields ───────────────────────────────────────────────────
  hasInternalTruck: boolean("has_internal_truck").notNull().default(false),
  internalTruckPrice: numeric("internal_truck_price", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("suppliers_company_idx").on(t.companyId),
]);

export const vendorCatalogItemsTable = pgTable("vendor_catalog_items", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => suppliersTable.id),
  masterItemId: integer("master_item_id").references(() => productsTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("service"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit"),
  kategori: text("kategori"),
  subcategory: text("subcategory"),
  priceBase: numeric("price_base", { precision: 15, scale: 2 }).notNull().default("0"),
  markupPct: numeric("markup_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  isCommodityTag: boolean("is_commodity_tag").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

export const insertVendorCatalogItemSchema = createInsertSchema(vendorCatalogItemsTable).omit({ id: true, createdAt: true });
export type InsertVendorCatalogItem = z.infer<typeof insertVendorCatalogItemSchema>;
export type VendorCatalogItem = typeof vendorCatalogItemsTable.$inferSelect;
