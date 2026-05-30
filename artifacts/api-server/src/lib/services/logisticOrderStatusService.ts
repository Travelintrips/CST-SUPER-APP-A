/**
 * logisticOrderStatusService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * SINGLE SOURCE OF TRUTH untuk perubahan logistic_orders.status.
 *
 * FASE 1 — Service layer tersedia. Route lama BELUM dimigrasikan.
 * FASE 2 — Route lama wajib call transitionLogisticOrderStatus() daripada
 *           update DB langsung.
 *
 * Aturan:
 *  - Semua transisi harus melewati LOGISTIC_ORDER_VALID_TRANSITIONS.
 *  - Idempotent: jika status sudah sama, return ok + alreadyAt: true.
 *  - Non-blocking: audit trail gagal tidak membatalkan transaksi.
 *  - Status dinormalisasi dari legacy values via normalizeStatus().
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db } from "@workspace/db";
import { logisticOrdersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { normalizeStatus } from "../logisticStatusConstants.js";
import { logOrderStatusChange } from "../auditTrail.js";
import { logger } from "../logger.js";

// ── State Machine ─────────────────────────────────────────────────────────────
//
// Setiap key = status saat ini.
// Value = daftar status yang DIIZINKAN sebagai tujuan transisi.
//
// Prinsip:
//  - Maju (forward) mengikuti urutan STATUS_RANK.
//  - Mundur satu langkah diizinkan untuk koreksi operasional.
//  - "Cancelled" selalu bisa dicapai dari status manapun kecuali terminal.
//  - "Completed" dan "Cancelled" adalah terminal — tidak ada keluar.
//
export const LOGISTIC_ORDER_VALID_TRANSITIONS: Record<string, string[]> = {
  "Order Received":    ["Admin Review", "Cancelled"],
  "Admin Review":      ["RFQ Sent", "Quote Received", "Customer Approval", "Cancelled"],
  "RFQ Sent":          ["Quote Received", "Admin Review", "Cancelled"],
  "Quote Received":    ["Customer Approval", "RFQ Sent", "Admin Review", "Cancelled"],
  "Customer Approval": ["Vendor Confirmed", "Admin Review", "Cancelled"],
  // Vendor Confirmed → Completed: untuk complete-order shortcut (tanpa lewat semua tahap)
  "Vendor Confirmed":  ["In Progress", "Customer Approval", "Cancelled", "Completed"],
  // In Progress → Completed: untuk complete-order & POD upload shortcut
  "In Progress":       ["Pickup", "Vendor Confirmed", "Cancelled", "Completed"],
  "Pickup":            ["In Transit", "In Progress", "Cancelled"],
  "In Transit":        ["Arrived", "Pickup", "Cancelled"],
  "Arrived":           ["Delivered", "In Transit", "Cancelled"],
  // Delivered → Completed: untuk POD upload shortcut (langsung selesai tanpa invoice)
  "Delivered":         ["POD Uploaded", "Arrived", "Cancelled", "Completed"],
  "POD Uploaded":      ["Invoice Issued", "Delivered", "Cancelled", "Completed"],
  "Invoice Issued":    ["Payment Received", "POD Uploaded", "Cancelled"],
  "Payment Received":  ["Completed", "Invoice Issued", "Cancelled"],
  "Completed":         [],
  "Cancelled":         [],
};

// ── Types ─────────────────────────────────────────────────────────────────────

export interface TransitionOptions {
  actorType?: string;
  actorId?: string | null;
  actorName?: string | null;
  ip?: string | null;
  source?: string;
  notes?: string | null;
  skipAudit?: boolean;
  /**
   * force=true bypassa LOGISTIC_ORDER_VALID_TRANSITIONS.
   * Hanya digunakan oleh admin super / script migrasi data.
   * Tidak boleh diekspos ke endpoint publik.
   */
  force?: boolean;
}

export interface TransitionResult {
  ok: boolean;
  orderId: number;
  orderNumber?: string | null;
  fromStatus?: string | null;
  toStatus?: string;
  /** true jika status sudah sama — operasi idempotent, tidak ada DB write */
  alreadyAt?: boolean;
  /** Daftar transisi valid dari status saat ini, untuk response API */
  allowedTransitions?: string[];
  error?: string;
}

