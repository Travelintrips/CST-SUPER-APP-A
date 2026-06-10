import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { randomBytes } from "crypto";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminGroupWa } from "../lib/adminWa.js";
import { logger } from "../lib/logger.js";

export const oceanFreightPublicRouter = Router();

// ── Options ───────────────────────────────────────────────────────────────────
oceanFreightPublicRouter.get("/options", async (_req: Request, res: Response) => {
  res.json({
    ports: [
      { city: "Jakarta",   port: "Tanjung Priok" },
      { city: "Surabaya",  port: "Tanjung Perak" },
      { city: "Semarang",  port: "Tanjung Emas" },
      { city: "Makassar",  port: "Soekarno-Hatta" },
      { city: "Medan",     port: "Belawan" },
      { city: "Balikpapan",port: "Kariangau" },
      { city: "Pontianak", port: "Dwikora" },
      { city: "Singapore", port: "PSA Singapore" },
      { city: "Port Klang",port: "Port Klang" },
      { city: "Penang",    port: "Penang Port" },
      { city: "Bangkok",   port: "Laem Chabang" },
      { city: "Shanghai",  port: "Yangshan" },
      { city: "Ningbo",    port: "Ningbo" },
      { city: "Hong Kong", port: "Kwai Tsing" },
      { city: "Busan",     port: "Busan New Port" },
      { city: "Tokyo",     port: "Tokyo Port" },
      { city: "Dubai",     port: "Jebel Ali" },
      { city: "Rotterdam", port: "Rotterdam" },
      { city: "Hamburg",   port: "Hamburg" },
      { city: "Los Angeles",port: "Long Beach" },
    ],
    container_types: ["20ft","40ft","40HC","Reefer 20ft","Reefer 40ft","Open Top","Flat Rack"],
    trade_types: [
      { value: "domestic",     label: "Domestic" },
      { value: "export",       label: "Export" },
      { value: "import",       label: "Import" },
      { value: "cross_border", label: "Cross Border" },
    ],
    service_modes: [
      { value: "port_to_port",  label: "Port to Port" },
      { value: "door_to_port",  label: "Door to Port" },
      { value: "port_to_door",  label: "Port to Door" },
      { value: "door_to_door",  label: "Door to Door" },
    ],
    cargo_conditions: [
      { value: "general",   label: "General Cargo" },
      { value: "dg",        label: "DG Cargo" },
      { value: "reefer",    label: "Reefer" },
      { value: "fragile",   label: "Fragile" },
      { value: "oversize",  label: "Oversize" },
      { value: "high_value",label: "High Value" },
    ],
    incoterms: ["EXW","FOB","CFR/CNF","CIF","DAP","DDP"],
    additional_services: [
      { value: "trucking_pickup",    label: "Trucking Pickup" },
      { value: "trucking_delivery",  label: "Trucking Delivery" },
      { value: "customs_clearance",  label: "Customs Clearance" },
      { value: "insurance",          label: "Insurance" },
      { value: "fumigation",         label: "Fumigation" },
      { value: "coo_certificate",    label: "COO / Certificate" },
      { value: "warehouse_handling", label: "Warehouse Handling" },
      { value: "stuffing",           label: "Stuffing" },
      { value: "unstuffing",         label: "Unstuffing" },
      { value: "surveyor",           label: "Surveyor" },
      { value: "doc_handling",       label: "Document Handling" },
    ],
  });
});

// ── Pricing engine ────────────────────────────────────────────────────────────
interface PricingInput {
  origin_port: string;
  destination_port: string;
  trade_type: string;
  service_mode: string;
  shipment_type: string;
  container_type?: string | null;
  container_qty?: number;
  total_cbm?: number;
  gross_weight?: number;
  cargo_condition?: string;
  selected_additional_services?: string[];
  currency_display?: string;
}

