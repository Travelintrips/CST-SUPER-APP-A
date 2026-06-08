import { db, suppliersTable, vendorPerformanceTable, logisticOrdersTable, rfqVendorLinksTable, driverJobsTable, driversTable } from "@workspace/db";
import { eq, and, sql, desc } from "drizzle-orm";
import { logger } from "./logger.js";

// ── Additive column migration ──────────────────────────────────────────────────
export async function runVendorPerformanceMigration(): Promise<void> {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_performance (
        id                        SERIAL PRIMARY KEY,
        vendor_id                 INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
        total_orders              INTEGER NOT NULL DEFAULT 0,
        completed_orders          INTEGER NOT NULL DEFAULT 0,
        cancelled_orders          INTEGER NOT NULL DEFAULT 0,
        ontime_percentage         NUMERIC(5,2) DEFAULT 0,
        average_response_minutes  NUMERIC(10,2) DEFAULT 0,
        pod_completeness_score    NUMERIC(5,2) DEFAULT 0,
        eta_accuracy_score        NUMERIC(5,2) DEFAULT 0,
        customer_rating           NUMERIC(3,2) DEFAULT 0,
        order_success_rate        NUMERIC(5,2) DEFAULT 0,
        cancel_rate               NUMERIC(5,2) DEFAULT 0,
        total_complaints          INTEGER NOT NULL DEFAULT 0,
        recommendation_score      NUMERIC(5,2) DEFAULT 0,
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(vendor_id)
      )
    `);

    const extendedCols: Array<[string, string]> = [
      ["total_rfq_invites",  "INTEGER DEFAULT 0"],
      ["total_submitted",    "INTEGER DEFAULT 0"],
      ["total_selected",     "INTEGER DEFAULT 0"],
      ["total_rejected",     "INTEGER DEFAULT 0"],
      ["avg_response_hours", "NUMERIC(10,2) DEFAULT 0"],
      ["on_time_orders",     "INTEGER DEFAULT 0"],
      ["late_orders",        "INTEGER DEFAULT 0"],
      ["pod_complete_orders","INTEGER DEFAULT 0"],
      ["score",              "NUMERIC(5,2) DEFAULT 0"],
      ["last_calculated_at", "TIMESTAMPTZ"],
    ];

    for (const [col, def] of extendedCols) {
      await db.execute(sql.raw(`
        DO $$ BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'vendor_performance' AND column_name = '${col}'
          ) THEN
            ALTER TABLE vendor_performance ADD COLUMN ${col} ${def};
          END IF;
        END $$;
      `));
    }

    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS vendor_perf_vendor_id_key
        ON vendor_performance(vendor_id)
        WHERE vendor_id IS NOT NULL
    `);

    logger.info("[vendorPerformanceService] migration selesai");
  } catch (err) {
    logger.warn({ err }, "[vendorPerformanceService] migration warning (non-fatal)");
  }
}

