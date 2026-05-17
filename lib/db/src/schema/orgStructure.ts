import { pgTable, serial, text, integer, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { companiesTable } from "./companies";

export const branchesTable = pgTable("branches", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  address: text("address"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("branches_company_idx").on(t.companyId),
]);

export const divisionsTable = pgTable("divisions", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("divisions_company_idx").on(t.companyId),
]);

export const departmentsTable = pgTable("departments", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }).notNull(),
  divisionId: integer("division_id").references(() => divisionsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("departments_company_idx").on(t.companyId),
  index("departments_division_idx").on(t.divisionId),
]);

export const sectionsTable = pgTable("sections", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }).notNull(),
  departmentId: integer("department_id").references(() => departmentsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  code: text("code"),
  description: text("description"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("sections_company_idx").on(t.companyId),
  index("sections_department_idx").on(t.departmentId),
]);

export const insertBranchSchema = createInsertSchema(branchesTable).omit({ id: true, createdAt: true });
export type InsertBranch = z.infer<typeof insertBranchSchema>;
export type Branch = typeof branchesTable.$inferSelect;

export const insertDivisionSchema = createInsertSchema(divisionsTable).omit({ id: true, createdAt: true });
export type InsertDivision = z.infer<typeof insertDivisionSchema>;
export type Division = typeof divisionsTable.$inferSelect;

export const insertDepartmentSchema = createInsertSchema(departmentsTable).omit({ id: true, createdAt: true });
export type InsertDepartment = z.infer<typeof insertDepartmentSchema>;
export type Department = typeof departmentsTable.$inferSelect;

export const insertSectionSchema = createInsertSchema(sectionsTable).omit({ id: true, createdAt: true });
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type Section = typeof sectionsTable.$inferSelect;
