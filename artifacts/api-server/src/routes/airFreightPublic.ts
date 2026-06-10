import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── GET /approval/:token — data order untuk review customer ───────────────────
router.get("/approval/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    if (!token || !/^[a-f0-9]{32,}$/i.test(token)) {
      return res.status(400).json({ error: "Token tidak valid" });
    }
    const r = await db.execute(sql`
      SELECT
        o.id, o.order_number, o.customer_name, o.customer_email, o.customer_phone,
        o.origin_city, o.origin_airport, o.destination_city, o.destination_airport,
        o.trade_type, o.service_level, o.commodity, o.cargo_type,
        o.gross_weight, o.chargeable_weight, o.koli,
        o.pickup_date, o.preferred_flight_date, o.target_arrival_date,
        o.estimated_price_idr, o.currency,
        o.final_price, o.final_price_idr, o.markup_amount, o.ppn_amount, o.grand_total,
        o.final_breakdown, o.admin_notes, o.status, o.price_status,
        o.quoted_at, o.approved_at, o.declined_at,
        r.airline, r.flight_number, r.etd, r.eta, r.transit_days,
        r.routing_type, r.rate_source_name, r.service_mode
      FROM air_freight_orders o
      LEFT JOIN air_freight_rates r ON r.id = o.final_rate_id
      WHERE o.approval_token = ${token}
      LIMIT 1
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Link tidak valid atau sudah kedaluwarsa" });
    const order = r.rows[0] as any;
    if (["cancelled","completed"].includes(order.status)) {
      return res.status(410).json({ error: "Order ini sudah selesai atau dibatalkan" });
    }
    res.json(order);
  } catch (err) {
    console.error("[air-freight-public] GET /approval/:token error:", err);
    res.status(500).json({ error: "Gagal memuat data" });
  }
});

// ── POST /approval/:token/approve ─────────────────────────────────────────────
router.post("/approval/:token/approve", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    if (!token || !/^[a-f0-9]{32,}$/i.test(token)) {
      return res.status(400).json({ error: "Token tidak valid" });
    }
    const existing = await db.execute(sql`
      SELECT id, status FROM air_freight_orders WHERE approval_token = ${token} LIMIT 1
    `);
    if (!existing.rows.length) return res.status(404).json({ error: "Link tidak ditemukan" });
    const order = existing.rows[0] as any;
    if (order.status !== "quoted") {
      return res.status(409).json({
        error: `Order tidak dalam status quoted (status saat ini: ${order.status})`
      });
    }
    await db.execute(sql`
      UPDATE air_freight_orders
      SET status = 'approved', approved_at = NOW(), updated_at = NOW()
      WHERE id = ${order.id}
    `);
    await db.execute(sql`
      INSERT INTO air_freight_tracking_events (order_id, event_type, note)
      VALUES (${order.id}, 'approved', 'Customer menyetujui harga final')
    `).catch(() => {});
    res.json({ ok: true, message: "Order disetujui. Tim kami akan segera memproses booking." });
  } catch (err) {
    console.error("[air-freight-public] POST /approval/:token/approve error:", err);
    res.status(500).json({ error: "Gagal memproses persetujuan" });
  }
});

// ── POST /approval/:token/decline ─────────────────────────────────────────────
router.post("/approval/:token/decline", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    if (!token || !/^[a-f0-9]{32,}$/i.test(token)) {
      return res.status(400).json({ error: "Token tidak valid" });
    }
    const existing = await db.execute(sql`
      SELECT id, status FROM air_freight_orders WHERE approval_token = ${token} LIMIT 1
    `);
    if (!existing.rows.length) return res.status(404).json({ error: "Link tidak ditemukan" });
    const order = existing.rows[0] as any;
    if (order.status !== "quoted") {
      return res.status(409).json({
        error: `Order tidak dalam status quoted (status saat ini: ${order.status})`
      });
    }
    const reason = (req.body?.reason as string | undefined)?.slice(0, 1000) ?? null;
    await db.execute(sql`
      UPDATE air_freight_orders
      SET status = 'quote_declined',
          decline_reason = ${reason},
          declined_at = NOW(),
          updated_at = NOW()
      WHERE id = ${order.id}
    `);
    await db.execute(sql`
      INSERT INTO air_freight_tracking_events (order_id, event_type, note)
      VALUES (${order.id}, 'quote_declined', ${reason ? `Alasan: ${reason}` : 'Customer menolak harga final'})
    `).catch(() => {});
    res.json({ ok: true, message: "Penolakan diterima. Tim kami akan menghubungi Anda." });
  } catch (err) {
    console.error("[air-freight-public] POST /approval/:token/decline error:", err);
    res.status(500).json({ error: "Gagal memproses penolakan" });
  }
});

// ── GET /track/:orderNumber — public tracking ─────────────────────────────────
router.get("/track/:orderNumber", async (req: Request, res: Response) => {
  try {
    const orderNumber = String(req.params.orderNumber ?? "");
    const r = await db.execute(sql`
      SELECT
        o.order_number, o.customer_name,
        o.origin_city, o.origin_airport, o.destination_city, o.destination_airport,
        o.chargeable_weight, o.koli, o.commodity,
        o.status, o.tracking_status,
        o.booking_number, o.mawb, o.hawb,
        o.approved_at, o.booking_confirmed_at,
        r.airline, r.flight_number, r.etd, r.eta, r.transit_days
      FROM air_freight_orders o
      LEFT JOIN air_freight_rates r ON r.id = o.final_rate_id
      WHERE o.order_number = ${orderNumber}
      LIMIT 1
    `);
    if (!r.rows.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    const order = r.rows[0] as any;

    const events = await db.execute(sql`
      SELECT event_type, note, created_at
      FROM air_freight_tracking_events
      WHERE order_id = (SELECT id FROM air_freight_orders WHERE order_number = ${orderNumber})
      ORDER BY created_at ASC
    `);
    res.json({ order, events: events.rows });
  } catch (err) {
    console.error("[air-freight-public] GET /track/:orderNumber error:", err);
    res.status(500).json({ error: "Gagal memuat tracking" });
  }
});

export default router;
