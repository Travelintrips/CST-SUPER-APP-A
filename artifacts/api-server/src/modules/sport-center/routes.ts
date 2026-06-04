import { Router } from "express";
import { db, accountingPaymentsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../../lib/requireAdmin.js";
import { handleSportCenterSse, broadcastSportCenterEvent } from "./broadcast.js";
import { postSportCenterBooking, postSportCenterBookingReversal, postSportCenterRefund, postSportCenterMembershipPayment, postSportCenterBookingWithTax, postSportCenterBookingRefundDirect } from "../../lib/accounting.js";
import { ensureAccountingSettings } from "../../lib/accountingSeed.js";
import { syncFacilityUpsert, syncFacilityDelete, syncAllFacilities, syncBookingUpsert, syncAllBookings, getLastSyncLogs, pullLegacyBookingsFromSupabase } from "./supabaseSync.js";

async function insertAccountingPaymentForSportCenter(args: {
  companyId: number;
  paymentNumber: string;
  amount: number;
  method: string;
  partnerName: string;
  ref: string;
  memo: string;
  sourceDocId: number;
  date?: string;
  createdById?: string | null;
}): Promise<void> {
  try {
    const settings = await ensureAccountingSettings(args.companyId);
    const isCash = ["cash", "tunai"].includes(args.method?.toLowerCase() ?? "");
    const journalId = isCash
      ? (settings.cashJournalId ?? settings.bankJournalId)
      : (settings.bankJournalId ?? settings.cashJournalId);
    if (!journalId) return;
    const payDate = args.date ?? new Date().toISOString().split("T")[0]!;
    const year = payDate.slice(0, 4);
    const cntRes = await db.execute(sql`SELECT CAST(COUNT(*) AS int) AS seq FROM accounting_payments`);
    const seq = Number((cntRes.rows[0] as any)?.seq ?? 0);
    const paySeq = (seq + 1).toString().padStart(4, "0");
    const acctPayNumber = `PAY/${year}/${paySeq}`;
    await db.insert(accountingPaymentsTable).values({
      companyId: args.companyId,
      paymentNumber: acctPayNumber,
      paymentType: "inbound",
      status: "posted",
      amount: String(Math.round(args.amount * 100) / 100),
      journalId,
      partnerName: args.partnerName || null,
      date: payDate,
      ref: args.ref || null,
      memo: args.memo || null,
      entryId: null,
      sourceType: "sport_center",
      sourceDocId: args.sourceDocId,
      createdById: args.createdById ?? null,
    });
  } catch (err) {
    console.error("[sport-center] insertAccountingPaymentForSportCenter failed:", err);
  }
}

const router = Router();

router.use((_req, _res, next) => next());

function pad(n: number, len = 6) {
  return String(n).padStart(len, "0");
}

async function nextBookingNumber(companyId?: number): Promise<string> {
  const res = await db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${companyId ?? null}::int IS NULL OR company_id = ${companyId ?? null})`);
  const cnt = Number((res.rows[0] as any).cnt) + 1;
  const today = new Date();
  return `BK/${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}/${pad(cnt)}`;
}

async function nextMemberNumber(companyId?: number): Promise<string> {
  const res = await db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_members WHERE (${companyId ?? null}::int IS NULL OR company_id = ${companyId ?? null})`);
  return `MBR-${pad(Number((res.rows[0] as any).cnt) + 1, 5)}`;
}

async function nextPaymentNumber(companyId?: number): Promise<string> {
  const res = await db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_payments WHERE (${companyId ?? null}::int IS NULL OR company_id = ${companyId ?? null})`);
  return `PAY/${new Date().getFullYear()}/${pad(Number((res.rows[0] as any).cnt) + 1)}`;
}

async function nextPrSeq(): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `PR/${year}/%`;
  const res = await db.execute(sql`SELECT COALESCE(MAX(CAST(SPLIT_PART(pr_number, '/', 3) AS int)), 0) AS seq FROM purchase_requests WHERE pr_number LIKE ${pattern}`);
  const seq = (Number((res.rows[0] as any).seq ?? 0) + 1).toString().padStart(5, "0");
  return `PR/${year}/${seq}`;
}

async function nextRefundNumber(companyId?: number): Promise<string> {
  const res = await db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_refunds WHERE (${companyId ?? null}::int IS NULL OR company_id = ${companyId ?? null})`);
  return `RF/${new Date().getFullYear()}/${pad(Number((res.rows[0] as any).cnt) + 1)}`;
}

router.get("/events", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  handleSportCenterSse(req, res);
});

router.get("/dashboard", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    const cId = companyId ?? null;

    const [
      totals, todayRes, pendingPayRes, membersRes, byStatus, topFacilities, recentBookings,
      monthRev, totalRev, promoUsedRes, promoDiscountRes, cancelledRes, totalRefundsRes,
      totalRefundAmountRes, expiredMembersRes, membershipRevRes, membershipPayCountRes,
    ] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId})`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND booking_date = CURRENT_DATE`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND payment_status = 'unpaid' AND status NOT IN ('cancelled','completed')`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_members WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status = 'active'`),
      db.execute(sql`SELECT status, COUNT(*) AS count FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) GROUP BY status ORDER BY count DESC`),
      db.execute(sql`SELECT facility_name, COUNT(*) AS bookings, COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status != 'cancelled' GROUP BY facility_name ORDER BY bookings DESC LIMIT 5`),
      db.execute(sql`SELECT * FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) ORDER BY created_at DESC LIMIT 10`),
      db.execute(sql`SELECT COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status != 'cancelled' AND booking_date >= date_trunc('month', CURRENT_DATE)`),
      db.execute(sql`SELECT COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status != 'cancelled'`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND promo_id IS NOT NULL AND status != 'cancelled'`),
      db.execute(sql`SELECT COALESCE(SUM(discount_amount),0) AS total FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND promo_id IS NOT NULL AND status != 'cancelled'`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status = 'cancelled'`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_refunds WHERE (${cId}::int IS NULL OR company_id = ${cId})`),
      db.execute(sql`SELECT COALESCE(SUM(refund_amount),0) AS total FROM sport_refunds WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status = 'paid'`),
      // Membership: expired members
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_members WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND (status = 'expired' OR (end_date IS NOT NULL AND end_date < CURRENT_DATE AND status != 'active'))`),
      // Membership: total revenue dari sport_payments
      db.execute(sql`SELECT COALESCE(SUM(amount),0) AS revenue FROM sport_payments WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND payment_type = 'membership' AND status = 'paid'`),
      // Membership: jumlah transaksi
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_payments WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND payment_type = 'membership' AND status = 'paid'`),
    ]);

    const bookingRevenue = Number((totalRev.rows[0] as any).revenue);
    const membershipRevenue = Number((membershipRevRes.rows[0] as any).revenue);
    res.json({
      totalBookings: Number((totals.rows[0] as any).cnt),
      todayBookings: Number((todayRes.rows[0] as any).cnt),
      pendingPayment: Number((pendingPayRes.rows[0] as any).cnt),
      activeMembers: Number((membersRes.rows[0] as any).cnt),
      totalMembers: Number((membersRes.rows[0] as any).cnt),
      expiredMembers: Number((expiredMembersRes.rows[0] as any).cnt),
      byStatus: byStatus.rows,
      topFacilities: topFacilities.rows,
      recentBookings: recentBookings.rows,
      monthRevenue: Number((monthRev.rows[0] as any).revenue),
      bookingRevenue,
      membershipRevenue,
      membershipPayments: Number((membershipPayCountRes.rows[0] as any).cnt),
      totalRevenue: bookingRevenue + membershipRevenue,
      totalPromoUsed: Number((promoUsedRes.rows[0] as any).cnt),
      totalPromoDiscount: Number((promoDiscountRes.rows[0] as any).total),
      cancelledBookings: Number((cancelledRes.rows[0] as any).cnt),
      totalRefunds: Number((totalRefundsRes.rows[0] as any).cnt),
      totalRefundAmount: Number((totalRefundAmountRes.rows[0] as any).total),
    });
  } catch {
    res.status(500).json({ error: "Gagal memuat dashboard" });
  }
});

// ── FASE 6D-B: KPI LIVE ───────────────────────────────────────────────────────
router.get("/kpi-live", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const costCenterId = req.query.costCenterId ? Number(req.query.costCenterId) : null;

    // Terima parameter date opsional (format YYYY-MM-DD), default ke CURRENT_DATE
    const rawDate = req.query.date as string | undefined;
    const isValidDate = rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate);
    const targetDate = isValidDate ? rawDate : null;

    const [
      revenueTodayRes,
      bookingsTodayRes,
      activeBookingsNowRes,
      checkinsTodayRes,
      membersActiveRes,
      refundsTodayRes,
      occupancyTodayRes,
      facilityCountRes,
      netProfitTodayRes,
    ] = await Promise.all([
      // Revenue dari accounting_entries (booking + membership)
      db.execute(sql`
        SELECT COALESCE(SUM(total_debit), 0) AS amount
        FROM accounting_entries
        WHERE source IN ('sport_center_booking','sport_center_membership')
          AND status = 'posted'
          AND date = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
      `),
      // Booking (bukan cancelled)
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_bookings
        WHERE booking_date = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND status != 'cancelled'
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Booking aktif (confirmed atau checked_in)
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_bookings
        WHERE booking_date = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND status IN ('confirmed','checked_in')
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Check-in
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_bookings
        WHERE DATE(checked_in_at) = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND status = 'checked_in'
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Member aktif
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_members
        WHERE status = 'active'
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Refund (amount)
      db.execute(sql`
        SELECT COALESCE(SUM(refund_amount), 0) AS amount
        FROM sport_refunds
        WHERE DATE(created_at) = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND status IN ('pending','paid')
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Occupancy: total jam terpakai dari booking
      db.execute(sql`
        SELECT COALESCE(SUM(duration_hours), 0) AS occupied_hours
        FROM sport_bookings
        WHERE booking_date = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND status NOT IN ('cancelled')
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Jumlah fasilitas aktif
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_facilities
        WHERE is_active = TRUE
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Net profit: revenue - refund (dari accounting)
      db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN source IN ('sport_center_booking','sport_center_membership') THEN total_debit ELSE 0 END), 0)
          - COALESCE(SUM(CASE WHEN source IN ('sport_center_refund','sport_center_booking_refund','sport_center_booking_reversal') THEN total_debit ELSE 0 END), 0) AS net
        FROM accounting_entries
        WHERE date = COALESCE(${targetDate}::date, CURRENT_DATE)
          AND status = 'posted'
          AND source IN ('sport_center_booking','sport_center_membership','sport_center_refund','sport_center_booking_refund','sport_center_booking_reversal')
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
      `),
    ]);

    const revenueToday = Number((revenueTodayRes.rows[0] as any).amount ?? 0);
    const refundsToday = Number((refundsTodayRes.rows[0] as any).amount ?? 0);
    const occupiedHoursToday = Number((occupancyTodayRes.rows[0] as any).occupied_hours ?? 0);
    const facilityCount = Number((facilityCountRes.rows[0] as any).cnt ?? 1);
    // available_hours = jumlah fasilitas × 14 jam operasional/hari
    const availableHoursToday = Math.max(facilityCount * 14, 1);
    const occupancyToday = Math.min(100, Math.round((occupiedHoursToday / availableHoursToday) * 100));

    res.json({
      revenue_today: revenueToday,
      bookings_today: Number((bookingsTodayRes.rows[0] as any).cnt ?? 0),
      active_bookings_now: Number((activeBookingsNowRes.rows[0] as any).cnt ?? 0),
      occupancy_today: occupancyToday,
      occupied_hours_today: occupiedHoursToday,
      available_hours_today: availableHoursToday,
      checkins_today: Number((checkinsTodayRes.rows[0] as any).cnt ?? 0),
      members_active: Number((membersActiveRes.rows[0] as any).cnt ?? 0),
      refunds_today: refundsToday,
      net_profit_today: Number((netProfitTodayRes.rows[0] as any).net ?? 0),
    });
  } catch (err) {
    console.error("[sport-center] GET /kpi-live error:", err);
    res.status(500).json({ error: "Gagal memuat KPI live" });
  }
});

