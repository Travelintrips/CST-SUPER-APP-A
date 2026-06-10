import { Router, type Request, type Response } from "express";
import { rateLimit } from "express-rate-limit";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminGroupWa } from "../lib/adminWa.js";

const router = Router();

const estimateLimit = rateLimit({ windowMs: 60_000, max: 30, standardHeaders: true, legacyHeaders: false });
const submitLimit   = rateLimit({ windowMs: 60_000, max: 10, standardHeaders: true, legacyHeaders: false });

// ── GET /api/ocean-freight-public/options ─────────────────────────────────────
router.get("/options", async (_req: Request, res: Response) => {
  return res.json({
    trade_types: [
      { v: "domestic",     l: "Domestic" },
      { v: "export",       l: "Export" },
      { v: "import",       l: "Import" },
      { v: "cross_border", l: "Cross Border" },
    ],
    service_modes: [
      { v: "port_to_port",  l: "Port to Port" },
      { v: "door_to_port",  l: "Door to Port" },
      { v: "port_to_door",  l: "Port to Door" },
      { v: "door_to_door",  l: "Door to Door" },
    ],
    shipment_types: [
      { v: "FCL", l: "FCL (Full Container Load)" },
      { v: "LCL", l: "LCL (Less than Container Load)" },
    ],
    container_types: [
      { v: "20ft",       l: "20ft GP",    cbm: 25,  payload: 21800 },
      { v: "40ft",       l: "40ft GP",    cbm: 55,  payload: 26480 },
      { v: "40HC",       l: "40HC",       cbm: 65,  payload: 26480 },
      { v: "reefer_20",  l: "Reefer 20ft",cbm: 25,  payload: 20400 },
      { v: "reefer_40",  l: "Reefer 40ft",cbm: 56,  payload: 24760 },
      { v: "open_top",   l: "Open Top 20ft",cbm: 25, payload: 21600 },
      { v: "flat_rack",  l: "Flat Rack 20ft",cbm: null, payload: 24000 },
    ],
    cargo_conditions: [
      { v: "general",   l: "General Cargo" },
      { v: "dg",        l: "DG Cargo" },
      { v: "reefer",    l: "Reefer" },
      { v: "fragile",   l: "Fragile" },
      { v: "oversize",  l: "Oversize" },
      { v: "high_value",l: "High Value" },
    ],
    incoterms: ["EXW","FOB","CFR","CIF","DAP","DDP"],
    additional_services: [
      "Trucking Pickup","Trucking Delivery","Customs Clearance",
      "Insurance","Fumigation","COO / Certificate","Warehouse Handling",
      "Stuffing","Unstuffing","Surveyor","Document Handling",
    ],
  });
});

