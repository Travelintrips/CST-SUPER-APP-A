import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── CREATE TABLE ─────────────────────────────────────────────────────────────
db.execute(sql`
  CREATE TABLE IF NOT EXISTS air_freight_orders (
    id                          SERIAL PRIMARY KEY,
    order_number                TEXT NOT NULL UNIQUE,
    customer_id                 INTEGER,
    customer_name               TEXT NOT NULL DEFAULT '',
    customer_phone              TEXT NOT NULL DEFAULT '',
    customer_email              TEXT NOT NULL DEFAULT '',
    origin_city                 TEXT NOT NULL DEFAULT '',
    origin_airport              TEXT NOT NULL DEFAULT '',
    destination_city            TEXT NOT NULL DEFAULT '',
    destination_airport         TEXT NOT NULL DEFAULT '',
    trade_type                  TEXT NOT NULL DEFAULT 'export',
    service_mode                TEXT NOT NULL DEFAULT 'door_to_door',
    service_level               TEXT NOT NULL DEFAULT 'standard',
    incoterm                    TEXT NOT NULL DEFAULT 'EXW',
    commodity                   TEXT NOT NULL DEFAULT '',
    hs_code                     TEXT,
    cargo_type                  TEXT NOT NULL DEFAULT 'general',
    gross_weight                NUMERIC(15,3) NOT NULL DEFAULT 0,
    total_volumetric_weight     NUMERIC(15,3) NOT NULL DEFAULT 0,
    chargeable_weight           NUMERIC(15,3) NOT NULL DEFAULT 0,
    koli                        INTEGER NOT NULL DEFAULT 0,
    dimension_rows              JSONB NOT NULL DEFAULT '[]',
    pickup_date                 DATE,
    ready_cargo_date            DATE,
    preferred_flight_date       DATE,
    target_arrival_date         DATE,
    selected_additional_services JSONB NOT NULL DEFAULT '[]',
    selected_estimate_option    TEXT,
    estimated_price             NUMERIC(20,2),
    estimated_price_idr         NUMERIC(20,2),
    currency                    TEXT NOT NULL DEFAULT 'IDR',
    pricing_breakdown           JSONB NOT NULL DEFAULT '{}',
    selected_rate_id            INTEGER,
    candidate_rate_ids          JSONB NOT NULL DEFAULT '[]',
    final_rate_id               INTEGER,
    final_price                 NUMERIC(20,2),
    final_price_idr             NUMERIC(20,2),
    markup_amount               NUMERIC(20,2),
    ppn_amount                  NUMERIC(20,2),
    grand_total                 NUMERIC(20,2),
    final_breakdown             JSONB,
    admin_notes                 TEXT,
    price_status                TEXT NOT NULL DEFAULT 'estimate'
                                  CHECK (price_status IN ('estimate','confirmed')),
    status                      TEXT NOT NULL DEFAULT 'draft'
                                  CHECK (status IN (
                                    'draft','estimated','waiting_rate','rate_requested',
                                    'rate_received','quoted','approved','booked',
                                    'departed','arrived','delivered','completed',
                                    'cancelled','quote_declined'
                                  )),
    source                      TEXT NOT NULL DEFAULT 'admin_portal'
                                  CHECK (source IN ('customer_portal','admin_portal','api')),
    company_id                  INTEGER,
    created_by                  TEXT,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(() => {});

// ── helpers ───────────────────────────────────────────────────────────────────
async function nextOrderNumber(companyId: number | null): Promise<string> {
  const year = new Date().getFullYear();
  const res = await db.execute(sql`
    SELECT COUNT(*) AS cnt FROM air_freight_orders
    WHERE EXTRACT(YEAR FROM created_at) = ${year}
      AND (${companyId}::int IS NULL OR company_id = ${companyId})
  `);
  const seq = Number((res.rows[0] as any)?.cnt ?? 0) + 1;
  return `AFO/${year}/${String(seq).padStart(5, "0")}`;
}

// ── GET /orders ───────────────────────────────────────────────────────────────
router.get("/orders", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const cId    = req.query.companyId   ? Number(req.query.companyId) : null;
    const status = (req.query.status  as string) || null;
    const source = (req.query.source  as string) || null;
    const search = (req.query.search  as string) || null;
    const originAirport = (req.query.origin_airport as string) || null;
    const destAirport   = (req.query.destination_airport as string) || null;
    const page   = Math.max(1, Number(req.query.page  ?? 1));
    const limit  = Math.min(100, Math.max(1, Number(req.query.limit ?? 50)));
    const offset = (page - 1) * limit;

    const [dataRes, countRes] = await Promise.all([
      db.execute(sql`
        SELECT * FROM air_freight_orders
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${status}::text IS NULL OR status = ${status})
          AND (${source}::text IS NULL OR source = ${source})
          AND (${originAirport}::text IS NULL OR origin_airport = ${originAirport})
          AND (${destAirport}::text IS NULL OR destination_airport = ${destAirport})
          AND (${search}::text IS NULL OR
               order_number ILIKE ${'%' + (search ?? '') + '%'} OR
               customer_name ILIKE ${'%' + (search ?? '') + '%'} OR
               customer_email ILIKE ${'%' + (search ?? '') + '%'} OR
               commodity ILIKE ${'%' + (search ?? '') + '%'})
        ORDER BY created_at DESC
        LIMIT ${limit} OFFSET ${offset}
      `),
      db.execute(sql`
        SELECT COUNT(*) AS cnt FROM air_freight_orders
        WHERE (${cId}::int IS NULL OR company_id = ${cId})
          AND (${status}::text IS NULL OR status = ${status})
          AND (${source}::text IS NULL OR source = ${source})
          AND (${originAirport}::text IS NULL OR origin_airport = ${originAirport})
          AND (${destAirport}::text IS NULL OR destination_airport = ${destAirport})
          AND (${search}::text IS NULL OR
               order_number ILIKE ${'%' + (search ?? '') + '%'} OR
               customer_name ILIKE ${'%' + (search ?? '') + '%'} OR
               customer_email ILIKE ${'%' + (search ?? '') + '%'} OR
               commodity ILIKE ${'%' + (search ?? '') + '%'})
      `),
    ]);

    res.json({
      data: dataRes.rows,
      total: Number((countRes.rows[0] as any)?.cnt ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error("[air-freight] GET /orders error:", err);
    res.status(500).json({ error: "Gagal memuat orders" });
  }
});

// ── POST /orders ──────────────────────────────────────────────────────────────
router.post("/orders", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const body = req.body;
    const companyId: number | null = body.company_id ? Number(body.company_id) : null;
    const createdBy = (req.user as { id: string } | undefined)?.id ?? null;
    const orderNumber = await nextOrderNumber(companyId);

    const r = await db.execute(sql`
      INSERT INTO air_freight_orders (
        order_number, customer_id, customer_name, customer_phone, customer_email,
        origin_city, origin_airport, destination_city, destination_airport,
        trade_type, service_mode, service_level, incoterm,
        commodity, hs_code, cargo_type,
        gross_weight, total_volumetric_weight, chargeable_weight, koli,
        dimension_rows, pickup_date, ready_cargo_date, preferred_flight_date, target_arrival_date,
        selected_additional_services, selected_estimate_option,
        estimated_price, estimated_price_idr, currency, pricing_breakdown,
        selected_rate_id, candidate_rate_ids,
        admin_notes, price_status, status, source, company_id, created_by
      ) VALUES (
        ${orderNumber},
        ${body.customer_id ?? null},
        ${body.customer_name ?? ''},
        ${body.customer_phone ?? ''},
        ${body.customer_email ?? ''},
        ${body.origin_city ?? ''},
        ${body.origin_airport ?? ''},
        ${body.destination_city ?? ''},
        ${body.destination_airport ?? ''},
        ${body.trade_type ?? 'export'},
        ${body.service_mode ?? 'door_to_door'},
        ${body.service_level ?? 'standard'},
        ${body.incoterm ?? 'EXW'},
        ${body.commodity ?? ''},
        ${body.hs_code ?? null},
        ${body.cargo_type ?? 'general'},
        ${body.gross_weight ?? 0},
        ${body.total_volumetric_weight ?? 0},
        ${body.chargeable_weight ?? 0},
        ${body.koli ?? 0},
        ${JSON.stringify(body.dimension_rows ?? [])}::jsonb,
        ${body.pickup_date ?? null},
        ${body.ready_cargo_date ?? null},
        ${body.preferred_flight_date ?? null},
        ${body.target_arrival_date ?? null},
        ${JSON.stringify(body.selected_additional_services ?? [])}::jsonb,
        ${body.selected_estimate_option ?? null},
        ${body.estimated_price ?? null},
        ${body.estimated_price_idr ?? null},
        ${body.currency ?? 'IDR'},
        ${JSON.stringify(body.pricing_breakdown ?? {})}::jsonb,
        ${body.selected_rate_id ?? null},
        ${JSON.stringify(body.candidate_rate_ids ?? [])}::jsonb,
        ${body.admin_notes ?? null},
        ${body.price_status ?? 'estimate'},
        ${body.status ?? 'draft'},
        ${body.source ?? 'admin_portal'},
        ${companyId},
        ${createdBy}
      ) RETURNING *
    `);
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error("[air-freight] POST /orders error:", err);
    res.status(500).json({ error: "Gagal membuat order" });
  }
});

// ── GET /orders/:id ───────────────────────────────────────────────────────────
router.get("/orders/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    const r = await db.execute(sql`SELECT * FROM air_freight_orders WHERE id = ${id} LIMIT 1`);
    if (!r.rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[air-freight] GET /orders/:id error:", err);
    res.status(500).json({ error: "Gagal" });
  }
});

// ── PUT /orders/:id ───────────────────────────────────────────────────────────
router.put("/orders/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id   = Number(req.params.id);
    const body = req.body;

    const existing = await db.execute(sql`SELECT id FROM air_freight_orders WHERE id = ${id} LIMIT 1`);
    if (!existing.rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });

    const r = await db.execute(sql`
      UPDATE air_freight_orders SET
        customer_id                 = COALESCE(${body.customer_id ?? null}::int, customer_id),
        customer_name               = COALESCE(${body.customer_name ?? null}, customer_name),
        customer_phone              = COALESCE(${body.customer_phone ?? null}, customer_phone),
        customer_email              = COALESCE(${body.customer_email ?? null}, customer_email),
        origin_city                 = COALESCE(${body.origin_city ?? null}, origin_city),
        origin_airport              = COALESCE(${body.origin_airport ?? null}, origin_airport),
        destination_city            = COALESCE(${body.destination_city ?? null}, destination_city),
        destination_airport         = COALESCE(${body.destination_airport ?? null}, destination_airport),
        trade_type                  = COALESCE(${body.trade_type ?? null}, trade_type),
        service_mode                = COALESCE(${body.service_mode ?? null}, service_mode),
        service_level               = COALESCE(${body.service_level ?? null}, service_level),
        incoterm                    = COALESCE(${body.incoterm ?? null}, incoterm),
        commodity                   = COALESCE(${body.commodity ?? null}, commodity),
        hs_code                     = COALESCE(${body.hs_code ?? null}, hs_code),
        cargo_type                  = COALESCE(${body.cargo_type ?? null}, cargo_type),
        gross_weight                = COALESCE(${body.gross_weight ?? null}::numeric, gross_weight),
        total_volumetric_weight     = COALESCE(${body.total_volumetric_weight ?? null}::numeric, total_volumetric_weight),
        chargeable_weight           = COALESCE(${body.chargeable_weight ?? null}::numeric, chargeable_weight),
        koli                        = COALESCE(${body.koli ?? null}::int, koli),
        dimension_rows              = COALESCE(${body.dimension_rows != null ? JSON.stringify(body.dimension_rows) : null}::jsonb, dimension_rows),
        pickup_date                 = COALESCE(${body.pickup_date ?? null}::date, pickup_date),
        ready_cargo_date            = COALESCE(${body.ready_cargo_date ?? null}::date, ready_cargo_date),
        preferred_flight_date       = COALESCE(${body.preferred_flight_date ?? null}::date, preferred_flight_date),
        target_arrival_date         = COALESCE(${body.target_arrival_date ?? null}::date, target_arrival_date),
        selected_additional_services = COALESCE(${body.selected_additional_services != null ? JSON.stringify(body.selected_additional_services) : null}::jsonb, selected_additional_services),
        selected_estimate_option    = COALESCE(${body.selected_estimate_option ?? null}, selected_estimate_option),
        estimated_price             = COALESCE(${body.estimated_price ?? null}::numeric, estimated_price),
        estimated_price_idr         = COALESCE(${body.estimated_price_idr ?? null}::numeric, estimated_price_idr),
        currency                    = COALESCE(${body.currency ?? null}, currency),
        pricing_breakdown           = COALESCE(${body.pricing_breakdown != null ? JSON.stringify(body.pricing_breakdown) : null}::jsonb, pricing_breakdown),
        selected_rate_id            = COALESCE(${body.selected_rate_id ?? null}::int, selected_rate_id),
        candidate_rate_ids          = COALESCE(${body.candidate_rate_ids != null ? JSON.stringify(body.candidate_rate_ids) : null}::jsonb, candidate_rate_ids),
        final_rate_id               = COALESCE(${body.final_rate_id ?? null}::int, final_rate_id),
        final_price                 = COALESCE(${body.final_price ?? null}::numeric, final_price),
        final_price_idr             = COALESCE(${body.final_price_idr ?? null}::numeric, final_price_idr),
        markup_amount               = COALESCE(${body.markup_amount ?? null}::numeric, markup_amount),
        ppn_amount                  = COALESCE(${body.ppn_amount ?? null}::numeric, ppn_amount),
        grand_total                 = COALESCE(${body.grand_total ?? null}::numeric, grand_total),
        final_breakdown             = COALESCE(${body.final_breakdown != null ? JSON.stringify(body.final_breakdown) : null}::jsonb, final_breakdown),
        admin_notes                 = COALESCE(${body.admin_notes ?? null}, admin_notes),
        price_status                = COALESCE(${body.price_status ?? null}, price_status),
        status                      = COALESCE(${body.status ?? null}, status),
        updated_at                  = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[air-freight] PUT /orders/:id error:", err);
    res.status(500).json({ error: "Gagal mengupdate order" });
  }
});