// ── FASE 6D-C: REAL OCCUPANCY PER FACILITY ───────────────────────────────────
router.get("/occupancy", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const dateParam = req.query.date ? String(req.query.date) : null;

    const rows = await db.execute(sql`
      SELECT
        b.facility_id,
        b.facility_name,
        COALESCE(SUM(b.duration_hours), 0)                                     AS occupied_hours,
        COALESCE(MAX(f.capacity), 1) * 14                                      AS available_hours,
        LEAST(100, ROUND(
          COALESCE(SUM(b.duration_hours), 0)::numeric /
          GREATEST(COALESCE(MAX(f.capacity), 1) * 14, 1) * 100
        ))                                                                      AS occupancy_percent
      FROM sport_bookings b
      LEFT JOIN sport_facilities f ON f.id = b.facility_id
      WHERE b.status NOT IN ('cancelled')
        AND b.booking_date = COALESCE(${dateParam}::date, CURRENT_DATE)
        AND (${cId}::int IS NULL OR b.company_id = ${cId})
      GROUP BY b.facility_id, b.facility_name
      ORDER BY occupancy_percent DESC
    `);

    res.json(rows.rows);
  } catch (err) {
    console.error("[sport-center] GET /occupancy error:", err);
    res.status(500).json({ error: "Gagal memuat occupancy" });
  }
});

// ── FASE 6D-F: HEATMAP JAM RAMAI ─────────────────────────────────────────────
router.get("/heatmap", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;

    // Hitung booking count per jam mulai (dari start_time)
    const rows = await db.execute(sql`
      SELECT
        LPAD(EXTRACT(HOUR FROM start_time::time)::int::text, 2, '0') || ':00' AS hour,
        COUNT(*) AS booking_count
      FROM sport_bookings
      WHERE status NOT IN ('cancelled')
        AND start_time IS NOT NULL
        AND (${cId}::int IS NULL OR company_id = ${cId})
        AND (${from}::date IS NULL OR booking_date >= ${from}::date)
        AND (${to}::date IS NULL OR booking_date <= ${to}::date)
        AND (${facilityId}::int IS NULL OR facility_id = ${facilityId})
      GROUP BY EXTRACT(HOUR FROM start_time::time)
      ORDER BY EXTRACT(HOUR FROM start_time::time)
    `);

    // Isi jam kosong agar output lengkap 06:00–22:00
    const hourMap = new Map<string, number>();
    for (const r of rows.rows as any[]) {
      hourMap.set(String(r.hour), Number(r.booking_count));
    }
    const heatmap = [];
    for (let h = 6; h <= 22; h++) {
      const label = `${String(h).padStart(2, "0")}:00`;
      heatmap.push({ hour: label, booking_count: hourMap.get(label) ?? 0 });
    }

    res.json(heatmap);
  } catch (err) {
    console.error("[sport-center] GET /heatmap error:", err);
    res.status(500).json({ error: "Gagal memuat heatmap" });
  }
});

router.get("/facilities", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const result = await db.execute(sql`SELECT * FROM sport_facilities WHERE (${cId}::int IS NULL OR company_id = ${cId}) ORDER BY sort_order ASC, id ASC`);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/facilities/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const r = await db.execute(sql`SELECT * FROM sport_facilities WHERE id = ${Number(req.params.id)}`);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/facilities", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { name, type = "court", description, capacity = 1, price_per_hour = 0, is_active = true, sort_order = 0, image_url, company_id } = req.body;
    if (!name) return res.status(400).json({ error: "Nama wajib diisi" });
    const r = await db.execute(sql`
      INSERT INTO sport_facilities (company_id, name, type, description, capacity, price_per_hour, is_active, sort_order, image_url)
      VALUES (${company_id ?? null}, ${name}, ${type}, ${description ?? null}, ${capacity}, ${price_per_hour}, ${is_active}, ${sort_order}, ${image_url ?? null})
      RETURNING *
    `);
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "facility", action: "created", data: row, timestamp: new Date().toISOString() }, company_id);
    void syncFacilityUpsert(row as any);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal membuat fasilitas" });
  }
});

router.patch("/facilities/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { name, type, description, capacity, price_per_hour, is_active, sort_order, image_url } = req.body;
    const r = await db.execute(sql`
      UPDATE sport_facilities SET
        name = COALESCE(${name ?? null}, name),
        type = COALESCE(${type ?? null}, type),
        description = COALESCE(${description ?? null}, description),
        capacity = COALESCE(${capacity ?? null}::int, capacity),
        price_per_hour = COALESCE(${price_per_hour ?? null}::numeric, price_per_hour),
        is_active = COALESCE(${is_active ?? null}::boolean, is_active),
        sort_order = COALESCE(${sort_order ?? null}::int, sort_order),
        image_url = COALESCE(${image_url ?? null}, image_url),
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "facility", action: "updated", data: row, timestamp: new Date().toISOString() });
    void syncFacilityUpsert(row as any);
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal memperbarui" });
  }
});

router.delete("/facilities/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const lookup = await db.execute(sql`SELECT id, name FROM sport_facilities WHERE id = ${id}`);
    const existing = lookup.rows[0] as { id: number; name: string } | undefined;
    await db.execute(sql`DELETE FROM sport_facilities WHERE id = ${id}`);
    broadcastSportCenterEvent({ module: "sport-center", entity: "facility", action: "deleted", data: { id: req.params.id }, timestamp: new Date().toISOString() });
    if (existing) void syncFacilityDelete(existing.id, existing.name);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal menghapus" });
  }
});

router.post("/facilities/resync-all", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const includeBookings = req.query.include === "bookings" || req.body?.include === "bookings";
    const startedAt = new Date().toISOString();

    const facilityResult = await syncAllFacilities();
    let bookingResult: { synced: number; errors: number; total: number } | null = null;

    if (includeBookings) {
      bookingResult = await syncAllBookings();
    }

    res.json({
      success: true,
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      facilities: facilityResult,
      ...(bookingResult ? { bookings: bookingResult } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ error: "Resync gagal", detail: err?.message });
  }
});

router.post("/sync/bookings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const result = await syncAllBookings();
    res.json({ success: true, ...result, completed_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: "Booking resync gagal", detail: err?.message });
  }
});

router.post("/sync/pull-legacy", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const result = await pullLegacyBookingsFromSupabase();
    res.json({ success: true, ...result, completed_at: new Date().toISOString() });
  } catch (err: any) {
    res.status(500).json({ error: "Pull legacy bookings gagal", detail: err?.message });
  }
});

// Push booking dari frontend (Supabase anon) ke local PostgreSQL
router.post("/sync/push-bookings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { bookings, companyId } = req.body as {
      bookings: Array<{
        booking_code?: string | null;
        customer_name?: string | null;
        customer_phone?: string | null;
        customer_email?: string | null;
        facility_name?: string | null;
        date?: string | null;
        start_time?: string | null;
        end_time?: string | null;
        total_hours?: number | null;
        total_price?: number | null;
        status?: string | null;
        payment_status?: string | null;
        notes?: string | null;
        created_at?: string | null;
      }>;
      companyId?: number;
    };
    if (!Array.isArray(bookings) || bookings.length === 0) {
      return res.json({ success: true, pushed: 0, errors: 0, total: 0 });
    }
    const cId = companyId ?? 1;
    let pushed = 0;
    let errors = 0;
    for (const row of bookings) {
      try {
        const bookingNumber = row.booking_code ?? `LEGACY-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
        const facilityName = row.facility_name ?? "Unknown";
        const bookingDate = row.date;
        if (!bookingDate) { errors++; continue; }
        const startTime = (row.start_time ?? "").slice(0, 5) || "00:00";
        const endTime   = (row.end_time   ?? "").slice(0, 5) || "01:00";
        const durationHours = Number(row.total_hours ?? 1);
        const totalAmount   = Number(row.total_price ?? 0);
        const rawStatus     = row.status ?? "pending";
        const mappedStatus  = rawStatus === "confirmed" ? "confirmed"
          : rawStatus === "cancelled" ? "cancelled"
          : rawStatus === "completed" ? "completed"
          : "pending";
        const paymentStatus = row.payment_status ?? "unpaid";
        const existing = await db.execute(sql`SELECT id FROM sport_bookings WHERE booking_number = ${bookingNumber} LIMIT 1`);
        if (existing.rows.length > 0) {
          await db.execute(sql`
            UPDATE sport_bookings SET
              customer_name   = ${row.customer_name ?? ""},
              customer_phone  = ${row.customer_phone ?? null},
              facility_name   = ${facilityName},
              booking_date    = ${bookingDate}::DATE,
              start_time      = ${startTime}::TIME,
              end_time        = ${endTime}::TIME,
              duration_hours  = ${durationHours},
              base_amount     = ${totalAmount},
              total_amount    = ${totalAmount},
              status          = ${mappedStatus},
              payment_status  = ${paymentStatus},
              notes           = ${row.notes ?? null},
              updated_at      = NOW()
            WHERE booking_number = ${bookingNumber}
          `);
        } else {
          await db.execute(sql`
            INSERT INTO sport_bookings
              (company_id, booking_number, customer_name, customer_phone,
               facility_name, booking_date, start_time, end_time,
               duration_hours, base_amount, total_amount,
               status, payment_status, notes, created_at, updated_at)
            VALUES
              (${cId}, ${bookingNumber}, ${row.customer_name ?? ""}, ${row.customer_phone ?? null},
               ${facilityName}, ${bookingDate}::DATE, ${startTime}::TIME, ${endTime}::TIME,
               ${durationHours}, ${totalAmount}, ${totalAmount},
               ${mappedStatus}, ${paymentStatus}, ${row.notes ?? null},
               ${row.created_at ?? new Date().toISOString()}::TIMESTAMPTZ, NOW())
          `);
        }
        pushed++;
      } catch (err) {
        console.error("[sport-center] push-bookings row error:", err);
        errors++;
      }
    }
    // Invalidate dashboard after push
    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "synced", data: { pushed, errors }, timestamp: new Date().toISOString() });
    res.json({ success: true, pushed, errors, total: bookings.length });
  } catch (err: any) {
    res.status(500).json({ error: "Push bookings gagal", detail: err?.message });
  }
});

router.get("/sync/status", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const [logs, facilityCount, bookingCount, lastFacilitySync, lastBookingSync] = await Promise.all([
      getLastSyncLogs(limit),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_facilities WHERE is_active = TRUE`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings`),
      db.execute(sql`SELECT created_at, status, detail FROM sport_sync_logs WHERE entity = 'facility' ORDER BY created_at DESC LIMIT 1`),
      db.execute(sql`SELECT created_at, status, detail FROM sport_sync_logs WHERE entity = 'booking' ORDER BY created_at DESC LIMIT 1`),
    ]);

    res.json({
      local: {
        facilities: Number((facilityCount.rows[0] as any).cnt),
        bookings: Number((bookingCount.rows[0] as any).cnt),
      },
      last_facility_sync: lastFacilitySync.rows[0] ?? null,
      last_booking_sync: lastBookingSync.rows[0] ?? null,
      recent_logs: logs,
    });
  } catch (err: any) {
    res.status(500).json({ error: "Gagal memuat status sinkronisasi", detail: err?.message });
  }
});

