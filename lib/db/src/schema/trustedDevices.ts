import { pgTable, serial, text, timestamp, index } from "drizzle-orm/pg-core";

export const trustedDevicesTable = pgTable(
  "trusted_devices",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    deviceToken: text("device_token").notNull().unique(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    phoneIdx: index("trusted_devices_phone_idx").on(t.phone),
    tokenIdx: index("trusted_devices_token_idx").on(t.deviceToken),
  })
);

export type TrustedDevice = typeof trustedDevicesTable.$inferSelect;
