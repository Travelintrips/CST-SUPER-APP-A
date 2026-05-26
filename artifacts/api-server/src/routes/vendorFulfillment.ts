import { Router, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db,
  vendorFulfillmentLinksTable,
  logisticOrdersTable,
  suppliersTable,
  orderUpdatesTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { sendWhatsApp } from "../lib/fonnte";
import { getAdminWa } from "../lib/adminWa";
import { getPreferredDomain } from "../lib/domain.js";

export const vendorFulfillmentPublicRouter = Router();

// ─── Boot migration ───────────────────────────────────────────────────────────
let migrationDone = false;
async function ensureTables() {
  if (migrationDone) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_fulfillment_links (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        order_id INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        vendor_id INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        service_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        driver_name TEXT,
        driver_phone TEXT,
        plate_number TEXT,
        vehicle_type TEXT,
        pickup_time TEXT,
        carrier_name TEXT,
        etd TEXT,
        eta TEXT,
        booking_number TEXT,
        awb_bl_number TEXT,
        flight_vessel TEXT,
        stock_confirmed TEXT,
        qty_confirmed TEXT,
        ready_date TEXT,
        warehouse_location TEXT,
        customs_pic_name TEXT,
        customs_documents TEXT,
        customs_process_eta TEXT,
        notes TEXT,
        expires_at TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    migrationDone = true;
  } catch (err) {
    logger.error({ err }, "vendorFulfillment ensureTables error");
  }
}

// ─── GET /api/vendor-fulfillment/:token ──────────────────────────────────────
vendorFulfillmentPublicRouter.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTables();

  try {
    const [link] = await db.select().from(vendorFulfillmentLinksTable)
      .where(eq(vendorFulfillmentLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });

    if (link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa", isExpired: true });
    }

    const [order] = await db.select().from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, link.orderId));
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

    let vendorName: string | null = null;
    if (link.vendorId) {
      const [v] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(eq(suppliersTable.id, link.vendorId));
      vendorName = v?.name ?? null;
    }

    const orderInfo = {
      id: order.id,
      orderNumber: order.orderNumber,
      serviceType: order.shipmentType,
      origin: order.origin,
      destination: order.destination,
      commodity: order.commodity ?? null,
      grossWeight: order.grossWeight ?? null,
      requiredDate: (order as any).requiredDate ?? null,
      vehicleType: (order as any).vehicleType ?? null,
      status: order.status,
    };

    if (link.status === "submitted") {
      return res.json({
        token,
        isSubmitted: true,
        serviceType: link.serviceType,
        vendorName,
        order: orderInfo,
        submittedData: {
          driverName:        link.driverName ?? null,
          driverPhone:       link.driverPhone ?? null,
          plateNumber:       link.plateNumber ?? null,
          vehicleType:       link.vehicleType ?? null,
          pickupTime:        link.pickupTime ?? null,
          carrierName:       link.carrierName ?? null,
          awbBlNumber:       link.awbBlNumber ?? null,
          flightVessel:      link.flightVessel ?? null,
          bookingNumber:     link.bookingNumber ?? null,
          etd:               link.etd ?? null,
          eta:               link.eta ?? null,
          stockConfirmed:    link.stockConfirmed ?? null,
          qtyConfirmed:      link.qtyConfirmed ?? null,
          readyDate:         link.readyDate ?? null,
          warehouseLocation: link.warehouseLocation ?? null,
          customsPicName:    link.customsPicName ?? null,
          customsDocuments:  link.customsDocuments ?? null,
          customsProcessEta: link.customsProcessEta ?? null,
          notes:             link.notes ?? null,
          submittedAt:       link.submittedAt ?? null,
        },
      });
    }

    return res.json({
      token,
      isSubmitted: false,
      serviceType: link.serviceType,
      vendorName,
      order: orderInfo,
    });
  } catch (err) {
    logger.error({ err }, "vendor-fulfillment GET error");
    return res.status(500).json({ error: "Gagal memuat data" });
  }
});