router.get("/bookings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const status = (req.query.status as string) ?? null;
    const date = (req.query.date as string) ?? null;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = 50;
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      db.execute(sql`
        SELECT * FROM sport_bookings
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${status}::text IS NULL OR status = ${status})
          AND (${date}::date IS NULL OR booking_date = ${date}::date)
        ORDER BY booking_date DESC, start_time DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM sport_bookings
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${status}::text IS NULL OR status = ${status})
          AND (${date}::date IS NULL OR booking_date = ${date}::date)
      `),
    ]);

    res.json({ data: dataRes.rows, total: Number((countRes.rows[0] as any).cnt) });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/bookings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const {
      company_id, customer_id, customer_name, customer_phone, facility_id, facility_name,
      booking_date, start_time, end_time, duration_hours = 1, base_amount = 0,
      notes,
    } = req.body;
    if (!customer_name || !facility_name || !booking_date || !start_time || !end_time) {
      return res.status(400).json({ error: "Field wajib tidak lengkap" });
    }

    // Ambil customer_email dari request atau lookup dari sport_customers
    let customerEmail: string | null = req.body.customer_email ?? null;
    if (!customerEmail && customer_id) {
      const custRes = await db.execute(sql`SELECT email FROM sport_customers WHERE id = ${customer_id} LIMIT 1`);
      customerEmail = (custRes.rows[0] as Record<string, unknown>)?.email as string ?? null;
    }

    // Validasi dan hitung promo
    let resolvedPromoId: number | null = null;
    let resolvedPromoCode: string | null = req.body.promo_code ?? null;
    let resolvedDiscount = Number(req.body.discount_amount ?? 0);
    const inputPromoCode: string | null = req.body.promo_code ?? null;

    if (inputPromoCode) {
      const cId = company_id ?? null;
      const promoRes = await db.execute(sql`
        SELECT * FROM sport_promos
        WHERE code = ${inputPromoCode}
          AND is_active = TRUE
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (valid_from IS NULL OR valid_from <= NOW())
          AND (valid_until IS NULL OR valid_until >= NOW())
        LIMIT 1
      `);
      if (!promoRes.rows.length) {
        return res.status(400).json({ error: "Kode promo tidak valid atau sudah kadaluarsa" });
      }
      const promo = promoRes.rows[0] as Record<string, unknown>;
      if (promo.max_uses != null && Number(promo.used_count) >= Number(promo.max_uses)) {
        return res.status(400).json({ error: "Kuota promo sudah habis" });
      }
      if (promo.min_amount != null && Number(base_amount) < Number(promo.min_amount)) {
        return res.status(400).json({ error: `Minimum transaksi untuk promo ini adalah ${promo.min_amount}` });
      }
      const dtype = String(promo.discount_type);
      const dval = Number(promo.discount_value);
      resolvedDiscount = dtype === "fixed"
        ? Math.min(dval, Number(base_amount))
        : Math.min(Number(base_amount) * dval / 100, Number(base_amount));
      resolvedDiscount = Math.round(resolvedDiscount * 100) / 100;
      resolvedPromoId = Number(promo.id);
      resolvedPromoCode = String(promo.code);
    }

    const resolvedTotal = Math.max(0, Number(base_amount) - resolvedDiscount);

    // PPN 11% jika apply_tax = true
    const applyTax = Boolean(req.body.apply_tax ?? false);
    const TAX_RATE = 11;
    const taxRate   = applyTax ? TAX_RATE : 0;
    const taxAmount = applyTax ? Math.round(resolvedTotal * TAX_RATE) / 100 : 0;

    const bookingNumber = await nextBookingNumber(company_id);
    const r = await db.execute(sql`
      INSERT INTO sport_bookings
        (company_id, booking_number, customer_id, customer_name, customer_email, customer_phone, facility_id, facility_name,
         booking_date, start_time, end_time, duration_hours, base_amount, discount_amount, total_amount,
         tax_rate, tax_amount,
         promo_id, promo_code, notes, status, payment_status)
      VALUES
        (${company_id ?? null}, ${bookingNumber}, ${customer_id ?? null}, ${customer_name}, ${customerEmail ?? null}, ${customer_phone ?? null},
         ${facility_id ?? null}, ${facility_name}, ${booking_date}, ${start_time}, ${end_time},
         ${duration_hours}, ${base_amount}, ${resolvedDiscount}, ${resolvedTotal},
         ${taxRate}, ${taxAmount},
         ${resolvedPromoId}, ${resolvedPromoCode}, ${notes ?? null}, 'pending', 'unpaid')
      RETURNING *
    `);

    // Increment used_count jika promo dipakai
    if (resolvedPromoId) {
      await db.execute(sql`UPDATE sport_promos SET used_count = used_count + 1, updated_at = NOW() WHERE id = ${resolvedPromoId}`);
    }

    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "created", data: row, timestamp: new Date().toISOString() }, company_id);
    void syncBookingUpsert(row as any);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal membuat booking" });
  }
});

router.patch("/bookings/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { status, payment_status, notes } = req.body;
    const r = await db.execute(sql`
      UPDATE sport_bookings SET
        status = COALESCE(${status ?? null}, status),
        payment_status = COALESCE(${payment_status ?? null}, payment_status),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    const row = r.rows[0] as Record<string, unknown>;

    // Safety net: jika payment_status di-set ke 'paid' lewat PATCH (bukan POST /payments),
    // pastikan sport_payment record dan jurnal akuntansi tetap dibuat
    if (payment_status === 'paid') {
      const existingPayment = await db.execute(sql`
        SELECT id FROM sport_payments WHERE booking_id = ${id} LIMIT 1
      `);
      if (!existingPayment.rows.length) {
        const createdById = (req.user as { id: string } | undefined)?.id ?? null;
        const paymentNumber = await nextPaymentNumber(Number(row.company_id ?? null));
        const payR = await db.execute(sql`
          INSERT INTO sport_payments (company_id, booking_id, payment_number, amount, method, status, paid_at, notes)
          VALUES (${row.company_id ?? null}, ${id}, ${paymentNumber}, ${row.total_amount}, 'cash', 'paid', NOW(), 'Auto-created via PATCH')
          RETURNING *
        `);
        const bTaxAmount = Number(row.tax_amount ?? 0);
        const bTotalAmount = Number(row.total_amount ?? 0);
        const bCompanyId = row.company_id != null ? Number(row.company_id) : null;
        if (bTaxAmount > 0) {
          postSportCenterBookingWithTax({
            bookingId: id,
            bookingCode: String(row.booking_number ?? paymentNumber),
            customerName: String(row.customer_name ?? ""),
            facilityName: String(row.facility_name ?? ""),
            date: String(row.booking_date ?? new Date().toISOString().slice(0, 10)),
            baseAmount: bTotalAmount,
            taxAmount: bTaxAmount,
            createdById,
            companyId: bCompanyId,
          }).catch((err: unknown) => console.error('[sport-center] postSportCenterBookingWithTax (PATCH safety net) failed:', err));
        } else {
          postSportCenterBooking({
            bookingId: id,
            bookingCode: String(row.booking_number ?? paymentNumber),
            customerName: String(row.customer_name ?? ""),
            facilityName: String(row.facility_name ?? ""),
            date: String(row.booking_date ?? new Date().toISOString().slice(0, 10)),
            totalPrice: bTotalAmount,
            createdById,
            companyId: bCompanyId,
          }).catch((err: unknown) => console.error('[sport-center] postSportCenterBooking (PATCH safety net) failed:', err));
        }
        // Audit log untuk auto-payment
        await db.execute(sql`
          INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
          VALUES (
            ${bCompanyId}, 'payment', ${(payR.rows[0] as Record<string, unknown>)?.id ?? null},
            'PAYMENT_AUTO_CREATED_VIA_PATCH', ${createdById},
            ${JSON.stringify(payR.rows[0])}::jsonb
          )
        `);
        broadcastSportCenterEvent({ module: "sport-center", entity: "payment", action: "created", data: payR.rows[0] as Record<string, unknown>, timestamp: new Date().toISOString() }, bCompanyId as number | undefined);
      }
    }

    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "updated", data: row, timestamp: new Date().toISOString() });
    void syncBookingUpsert(row as any);
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal memperbarui" });
  }
});

router.post("/bookings/:id/checkin", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const r = await db.execute(sql`
      UPDATE sport_bookings SET status = 'checked_in', checked_in_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND status IN ('pending','confirmed') RETURNING *
    `);
    if (!r.rows.length) return res.status(400).json({ error: "Booking tidak dapat di-check-in" });
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "checkin", data: row, timestamp: new Date().toISOString() });
    void syncBookingUpsert(row as any);
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal check-in" });
  }
});

router.post("/bookings/:id/cancel", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { cancel_reason } = req.body;
    const createdById = (req.user as { id: string } | undefined)?.id ?? null;

    // Fetch booking
    const bookingRes = await db.execute(sql`SELECT * FROM sport_bookings WHERE id = ${id} LIMIT 1`);
    if (!bookingRes.rows.length) return res.status(404).json({ error: "Booking tidak ditemukan" });
    const booking = bookingRes.rows[0] as Record<string, unknown>;

    if (booking.status === "cancelled") return res.status(400).json({ error: "Booking sudah dibatalkan" });
    if (booking.status === "completed") return res.status(400).json({ error: "Booking yang sudah selesai tidak dapat dibatalkan" });

    // Update status booking
    const updated = await db.execute(sql`
      UPDATE sport_bookings
      SET status = 'cancelled', cancelled_at = NOW(), cancelled_reason = ${cancel_reason ?? null}, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    const row = updated.rows[0] as Record<string, unknown>;

    // Cari total pembayaran yang sudah diposting ke jurnal
    const paidRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount), 0) AS total FROM sport_payments
      WHERE booking_id = ${id} AND status = 'paid'
    `);
    const amountPaid = Number((paidRes.rows[0] as any).total);

    // Reversal jurnal jika ada pembayaran yang sudah terposting
    let amountReversed = 0;
    if (amountPaid > 0) {
      amountReversed = amountPaid;
      postSportCenterBookingReversal({
        bookingId: id,
        bookingCode: String(booking.booking_number ?? booking.booking_code ?? `BK-${id}`),
        customerName: String(booking.customer_name ?? ""),
        facilityName: String(booking.facility_name ?? ""),
        companyId: booking.company_id != null ? Number(booking.company_id) : null,
      }).catch(() => {});
    }

    // Audit log
    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (
        ${booking.company_id ?? null},
        'booking',
        ${id},
        'BOOKING_CANCELLED',
        ${createdById},
        ${JSON.stringify({ reason: cancel_reason ?? null, amount_reversed: amountReversed })}::jsonb
      )
    `);

    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "cancelled", data: row, timestamp: new Date().toISOString() }, booking.company_id as number | undefined);
    void syncBookingUpsert(row as any);
    res.json({ ...row, amount_reversed: amountReversed });
  } catch {
    res.status(500).json({ error: "Gagal membatalkan booking" });
  }
});