interface RateRow {
  id: number;
  rate_source_type: string;
  rate_source_name: string;
  carrier_name: string | null;
  carrier: string | null;
  origin_port: string;
  destination_port: string;
  shipment_type: string;
  service_mode: string;
  container_type: string | null;
  currency: string;
  exchange_rate_to_idr: string;
  ocean_freight_amount: string | null;
  lcl_rate_per_cbm: string | null;
  lcl_minimum_cbm: string | null;
  thc_origin: string;
  thc_destination: string;
  doc_fee: string;
  bl_fee: string;
  do_fee: string;
  handling_fee: string;
  customs_clearance_fee: string;
  trucking_pickup_estimate: string;
  trucking_delivery_estimate: string;
  insurance_percent: string;
  dg_surcharge_percent: string;
  reefer_surcharge: string;
  peak_season_surcharge: string;
  emergency_bunker_surcharge: string;
  currency_adjustment_factor: string;
  transit_days: number | null;
  direct_or_transshipment: string;
  valid_from: string;
  valid_until: string;
  price_status: string;
}

function n(v: string | null | undefined): number { return Number(v ?? 0) || 0; }

function calcOption(rate: RateRow, input: PricingInput, label: string) {
  const qty  = Number(input.container_qty ?? 1);
  const cbm  = Number(input.total_cbm ?? 0);
  const er   = n(rate.exchange_rate_to_idr);
  const svc  = input.selected_additional_services ?? [];

  let baseOcean = 0;
  if (input.shipment_type === "FCL") {
    baseOcean = n(rate.ocean_freight_amount) * qty;
  } else {
    const minCbm   = n(rate.lcl_minimum_cbm) || 1;
    const chargCbm = Math.max(cbm, minCbm);
    baseOcean      = chargCbm * n(rate.lcl_rate_per_cbm);
  }

  const originCharges = n(rate.thc_origin) * (input.shipment_type === "FCL" ? qty : 1);
  const destCharges   = n(rate.thc_destination) * (input.shipment_type === "FCL" ? qty : 1);
  const docCharges    = n(rate.doc_fee) + n(rate.bl_fee) + n(rate.do_fee) + n(rate.handling_fee);

  let truckingPickup   = 0;
  let truckingDelivery = 0;
  let customsCharge    = 0;

  if (svc.includes("trucking_pickup"))   truckingPickup   = n(rate.trucking_pickup_estimate);
  if (svc.includes("trucking_delivery")) truckingDelivery = n(rate.trucking_delivery_estimate);
  if (svc.includes("customs_clearance")) customsCharge    = n(rate.customs_clearance_fee);

  // Surcharges
  const surchargeBreakdown: Record<string, number> = {};
  let totalSurcharge = 0;

  if (input.cargo_condition === "dg") {
    const dg = baseOcean * (n(rate.dg_surcharge_percent) / 100);
    surchargeBreakdown["DG Surcharge"] = dg;
    totalSurcharge += dg;
  }
  if (input.cargo_condition === "reefer") {
    surchargeBreakdown["Reefer Surcharge"] = n(rate.reefer_surcharge);
    totalSurcharge += n(rate.reefer_surcharge);
  }
  if (n(rate.peak_season_surcharge) > 0) {
    surchargeBreakdown["Peak Season Surcharge"] = n(rate.peak_season_surcharge);
    totalSurcharge += n(rate.peak_season_surcharge);
  }
  if (n(rate.emergency_bunker_surcharge) > 0) {
    surchargeBreakdown["EBS"] = n(rate.emergency_bunker_surcharge);
    totalSurcharge += n(rate.emergency_bunker_surcharge);
  }
  if (n(rate.currency_adjustment_factor) > 0) {
    surchargeBreakdown["CAF"] = n(rate.currency_adjustment_factor);
    totalSurcharge += n(rate.currency_adjustment_factor);
  }

  const totalOrig = baseOcean + originCharges + destCharges + docCharges +
                    truckingPickup + truckingDelivery + customsCharge + totalSurcharge;
  const totalIdr  = rate.currency === "IDR" ? totalOrig : totalOrig * er;

  return {
    estimate_option:         label,
    rate_id:                 rate.id,
    rate_source_type:        rate.rate_source_type,
    rate_source_name:        rate.rate_source_name,
    carrier:                 rate.carrier_name || rate.carrier || rate.rate_source_name,
    route:                   `${rate.origin_port} → ${rate.destination_port}`,
    shipment_type:           input.shipment_type,
    service_mode:            input.service_mode,
    container_type:          rate.container_type,
    transit_days:            rate.transit_days,
    direct_or_transshipment: rate.direct_or_transshipment,
    base_ocean_freight:      baseOcean,
    origin_charges:          originCharges,
    destination_charges:     destCharges,
    document_charges:        docCharges,
    trucking_charges:        truckingPickup + truckingDelivery,
    customs_charges:         customsCharge,
    surcharge_breakdown:     surchargeBreakdown,
    total_estimate:          totalOrig,
    currency:                rate.currency,
    total_estimate_idr:      totalIdr,
    exchange_rate_to_idr:    er,
    price_status:            rate.price_status,
    validity:                rate.valid_until,
  };
}

