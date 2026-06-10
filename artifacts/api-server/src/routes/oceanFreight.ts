import { Router, type Request, type Response } from "express";
import { eq, desc, sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminGroupWa } from "../lib/adminWa.js";

const router = Router();

// ── Boot: create supporting tables (sequentially to respect FK deps) ──────────
db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS ocean_freight_orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    company_id INTEGER,
    customer_id INTEGER,
    customer_name TEXT NOT NULL DEFAULT '',
    customer_phone TEXT,
    customer_email TEXT,
    customer_company TEXT,
    origin_city TEXT NOT NULL DEFAULT '',
    origin_port TEXT NOT NULL DEFAULT '',
    destination_city TEXT NOT NULL DEFAULT '',
    destination_port TEXT NOT NULL DEFAULT '',
    trade_type TEXT NOT NULL DEFAULT 'export',
    service_mode TEXT NOT NULL DEFAULT 'port_to_port',
    shipment_type TEXT NOT NULL DEFAULT 'FCL',
    container_type TEXT,
    container_qty INTEGER,
    total_cbm NUMERIC(12,3),
    gross_weight NUMERIC(12,3),
    koli INTEGER,
    commodity TEXT NOT NULL DEFAULT 'General Cargo',
    hs_code TEXT,
    cargo_value NUMERIC(14,2),
    cargo_condition TEXT NOT NULL DEFAULT 'general',
    incoterm TEXT,
    etd_preferred TEXT,
    eta_target TEXT,
    selected_additional_services JSONB,
    selected_estimate_option TEXT,
    estimated_price NUMERIC(14,2),
    estimated_price_idr NUMERIC(14,2),
    currency TEXT DEFAULT 'IDR',
    pricing_breakdown JSONB,
    selected_rate_id INTEGER,
    candidate_rate_ids JSONB,
    final_rate_id INTEGER,
    final_price NUMERIC(14,2),
    final_price_idr NUMERIC(14,2),
    markup_amount NUMERIC(14,2),
    ppn_amount NUMERIC(14,2),
    grand_total NUMERIC(14,2),
    final_breakdown JSONB,
    admin_notes TEXT,
    customer_notes TEXT,
    price_status TEXT NOT NULL DEFAULT 'estimate',
    status TEXT NOT NULL DEFAULT 'waiting_rate',
    source TEXT NOT NULL DEFAULT 'customer_portal',
    booking_number TEXT,
    carrier TEXT,
    vessel_name TEXT,
    voyage TEXT,
    etd TEXT,
    eta TEXT,
    pol TEXT,
    pod TEXT,
    container_number TEXT,
    seal_number TEXT,
    bl_number TEXT,
    booking_confirmation_url TEXT,
    admin_quote_attachment_url TEXT,
    quote_token TEXT UNIQUE,
    quote_sent_at TIMESTAMPTZ,
    booking_confirmed_at TIMESTAMPTZ,
    tracking_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`))
  .then(() => db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS ocean_freight_rfqs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES ocean_freight_orders(id) ON DELETE CASCADE,
    rfq_number TEXT NOT NULL UNIQUE,
    blast_vendor_ids INTEGER[],
    blast_count INTEGER DEFAULT 0,
    response_deadline TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open',
    blast_notes TEXT,
    blast_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`)))
  .then(() => db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS ocean_freight_rate_submissions (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES ocean_freight_rfqs(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES ocean_freight_orders(id) ON DELETE CASCADE,
    vendor_id INTEGER,
    vendor_name TEXT,
    token TEXT NOT NULL UNIQUE,
    rate_source_type TEXT DEFAULT 'forwarder_partner',
    rate_source_name TEXT,
    carrier TEXT,
    ocean_freight_amount NUMERIC(15,2),
    currency TEXT DEFAULT 'USD',
    exchange_rate NUMERIC(12,4) DEFAULT 16500,
    validity_date TEXT,
    vessel_name TEXT,
    voyage TEXT,
    etd TEXT,
    eta TEXT,
    transit_days INTEGER,
    direct_or_transshipment TEXT DEFAULT 'direct',
    thc_origin NUMERIC(12,2) DEFAULT 0,
    thc_destination NUMERIC(12,2) DEFAULT 0,
    doc_fee NUMERIC(12,2) DEFAULT 0,
    bl_fee NUMERIC(12,2) DEFAULT 0,
    do_fee NUMERIC(12,2) DEFAULT 0,
    handling_fee NUMERIC(12,2) DEFAULT 0,
    trucking_pickup NUMERIC(12,2) DEFAULT 0,
    trucking_delivery NUMERIC(12,2) DEFAULT 0,
    customs_clearance_fee NUMERIC(12,2) DEFAULT 0,
    surcharge_amount NUMERIC(12,2) DEFAULT 0,
    notes TEXT,
    attachment_url TEXT,
    total_amount NUMERIC(14,2),
    total_amount_idr NUMERIC(14,2),
    status TEXT NOT NULL DEFAULT 'pending',
    is_active BOOLEAN DEFAULT TRUE,
    submitted_at TIMESTAMPTZ,
    form_opened_at TIMESTAMPTZ,
    submitter_ip TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`)))
  .catch((e: unknown) => console.warn("ocean-freight boot:", e));

// ── GET /api/ocean-freight — list orders ──────────────────────────────────────
router.get("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const { status, search } = req.query as Record<string, string>;
    const { rows } = await db.execute(sql`
      SELECT o.*,
        (SELECT COUNT(*) FROM ocean_freight_rfqs r WHERE r.order_id = o.id) AS rfq_count,
        (SELECT COUNT(*) FROM ocean_freight_rate_submissions s WHERE s.order_id = o.id AND s.status = 'submitted') AS submission_count
      FROM ocean_freight_orders o
      WHERE (${status ?? null}::text IS NULL OR o.status = ${status ?? null})
        AND (${search ?? null}::text IS NULL OR o.order_number ILIKE ${'%' + (search ?? '') + '%'} OR o.customer_name ILIKE ${'%' + (search ?? '') + '%'})
      ORDER BY o.created_at DESC
      LIMIT 200
    `);
    return res.json(rows);
  } catch (e) {
    console.error("[ocean-freight/list]", e);
    return res.status(500).json({ error: "Gagal ambil data orders" });
  }
});

// ── GET /api/ocean-freight/:id ────────────────────────────────────────────────
router.get("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const [{ rows: orders }, { rows: rfqs }, { rows: submissions }] = await Promise.all([
      db.execute(sql`SELECT * FROM ocean_freight_orders WHERE id = ${id}`),
      db.execute(sql`SELECT * FROM ocean_freight_rfqs WHERE order_id = ${id} ORDER BY created_at DESC`),
      db.execute(sql`
        SELECT s.*, v.name AS vendor_name_db
        FROM ocean_freight_rate_submissions s
        LEFT JOIN suppliers v ON v.id = s.vendor_id
        WHERE s.order_id = ${id}
        ORDER BY s.created_at DESC
      `),
    ]);
    if (!orders.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    return res.json({ order: orders[0], rfqs, submissions });
  } catch (e) {
    console.error("[ocean-freight/get]", e);
    return res.status(500).json({ error: "Gagal ambil detail order" });
  }
});

// ── PATCH /api/ocean-freight/:id/status ──────────────────────────────────────
router.patch("/:id/status", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id     = Number(req.params.id);
    const status = String(req.body?.status ?? "");
    const validStatuses = ["draft","estimated","waiting_rate","rate_requested","rate_received","quoted","approved","booked","sailed","arrived","completed","cancelled","quote_declined"];
    if (!validStatuses.includes(status)) return res.status(400).json({ error: "Status tidak valid" });

    await db.execute(sql`
      UPDATE ocean_freight_orders SET status = ${status}, updated_at = NOW() WHERE id = ${id}
    `);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal update status" });
  }
});

// ── POST /api/ocean-freight/:id/blast-rfq ────────────────────────────────────
router.post("/:id/blast-rfq", requireAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const { vendor_ids, blast_notes, response_hours } = req.body ?? {};

    const { rows: orders } = await db.execute(sql`SELECT * FROM ocean_freight_orders WHERE id = ${orderId}`);
    if (!orders.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    const order = orders[0] as any;

    // Create RFQ
    const rfqNumber = `OFR-RFQ/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;
    const deadline  = response_hours ? new Date(Date.now() + Number(response_hours) * 3600_000) : null;

    const { rows: rfqRows } = await db.execute(sql`
      INSERT INTO ocean_freight_rfqs (order_id, rfq_number, blast_vendor_ids, blast_count, blast_notes, blast_at, response_deadline, status)
      VALUES (${orderId}, ${rfqNumber}, ${Array.isArray(vendor_ids) ? vendor_ids : []}::integer[], ${Array.isArray(vendor_ids) ? vendor_ids.length : 0},
              ${blast_notes ?? null}, NOW(), ${deadline ? deadline.toISOString() : null}, 'open')
      RETURNING *
    `);
    const rfq = rfqRows[0] as any;

    // If vendor_ids provided, get vendor contacts and create submissions
    const vendorLinks: { vendorId: number | null; vendorName: string; token: string; phone: string | null }[] = [];

    if (Array.isArray(vendor_ids) && vendor_ids.length > 0) {
      const { rows: vendors } = await db.execute(sql`
        SELECT id, name, phone, email FROM suppliers WHERE id = ANY(${vendor_ids}::integer[])
      `);

      for (const v of vendors as any[]) {
        const token = randomBytes(24).toString("hex");
        await db.execute(sql`
          INSERT INTO ocean_freight_rate_submissions
            (rfq_id, order_id, vendor_id, vendor_name, token, status, created_at, updated_at)
          VALUES
            (${rfq.id}, ${orderId}, ${v.id}, ${v.name}, ${token}, 'pending', NOW(), NOW())
        `);
        vendorLinks.push({ vendorId: v.id, vendorName: v.name, token, phone: v.phone ?? null });
      }
    } else {
      // No specific vendors — create a generic link
      const token = randomBytes(24).toString("hex");
      await db.execute(sql`
        INSERT INTO ocean_freight_rate_submissions
          (rfq_id, order_id, vendor_id, vendor_name, token, status, created_at, updated_at)
        VALUES
          (${rfq.id}, ${orderId}, NULL, 'Open RFQ', ${token}, 'pending', NOW(), NOW())
      `);
      vendorLinks.push({ vendorId: null, vendorName: "Open RFQ", token, phone: null });
    }

    // Update order status
    await db.execute(sql`
      UPDATE ocean_freight_orders SET status = 'rate_requested', updated_at = NOW() WHERE id = ${orderId}
    `);

    // Send WA to vendors
    const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "";
    for (const v of vendorLinks) {
      if (v.phone) {
        try {
          const formUrl = `${baseUrl}/ocean-freight-vendor-form/${v.token}`;
          const msg = [
            `🚢 *RFQ Ocean Freight - ${rfqNumber}*`,
            `Rute: ${order.origin_port} → ${order.destination_port}`,
            `Jenis: ${order.shipment_type}${order.container_type ? " - " + order.container_type : ""}`,
            `Komoditi: ${order.commodity}`,
            blast_notes ? `Notes: ${blast_notes}` : "",
            ``,
            `Silakan submit rate melalui link berikut:`,
            formUrl,
          ].filter(Boolean).join("\n");
          await sendWhatsApp(v.phone, msg);
        } catch (_) {}
      }
    }

    return res.json({
      ok: true,
      rfq: rfq,
      vendor_links: vendorLinks.map(v => ({
        vendor_name: v.vendorName,
        token: v.token,
        form_url: `${baseUrl}/ocean-freight-vendor-form/${v.token}`,
      })),
    });
  } catch (e) {
    console.error("[ocean-freight/blast-rfq]", e);
    return res.status(500).json({ error: "Gagal blast RFQ" });
  }
});

