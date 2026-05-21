import { Router, type Request, type Response } from "express";
import { randomUUID } from "crypto";
import multer from "multer";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa, getAdminGroupWa } from "../lib/adminWa.js";
import { sendMail, isSmtpConfigured } from "../lib/mailer.js";
import { saveAndBroadcast } from "../lib/notificationStore.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

export const sportCenterRouter = Router();
export const sportCenterPublicRouter = Router();

const objectStorage = new ObjectStorageService();

// Multer: maks 5 MB, image only
const proofUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Hanya file gambar yang diizinkan (JPG, PNG, HEIC, dll.)"));
      return;
    }
    cb(null, true);
  },
});

// Simple per-booking-code rate limit: max 5 uploads per code
const proofUploadCount = new Map<string, number>();

// ── Public: daftar layanan ──────────────────────────────────────────────────
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

// ── Public: upload bukti pembayaran ────────────────────────────────────────
sportCenterPublicRouter.post(
  "/payment-proof/:bookingCode",
  (req: Request, res: Response, next) => {
    proofUpload.single("proof")(req, res, (err) => {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(400).json({ message: "Ukuran file maksimal 5 MB" });
        return;
      }
      if (err) {
        res.status(400).json({ message: err.message ?? "File tidak valid" });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const { bookingCode } = req.params as { bookingCode: string };

    if (!req.file) {
      res.status(400).json({ message: "Tidak ada file yang diupload" });
      return;
    }

    // Rate limit per booking code
    const uploadCount = proofUploadCount.get(bookingCode) ?? 0;
    if (uploadCount >= 5) {
      res.status(429).json({ message: "Terlalu banyak percobaan upload. Hubungi admin." });
      return;
    }
    proofUploadCount.set(bookingCode, uploadCount + 1);

    // Cari booking
    const bResult = await db.execute(sql`
      SELECT * FROM sport_center_bookings WHERE booking_code = ${bookingCode} LIMIT 1
    `);
    if (bResult.rows.length === 0) {
      res.status(404).json({ message: "Kode booking tidak ditemukan" });
      return;
    }
    const row = bResult.rows[0] as BookingRow & {
      payment_proof_url: string | null;
      payment_proof_at: Date | null;
      payment_status: string;
    };

    if (row.status === "cancelled") {
      res.status(400).json({ message: "Booking ini sudah dibatalkan" });
      return;
    }

    // Upload ke object storage (public folder)
    const objectId = randomUUID();
    const storagePath = `public/sport-center-payments/${objectId}`;
    await objectStorage.uploadFile(req.file.buffer, storagePath, req.file.mimetype);
    const proofUrl = objectStorage.getPublicUrl(storagePath);

    // Update booking
    await db.execute(sql`
      UPDATE sport_center_bookings
      SET payment_proof_url = ${proofUrl},
          payment_proof_at  = NOW(),
          payment_status    = 'proof_uploaded'
      WHERE booking_code = ${bookingCode}
    `);

    res.json({ success: true, proofUrl });

    // Notifikasi WA ke admin — fire-and-forget
    const price = Number(row.total_price).toLocaleString("id-ID", {
      style: "currency", currency: "IDR", maximumFractionDigits: 0,
    });
    const waMsg =
      `💳 *Bukti Transfer Masuk — Sport Center SHIA*\n\n` +
      `📋 *Kode*      : ${row.booking_code}\n` +
      `👤 *Pelanggan* : ${row.customer_name}\n` +
      `📱 *HP*        : ${row.customer_phone}\n` +
      `🏃 *Fasilitas* : ${row.facility_name}\n` +
      `📅 *Tanggal*   : ${row.date} ${row.start_time}–${row.end_time}\n` +
      `💰 *Total*     : ${price}\n\n` +
      `⚡ Pelanggan sudah upload bukti transfer. Silakan verifikasi di BizPortal › Sport Center › Booking.`;

    Promise.all([
      getAdminWa().then((wa) => wa ? sendWhatsApp(wa, waMsg) : Promise.resolve()),
      getAdminGroupWa().then((gwa) => gwa ? sendWhatsApp(gwa, waMsg) : Promise.resolve()),
    ]).catch(() => {});

    // SSE broadcast ke BizPortal
    saveAndBroadcast("sport_payment_proof", {
      type: "sport_payment_proof",
      orderId: row.id,
      orderNumber: row.booking_code,
      customerName: row.customer_name,
      facilityName: row.facility_name,
      grandTotal: row.total_price,
    }).catch(() => {});

    // Email notifikasi ke admin
    if (isSmtpConfigured()) {
      const adminEmail = process.env.ADMIN_EMAIL ?? "";
      if (adminEmail) {
        sendMail({
          to: adminEmail,
          subject: `[Sport Center] Bukti Transfer — ${row.booking_code}`,
          html: `<h2>Bukti Transfer Diterima — Sport Center SHIA</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:4px 12px;color:#666">Kode</td><td style="padding:4px 12px"><b>${row.booking_code}</b></td></tr>
  <tr><td style="padding:4px 12px;color:#666">Pelanggan</td><td style="padding:4px 12px">${row.customer_name}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Fasilitas</td><td style="padding:4px 12px">${row.facility_name}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Tanggal</td><td style="padding:4px 12px">${row.date} ${row.start_time}–${row.end_time}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Total</td><td style="padding:4px 12px"><b>${price}</b></td></tr>
</table>
<p style="margin-top:16px"><a href="${proofUrl}" style="background:#2563EB;color:white;padding:8px 20px;border-radius:6px;text-decoration:none;font-weight:bold">Lihat Bukti Transfer</a></p>
<p style="color:#888;margin-top:12px">Segera verifikasi di BizPortal › Sport Center › Booking.</p>`,
          text: `Bukti Transfer Diterima\nKode: ${row.booking_code}\nPelanggan: ${row.customer_name}\nTotal: ${price}\nBukti: ${proofUrl}`,
        }).catch(() => {});
      }
    }
  },
);

// ── Helpers ────────────────────────────────────────────────────────────────
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

function toBooking(row: BookingRow & {
  payment_proof_url?: string | null;
  payment_proof_at?: Date | null;
  payment_status?: string;
}) {
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
    paymentProofUrl: row.payment_proof_url ?? null,
    paymentProofAt: row.payment_proof_at
      ? (row.payment_proof_at instanceof Date ? row.payment_proof_at.toISOString() : String(row.payment_proof_at))
      : null,
    paymentStatus: row.payment_status ?? "unpaid",
  };
}

// ── Cek ketersediaan slot ──────────────────────────────────────────────────
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

// ── Daftar semua booking (admin) ───────────────────────────────────────────
sportCenterRouter.get("/", async (_req: Request, res: Response) => {
  const result = await db.execute(sql`
    SELECT * FROM sport_center_bookings ORDER BY created_at DESC
  `);
  res.json((result.rows as (BookingRow & { payment_proof_url?: string | null; payment_proof_at?: Date | null; payment_status?: string })[]).map(toBooking));
});

// ── Buat booking baru ──────────────────────────────────────────────────────
sportCenterRouter.post("/", async (req: Request, res: Response) => {
  const {
    bookingCode, facilityId, facilityName, customerName, customerPhone,
    customerEmail, date, startTime, endTime, totalHours, totalPrice, notes,
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

  // SSE realtime ke admin
  saveAndBroadcast("new_sport_booking", {
    type: "sport_booking",
    orderId: booking.id,
    orderNumber: booking.bookingCode,
    customerName: booking.customerName,
    companyName: null,
    facilityName: booking.facilityName,
    bookingDate: booking.date,
    startTime: booking.startTime,
    endTime: booking.endTime,
    grandTotal: booking.totalPrice,
  }).catch(() => {});

  // WA ke admin & grup
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

  // Email ke admin
  if (isSmtpConfigured()) {
    const adminEmail = process.env.ADMIN_EMAIL ?? "";
    if (adminEmail) {
      const price = Number(booking.totalPrice).toLocaleString("id-ID", {
        style: "currency", currency: "IDR", maximumFractionDigits: 0,
      });
      sendMail({
        to: adminEmail,
        subject: `[Sport Center] Booking Baru — ${booking.bookingCode}`,
        html: `<h2>Booking Baru — Sport Center SHIA</h2>
<table style="border-collapse:collapse;font-family:sans-serif;font-size:14px">
  <tr><td style="padding:4px 12px;color:#666">Kode</td><td style="padding:4px 12px"><b>${booking.bookingCode}</b></td></tr>
  <tr><td style="padding:4px 12px;color:#666">Pelanggan</td><td style="padding:4px 12px">${booking.customerName}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">HP</td><td style="padding:4px 12px">${booking.customerPhone}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Email</td><td style="padding:4px 12px">${booking.customerEmail}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Fasilitas</td><td style="padding:4px 12px">${booking.facilityName}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Tanggal</td><td style="padding:4px 12px">${booking.date}</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Waktu</td><td style="padding:4px 12px">${booking.startTime} – ${booking.endTime} (${booking.totalHours} jam)</td></tr>
  <tr><td style="padding:4px 12px;color:#666">Total</td><td style="padding:4px 12px"><b>${price}</b></td></tr>
  ${booking.notes ? `<tr><td style="padding:4px 12px;color:#666">Catatan</td><td style="padding:4px 12px">${booking.notes}</td></tr>` : ""}
</table>
<p style="color:#888;margin-top:16px">Segera konfirmasi di BizPortal › Sport Center › Booking.</p>`,
        text: `Booking Baru\nKode: ${booking.bookingCode}\nPelanggan: ${booking.customerName}\nFasilitas: ${booking.facilityName}\nTanggal: ${booking.date} ${booking.startTime}–${booking.endTime}\nTotal: ${price}`,
      }).catch(() => {});
    }
  }
});

// ── Update status booking (admin) ──────────────────────────────────────────
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
  res.json(toBooking(result.rows[0] as BookingRow & { payment_proof_url?: string | null; payment_proof_at?: Date | null; payment_status?: string }));
});

// ── Hapus booking (admin) ──────────────────────────────────────────────────
sportCenterRouter.delete("/:id", async (req: Request, res: Response) => {
  const id = parseInt(req.params.id);
  await db.execute(sql`DELETE FROM sport_center_bookings WHERE id = ${id}`);
  res.json({ success: true });
});
