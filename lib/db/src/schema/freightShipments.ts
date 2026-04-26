import { pgTable, serial, text, numeric, integer, timestamp, date, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { salesDocumentsTable } from "./salesDocuments";

export const freightShipmentStatusEnum = pgEnum("freight_shipment_status", [
  "draft", "rfq_sent", "confirmed", "in_transit", "completed", "cancelled",
]);

export const freightQuoteStatusEnum = pgEnum("freight_quote_status", [
  "pending", "approved", "rejected",
]);

export const freightShipmentsTable = pgTable("freight_shipments", {
  id: serial("id").primaryKey(),
  shipmentNumber: text("shipment_number").notNull().unique(),
  shipperName: text("shipper_name").notNull(),
  shipperAddress: text("shipper_address"),
  consigneeName: text("consignee_name").notNull(),
  consigneeAddress: text("consignee_address"),
  commodity: text("commodity").notNull(),
  grossWeight: numeric("gross_weight", { precision: 12, scale: 3 }),
  netWeight: numeric("net_weight", { precision: 12, scale: 3 }),
  quantity: integer("quantity"),
  packingType: text("packing_type"),
  dimensions: text("dimensions"),
  hsCode: text("hs_code"),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  portOfLoading: text("port_of_loading"),
  portOfDischarge: text("port_of_discharge"),
  vessel: text("vessel"),
  voyage: text("voyage"),
  notifyParty: text("notify_party"),
  marksAndNumbers: text("marks_and_numbers"),
  measurement: text("measurement"),
  status: freightShipmentStatusEnum("status").default("draft").notNull(),
  notes: text("notes"),
  actualCost: numeric("actual_cost", { precision: 14, scale: 2 }),
  departureDate: date("departure_date"),
  arrivalDate: date("arrival_date"),
  trackingNumber: text("tracking_number"),
  awbNumber: text("awb_number"),
  transportMode: text("transport_mode"),
  cargoType: text("cargo_type"),
  containerNo: text("container_no"),
  salesDocId: integer("sales_doc_id").references(() => salesDocumentsTable.id, { onDelete: "set null" }),
  approvedVendorName: text("approved_vendor_name"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const freightRfqsTable = pgTable("freight_rfqs", {
  id: serial("id").primaryKey(),
  rfqNumber: text("rfq_number").notNull().unique(),
  shipmentId: integer("shipment_id").notNull().references(() => freightShipmentsTable.id, { onDelete: "cascade" }),
  vendorNames: text("vendor_names").array().notNull().default([]),
  notes: text("notes"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const freightQuotesTable = pgTable("freight_quotes", {
  id: serial("id").primaryKey(),
  rfqId: integer("rfq_id").notNull().references(() => freightRfqsTable.id, { onDelete: "cascade" }),
  shipmentId: integer("shipment_id").notNull(),
  vendorName: text("vendor_name").notNull(),
  truckingCost: numeric("trucking_cost", { precision: 14, scale: 2 }).default("0"),
  handlingCost: numeric("handling_cost", { precision: 14, scale: 2 }).default("0"),
  freightCost: numeric("freight_cost", { precision: 14, scale: 2 }).default("0"),
  otherCost: numeric("other_cost", { precision: 14, scale: 2 }).default("0"),
  totalCost: numeric("total_cost", { precision: 14, scale: 2 }).default("0"),
  estimatedDays: integer("estimated_days"),
  notes: text("notes"),
  status: freightQuoteStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertFreightShipmentSchema = createInsertSchema(freightShipmentsTable).omit({ id: true, shipmentNumber: true, createdAt: true });
export const insertFreightRfqSchema = createInsertSchema(freightRfqsTable).omit({ id: true, rfqNumber: true, createdAt: true });
export const insertFreightQuoteSchema = createInsertSchema(freightQuotesTable).omit({ id: true, createdAt: true });

export type FreightShipment = typeof freightShipmentsTable.$inferSelect;
export type FreightRfq = typeof freightRfqsTable.$inferSelect;
export type FreightQuote = typeof freightQuotesTable.$inferSelect;
