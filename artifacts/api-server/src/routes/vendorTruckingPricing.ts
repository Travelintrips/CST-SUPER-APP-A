import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { calculateTruckingEstimate, pricingRowToInput, type TruckingEstimateOptions } from "../lib/truckingPricingEngine.js";

const router = Router();

db.execute(sql`
  CREATE TABLE IF NOT EXISTS vendor_trucking_pricing (
    id                             SERIAL PRIMARY KEY,
    vendor_id                      INTEGER NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
    vehicle_type                   TEXT NOT NULL,
    price_per_km                   NUMERIC(15,2) NOT NULL DEFAULT 0,
    minimum_charge                 NUMERIC(15,2) NOT NULL DEFAULT 0,
    inner_city_radius_km           NUMERIC(8,2)  NOT NULL DEFAULT 30,
    out_of_city_surcharge_percent  NUMERIC(6,2)  NOT NULL DEFAULT 0,
    inter_province_surcharge_percent NUMERIC(6,2) NOT NULL DEFAULT 0,
    inter_island_surcharge_percent NUMERIC(6,2)  NOT NULL DEFAULT 0,
    toll_mode                      TEXT NOT NULL DEFAULT 'actual_cost',
    toll_flat_amount               NUMERIC(15,2) NOT NULL DEFAULT 0,
    ferry_mode                     TEXT NOT NULL DEFAULT 'not_available',
    ferry_flat_amount              NUMERIC(15,2) NOT NULL DEFAULT 0,
    loading_helper_fee             NUMERIC(15,2) NOT NULL DEFAULT 0,
    unloading_helper_fee           NUMERIC(15,2) NOT NULL DEFAULT 0,
    insurance_percent              NUMERIC(6,2)  NOT NULL DEFAULT 0,
    urgent_surcharge_percent       NUMERIC(6,2)  NOT NULL DEFAULT 0,
    waiting_free_hours             NUMERIC(5,1)  NOT NULL DEFAULT 2,
    waiting_fee_per_hour           NUMERIC(15,2) NOT NULL DEFAULT 0,
    multidrop_fee_per_drop         NUMERIC(15,2) NOT NULL DEFAULT 0,
    overnight_fee_per_night        NUMERIC(15,2) NOT NULL DEFAULT 0,
    daily_rental_price             NUMERIC(15,2) NOT NULL DEFAULT 0,
    is_active                      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                     TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

router.get("/", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const vendorId = req.query.vendor_id ? Number(req.query.vendor_id) : null;
    const rows = await db.execute(sql`
      SELECT vtp.*, s.name AS vendor_name
      FROM vendor_trucking_pricing vtp
      JOIN suppliers s ON s.id = vtp.vendor_id
      WHERE (${vendorId}::int IS NULL OR vtp.vendor_id = ${vendorId})
        AND vtp.is_active = TRUE
      ORDER BY s.name, vtp.vehicle_type
    `);
    res.json(rows.rows);
  } catch (e) {
    console.error("GET /vendor-trucking-pricing error:", e);
    res.status(500).json({ error: "Gagal memuat data" });
  }
});

router.get("/all", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const vendorId = req.query.vendor_id ? Number(req.query.vendor_id) : null;
    const rows = await db.execute(sql`
      SELECT vtp.*, s.name AS vendor_name
      FROM vendor_trucking_pricing vtp
      JOIN suppliers s ON s.id = vtp.vendor_id
      WHERE (${vendorId}::int IS NULL OR vtp.vendor_id = ${vendorId})
      ORDER BY s.name, vtp.vehicle_type
    `);
    res.json(rows.rows);
  } catch (e) {
    console.error("GET /vendor-trucking-pricing/all error:", e);
    res.status(500).json({ error: "Gagal memuat data" });
  }
});

router.get("/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    const rows = await db.execute(sql`
      SELECT vtp.*, s.name AS vendor_name
      FROM vendor_trucking_pricing vtp
      JOIN suppliers s ON s.id = vtp.vendor_id
      WHERE vtp.id = ${id}
    `);
    if (!rows.rows.length) { res.status(404).json({ error: "Tidak ditemukan" }); return; }
    res.json(rows.rows[0]);
  } catch (e) {
    console.error("GET /vendor-trucking-pricing/:id error:", e);
    res.status(500).json({ error: "Gagal" });
  }
});

router.post("/", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body as Record<string, unknown>;
  const n = (v: unknown, def = 0) => v != null && v !== "" ? Number(v) : def;
  try {
    const rows = await db.execute(sql`
      INSERT INTO vendor_trucking_pricing (
        vendor_id, vehicle_type, price_per_km, minimum_charge,
        inner_city_radius_km, out_of_city_surcharge_percent,
        inter_province_surcharge_percent, inter_island_surcharge_percent,
        toll_mode, toll_flat_amount, ferry_mode, ferry_flat_amount,
        loading_helper_fee, unloading_helper_fee,
        insurance_percent, urgent_surcharge_percent,
        waiting_free_hours, waiting_fee_per_hour,
        multidrop_fee_per_drop, overnight_fee_per_night, daily_rental_price, is_active
      ) VALUES (
        ${Number(b.vendor_id)}, ${String(b.vehicle_type ?? "")},
        ${n(b.price_per_km)}, ${n(b.minimum_charge)},
        ${n(b.inner_city_radius_km, 30)}, ${n(b.out_of_city_surcharge_percent)},
        ${n(b.inter_province_surcharge_percent)}, ${n(b.inter_island_surcharge_percent)},
        ${String(b.toll_mode ?? "actual_cost")}, ${n(b.toll_flat_amount)},
        ${String(b.ferry_mode ?? "not_available")}, ${n(b.ferry_flat_amount)},
        ${n(b.loading_helper_fee)}, ${n(b.unloading_helper_fee)},
        ${n(b.insurance_percent)}, ${n(b.urgent_surcharge_percent)},
        ${n(b.waiting_free_hours, 2)}, ${n(b.waiting_fee_per_hour)},
        ${n(b.multidrop_fee_per_drop)}, ${n(b.overnight_fee_per_night)},
        ${n(b.daily_rental_price)}, ${b.is_active !== false}
      ) RETURNING *
    `);
    res.status(201).json(rows.rows[0]);
  } catch (e: unknown) {
    console.error("POST /vendor-trucking-pricing error:", e);
    if (e instanceof Error && e.message.includes("suppliers")) {
      res.status(400).json({ error: "vendor_id tidak valid" });
    } else {
      res.status(500).json({ error: "Gagal menyimpan" });
    }
  }
});

router.put("/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  const b = req.body as Record<string, unknown>;
  const n = (v: unknown, def = 0) => v != null && v !== "" ? Number(v) : def;
  try {
    const rows = await db.execute(sql`
      UPDATE vendor_trucking_pricing SET
        vehicle_type                     = ${String(b.vehicle_type ?? "")},
        price_per_km                     = ${n(b.price_per_km)},
        minimum_charge                   = ${n(b.minimum_charge)},
        inner_city_radius_km             = ${n(b.inner_city_radius_km, 30)},
        out_of_city_surcharge_percent    = ${n(b.out_of_city_surcharge_percent)},
        inter_province_surcharge_percent = ${n(b.inter_province_surcharge_percent)},
        inter_island_surcharge_percent   = ${n(b.inter_island_surcharge_percent)},
        toll_mode                        = ${String(b.toll_mode ?? "actual_cost")},
        toll_flat_amount                 = ${n(b.toll_flat_amount)},
        ferry_mode                       = ${String(b.ferry_mode ?? "not_available")},
        ferry_flat_amount                = ${n(b.ferry_flat_amount)},
        loading_helper_fee               = ${n(b.loading_helper_fee)},
        unloading_helper_fee             = ${n(b.unloading_helper_fee)},
        insurance_percent                = ${n(b.insurance_percent)},
        urgent_surcharge_percent         = ${n(b.urgent_surcharge_percent)},
        waiting_free_hours               = ${n(b.waiting_free_hours, 2)},
        waiting_fee_per_hour             = ${n(b.waiting_fee_per_hour)},
        multidrop_fee_per_drop           = ${n(b.multidrop_fee_per_drop)},
        overnight_fee_per_night          = ${n(b.overnight_fee_per_night)},
        daily_rental_price               = ${n(b.daily_rental_price)},
        is_active                        = ${b.is_active !== false},
        updated_at                       = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    if (!rows.rows.length) { res.status(404).json({ error: "Tidak ditemukan" }); return; }
    res.json(rows.rows[0]);
  } catch (e) {
    console.error("PUT /vendor-trucking-pricing/:id error:", e);
    res.status(500).json({ error: "Gagal update" });
  }
});

