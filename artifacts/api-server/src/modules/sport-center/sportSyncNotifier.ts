/**
 * sportSyncNotifier.ts
 * Kirim notifikasi WhatsApp ke admin group jika sinkronisasi fasilitas Sport Center gagal
 * setelah semua retry habis.
 *
 * Dedup: Fonnte built-in DEDUP_WINDOW_MS (default 30 menit) via context + refId.
 * Aturan:
 *  - Error single fasilitas   → context="sport_sync_error" refId="facility_<id>"
 *  - Error bulk resync         → context="sport_sync_error" refId="bulk_resync"
 *  - Error delete fasilitas   → context="sport_sync_error" refId="delete_<id>"
 */

import { sendViaService } from "../../lib/waTransport.js";
import { getAdminGroupWa } from "../../lib/adminWa.js";
import { logger } from "../../lib/logger.js";

const PREFIX = "[SportSyncNotifier]";

export interface SyncErrorEntry {
  facilityId: number | null;
  facilityName: string;
  action: "upsert" | "delete" | "resync";
  error: string;
}

function fmtNow(): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    timeZone: "Asia/Jakarta",
  }).format(new Date());
}

function buildMessage(errors: SyncErrorEntry[]): string {
  const ts = fmtNow();
  const isBulk = errors.length > 1 || errors.some(e => e.action === "resync");

  if (isBulk) {
    const lines = errors
      .map(e => `❌ ${e.facilityName}${e.facilityId ? ` (ID: ${e.facilityId})` : ""}: ${e.error}`)
      .join("\n");
    return (
      `🚨 *Sport Center Sync Error*\n\n` +
      `Waktu: ${ts} WIB\n` +
      `Aksi: resync semua fasilitas\n` +
      `Total gagal: ${errors.length} fasilitas\n\n` +
      `${lines}\n\n` +
      `Cek riwayat di BizPortal → Sport Center → Dashboard.`
    );
  }

  const e = errors[0]!;
  const aksiLabel = e.action === "delete" ? "hapus (soft-delete)" : "upsert";
  return (
    `🚨 *Sport Center Sync Error*\n\n` +
    `Waktu: ${ts} WIB\n` +
    `Aksi: ${aksiLabel} fasilitas\n` +
    `Fasilitas: ${e.facilityName}${e.facilityId ? ` (ID: ${e.facilityId})` : ""}\n\n` +
    `❌ Error: ${e.error}\n\n` +
    `Cek riwayat di BizPortal → Sport Center → Dashboard.`
  );
}

/**
 * Kirim WA error sync ke admin group.
 * Non-blocking — panggil via `void notifySyncError(...)`.
 */
export async function notifySyncError(errors: SyncErrorEntry[]): Promise<void> {
  if (!errors.length) return;

  let adminGroup = "";
  try {
    adminGroup = await getAdminGroupWa();
  } catch (err) {
    logger.warn({ err }, `${PREFIX} gagal mengambil admin group WA`);
  }

  if (!adminGroup) {
    logger.warn(`${PREFIX} admin group WA tidak dikonfigurasi — notifikasi sync error dilewati`);
    return;
  }

  const message = buildMessage(errors);

  // dedup key: bulk pakai "bulk_resync", single pakai action_facilityId
  const isBulk = errors.length > 1 || errors[0]?.action === "resync";
  const firstId = errors[0]?.facilityId;
  const firstAction = errors[0]?.action ?? "upsert";
  const refId = isBulk
    ? "bulk_resync"
    : `${firstAction}_${firstId ?? "unknown"}`;

  try {
    await sendViaService(adminGroup, message, {
      context: "sport_sync_error",
      refType: "sport_sync",
      refId,
    });
    logger.info({ refId, facilityCount: errors.length }, `${PREFIX} notifikasi WA terkirim`);
  } catch (err) {
    logger.error({ err, refId }, `${PREFIX} gagal mengirim notifikasi WA`);
  }
}