// ── POST /api/ocean-freight/:id/final-quote ───────────────────────────────────
router.post("/:id/final-quote", requireAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const b = req.body ?? {};

    if (!b.grand_total || Number(b.grand_total) <= 0) return res.status(400).json({ error: "grand_total wajib > 0" });

    const { rows: orders } = await db.execute(sql`SELECT * FROM ocean_freight_orders WHERE id = ${orderId}`);
    if (!orders.length) return res.status(404).json({ error: "Order tidak ditemukan" });
    const order = orders[0] as any;

    await db.execute(sql`
      UPDATE ocean_freight_orders SET
        final_rate_id = ${b.final_rate_id ? Number(b.final_rate_id) : null},
        final_price = ${Number(b.final_price ?? 0)},
        final_price_idr = ${Number(b.final_price_idr ?? b.final_price ?? 0)},
        markup_amount = ${Number(b.markup_amount ?? 0)},
        ppn_amount = ${Number(b.ppn_amount ?? 0)},
        grand_total = ${Number(b.grand_total)},
        final_breakdown = ${JSON.stringify(b.final_breakdown ?? {})}::jsonb,
        admin_notes = ${b.admin_notes ?? null},
        price_status = 'confirmed',
        status = 'quoted',
        quote_sent_at = NOW(),
        updated_at = NOW()
      WHERE id = ${orderId}
    `);

    // Notify customer via WA if phone available
    if (order.customer_phone) {
      try {
        const baseUrl = process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : "";
        const approvalUrl = `${baseUrl}/ocean-freight-quote/${order.quote_token}`;
        const msg = [
          `✅ *Harga Final Ocean Freight Tersedia*`,
          `No: ${order.order_number}`,
          `Grand Total: IDR ${Number(b.grand_total).toLocaleString("id-ID")}`,
          `Rute: ${order.origin_port} → ${order.destination_port}`,
          ``,
          `Silakan review dan approve:`,
          approvalUrl,
        ].join("\n");
        await sendWhatsApp(order.customer_phone, msg);
      } catch (_) {}
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error("[ocean-freight/final-quote]", e);
    return res.status(500).json({ error: "Gagal kirim final quote" });
  }
});