router.delete("/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "ID tidak valid" }); return; }
  try {
    await db.execute(sql`DELETE FROM vendor_trucking_pricing WHERE id = ${id}`);
    res.json({ ok: true });
  } catch (e) {
    console.error("DELETE /vendor-trucking-pricing/:id error:", e);
    res.status(500).json({ error: "Gagal hapus" });
  }
});

router.post("/estimate", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body as {
    vendor_id?: number;
    pricing_id?: number;
    options?: TruckingEstimateOptions;
  };

  try {
    let pricingRows;
    if (b.pricing_id) {
      pricingRows = await db.execute(sql`
        SELECT * FROM vendor_trucking_pricing WHERE id = ${b.pricing_id} AND is_active = TRUE
      `);
    } else if (b.vendor_id) {
      pricingRows = await db.execute(sql`
        SELECT * FROM vendor_trucking_pricing WHERE vendor_id = ${b.vendor_id} AND is_active = TRUE
        ORDER BY vehicle_type
      `);
    } else {
      res.status(400).json({ error: "vendor_id atau pricing_id wajib diisi" });
      return;
    }

    if (!pricingRows.rows.length) {
      res.status(404).json({ error: "Pricing tidak ditemukan untuk vendor ini" });
      return;
    }

    const options: TruckingEstimateOptions = b.options ?? {};
    const results = (pricingRows.rows as Record<string, unknown>[]).map((row) =>
      calculateTruckingEstimate(options, pricingRowToInput(row))
    );

    res.json(b.pricing_id ? results[0] : results);
  } catch (e) {
    console.error("POST /vendor-trucking-pricing/estimate error:", e);
    res.status(500).json({ error: "Gagal kalkulasi estimasi" });
  }
});

export default router;