// ── POST /calculate ───────────────────────────────────────────────────────────
oceanFreightPublicRouter.post("/calculate", async (req: Request, res: Response) => {
  try {
    const input: PricingInput = req.body;

    // Validate
    if (!input.origin_port || !input.destination_port)
      return res.status(400).json({ error: "Origin dan destination wajib diisi" });
    if (!input.shipment_type)
      return res.status(400).json({ error: "Shipment type wajib dipilih" });
    if (input.shipment_type === "FCL" && !input.container_type)
      return res.status(400).json({ error: "Container type wajib untuk FCL" });
    if (input.shipment_type === "FCL" && !(Number(input.container_qty ?? 0) >= 1))
      return res.status(400).json({ error: "Container qty minimal 1" });
    if (input.shipment_type === "LCL" && !(Number(input.total_cbm ?? 0) > 0) && !(Number(input.gross_weight ?? 0) > 0))
      return res.status(400).json({ error: "CBM atau gross weight wajib untuk LCL" });
    if (Number(input.total_cbm ?? 0) < 0 || Number(input.gross_weight ?? 0) < 0)
      return res.status(400).json({ error: "CBM dan gross weight tidak boleh negatif" });

    const today = new Date().toISOString().slice(0, 10);

    const contTypeFilter = input.shipment_type === "FCL" && input.container_type
      ? `AND (container_type = '${input.container_type.replace(/'/g, "''")}' OR container_type IS NULL)`
      : "";

    const ratesRes = await db.execute(sql.raw(`
      SELECT * FROM ocean_freight_rates
      WHERE is_active = TRUE
        AND valid_from  <= '${today}'
        AND valid_until >= '${today}'
        AND origin_port ILIKE '%${input.origin_port.replace(/'/g, "''")}%'
        AND destination_port ILIKE '%${input.destination_port.replace(/'/g, "''")}%'
        AND shipment_type = '${input.shipment_type}'
        AND service_mode  = '${(input.service_mode || "port_to_port").replace(/'/g, "''")}'
        ${contTypeFilter}
      ORDER BY ocean_freight_amount ASC, lcl_rate_per_cbm ASC
    `));

    const rates = ratesRes.rows as unknown as RateRow[];

    if (rates.length === 0) {
      return res.json({
        options: [],
        message: "Belum ada rate tersedia untuk rute ini. Silakan hubungi tim kami untuk mendapatkan penawaran.",
      });
    }

    // Build options: Economy (cheapest IDR), Priority (fastest), Standard (balanced)
    const scored = rates.map((r) => ({
      r,
      opt: calcOption(r, input, "economy"),
    })).sort((a, b) => a.opt.total_estimate_idr - b.opt.total_estimate_idr);

    const byTransit = [...rates].sort((a, b) => (a.transit_days ?? 999) - (b.transit_days ?? 999));

    const economyRate  = scored[0]?.r;
    const priorityRate = byTransit[0];
    const standardRate = scored[Math.floor(scored.length / 2)]?.r ?? scored[0]?.r;

    const options = [];
    if (economyRate)  options.push(calcOption(economyRate,  input, "economy"));
    if (priorityRate && priorityRate.id !== economyRate?.id)
      options.push(calcOption(priorityRate, input, "priority"));
    if (standardRate && standardRate.id !== economyRate?.id && standardRate.id !== priorityRate?.id)
      options.push(calcOption(standardRate, input, "standard"));

    // Ensure labels
    if (options.length === 1) options[0].estimate_option = "standard";
    if (options.length === 2) {
      options[0].estimate_option = "economy";
      options[1].estimate_option = "priority";
    }
    if (options.length === 3) {
      options[0].estimate_option = "economy";
      options[1].estimate_option = "priority";
      options[2].estimate_option = "standard";
    }

    res.json({ options, total_rates_found: rates.length });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-public] POST /calculate");
    res.status(500).json({ error: "Gagal menghitung estimasi" });
  }
});