router.get("/customers", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const search = (req.query.search as string) ?? null;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = 50;
    const offset = (page - 1) * limit;
    const searchLike = search ? `%${search}%` : null;

    const [dataRes, countRes] = await Promise.all([
      db.execute(sql`
        SELECT * FROM sport_customers
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${searchLike}::text IS NULL OR name ILIKE ${searchLike} OR phone ILIKE ${searchLike})
        ORDER BY name ASC LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM sport_customers
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${searchLike}::text IS NULL OR name ILIKE ${searchLike} OR phone ILIKE ${searchLike})
      `),
    ]);

    res.json({ data: dataRes.rows, total: Number((countRes.rows[0] as any).cnt) });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/customers", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { company_id, name, email, phone, address, notes } = req.body;
    if (!name) return res.status(400).json({ error: "Nama wajib" });
    const r = await db.execute(sql`
      INSERT INTO sport_customers (company_id, name, email, phone, address, notes)
      VALUES (${company_id ?? null}, ${name}, ${email ?? null}, ${phone ?? null}, ${address ?? null}, ${notes ?? null})
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.patch("/customers/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { name, email, phone, address, notes } = req.body;
    const r = await db.execute(sql`
      UPDATE sport_customers SET
        name = COALESCE(${name ?? null}, name),
        email = COALESCE(${email ?? null}, email),
        phone = COALESCE(${phone ?? null}, phone),
        address = COALESCE(${address ?? null}, address),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)} RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.delete("/customers/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    await db.execute(sql`DELETE FROM sport_customers WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/members", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const memberType = (req.query.memberType as string) ?? null;
    const status = (req.query.status as string) ?? null;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = 50;
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      db.execute(sql`
        SELECT * FROM sport_members
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${memberType}::text IS NULL OR member_type = ${memberType})
          AND (${status}::text IS NULL OR status = ${status})
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM sport_members
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${memberType}::text IS NULL OR member_type = ${memberType})
          AND (${status}::text IS NULL OR status = ${status})
      `),
    ]);

    res.json({ data: dataRes.rows, total: Number((countRes.rows[0] as any).cnt) });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/members", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { company_id, customer_id, name, email, phone, member_type = "gym", start_date, end_date, notes } = req.body;
    if (!name || !start_date) return res.status(400).json({ error: "Nama dan tanggal mulai wajib" });
    const memberNumber = await nextMemberNumber(company_id);
    const r = await db.execute(sql`
      INSERT INTO sport_members (company_id, customer_id, name, email, phone, member_type, member_number, start_date, end_date, status, notes)
      VALUES (${company_id ?? null}, ${customer_id ?? null}, ${name}, ${email ?? null}, ${phone ?? null},
              ${member_type}, ${memberNumber}, ${start_date}, ${end_date ?? null}, 'active', ${notes ?? null})
      RETURNING *
    `);
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "member", action: "created", data: row, timestamp: new Date().toISOString() }, company_id);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.patch("/members/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { name, email, phone, member_type, start_date, end_date, status, notes } = req.body;
    const r = await db.execute(sql`
      UPDATE sport_members SET
        name = COALESCE(${name ?? null}, name),
        email = COALESCE(${email ?? null}, email),
        phone = COALESCE(${phone ?? null}, phone),
        member_type = COALESCE(${member_type ?? null}, member_type),
        start_date = COALESCE(${start_date ?? null}::date, start_date),
        end_date = COALESCE(${end_date ?? null}::date, end_date),
        status = COALESCE(${status ?? null}, status),
        notes = COALESCE(${notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)} RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "member", action: "updated", data: row, timestamp: new Date().toISOString() });
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.delete("/members/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    await db.execute(sql`DELETE FROM sport_members WHERE id = ${Number(req.params.id)}`);
    broadcastSportCenterEvent({ module: "sport-center", entity: "member", action: "deleted", data: { id: req.params.id }, timestamp: new Date().toISOString() });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

// ── MEMBERSHIP PAYMENT ────────────────────────────────────────────────────────

router.post("/members/:id/payment", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const memberId = Number(req.params.id);
    if (isNaN(memberId)) return res.status(400).json({ error: "ID member tidak valid" });

    const { amount, payment_method = "cash", notes } = req.body as {
      amount: unknown;
      payment_method?: string;
      notes?: string;
    };

    // Validasi amount
    const amt = Number(amount);
    if (!amount || isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: "amount wajib diisi dan harus lebih dari 0" });
    }

    // Cek member
    const memberRes = await db.execute(sql`
      SELECT * FROM sport_members WHERE id = ${memberId} LIMIT 1
    `);
    if (!memberRes.rows.length) return res.status(404).json({ error: "Member tidak ditemukan" });
    const member = memberRes.rows[0] as Record<string, unknown>;

    if (member.status !== "active") {
      return res.status(400).json({ error: `Member tidak aktif (status: ${member.status})` });
    }
    if (!member.company_id) {
      return res.status(400).json({ error: "company_id member tidak tersedia" });
    }

    const companyId = Number(member.company_id);
    const paymentNumber = await nextPaymentNumber(companyId);
    const actorId = (req.user as { id: string } | undefined)?.id ?? null;

    const payRes = await db.execute(sql`
      INSERT INTO sport_payments
        (company_id, payment_number, payment_type, member_id, customer_id, amount, method, status, paid_at, notes, created_by)
      VALUES
        (${companyId}, ${paymentNumber}, 'membership', ${memberId},
         ${member.customer_id ?? null}, ${amt}, ${payment_method}, 'paid', NOW(),
         ${notes ?? null}, ${actorId})
      RETURNING *
    `);
    const payment = payRes.rows[0] as Record<string, unknown>;

    // Post jurnal accounting — fire-and-forget
    postSportCenterMembershipPayment({
      paymentId: Number(payment.id),
      paymentNumber,
      memberNumber: String(member.member_number ?? `MBR-${memberId}`),
      memberName: String(member.name ?? ""),
      amount: amt,
      companyId,
    }).catch(() => {});

    // Audit log
    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (
        ${companyId}, 'member', ${memberId},
        'MEMBERSHIP_PAYMENT_CREATED', ${actorId},
        ${JSON.stringify({ member_id: memberId, amount: amt, payment_method, payment_number: paymentNumber })}::jsonb
      )
    `);

    // Sync ke accounting_payments agar muncul di halaman Accounting → Payments
    insertAccountingPaymentForSportCenter({
      companyId,
      paymentNumber,
      amount: amt,
      method: payment_method,
      partnerName: String(member.name ?? ""),
      ref: String(member.member_number ?? paymentNumber),
      memo: `Pembayaran membership sport center`,
      sourceDocId: Number(payment.id),
      createdById: actorId,
    }).catch((err: unknown) => console.error("[sport-center] insertAccountingPayment (membership) failed:", err));

    broadcastSportCenterEvent(
      { module: "sport-center", entity: "payment", action: "created", data: payment, timestamp: new Date().toISOString() },
      companyId,
    );
    res.status(201).json(payment);
  } catch (err) {
    console.error("[membership payment]", err);
    res.status(500).json({ error: "Gagal memproses pembayaran membership" });
  }
});

router.get("/pricing-rules", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
    const r = await db.execute(sql`
      SELECT pr.*, sf.name AS facility_name FROM sport_pricing_rules pr
      LEFT JOIN sport_facilities sf ON pr.facility_id = sf.id
      WHERE (${cId}::int IS NULL OR pr.company_id = ${cId})
        AND (${facilityId}::int IS NULL OR pr.facility_id = ${facilityId})
      ORDER BY pr.facility_id ASC, pr.time_start ASC
    `);
    res.json(r.rows);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/pricing-rules", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { company_id, facility_id, name, day_type = "all", time_start, time_end, price_per_hour, is_active = true } = req.body;
    if (!facility_id || !name || price_per_hour === undefined) return res.status(400).json({ error: "Field wajib tidak lengkap" });
    const r = await db.execute(sql`
      INSERT INTO sport_pricing_rules (company_id, facility_id, name, day_type, time_start, time_end, price_per_hour, is_active)
      VALUES (${company_id ?? null}, ${facility_id}, ${name}, ${day_type}, ${time_start ?? null}, ${time_end ?? null}, ${price_per_hour}, ${is_active})
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.patch("/pricing-rules/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { name, day_type, time_start, time_end, price_per_hour, is_active } = req.body;
    const r = await db.execute(sql`
      UPDATE sport_pricing_rules SET
        name = COALESCE(${name ?? null}, name),
        day_type = COALESCE(${day_type ?? null}, day_type),
        time_start = COALESCE(${time_start ?? null}::time, time_start),
        time_end = COALESCE(${time_end ?? null}::time, time_end),
        price_per_hour = COALESCE(${price_per_hour ?? null}::numeric, price_per_hour),
        is_active = COALESCE(${is_active ?? null}::boolean, is_active),
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)} RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.delete("/pricing-rules/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    await db.execute(sql`DELETE FROM sport_pricing_rules WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

// ── PROMO ────────────────────────────────────────────────────────────────────

router.get("/promos", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const result = await db.execute(sql`
      SELECT * FROM sport_promos
      WHERE (${cId}::int IS NULL OR company_id = ${cId})
      ORDER BY created_at DESC
    `);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/promos", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const {
      company_id, code, name, description,
      discount_type = "percentage", discount_value,
      min_amount = 0, max_uses, valid_from, valid_until, is_active = true,
    } = req.body;
    if (!code || !name || discount_value == null) {
      return res.status(400).json({ error: "code, name, dan discount_value wajib" });
    }
    if (!["percentage", "percent", "fixed"].includes(discount_type)) {
      return res.status(400).json({ error: "discount_type harus 'percentage' atau 'fixed'" });
    }
    if (Number(discount_value) < 0) {
      return res.status(400).json({ error: "discount_value tidak boleh negatif" });
    }
    if (discount_type !== "fixed" && Number(discount_value) > 100) {
      return res.status(400).json({ error: "discount_value persentase tidak boleh melebihi 100" });
    }
    // Normalisasi: simpan sebagai 'percent' agar konsisten dengan schema default
    const dtype = discount_type === "fixed" ? "fixed" : "percent";
    // Cek keunikan code per company
    const cId = company_id ?? null;
    const dupCheck = await db.execute(sql`
      SELECT id FROM sport_promos WHERE code = ${code} AND (${cId}::int IS NULL OR company_id = ${cId}) LIMIT 1
    `);
    if (dupCheck.rows.length) {
      return res.status(409).json({ error: "Kode promo sudah digunakan" });
    }
    const r = await db.execute(sql`
      INSERT INTO sport_promos (company_id, code, name, description, discount_type, discount_value, min_amount, max_uses, valid_from, valid_until, is_active)
      VALUES (${cId}, ${code}, ${name}, ${description ?? null}, ${dtype}, ${Number(discount_value)}, ${Number(min_amount)}, ${max_uses ?? null}, ${valid_from ?? null}, ${valid_until ?? null}, ${is_active})
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal membuat promo" });
  }
});

router.patch("/promos/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { code, name, description, discount_type, discount_value, min_amount, max_uses, valid_from, valid_until, is_active } = req.body;
    if (discount_type != null && !["percentage", "percent", "fixed"].includes(discount_type)) {
      return res.status(400).json({ error: "discount_type harus 'percentage' atau 'fixed'" });
    }
    const dtype = discount_type === "fixed" ? "fixed" : discount_type != null ? "percent" : null;
    const r = await db.execute(sql`
      UPDATE sport_promos SET
        code         = COALESCE(${code ?? null}, code),
        name         = COALESCE(${name ?? null}, name),
        description  = COALESCE(${description ?? null}, description),
        discount_type  = COALESCE(${dtype}, discount_type),
        discount_value = COALESCE(${discount_value ?? null}::numeric, discount_value),
        min_amount   = COALESCE(${min_amount ?? null}::numeric, min_amount),
        max_uses     = COALESCE(${max_uses ?? null}::int, max_uses),
        valid_from   = COALESCE(${valid_from ?? null}::timestamptz, valid_from),
        valid_until  = COALESCE(${valid_until ?? null}::timestamptz, valid_until),
        is_active    = COALESCE(${is_active ?? null}::boolean, is_active),
        updated_at   = NOW()
      WHERE id = ${id} RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal memperbarui promo" });
  }
});

router.delete("/promos/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    // Soft delete jika sudah dipakai di booking, hard delete jika belum
    const usedRes = await db.execute(sql`SELECT id FROM sport_bookings WHERE promo_id = ${id} LIMIT 1`);
    if (usedRes.rows.length) {
      await db.execute(sql`UPDATE sport_promos SET is_active = FALSE, updated_at = NOW() WHERE id = ${id}`);
      res.json({ success: true, note: "Promo dinonaktifkan karena sudah dipakai di booking" });
    } else {
      await db.execute(sql`DELETE FROM sport_promos WHERE id = ${id}`);
      res.json({ success: true });
    }
  } catch {
    res.status(500).json({ error: "Gagal menghapus promo" });
  }
});

