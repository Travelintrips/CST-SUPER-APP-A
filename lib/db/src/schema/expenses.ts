import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  date,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chartOfAccountsTable, accountingTaxesTable } from "./accounting";

export const expenseCategoriesTable = pgTable("expense_categories", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  expenseAccountId: integer("expense_account_id").references(() => chartOfAccountsTable.id, { onDelete: "set null" }),
  payableAccountId: integer("payable_account_id").references(() => chartOfAccountsTable.id, { onDelete: "set null" }),
  requiresAttachment: boolean("requires_attachment").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const expensesTable = pgTable("expenses", {
  id: serial("id").primaryKey(),
  expenseNumber: text("expense_number").notNull().unique(),
  date: date("date").notNull(),
  vendorEmployee: text("vendor_employee"),
  expenseType: text("expense_type").notNull().default("vendor_bill"),
  salesDocId: integer("sales_doc_id"),
  shipmentId: integer("shipment_id"),
  categoryId: integer("category_id").references(() => expenseCategoriesTable.id, { onDelete: "set null" }),
  description: text("description"),
  qty: numeric("qty", { precision: 14, scale: 4 }).notNull().default("1"),
  unit: text("unit"),
  unitPrice: numeric("unit_price", { precision: 14, scale: 2 }).notNull().default("0"),
  subtotal: numeric("subtotal", { precision: 14, scale: 2 }).notNull().default("0"),
  taxRateId: integer("tax_rate_id").references(() => accountingTaxesTable.id, { onDelete: "set null" }),
  taxAmount: numeric("tax_amount", { precision: 14, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 14, scale: 2 }).notNull().default("0"),
  currency: text("currency").notNull().default("IDR"),
  status: text("status").notNull().default("draft"),
  notes: text("notes"),
  entryId: integer("entry_id"),
  expenseAccountId: integer("expense_account_id").references(() => chartOfAccountsTable.id, { onDelete: "set null" }),
  payableAccountId: integer("payable_account_id").references(() => chartOfAccountsTable.id, { onDelete: "set null" }),
  rejectionReason: text("rejection_reason"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const expenseAttachmentsTable = pgTable("expense_attachments", {
  id: serial("id").primaryKey(),
  expenseId: integer("expense_id").notNull(),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertExpenseCategorySchema = createInsertSchema(expenseCategoriesTable).omit({
  id: true,
  createdAt: true,
});
export const insertExpenseSchema = createInsertSchema(expensesTable).omit({
  id: true,
  expenseNumber: true,
  entryId: true,
  createdAt: true,
  updatedAt: true,
});

export type ExpenseCategory = typeof expenseCategoriesTable.$inferSelect;
export type Expense = typeof expensesTable.$inferSelect;
export type ExpenseAttachment = typeof expenseAttachmentsTable.$inferSelect;
export type InsertExpenseCategory = z.infer<typeof insertExpenseCategorySchema>;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