// ── POST /inquiry ─────────────────────────────────────────────────────────────
oceanFreightPublicRouter.post("/inquiry", async (req: Request, res: Response) => {
  try {
    const b = req.body;

    // Validate
    if (!b.origin_port || !b.destination_port)
      return res.status(400).json({ error: "Origin dan destination wajib" });
    if (!b.shipment_type)
      return res.status(400).json({ error: "Shipment type wajib" });
    if (!b.customer_name)
      return res.status(400).json({ error: "Nama customer wajib" });
    if (!b.customer_phone && !b.customer_email)
      return res.status(400).json({ error: "Phone atau email wajib" });
    if (Number(b.container_qty ?? 1) < 1)
      return res.status(400).json({ error: "Container qty minimal 1" });
    if (Number(b.total_cbm ?? 0) < 0 || Number(b.gross_weight ?? 0) < 0)
      return res.status(400).json({ error: "CBM/berat tidak boleh negatif" });

    const orderNumber = `OCF/${new Date().getFullYear().toString().slice(2)}${String(new Date().getMonth() + 1).padStart(2, "0")}/${Math.floor(Math.random() * 9000 + 1000)}`;

    const pricingBreakdown = b.pricing_breakdown ? JSON.stringify(b.pricing_breakdown) : null;
    const additionalSvc    = b.selected_additional_services ? JSON.stringify(b.selected_additional_services) : "[]";
    const candidateRateIds = b.candidate_rate_ids ? JSON.stringify(b.candidate_rate_ids) : "[]";

    const insRes = await db.execute(sql.raw(`
      INSERT INTO ocean_freight_orders (
        order_number, customer_name, customer_phone, customer_email,
        origin_city, origin_port, destination_city, destination_port,
        trade_type, service_mode, shipment_type, container_type, container_qty,
        total_cbm, gross_weight, koli, commodity, hs_code, cargo_value,
        cargo_condition, incoterm, etd_preferred, eta_target,
        selected_additional_services, selected_estimate_option,
        estimated_price, estimated_price_idr, currency,
        pricing_breakdown, candidate_rate_ids, selected_rate_id,
        status, source
      ) VALUES (
        '${orderNumber}',
        '${String(b.customer_name ?? "").replace(/'/g, "''")}',
        ${b.customer_phone ? `'${String(b.customer_phone).replace(/'/g, "''")}'` : "NULL"},
        ${b.customer_email ? `'${String(b.customer_email).replace(/'/g, "''")}'` : "NULL"},
        '${String(b.origin_city ?? "").replace(/'/g, "''")}',
        '${String(b.origin_port ?? "").replace(/'/g, "''")}',
        '${String(b.destination_city ?? "").replace(/'/g, "''")}',
        '${String(b.destination_port ?? "").replace(/'/g, "''")}',
        '${String(b.trade_type ?? "export").replace(/'/g, "''")}',
        '${String(b.service_mode ?? "port_to_port").replace(/'/g, "''")}',
        '${String(b.shipment_type ?? "FCL").replace(/'/g, "''")}',
        ${b.container_type ? `'${String(b.container_type).replace(/'/g, "''")}'` : "NULL"},
        ${b.container_qty ? Number(b.container_qty) : 1},
        ${b.total_cbm ? Number(b.total_cbm) : "NULL"},
        ${b.gross_weight ? Number(b.gross_weight) : "NULL"},
        ${b.koli ? Number(b.koli) : "NULL"},
        ${b.commodity ? `'${String(b.commodity).replace(/'/g, "''")}'` : "NULL"},
        ${b.hs_code ? `'${String(b.hs_code).replace(/'/g, "''")}'` : "NULL"},
        ${b.cargo_value ? Number(b.cargo_value) : "NULL"},
        '${String(b.cargo_condition ?? "general").replace(/'/g, "''")}',
        ${b.incoterm ? `'${String(b.incoterm).replace(/'/g, "''")}'` : "NULL"},
        ${b.etd_preferred ? `'${String(b.etd_preferred).replace(/'/g, "''")}'` : "NULL"},
        ${b.eta_target ? `'${String(b.eta_target).replace(/'/g, "''")}'` : "NULL"},
        '${additionalSvc.replace(/'/g, "''")}',
        ${b.selected_estimate_option ? `'${String(b.selected_estimate_option).replace(/'/g, "''")}'` : "NULL"},
        ${b.estimated_price ? Number(b.estimated_price) : "NULL"},
        ${b.estimated_price_idr ? Number(b.estimated_price_idr) : "NULL"},
        '${String(b.currency ?? "IDR").replace(/'/g, "''")}',
        ${pricingBreakdown ? `'${pricingBreakdown.replace(/'/g, "''")}'` : "NULL"},
        '${candidateRateIds.replace(/'/g, "''")}',
        ${b.selected_rate_id ? Number(b.selected_rate_id) : "NULL"},
        'waiting_rate',
        'customer_portal'
      ) RETURNING id, order_number
    `));

    const order = insRes.rows[0] as any;

    // Notify admin
    try {
      const adminWa = await getAdminGroupWa();
      if (adminWa) {
        const msg = `*Ocean Freight Inquiry Baru*\n• Order: ${order.order_number}\n• Customer: ${b.customer_name}\n• Rute: ${b.origin_port} → ${b.destination_port}\n• Jenis: ${b.shipment_type}${b.container_type ? ` / ${b.container_type}` : ""}\n• Status: Menunggu Rate\n\nCek di admin panel untuk blast RFQ.`;
        await sendWhatsApp(adminWa, msg);
      }
    } catch {}

    res.status(201).json({ ok: true, order_number: order.order_number, id: order.id });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-public] POST /inquiry");
    res.status(500).json({ error: "Gagal submit inquiry" });
  }
});

// ── GET /quote/:token — customer view quote ───────────────────────────────────
oceanFreightPublicRouter.get("/quote/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const res2 = await db.execute(sql.raw(`SELECT * FROM ocean_freight_orders WHERE quote_token = '${token.replace(/'/g, "''")}'`));
    const order = res2.rows[0] as any;
    if (!order) return res.status(404).json({ error: "Quote tidak ditemukan atau sudah tidak berlaku" });
    // Strip internal fields
    const { admin_notes: _an, ...safe } = order;
    res.json(safe);
  } catch (err) {
    logger.error({ err }, "[ocean-freight-public] GET /quote/:token");
    res.status(500).json({ error: "Gagal memuat quote" });
  }
});

