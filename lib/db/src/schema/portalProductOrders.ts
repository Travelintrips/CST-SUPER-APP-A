import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  timestamp,
  jsonb,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { productsTable } from "./products";

export const portalProductOrdersTable = pgTable("portal_product_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  shippingAddress: text("shipping_address").notNull(),
  notes: text("notes"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("New Order"),
  // Product Template Engine fields
  productCategory: text("product_category"),
  templateId: text("template_id"),
  templateVersion: text("template_version"),
  customFieldValues: jsonb("custom_field_values").$type<Record<string, string | number | boolean>>().default({}),
  uploadedDocuments: jsonb("uploaded_documents").$type<{ key: string; label: string; reference: string }[]>().default([]),
  checklistStatus: jsonb("checklist_status").$type<Record<string, boolean>>().default({}),
  packagingNotes: text("packaging_notes"),
  conditionalFlags: jsonb("conditional_flags").$type<Record<string, string | number | boolean>>().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const portalProductOrderItemsTable = pgTable("portal_product_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => portalProductOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  productName: text("product_name").notNull(),
  productSku: text("product_sku"),
  unit: text("unit"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
  qty: integer("qty").notNull().default(1),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const portalProductOrdersRelations = relations(portalProductOrdersTable, ({ many }) => ({
  items: many(portalProductOrderItemsTable),
}));

export const portalProductOrderItemsRelations = relations(portalProductOrderItemsTable, ({ one }) => ({
  order: one(portalProductOrdersTable, {
    fields: [portalProductOrderItemsTable.orderId],
    references: [portalProductOrdersTable.id],
  }),
  product: one(productsTable, {
    fields: [portalProductOrderItemsTable.productId],
    references: [productsTable.id],
  }),
}));
