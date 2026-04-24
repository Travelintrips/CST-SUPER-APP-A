import {
  pgTable,
  serial,
  text,
  integer,
  numeric,
  boolean,
  timestamp,
  pgEnum,
  jsonb,
  date,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql as drizzleSql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const accountTypeEnum = pgEnum("account_type", [
  "asset",
  "liability",
  "equity",
  "revenue",
  "expense",
]);

export const journalTypeEnum = pgEnum("journal_type", [
  "sales",
  "purchase",
  "bank",
  "cash",
  "general",
]);

export const taxKindEnum = pgEnum("tax_kind", ["sale", "purchase"]);

export const accountingEntryStatusEnum = pgEnum("accounting_entry_status", [
  "draft",
  "posted",
]);

export const accountingEntrySourceEnum = pgEnum("accounting_entry_source", [
  "manual",
  "sales_invoice",
  "purchase_bill",
  "sales_payment",
  "purchase_payment",
  "pos_sale",
  "ecommerce_order",
  "stock_received",
  "manual_payment",
]);

export const accountingPaymentTypeEnum = pgEnum("accounting_payment_type", [
  "inbound",
  "outbound",
]);

export const accountingPaymentStatusEnum = pgEnum("accounting_payment_status", [
  "posted",
  "voided",
]);

export const chartOfAccountsTable = pgTable("chart_of_accounts", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: accountTypeEnum("type").notNull(),
  parentId: integer("parent_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accountingJournalsTable = pgTable("accounting_journals", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  type: journalTypeEnum("type").notNull(),
  defaultDebitAccountId: integer("default_debit_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  defaultCreditAccountId: integer("default_credit_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accountingTaxesTable = pgTable("accounting_taxes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  rate: numeric("rate", { precision: 6, scale: 3 }).notNull(),
  kind: taxKindEnum("kind").notNull(),
  accountId: integer("account_id")
    .notNull()
    .references(() => chartOfAccountsTable.id, { onDelete: "restrict" }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const accountingEntriesTable = pgTable("accounting_entries", {
  id: serial("id").primaryKey(),
  entryNumber: text("entry_number").notNull().unique(),
  journalId: integer("journal_id")
    .notNull()
    .references(() => accountingJournalsTable.id, { onDelete: "restrict" }),
  date: date("date").notNull(),
  ref: text("ref"),
  description: text("description"),
  status: accountingEntryStatusEnum("status").notNull().default("posted"),
  source: accountingEntrySourceEnum("source").notNull().default("manual"),
  sourceId: integer("source_id"),
  totalDebit: numeric("total_debit", { precision: 14, scale: 2 }).notNull().default("0"),
  totalCredit: numeric("total_credit", { precision: 14, scale: 2 }).notNull().default("0"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => ({
  uniqAutoSource: uniqueIndex("accounting_entries_source_uniq")
    .on(t.source, t.sourceId)
    .where(drizzleSql`${t.source} <> 'manual' AND ${t.sourceId} IS NOT NULL`),
}));

export const accountingEntryLinesTable = pgTable("accounting_entry_lines", {
  id: serial("id").primaryKey(),
  entryId: integer("entry_id")
    .notNull()
    .references(() => accountingEntriesTable.id, { onDelete: "cascade" }),
  accountId: integer("account_id")
    .notNull()
    .references(() => chartOfAccountsTable.id, { onDelete: "restrict" }),
  description: text("description"),
  debit: numeric("debit", { precision: 14, scale: 2 }).notNull().default("0"),
  credit: numeric("credit", { precision: 14, scale: 2 }).notNull().default("0"),
});

// Singleton: id=1 always
export const accountingSettingsTable = pgTable("accounting_settings", {
  id: serial("id").primaryKey(),
  arAccountId: integer("ar_account_id").references(() => chartOfAccountsTable.id, {
    onDelete: "set null",
  }),
  apAccountId: integer("ap_account_id").references(() => chartOfAccountsTable.id, {
    onDelete: "set null",
  }),
  salesIncomeAccountId: integer("sales_income_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  purchaseExpenseAccountId: integer("purchase_expense_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  defaultBankAccountId: integer("default_bank_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  ppnOutputAccountId: integer("ppn_output_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  ppnInputAccountId: integer("ppn_input_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  salesJournalId: integer("sales_journal_id").references(
    () => accountingJournalsTable.id,
    { onDelete: "set null" },
  ),
  purchaseJournalId: integer("purchase_journal_id").references(
    () => accountingJournalsTable.id,
    { onDelete: "set null" },
  ),
  bankJournalId: integer("bank_journal_id").references(
    () => accountingJournalsTable.id,
    { onDelete: "set null" },
  ),
  cashJournalId: integer("cash_journal_id").references(
    () => accountingJournalsTable.id,
    { onDelete: "set null" },
  ),
  defaultSalesTaxId: integer("default_sales_tax_id").references(
    () => accountingTaxesTable.id,
    { onDelete: "set null" },
  ),
  defaultPurchaseTaxId: integer("default_purchase_tax_id").references(
    () => accountingTaxesTable.id,
    { onDelete: "set null" },
  ),
  defaultCashAccountId: integer("default_cash_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  inventoryAccountId: integer("inventory_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  cogsAccountId: integer("cogs_account_id").references(
    () => chartOfAccountsTable.id,
    { onDelete: "set null" },
  ),
  meta: jsonb("meta"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const accountingPaymentsTable = pgTable("accounting_payments", {
  id: serial("id").primaryKey(),
  paymentType: accountingPaymentTypeEnum("payment_type").notNull(),
  status: accountingPaymentStatusEnum("status").notNull().default("posted"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  journalId: integer("journal_id")
    .notNull()
    .references(() => accountingJournalsTable.id, { onDelete: "restrict" }),
  partnerName: text("partner_name"),
  date: date("date").notNull(),
  ref: text("ref"),
  memo: text("memo"),
  entryId: integer("entry_id").references(() => accountingEntriesTable.id, {
    onDelete: "set null",
  }),
  voidEntryId: integer("void_entry_id").references(() => accountingEntriesTable.id, {
    onDelete: "set null",
  }),
  sourceType: text("source_type"),
  sourceDocId: integer("source_doc_id"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertAccountSchema = createInsertSchema(chartOfAccountsTable).omit({
  id: true,
  createdAt: true,
});
export const insertJournalSchema = createInsertSchema(accountingJournalsTable).omit({
  id: true,
  createdAt: true,
});
export const insertTaxSchema = createInsertSchema(accountingTaxesTable).omit({
  id: true,
  createdAt: true,
});
export const insertEntrySchema = createInsertSchema(accountingEntriesTable).omit({
  id: true,
  createdAt: true,
  entryNumber: true,
  totalDebit: true,
  totalCredit: true,
});
export const insertEntryLineSchema = createInsertSchema(accountingEntryLinesTable).omit({
  id: true,
  entryId: true,
});

export type Account = typeof chartOfAccountsTable.$inferSelect;
export type AccountingJournal = typeof accountingJournalsTable.$inferSelect;
export type AccountingTax = typeof accountingTaxesTable.$inferSelect;
export type AccountingEntry = typeof accountingEntriesTable.$inferSelect;
export type AccountingEntryLine = typeof accountingEntryLinesTable.$inferSelect;
export type AccountingSettings = typeof accountingSettingsTable.$inferSelect;
export type AccountingPayment = typeof accountingPaymentsTable.$inferSelect;
export type InsertAccount = z.infer<typeof insertAccountSchema>;
export type InsertJournal = z.infer<typeof insertJournalSchema>;
export type InsertTax = z.infer<typeof insertTaxSchema>;
export type InsertEntry = z.infer<typeof insertEntrySchema>;
export type InsertEntryLine = z.infer<typeof insertEntryLineSchema>;
