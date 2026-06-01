import { pgTable, serial, text, boolean, jsonb, timestamp, integer } from "drizzle-orm/pg-core";

export const serviceTemplatesTable = pgTable("service_templates", {
  id: serial("id").primaryKey(),
  serviceType: text("service_type").notNull().unique(),
  label: text("label").notNull(),
  emoji: text("emoji").notNull().default("📋"),
  version: text("version").notNull().default("1.0.0"),
  isActive: boolean("is_active").notNull().default(true),
  description: text("description"),
  sortOrder: integer("sort_order").notNull().default(0),
  fields: jsonb("fields").notNull().default([]),
  requiredDocuments: jsonb("required_documents").notNull().default([]),
  checklist: jsonb("checklist").notNull().default([]),
  conditionalRules: jsonb("conditional_rules").notNull().default([]),
  validationRules: jsonb("validation_rules").notNull().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export type ServiceTemplateRow = typeof serviceTemplatesTable.$inferSelect;
export type InsertServiceTemplateRow = typeof serviceTemplatesTable.$inferInsert;
