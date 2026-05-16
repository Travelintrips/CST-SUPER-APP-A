import { pgTable, serial, text, integer, numeric, boolean, timestamp, pgEnum } from "drizzle-orm/pg-core";

export const kasirStatusEnum = pgEnum("kasir_status", ["pending", "approved", "rejected"]);
export const posOrderStatusEnum = pgEnum("pos_order_status", ["open", "paid", "cancelled"]);
export const posPaymentMethodEnum = pgEnum("pos_payment_method", ["cash", "qris", "debit", "credit", "transfer"]);
export const posShiftStatusEnum = pgEnum("pos_shift_status", ["open", "closed"]);

export const posBranchesTable = pgTable("pos_branches", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address"),
  phone: text("phone"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posCashiersTable = pgTable("pos_cashiers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone"),
  status: kasirStatusEnum("status").notNull().default("pending"),
  branchId: integer("branch_id").references(() => posBranchesTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const posProductsTable = pgTable("pos_products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  price: numeric("price", { precision: 12, scale: 2 }).notNull().default("0"),
  category: text("category").notNull().default("minuman"),
  imageUrl: text("image_url"),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  stock: numeric("stock", { precision: 12, scale: 3 }),
  stockUnit: text("stock_unit").notNull().default("pcs"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posOrdersTable = pgTable("pos_orders", {
  id: serial("id").primaryKey(),
  orderNumber: text("order_number").notNull().unique(),
  cashierId: integer("cashier_id").notNull().references(() => posCashiersTable.id),
  branchId: integer("branch_id").references(() => posBranchesTable.id),
  status: posOrderStatusEnum("status").notNull().default("open"),
  paymentMethod: posPaymentMethodEnum("payment_method"),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull().default("0"),
  discount: numeric("discount", { precision: 12, scale: 2 }).notNull().default("0"),
  total: numeric("total", { precision: 12, scale: 2 }).notNull().default("0"),
  amountPaid: numeric("amount_paid", { precision: 12, scale: 2 }),
  change: numeric("change", { precision: 12, scale: 2 }),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  paidAt: timestamp("paid_at"),
});

export const posOrderItemsTable = pgTable("pos_order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").notNull().references(() => posOrdersTable.id, { onDelete: "cascade" }),
  productId: integer("product_id").notNull().references(() => posProductsTable.id),
  productName: text("product_name").notNull(),
  price: numeric("price", { precision: 12, scale: 2 }).notNull(),
  qty: integer("qty").notNull().default(1),
  subtotal: numeric("subtotal", { precision: 12, scale: 2 }).notNull(),
});

export const posStockItemsTable = pgTable("pos_stock_items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("pcs"),
  currentStock: numeric("current_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  minStock: numeric("min_stock", { precision: 12, scale: 3 }).notNull().default("0"),
  note: text("note"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const posStockAdjustmentsTable = pgTable("pos_stock_adjustments", {
  id: serial("id").primaryKey(),
  stockItemId: integer("stock_item_id").notNull().references(() => posStockItemsTable.id),
  cashierId: integer("cashier_id").references(() => posCashiersTable.id),
  delta: numeric("delta", { precision: 12, scale: 3 }).notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const posSettingsTable = pgTable("pos_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const posShiftsTable = pgTable("pos_shifts", {
  id: serial("id").primaryKey(),
  branchId: integer("branch_id").notNull().references(() => posBranchesTable.id),
  cashierId: integer("cashier_id").notNull().references(() => posCashiersTable.id),
  openedAt: timestamp("opened_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  openingCash: numeric("opening_cash", { precision: 12, scale: 2 }).notNull().default("0"),
  closingCash: numeric("closing_cash", { precision: 12, scale: 2 }),
  totalSales: numeric("total_sales", { precision: 12, scale: 2 }).notNull().default("0"),
  orderCount: integer("order_count").notNull().default(0),
  status: posShiftStatusEnum("status").notNull().default("open"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
