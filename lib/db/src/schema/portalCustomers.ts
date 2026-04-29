import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const portalCustomersTable = pgTable("portal_customers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  company: text("company"),
  role: text("role").notNull().default("customer"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const portalCustomerServicesTable = pgTable("portal_customer_services", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id").notNull(),
  serviceId: integer("service_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const portalContentTable = pgTable("portal_content", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertPortalCustomerSchema = createInsertSchema(portalCustomersTable).omit({ id: true, createdAt: true });
export type InsertPortalCustomer = z.infer<typeof insertPortalCustomerSchema>;
export type PortalCustomer = typeof portalCustomersTable.$inferSelect;
export type PortalContent = typeof portalContentTable.$inferSelect;
