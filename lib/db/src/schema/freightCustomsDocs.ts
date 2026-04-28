import { pgTable, serial, integer, text, date, jsonb, timestamp } from "drizzle-orm/pg-core";
import { freightShipmentsTable } from "./freightShipments";

export const freightCustomsDocsTable = pgTable("freight_customs_docs", {
  id: serial("id").primaryKey(),
  shipmentId: integer("shipment_id")
    .notNull()
    .references(() => freightShipmentsTable.id, { onDelete: "cascade" }),
  docType: text("doc_type").notNull(),
  nomorAju: text("nomor_aju"),
  nomorDokumen: text("nomor_dokumen"),
  tanggalDokumen: date("tanggal_dokumen"),
  data: jsonb("data").default({}).$type<Record<string, unknown>>(),
  scanSource: text("scan_source").default("manual"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type FreightCustomsDoc = typeof freightCustomsDocsTable.$inferSelect;
export type InsertFreightCustomsDoc = typeof freightCustomsDocsTable.$inferInsert;
