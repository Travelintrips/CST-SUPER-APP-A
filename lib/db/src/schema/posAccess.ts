import { pgTable, serial, integer, text, boolean, timestamp, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companiesTable } from "./companies";
import { posBranchesTable, posRoleEnum } from "./posKasir";

export const posRolesTable = pgTable("pos_roles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").references(() => companiesTable.id, { onDelete: "cascade" }),
  name: posRoleEnum("name").notNull(),
  displayName: text("display_name").notNull(),
  permissions: jsonb("permissions").notNull().default([]),
  isSystemRole: boolean("is_system_role").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("pos_roles_company_idx").on(t.companyId),
  uniqueIndex("pos_roles_company_name_unique").on(t.companyId, t.name),
]);

export const userBranchAccessTable = pgTable("user_branch_access", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => companiesTable.id, { onDelete: "cascade" }),
  cashierId: integer("cashier_id"),
  userId: text("user_id"),
  branchId: integer("branch_id").notNull().references(() => posBranchesTable.id, { onDelete: "cascade" }),
  posRole: posRoleEnum("pos_role").notNull().default("kasir"),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("uba_company_idx").on(t.companyId),
  index("uba_cashier_idx").on(t.cashierId),
  index("uba_user_idx").on(t.userId),
  index("uba_branch_idx").on(t.branchId),
]);

export type PosRole = typeof posRolesTable.$inferSelect;
export type UserBranchAccess = typeof userBranchAccessTable.$inferSelect;
