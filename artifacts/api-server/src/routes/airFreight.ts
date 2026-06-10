import { Router, type Request, type Response } from "express";
import { eq, desc, and, sql, inArray, or, ilike } from "drizzle-orm";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import {
  airFreightOrdersTable,
  airFreightDimensionsTable,
  airFreightRfqsTable,
  airFreightRateSubmissionsTable,
  suppliersTable,
} from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminGroupWa } from "../lib/adminWa.js";

// ─── Boot migration ────────────────────────────────────────────────────────────
db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS air_freight_orders (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    company_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT,
    customer_phone TEXT,
    customer_company TEXT,
    origin_airport TEXT NOT NULL DEFAULT '',
    dest_airport TEXT NOT NULL DEFAULT '',
    trade_type TEXT NOT NULL DEFAULT 'export',
    cargo_type TEXT NOT NULL DEFAULT 'general',
    commodity TEXT,
    pieces INTEGER,
    packing_type TEXT,
    gross_weight NUMERIC(12,3),
    volumetric_weight NUMERIC(12,3),
    chargeable_weight NUMERIC(12,3),
    volume_cbm NUMERIC(12,3),
    incoterm TEXT,
    etd_requested TEXT,
    additional_services TEXT[],
    special_instructions TEXT,
    notes TEXT,
    estimated_price NUMERIC(14,2),
    selected_rfq_submission_id INTEGER,
    final_rate_per_kg NUMERIC(12,2),
    fuel_surcharge NUMERIC(12,2),
    security_surcharge NUMERIC(12,2),
    awb_fee NUMERIC(12,2),
    handling_fee NUMERIC(12,2),
    xray_fee NUMERIC(12,2),
    doc_fee NUMERIC(12,2),
    customs_clearance_fee NUMERIC(12,2),
    pickup_trucking NUMERIC(12,2),
    delivery_trucking NUMERIC(12,2),
    cargo_surcharge NUMERIC(12,2),
    markup_amount NUMERIC(12,2),
    ppn_pct NUMERIC(5,2) DEFAULT 11,
    ppn_amount NUMERIC(14,2),
    subtotal NUMERIC(14,2) DEFAULT 0,
    grand_total NUMERIC(14,2) DEFAULT 0,
    airline TEXT,
    flight_number TEXT,
    etd TEXT,
    eta TEXT,
    transit_days INTEGER,
    awb_number TEXT,
    tracking_notes TEXT,
    status TEXT NOT NULL DEFAULT 'inquiry',
    admin_quote_attachment_url TEXT,
    quote_token TEXT UNIQUE,
    quote_sent_at TIMESTAMPTZ,
    booking_confirmed_at TIMESTAMPTZ,
    approved_vendor_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`)).catch((e: unknown) => console.warn("afr boot:", e));

db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS air_freight_dimensions (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES air_freight_orders(id) ON DELETE CASCADE,
    length NUMERIC(10,2),
    width NUMERIC(10,2),
    height NUMERIC(10,2),
    pieces INTEGER DEFAULT 1,
    gross_weight NUMERIC(10,3),
    volumetric_weight NUMERIC(10,3),
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`)).catch((e: unknown) => console.warn("afr dims boot:", e));

