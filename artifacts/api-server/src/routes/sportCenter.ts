import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa, getAdminGroupWa } from "../lib/adminWa.js";

export const sportCenterRouter = Router();

export const sportCenterPublicRouter = Router();

sportCenterPublicRouter.get("/services", async (_req: Request, res: Response) => {
  const result = await db.execute(sql`
    SELECT id, code, name, category, description, price_per_hour, capacity, unit,
           image_url, amenities, is_active, sort_order
    FROM sport_center_services
    ORDER BY sort_order, id
  `);
  const rows = result.rows as {
    id: number; code: string | null; name: string; category: string;
    description: string | null; price_per_hour: number; capacity: number;
    unit: string; image_url: string | null; amenities: unknown; is_active: boolean; sort_order: number;
  }[];
  res.json(rows.map((r) => ({
    id: r.code ?? String(r.id),
    name: r.name,
    category: r.category,
    description: r.description ?? "",
    pricePerHour: r.price_per_hour,
    capacity: r.capacity,
    unit: r.unit,
    image: r.image_url ?? `https://placehold.co/600x400/2563EB/white?text=${encodeURIComponent(r.name)}`,
    amenities: Array.isArray(r.amenities) ? r.amenities : [],
    available: r.is_active,
    rating: 4.7,
  })));
});

function buildAdminBookingMessage(b: {
  bookingCode: string;
  customerName: string;
  customerPhone: string;
  facilityName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalHours: number;
  totalPrice: number;
  notes?: string | null;
}): string {
  const price = Number(b.totalPrice).toLocaleString("id-ID", {
    style: "currency", currency: "IDR", maximumFractionDigits: 0,
  });
  return (
    `🏟️ *Booking Baru — Sport Center SHIA*\n\n` +
    `📋 *Kode*      : ${b.bookingCode}\n` +
    `👤 *Pelanggan* : ${b.customerName}\n` +
    `📱 *HP*        : ${b.customerPhone}\n` +
    `🏃 *Fasilitas* : ${b.facilityName}\n` +
    `📅 *Tanggal*   : ${b.date}\n` +
    `⏰ *Waktu*     : ${b.startTime} – ${b.endTime} (${b.totalHours} jam)\n` +
    `💰 *Total*     : ${price}\n` +
    (b.notes ? `📝 *Catatan*   : ${b.notes}\n` : "") +
    `\n⚡ Status: *Menunggu Konfirmasi*\n` +
    `Segera konfirmasi di BizPortal › Sport Center › Booking.`
  );
}

interface BookingRow {
  id: number;
  booking_code: string;
  facility_id: string;
  facility_name: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string;
  date: string;
  start_time: string;
  end_time: string;
  total_hours: string;
  total_price: number;
  notes: string | null;
  status: string;
  created_at: Date;
}

function toBooking(row: BookingRow) {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    customerEmail: row.customer_email,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    totalHours: parseFloat(row.total_hours),
    totalPrice: row.total_price,
    notes: row.notes ?? "",
    status: row.status as "pending" | "confirmed" | "completed" | "cancelled",
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
  };
}

sportCenterRouter.get("/check", async (req: Request, res: Response) => {
  const { facilityId, date, startTime, endTime } = req.query as Record<string, string>;
  if (!facilityId || !date || !startTime || !endTime) {
    res.status(400).json({ conflict: false });
    return;
  }
  const result = await db.execute(sql`
    SELECT id FROM sport_center_bookings
    WHERE facility_id = ${facilityId}
      AND date = ${date}
      AND status != 'cancelled'
      AND start_time < ${endTime}
      AND end_time > ${startTime}
    LIMIT 1
  `);
  res.json({ conflict: result.rows.length > 0 });
});

sportCenterRouter.get("/", async (_req: Request, res: Response) => {
  const result = await db.execute(sql`
    SELECT * FROM sport_center_bookings ORDER BY created_at DESC
  `);
  res.json((result.rows as BookingRow[]).map(toBooking));
});

sportCenterRouter.post("/", async (req: Request, res: Response) => {
  const {
    bookingCode,
    facilityId,
    facilityName,
    customerName,
    customerPhone,
    customerEmail,
    date,
    startTime,
    endTime,
    totalHours,
    totalPrice,
    notes,
  } = req.body;

  if (
    !bookingCode || !facilityId || !facilityName || !customerName ||
    !customerPhone || !customerEmail || !date || !startTime || !endTime ||
    totalHours == null || totalPrice == null
  ) {
    res.status(400).json({ message: "Data booking tidak lengkap" });
    return;
  }

  const conflicts = await db.execute(sql`
    SELECT id FROM sport_center_bookings
    WHERE facility_id = ${facilityId}
      AND date = ${date}
      AND status != 'cancelled'
      AND start_time < ${endTime}
      AND end_time > ${startTime}
    LIMIT 1
  `);

  if (conflicts.rows.length > 0) {
    res.status(409).json({ message: "Slot waktu sudah dibooking. Pilih waktu atau fasilitas lain." });
    return;
  }

  const result = await db.execute(sql`
    INSERT INTO sport_center_bookings
      (booking_code, facility_id, facility_name, customer_name, customer_phone,
       customer_email, date, start_time, end_time, total_hours, total_price, notes, status)
    VALUES
      (${bookingCode}, ${facilityId}, ${facilityName}, ${customerName}, ${customerPhone},
       ${customerEmail}, ${date}, ${startTime}, ${endTime}, ${String(totalHours)},
       ${totalPrice}, ${notes || null}, 'pending')
    RETURNING *
  `);

  const booking = toBooking(result.rows[0] as BookingRow);
  res.status(201).json(booking);

  // Notifikasi WA ke admin & grup — fire-and-forget
  const msg = buildAdminBookingMessage({
    bookingCode: booking.bookingCode,
    customerName: booking.customerName,
    customerPhone: booking.customerPhone,
    facilityName: booking.facilityName,
    date: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    totalHours: booking.totalHours,
    totalPrice: booking.totalPrice,
    notes: booking.notes || null,
  });

  Promise.all([
    getAdminWa().then((wa) => wa ? sendWhatsApp(wa, msg) : Promise.resolve()),
    getAdminGroupWa().then((gwa) => gwa ? sendWhatsApp(gwa, msg) : Promise.resolve()),
  ]).catch(() => {});
});

sportCenterRouter.put("/:id/status", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  const { status } = req.body as { status: string };
  const allowed = ["pending", "confirmed", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    res.status(400).json({ message: "Status tidak valid" });
    return;
  }
  const result = await db.execute(sql`
    UPDATE sport_center_bookings SET status = ${status} WHERE id = ${id} RETURNING *
  `);
  if (result.rows.length === 0) {
    res.status(404).json({ message: "Booking tidak ditemukan" });
    return;
  }
  res.json(toBooking(result.rows[0] as BookingRow));
});

sportCenterRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await db.execute(sql`DELETE FROM sport_center_bookings WHERE id = ${id}`);
  res.json({ success: true });
});
