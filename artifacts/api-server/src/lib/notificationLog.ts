import { db } from "@workspace/db";
import { notificationLogsTable } from "@workspace/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { logger } from "./logger.js";

export interface LogNotifOptions {
  channel: "wa" | "email";
  recipient: string;
  subject?: string;
  message: string;
  status: "sent" | "failed" | "deduped";
  errorMsg?: string;
  context?: string;
  refType?: string;
  refId?: string;
}

export async function logNotification(opts: LogNotifOptions): Promise<void> {
  try {
    await db.insert(notificationLogsTable).values({
      channel: opts.channel,
      recipient: opts.recipient,
      subject: opts.subject ?? null,
      message: opts.message.slice(0, 2000),
      status: opts.status,
      errorMsg: opts.errorMsg ?? null,
      context: opts.context ?? "general",
      refType: opts.refType ?? null,
      refId: opts.refId ?? null,
    });
  } catch (err) {
    logger.error({ err }, "Failed to write notification log");
  }
}

/**
 * Check if a WA notification with the same context+refId was successfully sent
 * within the given time window (default 5 minutes).
 *
 * Returns true if a duplicate was found — caller should skip sending.
 * Only meaningful when both context AND refId are provided.
 */
export async function wasRecentlyNotified(
  context: string,
  refId: string,
  windowMs = 5 * 60 * 1000,
): Promise<boolean> {
  try {
    const since = new Date(Date.now() - windowMs);
    const rows = await db
      .select({ id: notificationLogsTable.id })
      .from(notificationLogsTable)
      .where(
        and(
          eq(notificationLogsTable.channel, "wa"),
          eq(notificationLogsTable.context, context),
          eq(notificationLogsTable.refId, refId),
          eq(notificationLogsTable.status, "sent"),
          gte(notificationLogsTable.createdAt, since),
        ),
      )
      .limit(1);
    return rows.length > 0;
  } catch (err) {
    // On DB error, allow sending (fail-open) to avoid blocking notifications
    logger.warn({ err, context, refId }, "wasRecentlyNotified DB check failed — allowing send");
    return false;
  }
}
