import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

const router = Router();

function validateRate(b: Record<string, unknown>): string | null {
  if (b.valid_until && b.valid_from && String(b.valid_until) < String(b.valid_from))
    return "valid_until harus >= valid_from";
  const cur = String(b.currency ?? "IDR");
  if (cur !== "IDR") {
    const er = Number(b.exchange_rate_to_idr ?? 0);
    if (!er || er <= 0) return "exchange_rate_to_idr wajib diisi jika currency bukan IDR";
  }
  const st = String(b.shipment_type ?? "FCL");
  if (st === "FCL") {
    if (!b.container_type) return "container_type wajib untuk FCL";
    if (!(Number(b.ocean_freight_amount ?? 0) > 0)) return "ocean_freight_amount wajib untuk FCL";
  }
  if (st === "LCL") {
    if (!(Number(b.lcl_rate_per_cbm ?? 0) > 0)) return "lcl_rate_per_cbm wajib untuk LCL";
    if (!(Number(b.lcl_minimum_cbm ?? 0) > 0)) return "lcl_minimum_cbm wajib untuk LCL";
  }
  const numFields = [
    "exchange_rate_to_idr","ocean_freight_amount","lcl_rate_per_cbm","lcl_minimum_cbm",
    "thc_origin","thc_destination","doc_fee","bl_fee","do_fee","handling_fee",
    "customs_clearance_fee","trucking_pickup_estimate","trucking_delivery_estimate",
    "insurance_percent","dg_surcharge_percent","reefer_surcharge","peak_season_surcharge",
    "emergency_bunker_surcharge","currency_adjustment_factor",
  ];
  for (const f of numFields) {
    const v = b[f];
    if (v != null && Number(v) < 0) return `${f} tidak boleh negatif`;
  }
  return null;
}

// ── GET /rates ────────────────────────────────────────────────────────────────
router.get("/rates", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const cId        = req.query.companyId ? Number(req.query.companyId) : null;
    const originPort = (req.query.origin_port as string) || null;
    const destPort   = (req.query.destination_port as string) || null;
    const shipType   = (req.query.shipment_type as string) || null;
    const contType   = (req.query.container_type as string) || null;
    const svcMode    = (req.query.service_mode as string) || null;
    const srcType    = (req.query.rate_source_type as string) || null;
    const currency   = (req.query.currency as string) || null;
    const tradeType  = (req.query.trade_type as string) || null;
    const validOnly  = req.query.valid_only !== "false";
    const activeOnly = req.query.active_only !== "false";
    const search     = (req.query.search as string) || null;
    const page       = Math.max(1, Number(req.query.page ?? 1));
    const limit      = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const offset     = (page - 1) * limit;
    const today      = new Date().toISOString().slice(0, 10);

    const where = [
      cId != null ? `company_id = ${cId}` : "TRUE",
      originPort ? `origin_port ILIKE '%${originPort.replace(/'/g, "''")}%'` : "TRUE",
      destPort   ? `destination_port ILIKE '%${destPort.replace(/'/g, "''")}%'` : "TRUE",
      shipType   ? `shipment_type = '${shipType.replace(/'/g, "''")}'` : "TRUE",
      contType   ? `container_type = '${contType.replace(/'/g, "''")}'` : "TRUE",
      svcMode    ? `service_mode = '${svcMode.replace(/'/g, "''")}'` : "TRUE",
      srcType    ? `rate_source_type = '${srcType.replace(/'/g, "''")}'` : "TRUE",
      currency   ? `currency = '${currency.replace(/'/g, "''")}'` : "TRUE",
      tradeType  ? `trade_type = '${tradeType.replace(/'/g, "''")}'` : "TRUE",
      activeOnly ? "is_active = TRUE" : "TRUE",
      validOnly  ? `(valid_from <= '${today}' AND valid_until >= '${today}')` : "TRUE",
      search     ? `(rate_source_name ILIKE '%${search.replace(/'/g, "''")}%' OR carrier_name ILIKE '%${search.replace(/'/g, "''")}%' OR origin_port ILIKE '%${search.replace(/'/g, "''")}%' OR destination_port ILIKE '%${search.replace(/'/g, "''")}%')` : "TRUE",
    ].join(" AND ");

    const [dataRes, cntRes] = await Promise.all([
      db.execute(sql.raw(`SELECT * FROM ocean_freight_rates WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`)),
      db.execute(sql.raw(`SELECT COUNT(*) AS cnt FROM ocean_freight_rates WHERE ${where}`)),
    ]);
    res.json({ data: dataRes.rows, total: Number((cntRes.rows[0] as any)?.cnt ?? 0), page, limit });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-rates] GET /rates");
    res.status(500).json({ error: "Gagal memuat rates" });
  }
});