// ─── POST /api/vendor-fulfillment/:token ─────────────────────────────────────
vendorFulfillmentPublicRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTables();

  try {
    const [link] = await db.select().from(vendorFulfillmentLinksTable)
      .where(eq(vendorFulfillmentLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (link.expiresAt && link.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link sudah kadaluarsa" });
    }
    if (link.status === "submitted") {
      return res.status(409).json({ error: "Form sudah pernah disubmit" });
    }

    const [order] = await db.select().from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.id, link.orderId));
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

    const body = req.body as Record<string, string>;

    // Update fulfillment link with all provided fields
    const updateData: Record<string, string | null | Date> = {
      status: "submitted",
      submittedAt: new Date(),
    };

    const fields = [
      "driverName", "driverPhone", "plateNumber", "vehicleType", "pickupTime",
      "carrierName", "etd", "eta", "bookingNumber", "awbBlNumber", "flightVessel",
      "stockConfirmed", "qtyConfirmed", "readyDate", "warehouseLocation",
      "customsPicName", "customsDocuments", "customsProcessEta", "notes",
    ];

    for (const f of fields) {
      if (body[f] !== undefined) updateData[f] = body[f] || null;
    }

    await db.update(vendorFulfillmentLinksTable)
      .set(updateData as any)
      .where(eq(vendorFulfillmentLinksTable.token, token));

    // Get vendor name
    let vendorName: string | null = null;
    if (link.vendorId) {
      const [v] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(eq(suppliersTable.id, link.vendorId));
      vendorName = v?.name ?? null;
    }

    // Build summary note for order updates
    const svcLabel = link.serviceType;
    const noteParts: string[] = [`Vendor fulfillment (${svcLabel}) telah dikirim`];

    if (link.serviceType.includes("trucking")) {
      if (body.driverName) noteParts.push(`Driver: ${body.driverName}`);
      if (body.plateNumber) noteParts.push(`Plat: ${body.plateNumber}`);
      if (body.pickupTime) noteParts.push(`Estimasi pickup: ${body.pickupTime}`);
    } else if (link.serviceType.includes("freight")) {
      if (body.carrierName) noteParts.push(`Carrier: ${body.carrierName}`);
      if (body.awbBlNumber) noteParts.push(`AWB/BL: ${body.awbBlNumber}`);
      if (body.etd) noteParts.push(`ETD: ${body.etd}`);
      if (body.eta) noteParts.push(`ETA: ${body.eta}`);
    } else if (link.serviceType.includes("product")) {
      if (body.stockConfirmed) noteParts.push(`Stok: ${body.stockConfirmed}`);
      if (body.readyDate) noteParts.push(`Ready: ${body.readyDate}`);
    } else if (link.serviceType.includes("customs")) {
      if (body.customsPicName) noteParts.push(`PIC: ${body.customsPicName}`);
      if (body.customsProcessEta) noteParts.push(`ETA proses: ${body.customsProcessEta}`);
    }

    if (body.notes) noteParts.push(`Catatan: ${body.notes}`);

    // Log order update
    await db.insert(orderUpdatesTable).values({
      orderId: link.orderId,
      actorType: "vendor",
      actorName: vendorName,
      status: "assigned_to_vendor",
      notes: noteParts.join("\n"),
      isPublic: false,
    });

    // Notify admin via WA — ringkasan lengkap + link mini form (public, no login needed)
    const adminWa = await getAdminWa();
    if (adminWa) {
      const domain = getPreferredDomain() || "cstlogistic.co.id";
      const bizportalLink = `https://${domain}/vendor-fulfillment/${token}`;

      // Build detailed field summary by service type
      const detailLines: string[] = [];

      if (link.serviceType.toLowerCase().includes("trucking") ||
          link.serviceType.toLowerCase().includes("land")) {
        if (body.driverName)   detailLines.push(`👤 Driver      : ${body.driverName}`);
        if (body.driverPhone)  detailLines.push(`📱 HP Driver   : ${body.driverPhone}`);
        if (body.plateNumber)  detailLines.push(`🚛 Plat Nomor  : ${body.plateNumber}`);
        if (body.vehicleType)  detailLines.push(`🚚 Kendaraan   : ${body.vehicleType}`);
        if (body.pickupTime)   detailLines.push(`⏰ Est. Pickup : ${body.pickupTime}`);
      } else if (link.serviceType.toLowerCase().includes("freight") ||
                 link.serviceType.toLowerCase().includes("sea") ||
                 link.serviceType.toLowerCase().includes("air") ||
                 link.serviceType.toLowerCase().includes("fcl") ||
                 link.serviceType.toLowerCase().includes("lcl") ||
                 link.serviceType.toLowerCase().includes("door")) {
        if (body.carrierName)    detailLines.push(`🏢 Carrier     : ${body.carrierName}`);
        if (body.awbBlNumber)    detailLines.push(`📄 AWB/BL No.  : ${body.awbBlNumber}`);
        if (body.bookingNumber)  detailLines.push(`🔖 Booking No. : ${body.bookingNumber}`);
        if (body.flightVessel)   detailLines.push(`✈️ Kapal/Flight : ${body.flightVessel}`);
        if (body.etd)            detailLines.push(`📅 ETD         : ${body.etd}`);
        if (body.eta)            detailLines.push(`📅 ETA         : ${body.eta}`);
      } else if (link.serviceType.toLowerCase().includes("warehouse") ||
                 link.serviceType.toLowerCase().includes("product")) {
        if (body.stockConfirmed)     detailLines.push(`📦 Stok        : ${body.stockConfirmed}`);
        if (body.qtyConfirmed)       detailLines.push(`🔢 Qty         : ${body.qtyConfirmed}`);
        if (body.readyDate)          detailLines.push(`📅 Ready Date  : ${body.readyDate}`);
        if (body.warehouseLocation)  detailLines.push(`📍 Lokasi      : ${body.warehouseLocation}`);
      } else if (link.serviceType.toLowerCase().includes("custom")) {
        if (body.customsPicName)     detailLines.push(`👤 PIC         : ${body.customsPicName}`);
        if (body.customsDocuments)   detailLines.push(`📋 Dokumen     : ${body.customsDocuments}`);
        if (body.customsProcessEta)  detailLines.push(`⏱ ETA Proses  : ${body.customsProcessEta}`);
      } else {
        // Generic fallback — show all non-empty fields
        const allFields: [string, string][] = [
          ["driverName", "Driver"], ["driverPhone", "HP Driver"], ["plateNumber", "Plat"],
          ["vehicleType", "Kendaraan"], ["pickupTime", "Pickup"], ["carrierName", "Carrier"],
          ["awbBlNumber", "AWB/BL"], ["bookingNumber", "Booking"], ["flightVessel", "Kapal/Flight"],
          ["etd", "ETD"], ["eta", "ETA"], ["stockConfirmed", "Stok"], ["qtyConfirmed", "Qty"],
          ["readyDate", "Ready Date"], ["warehouseLocation", "Lokasi Gudang"],
          ["customsPicName", "PIC Customs"], ["customsDocuments", "Dokumen Customs"],
          ["customsProcessEta", "ETA Customs"],
        ];
        for (const [key, label] of allFields) {
          if (body[key]) detailLines.push(`• ${label}: ${body[key]}`);
        }
      }
      if (body.notes) detailLines.push(`📝 Catatan     : ${body.notes}`);

      const waMsg =
        `📦 *Vendor Fulfillment Masuk*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `No. Order  : \`${order.orderNumber}\`\n` +
        `Customer   : ${order.customerName}\n` +
        `Rute       : ${order.origin} → ${order.destination}\n` +
        `Vendor     : *${vendorName ?? "—"}*\n` +
        `Layanan    : ${svcLabel}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        (detailLines.length > 0 ? detailLines.join("\n") + "\n" : "") +
        `━━━━━━━━━━━━━━━━━━\n` +
        `📋 Buka form fulfillment:\n${bizportalLink}`;

      sendWhatsApp(adminWa, waMsg).catch((e) =>
        logger.warn({ e }, "vendor-fulfillment WA to admin failed")
      );
    }

    return res.json({ ok: true, message: "Data fulfillment berhasil dikirim. Terima kasih!" });
  } catch (err) {
    logger.error({ err }, "vendor-fulfillment POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});
