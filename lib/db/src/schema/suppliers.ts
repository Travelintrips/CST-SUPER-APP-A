import { pgTable, serial, text, integer, timestamp, boolean, numeric, index, jsonb } from "drizzle-orm/pg-core";
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

  // ── Vendor identity ──────────────────────────────────────────────────────────
  vendorId: integer("vendor_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  vendorName: text("vendor_name"),

  // ── Legacy / compatibility ───────────────────────────────────────────────────
  masterItemId: integer("master_item_id").references(() => productsTable.id, { onDelete: "set null" }),
  type: text("type").notNull().default("service"),       // legacy; pakai templateKind untuk data baru
  name: text("name").notNull(),
  description: text("description"),
  kategori: text("kategori"),                            // legacy; pakai categoryKey untuk data baru
  subcategory: text("subcategory"),
  isCommodityTag: boolean("is_commodity_tag").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),

  // ── Template engine ──────────────────────────────────────────────────────────
  templateKind: text("template_kind").default("service"),  // "product" | "service"
  categoryKey: text("category_key"),
  serviceType: text("service_type"),
  templateId: text("template_id"),
  templateVersion: text("template_version"),
  templateSnapshot: jsonb("template_snapshot"),
  specValues: jsonb("spec_values"),

  // ── Pricing (priceBase = INTERNAL ONLY — jangan ekspos ke customer) ──────────
  priceBase: numeric("price_base", { precision: 15, scale: 2 }).notNull().default("0"),
  markupPct: numeric("markup_pct", { precision: 5, scale: 2 }).notNull().default("0"),
  priceSell: numeric("price_sell", { precision: 15, scale: 2 }),  // harga jual yang boleh diekspos
  currency: text("currency").notNull().default("IDR"),

  // ── Unit & quantity ──────────────────────────────────────────────────────────
  unit: text("unit"),
  moq: integer("moq").default(1),

  // ── Stock ────────────────────────────────────────────────────────────────────
  stockStatus: text("stock_status").default("available"), // "available" | "limited" | "out_of_stock"
  stockQty: integer("stock_qty"),

  // ── Lead time & validity ─────────────────────────────────────────────────────
  leadTime: text("lead_time"),
  validityDate: timestamp("validity_date"),

  // ── Asal & lokasi ────────────────────────────────────────────────────────────
  location: text("location"),
  origin: text("origin"),

  // ── Dokumen pendukung ─────────────────────────────────────────────────────────
  documents: jsonb("documents").default([]),

  // ── Lifecycle status ──────────────────────────────────────────────────────────
  // "draft" | "pending_review" | "published" | "archived"
  status: text("status").notNull().default("draft"),
  isPublished: boolean("is_published").notNull().default(false),
  sourceSubmissionId: integer("source_submission_id"),
  publishedAt: timestamp("published_at"),

  // ── Timestamps ───────────────────────────────────────────────────────────────
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSupplierSchema = createInsertSchema(suppliersTable).omit({ id: true, createdAt: true });
export type InsertSupplier = z.infer<typeof insertSupplierSchema>;
export type Supplier = typeof suppliersTable.$inferSelect;

export const insertVendorCatalogItemSchema = createInsertSchema(vendorCatalogItemsTable).omit({ id: true, createdAt: true });
export type InsertVendorCatalogItem = z.infer<typeof insertVendorCatalogItemSchema>;
export type VendorCatalogItem = typeof vendorCatalogItemsTable.$inferSelect;
