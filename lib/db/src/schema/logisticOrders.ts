import {
  pgTable,
  serial,
  text,
  numeric,
  jsonb,
  timestamp,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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
  requiredDate: text("required_date"),
  notes: text("notes"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  tax: numeric("tax", { precision: 14, scale: 2 }).notNull().default("0"),
  grandTotal: numeric("grand_total", { precision: 14, scale: 2 }).notNull().default("0"),
  status: text("status").notNull().default("New Order"),
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

export const logisticOrdersRelations = relations(logisticOrdersTable, ({ many }) => ({
  items: many(logisticOrderItemsTable),
}));

export const logisticOrderItemsRelations = relations(logisticOrderItemsTable, ({ one }) => ({
  order: one(logisticOrdersTable, {
    fields: [logisticOrderItemsTable.orderId],
    references: [logisticOrdersTable.id],
  }),
}));
