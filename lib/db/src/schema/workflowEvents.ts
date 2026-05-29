import { pgTable, serial, integer, text, jsonb, timestamp, index } from "drizzle-orm/pg-core";

export const workflowEventsTable = pgTable("workflow_events", {
  id: serial("id").primaryKey(),
  eventType: text("event_type").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: integer("entity_id").notNull(),
  companyId: integer("company_id"),
  payload: jsonb("payload").notNull().default({}),
  status: text("status").notNull().default("pending"),
  // pending | processing | completed | failed | dead
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  processAfter: timestamp("process_after", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("workflow_events_status_idx").on(t.status, t.processAfter),
  index("workflow_events_entity_idx").on(t.entityType, t.entityId),
]);

export type WorkflowEvent = typeof workflowEventsTable.$inferSelect;
export type InsertWorkflowEvent = typeof workflowEventsTable.$inferInsert;
