import { db } from "@workspace/db";
import { notificationLogsTable } from "@workspace/db/schema";
import { logger } from "./logger.js";

export interface LogNotifOptions {
  channel: "wa" | "email";
  recipient: string;
  subject?: string;
  message: string;
  status: "sent" | "failed";
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
