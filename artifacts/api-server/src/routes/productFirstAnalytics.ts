/**
 * productFirstAnalytics.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Analytics untuk product-first logistic orders.
 *
 * Mounted at: /api/logistic/product-first/analytics
 *
 * GET /summary          — total count per status + tren periode
 * GET /vendor-response  — avg waktu vendor produk respon (RFQ Sent → Quote Received)
 * GET /shipment-conversion — % order yang lanjut ke shipment selection vs. selesai
 * GET /mode-ratio       — pickup_self vs trucking count & %
 * GET /margin           — margin produk vs margin pengiriman (dari profitability data)
 * GET /all              — semua metric dalam satu response (untuk dashboard)
 */

import { Router } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();
router.use(requireAdmin);

// ── Helpers ───────────────────────────────────────────────────────────────────
function parseDateRange(query: Record<string, unknown>): { dateFrom: string | null; dateTo: string | null } {
  const dateFrom = query.dateFrom ? String(query.dateFrom) : null;
  const dateTo = query.dateTo ? String(query.dateTo) : null;
  return { dateFrom, dateTo };
}

function dateFilter(alias: string, dateFrom: string | null, dateTo: string | null): string {
  const parts: string[] = [];
  if (dateFrom) parts.push(`${alias}.created_at >= '${dateFrom}'::date`);
  if (dateTo)   parts.push(`${alias}.created_at <= ('${dateTo}'::date + INTERVAL '1 day')`);
  return parts.length ? `AND ${parts.join(" AND ")}` : "";
}

