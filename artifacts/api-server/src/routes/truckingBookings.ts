import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminGroupWa, getAdminWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ── Auto-create table ────────────────────────────────────────────────────────

db.execute(sql`
  CREATE TABLE IF NOT EXISTS trucking_booking_requests (
    id             SERIAL PRIMARY KEY,
    booking_number TEXT NOT NULL UNIQUE,
    vehicle_type   TEXT NOT NULL,
    vehicle_name   TEXT NOT NULL,
    area_pickup    TEXT NOT NULL,
    alamat_pickup  TEXT NOT NULL,
    pic_pickup     TEXT NOT NULL,
    hp_pickup      TEXT NOT NULL,
    area_delivery  TEXT NOT NULL,
    alamat_delivery TEXT NOT NULL,
    pic_penerima   TEXT NOT NULL,
    hp_penerima    TEXT NOT NULL,
    jadwal_type    TEXT NOT NULL DEFAULT 'sekarang',
    tanggal_pickup TEXT,
    jam_pickup     TEXT,
    jenis_barang   TEXT,
    berat_kg       NUMERIC,
    jumlah_koli    INTEGER,
    volume_m3      NUMERIC,
    catatan        TEXT,
    jumlah_trip    INTEGER NOT NULL DEFAULT 1,
    addons         JSONB NOT NULL DEFAULT '{}',
    estimasi_total NUMERIC NOT NULL DEFAULT 0,
    status         TEXT NOT NULL DEFAULT 'baru',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// ── Zod schema ───────────────────────────────────────────────────────────────

const BookingSchema = z.object({
  vehicleType:   z.string().min(1),
  vehicleName:   z.string().min(1),
  areaPickup:    z.string().min(1),
  alamatPickup:  z.string().min(1),
  picPickup:     z.string().min(1),
  hpPickup:      z.string().min(1),
  areaDelivery:  z.string().min(1),
  alamatDelivery: z.string().min(1),
  picPenerima:   z.string().min(1),
  hpPenerima:    z.string().min(1),
  jadwalType:    z.enum(["sekarang", "nanti"]),
  tanggalPickup: z.string().optional(),
  jamPickup:     z.string().optional(),
  jenisBarang:   z.string().optional(),
  beratKg:       z.number().nonnegative().optional(),
  jumlahKoli:    z.number().int().positive().optional(),
  volumeM3:      z.number().nonnegative().optional(),
  catatan:       z.string().optional(),
  jumlahTrip:    z.number().int().min(1),
  addons:        z.record(z.boolean()),
  estimasiTotal: z.number().nonnegative(),
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateBookingNumber(): string {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  const rnd = Math.floor(100000 + Math.random() * 900000);
  return `TRK/${y}${m}${d}/${rnd}`;
}

const AREA_LABEL: Record<string, string> = {
  "jawa-sumatra": "Jawa, Sumatra",
  kalimantan:     "Kalimantan",
  sulawesi:       "Sulawesi",
  "bali-nusra":  "Bali & Nusa Tenggara",
};

const ADDON_LABEL: Record<string, string> = {
  bantuanMuat:    "Bantuan Muat",
  bantuanBongkar: "Bantuan Bongkar",
  asuransi:       "Asuransi",
  ferry:          "Ferry / Penyeberangan",
  tol:            "Tol (actual cost)",
  multiDrop:      "Multi-drop",
  urgentDelivery: "Urgent Delivery",
  overnight:      "Overnight / Sewa Seharian",
};

function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);
}

function buildAdminMessage(b: z.infer<typeof BookingSchema>, bookingNumber: string): string {
  const activeAddons = Object.entries(b.addons)
    .filter(([, v]) => v)
    .map(([k]) => ADDON_LABEL[k] ?? k)
    .join(", ") || "—";

  const jadwal = b.jadwalType === "sekarang"
    ? "Pickup Sekarang"
    : `${b.tanggalPickup ?? "—"} jam ${b.jamPickup ?? "—"}`;

  return `🚛 *PERMINTAAN TRUCKING BARU*
No. Booking : *${bookingNumber}*

*ARMADA*
Kendaraan  : ${b.vehicleName}
Jumlah Trip: ${b.jumlahTrip} trip

*PICKUP*
Area       : ${AREA_LABEL[b.areaPickup] ?? b.areaPickup}
Alamat     : ${b.alamatPickup}
PIC        : ${b.picPickup}
HP         : ${b.hpPickup}

*DELIVERY*
Area       : ${AREA_LABEL[b.areaDelivery] ?? b.areaDelivery}
Alamat     : ${b.alamatDelivery}
Penerima   : ${b.picPenerima}
HP         : ${b.hpPenerima}

*JADWAL*
Pickup     : ${jadwal}

*BARANG*
Jenis      : ${b.jenisBarang ?? "—"}
Berat      : ${b.beratKg ? `${b.beratKg} kg` : "—"}
Koli       : ${b.jumlahKoli ?? "—"}
Volume     : ${b.volumeM3 ? `${b.volumeM3} m³` : "—"}
Catatan    : ${b.catatan || "—"}

*TAMBAHAN*
${activeAddons}

*ESTIMASI TOTAL: ${formatRp(b.estimasiTotal)}*

⏱ Harap segera konfirmasi ke customer.`;
}

// ── POST /api/trucking/bookings ───────────────────────────────────────────────

router.post("/", async (req: Request, res: Response) => {
  const parsed = BookingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Data tidak valid", errors: parsed.error.flatten() });
    return;
  }

  const b = parsed.data;
  const bookingNumber = generateBookingNumber();

  try {
    await db.execute(sql`
      INSERT INTO trucking_booking_requests (
        booking_number, vehicle_type, vehicle_name,
        area_pickup, alamat_pickup, pic_pickup, hp_pickup,
        area_delivery, alamat_delivery, pic_penerima, hp_penerima,
        jadwal_type, tanggal_pickup, jam_pickup,
        jenis_barang, berat_kg, jumlah_koli, volume_m3, catatan,
        jumlah_trip, addons, estimasi_total
      ) VALUES (
        ${bookingNumber}, ${b.vehicleType}, ${b.vehicleName},
        ${b.areaPickup}, ${b.alamatPickup}, ${b.picPickup}, ${b.hpPickup},
        ${b.areaDelivery}, ${b.alamatDelivery}, ${b.picPenerima}, ${b.hpPenerima},
        ${b.jadwalType}, ${b.tanggalPickup ?? null}, ${b.jamPickup ?? null},
        ${b.jenisBarang ?? null}, ${b.beratKg ?? null}, ${b.jumlahKoli ?? null},
        ${b.volumeM3 ?? null}, ${b.catatan ?? null},
        ${b.jumlahTrip}, ${JSON.stringify(b.addons)}, ${b.estimasiTotal}
      )
    `);
  } catch (err) {
    logger.error({ err }, "[truckingBookings] DB insert failed");
    res.status(500).json({ message: "Gagal menyimpan permintaan" });
    return;
  }

  // Send WA to admin (non-blocking)
  const msg = buildAdminMessage(b, bookingNumber);
  Promise.all([getAdminGroupWa(), getAdminWa()]).then(([group, personal]) => {
    if (group)    sendWhatsApp(group,    msg, { context: "trucking_booking", refId: bookingNumber }).catch((e: unknown) => logger.warn({ e }, "WA group failed"));
    if (personal) sendWhatsApp(personal, msg, { context: "trucking_booking", refId: bookingNumber }).catch((e: unknown) => logger.warn({ e }, "WA personal failed"));
  }).catch((e: unknown) => logger.warn({ e }, "getAdminWa failed"));

  res.status(201).json({ bookingNumber, message: "Permintaan berhasil dikirim" });
});

// ── GET /api/trucking/bookings (admin) ────────────────────────────────────────

router.get("/", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const result = await db.execute(sql`
      SELECT * FROM trucking_booking_requests
      ORDER BY created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    logger.error({ err }, "[truckingBookings] GET failed");
    res.status(500).json({ message: "Gagal memuat data" });
  }
});

export default router;
