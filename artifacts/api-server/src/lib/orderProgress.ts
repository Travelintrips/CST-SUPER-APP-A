import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export const PROGRESS_STEPS = [
  { key: "NEW_ORDER",                   label: "Order Masuk"           },
  { key: "ADMIN_CONFIRMED",             label: "Dikonfirmasi Admin"    },
  { key: "SENT_TO_VENDOR",              label: "Dikirim ke Vendor"     },
  { key: "VENDOR_RESPONSE_RECEIVED",    label: "Vendor Merespon"       },
  { key: "PRICE_REVIEWED",              label: "Harga Disetujui"       },
  { key: "SENT_TO_CUSTOMER",            label: "Penawaran ke Customer" },
  { key: "CUSTOMER_APPROVED",           label: "Customer Setuju"       },
  { key: "SALES_ORDER_CREATED",         label: "Sales Order Dibuat"    },
  { key: "SENT_TO_VENDOR_FULFILLMENT",  label: "Fulfillment ke Vendor" },
  { key: "VENDOR_FULFILLMENT_CONFIRMED","label": "Vendor Konfirmasi"   },
  { key: "COMPLETED",                   label: "Selesai"               },
] as const;

export type StepKey = typeof PROGRESS_STEPS[number]["key"];
export type ProgressSource = "admin" | "customer_wa" | "vendor_wa" | "system";

export async function updateOrderProgress(
  orderId: number,
  stepKey: StepKey,
  source: ProgressSource,
  actorName: string,
  notes?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO order_progress_events
        (order_id, step_key, status, source, actor_name, notes, metadata)
      VALUES
        (${orderId}, ${stepKey}, 'completed', ${source}, ${actorName},
         ${notes ?? null}, ${metadata ? JSON.stringify(metadata) : null}::jsonb)
      ON CONFLICT (order_id, step_key) DO UPDATE
        SET status     = 'completed',
            actor_name = EXCLUDED.actor_name,
            notes      = COALESCE(EXCLUDED.notes, order_progress_events.notes),
            metadata   = COALESCE(EXCLUDED.metadata, order_progress_events.metadata),
            created_at = NOW()
    `);
  } catch (err) {
    logger.warn({ err, orderId, stepKey }, "updateOrderProgress: non-fatal insert failed");
  }
}

export async function getOrderProgressEvents(orderId: number): Promise<Array<{
  id: number;
  step_key: string;
  status: string;
  source: string;
  actor_name: string | null;
  notes: string | null;
  created_at: string;
}>> {
  try {
    const result = await db.execute(sql`
      SELECT id, step_key, status, source, actor_name, notes, created_at
      FROM order_progress_events
      WHERE order_id = ${orderId}
      ORDER BY created_at ASC
    `);
    return (result.rows ?? []) as any[];
  } catch {
    return [];
  }
}

export async function deleteOrderProgress(orderId: number, stepKey: StepKey): Promise<void> {
  try {
    await db.execute(sql`
      DELETE FROM order_progress_events
      WHERE order_id = ${orderId} AND step_key = ${stepKey}
    `);
  } catch (err) {
    logger.warn({ err, orderId, stepKey }, "deleteOrderProgress: non-fatal delete failed");
  }
}

export async function runOrderProgressMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS order_progress_events (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        step_key    TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'completed',
        source      TEXT NOT NULL DEFAULT 'admin',
        actor_name  TEXT,
        actor_phone TEXT,
        notes       TEXT,
        metadata    JSONB,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (order_id, step_key)
      );

      CREATE INDEX IF NOT EXISTS ope_order_idx ON order_progress_events(order_id);
      CREATE INDEX IF NOT EXISTS ope_step_idx  ON order_progress_events(order_id, step_key);
    `);
    logger.info("Order progress migration: ok");
  } catch (err) {
    logger.warn({ err }, "Order progress migration warn");
  }
}
