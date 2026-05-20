import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export interface LogActivityOptions {
  rfqId?: number | null;
  orderId?: number | null;
  actorType?: string;
  actorId?: string | null;
  actorName?: string | null;
  action: string;
  description?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  ipAddress?: string | null;
}

export async function logActivity(opts: LogActivityOptions): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO activity_logs (rfq_id, order_id, actor_type, actor_id, actor_name, action, description, old_value, new_value, ip_address)
      VALUES (
        ${opts.rfqId ?? null},
        ${opts.orderId ?? null},
        ${opts.actorType ?? "admin"},
        ${opts.actorId ?? null},
        ${opts.actorName ?? null},
        ${opts.action},
        ${opts.description ?? null},
        ${opts.oldValue != null ? JSON.stringify(opts.oldValue) : null}::jsonb,
        ${opts.newValue != null ? JSON.stringify(opts.newValue) : null}::jsonb,
        ${opts.ipAddress ?? null}
      )
    `);
  } catch (err) {
    logger.warn({ err, action: opts.action }, "logActivity failed — non-fatal");
  }
}

export async function getActivityLogs(orderId?: number, rfqId?: number, limit = 50): Promise<unknown[]> {
  try {
    let result;
    if (orderId && rfqId) {
      result = await db.execute(sql`
        SELECT * FROM activity_logs WHERE order_id = ${orderId} OR rfq_id = ${rfqId}
        ORDER BY created_at DESC LIMIT ${limit}
      `);
    } else if (orderId) {
      result = await db.execute(sql`
        SELECT * FROM activity_logs WHERE order_id = ${orderId}
        ORDER BY created_at DESC LIMIT ${limit}
      `);
    } else if (rfqId) {
      result = await db.execute(sql`
        SELECT * FROM activity_logs WHERE rfq_id = ${rfqId}
        ORDER BY created_at DESC LIMIT ${limit}
      `);
    } else {
      result = await db.execute(sql`
        SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT ${limit}
      `);
    }
    return result.rows as unknown[];
  } catch {
    return [];
  }
}
