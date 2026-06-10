import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── Boot: create tables ────────────────────────────────────────────────────────
db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS ocean_freight_rates (
    id SERIAL PRIMARY KEY,
    rate_code TEXT,
    rate_source_type TEXT NOT NULL DEFAULT 'shipping_line',
    rate_source_name TEXT NOT NULL DEFAULT '',
    vendor_id INTEGER,
    carrier_name TEXT,
    origin_city TEXT NOT NULL DEFAULT '',
    origin_port TEXT NOT NULL DEFAULT '',
    destination_city TEXT NOT NULL DEFAULT '',
    destination_port TEXT NOT NULL DEFAULT '',
    trade_type TEXT NOT NULL DEFAULT 'export',
    shipment_type TEXT NOT NULL DEFAULT 'FCL',
    service_mode TEXT NOT NULL DEFAULT 'port_to_port',
    container_type TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    exchange_rate_to_idr NUMERIC(15,4) NOT NULL DEFAULT 16500,
    ocean_freight_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
    lcl_rate_per_cbm NUMERIC(15,2),
    lcl_minimum_cbm NUMERIC(10,2),
    thc_origin NUMERIC(12,2) NOT NULL DEFAULT 0,
    thc_destination NUMERIC(12,2) NOT NULL DEFAULT 0,
    doc_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    bl_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    do_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    handling_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    customs_clearance_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
    trucking_pickup_estimate NUMERIC(12,2) NOT NULL DEFAULT 0,
    trucking_delivery_estimate NUMERIC(12,2) NOT NULL DEFAULT 0,
    insurance_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
    dg_surcharge_percent NUMERIC(8,4) NOT NULL DEFAULT 0,
    reefer_surcharge NUMERIC(12,2) NOT NULL DEFAULT 0,
    peak_season_surcharge NUMERIC(12,2) NOT NULL DEFAULT 0,
    emergency_bunker_surcharge NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency_adjustment_factor NUMERIC(12,2) NOT NULL DEFAULT 0,
    valid_from DATE NOT NULL DEFAULT CURRENT_DATE,
    valid_until DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    transit_days INTEGER,
    carrier TEXT,
    vessel_name TEXT,
    voyage TEXT,
    direct_or_transshipment TEXT NOT NULL DEFAULT 'direct',
    price_status TEXT NOT NULL DEFAULT 'estimate',
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    company_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`)).catch((e: unknown) => console.warn("ofr rates boot:", e));

// ── Seed data (idempotent) ────────────────────────────────────────────────────
const today = new Date().toISOString().slice(0, 10);
const in30  = new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10);
const in60  = new Date(Date.now() + 60 * 86400_000).toISOString().slice(0, 10);

db.execute(sql.raw(`
  INSERT INTO ocean_freight_rates
    (rate_source_type,rate_source_name,carrier_name,origin_city,origin_port,destination_city,destination_port,
     trade_type,shipment_type,service_mode,container_type,currency,exchange_rate_to_idr,
     ocean_freight_amount,thc_origin,thc_destination,doc_fee,bl_fee,do_fee,handling_fee,
     customs_clearance_fee,valid_from,valid_until,transit_days,direct_or_transshipment,price_status,is_active)
  VALUES
    ('shipping_line','Samudera','Samudera','Surabaya','Tanjung Perak','Singapore','PSA Singapore',
     'export','FCL','port_to_port','20ft','USD',16500,
     350,150,180,50,35,45,75,100,'${today}','${in30}',5,'direct','estimate',TRUE),
    ('shipping_line','Samudera','Samudera','Surabaya','Tanjung Perak','Singapore','PSA Singapore',
     'export','FCL','port_to_port','40ft','USD',16500,
     600,150,180,50,35,45,75,100,'${today}','${in30}',5,'direct','estimate',TRUE),
    ('shipping_line','Samudera','Samudera','Surabaya','Tanjung Perak','Singapore','PSA Singapore',
     'export','LCL','port_to_port',NULL,'USD',16500,
     0,80,100,50,35,45,60,100,'${today}','${in30}',6,'direct','estimate',TRUE),
    ('shipping_line','CMA CGM','CMA CGM','Jakarta','Tanjung Priok','Singapore','PSA Singapore',
     'export','FCL','port_to_port','20ft','USD',16500,
     380,160,180,50,35,45,75,100,'${today}','${in60}',4,'direct','estimate',TRUE),
    ('shipping_line','CMA CGM','CMA CGM','Jakarta','Tanjung Priok','Singapore','PSA Singapore',
     'export','FCL','port_to_port','40ft','USD',16500,
     650,160,180,50,35,45,75,100,'${today}','${in60}',4,'direct','estimate',TRUE),
    ('nvocc','NVOCC Partner','Via NVOCC','Jakarta','Tanjung Priok','Singapore','PSA Singapore',
     'export','LCL','port_to_port',NULL,'USD',16500,
     0,80,100,50,35,45,55,100,'${today}','${in30}',7,'transshipment','estimate',TRUE)
  ON CONFLICT DO NOTHING
`)).catch((e: unknown) => console.warn("ofr seed:", e));

// ── Validation ─────────────────────────────────────────────────────────────────
function validateRate(b: Record<string, unknown>): string | null {
  if (!b.currency) return "currency wajib diisi";
  const currency = String(b.currency);
  if (currency !== "IDR") {
    const exr = Number(b.exchange_rate_to_idr ?? 0);
    if (!exr || exr <= 0) return "exchange_rate_to_idr wajib diisi jika currency bukan IDR";
  }
  if (b.valid_until && b.valid_from && String(b.valid_until) < String(b.valid_from))
    return "valid_until harus >= valid_from";
  const shipType = String(b.shipment_type ?? "FCL");
  if (shipType === "FCL") {
    if (!b.container_type) return "container_type wajib untuk FCL";
    if (Number(b.ocean_freight_amount ?? 0) < 0) return "ocean_freight_amount tidak boleh negatif";
  }
  if (shipType === "LCL") {
    if (Number(b.lcl_rate_per_cbm ?? 0) <= 0) return "lcl_rate_per_cbm wajib untuk LCL";
    if (Number(b.lcl_minimum_cbm ?? 0) < 0) return "lcl_minimum_cbm tidak boleh negatif";
  }
  return null;
}

// GET /api/ocean-freight-rates — list
router.get("/", requireAdmin, async (_req: Request, res: Response) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT r.*, s.name AS vendor_name
      FROM ocean_freight_rates r
      LEFT JOIN suppliers s ON s.id = r.vendor_id
      ORDER BY r.created_at DESC
    `);
    return res.json(rows);
  } catch (e) {
    console.error("[ocean-freight-rates/list]", e);
    return res.status(500).json({ error: "Gagal ambil data rate" });
  }
});