// ── POST /orders/:id/request-quote ── customer klik "Minta Penawaran Final" ──
router.post("/orders/:id/request-quote", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    const existing = await db.execute(sql`
      SELECT id, status FROM air_freight_orders WHERE id = ${id} LIMIT 1
    `);
    if (!existing.rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });

    const r = await db.execute(sql`
      UPDATE air_freight_orders
      SET status = 'waiting_rate', updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[air-freight] POST /orders/:id/request-quote error:", err);
    res.status(500).json({ error: "Gagal mengupdate status" });
  }
});

// ── PATCH /orders/:id/status ──────────────────────────────────────────────────
router.patch("/orders/:id/status", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id      = Number(req.params.id);
    const { status } = req.body;
    const VALID_STATUSES = [
      'draft','estimated','waiting_rate','rate_requested','rate_received',
      'quoted','approved','booked','departed','arrived','delivered',
      'completed','cancelled','quote_declined',
    ];
    if (!status || !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Status tidak valid. Pilih salah satu: ${VALID_STATUSES.join(', ')}` });
    }
    const r = await db.execute(sql`
      UPDATE air_freight_orders
      SET status = ${status}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    res.json(r.rows[0]);
  } catch (err) {
    console.error("[air-freight] PATCH /orders/:id/status error:", err);
    res.status(500).json({ error: "Gagal mengubah status" });
  }
});

// ── DELETE /orders/:id ────────────────────────────────────────────────────────
router.delete("/orders/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = Number(req.params.id);
    const r = await db.execute(sql`
      UPDATE air_freight_orders
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, order_number, status
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    res.json({ ok: true, ...r.rows[0] });
  } catch (err) {
    console.error("[air-freight] DELETE /orders/:id error:", err);
    res.status(500).json({ error: "Gagal membatalkan order" });
  }
});

export default router;
