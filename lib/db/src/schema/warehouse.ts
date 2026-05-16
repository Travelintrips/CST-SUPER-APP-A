import {
  pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum, uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { posBranchesTable, posWarehousesTable, posRacksTable } from "./posKasir";
import { purchaseDocumentsTable } from "./purchaseDocuments";
import { salesDocumentsTable } from "./salesDocuments";

// ── ENUMS ─────────────────────────────────────────────────────────────────────

export const whMovementTypeEnum = pgEnum("wh_movement_type", [
  "po_receipt",       // masuk dari Purchase Order
  "so_delivery",      // keluar ke Sales Order
  "pos_sale",         // keluar dari POS
  "transfer_in",      // masuk dari transfer
  "transfer_out",     // keluar ke transfer
  "opname_adjust",    // koreksi stok opname
  "damage",           // barang rusak/hilang
  "return_in",        // retur masuk (purchase return atau sales return in)
  "return_out",       // retur keluar
  "manual_in",        // masuk manual
  "manual_out",       // keluar manual
]);

export const whTransferStatusEnum = pgEnum("wh_transfer_status", [
  "draft",
  "in_transit",
  "received",
  "cancelled",
]);

export const whDamageStatusEnum = pgEnum("wh_damage_status", [
  "draft",
  "confirmed",
  "cancelled",
]);

export const whReturnTypeEnum = pgEnum("wh_return_type", [
  "purchase",  // retur ke supplier
  "sales",     // retur dari customer
]);

export const whReturnStatusEnum = pgEnum("wh_return_status", [
  "draft",
  "confirmed",
  "cancelled",
]);

export const whDamageTypeEnum = pgEnum("wh_damage_type", [
  "rusak",
  "hilang",
  "expired",
  "lainnya",
]);

// ── WH_STOCK — stok per produk per gudang ─────────────────────────────────────

export const whStockTable = pgTable("wh_stock", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").notNull().references(() => posWarehousesTable.id, { onDelete: "cascade" }),
  rackId: integer("rack_id").references(() => posRacksTable.id, { onDelete: "set null" }),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("0"),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }).notNull().default("0"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  uniqueIndex("wh_stock_product_warehouse_rack_idx").on(t.productId, t.warehouseId, t.rackId),
]);

// ── WH_MOVEMENTS — ledger universal semua pergerakan stok ─────────────────────