// GET /api/ocean-freight-rates/:id
router.get("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { rows } = await db.execute(sql`
      SELECT * FROM ocean_freight_rates WHERE id = ${Number(req.params.id)}
    `);
    if (!rows.length) return res.status(404).json({ error: "Rate tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    return res.status(500).json({ error: "Gagal ambil rate" });
  }
});

// POST /api/ocean-freight-rates
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const err = validateRate(b);
  if (err) return res.status(400).json({ error: err });
  try {
    const { rows } = await db.execute(sql`
      INSERT INTO ocean_freight_rates (
        rate_code, rate_source_type, rate_source_name, vendor_id, carrier_name,
        origin_city, origin_port, destination_city, destination_port,
        trade_type, shipment_type, service_mode, container_type,
        currency, exchange_rate_to_idr, ocean_freight_amount,
        lcl_rate_per_cbm, lcl_minimum_cbm,
        thc_origin, thc_destination, doc_fee, bl_fee, do_fee, handling_fee,
        customs_clearance_fee, trucking_pickup_estimate, trucking_delivery_estimate,
        insurance_percent, dg_surcharge_percent, reefer_surcharge,
        peak_season_surcharge, emergency_bunker_surcharge, currency_adjustment_factor,
        valid_from, valid_until, transit_days, carrier, vessel_name, voyage,
        direct_or_transshipment, price_status, notes, is_active,
        created_at, updated_at
      ) VALUES (
        ${b.rate_code ?? null}, ${b.rate_source_type ?? "shipping_line"}, ${b.rate_source_name ?? ""},
        ${b.vendor_id ? Number(b.vendor_id) : null}, ${b.carrier_name ?? null},
        ${b.origin_city ?? ""}, ${b.origin_port ?? ""}, ${b.destination_city ?? ""}, ${b.destination_port ?? ""},
        ${b.trade_type ?? "export"}, ${b.shipment_type ?? "FCL"}, ${b.service_mode ?? "port_to_port"},
        ${b.container_type ?? null},
        ${b.currency ?? "USD"}, ${Number(b.exchange_rate_to_idr ?? 16500)}, ${Number(b.ocean_freight_amount ?? 0)},
        ${b.lcl_rate_per_cbm ? Number(b.lcl_rate_per_cbm) : null},
        ${b.lcl_minimum_cbm ? Number(b.lcl_minimum_cbm) : null},
        ${Number(b.thc_origin ?? 0)}, ${Number(b.thc_destination ?? 0)},
        ${Number(b.doc_fee ?? 0)}, ${Number(b.bl_fee ?? 0)}, ${Number(b.do_fee ?? 0)},
        ${Number(b.handling_fee ?? 0)}, ${Number(b.customs_clearance_fee ?? 0)},
        ${Number(b.trucking_pickup_estimate ?? 0)}, ${Number(b.trucking_delivery_estimate ?? 0)},
        ${Number(b.insurance_percent ?? 0)}, ${Number(b.dg_surcharge_percent ?? 0)},
        ${Number(b.reefer_surcharge ?? 0)}, ${Number(b.peak_season_surcharge ?? 0)},
        ${Number(b.emergency_bunker_surcharge ?? 0)}, ${Number(b.currency_adjustment_factor ?? 0)},
        ${b.valid_from ?? today}::date, ${b.valid_until ?? in30}::date,
        ${b.transit_days ? Number(b.transit_days) : null},
        ${b.carrier ?? null}, ${b.vessel_name ?? null}, ${b.voyage ?? null},
        ${b.direct_or_transshipment ?? "direct"}, ${b.price_status ?? "estimate"},
        ${b.notes ?? null}, ${b.is_active !== false},
        NOW(), NOW()
      ) RETURNING *
    `);
    return res.status(201).json(rows[0]);
  } catch (e) {
    console.error("[ocean-freight-rates/create]", e);
    return res.status(500).json({ error: "Gagal buat rate" });
  }
});

// PUT /api/ocean-freight-rates/:id
router.put("/:id", requireAdmin, async (req: Request, res: Response) => {
  const b = req.body ?? {};
  const err = validateRate(b);
  if (err) return res.status(400).json({ error: err });
  try {
    const { rows } = await db.execute(sql`
      UPDATE ocean_freight_rates SET
        rate_code = ${b.rate_code ?? null},
        rate_source_type = ${b.rate_source_type ?? "shipping_line"},
        rate_source_name = ${b.rate_source_name ?? ""},
        vendor_id = ${b.vendor_id ? Number(b.vendor_id) : null},
        carrier_name = ${b.carrier_name ?? null},
        origin_city = ${b.origin_city ?? ""},
        origin_port = ${b.origin_port ?? ""},
        destination_city = ${b.destination_city ?? ""},
        destination_port = ${b.destination_port ?? ""},
        trade_type = ${b.trade_type ?? "export"},
        shipment_type = ${b.shipment_type ?? "FCL"},
        service_mode = ${b.service_mode ?? "port_to_port"},
        container_type = ${b.container_type ?? null},
        currency = ${b.currency ?? "USD"},
        exchange_rate_to_idr = ${Number(b.exchange_rate_to_idr ?? 16500)},
        ocean_freight_amount = ${Number(b.ocean_freight_amount ?? 0)},
        lcl_rate_per_cbm = ${b.lcl_rate_per_cbm ? Number(b.lcl_rate_per_cbm) : null},
        lcl_minimum_cbm = ${b.lcl_minimum_cbm ? Number(b.lcl_minimum_cbm) : null},
        thc_origin = ${Number(b.thc_origin ?? 0)},
        thc_destination = ${Number(b.thc_destination ?? 0)},
        doc_fee = ${Number(b.doc_fee ?? 0)},
        bl_fee = ${Number(b.bl_fee ?? 0)},
        do_fee = ${Number(b.do_fee ?? 0)},
        handling_fee = ${Number(b.handling_fee ?? 0)},
        customs_clearance_fee = ${Number(b.customs_clearance_fee ?? 0)},
        trucking_pickup_estimate = ${Number(b.trucking_pickup_estimate ?? 0)},
        trucking_delivery_estimate = ${Number(b.trucking_delivery_estimate ?? 0)},
        insurance_percent = ${Number(b.insurance_percent ?? 0)},
        dg_surcharge_percent = ${Number(b.dg_surcharge_percent ?? 0)},
        reefer_surcharge = ${Number(b.reefer_surcharge ?? 0)},
        peak_season_surcharge = ${Number(b.peak_season_surcharge ?? 0)},
        emergency_bunker_surcharge = ${Number(b.emergency_bunker_surcharge ?? 0)},
        currency_adjustment_factor = ${Number(b.currency_adjustment_factor ?? 0)},
        valid_from = ${b.valid_from ?? today}::date,
        valid_until = ${b.valid_until ?? in30}::date,
        transit_days = ${b.transit_days ? Number(b.transit_days) : null},
        carrier = ${b.carrier ?? null},
        vessel_name = ${b.vessel_name ?? null},
        voyage = ${b.voyage ?? null},
        direct_or_transshipment = ${b.direct_or_transshipment ?? "direct"},
        price_status = ${b.price_status ?? "estimate"},
        notes = ${b.notes ?? null},
        is_active = ${b.is_active !== false},
        updated_at = NOW()
      WHERE id = ${Number(req.params.id)}
      RETURNING *
    `);
    if (!rows.length) return res.status(404).json({ error: "Rate tidak ditemukan" });
    return res.json(rows[0]);
  } catch (e) {
    console.error("[ocean-freight-rates/update]", e);
    return res.status(500).json({ error: "Gagal update rate" });
  }
});

// DELETE /api/ocean-freight-rates/:id
router.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    await db.execute(sql`DELETE FROM ocean_freight_rates WHERE id = ${Number(req.params.id)}`);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal hapus rate" });
  }
});

export default router;
