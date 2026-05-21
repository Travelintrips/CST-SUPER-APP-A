import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";

export const companiesTable = pgTable("companies", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyCode: text("company_code").notNull().unique(),
  logoUrl: text("logo_url"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  npwp: text("npwp"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  name: text("name").notNull().default(""),
  code: text("code").notNull().default(""),
  isHolding: boolean("is_holding").notNull().default(false),
  parentCompanyId: integer("parent_company_id"),
});

export type Company = typeof companiesTable.$inferSelect;
export type InsertCompany = typeof companiesTable.$inferInsert;