// ── POST /api/ocean-freight/:id/confirm-booking ──────────────────────────────
router.post("/:id/confirm-booking", requireAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const b = req.body ?? {};

    const bookingNumber = `OFR-BK/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 99999)).padStart(5, "0")}`;

    await db.execute(sql`
      UPDATE ocean_freight_orders SET
        booking_number = ${b.booking_number ?? bookingNumber},
        carrier = ${b.carrier ?? null},
        vessel_name = ${b.vessel_name ?? null},
        voyage = ${b.voyage ?? null},
        etd = ${b.etd ?? null},
        eta = ${b.eta ?? null},
        pol = ${b.pol ?? null},
        pod = ${b.pod ?? null},
        container_number = ${b.container_number ?? null},
        seal_number = ${b.seal_number ?? null},
        bl_number = ${b.bl_number ?? null},
        booking_confirmation_url = ${b.booking_confirmation_url ?? null},
        tracking_status = 'booked',
        status = 'booked',
        booking_confirmed_at = NOW(),
        updated_at = NOW()
      WHERE id = ${orderId}
    `);

    return res.json({ ok: true, booking_number: b.booking_number ?? bookingNumber });
  } catch (e) {
    console.error("[ocean-freight/confirm-booking]", e);
    return res.status(500).json({ error: "Gagal konfirmasi booking" });
  }
});

