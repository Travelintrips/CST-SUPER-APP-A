import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { postSportCenterBooking } from "../lib/accounting.js";
import { sendWhatsApp } from "../lib/fonnte.js";

export const sportCenterAdminRouter = Router();

function buildConfirmationMessage(booking: {
  booking_code: string;
  customer_name: string;
  facility_name: string;
  date: string;
  start_time: string;
  end_time: string;
  total_hours: string;
  total_price: number;
  notes: string | null;
}): string {
  const price = Number(booking.total_price).toLocaleString("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  });
  const hours = parseFloat(booking.total_hours);
  return (
    `✅ *Booking Sport Center Dikonfirmasi*\n\n` +
    `Halo ${booking.customer_name},\n` +
    `Booking Anda telah *dikonfirmasi*! Berikut detailnya:\n\n` +
    `📋 *Kode Booking* : ${booking.booking_code}\n` +
    `🏟️ *Fasilitas*   : ${booking.facility_name}\n` +
    `📅 *Tanggal*     : ${booking.date}\n` +
    `⏰ *Waktu*       : ${booking.start_time} – ${booking.end_time} (${hours} jam)\n` +
    `💰 *Total*       : ${price}\n` +
    (booking.notes ? `📝 *Catatan*     : ${booking.notes}\n` : "") +
    `\nMohon hadir tepat waktu. Terima kasih telah menggunakan layanan Sport Center SHIA!\n\n` +
    `_Pesan ini dikirim otomatis. Hubungi kami jika ada pertanyaan._`
  );
}

const DEFAULT_SERVICES = [
  { name: "Lapangan Futsal", category: "Futsal", description: "Lapangan futsal standar FIFA dengan rumput sintetis premium. Dilengkapi pencahayaan LED profesional dan sistem ventilasi modern.", pricePerHour: 150000, capacity: 14, unit: "jam", sortOrder: 1 },
  { name: "Lapangan Badminton", category: "Badminton", description: "Lapangan indoor dengan lantai vinyl profesional berstandar BWF. Tersedia 4 lapangan dengan net premium.", pricePerHour: 75000, capacity: 8, unit: "jam", sortOrder: 2 },
  { name: "Lapangan Basket", category: "Basket", description: "Lapangan basket indoor dengan lantai parket resmi NBA. Dilengkapi papan skor digital dan sistem tata suara.", pricePerHour: 200000, capacity: 20, unit: "jam", sortOrder: 3 },
  { name: "Fitness Center", category: "Gym", description: "Pusat kebugaran lengkap dengan peralatan cardio dan beban terkini. Tersedia personal trainer berpengalaman.", pricePerHour: 35000, capacity: 40, unit: "sesi", sortOrder: 4 },
  { name: "Studio Yoga", category: "Yoga", description: "Studio yoga ber-AC dengan lantai kayu hangat dan perlengkapan yoga lengkap. Cocok untuk semua level.", pricePerHour: 50000, capacity: 20, unit: "sesi", sortOrder: 5 },
  { name: "Studio Zumba & Aerobik", category: "Aerobik", description: "Studio dance dan aerobik dengan lantai sprung, cermin full-wall, dan sound system bertenaga untuk sesi yang menyenangkan.", pricePerHour: 60000, capacity: 25, unit: "sesi", sortOrder: 6 },
];

async function ensureTables() {
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sport_center_services (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Lainnya',
      description TEXT,
      price_per_hour INTEGER NOT NULL DEFAULT 0,
      capacity INTEGER NOT NULL DEFAULT 10,
      unit TEXT NOT NULL DEFAULT 'sesi',
      is_active BOOLEAN NOT NULL DEFAULT true,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS sport_center_purchase_requests (
      id SERIAL PRIMARY KEY,
      pr_number TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'Maintenance',
      priority TEXT NOT NULL DEFAULT 'normal',
      status TEXT NOT NULL DEFAULT 'draft',
      requested_by TEXT NOT NULL,
      items JSONB NOT NULL DEFAULT '[]',
      total_estimated INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      approved_by TEXT,
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Seed default services jika tabel masih kosong
  const existing = await db.execute(sql`SELECT COUNT(*) as cnt FROM sport_center_services`);
  const count = parseInt((existing.rows[0] as { cnt: string }).cnt);
  if (count === 0) {
    for (const s of DEFAULT_SERVICES) {
      await db.execute(sql`
        INSERT INTO sport_center_services (name, category, description, price_per_hour, capacity, unit, is_active, sort_order)
        VALUES (${s.name}, ${s.category}, ${s.description}, ${s.pricePerHour}, ${s.capacity}, ${s.unit}, true, ${s.sortOrder})
      `);
    }
    console.log("[sportCenter] Default services seeded (6 fasilitas)");
  }
}

ensureTables().catch(console.error);

// ── STATS / DASHBOARD ─────────────────────────────────────────────────────────

sportCenterAdminRouter.get("/stats", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const today = new Date().toISOString().split("T")[0];
    const monthStart = today.substring(0, 7) + "-01";

    const [total, todayRows, monthRows, revenueRows, pendingRows, statusRows] = await Promise.all([
      db.execute(sql`SELECT COUNT(*) as cnt FROM sport_center_bookings`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM sport_center_bookings WHERE date = ${today}`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM sport_center_bookings WHERE date >= ${monthStart}`),
      db.execute(sql`SELECT COALESCE(SUM(total_price),0) as rev FROM sport_center_bookings WHERE date >= ${monthStart} AND status != 'cancelled'`),
      db.execute(sql`SELECT COUNT(*) as cnt FROM sport_center_bookings WHERE status = 'pending'`),
      db.execute(sql`
        SELECT status, COUNT(*) as cnt FROM sport_center_bookings GROUP BY status
      `),
    ]);

    const byStatus: Record<string, number> = {};
    for (const row of statusRows.rows as { status: string; cnt: string }[]) {
      byStatus[row.status] = parseInt(row.cnt);
    }

    res.json({
      totalBookings: parseInt((total.rows[0] as any).cnt),
      todayBookings: parseInt((todayRows.rows[0] as any).cnt),
      monthBookings: parseInt((monthRows.rows[0] as any).cnt),
      monthRevenue: parseInt((revenueRows.rows[0] as any).rev),
      pendingConfirmation: parseInt((pendingRows.rows[0] as any).cnt),
      byStatus,
    });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ── BOOKINGS (admin view) ─────────────────────────────────────────────────────

sportCenterAdminRouter.get("/bookings", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { status, dateFrom, dateTo, search } = req.query as Record<string, string>;
    let q = `SELECT * FROM sport_center_bookings WHERE 1=1`;
    const params: unknown[] = [];
    let i = 1;
    if (status && status !== "all") { q += ` AND status = $${i++}`; params.push(status); }
    if (dateFrom) { q += ` AND date >= $${i++}`; params.push(dateFrom); }
    if (dateTo) { q += ` AND date <= $${i++}`; params.push(dateTo); }
    if (search) {
      q += ` AND (LOWER(customer_name) LIKE $${i} OR LOWER(booking_code) LIKE $${i} OR LOWER(facility_name) LIKE $${i})`;
      params.push(`%${search.toLowerCase()}%`); i++;
    }
    q += ` ORDER BY created_at DESC LIMIT 500`;
    const result = await db.execute(sql.raw(q, params));
    res.json(result.rows);
  } catch {
    const result = await db.execute(sql`SELECT * FROM sport_center_bookings ORDER BY created_at DESC LIMIT 500`);
    res.json(result.rows);
  }
});

sportCenterAdminRouter.put("/bookings/:id/status", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = parseInt(req.params.id);
  const { status } = req.body as { status: string };
  const allowed = ["pending", "confirmed", "completed", "cancelled"];
  if (!allowed.includes(status)) { res.status(400).json({ message: "Status tidak valid" }); return; }

  const before = await db.execute(sql`SELECT * FROM sport_center_bookings WHERE id = ${id} LIMIT 1`);
  if (before.rows.length === 0) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  const prev = before.rows[0] as {
    status: string;
    booking_code: string;
    customer_name: string;
    customer_phone: string;
    facility_name: string;
    date: string;
    start_time: string;
    end_time: string;
    total_hours: string;
    total_price: number;
    notes: string | null;
  };

  const result = await db.execute(sql`UPDATE sport_center_bookings SET status = ${status} WHERE id = ${id} RETURNING *`);
  if (result.rows.length === 0) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  res.json(result.rows[0]);

  if (status === "confirmed" && prev.status !== "confirmed") {
    const userId = (req.user as { id?: string } | undefined)?.id ?? null;

    // Auto-post accounting journal
    postSportCenterBooking({
      bookingId: id,
      bookingCode: prev.booking_code,
      customerName: prev.customer_name,
      facilityName: prev.facility_name,
      date: prev.date,
      totalPrice: Number(prev.total_price),
      createdById: userId,
    }).catch(() => {});

    // Kirim notifikasi WhatsApp ke pelanggan
    if (prev.customer_phone) {
      const msg = buildConfirmationMessage(prev);
      sendWhatsApp(prev.customer_phone, msg).catch(() => {});
    }
  }
});

sportCenterAdminRouter.delete("/bookings/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  await db.execute(sql`DELETE FROM sport_center_bookings WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// ── LAPORAN ───────────────────────────────────────────────────────────────────

sportCenterAdminRouter.get("/reports", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { from, to } = req.query as Record<string, string>;
    const dateFrom = from ?? new Date(Date.now() - 30 * 864e5).toISOString().split("T")[0];
    const dateTo = to ?? new Date().toISOString().split("T")[0];

    const [daily, byFacility, byStatus] = await Promise.all([
      db.execute(sql`
        SELECT date, COUNT(*) as bookings, COALESCE(SUM(total_price),0) as revenue
        FROM sport_center_bookings
        WHERE date >= ${dateFrom} AND date <= ${dateTo} AND status != 'cancelled'
        GROUP BY date ORDER BY date
      `),
      db.execute(sql`
        SELECT facility_name, COUNT(*) as bookings, COALESCE(SUM(total_price),0) as revenue
        FROM sport_center_bookings
        WHERE date >= ${dateFrom} AND date <= ${dateTo} AND status != 'cancelled'
        GROUP BY facility_name ORDER BY revenue DESC
      `),
      db.execute(sql`
        SELECT status, COUNT(*) as cnt
        FROM sport_center_bookings
        WHERE date >= ${dateFrom} AND date <= ${dateTo}
        GROUP BY status
      `),
    ]);

    res.json({ daily: daily.rows, byFacility: byFacility.rows, byStatus: byStatus.rows, dateFrom, dateTo });
  } catch (e) {
    res.status(500).json({ message: String(e) });
  }
});