router.get("/payments", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = 50;
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      db.execute(sql`
        SELECT p.*, b.booking_number, b.customer_name FROM sport_payments p
        LEFT JOIN sport_bookings b ON p.booking_id = b.id
        WHERE (${cId}::int IS NULL OR p.company_id = ${cId})
        ORDER BY p.created_at DESC LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM sport_payments p
        WHERE (${cId}::int IS NULL OR p.company_id = ${cId})
      `),
    ]);
    res.json({ data: dataRes.rows, total: Number((countRes.rows[0] as any).cnt) });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/payments", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { company_id, booking_id, amount, method = "cash", notes } = req.body;
    if (!booking_id || !amount) return res.status(400).json({ error: "booking_id dan amount wajib" });
    const paymentNumber = await nextPaymentNumber(company_id);
    const r = await db.execute(sql`
      INSERT INTO sport_payments (company_id, booking_id, payment_number, amount, method, status, paid_at, notes)
      VALUES (${company_id ?? null}, ${booking_id}, ${paymentNumber}, ${amount}, ${method}, 'paid', NOW(), ${notes ?? null})
      RETURNING *
    `);
    await db.execute(sql`UPDATE sport_bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = ${booking_id}`);
    const row = r.rows[0] as Record<string, unknown>;

    // Post jurnal accounting (dengan PPN jika ada) — fire-and-forget
    const bookingRes = await db.execute(sql`
      SELECT booking_number, customer_name, facility_name, booking_date, total_amount, tax_rate, tax_amount, company_id
      FROM sport_bookings WHERE id = ${booking_id} LIMIT 1
    `);
    if (bookingRes.rows.length) {
      const b = bookingRes.rows[0] as Record<string, unknown>;
      const createdById = (req.user as { id: string } | undefined)?.id ?? null;
      const bTaxAmount = Number(b.tax_amount ?? 0);
      const bTotalAmount = Number(b.total_amount ?? amount);
      // Gunakan company_id dari booking record; fallback ke request body; fallback ke 1 (default company)
      const bCompanyId = b.company_id != null ? Number(b.company_id) : (company_id != null ? Number(company_id) : 1);
      if (bTaxAmount > 0) {
        postSportCenterBookingWithTax({
          bookingId: booking_id,
          bookingCode: String(b.booking_number ?? paymentNumber),
          customerName: String(b.customer_name ?? ""),
          facilityName: String(b.facility_name ?? ""),
          date: String(b.booking_date ?? new Date().toISOString().slice(0, 10)),
          baseAmount: bTotalAmount,
          taxAmount: bTaxAmount,
          createdById,
          companyId: bCompanyId,
        }).catch((err: unknown) => console.error('[sport-center] postSportCenterBookingWithTax failed:', err));
      } else {
        postSportCenterBooking({
          bookingId: booking_id,
          bookingCode: String(b.booking_number ?? paymentNumber),
          customerName: String(b.customer_name ?? ""),
          facilityName: String(b.facility_name ?? ""),
          date: String(b.booking_date ?? new Date().toISOString().slice(0, 10)),
          totalPrice: bTotalAmount,
          createdById,
          companyId: bCompanyId,
        }).catch((err: unknown) => console.error('[sport-center] postSportCenterBooking failed:', err));
      }

      // Sync ke accounting_payments agar muncul di halaman Accounting → Payments
      insertAccountingPaymentForSportCenter({
        companyId: bCompanyId,
        paymentNumber,
        amount: Number(amount),
        method: method ?? "cash",
        partnerName: String(b.customer_name ?? ""),
        ref: String(b.booking_number ?? paymentNumber),
        memo: `Pembayaran booking sport center`,
        sourceDocId: Number(row.id),
        date: String(b.booking_date ?? new Date().toISOString().slice(0, 10)),
        createdById,
      }).catch((err: unknown) => console.error("[sport-center] insertAccountingPayment failed:", err));
    }

    // Audit log pembayaran
    const createdByIdForLog = (req.user as { id: string } | undefined)?.id ?? null;
    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (
        ${company_id ?? null}, 'payment', ${row.id ?? null},
        'PAYMENT_CREATED', ${createdByIdForLog},
        ${JSON.stringify({ booking_id, amount, method, payment_number: paymentNumber })}::jsonb
      )
    `).catch((err: unknown) => console.error('[sport-center] audit log failed:', err));

    broadcastSportCenterEvent({ module: "sport-center", entity: "payment", action: "created", data: row, timestamp: new Date().toISOString() }, company_id);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/reports", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const from = (req.query.from as string) ?? null;
    const to = (req.query.to as string) ?? null;

    const [revenueByDay, revenueByFacility, bookingsByStatus, bookingRevRes, membershipRevReportRes] = await Promise.all([
      db.execute(sql`
        SELECT booking_date, COUNT(*) AS bookings, COALESCE(SUM(total_amount),0) AS revenue
        FROM sport_bookings
        WHERE status != 'cancelled'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${from}::date IS NULL OR booking_date >= ${from}::date)
          AND (${to}::date IS NULL OR booking_date <= ${to}::date)
        GROUP BY booking_date ORDER BY booking_date DESC LIMIT 30
      `),
      db.execute(sql`
        SELECT facility_name, COUNT(*) AS bookings, COALESCE(SUM(total_amount),0) AS revenue
        FROM sport_bookings
        WHERE status != 'cancelled'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${from}::date IS NULL OR booking_date >= ${from}::date)
          AND (${to}::date IS NULL OR booking_date <= ${to}::date)
        GROUP BY facility_name ORDER BY revenue DESC
      `),
      db.execute(sql`
        SELECT status, COUNT(*) AS count FROM sport_bookings
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
        GROUP BY status
      `),
      // Booking revenue dalam range
      db.execute(sql`
        SELECT COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings
        WHERE status != 'cancelled'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${from}::date IS NULL OR booking_date >= ${from}::date)
          AND (${to}::date IS NULL OR booking_date <= ${to}::date)
      `),
      // Membership revenue dalam range
      db.execute(sql`
        SELECT COALESCE(SUM(amount),0) AS revenue FROM sport_payments
        WHERE payment_type = 'membership' AND status = 'paid'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${from}::date IS NULL OR paid_at::date >= ${from}::date)
          AND (${to}::date IS NULL OR paid_at::date <= ${to}::date)
      `),
    ]);

    const bookingRevenue = Number((bookingRevRes.rows[0] as any).revenue);
    const membershipRevenue = Number((membershipRevReportRes.rows[0] as any).revenue);
    res.json({
      revenueByDay: revenueByDay.rows,
      revenueByFacility: revenueByFacility.rows,
      bookingsByStatus: bookingsByStatus.rows,
      bookingRevenue,
      membershipRevenue,
      grandTotalRevenue: bookingRevenue + membershipRevenue,
    });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

// ── REFUNDS ──────────────────────────────────────────────────────────────────

router.get("/refunds", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const statusFilter = req.query.status ? String(req.query.status) : null;
    const bookingId = req.query.bookingId ? Number(req.query.bookingId) : null;
    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;

    const rows = await db.execute(sql`
      SELECT r.*,
             b.booking_number, b.facility_name, b.booking_date,
             c.name AS customer_name_detail
      FROM sport_refunds r
      LEFT JOIN sport_bookings b ON b.id = r.booking_id
      LEFT JOIN sport_customers c ON c.id = r.customer_id
      WHERE (${cId}::int IS NULL OR r.company_id = ${cId})
        AND (${statusFilter}::text IS NULL OR r.status = ${statusFilter})
        AND (${bookingId}::int IS NULL OR r.booking_id = ${bookingId})
      ORDER BY r.created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `);
    const totalRes = await db.execute(sql`
      SELECT COUNT(*) AS cnt FROM sport_refunds r
      WHERE (${cId}::int IS NULL OR r.company_id = ${cId})
        AND (${statusFilter}::text IS NULL OR r.status = ${statusFilter})
        AND (${bookingId}::int IS NULL OR r.booking_id = ${bookingId})
    `);
    res.json({ data: rows.rows, total: Number((totalRes.rows[0] as any).cnt), page, limit });
  } catch {
    res.status(500).json({ error: "Gagal memuat refund" });
  }
});

router.post("/refunds", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { company_id, booking_id, payment_id, refund_amount, refund_reason } = req.body;
    const actorId = (req.user as { id: string } | undefined)?.id ?? null;

    if (!booking_id || !refund_amount) {
      return res.status(400).json({ error: "booking_id dan refund_amount wajib" });
    }
    const amt = Number(refund_amount);
    if (isNaN(amt) || amt <= 0) {
      return res.status(400).json({ error: "refund_amount harus berupa angka positif" });
    }

    // Validasi: booking harus dalam status cancelled
    const bookingRes = await db.execute(sql`SELECT * FROM sport_bookings WHERE id = ${Number(booking_id)} LIMIT 1`);
    if (!bookingRes.rows.length) return res.status(404).json({ error: "Booking tidak ditemukan" });
    const booking = bookingRes.rows[0] as Record<string, unknown>;
    if (booking.status !== "cancelled") {
      return res.status(400).json({ error: "Refund hanya dapat dibuat untuk booking yang sudah dibatalkan" });
    }

    // Validasi: total refund tidak boleh melebihi total pembayaran
    const paidRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount),0) AS total_paid FROM sport_payments
      WHERE booking_id = ${Number(booking_id)} AND status = 'paid'
    `);
    const totalPaid = Number((paidRes.rows[0] as any).total_paid);

    const existingRefundRes = await db.execute(sql`
      SELECT COALESCE(SUM(refund_amount),0) AS already_refunded FROM sport_refunds
      WHERE booking_id = ${Number(booking_id)} AND status != 'rejected'
    `);
    const alreadyRefunded = Number((existingRefundRes.rows[0] as any).already_refunded);

    if (alreadyRefunded + amt > totalPaid) {
      return res.status(400).json({
        error: `Total refund (${alreadyRefunded + amt}) melebihi total pembayaran (${totalPaid})`,
      });
    }

    // Dapatkan customer_id dari booking jika tidak disediakan
    const custId = req.body.customer_id ?? booking.customer_id ?? null;
    const cmpId = company_id ?? booking.company_id ?? null;
    const refundNumber = await nextRefundNumber(cmpId ? Number(cmpId) : undefined);

    const r = await db.execute(sql`
      INSERT INTO sport_refunds (company_id, booking_id, payment_id, customer_id, refund_number, refund_amount, refund_reason, status, processed_by)
      VALUES (
        ${cmpId ?? null},
        ${Number(booking_id)},
        ${payment_id ?? null},
        ${custId ?? null},
        ${refundNumber},
        ${amt},
        ${refund_reason ?? null},
        'pending',
        ${actorId}
      )
      RETURNING *
    `);
    const refund = r.rows[0] as Record<string, unknown>;

    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (
        ${cmpId ?? null}, 'refund', ${refund.id},
        'REFUND_CREATED', ${actorId},
        ${JSON.stringify({ refund_number: refundNumber, booking_id, refund_amount: amt, reason: refund_reason ?? null })}::jsonb
      )
    `);

    broadcastSportCenterEvent({ module: "sport-center", entity: "refund", action: "created", data: refund, timestamp: new Date().toISOString() }, cmpId ? Number(cmpId) : undefined);
    res.status(201).json(refund);
  } catch (err: any) {
    if (String(err?.message ?? "").includes("unique")) return res.status(409).json({ error: "Refund sudah ada" });
    res.status(500).json({ error: "Gagal membuat refund" });
  }
});

router.get("/refunds/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const r = await db.execute(sql`
      SELECT r.*,
             b.booking_number, b.facility_name, b.booking_date, b.customer_name,
             c.name AS customer_name_detail
      FROM sport_refunds r
      LEFT JOIN sport_bookings b ON b.id = r.booking_id
      LEFT JOIN sport_customers c ON c.id = r.customer_id
      WHERE r.id = ${Number(req.params.id)}
      LIMIT 1
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Refund tidak ditemukan" });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.patch("/refunds/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { status } = req.body;
    const actorId = (req.user as { id: string } | undefined)?.id ?? null;

    const allowed = ["approved", "paid", "rejected"];
    if (!status || !allowed.includes(status)) {
      return res.status(400).json({ error: "status harus salah satu: approved, paid, rejected" });
    }

    const cur = await db.execute(sql`SELECT * FROM sport_refunds WHERE id = ${id} LIMIT 1`);
    if (!cur.rows.length) return res.status(404).json({ error: "Refund tidak ditemukan" });
    const refund = cur.rows[0] as Record<string, unknown>;

    // Validasi transisi status
    const transitions: Record<string, string[]> = {
      pending: ["approved", "rejected"],
      approved: ["paid", "rejected"],
    };
    const current = String(refund.status ?? "pending");
    if (current === "paid" || current === "rejected") {
      return res.status(400).json({ error: `Refund dengan status '${current}' tidak dapat diubah` });
    }
    if (!(transitions[current] ?? []).includes(status)) {
      return res.status(400).json({ error: `Transisi status '${current}' → '${status}' tidak valid` });
    }

    const r = await db.execute(sql`
      UPDATE sport_refunds SET status = ${status}, processed_by = ${actorId}, updated_at = NOW()
      WHERE id = ${id} RETURNING *
    `);
    const updated = r.rows[0] as Record<string, unknown>;

    const actionMap: Record<string, string> = { approved: "REFUND_APPROVED", paid: "REFUND_PAID", rejected: "REFUND_REJECTED" };
    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (
        ${updated.company_id ?? null}, 'refund', ${id},
        ${actionMap[status]}, ${actorId},
        ${JSON.stringify({ old_status: current, new_status: status })}::jsonb
      )
    `);

    // Post jurnal akuntansi saat status → paid
    if (status === "paid") {
      const bookingRes = await db.execute(sql`SELECT * FROM sport_bookings WHERE id = ${updated.booking_id} LIMIT 1`);
      const booking = (bookingRes.rows[0] ?? {}) as Record<string, unknown>;
      postSportCenterRefund({
        refundId: id,
        refundNumber: String(updated.refund_number ?? `RF-${id}`),
        bookingCode: String(booking.booking_number ?? booking.booking_code ?? `BK-${updated.booking_id}`),
        customerName: String(booking.customer_name ?? ""),
        amount: Number(updated.refund_amount),
        companyId: updated.company_id != null ? Number(updated.company_id) : null,
      }).catch(() => {});
    }

    broadcastSportCenterEvent({ module: "sport-center", entity: "refund", action: "updated", data: updated, timestamp: new Date().toISOString() }, updated.company_id as number | undefined);
    res.json(updated);
  } catch {
    res.status(500).json({ error: "Gagal mengubah status refund" });
  }
});

// ── REFUND SHORTCUT (POST /bookings/:id/refund) ───────────────────────────────
// Endpoint satu langkah: cancel booking (jika belum) → buat refund → posting jurnal

router.post("/bookings/:id/refund", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const { refund_amount, refund_reason } = req.body;
    const actorId = (req.user as { id: string } | undefined)?.id ?? null;

    if (!refund_amount) return res.status(400).json({ error: "refund_amount wajib" });
    const amt = Number(refund_amount);
    if (isNaN(amt) || amt <= 0) return res.status(400).json({ error: "refund_amount harus angka positif" });

    const bookingRes = await db.execute(sql`SELECT * FROM sport_bookings WHERE id = ${id} LIMIT 1`);
    if (!bookingRes.rows.length) return res.status(404).json({ error: "Booking tidak ditemukan" });
    const booking = bookingRes.rows[0] as Record<string, unknown>;
    if (booking.status === "completed") return res.status(400).json({ error: "Booking selesai tidak dapat di-refund" });

    // Cancel booking jika belum cancelled
    if (booking.status !== "cancelled") {
      await db.execute(sql`
        UPDATE sport_bookings
        SET status = 'cancelled', cancelled_at = NOW(), cancelled_reason = ${refund_reason ?? 'Refund'}, updated_at = NOW()
        WHERE id = ${id}
      `);
    }

    // Update payment_status → refunded
    await db.execute(sql`
      UPDATE sport_bookings SET payment_status = 'refunded', updated_at = NOW() WHERE id = ${id}
    `);

    // Buat record refund
    const cmpId = booking.company_id ?? null;
    const refundNumber = await nextRefundNumber(cmpId ? Number(cmpId) : undefined);
    const paidRes = await db.execute(sql`
      SELECT COALESCE(SUM(amount),0) AS total_paid FROM sport_payments
      WHERE booking_id = ${id} AND status = 'paid'
    `);
    const totalPaid = Number((paidRes.rows[0] as any).total_paid);
    const refundAmt = Math.min(amt, totalPaid > 0 ? totalPaid : amt);

    const rr = await db.execute(sql`
      INSERT INTO sport_refunds (company_id, booking_id, customer_id, refund_number, refund_amount, refund_reason, status, processed_by)
      VALUES (${cmpId ?? null}, ${id}, ${booking.customer_id ?? null}, ${refundNumber}, ${refundAmt}, ${refund_reason ?? null}, 'paid', ${actorId})
      RETURNING *
    `);
    const refund = rr.rows[0] as Record<string, unknown>;

    // Post jurnal accounting — source: sport_center_booking_refund
    postSportCenterBookingRefundDirect({
      bookingId: id,
      bookingCode: String(booking.booking_number ?? `BK-${id}`),
      customerName: String(booking.customer_name ?? ""),
      amount: refundAmt,
      companyId: cmpId != null ? Number(cmpId) : null,
    }).catch(() => {});

    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (${cmpId ?? null}, 'booking', ${id}, 'BOOKING_REFUNDED', ${actorId},
        ${JSON.stringify({ refund_number: refundNumber, amount: refundAmt, reason: refund_reason ?? null })}::jsonb)
    `);

    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "refunded", data: { booking_id: id, refund }, timestamp: new Date().toISOString() }, cmpId as number | undefined);
    res.status(201).json({ booking_id: id, refund_number: refundNumber, refund_amount: refundAmt, payment_status: "refunded", refund });
  } catch (err: any) {
    if (String(err?.message ?? "").includes("unique")) return res.status(409).json({ error: "Refund sudah ada untuk booking ini" });
    res.status(500).json({ error: "Gagal memproses refund" });
  }
});