// ── POST /rates ───────────────────────────────────────────────────────────────
router.post("/rates", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const b = req.body as Record<string, unknown>;
    const err = validateRate(b);
    if (err) return res.status(400).json({ error: err });

    const fields = [
      "rate_code","rate_source_type","rate_source_name","vendor_id","carrier_name",
      "origin_city","origin_port","destination_city","destination_port","trade_type",
      "shipment_type","service_mode","container_type","currency","exchange_rate_to_idr",
      "ocean_freight_amount","lcl_rate_per_cbm","lcl_minimum_cbm","thc_origin","thc_destination",
      "doc_fee","bl_fee","do_fee","handling_fee","customs_clearance_fee",
      "trucking_pickup_estimate","trucking_delivery_estimate","insurance_percent",
      "dg_surcharge_percent","reefer_surcharge","peak_season_surcharge",
      "emergency_bunker_surcharge","currency_adjustment_factor",
      "valid_from","valid_until","transit_days","carrier","vessel_name","voyage",
      "direct_or_transshipment","price_status","notes","is_active",
    ];
    const cols: string[] = [];
    const vals: string[] = [];
    for (const f of fields) {
      if (b[f] === undefined || b[f] === null) continue;
      cols.push(f);
      const v = b[f];
      if (typeof v === "boolean") vals.push(v ? "TRUE" : "FALSE");
      else if (typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v !== "")) vals.push(String(Number(v)));
      else vals.push(`'${String(v).replace(/'/g, "''")}'`);
    }

    const res2 = await db.execute(sql.raw(`INSERT INTO ocean_freight_rates (${cols.join(",")}) VALUES (${vals.join(",")}) RETURNING *`));
    res.status(201).json(res2.rows[0]);
  } catch (err) {
    logger.error({ err }, "[ocean-freight-rates] POST /rates");
    res.status(500).json({ error: "Gagal membuat rate" });
  }
});

// ── PUT /rates/:id ────────────────────────────────────────────────────────────
router.put("/rates/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    const b  = req.body as Record<string, unknown>;
    const err = validateRate(b);
    if (err) return res.status(400).json({ error: err });

    const updatable = [
      "rate_code","rate_source_type","rate_source_name","vendor_id","carrier_name",
      "origin_city","origin_port","destination_city","destination_port","trade_type",
      "shipment_type","service_mode","container_type","currency","exchange_rate_to_idr",
      "ocean_freight_amount","lcl_rate_per_cbm","lcl_minimum_cbm","thc_origin","thc_destination",
      "doc_fee","bl_fee","do_fee","handling_fee","customs_clearance_fee",
      "trucking_pickup_estimate","trucking_delivery_estimate","insurance_percent",
      "dg_surcharge_percent","reefer_surcharge","peak_season_surcharge",
      "emergency_bunker_surcharge","currency_adjustment_factor",
      "valid_from","valid_until","transit_days","carrier","vessel_name","voyage",
      "direct_or_transshipment","price_status","notes","is_active",
    ];
    const sets: string[] = [];
    for (const f of updatable) {
      if (!(f in b)) continue;
      const v = b[f];
      if (typeof v === "boolean") sets.push(`${f} = ${v ? "TRUE" : "FALSE"}`);
      else if (v === null) sets.push(`${f} = NULL`);
      else if (typeof v === "number" || (typeof v === "string" && !isNaN(Number(v)) && v !== "")) sets.push(`${f} = ${Number(v)}`);
      else sets.push(`${f} = '${String(v).replace(/'/g, "''")}'`);
    }
    if (!sets.length) return res.status(400).json({ error: "Tidak ada field untuk diupdate" });
    sets.push("updated_at = NOW()");

    const res2 = await db.execute(sql.raw(`UPDATE ocean_freight_rates SET ${sets.join(", ")} WHERE id = ${id} RETURNING *`));
    if (!res2.rows[0]) return res.status(404).json({ error: "Rate tidak ditemukan" });
    res.json(res2.rows[0]);
  } catch (err) {
    logger.error({ err }, "[ocean-freight-rates] PUT /rates/:id");
    res.status(500).json({ error: "Gagal update rate" });
  }
});

// ── DELETE /rates/:id ─────────────────────────────────────────────────────────
router.delete("/rates/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    await db.execute(sql.raw(`DELETE FROM ocean_freight_rates WHERE id = ${id}`));
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-rates] DELETE /rates/:id");
    res.status(500).json({ error: "Gagal hapus rate" });
  }
});

// ── PATCH /rates/:id/toggle ───────────────────────────────────────────────────
router.patch("/rates/:id/toggle", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    const res2 = await db.execute(sql.raw(`UPDATE ocean_freight_rates SET is_active = NOT is_active, updated_at = NOW() WHERE id = ${id} RETURNING is_active`));
    if (!res2.rows[0]) return res.status(404).json({ error: "Rate tidak ditemukan" });
    res.json({ ok: true, is_active: (res2.rows[0] as any).is_active });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-rates] PATCH /rates/:id/toggle");
    res.status(500).json({ error: "Gagal toggle rate" });
  }
});

export default router;
