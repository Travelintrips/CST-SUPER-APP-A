import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

export const waTemplateConfigsTable = pgTable(
  "whatsapp_template_configs",
  {
    id: serial("id").primaryKey(),
    recipient: text("recipient").notNull(),
    workflow: text("workflow").notNull(),
    body: text("body").notNull().default(""),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("uq_wa_tpl_cfg").on(t.recipient, t.workflow)],
);
