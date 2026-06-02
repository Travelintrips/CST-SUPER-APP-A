import { Router } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../../lib/requireAdmin.js";
import { handleSportCenterSse, broadcastSportCenterEvent } from "./broadcast.js";

const router = Router();

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

router.get("/events", (req, res) => {
  handleSportCenterSse(req, res);
});

router.get("/dashboard", requireAdmin, async (req, res) => {
  try {
    const companyId = req.query.companyId ? Number(req.query.companyId) : undefined;
    const cId = companyId ?? null;

    const [totals, todayRes, pendingPayRes, membersRes, byStatus, topFacilities, recentBookings, monthRev, totalRev] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId})`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND booking_date = CURRENT_DATE`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND payment_status = 'unpaid' AND status NOT IN ('cancelled','completed')`),
      db.execute(sql`SELECT COUNT(*) AS cnt FROM sport_members WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status = 'active'`),
      db.execute(sql`SELECT status, COUNT(*) AS count FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) GROUP BY status ORDER BY count DESC`),
      db.execute(sql`SELECT facility_name, COUNT(*) AS bookings, COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status != 'cancelled' GROUP BY facility_name ORDER BY bookings DESC LIMIT 5`),
      db.execute(sql`SELECT * FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) ORDER BY created_at DESC LIMIT 10`),
      db.execute(sql`SELECT COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status != 'cancelled' AND booking_date >= date_trunc('month', CURRENT_DATE)`),
      db.execute(sql`SELECT COALESCE(SUM(total_amount),0) AS revenue FROM sport_bookings WHERE (${cId}::int IS NULL OR company_id = ${cId}) AND status != 'cancelled'`),
    ]);

    res.json({
      totalBookings: Number((totals.rows[0] as any).cnt),
      todayBookings: Number((todayRes.rows[0] as any).cnt),
      pendingPayment: Number((pendingPayRes.rows[0] as any).cnt),
      totalMembers: Number((membersRes.rows[0] as any).cnt),
      byStatus: byStatus.rows,
      topFacilities: topFacilities.rows,
      recentBookings: recentBookings.rows,
      monthRevenue: Number((monthRev.rows[0] as any).revenue),
      totalRevenue: Number((totalRev.rows[0] as any).revenue),
    });
  } catch {
    res.status(500).json({ error: "Gagal memuat dashboard" });
  }
});

router.get("/facilities", requireAdmin, async (req, res) => {
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const result = await db.execute(sql`SELECT * FROM sport_facilities WHERE (${cId}::int IS NULL OR company_id = ${cId}) ORDER BY sort_order ASC, id ASC`);
    res.json(result.rows);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/facilities/:id", requireAdmin, async (req, res) => {
  try {
    const r = await db.execute(sql`SELECT * FROM sport_facilities WHERE id = ${Number(req.params.id)}`);
    if (!r.rows.length) return res.status(404).json({ error: "Tidak ditemukan" });
    res.json(r.rows[0]);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/facilities", requireAdmin, async (req, res) => {
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
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal membuat fasilitas" });
  }
});

router.patch("/facilities/:id", requireAdmin, async (req, res) => {
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
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal memperbarui" });
  }
});

router.delete("/facilities/:id", requireAdmin, async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM sport_facilities WHERE id = ${Number(req.params.id)}`);
    broadcastSportCenterEvent({ module: "sport-center", entity: "facility", action: "deleted", data: { id: req.params.id }, timestamp: new Date().toISOString() });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal menghapus" });
  }
});