// ── Core Function ─────────────────────────────────────────────────────────────

/**
 * Transisi status sebuah logistic order.
 *
 * @param orderId     - ID logistic_orders
 * @param rawNewStatus - Target status (boleh legacy value, akan dinormalisasi)
 * @param opts        - Actor info, source label, flags
 * @returns TransitionResult
 */
export async function transitionLogisticOrderStatus(
  orderId: number,
  rawNewStatus: string,
  opts: TransitionOptions = {},
): Promise<TransitionResult> {
  const newStatus = normalizeStatus(rawNewStatus);

  if (!(newStatus in LOGISTIC_ORDER_VALID_TRANSITIONS)) {
    return {
      ok: false,
      orderId,
      error: `Status "${rawNewStatus}" tidak dikenal atau belum didukung oleh state machine`,
    };
  }

  const [row] = await db
    .select({
      status: logisticOrdersTable.status,
      orderNumber: logisticOrdersTable.orderNumber,
    })
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, orderId));

  if (!row) {
    return { ok: false, orderId, error: `Order #${orderId} tidak ditemukan` };
  }

  const currentStatus = normalizeStatus(row.status);

  // Idempotency guard
  if (currentStatus === newStatus) {
    return {
      ok: true,
      orderId,
      orderNumber: row.orderNumber,
      fromStatus: currentStatus,
      toStatus: newStatus,
      alreadyAt: true,
    };
  }

  // State machine guard
  if (!opts.force) {
    const allowed = LOGISTIC_ORDER_VALID_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      return {
        ok: false,
        orderId,
        orderNumber: row.orderNumber,
        fromStatus: currentStatus,
        toStatus: newStatus,
        allowedTransitions: allowed,
        error: `Transisi "${currentStatus}" → "${newStatus}" tidak diizinkan. Transisi valid: ${
          allowed.length > 0 ? allowed.join(", ") : "(status terminal)"
        }`,
      };
    }
  }

  // Execute DB update
  await db
    .update(logisticOrdersTable)
    .set({
      status: newStatus,
      updatedAt: new Date(),
      version: sql`${logisticOrdersTable.version} + 1`,
    } as any)
    .where(eq(logisticOrdersTable.id, orderId));

  // Audit trail — non-fatal
  if (!opts.skipAudit) {
    logOrderStatusChange({
      orderId,
      orderNumber: row.orderNumber,
      oldStatus: row.status,
      newStatus,
      changedByType: opts.actorType ?? "system",
      changedById: opts.actorId ?? null,
      changedByName: opts.actorName ?? null,
      changedByIp: opts.ip ?? null,
      notes: opts.notes ?? null,
      source: opts.source ?? "logisticOrderStatusService",
    }).catch((e: unknown) =>
      logger.warn({ e, orderId, newStatus }, "logOrderStatusChange failed — non-fatal"),
    );
  }

  logger.info(
    { orderId, orderNumber: row.orderNumber, from: row.status, to: newStatus, source: opts.source ?? "service" },
    "logisticOrder status transitioned",
  );

  return {
    ok: true,
    orderId,
    orderNumber: row.orderNumber,
    fromStatus: row.status,
    toStatus: newStatus,
  };
}

// ── Convenience Helpers ───────────────────────────────────────────────────────

/** Ambil allowed transitions dari status saat ini (setelah normalisasi). */
export function getAllowedTransitions(currentRawStatus: string): string[] {
  const normalized = normalizeStatus(currentRawStatus);
  return LOGISTIC_ORDER_VALID_TRANSITIONS[normalized] ?? [];
}

/** Cek apakah sebuah transisi valid tanpa melakukan DB query. */
export function isTransitionAllowed(fromRaw: string, toRaw: string): boolean {
  const from = normalizeStatus(fromRaw);
  const to = normalizeStatus(toRaw);
  return (LOGISTIC_ORDER_VALID_TRANSITIONS[from] ?? []).includes(to);
}
