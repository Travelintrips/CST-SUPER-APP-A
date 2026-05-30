/**
 * system.ts — Governance Health Endpoint
 *
 * GET /api/system/governance-health
 *   Admin-only. Tidak terekspos ke customer portal.
 *   Mengembalikan ringkasan status observability:
 *     - statistik exceptions (open/in_progress/resolved)
 *     - 20 transisi status terakhir dari order_status_history
 *     - jumlah invoice overdue
 *     - jumlah bill overdue
 *     - ringkasan status audit log per module
 */

import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { logger } from "../lib/logger.js";

const router = Router();
router.use(requireAdmin as any);

router.get("/governance-health", async (req, res) => {
  try {
    const [
      exceptionStats,
      recentTransitions,
      overdueInvoices,
      overdueBills,
      auditModuleSummary,
    ] = await Promise.all([
      // Exception stats
      db.execute(sql`
        SELECT
          COUNT(*)                                                   AS total,
          SUM(CASE WHEN status = 'open'        THEN 1 ELSE 0 END)  AS open,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END)  AS in_progress,
          SUM(CASE WHEN status = 'resolved'    THEN 1 ELSE 0 END)  AS resolved,
          SUM(CASE WHEN status = 'closed'      THEN 1 ELSE 0 END)  AS closed,
          SUM(CASE WHEN severity = 'critical'  THEN 1 ELSE 0 END)  AS critical,
          SUM(CASE WHEN severity = 'high'      THEN 1 ELSE 0 END)  AS high,
          SUM(CASE WHEN exception_type = 'delivery_delayed' AND status IN ('open','in_progress') THEN 1 ELSE 0 END) AS open_delivery_delayed,
          SUM(CASE WHEN exception_type = 'payment_overdue'  AND status IN ('open','in_progress') THEN 1 ELSE 0 END) AS open_payment_overdue,
          SUM(CASE WHEN exception_type = 'vendor_rejected'  AND status IN ('open','in_progress') THEN 1 ELSE 0 END) AS open_vendor_rejected
        FROM exceptions
      `),

      // Recent 20 status transitions from order_status_history
      db.execute(sql`
        SELECT
          id, order_id, order_number, old_status, new_status,
          changed_by_type, changed_by_name, source, created_at
        FROM order_status_history
        ORDER BY created_at DESC
        LIMIT 20
      `),

      // Overdue invoices count (unpaid/partial past due_date)
      db.execute(sql`
        SELECT COUNT(*) AS count
        FROM sales_documents
        WHERE invoice_status = 'invoiced'
          AND payment_status IN ('unpaid', 'partial', 'overdue')
          AND status != 'cancelled'
          AND due_date IS NOT NULL
          AND due_date < CURRENT_DATE::text
      `),

      // Overdue bills count
      db.execute(sql`
        SELECT COUNT(*) AS count
        FROM purchase_documents
        WHERE bill_status = 'billed'
          AND payment_status IN ('unpaid', 'partial', 'overdue')
          AND status != 'cancelled'
          AND due_date IS NOT NULL
          AND due_date < CURRENT_DATE::text
      `),

      // Audit log summary by module (last 24h)
      db.execute(sql`
        SELECT module, action, COUNT(*) AS count
        FROM erp_audit_logs
        WHERE created_at > NOW() - INTERVAL '24 hours'
          AND action = 'status_transition'
        GROUP BY module, action
        ORDER BY count DESC
        LIMIT 20
      `),
    ]);

    const exc = (exceptionStats.rows[0] ?? {}) as Record<string, unknown>;
    const inv = (overdueInvoices.rows[0] ?? { count: 0 }) as { count: unknown };
    const bil = (overdueBills.rows[0] ?? { count: 0 }) as { count: unknown };

    res.json({
      generatedAt: new Date().toISOString(),
      exceptions: {
        total:             Number(exc["total"]              ?? 0),
        open:              Number(exc["open"]               ?? 0),
        in_progress:       Number(exc["in_progress"]        ?? 0),
        resolved:          Number(exc["resolved"]           ?? 0),
        closed:            Number(exc["closed"]             ?? 0),
        critical:          Number(exc["critical"]           ?? 0),
        high:              Number(exc["high"]               ?? 0),
        openDeliveryDelayed: Number(exc["open_delivery_delayed"] ?? 0),
        openPaymentOverdue:  Number(exc["open_payment_overdue"]  ?? 0),
        openVendorRejected:  Number(exc["open_vendor_rejected"]  ?? 0),
      },
      overdue: {
        invoices: Number(inv["count"] ?? 0),
        bills:    Number(bil["count"] ?? 0),
      },
      recentStatusTransitions: recentTransitions.rows,
      auditLast24h: auditModuleSummary.rows,
    });
  } catch (err) {
    logger.error({ err }, "governance-health error");
    res.status(500).json({ error: "Gagal memuat governance health" });
  }
});

export { router as systemRouter };
