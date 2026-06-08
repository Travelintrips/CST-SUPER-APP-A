import { Router } from "express";
import { db, suppliersTable, vendorPerformanceTable, logisticOrdersTable, rfqVendorLinksTable, driverJobsTable, driversTable } from "@workspace/db";
import { eq, and, sql, desc, inArray } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Additive migration: pastikan tabel & semua kolom ada di live DB ────────────
// Jalankan saat module di-load (idempoten via IF NOT EXISTS / IF NOT EXISTS column).
(async () => {
  try {
    // 1. Buat tabel jika belum ada (schema lengkap sesuai Drizzle schema)
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

    // 2. Handle old schema (dashboard.ts buat tabel dengan supplier_id, bukan vendor_id)
    //    Tambahkan kolom yang hilang secara additive.
    const addCols: Array<[string, string]> = [
      ["vendor_id",                "INTEGER REFERENCES suppliers(id) ON DELETE CASCADE"],
      ["total_orders",             "INTEGER NOT NULL DEFAULT 0"],
      ["completed_orders",         "INTEGER NOT NULL DEFAULT 0"],
      ["cancelled_orders",         "INTEGER NOT NULL DEFAULT 0"],
      ["ontime_percentage",        "NUMERIC(5,2) DEFAULT 0"],
      ["average_response_minutes", "NUMERIC(10,2) DEFAULT 0"],
      ["pod_completeness_score",   "NUMERIC(5,2) DEFAULT 0"],
      ["eta_accuracy_score",       "NUMERIC(5,2) DEFAULT 0"],
      ["customer_rating",          "NUMERIC(3,2) DEFAULT 0"],
      ["order_success_rate",       "NUMERIC(5,2) DEFAULT 0"],
      ["cancel_rate",              "NUMERIC(5,2) DEFAULT 0"],
      ["total_complaints",         "INTEGER NOT NULL DEFAULT 0"],
      ["recommendation_score",     "NUMERIC(5,2) DEFAULT 0"],
    ];

    for (const [col, def] of addCols) {
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

    // 3. Buat UNIQUE index pada vendor_id jika belum ada
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS vendor_perf_vendor_id_key
        ON vendor_performance(vendor_id)
        WHERE vendor_id IS NOT NULL
    `);

    logger.info("[vendorPerformance] migration selesai");
  } catch (err) {
    logger.warn({ err }, "[vendorPerformance] migration warning (non-fatal)");
  }
})();

// ── Backfill historis: panggil satu kali setelah server start ─────────────────
export async function backfillVendorPerformance(): Promise<{ updated: number; skipped: number }> {
  try {
    const vendors = await db
      .select({ id: suppliersTable.id })
      .from(suppliersTable)
      .where(eq(suppliersTable.isActive, true));

    let updated = 0;
    let skipped = 0;

    for (const v of vendors) {
      try {
        await recalcVendorPerformance(v.id);
        updated++;
      } catch {
        skipped++;
      }
    }

    logger.info({ updated, skipped }, "[vendorPerformance] backfill selesai");
    return { updated, skipped };
  } catch (err) {
    logger.error({ err }, "[vendorPerformance] backfill error");
    return { updated: 0, skipped: 0 };
  }
}

router.use(async (req, res, next) => {
  const ok = await requireClerkUser(req, res);
  if (ok) next();
});

// Calculate & upsert vendor performance for a single vendor
async function recalcVendorPerformance(vendorId: number) {
  // Count orders assigned to this vendor
  const orderStats = await db
    .select({
      total: sql<number>`count(*)::int`,
      completed: sql<number>`count(*) filter (where status ilike '%completed%' or status ilike '%delivered%')::int`,
      cancelled: sql<number>`count(*) filter (where status ilike '%cancelled%' or status ilike '%cancel%')::int`,
    })
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.approvedVendorId, vendorId));

  const { total, completed, cancelled } = orderStats[0] ?? { total: 0, completed: 0, cancelled: 0 };

  // Average response time from RFQ vendor links (minutes from creation to submission)
  const responseStats = await db
    .select({
      avgMin: sql<number>`
        avg(extract(epoch from (submitted_at - created_at)) / 60)::numeric(10,2)
      `,
    })
    .from(rfqVendorLinksTable)
    .where(
      and(
        eq(rfqVendorLinksTable.vendorId, vendorId),
        sql`submitted_at IS NOT NULL`,
      )
    );

  const avgResponseMin = Number(responseStats[0]?.avgMin ?? 0);

  // POD completeness — count driver jobs for this vendor's drivers with POD receiver name filled
  const podStats = await db
    .select({
      totalJobs: sql<number>`count(*)::int`,
      withPod: sql<number>`count(*) filter (where pod_receiver_name IS NOT NULL AND pod_receiver_name != '')::int`,
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
  const podScore = totalJobs > 0 ? (withPod / totalJobs) * 100 : 0;

  // Calculate rates
  const successRate = total > 0 ? (completed / total) * 100 : 0;
  const cancelRate = total > 0 ? (cancelled / total) * 100 : 0;
  const ontimePct = total > 0 ? Math.max(0, successRate - cancelRate / 2) : 0;

  // Recommendation score: weighted average
  const recScore =
    (ontimePct * 0.3) +
    (Math.max(0, 100 - Math.min(avgResponseMin, 120)) * 0.2) +
    (podScore * 0.2) +
    (successRate * 0.3);

  const perf = {
    vendorId,
    totalOrders: total,
    completedOrders: completed,
    cancelledOrders: cancelled,
    ontimePercentage: ontimePct.toFixed(2),
    averageResponseMinutes: avgResponseMin.toFixed(2),
    podCompletenessScore: podScore.toFixed(2),
    etaAccuracyScore: "0",
    customerRating: "0",
    orderSuccessRate: successRate.toFixed(2),
    cancelRate: cancelRate.toFixed(2),
    totalComplaints: 0,
    recommendationScore: recScore.toFixed(2),
    updatedAt: new Date(),
  };

  await db
    .insert(vendorPerformanceTable)
    .values(perf)
    .onConflictDoUpdate({
      target: vendorPerformanceTable.vendorId,
      set: {
        totalOrders: sql`excluded.total_orders`,
        completedOrders: sql`excluded.completed_orders`,
        cancelledOrders: sql`excluded.cancelled_orders`,
        ontimePercentage: sql`excluded.ontime_percentage`,
        averageResponseMinutes: sql`excluded.average_response_minutes`,
        podCompletenessScore: sql`excluded.pod_completeness_score`,
        orderSuccessRate: sql`excluded.order_success_rate`,
        cancelRate: sql`excluded.cancel_rate`,
        recommendationScore: sql`excluded.recommendation_score`,
        updatedAt: sql`NOW()`,
      },
    });

  return perf;
}

// GET /api/vendor-performance — list all vendors with performance
router.get("/", async (req, res) => {
  const vendors = await db
    .select({
      vendor: suppliersTable,
      perf: vendorPerformanceTable,
    })
    .from(suppliersTable)
    .leftJoin(vendorPerformanceTable, eq(suppliersTable.id, vendorPerformanceTable.vendorId))
    .where(eq(suppliersTable.isActive, true))
    .orderBy(desc(vendorPerformanceTable.recommendationScore));

  const withBadges = vendors.map(({ vendor, perf }) => {
    const badges: string[] = [];
    const p = perf;
    if (p) {
      if (Number(p.ontimePercentage) >= 90) badges.push("Top Vendor");
      if (Number(p.averageResponseMinutes) > 0 && Number(p.averageResponseMinutes) <= 30) badges.push("Fast Response");
      if (Number(p.etaAccuracyScore) >= 85) badges.push("Best ETA");
      if (Number(p.totalOrders) >= 20 && Number(p.cancelRate) <= 5) badges.push("Trusted Vendor");
    }
    return { vendor, perf, badges };
  });

  res.json(withBadges);
});

// GET /api/vendor-performance/scores-bulk
// Query: ?vendorIds=1,2,3&origin=Jakarta&destination=Surabaya&shipmentType=FCL
// Returns per-vendor AI Score blending global recommendation_score + route-specific Decision Memory.
router.get("/scores-bulk", async (req, res) => {
  const { vendorIds: vendorIdsStr, origin, destination, shipmentType } = req.query as Record<string, string>;
  const vendorIds = (vendorIdsStr ?? "").split(",").map(Number).filter(n => !isNaN(n) && n > 0);
  if (vendorIds.length === 0) { res.json([]); return; }

  // 1. Global performance data from vendor_performance table
  const perfRows = await db
    .select({ vendor: suppliersTable, perf: vendorPerformanceTable })
    .from(suppliersTable)
    .leftJoin(vendorPerformanceTable, eq(suppliersTable.id, vendorPerformanceTable.vendorId))
    .where(inArray(suppliersTable.id, vendorIds));

  // 2. Route-specific stats from Decision Memory
  // Build safe parametrized query by appending conditions
  let baseQuery = sql`
    SELECT
      chosen_entity_id AS vendor_id,
      COUNT(*)::int AS route_orders,
      COUNT(*) FILTER (WHERE on_time_delivery = true)::int AS route_on_time,
      COALESCE(AVG(delay_days) FILTER (WHERE delay_days > 0), 0)::numeric(6,2) AS avg_delay_days
    FROM ai_decision_memory
    WHERE decision_type = 'vendor_assignment'
      AND chosen_entity_id = ANY(${vendorIds})
      AND outcome IS NOT NULL
  `;
  if (origin) {
    const o = `%${origin}%`;
    baseQuery = sql`${baseQuery} AND origin ILIKE ${o}`;
  }
  if (destination) {
    const d = `%${destination}%`;
    baseQuery = sql`${baseQuery} AND destination ILIKE ${d}`;
  }
  if (shipmentType) {
    baseQuery = sql`${baseQuery} AND shipment_type = ${shipmentType}`;
  }
  baseQuery = sql`${baseQuery} GROUP BY chosen_entity_id`;

  let routeRows: { rows: unknown[] } = { rows: [] };
  try {
    routeRows = await db.execute(baseQuery);
  } catch {
    // ai_decision_memory might not exist yet — gracefully degrade to global score only
  }

  const routeMap: Record<number, { routeOrders: number; routeOnTime: number; avgDelayDays: number }> = {};
  for (const r of routeRows.rows as Record<string, unknown>[]) {
    const vid = Number(r["vendor_id"]);
    routeMap[vid] = {
      routeOrders: Number(r["route_orders"] ?? 0),
      routeOnTime: Number(r["route_on_time"] ?? 0),
      avgDelayDays: Number(r["avg_delay_days"] ?? 0),
    };
  }

  // 3. Compute AI Score per vendor
  const scores = perfRows.map(({ vendor, perf }) => {
    const globalScore = perf ? Number(perf.recommendationScore ?? 50) : 50;
    const route = routeMap[vendor.id];
    const routeOrders = route?.routeOrders ?? 0;
    const routeOnTime = route?.routeOnTime ?? 0;
    const avgDelayDays = route?.avgDelayDays ?? 0;
    const routeOnTimePct = routeOrders > 0 ? (routeOnTime / routeOrders) * 100 : null;

    // Blend: more route data → more weight on route-specific performance
    let aiScore: number;
    let dataConfidence: "high" | "medium" | "low" | "none";
    if (routeOrders >= 5) {
      aiScore = (routeOnTimePct! * 0.65) + (globalScore * 0.35);
      dataConfidence = "high";
    } else if (routeOrders >= 2) {
      aiScore = (routeOnTimePct! * 0.40) + (globalScore * 0.60);
      dataConfidence = "medium";
    } else if (routeOrders >= 1) {
      aiScore = (routeOnTimePct! * 0.20) + (globalScore * 0.80);
      dataConfidence = "low";
    } else {
      aiScore = globalScore;
      dataConfidence = "none";
    }

    // Tier classification
    const hasAnyData = !!(perf || routeOrders > 0);
    const tier: "top" | "good" | "moderate" | "new" =
      !hasAnyData ? "new" :
      aiScore >= 80 ? "top" :
      aiScore >= 65 ? "good" :
      aiScore >= 50 ? "moderate" : "new";

    // Human-readable score bullets
    const bullets: string[] = [];
    if (routeOrders > 0 && routeOnTimePct !== null) {
      bullets.push(`${routeOnTime}/${routeOrders} on-time rute ini (${routeOnTimePct.toFixed(0)}%)`);
      if (avgDelayDays > 0) bullets.push(`Rata-rata delay ${avgDelayDays.toFixed(1)} hari`);
    }
    if (perf) {
      const gOt = Number(perf.ontimePercentage ?? 0);
      if (gOt > 0) bullets.push(`On-time global: ${gOt.toFixed(0)}%`);
      const respMin = Number(perf.averageResponseMinutes ?? 0);
      if (respMin > 0 && respMin <= 120) bullets.push(`Respon rata-rata ${respMin.toFixed(0)} menit`);
      if (Number(perf.totalOrders ?? 0) > 0) bullets.push(`${perf.totalOrders} total order`);
    }
    if (bullets.length === 0) bullets.push("Belum ada data historis");

    // Performance badges
    const badges: string[] = [];
    if (routeOrders >= 3 && routeOnTimePct !== null && routeOnTimePct >= 80) badges.push("Route Expert");
    if (perf && Number(perf.ontimePercentage ?? 0) >= 90) badges.push("Top Vendor");
    if (perf && Number(perf.averageResponseMinutes ?? 0) > 0 && Number(perf.averageResponseMinutes) <= 30) badges.push("Fast Response");
    if (perf && Number(perf.totalOrders ?? 0) >= 20 && Number(perf.cancelRate ?? 100) <= 5) badges.push("Trusted");

    return {
      vendorId: vendor.id,
      vendorName: vendor.name,
      aiScore: Math.round(aiScore * 10) / 10,
      tier,
      globalScore: Math.round(globalScore * 10) / 10,
      routeOrderCount: routeOrders,
      routeOnTimePct: routeOnTimePct !== null ? Math.round(routeOnTimePct * 10) / 10 : null,
      avgDelayDays: Math.round(avgDelayDays * 10) / 10,
      dataConfidence,
      scoreBullets: bullets,
      badges,
    };
  });

  scores.sort((a, b) => b.aiScore - a.aiScore);
  res.json(scores);
});

// GET /api/vendor-performance/:vendorId
router.get("/:vendorId", async (req, res) => {
  const vendorId = Number(req.params.vendorId);
  const [result] = await db
    .select({ vendor: suppliersTable, perf: vendorPerformanceTable })
    .from(suppliersTable)
    .leftJoin(vendorPerformanceTable, eq(suppliersTable.id, vendorPerformanceTable.vendorId))
    .where(eq(suppliersTable.id, vendorId));

  if (!result) { res.status(404).json({ error: "Vendor not found" }); return; }

  const badges: string[] = [];
  const p = result.perf;
  if (p) {
    if (Number(p.ontimePercentage) >= 90) badges.push("Top Vendor");
    if (Number(p.averageResponseMinutes) > 0 && Number(p.averageResponseMinutes) <= 30) badges.push("Fast Response");
    if (Number(p.etaAccuracyScore) >= 85) badges.push("Best ETA");
    if (Number(p.totalOrders) >= 20 && Number(p.cancelRate) <= 5) badges.push("Trusted Vendor");
  }

  res.json({ ...result, badges });
});

// POST /api/vendor-performance/:vendorId/recalculate
router.post("/:vendorId/recalculate", async (req, res) => {
  const vendorId = Number(req.params.vendorId);
  const perf = await recalcVendorPerformance(vendorId);
  res.json({ ok: true, perf });
});

// POST /api/vendor-performance/recalculate-all
router.post("/recalculate-all", async (req, res) => {
  const vendors = await db.select({ id: suppliersTable.id }).from(suppliersTable).where(eq(suppliersTable.isActive, true));
  for (const v of vendors) {
    await recalcVendorPerformance(v.id);
  }
  res.json({ ok: true, updated: vendors.length });
});

// POST /api/vendor-performance/:vendorId/rate — submit customer rating
router.post("/:vendorId/rate", async (req, res) => {
  const vendorId = Number(req.params.vendorId);
  const { rating } = req.body ?? {};
  if (!rating || Number(rating) < 1 || Number(rating) > 5) {
    res.status(400).json({ error: "Rating harus antara 1-5" }); return;
  }
  await db
    .update(vendorPerformanceTable)
    .set({ customerRating: String(Number(rating).toFixed(2)), updatedAt: new Date() })
    .where(eq(vendorPerformanceTable.vendorId, vendorId));
  res.json({ ok: true });
});

// GET /api/vendor-performance/rfq/:rfqId/recommend — smart recommendation for an RFQ
router.get("/rfq/:rfqId/recommend", async (req, res) => {
  const rfqId = Number(req.params.rfqId);
  const links = await db
    .select({
      link: rfqVendorLinksTable,
      vendor: suppliersTable,
      perf: vendorPerformanceTable,
    })
    .from(rfqVendorLinksTable)
    .innerJoin(suppliersTable, eq(rfqVendorLinksTable.vendorId, suppliersTable.id))
    .leftJoin(vendorPerformanceTable, eq(suppliersTable.id, vendorPerformanceTable.vendorId))
    .where(
      and(
        eq(rfqVendorLinksTable.rfqId, rfqId),
        sql`${rfqVendorLinksTable.offeredPrice} IS NOT NULL`,
      )
    );

  if (links.length === 0) { res.json({ recommendation: null, scores: [] }); return; }

  // Normalize factors and compute scores
  // Weights: Harga 35%, Lead Time 20%, Stok 15%, Performa 30%
  const prices = links.map(l => Number(l.link.offeredPrice));
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceRange = maxPrice - minPrice || 1;

  const leadTimes = links
    .map(l => (l.link as any).leadTimeDays != null ? Number((l.link as any).leadTimeDays) : null)
    .filter((v): v is number => v != null);
  const minLeadTime = leadTimes.length > 0 ? Math.min(...leadTimes) : null;
  const maxLeadTime = leadTimes.length > 0 ? Math.max(...leadTimes) : null;
  const leadTimeRange = (minLeadTime != null && maxLeadTime != null) ? (maxLeadTime - minLeadTime || 1) : 1;

  const STOCK_SCORES: Record<string, number> = {
    available: 100,
    limited: 50,
    unavailable: 0,
    unknown: 30,
  };

  const scored = links.map(l => {
    const priceScore = 100 - ((Number(l.link.offeredPrice) - minPrice) / priceRange) * 100;

    const leadTimeDaysVal = (l.link as any).leadTimeDays != null ? Number((l.link as any).leadTimeDays) : null;
    const leadTimeScore = (leadTimeDaysVal != null && minLeadTime != null && maxLeadTime != null)
      ? 100 - ((leadTimeDaysVal - minLeadTime) / leadTimeRange) * 100
      : 50;

    const stockVal = (l.link as any).stockAvailability ?? "unknown";
    const stockScore = STOCK_SCORES[stockVal] ?? 30;

    const perfScore = Number(l.perf?.recommendationScore ?? 50);

    const totalScore = (priceScore * 0.35) + (leadTimeScore * 0.20) + (stockScore * 0.15) + (perfScore * 0.30);

    const reasons: string[] = [];
    if (priceScore >= 80) reasons.push("Best price");
    if (leadTimeDaysVal != null && leadTimeDaysVal === minLeadTime) reasons.push("Lead time tercepat");
    if (stockVal === "available") reasons.push("Stok tersedia");
    if (Number(l.perf?.ontimePercentage ?? 0) >= 90) reasons.push("Highest on-time rate");
    if (Number(l.perf?.averageResponseMinutes ?? 999) <= 30) reasons.push("Fastest response");
    if (Number(l.perf?.cancelRate ?? 100) <= 5) reasons.push("Low cancel rate");
    return {
      vendorId: l.vendor.id,
      vendorName: l.vendor.name,
      offeredPrice: l.link.offeredPrice,
      eta: l.link.eta,
      leadTimeDays: leadTimeDaysVal,
      stockAvailability: stockVal,
      score: Number(totalScore.toFixed(2)),
      reasons,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  const top = scored[0];

  res.json({ recommendation: top, scores: scored });
});

// GET /api/vendor-performance/trend/:vendorId
// Returns last 12 months of monthly performance data for a single vendor
router.get("/trend/:vendorId", async (req, res) => {
  const vendorId = Number(req.params.vendorId);
  if (!vendorId) { res.status(400).json({ error: "Invalid vendorId" }); return; }

  try {
    // Monthly order stats for this vendor
    const orderTrend = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') AS month,
        COUNT(*)::int                                          AS total_orders,
        COUNT(*) FILTER (WHERE status ILIKE '%completed%' OR status ILIKE '%delivered%')::int AS completed,
        COUNT(*) FILTER (WHERE status ILIKE '%cancel%')::int  AS cancelled
      FROM logistic_orders
      WHERE approved_vendor_id = ${vendorId}
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', created_at)
      ORDER BY DATE_TRUNC('month', created_at) ASC
    `);

    // Monthly avg response time (from RFQ vendor links)
    const responseTrend = await db.execute(sql`
      SELECT
        TO_CHAR(DATE_TRUNC('month', rvl.created_at), 'YYYY-MM') AS month,
        AVG(EXTRACT(EPOCH FROM (rvl.submitted_at - rvl.created_at)) / 60)::numeric(8,1) AS avg_response_min
      FROM rfq_vendor_links rvl
      WHERE rvl.vendor_id = ${vendorId}
        AND rvl.submitted_at IS NOT NULL
        AND rvl.created_at >= NOW() - INTERVAL '12 months'
      GROUP BY DATE_TRUNC('month', rvl.created_at)
      ORDER BY DATE_TRUNC('month', rvl.created_at) ASC
    `);

    const responseMap: Record<string, number> = {};
    for (const r of responseTrend.rows as Record<string, unknown>[]) {
      responseMap[String(r["month"])] = Number(r["avg_response_min"] ?? 0);
    }

    const trend = (orderTrend.rows as Record<string, unknown>[]).map(r => {
      const month = String(r["month"]);
      const total = Number(r["total_orders"] ?? 0);
      const completed = Number(r["completed"] ?? 0);
      const cancelled = Number(r["cancelled"] ?? 0);
      const successRate = total > 0 ? (completed / total) * 100 : 0;
      const cancelRate = total > 0 ? (cancelled / total) * 100 : 0;
      const ontimePct = Math.max(0, successRate - cancelRate / 2);
      const avgResponseMin = responseMap[month] ?? 0;
      const aiScore =
        (ontimePct * 0.3) +
        (Math.max(0, 100 - Math.min(avgResponseMin, 120)) * 0.2) +
        (successRate * 0.5);

      return {
        month,
        totalOrders: total,
        completedOrders: completed,
        ontimePct: Math.round(ontimePct * 10) / 10,
        successRate: Math.round(successRate * 10) / 10,
        avgResponseMin: Math.round(avgResponseMin * 10) / 10,
        aiScore: Math.round(aiScore * 10) / 10,
      };
    });

    res.json(trend);
  } catch (err) {
    res.status(500).json({ error: "Gagal memuat trend data" });
  }
});

export { router as vendorPerformanceRouter, recalcVendorPerformance };