// ── POST /quote/:token/approve ────────────────────────────────────────────────
oceanFreightPublicRouter.post("/quote/:token/approve", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const res2 = await db.execute(sql.raw(`SELECT * FROM ocean_freight_orders WHERE quote_token = '${token.replace(/'/g, "''")}'`));
    const order = res2.rows[0] as any;
    if (!order) return res.status(404).json({ error: "Quote tidak ditemukan" });
    if (order.status !== "quoted") return res.status(400).json({ error: "Quote belum dikirim atau sudah diproses" });

    await db.execute(sql.raw(`UPDATE ocean_freight_orders SET status = 'approved', updated_at = NOW() WHERE quote_token = '${token.replace(/'/g, "''")}'`));

    // Notify admin
    try {
      const adminWa = await getAdminGroupWa();
      if (adminWa) await sendWhatsApp(adminWa, `*Customer Approve Ocean Freight Quote*\n• Order: ${order.order_number}\n• Customer: ${order.customer_name}\n• Rute: ${order.origin_port} → ${order.destination_port}\n• Total: IDR ${Number(order.grand_total ?? 0).toLocaleString("id-ID")}\n\nSilakan konfirmasi booking!`);
    } catch {}

    res.json({ ok: true, message: "Quote berhasil disetujui. Tim kami akan segera mengkonfirmasi booking." });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-public] POST /quote/:token/approve");
    res.status(500).json({ error: "Gagal approve quote" });
  }
});