// ── GET /summary ─────────────────────────────────────────────────────────────
router.get("/summary", async (req, res) => {
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, unknown>);
  const df = dateFilter("lo", dateFrom, dateTo);

  try {
    const [byStatus, byMonth, totals] = await Promise.all([
      // count by status
      db.execute(sql.raw(`
        SELECT lo.status, COUNT(*)::int AS count
        FROM logistic_orders lo
        WHERE lo.order_type = 'product_first' ${df}
        GROUP BY lo.status
        ORDER BY count DESC
      `)),
      // tren bulanan
      db.execute(sql.raw(`
        SELECT TO_CHAR(lo.created_at, 'YYYY-MM') AS month, COUNT(*)::int AS count
        FROM logistic_orders lo
        WHERE lo.order_type = 'product_first' ${df}
        GROUP BY month
        ORDER BY month DESC
        LIMIT 12
      `)),
      // totals
      db.execute(sql.raw(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'Cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE status NOT IN ('Completed','Cancelled'))::int AS active
        FROM logistic_orders lo
        WHERE lo.order_type = 'product_first' ${df}
      `)),
    ]);

    res.json({
      byStatus: byStatus.rows,
      byMonth: (byMonth.rows as any[]).reverse(),
      totals: totals.rows[0] ?? { total: 0, completed: 0, cancelled: 0, active: 0 },
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil summary analytics" });
  }
});

// ── GET /vendor-response ─────────────────────────────────────────────────────
// Avg waktu (jam) dari status "Product RFQ Sent" → "Product Quote Received"
router.get("/vendor-response", async (req, res) => {
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, unknown>);
  const df = dateFilter("lo", dateFrom, dateTo);

  try {
    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(DISTINCT lo.id)::int AS orders_measured,
        ROUND(AVG(EXTRACT(EPOCH FROM (rfq_recv.first_recv - rfq_sent.first_sent)) / 3600)::numeric, 1) AS avg_response_hours,
        ROUND(MIN(EXTRACT(EPOCH FROM (rfq_recv.first_recv - rfq_sent.first_sent)) / 3600)::numeric, 1) AS min_response_hours,
        ROUND(MAX(EXTRACT(EPOCH FROM (rfq_recv.first_recv - rfq_sent.first_sent)) / 3600)::numeric, 1) AS max_response_hours
      FROM logistic_orders lo
      JOIN (
        SELECT order_id, MIN(created_at) AS first_sent
        FROM order_status_history
        WHERE new_status = 'Product RFQ Sent'
        GROUP BY order_id
      ) rfq_sent ON rfq_sent.order_id = lo.id
      JOIN (
        SELECT order_id, MIN(created_at) AS first_recv
        FROM order_status_history
        WHERE new_status = 'Product Quote Received'
        GROUP BY order_id
      ) rfq_recv ON rfq_recv.order_id = lo.id
      WHERE lo.order_type = 'product_first' ${df}
        AND rfq_recv.first_recv > rfq_sent.first_sent
    `));

    // Per-vendor breakdown
    const byVendor = await db.execute(sql.raw(`
      SELECT
        COALESCE(s.name, 'Unknown') AS vendor_name,
        COUNT(DISTINCT lo.id)::int AS order_count,
        ROUND(AVG(EXTRACT(EPOCH FROM (rfq_recv.first_recv - rfq_sent.first_sent)) / 3600)::numeric, 1) AS avg_response_hours
      FROM logistic_orders lo
      LEFT JOIN suppliers s ON s.id = lo.product_vendor_id
      JOIN (
        SELECT order_id, MIN(created_at) AS first_sent
        FROM order_status_history WHERE new_status = 'Product RFQ Sent' GROUP BY order_id
      ) rfq_sent ON rfq_sent.order_id = lo.id
      JOIN (
        SELECT order_id, MIN(created_at) AS first_recv
        FROM order_status_history WHERE new_status = 'Product Quote Received' GROUP BY order_id
      ) rfq_recv ON rfq_recv.order_id = lo.id
      WHERE lo.order_type = 'product_first' ${df}
        AND rfq_recv.first_recv > rfq_sent.first_sent
      GROUP BY s.id, s.name
      ORDER BY avg_response_hours ASC
      LIMIT 20
    `));

    res.json({ summary: result.rows[0] ?? {}, byVendor: byVendor.rows });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil vendor response analytics" });
  }
});

// ── GET /shipment-conversion ─────────────────────────────────────────────────
// % order yang pernah masuk "Shipment Selection Pending" dan lanjut ke shipment selection
router.get("/shipment-conversion", async (req, res) => {
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, unknown>);
  const df = dateFilter("lo", dateFrom, dateTo);

  try {
    const result = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int AS total_product_first,
        COUNT(*) FILTER (
          WHERE lo.status NOT IN ('Order Received','Admin Review','Product RFQ Sent','Product Quote Received','Product Vendor Selected','Customer Product Approval')
        )::int AS reached_shipment_selection,
        COUNT(*) FILTER (WHERE lo.shipment_mode = 'trucking')::int AS selected_trucking,
        COUNT(*) FILTER (WHERE lo.shipment_mode = 'pickup_self')::int AS selected_pickup_self,
        COUNT(*) FILTER (WHERE lo.shipment_mode IS NULL AND lo.status NOT IN (
          'Order Received','Admin Review','Product RFQ Sent','Product Quote Received','Product Vendor Selected','Customer Product Approval'
        ))::int AS still_pending_selection,
        COUNT(*) FILTER (WHERE lo.status = 'Completed')::int AS completed
      FROM logistic_orders lo
      WHERE lo.order_type = 'product_first' ${df}
    `));

    const row: any = result.rows[0] ?? {};
    const total = Number(row.total_product_first) || 0;
    const reachedSelection = Number(row.reached_shipment_selection) || 0;
    const conversionRate = total > 0 ? Math.round(reachedSelection / total * 100) : 0;
    const completionRate = total > 0 ? Math.round(Number(row.completed) / total * 100) : 0;

    res.json({
      total,
      reachedShipmentSelection: reachedSelection,
      selectedTrucking: Number(row.selected_trucking) || 0,
      selectedPickupSelf: Number(row.selected_pickup_self) || 0,
      stillPendingSelection: Number(row.still_pending_selection) || 0,
      completed: Number(row.completed) || 0,
      conversionRate,
      completionRate,
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil shipment conversion analytics" });
  }
});

// ── GET /mode-ratio ──────────────────────────────────────────────────────────
// Ratio pickup_self vs trucking
router.get("/mode-ratio", async (req, res) => {
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, unknown>);
  const df = dateFilter("lo", dateFrom, dateTo);

  try {
    const result = await db.execute(sql.raw(`
      SELECT
        lo.shipment_mode,
        COUNT(*)::int AS count,
        ROUND(COUNT(*) * 100.0 / NULLIF(SUM(COUNT(*)) OVER (), 0), 1) AS pct
      FROM logistic_orders lo
      WHERE lo.order_type = 'product_first'
        AND lo.shipment_mode IS NOT NULL ${df}
      GROUP BY lo.shipment_mode
      ORDER BY count DESC
    `));

    const byMonth = await db.execute(sql.raw(`
      SELECT
        TO_CHAR(lo.created_at, 'YYYY-MM') AS month,
        lo.shipment_mode,
        COUNT(*)::int AS count
      FROM logistic_orders lo
      WHERE lo.order_type = 'product_first'
        AND lo.shipment_mode IS NOT NULL ${df}
      GROUP BY month, lo.shipment_mode
      ORDER BY month ASC, lo.shipment_mode
    `));

    res.json({ byMode: result.rows, byMonth: byMonth.rows });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil mode ratio analytics" });
  }
});

// ── GET /margin ───────────────────────────────────────────────────────────────
// Margin produk (final_selling_price - product vendor cost) vs margin pengiriman
router.get("/margin", async (req, res) => {
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, unknown>);
  const df = dateFilter("lo", dateFrom, dateTo);

  try {
    const result = await db.execute(sql.raw(`
      SELECT
        lo.shipment_mode,
        COUNT(*)::int AS order_count,
        ROUND(AVG(lo.grand_total::numeric), 0) AS avg_grand_total,
        ROUND(AVG(COALESCE(loq_agg.vendor_cost, 0)), 0) AS avg_vendor_cost,
        ROUND(AVG(lo.grand_total::numeric - COALESCE(loq_agg.vendor_cost, 0)), 0) AS avg_gross_margin,
        ROUND(AVG(
          CASE WHEN lo.grand_total::numeric > 0
          THEN (lo.grand_total::numeric - COALESCE(loq_agg.vendor_cost, 0)) / lo.grand_total::numeric * 100
          ELSE 0 END
        ), 1) AS avg_margin_pct
      FROM logistic_orders lo
      LEFT JOIN (
        SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
        FROM logistic_order_quotes
        WHERE status = 'approved'
        GROUP BY order_id
      ) loq_agg ON loq_agg.order_id = lo.id
      WHERE lo.order_type = 'product_first'
        AND lo.status IN ('Invoice Issued','Payment Received','Completed') ${df}
      GROUP BY lo.shipment_mode
      ORDER BY lo.shipment_mode
    `));

    const overall = await db.execute(sql.raw(`
      SELECT
        COUNT(*)::int AS order_count,
        ROUND(SUM(lo.grand_total::numeric), 0) AS total_revenue,
        ROUND(SUM(COALESCE(loq_agg.vendor_cost, 0)), 0) AS total_vendor_cost,
        ROUND(SUM(lo.grand_total::numeric - COALESCE(loq_agg.vendor_cost, 0)), 0) AS total_gross_margin,
        ROUND(
          CASE WHEN SUM(lo.grand_total::numeric) > 0
          THEN SUM(lo.grand_total::numeric - COALESCE(loq_agg.vendor_cost, 0)) / SUM(lo.grand_total::numeric) * 100
          ELSE 0 END, 1
        ) AS overall_margin_pct
      FROM logistic_orders lo
      LEFT JOIN (
        SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
        FROM logistic_order_quotes WHERE status = 'approved' GROUP BY order_id
      ) loq_agg ON loq_agg.order_id = lo.id
      WHERE lo.order_type = 'product_first'
        AND lo.status IN ('Invoice Issued','Payment Received','Completed') ${df}
    `));

    res.json({ byMode: result.rows, overall: overall.rows[0] ?? {} });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil margin analytics" });
  }
});

// ── GET /all ─────────────────────────────────────────────────────────────────
// Semua metric sekaligus (untuk dashboard overview)
router.get("/all", async (req, res) => {
  const { dateFrom, dateTo } = parseDateRange(req.query as Record<string, unknown>);
  const df = dateFilter("lo", dateFrom, dateTo);

  try {
    const [summary, modeRatio, conversion, vendorResponse, margin] = await Promise.allSettled([
      db.execute(sql.raw(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Completed')::int AS completed,
          COUNT(*) FILTER (WHERE status = 'Cancelled')::int AS cancelled,
          COUNT(*) FILTER (WHERE status NOT IN ('Completed','Cancelled'))::int AS active
        FROM logistic_orders lo WHERE lo.order_type = 'product_first' ${df}
      `)),
      db.execute(sql.raw(`
        SELECT shipment_mode, COUNT(*)::int AS count,
               ROUND(COUNT(*)*100.0/NULLIF(SUM(COUNT(*)) OVER(),0),1) AS pct
        FROM logistic_orders lo
        WHERE lo.order_type='product_first' AND lo.shipment_mode IS NOT NULL ${df}
        GROUP BY shipment_mode ORDER BY count DESC
      `)),
      db.execute(sql.raw(`
        SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE shipment_mode IS NOT NULL)::int AS selected,
          COUNT(*) FILTER (WHERE shipment_mode = 'trucking')::int AS trucking,
          COUNT(*) FILTER (WHERE shipment_mode = 'pickup_self')::int AS pickup_self
        FROM logistic_orders lo WHERE lo.order_type='product_first' ${df}
      `)),
      db.execute(sql.raw(`
        SELECT ROUND(AVG(
          EXTRACT(EPOCH FROM (rfq_recv.first_recv - rfq_sent.first_sent)) / 3600
        )::numeric, 1) AS avg_response_hours
        FROM logistic_orders lo
        JOIN (SELECT order_id, MIN(created_at) AS first_sent FROM order_status_history
              WHERE new_status='Product RFQ Sent' GROUP BY order_id) rfq_sent ON rfq_sent.order_id=lo.id
        JOIN (SELECT order_id, MIN(created_at) AS first_recv FROM order_status_history
              WHERE new_status='Product Quote Received' GROUP BY order_id) rfq_recv ON rfq_recv.order_id=lo.id
        WHERE lo.order_type='product_first' ${df} AND rfq_recv.first_recv > rfq_sent.first_sent
      `)),
      db.execute(sql.raw(`
        SELECT
          ROUND(SUM(lo.grand_total::numeric), 0) AS total_revenue,
          ROUND(SUM(lo.grand_total::numeric - COALESCE(loq_agg.vendor_cost,0)), 0) AS total_gross_margin,
          ROUND(
            CASE WHEN SUM(lo.grand_total::numeric) > 0
            THEN SUM(lo.grand_total::numeric - COALESCE(loq_agg.vendor_cost,0))/SUM(lo.grand_total::numeric)*100
            ELSE 0 END, 1
          ) AS overall_margin_pct
        FROM logistic_orders lo
        LEFT JOIN (SELECT order_id, MAX(vendor_price::numeric) AS vendor_cost
                   FROM logistic_order_quotes WHERE status='approved' GROUP BY order_id) loq_agg ON loq_agg.order_id=lo.id
        WHERE lo.order_type='product_first'
          AND lo.status IN ('Invoice Issued','Payment Received','Completed') ${df}
      `)),
    ]);

    res.json({
      summary: summary.status === "fulfilled" ? (summary.value.rows[0] ?? {}) : {},
      modeRatio: modeRatio.status === "fulfilled" ? modeRatio.value.rows : [],
      conversion: conversion.status === "fulfilled" ? (conversion.value.rows[0] ?? {}) : {},
      vendorResponseHours: vendorResponse.status === "fulfilled"
        ? Number((vendorResponse.value.rows[0] as any)?.avg_response_hours ?? 0)
        : null,
      margin: margin.status === "fulfilled" ? (margin.value.rows[0] ?? {}) : {},
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil analytics" });
  }
});

export default router;
