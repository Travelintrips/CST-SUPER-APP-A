import { pgTable, serial, text, integer, numeric, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { customersTable } from "./customers";
import { productsTable } from "./products";

export const salesDocKindEnum = pgEnum("sales_doc_kind", ["quote", "order"]);
export const salesDocStatusEnum = pgEnum("sales_doc_status", [
  "draft",
  "sent",
  "confirmed",
  "done",
  "cancelled",
]);
export const salesInvoiceStatusEnum = pgEnum("sales_invoice_status", [
  "none",
  "to_invoice",
  "invoiced",
]);
export const salesDeliveryStatusEnum = pgEnum("sales_delivery_status", [
  "none",
  "to_deliver",
  "delivered",
]);

export const salesDocumentsTable = pgTable("sales_documents", {
  id: serial("id").primaryKey(),
  docNumber: text("doc_number").notNull().unique(),
  kind: salesDocKindEnum("kind").notNull().default("quote"),
  status: salesDocStatusEnum("status").notNull().default("draft"),
  invoiceStatus: salesInvoiceStatusEnum("invoice_status").notNull().default("none"),
  deliveryStatus: salesDeliveryStatusEnum("delivery_status").notNull().default("none"),
  customerId: integer("customer_id").references(() => customersTable.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  totalAmount: numeric("total_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  validUntil: timestamp("valid_until"),
  expectedDate: timestamp("expected_date"),
  notes: text("notes"),
  confirmedAt: timestamp("confirmed_at"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const salesDocumentLinesTable = pgTable("sales_document_lines", {
  id: serial("id").primaryKey(),
  documentId: integer("document_id")
    .notNull()
    .references(() => salesDocumentsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  description: text("description"),
  quantity: numeric("quantity", { precision: 12, scale: 2 }).notNull().default("1"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
});

export const insertSalesDocumentSchema = createInsertSchema(salesDocumentsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  docNumber: true,
});
export const insertSalesDocumentLineSchema = createInsertSchema(salesDocumentLinesTable).omit({
  id: true,
});

export type InsertSalesDocument = z.infer<typeof insertSalesDocumentSchema>;
export type InsertSalesDocumentLine = z.infer<typeof insertSalesDocumentLineSchema>;
export type SalesDocument = typeof salesDocumentsTable.$inferSelect;
export type SalesDocumentLine = typeof salesDocumentLinesTable.$inferSelect;