db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS air_freight_rfqs (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES air_freight_orders(id) ON DELETE CASCADE,
    rfq_number TEXT NOT NULL UNIQUE,
    blast_vendor_ids INTEGER[],
    blast_count INTEGER DEFAULT 0,
    response_deadline TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'open',
    blast_notes TEXT,
    blast_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`)).catch((e: unknown) => console.warn("afr rfqs boot:", e));

db.execute(sql.raw(`
  CREATE TABLE IF NOT EXISTS air_freight_rate_submissions (
    id SERIAL PRIMARY KEY,
    rfq_id INTEGER NOT NULL REFERENCES air_freight_rfqs(id) ON DELETE CASCADE,
    order_id INTEGER NOT NULL REFERENCES air_freight_orders(id) ON DELETE CASCADE,
    vendor_id INTEGER,
    vendor_name TEXT,
    token TEXT NOT NULL UNIQUE,
    airline TEXT,
    flight_number TEXT,
    etd TEXT,
    eta TEXT,
    transit_days INTEGER,
    is_direct BOOLEAN DEFAULT TRUE,
    currency TEXT DEFAULT 'IDR',
    exchange_rate NUMERIC(12,4) DEFAULT 1,
    rate_per_kg NUMERIC(12,2),
    weight_break_rates JSONB,
    fuel_surcharge NUMERIC(12,2) DEFAULT 0,
    security_surcharge NUMERIC(12,2) DEFAULT 0,
    awb_fee NUMERIC(12,2) DEFAULT 0,
    handling_fee NUMERIC(12,2) DEFAULT 0,
    xray_fee NUMERIC(12,2) DEFAULT 0,
    doc_fee NUMERIC(12,2) DEFAULT 0,
    customs_clearance_fee NUMERIC(12,2) DEFAULT 0,
    pickup_trucking NUMERIC(12,2) DEFAULT 0,
    delivery_trucking NUMERIC(12,2) DEFAULT 0,
    cargo_surcharge NUMERIC(12,2) DEFAULT 0,
    other_fees JSONB,
    total_idr NUMERIC(14,2),
    validity_date TEXT,
    notes TEXT,
    attachment_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    submitted_at TIMESTAMPTZ,
    submitter_ip TEXT,
    form_opened_at TIMESTAMPTZ,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )
`)).catch((e: unknown) => console.warn("afr subs boot:", e));

// ─── Helpers ───────────────────────────────────────────────────────────────────
function genOrderNumber(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `AIR-${y}${m}${day}-${rand}`;
}

function genRfqNumber(): string {
  const d = new Date();
  const y = d.getFullYear().toString().slice(-2);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `AIRFQ-${y}${m}${day}-${rand}`;
}

function genToken(): string {
  return randomBytes(24).toString("hex");
}

function calcTotal(o: {
  ratePerKg?: string | null;
  chargeableWeight?: string | null;
  fuelSurcharge?: string | null;
  securitySurcharge?: string | null;
  awbFee?: string | null;
  handlingFee?: string | null;
  xrayFee?: string | null;
  docFee?: string | null;
  customsClearanceFee?: string | null;
  pickupTrucking?: string | null;
  deliveryTrucking?: string | null;
  cargoSurcharge?: string | null;
  markupAmount?: string | null;
  ppnPct?: string | null;
}) {
  const n = (v: string | null | undefined) => parseFloat(v ?? "0") || 0;
  const freight = n(o.ratePerKg) * n(o.chargeableWeight);
  const surcharges = n(o.fuelSurcharge) + n(o.securitySurcharge) + n(o.cargoSurcharge);
  const fees = n(o.awbFee) + n(o.handlingFee) + n(o.xrayFee) + n(o.docFee)
    + n(o.customsClearanceFee) + n(o.pickupTrucking) + n(o.deliveryTrucking);
  const markup = n(o.markupAmount);
  const sub = freight + surcharges + fees + markup;
  const ppn = sub * (n(o.ppnPct) / 100);
  return { subtotal: sub, ppnAmount: ppn, grandTotal: sub + ppn };
}

// ─── Router ────────────────────────────────────────────────────────────────────
export const airFreightRouter = Router();

// ensure express 5 router works
airFreightRouter.use((_req, _res, next) => next());

// ── List orders ─────────────────────────────────────────────────────────────
airFreightRouter.get("/orders", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const page = Math.max(1, parseInt(String(req.query.page ?? "1")));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? "20")));
  const offset = (page - 1) * limit;
  const status = String(req.query.status ?? "");
  const search = String(req.query.search ?? "").trim();

  const conds: any[] = [];
  if (status) conds.push(eq(airFreightOrdersTable.status, status));
  if (search) {
    conds.push(
      or(
        ilike(airFreightOrdersTable.orderNumber, `%${search}%`),
        ilike(airFreightOrdersTable.customerName, `%${search}%`),
        ilike(airFreightOrdersTable.originAirport, `%${search}%`),
        ilike(airFreightOrdersTable.destAirport, `%${search}%`),
      )
    );
  }

  const where = conds.length ? and(...conds) : undefined;

  const [rows, [{ cnt }]] = await Promise.all([
    db.select({
      id: airFreightOrdersTable.id,
      orderNumber: airFreightOrdersTable.orderNumber,
      customerName: airFreightOrdersTable.customerName,
      customerCompany: airFreightOrdersTable.customerCompany,
      originAirport: airFreightOrdersTable.originAirport,
      destAirport: airFreightOrdersTable.destAirport,
      cargoType: airFreightOrdersTable.cargoType,
      chargeableWeight: airFreightOrdersTable.chargeableWeight,
      estimatedPrice: airFreightOrdersTable.estimatedPrice,
      grandTotal: airFreightOrdersTable.grandTotal,
      status: airFreightOrdersTable.status,
      createdAt: airFreightOrdersTable.createdAt,
    })
      .from(airFreightOrdersTable)
      .where(where)
      .orderBy(desc(airFreightOrdersTable.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ cnt: sql<number>`count(*)::int` }).from(airFreightOrdersTable).where(where),
  ]);

  res.json({ orders: rows, total: cnt, page, limit });
});

// ── Create order ─────────────────────────────────────────────────────────────
airFreightRouter.post("/orders", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const {
    customerName, customerEmail, customerPhone, customerCompany,
    originAirport, destAirport, tradeType, cargoType, commodity,
    pieces, packingType, grossWeight, volumetricWeight, chargeableWeight,
    volumeCbm, incoterm, etdRequested, additionalServices, specialInstructions,
    notes, estimatedPrice, dimensions = [],
    companyId,
  } = req.body;

  if (!customerName || !originAirport || !destAirport) {
    return res.status(400).json({ error: "customerName, originAirport, destAirport wajib diisi" });
  }

  const orderNumber = genOrderNumber();

  const [order] = await db.insert(airFreightOrdersTable).values({
    orderNumber,
    companyId: companyId ?? null,
    customerName: String(customerName),
    customerEmail: customerEmail ? String(customerEmail) : null,
    customerPhone: customerPhone ? String(customerPhone) : null,
    customerCompany: customerCompany ? String(customerCompany) : null,
    originAirport: String(originAirport),
    destAirport: String(destAirport),
    tradeType: tradeType ?? "export",
    cargoType: cargoType ?? "general",
    commodity: commodity ?? null,
    pieces: pieces ? parseInt(pieces) : null,
    packingType: packingType ?? null,
    grossWeight: grossWeight ? String(grossWeight) : null,
    volumetricWeight: volumetricWeight ? String(volumetricWeight) : null,
    chargeableWeight: chargeableWeight ? String(chargeableWeight) : null,
    volumeCbm: volumeCbm ? String(volumeCbm) : null,
    incoterm: incoterm ?? null,
    etdRequested: etdRequested ?? null,
    additionalServices: Array.isArray(additionalServices) ? additionalServices : [],
    specialInstructions: specialInstructions ?? null,
    notes: notes ?? null,
    estimatedPrice: estimatedPrice ? String(estimatedPrice) : null,
    status: "inquiry",
  }).returning();

  if (Array.isArray(dimensions) && dimensions.length > 0) {
    const dimRows = dimensions.map((d: any) => ({
      orderId: order.id,
      length: d.length ? String(d.length) : null,
      width: d.width ? String(d.width) : null,
      height: d.height ? String(d.height) : null,
      pieces: d.pieces ? parseInt(d.pieces) : 1,
      grossWeight: d.grossWeight ? String(d.grossWeight) : null,
      volumetricWeight: d.volumetricWeight ? String(d.volumetricWeight) : null,
    }));
    await db.insert(airFreightDimensionsTable).values(dimRows);
  }

  res.status(201).json({ order });
});

// ── Get order detail ──────────────────────────────────────────────────────────
airFreightRouter.get("/orders/:id", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(airFreightOrdersTable)
    .where(eq(airFreightOrdersTable.id, id));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  const [dimensions, rfqs] = await Promise.all([
    db.select().from(airFreightDimensionsTable)
      .where(eq(airFreightDimensionsTable.orderId, id)),
    db.select().from(airFreightRfqsTable)
      .where(eq(airFreightRfqsTable.orderId, id))
      .orderBy(desc(airFreightRfqsTable.createdAt)),
  ]);

  let submissions: any[] = [];
  if (rfqs.length > 0) {
    const rfqIds = rfqs.map((r) => r.id);
    const rawSubs = await db.select({
      sub: airFreightRateSubmissionsTable,
      vendorName: suppliersTable.name,
    })
      .from(airFreightRateSubmissionsTable)
      .leftJoin(suppliersTable, eq(airFreightRateSubmissionsTable.vendorId, suppliersTable.id))
      .where(inArray(airFreightRateSubmissionsTable.rfqId, rfqIds))
      .orderBy(desc(airFreightRateSubmissionsTable.createdAt));
    submissions = rawSubs.map((r) => ({
      ...r.sub,
      vendorDisplayName: r.vendorName ?? r.sub.vendorName,
    }));
  }

  let approvedVendorName: string | null = null;
  if (order.approvedVendorId) {
    const [v] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
      .where(eq(suppliersTable.id, order.approvedVendorId));
    approvedVendorName = v?.name ?? null;
  }

  res.json({ order, dimensions, rfqs, submissions, approvedVendorName });
});

// ── Update order ──────────────────────────────────────────────────────────────
airFreightRouter.put("/orders/:id", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const {
    customerName, customerEmail, customerPhone, customerCompany,
    originAirport, destAirport, tradeType, cargoType, commodity,
    pieces, packingType, grossWeight, volumetricWeight, chargeableWeight,
    volumeCbm, incoterm, etdRequested, additionalServices, specialInstructions,
    notes, estimatedPrice, dimensions,
  } = req.body;

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (customerName != null) updates.customerName = String(customerName);
  if (customerEmail != null) updates.customerEmail = customerEmail || null;
  if (customerPhone != null) updates.customerPhone = customerPhone || null;
  if (customerCompany != null) updates.customerCompany = customerCompany || null;
  if (originAirport != null) updates.originAirport = String(originAirport);
  if (destAirport != null) updates.destAirport = String(destAirport);
  if (tradeType != null) updates.tradeType = tradeType;
  if (cargoType != null) updates.cargoType = cargoType;
  if (commodity != null) updates.commodity = commodity;
  if (pieces != null) updates.pieces = parseInt(pieces);
  if (packingType != null) updates.packingType = packingType;
  if (grossWeight != null) updates.grossWeight = grossWeight ? String(grossWeight) : null;
  if (volumetricWeight != null) updates.volumetricWeight = volumetricWeight ? String(volumetricWeight) : null;
  if (chargeableWeight != null) updates.chargeableWeight = chargeableWeight ? String(chargeableWeight) : null;
  if (volumeCbm != null) updates.volumeCbm = volumeCbm ? String(volumeCbm) : null;
  if (incoterm != null) updates.incoterm = incoterm;
  if (etdRequested != null) updates.etdRequested = etdRequested;
  if (additionalServices != null) updates.additionalServices = Array.isArray(additionalServices) ? additionalServices : [];
  if (specialInstructions != null) updates.specialInstructions = specialInstructions;
  if (notes != null) updates.notes = notes;
  if (estimatedPrice != null) updates.estimatedPrice = estimatedPrice ? String(estimatedPrice) : null;

  const [updated] = await db.update(airFreightOrdersTable)
    .set(updates)
    .where(eq(airFreightOrdersTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Order tidak ditemukan" });

  if (Array.isArray(dimensions)) {
    await db.delete(airFreightDimensionsTable).where(eq(airFreightDimensionsTable.orderId, id));
    if (dimensions.length > 0) {
      await db.insert(airFreightDimensionsTable).values(
        dimensions.map((d: any) => ({
          orderId: id,
          length: d.length ? String(d.length) : null,
          width: d.width ? String(d.width) : null,
          height: d.height ? String(d.height) : null,
          pieces: d.pieces ? parseInt(d.pieces) : 1,
          grossWeight: d.grossWeight ? String(d.grossWeight) : null,
          volumetricWeight: d.volumetricWeight ? String(d.volumetricWeight) : null,
        }))
      );
    }
  }

  res.json({ order: updated });
});

// ── Get eligible vendors for blast ───────────────────────────────────────────
airFreightRouter.get("/orders/:id/eligible-vendors", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select({
    originAirport: airFreightOrdersTable.originAirport,
    destAirport: airFreightOrdersTable.destAirport,
    tradeType: airFreightOrdersTable.tradeType,
    cargoType: airFreightOrdersTable.cargoType,
  }).from(airFreightOrdersTable).where(eq(airFreightOrdersTable.id, id));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  const allVendors = await db.select({
    id: suppliersTable.id,
    name: suppliersTable.name,
    serviceType: suppliersTable.serviceType,
    phone: suppliersTable.phone,
    email: suppliersTable.email,
    isActive: suppliersTable.isActive,
  }).from(suppliersTable).where(eq(suppliersTable.isActive, true));

  const eligible = allVendors.filter((v) => {
    const st = (v.serviceType ?? "").toLowerCase();
    return st.includes("air") || st.includes("air freight");
  });

  res.json({ vendors: eligible, order });
});

// ── Blast RFQ ────────────────────────────────────────────────────────────────
airFreightRouter.post("/orders/:id/blast-rfq", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { vendorIds, responseHours = 48, notes: blastNotes } = req.body;
  if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
    return res.status(400).json({ error: "vendorIds diperlukan" });
  }

  const [order] = await db.select().from(airFreightOrdersTable)
    .where(eq(airFreightOrdersTable.id, id));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  const vendors = await db.select({
    id: suppliersTable.id,
    name: suppliersTable.name,
    phone: suppliersTable.phone,
  }).from(suppliersTable).where(inArray(suppliersTable.id, vendorIds.map(Number)));

  const rfqNumber = genRfqNumber();
  const deadline = new Date(Date.now() + parseInt(String(responseHours)) * 3600 * 1000);

  const [rfq] = await db.insert(airFreightRfqsTable).values({
    orderId: id,
    rfqNumber,
    blastVendorIds: vendorIds.map(Number),
    blastCount: vendors.length,
    responseDeadline: deadline,
    status: "open",
    blastNotes: blastNotes ?? null,
    blastAt: new Date(),
  }).returning();

  // Create submission tokens for each vendor
  const submissionInserts = vendors.map((v) => ({
    rfqId: rfq.id,
    orderId: id,
    vendorId: v.id,
    vendorName: v.name,
    token: genToken(),
    status: "pending" as const,
  }));
  const submissions = await db.insert(airFreightRateSubmissionsTable)
    .values(submissionInserts).returning();

  // Update order status
  await db.update(airFreightOrdersTable)
    .set({ status: "rfq_blasted", updatedAt: new Date() })
    .where(eq(airFreightOrdersTable.id, id));

  // Send WA to vendors
  const baseUrl = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : "https://localhost:5000";

  for (const v of vendors) {
    if (!v.phone) continue;
    const sub = submissions.find((s) => s.vendorId === v.id);
    if (!sub) continue;
    const formUrl = `${baseUrl}/air-freight-form/${sub.token}`;
    const msg = [
      `*📋 RFQ Air Freight — ${rfqNumber}*`,
      ``,
      `Kepada: *${v.name}*`,
      ``,
      `Kami mengundang Anda untuk mengajukan penawaran rate Air Freight:`,
      ``,
      `📦 Order  : ${order.orderNumber}`,
      `✈️ Rute   : ${order.originAirport} → ${order.destAirport}`,
      `🏷️ Kargo  : ${order.cargoType} / ${order.commodity ?? "-"}`,
      `⚖️ Chargeable: ${order.chargeableWeight ?? "-"} kg`,
      `📅 Deadline: ${deadline.toLocaleDateString("id-ID")}`,
      ``,
      `Isi form penawaran di sini:`,
      formUrl,
    ].join("\n");
    sendWhatsApp(v.phone, msg).catch(() => {});
  }

  // Notify admin group
  const adminWa = await getAdminGroupWa(null);
  if (adminWa) {
    const adminMsg = [
      `*📤 RFQ Air Freight Terkirim*`,
      ``,
      `No. RFQ : ${rfqNumber}`,
      `Order   : ${order.orderNumber}`,
      `Rute    : ${order.originAirport} → ${order.destAirport}`,
      `Vendor  : ${vendors.map((v) => v.name).join(", ")}`,
      `Deadline: ${deadline.toLocaleDateString("id-ID")}`,
    ].join("\n");
    sendWhatsApp(adminWa, adminMsg).catch(() => {});
  }

  res.json({ rfq, submissions: submissions.length, vendorCount: vendors.length });
});

// ── Input manual final rate ───────────────────────────────────────────────────
airFreightRouter.post("/orders/:id/manual-rate", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const {
    airline, flightNumber, etd, eta, transitDays,
    finalRatePerKg, fuelSurcharge, securitySurcharge,
    awbFee, handlingFee, xrayFee, docFee, customsClearanceFee,
    pickupTrucking, deliveryTrucking, cargoSurcharge,
    markupAmount, ppnPct,
  } = req.body;

  const [existing] = await db.select({
    chargeableWeight: airFreightOrdersTable.chargeableWeight,
  }).from(airFreightOrdersTable).where(eq(airFreightOrdersTable.id, id));
  if (!existing) return res.status(404).json({ error: "Order tidak ditemukan" });

  const n = (v: any) => v != null ? String(v) : null;
  const totals = calcTotal({
    ratePerKg: finalRatePerKg,
    chargeableWeight: existing.chargeableWeight,
    fuelSurcharge, securitySurcharge, awbFee, handlingFee,
    xrayFee, docFee, customsClearanceFee, pickupTrucking,
    deliveryTrucking, cargoSurcharge, markupAmount,
    ppnPct: ppnPct ?? "11",
  });

  const [updated] = await db.update(airFreightOrdersTable).set({
    airline: airline ?? null,
    flightNumber: flightNumber ?? null,
    etd: etd ?? null,
    eta: eta ?? null,
    transitDays: transitDays ? parseInt(transitDays) : null,
    finalRatePerKg: n(finalRatePerKg),
    fuelSurcharge: n(fuelSurcharge),
    securitySurcharge: n(securitySurcharge),
    awbFee: n(awbFee),
    handlingFee: n(handlingFee),
    xrayFee: n(xrayFee),
    docFee: n(docFee),
    customsClearanceFee: n(customsClearanceFee),
    pickupTrucking: n(pickupTrucking),
    deliveryTrucking: n(deliveryTrucking),
    cargoSurcharge: n(cargoSurcharge),
    markupAmount: n(markupAmount),
    ppnPct: ppnPct ? String(ppnPct) : "11",
    ppnAmount: String(totals.ppnAmount),
    subtotal: String(totals.subtotal),
    grandTotal: String(totals.grandTotal),
    status: "quote_ready",
    updatedAt: new Date(),
  }).where(eq(airFreightOrdersTable.id, id)).returning();

  res.json({ order: updated });
});

// ── Select RFQ submission (use vendor rate) ───────────────────────────────────
airFreightRouter.post("/orders/:id/select-submission/:submissionId", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const orderId = parseInt(req.params.id);
  const submissionId = parseInt(req.params.submissionId);
  if (isNaN(orderId) || isNaN(submissionId)) return res.status(400).json({ error: "Invalid id" });

  const [sub] = await db.select().from(airFreightRateSubmissionsTable)
    .where(and(
      eq(airFreightRateSubmissionsTable.id, submissionId),
      eq(airFreightRateSubmissionsTable.orderId, orderId),
    ));
  if (!sub) return res.status(404).json({ error: "Submission tidak ditemukan" });

  const [existing] = await db.select({
    chargeableWeight: airFreightOrdersTable.chargeableWeight,
  }).from(airFreightOrdersTable).where(eq(airFreightOrdersTable.id, orderId));
  if (!existing) return res.status(404).json({ error: "Order tidak ditemukan" });

  const { markupAmount, ppnPct } = req.body;
  const n = (v: any) => v != null ? String(v) : null;

  const totals = calcTotal({
    ratePerKg: sub.ratePerKg,
    chargeableWeight: existing.chargeableWeight,
    fuelSurcharge: sub.fuelSurcharge,
    securitySurcharge: sub.securitySurcharge,
    awbFee: sub.awbFee,
    handlingFee: sub.handlingFee,
    xrayFee: sub.xrayFee,
    docFee: sub.docFee,
    customsClearanceFee: sub.customsClearanceFee,
    pickupTrucking: sub.pickupTrucking,
    deliveryTrucking: sub.deliveryTrucking,
    cargoSurcharge: sub.cargoSurcharge,
    markupAmount: markupAmount ?? "0",
    ppnPct: ppnPct ?? "11",
  });

  // Mark other subs as rejected
  await db.update(airFreightRateSubmissionsTable)
    .set({ status: "rejected", updatedAt: new Date() })
    .where(and(
      eq(airFreightRateSubmissionsTable.orderId, orderId),
      sql`id != ${submissionId}`,
    ));
  await db.update(airFreightRateSubmissionsTable)
    .set({ status: "selected", updatedAt: new Date() })
    .where(eq(airFreightRateSubmissionsTable.id, submissionId));

  const [updated] = await db.update(airFreightOrdersTable).set({
    selectedRfqSubmissionId: submissionId,
    approvedVendorId: sub.vendorId,
    airline: sub.airline,
    flightNumber: sub.flightNumber,
    etd: sub.etd,
    eta: sub.eta,
    transitDays: sub.transitDays,
    finalRatePerKg: sub.ratePerKg,
    fuelSurcharge: sub.fuelSurcharge,
    securitySurcharge: sub.securitySurcharge,
    awbFee: sub.awbFee,
    handlingFee: sub.handlingFee,
    xrayFee: sub.xrayFee,
    docFee: sub.docFee,
    customsClearanceFee: sub.customsClearanceFee,
    pickupTrucking: sub.pickupTrucking,
    deliveryTrucking: sub.deliveryTrucking,
    cargoSurcharge: sub.cargoSurcharge,
    markupAmount: markupAmount ? String(markupAmount) : null,
    ppnPct: ppnPct ? String(ppnPct) : "11",
    ppnAmount: String(totals.ppnAmount),
    subtotal: String(totals.subtotal),
    grandTotal: String(totals.grandTotal),
    status: "quote_ready",
    updatedAt: new Date(),
  }).where(eq(airFreightOrdersTable.id, orderId)).returning();

  res.json({ order: updated });
});

// ── Send quote to customer ────────────────────────────────────────────────────
airFreightRouter.post("/orders/:id/send-quote", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const [order] = await db.select().from(airFreightOrdersTable)
    .where(eq(airFreightOrdersTable.id, id));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  const token = order.quoteToken ?? genToken();
  const [updated] = await db.update(airFreightOrdersTable).set({
    status: "quote_sent",
    quoteToken: token,
    quoteSentAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(airFreightOrdersTable.id, id)).returning();

  if (order.customerPhone) {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : "https://localhost:5000";
    const n = (v: string | null | undefined) => parseFloat(v ?? "0") || 0;
    const msg = [
      `*✈️ Penawaran Harga Air Freight*`,
      ``,
      `Kepada: *${order.customerName}*`,
      ``,
      `No. Order  : ${order.orderNumber}`,
      `Rute       : ${order.originAirport} → ${order.destAirport}`,
      `Airline    : ${order.airline ?? "-"}`,
      `ETD        : ${order.etd ?? "-"}`,
      `ETA        : ${order.eta ?? "-"}`,
      ``,
      `*Estimasi Biaya:*`,
      `Rate/kg    : Rp ${n(order.finalRatePerKg).toLocaleString("id-ID")}`,
      `Chargeable : ${n(order.chargeableWeight)} kg`,
      `Subtotal   : Rp ${n(order.subtotal).toLocaleString("id-ID")}`,
      `PPN        : Rp ${n(order.ppnAmount).toLocaleString("id-ID")}`,
      `*Total     : Rp ${n(order.grandTotal).toLocaleString("id-ID")}*`,
      ``,
      `Info lebih lanjut, hubungi kami.`,
    ].join("\n");
    sendWhatsApp(order.customerPhone, msg).catch(() => {});
  }

  res.json({ order: updated, quoteToken: token });
});

// ── Confirm booking ───────────────────────────────────────────────────────────
airFreightRouter.post("/orders/:id/confirm-booking", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { awbNumber } = req.body;

  const [updated] = await db.update(airFreightOrdersTable).set({
    status: "booking_confirmed",
    bookingConfirmedAt: new Date(),
    awbNumber: awbNumber ? String(awbNumber) : null,
    updatedAt: new Date(),
  }).where(eq(airFreightOrdersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Order tidak ditemukan" });

  if (updated.customerPhone) {
    const msg = [
      `*✅ Booking Dikonfirmasi*`,
      ``,
      `Order: ${updated.orderNumber}`,
      `AWB  : ${awbNumber ?? "-"}`,
      `Rute : ${updated.originAirport} → ${updated.destAirport}`,
      `ETD  : ${updated.etd ?? "-"}`,
      ``,
      `Terima kasih atas kepercayaan Anda.`,
    ].join("\n");
    sendWhatsApp(updated.customerPhone, msg).catch(() => {});
  }

  res.json({ order: updated });
});

// ── Update tracking ───────────────────────────────────────────────────────────
airFreightRouter.put("/orders/:id/tracking", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { status, awbNumber, airline, flightNumber, etd, eta, trackingNotes } = req.body;

  const validStatuses = [
    "inquiry", "rfq_blasted", "rate_received", "quote_ready", "quote_sent",
    "booking_confirmed", "in_transit", "arrived", "completed", "cancelled",
  ];
  if (status && !validStatuses.includes(status)) {
    return res.status(400).json({ error: "Status tidak valid" });
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (status) updates.status = status;
  if (awbNumber != null) updates.awbNumber = awbNumber || null;
  if (airline != null) updates.airline = airline || null;
  if (flightNumber != null) updates.flightNumber = flightNumber || null;
  if (etd != null) updates.etd = etd || null;
  if (eta != null) updates.eta = eta || null;
  if (trackingNotes != null) updates.trackingNotes = trackingNotes || null;

  const [updated] = await db.update(airFreightOrdersTable)
    .set(updates)
    .where(eq(airFreightOrdersTable.id, id))
    .returning();
  if (!updated) return res.status(404).json({ error: "Order tidak ditemukan" });

  res.json({ order: updated });
});

// ── Get submissions for comparison (by order) ─────────────────────────────────
airFreightRouter.get("/orders/:id/submissions", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const rows = await db.select({
    sub: airFreightRateSubmissionsTable,
    vendorNameDb: suppliersTable.name,
  })
    .from(airFreightRateSubmissionsTable)
    .leftJoin(suppliersTable, eq(airFreightRateSubmissionsTable.vendorId, suppliersTable.id))
    .where(eq(airFreightRateSubmissionsTable.orderId, id))
    .orderBy(airFreightRateSubmissionsTable.totalIDR);

  res.json({
    submissions: rows.map((r) => ({
      ...r.sub,
      vendorDisplayName: r.vendorNameDb ?? r.sub.vendorName,
    })),
  });
});

// ── Upload admin quote attachment ─────────────────────────────────────────────
airFreightRouter.post("/orders/:id/upload-quote", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { attachmentUrl } = req.body;
  if (!attachmentUrl) return res.status(400).json({ error: "attachmentUrl required" });

  const [updated] = await db.update(airFreightOrdersTable).set({
    adminQuoteAttachmentUrl: String(attachmentUrl),
    updatedAt: new Date(),
  }).where(eq(airFreightOrdersTable.id, id)).returning();
  if (!updated) return res.status(404).json({ error: "Order tidak ditemukan" });

  res.json({ order: updated });
});

// ── Delete order ──────────────────────────────────────────────────────────────
airFreightRouter.delete("/orders/:id", async (req: Request, res: Response) => {
  const ok = await requireAdmin(req, res);
  if (!ok) return;

  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  await db.delete(airFreightOrdersTable).where(eq(airFreightOrdersTable.id, id));
  res.json({ ok: true });
});
