import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

export const sportCenterRouter = Router();

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

  res.status(201).json(toBooking(result.rows[0] as BookingRow));
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