// ── Core recalculation for a single vendor ────────────────────────────────────
export async function recalculateVendorPerformance(vendorId: number) {
  // A. Order stats
  const orderStats = await db
    .select({
      total:     sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status ilike '%completed%' or status ilike '%delivered%')::int`,
      cancelled: sql<number>`count(*) filter (where status ilike '%cancelled%' or status ilike '%cancel%')::int`,
    })
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.approvedVendorId, vendorId));

  const { total, completed, cancelled } = orderStats[0] ?? { total: 0, completed: 0, cancelled: 0 };

  // B. RFQ stats
  const rfqStats = await db.execute<{
    total_invites: string;
    total_submitted: string;
    total_selected: string;
    avg_response_min: string;
  }>(sql`
    SELECT
      COUNT(*)::int                                                      AS total_invites,
      COUNT(*) FILTER (WHERE submitted_at IS NOT NULL)::int             AS total_submitted,
      COUNT(*) FILTER (WHERE status = 'selected')::int                  AS total_selected,
      COALESCE(AVG(
        EXTRACT(EPOCH FROM (submitted_at - created_at)) / 60
      ) FILTER (WHERE submitted_at IS NOT NULL), 0)::numeric(10,2)     AS avg_response_min
    FROM rfq_vendor_links
    WHERE vendor_id = ${vendorId}
  `);

  const rfq = (rfqStats.rows[0] ?? {}) as Record<string, string>;
  const totalRfqInvites  = Number(rfq["total_invites"]   ?? 0);
  const totalSubmitted   = Number(rfq["total_submitted"]  ?? 0);
  const totalSelected    = Number(rfq["total_selected"]   ?? 0);
  const totalRejected    = Math.max(0, totalRfqInvites - totalSelected);
  const avgResponseMin   = Number(rfq["avg_response_min"] ?? 0);
  const avgResponseHours = avgResponseMin > 0 ? avgResponseMin / 60 : 0;

  // C. POD stats
  const podStats = await db
    .select({
      totalJobs: sql<number>`count(*)::int`,
      withPod:   sql<number>`count(*) filter (where pod_receiver_name IS NOT NULL AND pod_receiver_name != '')::int`,
    })
    .from(driverJobsTable)
    .innerJoin(driversTable, eq(driverJobsTable.driverId, driversTable.id))
    .where(
      and(
        sql`${driverJobsTable.logisticOrderId} IN (
          SELECT id FROM logistic_orders WHERE approved_vendor_id = ${vendorId}
        )`,
      )
    );

  const { totalJobs, withPod } = podStats[0] ?? { totalJobs: 0, withPod: 0 };
  const podScore          = totalJobs > 0 ? (withPod / totalJobs) * 100 : 0;
  const podCompleteOrders = withPod;

  // D. Derived metrics
  const successRate = total > 0 ? (completed / total) * 100 : 0;
  const cancelRate  = total > 0 ? (cancelled / total) * 100 : 0;
  const ontimePct   = total > 0 ? Math.max(0, successRate - cancelRate / 2) : 0;
  const onTimeOrders = completed;
  const lateOrders   = Math.max(0, total - completed - cancelled);

  const recScore =
    (ontimePct * 0.3) +
    (Math.max(0, 100 - Math.min(avgResponseMin, 120)) * 0.2) +
    (podScore * 0.2) +
    (successRate * 0.3);

  const perf = {
    vendorId,
    totalOrders:            total,
    completedOrders:        completed,
    cancelledOrders:        cancelled,
    ontimePercentage:       ontimePct.toFixed(2),
    averageResponseMinutes: avgResponseMin.toFixed(2),
    podCompletenessScore:   podScore.toFixed(2),
    etaAccuracyScore:       "0",
    customerRating:         "0",
    orderSuccessRate:       successRate.toFixed(2),
    cancelRate:             cancelRate.toFixed(2),
    totalComplaints:        0,
    recommendationScore:    recScore.toFixed(2),
    updatedAt:              new Date(),
    // Extended
    totalRfqInvites,
    totalSubmitted,
    totalSelected,
    totalRejected,
    avgResponseHours:  avgResponseHours.toFixed(2),
    onTimeOrders,
    lateOrders,
    podCompleteOrders,
    score:             recScore.toFixed(2),
    lastCalculatedAt:  new Date(),
  };

  await db
    .insert(vendorPerformanceTable)
    .values(perf)
    .onConflictDoUpdate({
      target: vendorPerformanceTable.vendorId,
      set: {
        totalOrders:            sql`excluded.total_orders`,
        completedOrders:        sql`excluded.completed_orders`,
        cancelledOrders:        sql`excluded.cancelled_orders`,
        ontimePercentage:       sql`excluded.ontime_percentage`,
        averageResponseMinutes: sql`excluded.average_response_minutes`,
        podCompletenessScore:   sql`excluded.pod_completeness_score`,
        orderSuccessRate:       sql`excluded.order_success_rate`,
        cancelRate:             sql`excluded.cancel_rate`,
        recommendationScore:    sql`excluded.recommendation_score`,
        updatedAt:              sql`NOW()`,
        totalRfqInvites:        sql`excluded.total_rfq_invites`,
        totalSubmitted:         sql`excluded.total_submitted`,
        totalSelected:          sql`excluded.total_selected`,
        totalRejected:          sql`excluded.total_rejected`,
        avgResponseHours:       sql`excluded.avg_response_hours`,
        onTimeOrders:           sql`excluded.on_time_orders`,
        lateOrders:             sql`excluded.late_orders`,
        podCompleteOrders:      sql`excluded.pod_complete_orders`,
        score:                  sql`excluded.score`,
        lastCalculatedAt:       sql`excluded.last_calculated_at`,
      },
    });

  return perf;
}

// ── Backfill all active vendors ────────────────────────────────────────────────
export async function recalculateAllVendorPerformance(): Promise<{ updated: number; skipped: number }> {
  try {
    const vendors = await db
      .select({ id: suppliersTable.id })
      .from(suppliersTable)
      .where(eq(suppliersTable.isActive, true));

    let updated = 0;
    let skipped = 0;

    for (const v of vendors) {
      try {
        await recalculateVendorPerformance(v.id);
        updated++;
      } catch {
        skipped++;
      }
    }

    logger.info({ updated, skipped }, "[vendorPerformanceService] backfill selesai");
    return { updated, skipped };
  } catch (err) {
    logger.error({ err }, "[vendorPerformanceService] backfill error");
    return { updated: 0, skipped: 0 };
  }
}

// ── Health summary ─────────────────────────────────────────────────────────────
export async function getVendorPerformanceHealth(): Promise<{
  tableExists: boolean;
  rowCount: number;
  lastCalculatedAt: string | null;
  vendorsWithScore: number;
  vendorsWithoutScore: number;
  activeVendors: number;
  backfillCoverage: string;
}> {
  try {
    const [existsRes, statsRes, activeRes] = await Promise.all([
      db.execute(sql`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'vendor_performance'
        ) AS exists
      `),
      db.execute(sql`
        SELECT
          COUNT(*)::int                                                   AS row_count,
          MAX(last_calculated_at)                                         AS last_calculated_at,
          COUNT(*) FILTER (WHERE score::numeric > 0)::int                AS with_score,
          COUNT(*) FILTER (WHERE score IS NULL OR score::numeric = 0)::int AS without_score
        FROM vendor_performance
      `),
      db.execute(sql`SELECT COUNT(*)::int AS n FROM suppliers WHERE is_active = true`),
    ]);

    const tableExists = (existsRes.rows[0] as Record<string, unknown>)?.["exists"] === true
      || (existsRes.rows[0] as Record<string, unknown>)?.["exists"] === "true";

    if (!tableExists) {
      return { tableExists: false, rowCount: 0, lastCalculatedAt: null, vendorsWithScore: 0, vendorsWithoutScore: 0, activeVendors: 0, backfillCoverage: "0%" };
    }

    const s = (statsRes.rows[0] ?? {}) as Record<string, unknown>;
    const rowCount           = Number(s["row_count"]          ?? 0);
    const vendorsWithScore   = Number(s["with_score"]         ?? 0);
    const vendorsWithoutScore = Number(s["without_score"]     ?? 0);
    const lastCalculatedAt   = s["last_calculated_at"] ? String(s["last_calculated_at"]) : null;
    const activeVendors      = Number((activeRes.rows[0] as Record<string, unknown>)?.["n"] ?? 0);
    const backfillCoverage   = activeVendors > 0
      ? `${Math.round((rowCount / activeVendors) * 100)}%`
      : "0%";

    return { tableExists, rowCount, lastCalculatedAt, vendorsWithScore, vendorsWithoutScore, activeVendors, backfillCoverage };
  } catch (err) {
    logger.error({ err }, "[vendorPerformanceService] getHealth error");
    return { tableExists: false, rowCount: 0, lastCalculatedAt: null, vendorsWithScore: 0, vendorsWithoutScore: 0, activeVendors: 0, backfillCoverage: "0%" };
  }
}