// ── POST /api/ocean-freight-public/estimate ───────────────────────────────────
router.post("/estimate", estimateLimit, async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};
    const originPort      = String(b.origin_port ?? "").trim();
    const destinationPort = String(b.destination_port ?? "").trim();
    const shipmentType    = String(b.shipment_type ?? "FCL");
    const serviceMode     = b.service_mode ? String(b.service_mode) : null;
    const tradeType       = b.trade_type   ? String(b.trade_type)   : null;
    const containerType   = shipmentType === "FCL" ? (b.container_type ? String(b.container_type) : null) : null;
    const containerQty    = shipmentType === "FCL" ? Math.max(1, Number(b.container_qty ?? 1)) : 1;
    const totalCbm        = shipmentType === "LCL" ? Math.max(0, Number(b.total_cbm ?? 0)) : 0;
    const cargoCondition  = String(b.cargo_condition ?? "general");
    const selectedServices: string[] = Array.isArray(b.selected_additional_services) ? b.selected_additional_services : [];

    if (!originPort || !destinationPort)
      return res.status(400).json({ error: "origin_port dan destination_port wajib diisi" });
    if (shipmentType === "FCL" && !containerType)
      return res.status(400).json({ error: "container_type wajib untuk FCL" });
    if (shipmentType === "LCL" && totalCbm <= 0 && Number(b.gross_weight ?? 0) <= 0)
      return res.status(400).json({ error: "total_cbm atau gross_weight wajib untuk LCL" });

    const todayStr = new Date().toISOString().slice(0, 10);

    const { rows: rateRows } = await db.execute(sql`
      SELECT * FROM ocean_freight_rates
      WHERE is_active = TRUE
        AND valid_from  <= ${todayStr}::date
        AND valid_until >= ${todayStr}::date
        AND LOWER(origin_port)      = LOWER(${originPort})
        AND LOWER(destination_port) = LOWER(${destinationPort})
        AND UPPER(shipment_type)    = UPPER(${shipmentType})
        AND (${serviceMode}::text IS NULL OR service_mode = ${serviceMode})
        AND (${tradeType}::text IS NULL OR trade_type = ${tradeType})
        AND (${containerType}::text IS NULL OR container_type IS NULL OR UPPER(container_type) = UPPER(${containerType ?? ""}))
      ORDER BY ocean_freight_amount ASC
      LIMIT 20
    `);

    if (!rateRows.length) {
      return res.json({
        options: [],
        message: "Tidak ada rate tersedia untuk rute ini saat ini. Silakan submit inquiry untuk mendapatkan penawaran manual.",
      });
    }

    // ── Calculate per rate ────────────────────────────────────────────────────
    function calcOption(r: any, label: string) {
      const exr    = Number(r.exchange_rate_to_idr ?? 16500);
      const curr   = String(r.currency ?? "USD");

      let base = 0;
      let breakdown: Record<string, number> = {};

      if (shipmentType === "FCL") {
        base = Number(r.ocean_freight_amount ?? 0) * containerQty;
        breakdown.ocean_freight = Number(r.ocean_freight_amount ?? 0) * containerQty;
      } else {
        const minCbm        = Number(r.lcl_minimum_cbm ?? 1);
        const chargeableCbm = Math.max(totalCbm, minCbm);
        base = chargeableCbm * Number(r.lcl_rate_per_cbm ?? 0);
        breakdown.ocean_freight = base;
        breakdown.chargeable_cbm = chargeableCbm;
      }

      const originCharges = Number(r.thc_origin ?? 0);
      const destCharges   = Number(r.thc_destination ?? 0);
      const docCharges    = Number(r.doc_fee ?? 0) + Number(r.bl_fee ?? 0) + Number(r.do_fee ?? 0) + Number(r.handling_fee ?? 0);
      breakdown.origin_charges      = originCharges;
      breakdown.destination_charges = destCharges;
      breakdown.document_charges    = docCharges;

      let truckingCharges = 0;
      if (selectedServices.includes("Trucking Pickup"))   { truckingCharges += Number(r.trucking_pickup_estimate ?? 0); breakdown.trucking_pickup = Number(r.trucking_pickup_estimate ?? 0); }
      if (selectedServices.includes("Trucking Delivery"))  { truckingCharges += Number(r.trucking_delivery_estimate ?? 0); breakdown.trucking_delivery = Number(r.trucking_delivery_estimate ?? 0); }
      let customsCharges = 0;
      if (selectedServices.includes("Customs Clearance")) { customsCharges += Number(r.customs_clearance_fee ?? 0); breakdown.customs_clearance = Number(r.customs_clearance_fee ?? 0); }

      let surcharge = 0;
      if (cargoCondition === "dg")    { const s = base * Number(r.dg_surcharge_percent ?? 0) / 100; surcharge += s; breakdown.dg_surcharge = s; }
      if (cargoCondition === "reefer"){ surcharge += Number(r.reefer_surcharge ?? 0); breakdown.reefer_surcharge = Number(r.reefer_surcharge ?? 0); }
      surcharge += Number(r.peak_season_surcharge ?? 0) + Number(r.emergency_bunker_surcharge ?? 0) + Number(r.currency_adjustment_factor ?? 0);
      if (Number(r.peak_season_surcharge ?? 0) > 0) breakdown.peak_season_surcharge = Number(r.peak_season_surcharge ?? 0);
      if (Number(r.emergency_bunker_surcharge ?? 0) > 0) breakdown.emergency_bunker_surcharge = Number(r.emergency_bunker_surcharge ?? 0);

      const total = base + originCharges + destCharges + docCharges + truckingCharges + customsCharges + surcharge;
      const totalIdr = curr === "IDR" ? total : total * exr;

      breakdown.total_estimate = total;
      breakdown.currency = curr;
      breakdown.total_estimate_idr = totalIdr;

      return {
        estimate_option:        label,
        rate_id:                r.id,
        rate_source_name:       r.rate_source_name,
        carrier:                r.carrier ?? r.carrier_name,
        route:                  `${r.origin_port} → ${r.destination_port}`,
        shipment_type:          r.shipment_type,
        service_mode:           r.service_mode,
        container_type:         r.container_type,
        container_qty:          shipmentType === "FCL" ? containerQty : null,
        transit_days:           r.transit_days,
        direct_or_transshipment:r.direct_or_transshipment,
        base_ocean_freight:     base,
        origin_charges:         originCharges,
        destination_charges:    destCharges,
        document_charges:       docCharges,
        trucking_charges:       truckingCharges,
        customs_charges:        customsCharges,
        surcharge_breakdown:    surcharge,
        total_estimate:         total,
        currency:               curr,
        total_estimate_idr:     totalIdr,
        price_status:           r.price_status ?? "estimate",
        validity:               r.valid_until,
        breakdown,
      };
    }

    const sorted    = (rateRows as any[]).slice().sort((a, b) => {
      const tA = Number(a.ocean_freight_amount ?? 0) + Number(a.thc_origin ?? 0) + Number(a.thc_destination ?? 0);
      const tB = Number(b.ocean_freight_amount ?? 0) + Number(b.thc_origin ?? 0) + Number(b.thc_destination ?? 0);
      return tA - tB;
    });
    const byTransit = (rateRows as any[]).slice().sort((a, b) => Number(a.transit_days ?? 99) - Number(b.transit_days ?? 99));

    const economy  = sorted[0]     ? calcOption(sorted[0],     "Economy")  : null;
    const standard = sorted[Math.floor(sorted.length / 2)] ? calcOption(sorted[Math.floor(sorted.length / 2)], "Standard") : null;
    const priority = byTransit[0]  ? calcOption(byTransit[0],  "Priority") : null;

    const options = [economy, standard, priority].filter(Boolean);
    const uniqueOptions = options.filter((o, idx) => options.findIndex(x => x?.rate_id === o?.rate_id) === idx);

    return res.json({ options: uniqueOptions });
  } catch (e) {
    console.error("[ocean-freight-public/estimate]", e);
    return res.status(500).json({ error: "Gagal hitung estimasi" });
  }
});