// ── POST /quote/:token/decline ────────────────────────────────────────────────
oceanFreightPublicRouter.post("/quote/:token/decline", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;
    const { reason } = req.body;
    const res2 = await db.execute(sql.raw(`SELECT * FROM ocean_freight_orders WHERE quote_token = '${token.replace(/'/g, "''")}'`));
    const order = res2.rows[0] as any;
    if (!order) return res.status(404).json({ error: "Quote tidak ditemukan" });
    if (order.status !== "quoted") return res.status(400).json({ error: "Quote belum dikirim atau sudah diproses" });

    await db.execute(sql.raw(`UPDATE ocean_freight_orders SET status = 'quote_declined', ${reason ? `admin_notes = '${String(reason).replace(/'/g, "''")}',` : ""} updated_at = NOW() WHERE quote_token = '${token.replace(/'/g, "''")}'`));

    try {
      const adminWa = await getAdminGroupWa();
      if (adminWa) await sendWhatsApp(adminWa, `*Customer Tolak Ocean Freight Quote*\n• Order: ${order.order_number}\n• Customer: ${order.customer_name}${reason ? `\n• Alasan: ${reason}` : ""}`);
    } catch {}

    res.json({ ok: true, message: "Quote ditolak. Tim kami akan menghubungi Anda." });
  } catch (err) {
    logger.error({ err }, "[ocean-freight-public] POST /quote/:token/decline");
    res.status(500).json({ error: "Gagal decline quote" });
  }
});

// ── GET /track/:orderNumber ───────────────────────────────────────────────────
oceanFreightPublicRouter.get("/track/:orderNumber", async (req: Request, res: Response) => {
  try {
    const { orderNumber } = req.params;
    const res2 = await db.execute(sql.raw(`SELECT order_number, customer_name, origin_city, origin_port, destination_city, destination_port, shipment_type, container_type, container_qty, total_cbm, carrier, vessel_name, voyage, etd, eta, booking_number, bl_number, tracking_status, tracking_notes, tracking_updated_at, status, created_at FROM ocean_freight_orders WHERE order_number = '${orderNumber.replace(/'/g, "''")}'`));
    const order = res2.rows[0];
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });
    res.json(order);
  } catch (err) {
    logger.error({ err }, "[ocean-freight-public] GET /track/:orderNumber");
    res.status(500).json({ error: "Gagal memuat tracking" });
  }
});
