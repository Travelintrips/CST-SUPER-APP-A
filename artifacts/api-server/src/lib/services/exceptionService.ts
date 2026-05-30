/**
 * exceptionService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Idempotent exception creator.
 *
 * Idempotency rule: jika ada exception dengan kombinasi
 *   refType + refId + exceptionType  DAN  status IN ('open', 'in_progress')
 * maka INSERT dilewati dan existing row dikembalikan.
 *
 * Enum values yang tersedia:
 *   order_rejected | vendor_reject_rfq | vendor_out_of_stock | price_changed |
 *   delivery_delayed | failed_delivery | customer_complaint | document_missing |
 *   payment_overdue | vendor_rejected | pod_pending_review
 *
 * Boot migration: runExceptionEnumMigration() menambah nilai enum baru ke
 * PostgreSQL jika belum ada. Dipanggil sekali saat server start.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { db, exceptionsTable } from "@workspace/db";
import { and, eq, inArray, sql } from "drizzle-orm";
import { logger } from "../logger.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ExceptionType =
  | "order_rejected"
  | "vendor_reject_rfq"
  | "vendor_out_of_stock"
  | "price_changed"
  | "delivery_delayed"
  | "failed_delivery"
  | "customer_complaint"
  | "document_missing"
  | "payment_overdue"
  | "vendor_rejected"
  | "pod_pending_review";

export type ExceptionSeverity = "low" | "medium" | "high" | "critical";

export interface CreateExceptionParams {
  companyId?: number | null;
  exceptionType: ExceptionType;
  severity?: ExceptionSeverity;
  title: string;
  description?: string | null;
  refType?: string | null;
  refId?: string | null;
  refNumber?: string | null;
  customerName?: string | null;
  supplierName?: string | null;
  createdBy?: string | null;
}

export interface CreateExceptionResult {
  ok: boolean;
  id?: number;
  skipped?: boolean;
  error?: string;
}

// ── Boot migration ────────────────────────────────────────────────────────────

/**
 * Tambahkan nilai enum baru ke PostgreSQL.
 * Idempotent — tidak throw jika nilai sudah ada.
 * Harus dipanggil sekali saat server start (dari index.ts atau app.ts).
 */
export async function runExceptionEnumMigration(): Promise<void> {
  try {
    // PostgreSQL: ALTER TYPE ... ADD VALUE IF NOT EXISTS
    // Tidak bisa dijalankan di dalam transaction di PG versi lama,
    // tapi db.execute() berjalan di autocommit sehingga aman.
    // Tambahkan enum values baru jika tipe exception_type ada di PostgreSQL.
    // Jika tidak ada (tabel menggunakan TEXT biasa), langkah ini dilewati secara aman.
    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exception_type')
        AND NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'exception_type' AND e.enumlabel = 'vendor_rejected'
        ) THEN
          ALTER TYPE exception_type ADD VALUE 'vendor_rejected';
        END IF;
      END $$;
    `);

    await db.execute(sql`
      DO $$
      BEGIN
        IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'exception_type')
        AND NOT EXISTS (
          SELECT 1 FROM pg_enum e
          JOIN pg_type t ON e.enumtypid = t.oid
          WHERE t.typname = 'exception_type' AND e.enumlabel = 'pod_pending_review'
        ) THEN
          ALTER TYPE exception_type ADD VALUE 'pod_pending_review';
        END IF;
      END $$;
    `);

    logger.debug("exceptionService: enum migration complete");
  } catch (err) {
    logger.warn({ err }, "exceptionService: enum migration failed — non-fatal");
  }
}

// ── Core ─────────────────────────────────────────────────────────────────────

/**
 * Insert exception secara idempotent.
 *
 * Jika kombinasi (refType, refId, exceptionType) sudah ada dengan status
 * 'open' atau 'in_progress', INSERT dilewati.
 *
 * Non-fatal: error tidak dilempar ke caller, di-log sebagai warning.
 */
export async function createExceptionIdempotent(
  params: CreateExceptionParams,
): Promise<CreateExceptionResult> {
  try {
    // Idempotency check — hanya jika refType + refId tersedia
    if (params.refType && params.refId) {
      const conditions = [
        eq(exceptionsTable.exceptionType, params.exceptionType as never),
        eq(exceptionsTable.refType, params.refType),
        eq(exceptionsTable.refId, params.refId),
        inArray(exceptionsTable.status, ["open", "in_progress"]),
      ];
      if (params.companyId != null) {
        conditions.push(eq(exceptionsTable.companyId, params.companyId));
      }

      const [existing] = await db
        .select({ id: exceptionsTable.id })
        .from(exceptionsTable)
        .where(and(...conditions))
        .limit(1);

      if (existing) {
        return { ok: true, id: existing.id, skipped: true };
      }
    }

    const [created] = await db
      .insert(exceptionsTable)
      .values({
        companyId: params.companyId ?? null,
        exceptionType: params.exceptionType as never,
        severity: params.severity ?? "medium",
        status: "open",
        title: params.title,
        description: params.description ?? null,
        refType: params.refType ?? null,
        refId: params.refId ?? null,
        refNumber: params.refNumber ?? null,
        customerName: params.customerName ?? null,
        supplierName: params.supplierName ?? null,
        createdBy: params.createdBy ?? "system",
      })
      .returning({ id: exceptionsTable.id });

    logger.info(
      {
        id: created?.id,
        exceptionType: params.exceptionType,
        refType: params.refType,
        refId: params.refId,
      },
      "exceptionService: exception created",
    );

    return { ok: true, id: created?.id, skipped: false };
  } catch (err) {
    logger.warn({ err, params }, "exceptionService: createExceptionIdempotent failed — non-fatal");
    return { ok: false, error: String(err) };
  }
}