router.get("/bookings", requireAdmin, async (req, res) => {
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

router.post("/bookings", requireAdmin, async (req, res) => {
  try {
    const {
      company_id, customer_id, customer_name, customer_phone, facility_id, facility_name,
      booking_date, start_time, end_time, duration_hours = 1, base_amount = 0, discount_amount = 0,
      total_amount = 0, promo_id, promo_code, notes,
    } = req.body;
    if (!customer_name || !facility_name || !booking_date || !start_time || !end_time) {
      return res.status(400).json({ error: "Field wajib tidak lengkap" });
    }
    const bookingNumber = await nextBookingNumber(company_id);
    const r = await db.execute(sql`
      INSERT INTO sport_bookings
        (company_id, booking_number, customer_id, customer_name, customer_phone, facility_id, facility_name,
         booking_date, start_time, end_time, duration_hours, base_amount, discount_amount, total_amount,
         promo_id, promo_code, notes, status, payment_status)
      VALUES
        (${company_id ?? null}, ${bookingNumber}, ${customer_id ?? null}, ${customer_name}, ${customer_phone ?? null},
         ${facility_id ?? null}, ${facility_name}, ${booking_date}, ${start_time}, ${end_time},
         ${duration_hours}, ${base_amount}, ${discount_amount}, ${total_amount},
         ${promo_id ?? null}, ${promo_code ?? null}, ${notes ?? null}, 'pending', 'unpaid')
      RETURNING *
    `);
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "created", data: row, timestamp: new Date().toISOString() }, company_id);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal membuat booking" });
  }
});

router.patch("/bookings/:id", requireAdmin, async (req, res) => {
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
    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "updated", data: row, timestamp: new Date().toISOString() });
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal memperbarui" });
  }
});

router.post("/bookings/:id/checkin", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const r = await db.execute(sql`
      UPDATE sport_bookings SET status = 'checked_in', checked_in_at = NOW(), updated_at = NOW()
      WHERE id = ${id} AND status IN ('pending','confirmed') RETURNING *
    `);
    if (!r.rows.length) return res.status(400).json({ error: "Booking tidak dapat di-check-in" });
    const row = r.rows[0] as Record<string, unknown>;
    broadcastSportCenterEvent({ module: "sport-center", entity: "booking", action: "checkin", data: row, timestamp: new Date().toISOString() });
    res.json(row);
  } catch {
    res.status(500).json({ error: "Gagal check-in" });
  }
});

router.get("/customers", requireAdmin, async (req, res) => {
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

router.post("/customers", requireAdmin, async (req, res) => {
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

router.patch("/customers/:id", requireAdmin, async (req, res) => {
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

router.delete("/customers/:id", requireAdmin, async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM sport_customers WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/members", requireAdmin, async (req, res) => {
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

router.post("/members", requireAdmin, async (req, res) => {
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

router.patch("/members/:id", requireAdmin, async (req, res) => {
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

router.delete("/members/:id", requireAdmin, async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM sport_members WHERE id = ${Number(req.params.id)}`);
    broadcastSportCenterEvent({ module: "sport-center", entity: "member", action: "deleted", data: { id: req.params.id }, timestamp: new Date().toISOString() });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/pricing-rules", requireAdmin, async (req, res) => {
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

router.post("/pricing-rules", requireAdmin, async (req, res) => {
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

router.patch("/pricing-rules/:id", requireAdmin, async (req, res) => {
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

router.delete("/pricing-rules/:id", requireAdmin, async (req, res) => {
  try {
    await db.execute(sql`DELETE FROM sport_pricing_rules WHERE id = ${Number(req.params.id)}`);
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/payments", requireAdmin, async (req, res) => {
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

router.post("/payments", requireAdmin, async (req, res) => {
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
    broadcastSportCenterEvent({ module: "sport-center", entity: "payment", action: "created", data: row, timestamp: new Date().toISOString() }, company_id);
    res.status(201).json(row);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/reports", requireAdmin, async (req, res) => {
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const from = (req.query.from as string) ?? null;
    const to = (req.query.to as string) ?? null;

    const [revenueByDay, revenueByFacility, bookingsByStatus] = await Promise.all([
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
    ]);

    res.json({ revenueByDay: revenueByDay.rows, revenueByFacility: revenueByFacility.rows, bookingsByStatus: bookingsByStatus.rows });
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.get("/settings", requireAdmin, async (req, res) => {
  try {
    const cId = req.query.companyId ? Number(req.query.companyId) : null;
    const r = await db.execute(sql`SELECT * FROM sport_settings WHERE (${cId}::int IS NULL OR company_id = ${cId}) LIMIT 1`);
    res.json(r.rows[0] ?? null);
  } catch {
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/settings", requireAdmin, async (req, res) => {
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

export default router;
