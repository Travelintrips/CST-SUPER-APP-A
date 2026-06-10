import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";

export const oceanFreightVendorFormRouter = Router();

// ── GET /:token — get RFQ info for vendor form ────────────────────────────────
oceanFreightVendorFormRouter.get("/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const rfqRes = await db.execute(sql.raw(`
      SELECT r.*, o.origin_city, o.origin_port, o.destination_city, o.destination_port,
             o.trade_type, o.service_mode, o.shipment_type, o.container_type, o.container_qty,
             o.total_cbm, o.gross_weight, o.koli, o.commodity, o.hs_code, o.cargo_condition,
             o.incoterm, o.etd_preferred, o.eta_target, o.selected_additional_services,
             o.order_number, o.customer_name
      FROM ocean_freight_rfqs r
      JOIN ocean_freight_orders o ON o.id = r.order_id
      WHERE r.rfq_token = '${token.replace(/'/g, "''")}'
    `));

    const rfq = rfqRes.rows[0] as any;
    if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan atau link tidak valid" });

    const now = new Date();
    if (rfq.expires_at && new Date(rfq.expires_at) < now) {
      return res.status(410).json({ error: "Link RFQ sudah kadaluarsa" });
    }
    if (rfq.status === "submitted") {
      return res.status(200).json({ rfq, already_submitted: true });
    }

    // Mark as opened
    if (rfq.status === "sent") {
      await db.execute(sql.raw(`UPDATE ocean_freight_rfqs SET status = 'opened', updated_at = NOW() WHERE rfq_token = '${token.replace(/'/g, "''")}'`));
    }

    res.json({ rfq, already_submitted: false });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-vendor-form] GET /:token");
    res.status(500).json({ error: "Gagal memuat RFQ" });
  }
});

// ── POST /:token — vendor submit rate ────────────────────────────────────────
oceanFreightVendorFormRouter.post("/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const b = req.body;

    const rfqRes = await db.execute(sql.raw(`
      SELECT r.*, o.shipment_type, o.container_qty, o.total_cbm
      FROM ocean_freight_rfqs r
      JOIN ocean_freight_orders o ON o.id = r.order_id
      WHERE r.rfq_token = '${token.replace(/'/g, "''")}'
    `));
    const rfq = rfqRes.rows[0] as any;
    if (!rfq) return res.status(404).json({ error: "RFQ tidak ditemukan" });

    const now = new Date();
    if (rfq.expires_at && new Date(rfq.expires_at) < now) {
      return res.status(410).json({ error: "Link RFQ sudah kadaluarsa" });
    }
    if (rfq.status === "submitted") {
      return res.status(400).json({ error: "Rate sudah pernah disubmit untuk RFQ ini" });
    }

    // Validate
    if (!b.ocean_freight_amount || Number(b.ocean_freight_amount) <= 0)
      return res.status(400).json({ error: "Ocean freight amount wajib diisi" });
    if (!b.validity_date)
      return res.status(400).json({ error: "Validity date wajib diisi" });
    if (!b.carrier)
      return res.status(400).json({ error: "Carrier/Shipping Line wajib diisi" });

    const er = Number(b.exchange_rate_to_idr ?? 1) || 1;
    const cur = String(b.currency ?? "USD");

    // Calculate totals
    const qty = rfq.container_qty ? Number(rfq.container_qty) : 1;
    const cbm = rfq.total_cbm ? Number(rfq.total_cbm) : 0;
    const baseOcean = rfq.shipment_type === "FCL"
      ? Number(b.ocean_freight_amount) * qty
      : Number(b.ocean_freight_amount) * Math.max(cbm, 1);

    const totalOrig = baseOcean
      + Number(b.thc_origin ?? 0)
      + Number(b.thc_destination ?? 0)
      + Number(b.doc_fee ?? 0)
      + Number(b.bl_fee ?? 0)
      + Number(b.do_fee ?? 0)
      + Number(b.handling_fee ?? 0)
      + Number(b.trucking_pickup_estimate ?? 0)
      + Number(b.trucking_delivery_estimate ?? 0)
      + Number(b.customs_clearance_fee ?? 0)
      + Number(b.surcharge_amount ?? 0);

    const totalIdr = cur === "IDR" ? totalOrig : totalOrig * er;

    await db.execute(sql.raw(`
      INSERT INTO ocean_freight_rate_submissions (
        rfq_id, order_id, vendor_id, rate_source_type, rate_source_name,
        carrier, ocean_freight_amount, currency, exchange_rate_to_idr,
        validity_date, vessel_name, voyage, etd, eta, transit_days,
        direct_or_transshipment, thc_origin, thc_destination, doc_fee, bl_fee, do_fee,
        handling_fee, trucking_pickup_estimate, trucking_delivery_estimate,
        customs_clearance_fee, surcharge_amount, notes, attachment_url,
        total_amount, total_amount_idr, status, submitted_at
      ) VALUES (
        ${rfq.id}, ${rfq.order_id}, ${rfq.vendor_id ?? "NULL"},
        'vendor_rate',
        '${String(b.rate_source_name ?? rfq.contact_name ?? "Vendor").replace(/'/g, "''")}',
        '${String(b.carrier ?? "").replace(/'/g, "''")}',
        ${Number(b.ocean_freight_amount)}, '${cur}', ${er},
        '${String(b.validity_date).replace(/'/g, "''")}',
        ${b.vessel_name ? `'${String(b.vessel_name).replace(/'/g, "''")}'` : "NULL"},
        ${b.voyage ? `'${String(b.voyage).replace(/'/g, "''")}'` : "NULL"},
        ${b.etd ? `'${String(b.etd).replace(/'/g, "''")}'` : "NULL"},
        ${b.eta ? `'${String(b.eta).replace(/'/g, "''")}'` : "NULL"},
        ${b.transit_days ? Number(b.transit_days) : "NULL"},
        '${String(b.direct_or_transshipment ?? "direct").replace(/'/g, "''")}',
        ${Number(b.thc_origin ?? 0)}, ${Number(b.thc_destination ?? 0)},
        ${Number(b.doc_fee ?? 0)}, ${Number(b.bl_fee ?? 0)}, ${Number(b.do_fee ?? 0)},
        ${Number(b.handling_fee ?? 0)},
        ${Number(b.trucking_pickup_estimate ?? 0)}, ${Number(b.trucking_delivery_estimate ?? 0)},
        ${Number(b.customs_clearance_fee ?? 0)}, ${Number(b.surcharge_amount ?? 0)},
        ${b.notes ? `'${String(b.notes).replace(/'/g, "''")}'` : "NULL"},
        ${b.attachment_url ? `'${String(b.attachment_url).replace(/'/g, "''")}'` : "NULL"},
        ${totalOrig}, ${totalIdr}, 'submitted', NOW()
      )
    `));

    await db.execute(sql.raw(`UPDATE ocean_freight_rfqs SET status = 'submitted', updated_at = NOW() WHERE id = ${rfq.id}`));
    await db.execute(sql.raw(`UPDATE ocean_freight_orders SET status = 'rate_received', updated_at = NOW() WHERE id = ${rfq.order_id}`));

    res.json({ ok: true, message: "Rate berhasil disubmit. Terima kasih!" });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-vendor-form] POST /:token");
    res.status(500).json({ error: "Gagal submit rate" });
  }
});
