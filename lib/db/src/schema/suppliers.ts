import { pgTable, serial, text, integer, timestamp, boolean, numeric, index, jsonb, date } from "drizzle-orm/pg-core";
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
  etaDaysMin: integer("eta_days_min"),
  etaDaysMax: integer("eta_days_max"),
  hasInternalTruck: boolean("has_internal_truck").notNull().default(false),
  internalTruckPrice: numeric("internal_truck_price", { precision: 14, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("suppliers_company_idx").on(t.companyId),
]);

export const vendorCatalogItemsTable = pgTable("vendor_catalog_items", {
  // ── Core identity ──────────────────────────────────────────────────────────
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => suppliersTable.id),
  vendorName: text("vendor_name"),
  masterItemId: integer("master_item_id").references(() => productsTable.id, { onDelete: "set null" }),

  // ── Legacy fields (backward compat) ───────────────────────────────────────
  type: text("type").notNull().default("service"),
  name: text("name").notNull(),
  description: text("description"),
  unit: text("unit"),
  kategori: text("kategori"),
  subcategory: text("subcategory"),
  isCommodityTag: boolean("is_commodity_tag").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),

  // ── Template engine ────────────────────────────────────────────────────────
  templateKind: text("template_kind"),
  categoryKey: text("category_key"),
  serviceType: text("service_type"),
  templateId: text("template_id"),
  templateVersion: text("template_version"),
  templateSnapshot: jsonb("template_snapshot"),
  specValues: jsonb("spec_values"),

  // ── Pricing (priceBase = internal cost, NEVER expose to customer) ──────────
  priceBase: numeric("price_base", { precision: 15, scale: 2 }).notNull().default("0"),
  markupPct: numeric("markup_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  priceSell: numeric("price_sell", { precision: 15, scale: 2 }),
  currency: text("currency").notNull().default("IDR"),

  // ── Availability ──────────────────────────────────────────────────────────
  stockStatus: text("stock_status"),
  stockQty: numeric("stock_qty", { precision: 15, scale: 3 }),
  moq: numeric("moq", { precision: 15, scale: 3 }),
  leadTime: text("lead_time"),
  validityDate: date("validity_date"),

  // ── Origin / location ─────────────────────────────────────────────────────
  location: text("location"),
  origin: text("origin"),

  // ── Attachments ───────────────────────────────────────────────────────────
  documents: jsonb("documents"),
  // ── Media Foundation ──────────────────────────────────────────────────────
  mediaAssets: jsonb("media_assets").$type<Record<string, unknown>[]>().notNull().default([]),

  // ── Publication state ─────────────────────────────────────────────────────
  status: text("status").notNull().default("draft"),
  isPublished: boolean("is_published").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sourceSubmissionId: integer("source_submission_id"),
  publishedAt: timestamp("published_at"),

  // ── Timestamps ────────────────────────────────────────────────────────────
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),

  // ── Analytics counters ─────────────────────────────────────────────────────
  viewCount:  integer("view_count").notNull().default(0),
  quoteCount: integer("quote_count").notNull().default(0),
  orderCount: integer("order_count").notNull().default(0),

  // ── Featured ──────────────────────────────────────────────────────────────
  isFeatured:   boolean("is_featured").notNull().default(false),
  featuredUntil: timestamp("featured_until"),
}, (t) => [
  index("vendor_catalog_vendor_idx").on(t.vendorId),
  index("vendor_catalog_status_idx").on(t.status, t.isPublished),
  index("vendor_catalog_category_idx").on(t.categoryKey),
  index("vendor_catalog_service_type_idx").on(t.serviceType),
]);

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

export const insertVendorCatalogItemSchema = createInsertSchema(vendorCatalogItemsTable).omit({ id: true, createdAt: true });
export type InsertVendorCatalogItem = z.infer<typeof insertVendorCatalogItemSchema>;
export type VendorCatalogItem = typeof vendorCatalogItemsTable.$inferSelect;