// ── MAINTENANCE REQUEST — FASE 4: buat PR nyata di modul Purchase ─────────────

router.post("/facilities/:id/request-maintenance", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const facilityId = Number(req.params.id);
    if (isNaN(facilityId)) return res.status(400).json({ error: "ID fasilitas tidak valid" });

    const { item, quantity = 1, vendor, notes, company_id, estimated_cost = 0, unit = "pcs" } = req.body;
    if (!item) return res.status(400).json({ error: "item wajib diisi" });

    const facilityRes = await db.execute(sql`SELECT * FROM sport_facilities WHERE id = ${facilityId} LIMIT 1`);
    if (!facilityRes.rows.length) return res.status(404).json({ error: "Fasilitas tidak ditemukan" });
    const facility = facilityRes.rows[0] as Record<string, unknown>;

    const cmpId = Number(company_id ?? facility.company_id ?? 1);
    const actorId = (req.user as { id: string } | undefined)?.id ?? null;
    const actorName = (req.user as { name?: string; email?: string } | undefined)?.name
      ?? (req.user as { name?: string; email?: string } | undefined)?.email
      ?? "Sport Center Admin";

    // Buat Purchase Request nyata di modul Purchase
    const prNumber = await nextPrSeq();
    const prNotes = `[SPORT_CENTER] Fasilitas: ${facility.name ?? facilityId} | ${notes ?? ""}`.trim();
    const prRes = await db.execute(sql`
      INSERT INTO purchase_requests
        (pr_number, company_id, status, requested_by, department, notes, created_by, created_at, updated_at)
      VALUES
        (${prNumber}, ${cmpId}, 'draft', ${actorName}, 'SPORT_CENTER', ${prNotes}, ${actorId}, NOW(), NOW())
      RETURNING *
    `);
    const pr = prRes.rows[0] as Record<string, unknown>;

    // Insert line PR
    await db.execute(sql`
      INSERT INTO purchase_request_lines
        (pr_id, name, description, quantity, unit, estimated_cost, notes, product_category)
      VALUES
        (${pr.id}, ${item}, ${`Maintenance fasilitas: ${facility.name ?? facilityId}`},
         ${Number(quantity)}, ${unit}, ${Number(estimated_cost).toFixed(2)},
         ${notes ?? null}, 'SPORT_CENTER_MAINTENANCE')
    `);

    // Simpan maintenance request dengan link ke PR
    const r = await db.execute(sql`
      INSERT INTO sport_maintenance_requests
        (company_id, facility_id, facility_name, item, quantity, vendor, notes,
         source, cost_center, request_type, status, requested_by,
         purchase_request_id, purchase_request_number, estimated_cost, unit)
      VALUES
        (${cmpId}, ${facilityId}, ${facility.name ?? null},
         ${item}, ${Number(quantity)}, ${vendor ?? null}, ${notes ?? null},
         'SPORT_CENTER', 'SPORT_CENTER', 'maintenance', 'submitted', ${actorId},
         ${pr.id}, ${prNumber}, ${Number(estimated_cost).toFixed(2)}, ${unit})
      RETURNING *
    `);
    const maint = r.rows[0] as Record<string, unknown>;

    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (${cmpId}, 'facility', ${facilityId}, 'MAINTENANCE_REQUESTED', ${actorId},
        ${JSON.stringify({
          item, quantity, vendor: vendor ?? null, notes: notes ?? null,
          source: "SPORT_CENTER", cost_center: "SPORT_CENTER",
          maintenance_id: maint.id, purchase_request_id: pr.id, purchase_request_number: prNumber,
        })}::jsonb)
    `);

    res.status(201).json({
      maintenance_request: maint,
      purchase_request: {
        id: pr.id,
        pr_number: prNumber,
        company_id: cmpId,
        department: "SPORT_CENTER",
        cost_center: "SPORT_CENTER",
        source: "SPORT_CENTER",
        status: "draft",
        notes: prNotes,
      },
    });
  } catch (err: any) {
    console.error("[sport-center] request-maintenance error:", err);
    res.status(500).json({ error: "Gagal membuat maintenance request" });
  }
});

// ── PURCHASE REQUEST OPERASIONAL — FASE 4 ─────────────────────────────────────

router.post("/facilities/:id/purchase-request", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const facilityId = Number(req.params.id);
    if (isNaN(facilityId)) return res.status(400).json({ error: "ID fasilitas tidak valid" });

    const { items, notes, company_id, request_type = "operational" } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "items wajib diisi (array)" });
    }

    const facilityRes = await db.execute(sql`SELECT * FROM sport_facilities WHERE id = ${facilityId} LIMIT 1`);
    if (!facilityRes.rows.length) return res.status(404).json({ error: "Fasilitas tidak ditemukan" });
    const facility = facilityRes.rows[0] as Record<string, unknown>;

    const cmpId = Number(company_id ?? facility.company_id ?? 1);
    const actorId = (req.user as { id: string } | undefined)?.id ?? null;
    const actorName = (req.user as { name?: string; email?: string } | undefined)?.name
      ?? (req.user as { name?: string; email?: string } | undefined)?.email
      ?? "Sport Center Admin";

    // Validasi setiap item
    for (const it of items as Record<string, unknown>[]) {
      if (!it.item && !it.name) return res.status(400).json({ error: "Setiap item wajib memiliki field 'item' atau 'name'" });
    }

    // Buat Purchase Request
    const prNumber = await nextPrSeq();
    const prNotes = `[SPORT_CENTER] Fasilitas: ${facility.name ?? facilityId} | Tipe: ${request_type} | ${notes ?? ""}`.trim();
    const prRes = await db.execute(sql`
      INSERT INTO purchase_requests
        (pr_number, company_id, status, requested_by, department, notes, created_by, created_at, updated_at)
      VALUES
        (${prNumber}, ${cmpId}, 'draft', ${actorName}, 'SPORT_CENTER', ${prNotes}, ${actorId}, NOW(), NOW())
      RETURNING *
    `);
    const pr = prRes.rows[0] as Record<string, unknown>;

    // Insert lines PR
    const maintIds: number[] = [];
    for (const it of items as Record<string, unknown>[]) {
      const itemName = String(it.item ?? it.name ?? "");
      const qty = Number(it.quantity ?? 1);
      const unit = String(it.unit ?? "pcs");
      const estCost = Number(it.estimated_cost ?? 0);
      const itemNotes = it.notes ? String(it.notes) : null;

      await db.execute(sql`
        INSERT INTO purchase_request_lines
          (pr_id, name, description, quantity, unit, estimated_cost, notes, product_category)
        VALUES
          (${pr.id}, ${itemName}, ${`Operasional fasilitas: ${facility.name ?? facilityId}`},
           ${qty}, ${unit}, ${estCost.toFixed(2)}, ${itemNotes}, 'SPORT_CENTER_OPERATIONAL')
      `);

      // Catat ke sport_maintenance_requests per item
      const smr = await db.execute(sql`
        INSERT INTO sport_maintenance_requests
          (company_id, facility_id, facility_name, item, quantity, vendor, notes,
           source, cost_center, request_type, status, requested_by,
           purchase_request_id, purchase_request_number, estimated_cost, unit)
        VALUES
          (${cmpId}, ${facilityId}, ${facility.name ?? null},
           ${itemName}, ${qty}, ${it.vendor ? String(it.vendor) : null}, ${itemNotes},
           'SPORT_CENTER', 'SPORT_CENTER', ${request_type}, 'submitted', ${actorId},
           ${pr.id}, ${prNumber}, ${estCost.toFixed(2)}, ${unit})
        RETURNING id
      `);
      maintIds.push(Number((smr.rows[0] as any).id));
    }

    await db.execute(sql`
      INSERT INTO sport_audit_logs (company_id, entity_type, entity_id, action, actor, new_data)
      VALUES (${cmpId}, 'facility', ${facilityId}, 'PURCHASE_REQUEST_CREATED', ${actorId},
        ${JSON.stringify({
          purchase_request_id: pr.id, purchase_request_number: prNumber,
          source: "SPORT_CENTER", cost_center: "SPORT_CENTER",
          request_type, item_count: (items as unknown[]).length,
          maintenance_ids: maintIds,
        })}::jsonb)
    `);

    res.status(201).json({
      purchase_request: {
        id: pr.id,
        pr_number: prNumber,
        company_id: cmpId,
        department: "SPORT_CENTER",
        cost_center: "SPORT_CENTER",
        source: "SPORT_CENTER",
        request_type,
        status: "draft",
        notes: prNotes,
        item_count: (items as unknown[]).length,
      },
      maintenance_request_ids: maintIds,
    });
  } catch (err: any) {
    console.error("[sport-center] purchase-request error:", err);
    res.status(500).json({ error: "Gagal membuat purchase request" });
  }
});

router.get("/facilities/:id/maintenance-requests", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const facilityId = Number(req.params.id);
    const r = await db.execute(sql`
      SELECT * FROM sport_maintenance_requests WHERE facility_id = ${facilityId} ORDER BY created_at DESC
    `);
    res.json(r.rows);
  } catch {
    res.status(500).json({ error: "Gagal memuat maintenance requests" });
  }
});

// ── LIST SEMUA PURCHASE REQUESTS SPORT CENTER ──────────────────────────────────

router.get("/purchase-requests", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
    const requestType = req.query.request_type ? String(req.query.request_type) : null;
    const status = req.query.status ? String(req.query.status) : null;

    const r = await db.execute(sql`
      SELECT
        smr.*,
        pr.status         AS pr_status,
        pr.pr_number      AS pr_number_ref,
        pr.department     AS pr_department,
        pr.notes          AS pr_notes,
        pr.created_at     AS pr_created_at
      FROM sport_maintenance_requests smr
      LEFT JOIN purchase_requests pr ON pr.id = smr.purchase_request_id
      WHERE smr.source = 'SPORT_CENTER'
        AND (${cId}::int IS NULL        OR smr.company_id = ${cId})
        AND (${facilityId}::int IS NULL OR smr.facility_id = ${facilityId})
        AND (${requestType} IS NULL     OR smr.request_type = ${requestType})
        AND (${status} IS NULL          OR smr.status = ${status})
      ORDER BY smr.created_at DESC
    `);
    res.json(r.rows);
  } catch (err: any) {
    console.error("[sport-center] GET /purchase-requests error:", err);
    res.status(500).json({ error: "Gagal memuat purchase requests" });
  }
});

router.get("/settings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const r = await db.execute(sql`SELECT * FROM sport_settings WHERE (${cId}::int IS NULL OR company_id = ${cId}) LIMIT 1`);
    res.json(r.rows[0] ?? null);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/settings", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const { company_id, center_name, address, phone, open_time, close_time, booking_advance_days, min_booking_hours, cancellation_hours } = req.body;
    const r = await db.execute(sql`
      INSERT INTO sport_settings (company_id, center_name, address, phone, open_time, close_time, booking_advance_days, min_booking_hours, cancellation_hours)
      VALUES (${company_id ?? null}, ${center_name ?? "Sport Center"}, ${address ?? null}, ${phone ?? null},
              ${open_time ?? "06:00"}::time, ${close_time ?? "22:00"}::time,
              ${booking_advance_days ?? 30}, ${min_booking_hours ?? 1}, ${cancellation_hours ?? 2})
      ON CONFLICT (company_id) DO UPDATE SET
        center_name = EXCLUDED.center_name,
        address = EXCLUDED.address,
        phone = EXCLUDED.phone,
        open_time = EXCLUDED.open_time,
        close_time = EXCLUDED.close_time,
        booking_advance_days = EXCLUDED.booking_advance_days,
        min_booking_hours = EXCLUDED.min_booking_hours,
        cancellation_hours = EXCLUDED.cancellation_hours,
        updated_at = NOW()
      RETURNING *
    `);
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal menyimpan settings" });
  }
});

// ── PROFITABILITY DASHBOARD ────────────────────────────────────────────────

router.get("/profitability", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.company_id ? Number(req.query.company_id) : (req.query.companyId ? Number(req.query.companyId) : null);
    const costCenterId = req.query.cost_center_id ? Number(req.query.cost_center_id) : null;
    const from = (req.query.from as string) ?? null;
    const to = (req.query.to as string) ?? null;
    const facilityId = req.query.facility_id ? Number(req.query.facility_id) : null;

    const [
      revenueBookingRes,
      revenueMembershipRes,
      refundRes,
      opExpenseRes,
      bookingsCountRes,
      activeMembersRes,
      revenueByMonthRes,
      facilityBookingRes,
      facilityExpenseRes,
      expenseByCategoryRes,
      facilityOccupancyRes,
    ] = await Promise.all([
      // Revenue Booking dari accounting_entries
      db.execute(sql`
        SELECT COALESCE(SUM(total_debit), 0) AS amount
        FROM accounting_entries
        WHERE source = 'sport_center_booking'
          AND status = 'posted'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR date >= ${from}::date)
          AND (${to}::date IS NULL OR date <= ${to}::date)
      `),
      // Revenue Membership dari accounting_entries
      db.execute(sql`
        SELECT COALESCE(SUM(total_debit), 0) AS amount
        FROM accounting_entries
        WHERE source = 'sport_center_membership'
          AND status = 'posted'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR date >= ${from}::date)
          AND (${to}::date IS NULL OR date <= ${to}::date)
      `),
      // Refund dari accounting_entries
      db.execute(sql`
        SELECT COALESCE(SUM(total_debit), 0) AS amount
        FROM accounting_entries
        WHERE source IN ('sport_center_refund', 'sport_center_booking_refund', 'sport_center_booking_reversal')
          AND status = 'posted'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR date >= ${from}::date)
          AND (${to}::date IS NULL OR date <= ${to}::date)
      `),
      // Operational Expense
      db.execute(sql`
        SELECT COALESCE(SUM(total_debit), 0) AS amount
        FROM accounting_entries
        WHERE source = 'sport_center_operational_expense'
          AND status = 'posted'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR date >= ${from}::date)
          AND (${to}::date IS NULL OR date <= ${to}::date)
      `),
      // Bookings count (active/completed)
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_bookings
        WHERE status NOT IN ('cancelled')
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${from}::date IS NULL OR booking_date >= ${from}::date)
          AND (${to}::date IS NULL OR booking_date <= ${to}::date)
      `),
      // Active members
      db.execute(sql`
        SELECT COUNT(*) AS cnt
        FROM sport_members
        WHERE status = 'active'
          AND (${cId}::int IS NULL OR company_id = ${cId})
      `),
      // Revenue per bulan (booking + membership + expense) dari accounting_entries
      db.execute(sql`
        SELECT
          TO_CHAR(date, 'YYYY-MM') AS month,
          COALESCE(SUM(CASE WHEN source = 'sport_center_booking' THEN total_debit ELSE 0 END), 0) AS booking_revenue,
          COALESCE(SUM(CASE WHEN source = 'sport_center_membership' THEN total_debit ELSE 0 END), 0) AS membership_revenue,
          COALESCE(SUM(CASE WHEN source = 'sport_center_operational_expense' THEN total_debit ELSE 0 END), 0) AS expense,
          COALESCE(SUM(CASE WHEN source IN ('sport_center_refund','sport_center_booking_refund','sport_center_booking_reversal') THEN total_debit ELSE 0 END), 0) AS refund
        FROM accounting_entries
        WHERE source IN ('sport_center_booking','sport_center_membership','sport_center_operational_expense','sport_center_refund','sport_center_booking_refund','sport_center_booking_reversal')
          AND status = 'posted'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR date >= ${from}::date)
          AND (${to}::date IS NULL OR date <= ${to}::date)
        GROUP BY TO_CHAR(date, 'YYYY-MM')
        ORDER BY month ASC
      `),
      // Facility booking revenue + refund (dari booking join accounting)
      db.execute(sql`
        SELECT
          b.facility_id,
          b.facility_name,
          COUNT(DISTINCT b.id) AS bookings_count,
          COALESCE(MAX(f.capacity), 1) AS capacity,
          COALESCE(SUM(CASE WHEN ae.source = 'sport_center_booking' AND ae.status = 'posted' THEN ae.total_debit ELSE 0 END), 0) AS revenue,
          COALESCE(SUM(CASE WHEN ae.source IN ('sport_center_refund','sport_center_booking_refund','sport_center_booking_reversal') AND ae.status = 'posted' THEN ae.total_debit ELSE 0 END), 0) AS refund
        FROM sport_bookings b
        LEFT JOIN accounting_entries ae ON ae.source_id = b.id
          AND ae.source IN ('sport_center_booking','sport_center_refund','sport_center_booking_refund','sport_center_booking_reversal')
        LEFT JOIN sport_facilities f ON f.id = b.facility_id
        WHERE b.status NOT IN ('cancelled')
          AND (${cId}::int IS NULL OR b.company_id = ${cId})
          AND (${from}::date IS NULL OR b.booking_date >= ${from}::date)
          AND (${to}::date IS NULL OR b.booking_date <= ${to}::date)
          AND (${facilityId}::int IS NULL OR b.facility_id = ${facilityId})
        GROUP BY b.facility_id, b.facility_name
      `),
      // Expense per facility dari accounting_entries.facility_id
      db.execute(sql`
        SELECT
          ae.facility_id,
          COALESCE(SUM(ae.total_debit), 0) AS expense
        FROM accounting_entries ae
        WHERE ae.source = 'sport_center_operational_expense'
          AND ae.status = 'posted'
          AND (${cId}::int IS NULL OR ae.company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR ae.cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR ae.date >= ${from}::date)
          AND (${to}::date IS NULL OR ae.date <= ${to}::date)
          AND ae.facility_id IS NOT NULL
        GROUP BY ae.facility_id
      `),
      // Expense per category (Expense Category Breakdown)
      db.execute(sql`
        SELECT
          COALESCE(expense_category, 'other') AS category,
          COALESCE(SUM(total_debit), 0) AS amount
        FROM accounting_entries
        WHERE source = 'sport_center_operational_expense'
          AND status = 'posted'
          AND (${cId}::int IS NULL OR company_id = ${cId})
          AND (${costCenterId}::int IS NULL OR cost_center_id = ${costCenterId})
          AND (${from}::date IS NULL OR date >= ${from}::date)
          AND (${to}::date IS NULL OR date <= ${to}::date)
        GROUP BY COALESCE(expense_category, 'other')
        ORDER BY amount DESC
      `),
      // FASE 6D-C: Occupied hours per facility (jam aktual dari booking)
      db.execute(sql`
        SELECT
          b.facility_id,
          COALESCE(SUM(b.duration_hours), 0)  AS occupied_hours,
          COALESCE(MAX(f.capacity), 1)         AS capacity
        FROM sport_bookings b
        LEFT JOIN sport_facilities f ON f.id = b.facility_id
        WHERE b.status NOT IN ('cancelled')
          AND (${cId}::int IS NULL OR b.company_id = ${cId})
          AND (${from}::date IS NULL OR b.booking_date >= ${from}::date)
          AND (${to}::date IS NULL OR b.booking_date <= ${to}::date)
          AND (${facilityId}::int IS NULL OR b.facility_id = ${facilityId})
        GROUP BY b.facility_id
      `),
    ]);

    const revenueBooking = Number((revenueBookingRes.rows[0] as any)?.amount ?? 0);
    const revenueMembership = Number((revenueMembershipRes.rows[0] as any)?.amount ?? 0);
    const refundAmount = Number((refundRes.rows[0] as any)?.amount ?? 0);
    const operationalExpense = Number((opExpenseRes.rows[0] as any)?.amount ?? 0);
    const totalRevenue = revenueBooking + revenueMembership;
    const netRevenue = totalRevenue - refundAmount;
    const netProfit = netRevenue - operationalExpense;
    const profitMarginPct = totalRevenue > 0 ? Math.round((netProfit / totalRevenue) * 10000) / 100 : 0;

    const bookingsCount = Number((bookingsCountRes.rows[0] as any)?.cnt ?? 0);

    // Break-even analysis
    const monthSet = new Set((revenueByMonthRes.rows as any[]).map(r => r.month));
    const monthCount = Math.max(monthSet.size, 1);
    const monthlyExpense = operationalExpense / monthCount;
    const avgBookingValue = bookingsCount > 0 ? revenueBooking / bookingsCount : 0;
    const breakEvenBookings = avgBookingValue > 0 ? Math.ceil(monthlyExpense / avgBookingValue) : null;

    // Merge facility revenue + expense
    const expenseByFacility = new Map<number, number>();
    for (const r of facilityExpenseRes.rows as any[]) {
      if (r.facility_id != null) expenseByFacility.set(Number(r.facility_id), Number(r.expense ?? 0));
    }

    // FASE 6D-C: Real occupancy per facility (jam aktual)
    interface OccupancyRow { facility_id: number | null; occupied_hours: number; capacity: number }
    const occupancyByFacility = new Map<number, OccupancyRow>();
    for (const r of facilityOccupancyRes.rows as any[]) {
      if (r.facility_id != null) {
        occupancyByFacility.set(Number(r.facility_id), {
          facility_id: Number(r.facility_id),
          occupied_hours: Number(r.occupied_hours ?? 0),
          capacity: Number(r.capacity ?? 1),
        });
      }
    }
    // Hitung jumlah hari dalam periode untuk available_hours
    const periodDays = (from && to)
      ? Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000) + 1)
      : 30;

    const facilityProfitability = (facilityBookingRes.rows as any[]).map(r => {
      const fid = r.facility_id != null ? Number(r.facility_id) : null;
      const rev = Number(r.revenue ?? 0);
      const ref = Number(r.refund ?? 0);
      const exp = fid != null ? (expenseByFacility.get(fid) ?? 0) : 0;
      const cnt = Number(r.bookings_count ?? 0);
      const profit = rev - ref - exp;

      // FASE 6D-C: Occupancy berbasis jam aktual
      const occ = fid != null ? occupancyByFacility.get(fid) : undefined;
      const occupiedHours = occ?.occupied_hours ?? 0;
      const cap = occ?.capacity ?? Number(r.capacity ?? 1);
      // available_hours = kapasitas fasilitas × 14 jam/hari × jumlah hari periode
      const availableHours = Math.max(cap * 14 * periodDays, 1);
      const occupancyPct = Math.min(100, Math.round((occupiedHours / availableHours) * 100));

      return {
        facility_id: fid,
        facility_name: r.facility_name,
        bookings_count: cnt,
        revenue: rev,
        refund: ref,
        expense: exp,
        net_revenue: rev - ref,
        net_profit: profit,
        occupied_hours: occupiedHours,
        available_hours: availableHours,
        occupancy_pct: occupancyPct,
      };
    }).sort((a, b) => b.net_profit - a.net_profit);

    const top5Facilities = facilityProfitability.slice(0, 5);
    const bottom5Facilities = [...facilityProfitability].sort((a, b) => a.net_profit - b.net_profit).slice(0, 5);

    const revenueByMonth = (revenueByMonthRes.rows as any[]).map(r => ({
      month: r.month,
      booking_revenue: Number(r.booking_revenue ?? 0),
      membership_revenue: Number(r.membership_revenue ?? 0),
      total_revenue: Number(r.booking_revenue ?? 0) + Number(r.membership_revenue ?? 0),
      expense: Number(r.expense ?? 0),
      refund: Number(r.refund ?? 0),
      net_profit: Number(r.booking_revenue ?? 0) + Number(r.membership_revenue ?? 0) - Number(r.refund ?? 0) - Number(r.expense ?? 0),
    }));

    const expenseByCategory = (expenseByCategoryRes.rows as any[]).map(r => ({
      category: String(r.category ?? "other"),
      amount: Number(r.amount ?? 0),
    }));

    res.json({
      // KPI
      revenue_booking: revenueBooking,
      revenue_membership: revenueMembership,
      total_revenue: totalRevenue,
      refund_amount: refundAmount,
      net_revenue: netRevenue,
      operational_expense: operationalExpense,
      gross_profit: netRevenue,           // alias: gross = revenue - refund
      net_profit: netProfit,
      profit_margin_pct: profitMarginPct,
      bookings_count: bookingsCount,
      active_members: Number((activeMembersRes.rows[0] as any)?.cnt ?? 0),
      // Break-even
      break_even: {
        monthly_expense: Math.round(monthlyExpense),
        avg_booking_value: Math.round(avgBookingValue),
        break_even_bookings: breakEvenBookings,
      },
      // Facility
      top_facilities: top5Facilities,
      bottom_facilities: bottom5Facilities,
      facility_profitability: facilityProfitability,
      // Time series
      revenue_by_month: revenueByMonth,
      // Category breakdown
      expense_by_category: expenseByCategory,
    });
  } catch (err) {
    console.error("[sport-center] GET /profitability error:", err);
    res.status(500).json({ error: "Gagal memuat data profitabilitas" });
  }
});

