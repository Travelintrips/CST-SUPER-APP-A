import { pgTable, serial, integer, text, boolean, timestamp, jsonb, numeric } from "drizzle-orm/pg-core";
import { suppliersTable } from "./suppliers";

export const vendorMiniFormLinksTable = pgTable("vendor_mini_form_links", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  serviceType: text("service_type").notNull(),
  title: text("title"),
  notes: text("notes"),
  expiresAt: timestamp("expires_at"),
  isActive: boolean("is_active").notNull().default(true),
  shortUrl: text("short_url"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  // Order-based mode columns
  mode: text("mode").notNull().default("rate_collection"),
  orderId: integer("order_id"),
  orderNumber: text("order_number"),
  orderItemId: integer("order_item_id"),
  itemStatus: text("item_status").default("waiting_vendor"),
  phase: text("phase").default("quotation"),
  vendorName: text("vendor_name"),
});

export const vendorMiniFormSubmissionsTable = pgTable("vendor_mini_form_submissions", {
  id: serial("id").primaryKey(),
  linkId: integer("link_id").references(() => vendorMiniFormLinksTable.id, { onDelete: "set null" }),
  token: text("token").notNull(),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  serviceType: text("service_type").notNull(),
  vendorName: text("vendor_name"),
  contactPerson: text("contact_person"),
  contactPhone: text("contact_phone"),
  formData: jsonb("form_data").notNull().default({}),
  staffData: jsonb("staff_data").notNull().default({}),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  // Order-based fields
  responseStatus: text("response_status").default("submitted"),
  vendorPrice: numeric("vendor_price", { precision: 14, scale: 2 }),
  currency: text("currency").default("IDR"),
  eta: text("eta"),
  validUntil: text("valid_until"),
  attachmentUrl: text("attachment_url"),
  orderId: integer("order_id"),
  orderItemId: integer("order_item_id"),
  selectedByAdmin: boolean("selected_by_admin").default(false),
  selectedAt: timestamp("selected_at"),
});

export const customerApprovalsTable = pgTable("customer_approvals", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  orderId: integer("order_id"),
  orderNumber: text("order_number"),
  customerName: text("customer_name"),
  customerPhone: text("customer_phone"),
  customerEmail: text("customer_email"),
  offerSummary: jsonb("offer_summary").default({}),
  sellingPrice: numeric("selling_price", { precision: 14, scale: 2 }),
  currency: text("currency").default("IDR"),
  termsNotes: text("terms_notes"),
  status: text("status").notNull().default("pending"),
  approvedAt: timestamp("approved_at"),
  rejectedAt: timestamp("rejected_at"),
  notes: text("notes"),
  soId: integer("so_id"),
  soNumber: text("so_number"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: text("created_by"),
  expiresAt: timestamp("expires_at"),
});

export const vendorOperationalConfirmationsTable = pgTable("vendor_operational_confirmations", {
  id: serial("id").primaryKey(),
  token: text("token").notNull().unique(),
  orderId: integer("order_id"),
  orderNumber: text("order_number"),
  orderItemId: integer("order_item_id"),
  supplierId: integer("supplier_id").references(() => suppliersTable.id, { onDelete: "set null" }),
  vendorName: text("vendor_name"),
  serviceType: text("service_type").notNull(),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at"),
  instruction: text("instruction"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VendorMiniFormLink = typeof vendorMiniFormLinksTable.$inferSelect;
export type InsertVendorMiniFormLink = typeof vendorMiniFormLinksTable.$inferInsert;
export type VendorMiniFormSubmission = typeof vendorMiniFormSubmissionsTable.$inferSelect;
export type InsertVendorMiniFormSubmission = typeof vendorMiniFormSubmissionsTable.$inferInsert;
export type CustomerApproval = typeof customerApprovalsTable.$inferSelect;
export type InsertCustomerApproval = typeof customerApprovalsTable.$inferInsert;
export type VendorOperationalConfirmation = typeof vendorOperationalConfirmationsTable.$inferSelect;
export type InsertVendorOperationalConfirmation = typeof vendorOperationalConfirmationsTable.$inferInsert;
