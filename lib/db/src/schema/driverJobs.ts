import { pgTable, serial, integer, text, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { driversTable } from "./drivers";
import { freightShipmentsTable } from "./freightShipments";

export const driverJobStatusEnum = pgEnum("driver_job_status", [
  "ASSIGNED",
  "ACCEPTED",
  "ON_THE_WAY_TO_PICKUP",
  "ARRIVED_AT_PICKUP",
  "PICKED_UP",
  "IN_TRANSIT",
  "ARRIVED_AT_DESTINATION",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
]);

export const driverJobsTable = pgTable("driver_jobs", {
  id: serial("id").primaryKey(),
  driverId: integer("driver_id")
    .notNull()
    .references(() => driversTable.id, { onDelete: "cascade" }),
  freightShipmentId: integer("freight_shipment_id").references(
    () => freightShipmentsTable.id,
    { onDelete: "set null" }
  ),
  jobNumber: text("job_number").notNull().unique(),
  customerName: text("customer_name"),
  pickupAddress: text("pickup_address"),
  deliveryAddress: text("delivery_address"),
  cargoDescription: text("cargo_description"),
  vehicleType: text("vehicle_type"),
  truckPlate: text("truck_plate"),
  pickupDateTime: timestamp("pickup_date_time"),
  deliveryDateTime: timestamp("delivery_date_time"),
  specialInstruction: text("special_instruction"),
  weight: text("weight"),
  distance: text("distance"),
  status: driverJobStatusEnum("status").default("ASSIGNED").notNull(),
  notes: text("notes"),
  podReceiverName: text("pod_receiver_name"),
  assignedAt: timestamp("assigned_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const driverJobLogsTable = pgTable("driver_job_logs", {
  id: serial("id").primaryKey(),
  driverJobId: integer("driver_job_id")
    .notNull()
    .references(() => driverJobsTable.id, { onDelete: "cascade" }),
  status: driverJobStatusEnum("status").notNull(),
  note: text("note"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const driverPhotosTable = pgTable("driver_photos", {
  id: serial("id").primaryKey(),
  driverJobId: integer("driver_job_id")
    .notNull()
    .references(() => driverJobsTable.id, { onDelete: "cascade" }),
  url: text("url").notNull(),
  photoType: text("photo_type").notNull().default("general"),
  takenAt: timestamp("taken_at").defaultNow().notNull(),
});

export type DriverJob = typeof driverJobsTable.$inferSelect;
export type DriverJobLog = typeof driverJobLogsTable.$inferSelect;
export type DriverPhoto = typeof driverPhotosTable.$inferSelect;