// ── SERVICES / PRODUK & LAYANAN ───────────────────────────────────────────────

sportCenterAdminRouter.get("/services", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const result = await db.execute(sql`SELECT * FROM sport_center_services ORDER BY sort_order, id`);
  res.json(result.rows);
});

sportCenterAdminRouter.post("/services", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, category, description, pricePerHour, capacity, unit, isActive, sortOrder } = req.body;
  if (!name) { res.status(400).json({ message: "Nama wajib diisi" }); return; }
  const result = await db.execute(sql`
    INSERT INTO sport_center_services (name, category, description, price_per_hour, capacity, unit, is_active, sort_order)
    VALUES (${name}, ${category ?? "Lainnya"}, ${description ?? null}, ${pricePerHour ?? 0}, ${capacity ?? 10}, ${unit ?? "sesi"}, ${isActive ?? true}, ${sortOrder ?? 0})
    RETURNING *
  `);
  res.status(201).json(result.rows[0]);
});

sportCenterAdminRouter.put("/services/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { name, category, description, pricePerHour, capacity, unit, isActive, sortOrder } = req.body;
  const result = await db.execute(sql`
    UPDATE sport_center_services
    SET name = ${name}, category = ${category}, description = ${description ?? null},
        price_per_hour = ${pricePerHour}, capacity = ${capacity}, unit = ${unit ?? "sesi"},
        is_active = ${isActive}, sort_order = ${sortOrder ?? 0}, updated_at = NOW()
    WHERE id = ${req.params.id} RETURNING *
  `);
  if (result.rows.length === 0) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  res.json(result.rows[0]);
});