// ── POST /api/ocean-freight-public/inquiry ────────────────────────────────────
router.post("/inquiry", submitLimit, async (req: Request, res: Response) => {
  try {
    const b = req.body ?? {};

    // Validasi wajib
    if (!b.origin_port || !b.destination_port) return res.status(400).json({ error: "origin_port dan destination_port wajib" });
    if (!b.shipment_type) return res.status(400).json({ error: "shipment_type wajib" });
    if (!b.customer_name || !String(b.customer_name).trim()) return res.status(400).json({ error: "customer_name wajib" });
    if (String(b.shipment_type) === "FCL" && !b.container_type) return res.status(400).json({ error: "container_type wajib untuk FCL" });
    if (String(b.shipment_type) === "FCL" && Number(b.container_qty ?? 0) < 1) return res.status(400).json({ error: "container_qty minimal 1" });

    const orderNumber = `OFR/${new Date().getFullYear()}/${String(Math.floor(Math.random() * 999999)).padStart(6, "0")}`;
    const quoteToken  = randomBytes(24).toString("hex");

    const { rows } = await db.execute(sql`
      INSERT INTO ocean_freight_orders (
        order_number, customer_name, customer_phone, customer_email, customer_company,
        origin_city, origin_port, destination_city, destination_port,
        trade_type, service_mode, shipment_type, container_type, container_qty,
        total_cbm, gross_weight, koli, commodity, hs_code, cargo_value,
        cargo_condition, incoterm, etd_preferred, eta_target,
        selected_additional_services, selected_estimate_option,
        estimated_price, estimated_price_idr, currency, pricing_breakdown,
        selected_rate_id, candidate_rate_ids, customer_notes,
        status, source, price_status, quote_token, created_at, updated_at
      ) VALUES (
        ${orderNumber},
        ${String(b.customer_name ?? "").trim()},
        ${b.customer_phone ?? null}, ${b.customer_email ?? null}, ${b.customer_company ?? null},
        ${b.origin_city ?? ""}, ${b.origin_port ?? ""}, ${b.destination_city ?? ""}, ${b.destination_port ?? ""},
        ${b.trade_type ?? "export"}, ${b.service_mode ?? "port_to_port"},
        ${b.shipment_type ?? "FCL"}, ${b.container_type ?? null},
        ${b.container_qty ? Number(b.container_qty) : null},
        ${b.total_cbm ? Number(b.total_cbm) : null},
        ${b.gross_weight ? Number(b.gross_weight) : null},
        ${b.koli ? Number(b.koli) : null},
        ${b.commodity ?? "General Cargo"}, ${b.hs_code ?? null},
        ${b.cargo_value ? Number(b.cargo_value) : null},
        ${b.cargo_condition ?? "general"}, ${b.incoterm ?? null},
        ${b.etd_preferred ?? null}, ${b.eta_target ?? null},
        ${JSON.stringify(b.selected_additional_services ?? [])}::jsonb,
        ${b.selected_estimate_option ?? null},
        ${b.estimated_price ? Number(b.estimated_price) : null},
        ${b.estimated_price_idr ? Number(b.estimated_price_idr) : null},
        ${b.currency ?? "IDR"},
        ${JSON.stringify(b.pricing_breakdown ?? {})}::jsonb,
        ${b.selected_rate_id ? Number(b.selected_rate_id) : null},
        ${JSON.stringify(b.candidate_rate_ids ?? [])}::jsonb,
        ${b.customer_notes ?? null},
        'waiting_rate', 'customer_portal', 'estimate',
        ${quoteToken}, NOW(), NOW()
      ) RETURNING id, order_number, quote_token
    `);

    const order = rows[0] as any;

    // Notify admin via WA
    try {
      const adminGroup = await getAdminGroupWa();
      if (adminGroup) {
        const msgParts = [
          `🚢 *Ocean Freight Inquiry Baru*`,
          `No: ${order.order_number}`,
          `Customer: ${b.customer_name}`,
          `Rute: ${b.origin_port} → ${b.destination_port}`,
          `${b.shipment_type}${b.container_type ? " " + b.container_type : ""}`,
          `Status: waiting_rate`,
        ];
        await sendWhatsApp(adminGroup, msgParts.join("\n"));
      }
    } catch (_) {}

    return res.status(201).json({
      ok: true,
      order_number: order.order_number,
      message: "Permintaan penawaran Ocean Freight berhasil dikirim. Tim kami akan mengirim harga final setelah mendapatkan konfirmasi dari shipping line / partner.",
    });
  } catch (e) {
    console.error("[ocean-freight-public/inquiry]", e);
    return res.status(500).json({ error: "Gagal submit inquiry" });
  }
});