// ── PATCH /api/ocean-freight/:id/tracking ─────────────────────────────────────
router.patch("/:id/tracking", requireAdmin, async (req: Request, res: Response) => {
  try {
    const orderId = Number(req.params.id);
    const trackingStatus = String(req.body?.tracking_status ?? "");
    const orderStatus    = String(req.body?.status ?? "");
    const validTracking  = ["booked","container_empty_released","stuffed","gate_in","sailed","transshipment","arrived","customs_clearance","delivered","completed"];
    if (!validTracking.includes(trackingStatus)) return res.status(400).json({ error: "tracking_status tidak valid" });

    await db.execute(sql`
      UPDATE ocean_freight_orders SET
        tracking_status = ${trackingStatus},
        status = ${orderStatus || trackingStatus},
        updated_at = NOW()
      WHERE id = ${orderId}
    `);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal update tracking" });
  }
});

// ── POST /api/ocean-freight — admin create order ──────────────────────────────
router.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    if (!b.customer_name) return res.status(400).json({ error: "customer_name wajib" });
    const orderNumber = `OFR/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 999999)).padStart(6, "0")}`;
    const quoteToken  = randomBytes(24).toString("hex");

    const { rows } = await db.execute(sql`
      INSERT INTO ocean_freight_orders (
        order_number, customer_name, customer_phone, customer_email, customer_company,
        origin_city, origin_port, destination_city, destination_port,
        trade_type, service_mode, shipment_type, container_type, container_qty,
        total_cbm, gross_weight, koli, commodity, hs_code, cargo_condition,
        incoterm, etd_preferred, eta_target, selected_additional_services,
        admin_notes, status, source, price_status, quote_token, created_at, updated_at
      ) VALUES (
        ${orderNumber}, ${b.customer_name}, ${b.customer_phone ?? null}, ${b.customer_email ?? null}, ${b.customer_company ?? null},
        ${b.origin_city ?? ""}, ${b.origin_port ?? ""}, ${b.destination_city ?? ""}, ${b.destination_port ?? ""},
        ${b.trade_type ?? "export"}, ${b.service_mode ?? "port_to_port"}, ${b.shipment_type ?? "FCL"},
        ${b.container_type ?? null}, ${b.container_qty ? Number(b.container_qty) : null},
        ${b.total_cbm ? Number(b.total_cbm) : null}, ${b.gross_weight ? Number(b.gross_weight) : null},
        ${b.koli ? Number(b.koli) : null},
        ${b.commodity ?? "General Cargo"}, ${b.hs_code ?? null}, ${b.cargo_condition ?? "general"},
        ${b.incoterm ?? null}, ${b.etd_preferred ?? null}, ${b.eta_target ?? null},
        ${JSON.stringify(b.selected_additional_services ?? [])}::jsonb,
        ${b.admin_notes ?? null},
        ${b.status ?? "waiting_rate"}, 'admin_portal', 'estimate', ${quoteToken}, NOW(), NOW()
      ) RETURNING *
    `);
    return res.status(201).json(rows[0]);
  } catch (e) {
    console.error("[ocean-freight/admin-create]", e);
    return res.status(500).json({ error: "Gagal buat order" });
  }
});

// ── PATCH /api/ocean-freight/:id ─────────────────────────────────────────────
router.patch("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    const b  = req.body ?? {};
    await db.execute(sql`
      UPDATE ocean_freight_orders SET
        customer_name = COALESCE(${b.customer_name ?? null}, customer_name),
        customer_phone = COALESCE(${b.customer_phone ?? null}, customer_phone),
        customer_email = COALESCE(${b.customer_email ?? null}, customer_email),
        admin_notes = ${b.admin_notes ?? null},
        updated_at = NOW()
      WHERE id = ${id}
    `);
    return res.json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: "Gagal update order" });
  }
});

export default router;
