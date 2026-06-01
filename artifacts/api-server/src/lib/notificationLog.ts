import { db } from "@workspace/db";
import { notificationLogsTable } from "@workspace/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { createHash } from "crypto";
import { logger } from "./logger.js";

/** Window in ms yang dipakai untuk bucket dedup_key (harus cocok dengan WA_DEDUP_WINDOW_MS). */
const DEDUP_WINDOW_MS = parseInt(process.env.WA_DEDUP_WINDOW_MS ?? "1800000", 10);

/**
 * Hitung dedup_key untuk log entry status 'sent'.
 * Key berbeda tiap DEDUP_WINDOW_MS bucket sehingga resend setelah window tetap diperbolehkan.
 * Mengembalikan null jika context atau refId tidak disediakan (tidak bisa didedup secara bermakna).
 */
function computeDedupKey(
  channel: string,
  recipient: string,
  context: string,
  refId: string,
): string {
  const bucket = Math.floor(Date.now() / DEDUP_WINDOW_MS);
  return createHash("sha256")
    .update(`${channel}:${recipient}:${context}:${refId}:${bucket}`)
    .digest("hex");
}

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
  mediaUrl?: string;
}

export async function logNotification(opts: LogNotifOptions): Promise<void> {
  // dedup_key hanya di-set untuk status 'sent' dengan context+refId lengkap.
  // Status 'failed'/'deduped' pakai NULL agar retry tidak terkena unique constraint.
  const dedupKey =
    opts.status === "sent" && opts.context && opts.refId
      ? computeDedupKey(opts.channel, opts.recipient, opts.context, opts.refId)
      : null;

  try {
    await db
      .insert(notificationLogsTable)
      .values({
        channel: opts.channel,
        recipient: opts.recipient,
        subject: opts.subject ?? null,
        message: opts.message.slice(0, 2000),
        status: opts.status,
        errorMsg: opts.errorMsg ?? null,
        context: opts.context ?? "general",
        refType: opts.refType ?? null,
        refId: opts.refId ?? null,
        mediaUrl: opts.mediaUrl ?? null,
        dedupKey,
      })
      // Jika dedup_key sudah ada (concurrent duplicate lolos in-memory check), abaikan insert
      .onConflictDoNothing({ target: notificationLogsTable.dedupKey });
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
