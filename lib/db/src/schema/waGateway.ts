import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const waAccounts = pgTable("wa_accounts", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: text("name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const waDevices = pgTable("wa_devices", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  name: text("name").notNull(),
  phoneNumber: text("phone_number"),
  status: text("status").notNull().default("disconnected"),
  webhookUrl: text("webhook_url"),
  sessionDir: text("session_dir").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const waApiKeys = pgTable("wa_api_keys", {
  id: serial("id").primaryKey(),
  accountId: integer("account_id").notNull(),
  deviceId: integer("device_id"),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull(),
  keyPrefix: text("key_prefix").notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const waMessages = pgTable("wa_messages", {
  id: serial("id").primaryKey(),
  deviceId: integer("device_id").notNull(),
  direction: text("direction").notNull(),
  toFrom: text("to_from").notNull(),
  messageType: text("message_type").notNull().default("text"),
  content: text("content"),
  status: text("status").default("pending"),
  waMessageId: text("wa_message_id"),
  error: text("error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