// ── FASE 6C: EXPENSE GROUPING ────────────────────────────────────────────────

router.get("/expense-grouping", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
    const category = req.query.category ? String(req.query.category) : null;

    const rows = await db.execute(sql`
      SELECT
        ae.facility_id,
        sf.name                          AS facility_name,
        ae.expense_category              AS category,
        TO_CHAR(ae.date, 'YYYY-MM')      AS month,
        COALESCE(SUM(ae.total_debit), 0) AS total_amount,
        COUNT(*)                         AS entry_count
      FROM accounting_entries ae
      LEFT JOIN sport_facilities sf ON sf.id = ae.facility_id
      WHERE ae.source = 'sport_center_operational_expense'
        AND ae.status = 'posted'
        AND (${cId}::int IS NULL        OR ae.company_id    = ${cId})
        AND (${from}::date IS NULL       OR ae.date         >= ${from}::date)
        AND (${to}::date IS NULL         OR ae.date         <= ${to}::date)
        AND (${facilityId}::int IS NULL  OR ae.facility_id  = ${facilityId})
        AND (${category}::text IS NULL   OR ae.expense_category = ${category})
      GROUP BY ae.facility_id, sf.name, ae.expense_category, TO_CHAR(ae.date, 'YYYY-MM')
      ORDER BY month ASC, total_amount DESC
    `);

    res.json(rows.rows);
  } catch (err) {
    console.error("[sport-center] GET /expense-grouping error:", err);
    res.status(500).json({ error: "Gagal memuat expense grouping" });
  }
});

