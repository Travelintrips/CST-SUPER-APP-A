import { pgTable, serial, text, boolean, jsonb, timestamp } from "drizzle-orm/pg-core";

export const productTemplatesTable = pgTable("product_templates", {
  id: serial("id").primaryKey(),
  categoryKey: text("category_key").notNull().unique(),
  label: text("label").notNull(),
  version: text("version").notNull().default("1.0.0"),
  isActive: boolean("is_active").notNull().default(true),
  requiredDocuments: jsonb("required_documents").notNull().default([]),
  checklist: jsonb("checklist").notNull().default([]),
  customFields: jsonb("custom_fields").notNull().default([]),
  packagingInstructions: text("packaging_instructions").default(""),
  conditionalRules: jsonb("conditional_rules").notNull().default([]),
  validationRules: jsonb("validation_rules").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ProductTemplate = typeof productTemplatesTable.$inferSelect;
export type InsertProductTemplate = typeof productTemplatesTable.$inferInsert;
