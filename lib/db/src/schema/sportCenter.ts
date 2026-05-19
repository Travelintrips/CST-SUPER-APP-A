import { pgTable, serial, text, integer, numeric, timestamp, index } from "drizzle-orm/pg-core";

export const sportCenterBookingsTable = pgTable(
  "sport_center_bookings",
  {
    id: serial("id").primaryKey(),
    bookingCode: text("booking_code").notNull().unique(),
    facilityId: text("facility_id").notNull(),
    facilityName: text("facility_name").notNull(),
    customerName: text("customer_name").notNull(),
    customerPhone: text("customer_phone").notNull(),
    customerEmail: text("customer_email").notNull(),
    date: text("date").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    totalHours: numeric("total_hours", { precision: 5, scale: 1 }).notNull(),
    totalPrice: integer("total_price").notNull(),
    notes: text("notes"),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("sc_bookings_facility_date_idx").on(t.facilityId, t.date),
    index("sc_bookings_status_idx").on(t.status),
    index("sc_bookings_date_idx").on(t.date),
  ],
);

export type SportCenterBooking = typeof sportCenterBookingsTable.$inferSelect;
export type InsertSportCenterBooking = typeof sportCenterBookingsTable.$inferInsert;
