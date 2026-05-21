import { pgTable, serial, text, timestamp, integer, boolean, index } from "drizzle-orm/pg-core";

export const waOtpCodesTable = pgTable(
  "wa_otp_codes",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    codeHash: text("code_hash").notNull(),
    purpose: text("purpose").notNull().default("register"),
    attempts: integer("attempts").notNull().default(0),
    verified: boolean("verified").notNull().default(false),
    verifyToken: text("verify_token"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => ({
    phoneIdx: index("wa_otp_phone_idx").on(t.phone),
    tokenIdx: index("wa_otp_token_idx").on(t.verifyToken),
  })
);

export type WaOtpCode = typeof waOtpCodesTable.$inferSelect;
