import { pgTable, serial, text, integer, numeric, timestamp, pgEnum, jsonb } from "drizzle-orm/pg-core";

export const paymentRefKindEnum = pgEnum("payment_ref_kind", ["sales", "purchase"]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "paid",
  "expired",
  "cancelled",
  "failed",
]);
export const paymentProviderEnum = pgEnum("payment_provider", ["paylabs"]);

export const paymentsTable = pgTable("payments", {
  id: serial("id").primaryKey(),
  refKind: paymentRefKindEnum("ref_kind").notNull(),
  refId: integer("ref_id").notNull(),
  refDocNumber: text("ref_doc_number").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  status: paymentStatusEnum("status").notNull().default("pending"),
  provider: paymentProviderEnum("provider").notNull().default("paylabs"),
  providerOrderId: text("provider_order_id"),
  providerMerchantTradeNo: text("provider_merchant_trade_no").notNull().unique(),
  paymentUrl: text("payment_url"),
  raw: jsonb("raw"),
  expiredAt: timestamp("expired_at"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Payment = typeof paymentsTable.$inferSelect;
