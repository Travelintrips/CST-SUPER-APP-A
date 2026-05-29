/**
 * WA Retry Worker — mencoba ulang pengiriman WA yang gagal.
 *
 * Berjalan setiap 5 menit sebagai background worker.
 * Retry hanya dilakukan untuk:
 *   - channel = 'wa'
 *   - status  = 'failed'
 *   - retryCount < MAX_RETRIES (3)
 *   - nextRetryAt IS NULL OR nextRetryAt <= NOW()
 *
 * Backoff eksponensial: 5 menit × 2^retryCount
 *   retry 1 → 5 menit, retry 2 → 10 menit, retry 3 → 20 menit
 *
 * Setelah retry ke-3 gagal, retryCount = 3 sehingga tidak akan diquery lagi.
 * Pada retry sukses, status diupdate ke 'sent'.
 */

import { db } from "@workspace/db";
import { notificationLogsTable } from "@workspace/db/schema";
import { and, eq, isNull, lte, lt, or, sql } from "drizzle-orm";
import { logger } from "./logger.js";

const FONNTE_TOKEN = process.env.FONNTE_TOKEN ?? "";
const FONNTE_URL   = "https://api.fonnte.com/send";

const MAX_RETRIES   = 3;
const INTERVAL_MS   = 5 * 60 * 1000;
const BACKOFF_BASE  = 5 * 60 * 1000;

/** Kirim ke Fonnte langsung (bypass dedup/logging) — worker mengelola log sendiri. */
async function fonnteRawSend(target: string, message: string): Promise<{ ok: boolean; errorMsg: string }> {
  if (!FONNTE_TOKEN) {
    return { ok: false, errorMsg: "FONNTE_TOKEN not configured" };
  }
  try {
    const res = await fetch(FONNTE_URL, {
      method: "POST",
      headers: {
        Authorization: FONNTE_TOKEN,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ target, message }).toString(),
    });
    const body = await res.json() as Record<string, unknown>;
    if (!res.ok) {
      return { ok: false, errorMsg: `HTTP ${res.status}` };
    }
    if (body.status === false || body.status === "false") {
      return { ok: false, errorMsg: String(body.reason ?? body.message ?? "Fonnte status:false") };
    }
    return { ok: true, errorMsg: "" };
  } catch (err) {
    return { ok: false, errorMsg: String(err) };
  }
}

async function runRetryTick(): Promise<void> {
  try {
    const now = new Date();

    const rows = await db
      .select({
        id:        notificationLogsTable.id,
        recipient: notificationLogsTable.recipient,
        message:   notificationLogsTable.message,
        retryCount: notificationLogsTable.retryCount,
        context:   notificationLogsTable.context,
        refId:     notificationLogsTable.refId,
      })
      .from(notificationLogsTable)
      .where(
        and(
          eq(notificationLogsTable.channel, "wa"),
          eq(notificationLogsTable.status, "failed"),
          lt(notificationLogsTable.retryCount, MAX_RETRIES),
          or(
            isNull(notificationLogsTable.nextRetryAt),
            lte(notificationLogsTable.nextRetryAt, now),
          ),
        ),
      )
      .limit(20);

    if (rows.length === 0) return;

    logger.info({ count: rows.length }, "[waRetryWorker] processing failed WA entries");

    for (const row of rows) {
      const { ok, errorMsg } = await fonnteRawSend(row.recipient, row.message);
      const newRetryCount = (row.retryCount ?? 0) + 1;

      if (ok) {
        await db
          .update(notificationLogsTable)
          .set({
            status:     "sent",
            retryCount: newRetryCount,
            nextRetryAt: null,
            errorMsg:   null,
          })
          .where(eq(notificationLogsTable.id, row.id));

        logger.info(
          { id: row.id, recipient: row.recipient, retryCount: newRetryCount, context: row.context, refId: row.refId },
          "[waRetryWorker] retry sukses",
        );
      } else {
        const backoffMs = BACKOFF_BASE * Math.pow(2, newRetryCount - 1);
        const nextRetry = newRetryCount < MAX_RETRIES ? new Date(Date.now() + backoffMs) : null;

        await db
          .update(notificationLogsTable)
          .set({
            retryCount:  newRetryCount,
            nextRetryAt: nextRetry,
            errorMsg:    `[retry ${newRetryCount}] ${errorMsg}`,
          })
          .where(eq(notificationLogsTable.id, row.id));

        logger.warn(
          { id: row.id, recipient: row.recipient, retryCount: newRetryCount, nextRetry, errorMsg },
          "[waRetryWorker] retry gagal",
        );
      }
    }
  } catch (err) {
    logger.error({ err }, "[waRetryWorker] tick error (non-fatal)");
  }
}

export function startWaRetryWorker(): void {
  logger.info(`[waRetryWorker] started — interval ${INTERVAL_MS / 1000}s, max retries ${MAX_RETRIES}`);
  // Delay awal 2 menit agar server sudah sepenuhnya siap sebelum retry pertama
  setTimeout(() => {
    void runRetryTick();
    setInterval(() => void runRetryTick(), INTERVAL_MS).unref();
  }, 2 * 60 * 1000).unref();
}
