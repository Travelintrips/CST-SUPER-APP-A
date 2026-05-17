import { pgTable, serial, integer, boolean, timestamp, text } from "drizzle-orm/pg-core";
import { posWarehousesTable } from "./posKasir";
import { warehousesTable } from "./inventory";

/**
 * Thai Tea Warehouse Links
 * Maps pos_warehouses (POS wh_stock) ↔ warehouses (ERP inventory_stock)
 * Digunakan saat receive goods dan POS deduction untuk sync kedua stock system.
 */
export const thaiTeaWarehouseLinksTable = pgTable("thai_tea_warehouse_links", {
  id: serial("id").primaryKey(),
  posWarehouseId: integer("pos_warehouse_id").notNull().references(() => posWarehousesTable.id, { onDelete: "cascade" }),
  erpWarehouseId: integer("erp_warehouse_id").notNull().references(() => warehousesTable.id, { onDelete: "cascade" }),
  isActive: boolean("is_active").notNull().default(true),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ThaiTeaWarehouseLink = typeof thaiTeaWarehouseLinksTable.$inferSelect;