// ── GET /api/ocean-freight-public/quote/:token ────────────────────────────────
router.get("/quote/:token", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "").trim();
    if (!token) return res.status(400).json({ error: "Token tidak valid" });

    const { rows } = await db.execute(sql`
      SELECT * FROM ocean_freight_orders WHERE quote_token = ${token}
    `);
    if (!rows.length) return res.status(404).json({ error: "Quote tidak ditemukan" });

    const order = rows[0] as any;
    // Don't expose internal vendor margin
    const safeOrder = { ...order };
    delete safeOrder.markup_amount;

    return res.json(safeOrder);
  } catch (e) {
    return res.status(500).json({ error: "Gagal ambil quote" });
  }
});

// ── POST /api/ocean-freight-public/quote/:token/approve ──────────────────────
router.post("/quote/:token/approve", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    const { rows: existing } = await db.execute(sql`
      SELECT id, status FROM ocean_freight_orders WHERE quote_token = ${token}
    `);
    if (!existing.length) return res.status(404).json({ error: "Quote tidak ditemukan" });
    const ord = existing[0] as any;
    if (ord.status !== "quoted") return res.status(400).json({ error: "Quote belum siap untuk di-approve" });

    await db.execute(sql`
      UPDATE ocean_freight_orders SET status = 'approved', updated_at = NOW()
      WHERE id = ${ord.id}
    `);

    // Notify admin
    try {
      const adminGroup = await getAdminGroupWa();
      if (adminGroup) {
        await sendWhatsApp(adminGroup, `✅ *Ocean Freight Diapprove*\nCustomer telah menyetujui quote untuk order tersebut.\nSilakan lakukan konfirmasi booking.`);
      }
    } catch (_) {}

    return res.json({ ok: true, message: "Quote diapprove. Admin akan menghubungi Anda untuk konfirmasi booking." });
  } catch (e) {
    return res.status(500).json({ error: "Gagal approve quote" });
  }
});

// ── POST /api/ocean-freight-public/quote/:token/decline ──────────────────────
router.post("/quote/:token/decline", async (req: Request, res: Response) => {
  try {
    const token = String(req.params.token ?? "");
    const { rows: existing } = await db.execute(sql`
      SELECT id, status FROM ocean_freight_orders WHERE quote_token = ${token}
    `);
    if (!existing.length) return res.status(404).json({ error: "Quote tidak ditemukan" });
    const ord = existing[0] as any;
    if (ord.status !== "quoted") return res.status(400).json({ error: "Tidak bisa decline pada status ini" });

    const reason = String(req.body?.reason ?? "");
    await db.execute(sql`
      UPDATE ocean_freight_orders SET status = 'quote_declined', admin_notes = COALESCE(admin_notes, '') || ${reason ? '\nDecline reason: ' + reason : ''}, updated_at = NOW()
      WHERE id = ${ord.id}
    `);

    return res.json({ ok: true, message: "Quote telah didecline." });
  } catch (e) {
    return res.status(500).json({ error: "Gagal decline quote" });
  }
});

export default router;
