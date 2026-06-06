import {
  pgTable, serial, text, integer, numeric, timestamp, date, index,
} from "drizzle-orm/pg-core";
import { chartOfAccountsTable } from "./accounting";

export const cashAdvancesTable = pgTable("cash_advances", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id"),
  advanceNumber: text("advance_number").notNull().unique(),
  type: text("type").notNull(), // 'kasbon' | 'talangan'
  partyName: text("party_name").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  remainingAmount: numeric("remaining_amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("bank"), // 'cash' | 'bank'
  date: date("date").notNull(),
  notes: text("notes"),
  status: text("status").notNull().default("active"), // 'active' | 'partial' | 'repaid'
  receivableAccountId: integer("receivable_account_id").references(
    () => chartOfAccountsTable.id, { onDelete: "set null" }
  ),
  cashBankAccountId: integer("cash_bank_account_id").references(
    () => chartOfAccountsTable.id, { onDelete: "set null" }
  ),
  vendorId: integer("vendor_id"),
  userId: text("user_id"),
  entryId: integer("entry_id"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("cash_advances_company_idx").on(t.companyId),
  index("cash_advances_type_idx").on(t.type),
  index("cash_advances_status_idx").on(t.status),
  index("cash_advances_date_idx").on(t.date),
]);

export const cashAdvanceRepaymentsTable = pgTable("cash_advance_repayments", {
  id: serial("id").primaryKey(),
  advanceId: integer("advance_id").notNull(),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  paymentMethod: text("payment_method").notNull().default("bank"),
  date: date("date").notNull(),
  notes: text("notes"),
  entryId: integer("entry_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CashAdvance = typeof cashAdvancesTable.$inferSelect;
export type CashAdvanceRepayment = typeof cashAdvanceRepaymentsTable.$inferSelect;