sportCenterAdminRouter.delete("/services/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  await db.execute(sql`DELETE FROM sport_center_services WHERE id = ${req.params.id}`);
  res.json({ success: true });
});

// ── PURCHASE REQUESTS ─────────────────────────────────────────────────────────

function genPRNumber() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const rand = String(Math.floor(Math.random() * 9000) + 1000);
  return `SCPR/${y}/${m}/${rand}`;
}

sportCenterAdminRouter.get("/purchase-requests", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const result = await db.execute(sql`SELECT * FROM sport_center_purchase_requests ORDER BY created_at DESC`);
  res.json(result.rows);
});

sportCenterAdminRouter.post("/purchase-requests", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { title, description, category, priority, requestedBy, items, totalEstimated, notes } = req.body;
  if (!title || !requestedBy) { res.status(400).json({ message: "Judul dan pemohon wajib diisi" }); return; }
  const prNumber = genPRNumber();
  const result = await db.execute(sql`
    INSERT INTO sport_center_purchase_requests
      (pr_number, title, description, category, priority, requested_by, items, total_estimated, notes)
    VALUES
      (${prNumber}, ${title}, ${description ?? null}, ${category ?? "Maintenance"}, ${priority ?? "normal"},
       ${requestedBy}, ${JSON.stringify(items ?? [])}, ${totalEstimated ?? 0}, ${notes ?? null})
    RETURNING *
  `);
  res.status(201).json(result.rows[0]);
});

sportCenterAdminRouter.put("/purchase-requests/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { title, description, category, priority, status, items, totalEstimated, notes, approvedBy } = req.body;
  const approvedAt = status === "approved" ? new Date().toISOString() : null;
  const result = await db.execute(sql`
    UPDATE sport_center_purchase_requests
    SET title = ${title}, description = ${description ?? null}, category = ${category},
        priority = ${priority}, status = ${status}, items = ${JSON.stringify(items ?? [])},
        total_estimated = ${totalEstimated ?? 0}, notes = ${notes ?? null},
        approved_by = ${approvedBy ?? null}, approved_at = ${approvedAt},
        updated_at = NOW()
    WHERE id = ${req.params.id} RETURNING *
  `);
  if (result.rows.length === 0) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  res.json(result.rows[0]);
});

sportCenterAdminRouter.delete("/purchase-requests/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  await db.execute(sql`DELETE FROM sport_center_purchase_requests WHERE id = ${req.params.id}`);
  res.json({ success: true });
});
