import {
  pgTable,
  serial,
  text,
  numeric,
  integer,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { suppliersTable } from "./suppliers";

export const logisticOrdersTable = pgTable("logistic_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  companyName: text("company_name").notNull(),
  customerName: text("customer_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  shipmentType: text("shipment_type").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  commodity: text("commodity"),
  cargoDescription: text("cargo_description"),
  grossWeight: numeric("gross_weight", { precision: 12, scale: 3 }),
  volumeCbm: numeric("volume_cbm", { precision: 12, scale: 3 }),
  jumlahKoli: integer("jumlah_koli"),
  requiredDate: text("required_date"),
  notes: text("notes"),
  paymentType: text("payment_type"),
  paymentMethod: text("payment_method"),
  namaPenerima: text("nama_penerima"),
  nomorPenerima: text("nomor_penerima"),
  jamOrder: text("jam_order"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 14, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("New Order"),
  approvedQuoteId: integer("approved_quote_id"),
  adminApprovalStatus: text("admin_approval_status").default("pending"),
  approvedAt: timestamp("approved_at"),
  approvedVendorId: integer("approved_vendor_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  finalSellingPrice: numeric("final_selling_price", { precision: 14, scale: 2 }),
  quotationSentAt: timestamp("quotation_sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const logisticOrderItemsTable = pgTable("logistic_order_items", {
  id: serial("id").primaryKey(),
  orderId: serial("order_id").references(() => logisticOrdersTable.id, { onDelete: "cascade" }).notNull(),
  category: text("category").notNull(),
  serviceName: text("service_name").notNull(),
  calculatorType: text("calculator_type").notNull(),
  inputData: jsonb("input_data").notNull().default({}),
  calculationResult: jsonb("calculation_result").notNull().default({}),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const logisticOrderRfqsTable = pgTable("logistic_order_rfqs", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => logisticOrdersTable.id, { onDelete: "cascade" }),
  rfqNumber: text("rfq_number").notNull().unique(),
  vendorIds: integer("vendor_ids").array().notNull().default([]),
  notes: text("notes"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const logisticOrderQuotesTable = pgTable("logistic_order_quotes", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => logisticOrderRfqsTable.id, { onDelete: "cascade" }),
  orderId: integer("order_id").notNull().references(() => logisticOrdersTable.id, { onDelete: "cascade" }),
  vendorId: integer("vendor_id").notNull().references(() => suppliersTable.id, { onDelete: "cascade" }),
  vendorPrice: numeric("vendor_price", { precision: 14, scale: 2 }).notNull().default("0"),
  estimatedPickup: text("estimated_pickup"),
  estimatedDelivery: text("estimated_delivery"),
  estimatedDays: integer("estimated_days"),
  vendorNotes: text("vendor_notes"),
  markupType: text("markup_type").notNull().default("percentage"),
  markupPercentage: numeric("markup_percentage", { precision: 5, scale: 2 }).notNull().default("0"),
  fixedSellingPrice: numeric("fixed_selling_price", { precision: 14, scale: 2 }),
  sellingPrice: numeric("selling_price", { precision: 14, scale: 2 }),
  quoteStatus: text("quote_status").notNull().default("pending"),
  replySource: text("reply_source").notNull().default("manual"),
  replyTimestamp: timestamp("reply_timestamp"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const logisticOrdersRelations = relations(logisticOrdersTable, ({ many }) => ({
  items: many(logisticOrderItemsTable),
  rfqs: many(logisticOrderRfqsTable),
}));

export const logisticOrderItemsRelations = relations(logisticOrderItemsTable, ({ one }) => ({
  order: one(logisticOrdersTable, {
    fields: [logisticOrderItemsTable.orderId],
    references: [logisticOrdersTable.id],
  }),
}));

export const logisticOrderRfqsRelations = relations(logisticOrderRfqsTable, ({ one, many }) => ({
  order: one(logisticOrdersTable, {
    fields: [logisticOrderRfqsTable.orderId],
    references: [logisticOrdersTable.id],
  }),
  quotes: many(logisticOrderQuotesTable),
}));

export const logisticOrderQuotesRelations = relations(logisticOrderQuotesTable, ({ one }) => ({
  rfq: one(logisticOrderRfqsTable, {
    fields: [logisticOrderQuotesTable.rfqId],
    references: [logisticOrderRfqsTable.id],
  }),
  order: one(logisticOrdersTable, {
    fields: [logisticOrderQuotesTable.orderId],
    references: [logisticOrdersTable.id],
  }),
  vendor: one(suppliersTable, {
    fields: [logisticOrderQuotesTable.vendorId],
    references: [suppliersTable.id],
  }),
}));