// ── FASE 6C: RECURRING EXPENSES CRUD ─────────────────────────────────────────

router.get("/recurring-expenses", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const facilityId = req.query.facilityId ? Number(req.query.facilityId) : null;
    const rows = await db.execute(sql`
      SELECT re.*, sf.name AS facility_name
      FROM recurring_expenses re
      LEFT JOIN sport_facilities sf ON sf.id = re.facility_id
      WHERE (${cId}::int IS NULL       OR re.company_id  = ${cId})
        AND (${facilityId}::int IS NULL OR re.facility_id = ${facilityId})
      ORDER BY re.is_active DESC, re.next_run ASC NULLS LAST, re.name ASC
    `);
    res.json(rows.rows);
  } catch (err) {
    console.error("[sport-center] GET /recurring-expenses error:", err);
    res.status(500).json({ error: "Gagal memuat recurring expenses" });
  }
});

router.post("/recurring-expenses", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const {
      company_id, facility_id, name, description, amount,
      frequency = "monthly", next_run, is_active = true, category,
    } = req.body as Record<string, unknown>;

    if (!name) return res.status(400).json({ error: "name wajib diisi" });
    if (amount === undefined || amount === null) return res.status(400).json({ error: "amount wajib diisi" });

    // Validasi: Sport Center expense wajib punya facility_id
    if (!facility_id) {
      return res.status(400).json({ error: "facility_id wajib diisi untuk recurring expense Sport Center" });
    }

    const r = await db.execute(sql`
      INSERT INTO recurring_expenses
        (company_id, facility_id, name, description, amount, frequency, next_run, is_active, category)
      VALUES
        (${company_id ?? 1}, ${facility_id}, ${name}, ${description ?? null},
         ${String(amount)}, ${frequency}, ${next_run ?? null}, ${is_active}, ${category ?? null})
      RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[sport-center] POST /recurring-expenses error:", err);
    res.status(500).json({ error: "Gagal membuat recurring expense" });
  }
});

router.put("/recurring-expenses/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    const {
      name, description, amount, frequency, next_run, is_active, facility_id, category,
    } = req.body as Record<string, unknown>;

    const r = await db.execute(sql`
      UPDATE recurring_expenses SET
        name        = COALESCE(${name ?? null}, name),
        description = COALESCE(${description ?? null}, description),
        amount      = COALESCE(${amount !== undefined ? String(amount) : null}, amount::text)::numeric,
        frequency   = COALESCE(${frequency ?? null}, frequency),
        next_run    = COALESCE(${next_run ?? null}, next_run),
        is_active   = COALESCE(${is_active ?? null}, is_active),
        facility_id = COALESCE(${facility_id ?? null}, facility_id),
        category    = COALESCE(${category ?? null}, category),
        updated_at  = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Not found" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[sport-center] PUT /recurring-expenses/:id error:", err);
    res.status(500).json({ error: "Gagal update recurring expense" });
  }
});

router.delete("/recurring-expenses/:id", async (req, res) => {
  if (!await requireAdmin(req, res)) return;
  try {
    const id = Number(req.params.id);
    await db.execute(sql`DELETE FROM recurring_expenses WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[sport-center] DELETE /recurring-expenses/:id error:", err);
    res.status(500).json({ error: "Gagal hapus recurring expense" });
  }
});

export default router;
