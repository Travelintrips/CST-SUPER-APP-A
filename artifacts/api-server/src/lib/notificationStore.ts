import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { broadcastToAdmins } from "./sseManager.js";

export interface AdminNotifPayload {
  type: string;
  orderId?: number | null;
  orderNumber: string;
  customerName: string;
  companyName?: string | null;
  [key: string]: unknown;
}

export async function saveAndBroadcast(
  sseEvent: string,
  payload: AdminNotifPayload,
): Promise<void> {
  let dbId: number | null = null;
  let createdAt: string = new Date().toISOString();
  try {
    const result = await db.execute(sql`
      INSERT INTO admin_notifications (type, order_id, order_number, customer_name, company_name, payload)
      VALUES (
        ${payload.type},
        ${payload.orderId ?? null},
        ${payload.orderNumber},
        ${payload.customerName},
        ${payload.companyName ?? null},
        ${JSON.stringify(payload)}::jsonb
      )
      RETURNING id, created_at
    `);
    const row = result.rows[0] as { id: number; created_at: Date };
    dbId = row.id;
    createdAt = row.created_at.toISOString();
  } catch {
    // DB save failed — still broadcast
  }
  broadcastToAdmins(sseEvent, { ...payload, dbId, createdAt });
}