export const whMovementsTable = pgTable("wh_movements", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  warehouseId: integer("warehouse_id").notNull().references(() => posWarehousesTable.id),
  rackId: integer("rack_id").references(() => posRacksTable.id),
  type: whMovementTypeEnum("type").notNull(),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull(),
  qtyBefore: numeric("qty_before", { precision: 14, scale: 3 }).notNull().default("0"),
  qtyAfter: numeric("qty_after", { precision: 14, scale: 3 }).notNull().default("0"),
  costPrice: numeric("cost_price", { precision: 14, scale: 2 }).notNull().default("0"),
  refType: text("ref_type"),   // "purchase_document" | "sales_document" | "wh_transfer" | "wh_damage" | "wh_return"
  refId: integer("ref_id"),
  note: text("note"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── WH_TRANSFERS — transfer stok antar gudang ─────────────────────────────────

export const whTransfersTable = pgTable("wh_transfers", {
  id: serial("id").primaryKey(),
  transferNumber: text("transfer_number").notNull().unique(),
  fromWarehouseId: integer("from_warehouse_id").notNull().references(() => posWarehousesTable.id),
  toWarehouseId: integer("to_warehouse_id").notNull().references(() => posWarehousesTable.id),
  status: whTransferStatusEnum("status").notNull().default("draft"),
  note: text("note"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  sentAt: timestamp("sent_at"),
  receivedAt: timestamp("received_at"),
  cancelledAt: timestamp("cancelled_at"),
});

export const whTransferLinesTable = pgTable("wh_transfer_lines", {
  id: serial("id").primaryKey(),
  transferId: integer("transfer_id").notNull().references(() => whTransfersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  fromRackId: integer("from_rack_id").references(() => posRacksTable.id),
  toRackId: integer("to_rack_id").references(() => posRacksTable.id),
  qtyRequested: numeric("qty_requested", { precision: 14, scale: 3 }).notNull().default("0"),
  qtySent: numeric("qty_sent", { precision: 14, scale: 3 }).notNull().default("0"),
  qtyReceived: numeric("qty_received", { precision: 14, scale: 3 }).notNull().default("0"),
});

// ── WH_DAMAGE_REPORTS — barang rusak / hilang ─────────────────────────────────

export const whDamageReportsTable = pgTable("wh_damage_reports", {
  id: serial("id").primaryKey(),
  reportNumber: text("report_number").notNull().unique(),
  warehouseId: integer("warehouse_id").notNull().references(() => posWarehousesTable.id),
  status: whDamageStatusEnum("status").notNull().default("draft"),
  note: text("note"),
  createdById: text("created_by_id"),
  confirmedById: text("confirmed_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
});

export const whDamageLinesTable = pgTable("wh_damage_lines", {
  id: serial("id").primaryKey(),
  reportId: integer("report_id").notNull().references(() => whDamageReportsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  rackId: integer("rack_id").references(() => posRacksTable.id),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("0"),
  damageType: whDamageTypeEnum("damage_type").notNull().default("rusak"),
  note: text("note"),
});

// ── WH_RETURNS — retur purchase dan sales ────────────────────────────────────

export const whReturnsTable = pgTable("wh_returns", {
  id: serial("id").primaryKey(),
  returnNumber: text("return_number").notNull().unique(),
  type: whReturnTypeEnum("type").notNull(),
  refDocId: integer("ref_doc_id"),
  refDocNumber: text("ref_doc_number"),
  warehouseId: integer("warehouse_id").notNull().references(() => posWarehousesTable.id),
  status: whReturnStatusEnum("status").notNull().default("draft"),
  note: text("note"),
  createdById: text("created_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
  cancelledAt: timestamp("cancelled_at"),
});

export const whReturnLinesTable = pgTable("wh_return_lines", {
  id: serial("id").primaryKey(),
  returnId: integer("return_id").notNull().references(() => whReturnsTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  rackId: integer("rack_id").references(() => posRacksTable.id),
  qty: numeric("qty", { precision: 14, scale: 3 }).notNull().default("0"),
  unitCost: numeric("unit_cost", { precision: 14, scale: 2 }).notNull().default("0"),
  note: text("note"),
});

// ── PRODUCT_RECIPES — BOM/Recipe untuk produk racikan ────────────────────────

export const productRecipesTable = pgTable("product_recipes", {
  id: serial("id").primaryKey(),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }).unique(),
  yieldQty: numeric("yield_qty", { precision: 12, scale: 3 }).notNull().default("1"),
  yieldUnit: text("yield_unit").notNull().default("pcs"),
  note: text("note"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productRecipeItemsTable = pgTable("product_recipe_items", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id").notNull().references(() => productRecipesTable.id, { onDelete: "cascade" }),
  ingredientProductId: integer("ingredient_product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  qty: numeric("qty", { precision: 12, scale: 3 }).notNull().default("0"),
  unit: text("unit").notNull().default("pcs"),
  note: text("note"),
});

// ── WH_OPNAMES — stock taking ────────────────────────────────────────────────

export const whOpnamesTable = pgTable("wh_opnames", {
  id: serial("id").primaryKey(),
  opnameNumber: text("opname_number").notNull().unique(),
  warehouseId: integer("warehouse_id").notNull().references(() => posWarehousesTable.id),
  status: text("status").notNull().default("draft"),
  note: text("note"),
  createdById: text("created_by_id"),
  confirmedById: text("confirmed_by_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
});

export const whOpnameLinesTable = pgTable("wh_opname_lines", {
  id: serial("id").primaryKey(),
  opnameId: integer("opname_id").notNull().references(() => whOpnamesTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => productsTable.id, { onDelete: "cascade" }),
  rackId: integer("rack_id").references(() => posRacksTable.id),
  systemQty: numeric("system_qty", { precision: 14, scale: 3 }).notNull().default("0"),
  actualQty: numeric("actual_qty", { precision: 14, scale: 3 }).notNull().default("0"),
  diffQty: numeric("diff_qty", { precision: 14, scale: 3 }).notNull().default("0"),
  note: text("note"),
});

// ── ZOD SCHEMAS ───────────────────────────────────────────────────────────────

export const insertWhStockSchema = createInsertSchema(whStockTable).omit({ id: true, updatedAt: true });
export const insertWhMovementSchema = createInsertSchema(whMovementsTable).omit({ id: true, createdAt: true });
export const insertWhTransferSchema = createInsertSchema(whTransfersTable).omit({ id: true, createdAt: true, transferNumber: true });
export const insertWhTransferLineSchema = createInsertSchema(whTransferLinesTable).omit({ id: true });
export const insertWhDamageReportSchema = createInsertSchema(whDamageReportsTable).omit({ id: true, createdAt: true, reportNumber: true });
export const insertWhDamageLineSchema = createInsertSchema(whDamageLinesTable).omit({ id: true });
export const insertWhReturnSchema = createInsertSchema(whReturnsTable).omit({ id: true, createdAt: true, returnNumber: true });
export const insertWhReturnLineSchema = createInsertSchema(whReturnLinesTable).omit({ id: true });
export const insertProductRecipeSchema = createInsertSchema(productRecipesTable).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProductRecipeItemSchema = createInsertSchema(productRecipeItemsTable).omit({ id: true });
export const insertWhOpnameSchema = createInsertSchema(whOpnamesTable).omit({ id: true, createdAt: true, opnameNumber: true });
export const insertWhOpnameLineSchema = createInsertSchema(whOpnameLinesTable).omit({ id: true });

export type WhStock = typeof whStockTable.$inferSelect;
export type WhMovement = typeof whMovementsTable.$inferSelect;
export type WhTransfer = typeof whTransfersTable.$inferSelect;
export type WhTransferLine = typeof whTransferLinesTable.$inferSelect;
export type WhDamageReport = typeof whDamageReportsTable.$inferSelect;
export type WhDamageLine = typeof whDamageLinesTable.$inferSelect;
export type WhReturn = typeof whReturnsTable.$inferSelect;
export type WhReturnLine = typeof whReturnLinesTable.$inferSelect;
export type ProductRecipe = typeof productRecipesTable.$inferSelect;
export type ProductRecipeItem = typeof productRecipeItemsTable.$inferSelect;
export type WhOpname = typeof whOpnamesTable.$inferSelect;
export type WhOpnameLine = typeof whOpnameLinesTable.$inferSelect;
