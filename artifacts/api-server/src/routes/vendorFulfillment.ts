import { Router, type Request, type Response } from "express";
import { eq, and } from "drizzle-orm";
import { sql } from "drizzle-orm";
import multer from "multer";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import {
  db,
  vendorFulfillmentLinksTable,
  logisticOrdersTable,
  logisticOrderItemsTable,
  suppliersTable,
  orderUpdatesTable,
  vendorCatalogItemsTable,
} from "@workspace/db";
import { logger } from "../lib/logger";
import { sendViaService as sendWhatsApp, sendMediaViaService } from "../lib/waTransport.js";
import { getAdminWa } from "../lib/adminWa";
import { getPreferredDomain } from "../lib/domain.js";
import { resolveServiceCategory } from "@workspace/logistics-constants";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { createAdminActionLink, getAdminActionUrl } from "./adminAction.js";
import { generateShortLink } from "../lib/shortLink.js";
import { transitionLogisticOrderStatus } from "../lib/services/logisticOrderStatusService.js";

export const vendorFulfillmentPublicRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const objectStorage = new ObjectStorageService();
const LOCAL_UPLOAD_DIR = "/tmp/vendor-uploads";

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
  "image/webp": "webp", "image/heic": "heic", "image/heif": "heic",
  "application/pdf": "pdf",
};

// ─── GET /api/vendor-fulfillment/:token/drivers ───────────────────────────────
vendorFulfillmentPublicRouter.get("/:token/drivers", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTables();
  try {
    const [link] = await db.select({
      vendorId: vendorFulfillmentLinksTable.vendorId,
      expiresAt: vendorFulfillmentLinksTable.expiresAt,
    }).from(vendorFulfillmentLinksTable).where(eq(vendorFulfillmentLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ error: "Link kadaluarsa" });

    const vendorId = link.vendorId;
    let drivers: { id: number; name: string; phone: string | null; vehiclePlate: string | null; vehicleType: string | null }[] = [];
    if (vendorId) {
      const rows = await db.execute(sql`
        SELECT id, name, phone, vehicle_plate AS "vehiclePlate", vehicle_type AS "vehicleType"
        FROM vendor_drivers
        WHERE supplier_id = ${vendorId} AND is_active = TRUE
        ORDER BY name ASC
      `);
      drivers = rows.rows as typeof drivers;
    }
    return res.json({ drivers });
  } catch (err) {
    logger.error({ err }, "vendor-fulfillment GET drivers error");
    return res.status(500).json({ error: "Gagal memuat data driver" });
  }
});

// ─── POST /api/vendor-fulfillment/:token/drivers ──────────────────────────────
vendorFulfillmentPublicRouter.post("/:token/drivers", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTables();
  try {
    const [link] = await db.select({
      vendorId: vendorFulfillmentLinksTable.vendorId,
      orderId: vendorFulfillmentLinksTable.orderId,
      expiresAt: vendorFulfillmentLinksTable.expiresAt,
      status: vendorFulfillmentLinksTable.status,
    }).from(vendorFulfillmentLinksTable).where(eq(vendorFulfillmentLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ error: "Link kadaluarsa" });

    const { name, phone, vehiclePlate, vehicleType } = req.body as {
      name?: string; phone?: string; vehiclePlate?: string; vehicleType?: string;
    };
    if (!name?.trim()) return res.status(400).json({ error: "Nama driver wajib diisi" });

    const vendorId = link.vendorId ?? null;
    const result = await db.execute(sql`
      INSERT INTO vendor_drivers (supplier_id, name, phone, vehicle_plate, vehicle_type)
      VALUES (${vendorId}, ${name.trim()}, ${phone?.trim() || null}, ${vehiclePlate?.trim() || null}, ${vehicleType?.trim() || null})
      RETURNING id, name, phone, vehicle_plate AS "vehiclePlate", vehicle_type AS "vehicleType"
    `);

    // ── Notify admin via WA (fire-and-forget) ─────────────────────────────
    (async () => {
      try {
        const adminWa = await getAdminWa();
        if (!adminWa) return;

        // Ambil nama vendor dan nomor order secara paralel
        const [vendorRow, orderRow] = await Promise.all([
          vendorId
            ? db.select({ name: suppliersTable.name })
                .from(suppliersTable)
                .where(eq(suppliersTable.id, vendorId))
                .then((r) => r[0])
            : Promise.resolve(null),
          db.select({ orderNumber: logisticOrdersTable.orderNumber, customerName: logisticOrdersTable.customerName })
            .from(logisticOrdersTable)
            .where(eq(logisticOrdersTable.id, link.orderId))
            .then((r) => r[0]),
        ]);

        const vendorName = vendorRow?.name ?? "—";
        const orderNumber = orderRow?.orderNumber ?? "—";
        const customerName = orderRow?.customerName ?? "—";

        const lines: string[] = [
          `👤 Nama   : *${name.trim()}*`,
        ];
        if (phone?.trim())        lines.push(`📱 HP     : ${phone.trim()}`);
        if (vehiclePlate?.trim()) lines.push(`🚛 Plat   : ${vehiclePlate.trim().toUpperCase()}`);
        if (vehicleType?.trim())  lines.push(`🚚 Kend.  : ${vehicleType.trim()}`);

        const waMsg =
          `🆕 *Driver Baru Ditambahkan*\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Vendor    : *${vendorName}*\n` +
          `No. Order : \`${orderNumber}\`\n` +
          `Customer  : ${customerName}\n` +
          `━━━━━━━━━━━━━━━━━━\n` +
          lines.join("\n") + "\n" +
          `━━━━━━━━━━━━━━━━━━\n` +
          `Driver ini kini tersedia di dropdown pemilihan driver pada form fulfillment vendor.`;

        await sendWhatsApp(adminWa, waMsg);
      } catch (e) {
        logger.warn({ e }, "vendor-fulfillment POST driver: WA notify failed");
      }
    })();

    return res.status(201).json({ driver: result.rows[0] });
  } catch (err) {
    logger.error({ err }, "vendor-fulfillment POST driver error");
    return res.status(500).json({ error: "Gagal menyimpan driver" });
  }
});

// ─── Serve local fallback uploads ─────────────────────────────────────────────
vendorFulfillmentPublicRouter.get("/local-file/:filename", async (req: Request, res: Response) => {
  const { filename } = req.params as { filename: string };
  if (!/^[a-zA-Z0-9_\-]+\.(jpg|jpeg|png|webp|heic|pdf)$/i.test(filename)) {
    return res.status(400).send("Invalid filename");
  }
  try {
    const data = await fs.readFile(path.join(LOCAL_UPLOAD_DIR, filename));
    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const mime = Object.entries(MIME_EXT).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=86400");
    return res.send(data);
  } catch {
    return res.status(404).send("Not found");
  }
});

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
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS price_confirmed TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS revised_price TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS lead_time TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS stock_photo_url TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS invoice_url TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS supporting_doc_url TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS delivery_method TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS packing_list_url TEXT`);
    await db.execute(sql`ALTER TABLE vendor_fulfillment_links ADD COLUMN IF NOT EXISTS pod_url TEXT`);
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS vendor_drivers (
        id          SERIAL PRIMARY KEY,
        supplier_id INTEGER REFERENCES suppliers(id) ON DELETE CASCADE,
        name        TEXT NOT NULL,
        phone       TEXT,
        vehicle_plate TEXT,
        vehicle_type  TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS vendor_drivers_supplier_idx ON vendor_drivers(supplier_id)`);
    migrationDone = true;
  } catch (err) {
    logger.error({ err }, "vendorFulfillment ensureTables error");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractItemQty(inp: Record<string, unknown> | null | undefined): number | null {
  if (!inp) return null;
  const q = inp.quantity ?? inp.qty ?? inp.jumlah;
  if (typeof q === "number") return q;
  if (typeof q === "string") { const n = parseFloat(q); return isNaN(n) ? null : n; }
  return null;
}

function extractItemUnit(inp: Record<string, unknown> | null | undefined): string | null {
  if (!inp) return null;
  const u = inp.unit ?? inp.satuan ?? inp.uom;
  return typeof u === "string" ? u : null;
}

const fmtRp = (n: number | null | string | undefined) => {
  const num = Number(n ?? 0);
  return `Rp ${Math.round(num).toLocaleString("id-ID")}`;
};

// ─── Upload endpoint ──────────────────────────────────────────────────────────
vendorFulfillmentPublicRouter.post(
  "/:token/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const { token } = req.params as { token: string };
    const fileType = ((req.query.type as string) ?? "misc").replace(/[^a-z_]/g, "");
    await ensureTables();

    try {
      const [link] = await db.select({
        id: vendorFulfillmentLinksTable.id,
        expiresAt: vendorFulfillmentLinksTable.expiresAt,
        status: vendorFulfillmentLinksTable.status,
      }).from(vendorFulfillmentLinksTable)
        .where(eq(vendorFulfillmentLinksTable.token, token));

      if (!link) return res.status(404).json({ error: "Link tidak ditemukan" });
      if (link.expiresAt && link.expiresAt < new Date()) return res.status(410).json({ error: "Link kadaluarsa" });
      if (link.status === "submitted") return res.status(409).json({ error: "Form sudah disubmit" });
      if (!req.file) return res.status(400).json({ error: "File diperlukan" });

      const ALLOWED = new Set([
        "image/jpeg", "image/jpg", "image/png", "image/webp",
        "image/heic", "image/heif", "application/pdf",
      ]);
      if (!ALLOWED.has(req.file.mimetype)) {
        return res.status(400).json({ error: "Hanya JPG, PNG, WebP, HEIC, atau PDF yang diizinkan" });
      }

      const uuid = randomUUID();
      const isPdf = req.file.mimetype === "application/pdf";
      const ext = isPdf ? "pdf" : (req.file.originalname?.split(".").pop()?.toLowerCase() ?? "jpg");
      const subPath = `vendor-fulfillment/${token}/${fileType}-${uuid}.${ext}`;
      let url: string;
      try {
        url = await objectStorage.uploadPublicRaw(subPath, req.file.buffer, req.file.mimetype);
      } catch (uploadErr: unknown) {
        logger.warn({ err: uploadErr, subPath }, "GCS upload gagal, fallback ke local storage");
        try {
          await fs.mkdir(LOCAL_UPLOAD_DIR, { recursive: true });
          const localFile = `${fileType}-${uuid}.${ext}`;
          await fs.writeFile(path.join(LOCAL_UPLOAD_DIR, localFile), req.file.buffer);
          url = `/api/vendor-fulfillment/local-file/${localFile}`;
        } catch (localErr: unknown) {
          logger.error({ err: localErr }, "Local fallback upload juga gagal");
          return res.status(500).json({ error: "Upload file gagal. Coba lagi atau hubungi admin." });
        }
      }
      return res.json({ url });
    } catch (err) {
      logger.error({ err }, "vendor-fulfillment upload handler error");
      return res.status(500).json({ error: "Terjadi kesalahan pada server" });
    }
  }
);

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

    // Fetch order items
    const orderItemRows = await db.select({
      serviceName: logisticOrderItemsTable.serviceName,
      category: logisticOrderItemsTable.category,
      subtotal: logisticOrderItemsTable.subtotal,
      inputData: logisticOrderItemsTable.inputData,
    }).from(logisticOrderItemsTable)
      .where(eq(logisticOrderItemsTable.orderId, order.id));

    // Fetch vendor catalog items (untuk harga dasar vendor — BUKAN harga jual order)
    type CatalogRow = { name: string; kategori: string | null; priceBase: string; type: string };
    let vendorCatalog: CatalogRow[] = [];
    if (link.vendorId) {
      vendorCatalog = await db.select({
        name: vendorCatalogItemsTable.name,
        kategori: vendorCatalogItemsTable.kategori,
        priceBase: vendorCatalogItemsTable.priceBase,
        type: vendorCatalogItemsTable.type,
      }).from(vendorCatalogItemsTable)
        .where(and(
          eq(vendorCatalogItemsTable.vendorId, link.vendorId),
          eq(vendorCatalogItemsTable.isActive, true)
        ));
    }

    // Helper: cari catalog match untuk satu order item
    const findCatalogMatch = (it: typeof orderItemRows[0]): CatalogRow | null => {
      if (vendorCatalog.length === 0) return null;
      const svc = (it.serviceName ?? "").toLowerCase().trim();
      const cat = (it.category ?? "").toLowerCase().trim();
      const exact = vendorCatalog.find(c =>
        c.name.toLowerCase().trim() === svc ||
        c.name.toLowerCase().trim() === cat ||
        (c.kategori ?? "").toLowerCase().trim() === cat
      );
      if (exact) return exact;
      // Fallback: jika hanya satu catalog item, pakai itu
      if (vendorCatalog.length === 1) return vendorCatalog[0];
      return null;
    };

    // Hitung harga dasar vendor per item (JANGAN pakai it.subtotal — itu harga jual ke customer)
    const TAX_RATE = 11;
    const itemsWithVendorPrice = orderItemRows.map((it) => {
      const inp = it.inputData as Record<string, unknown> | null;
      const qty = extractItemQty(inp) ?? 1;
      const catalogMatch = findCatalogMatch(it);
      const vendorUnitPrice = catalogMatch ? Number(catalogMatch.priceBase) : null;
      // PENTING: subtotal = harga_dasar × qty — jangan pakai priceBase tanpa qty
      const vendorSubtotal = vendorUnitPrice != null ? vendorUnitPrice * qty : null;
      return {
        serviceName: it.serviceName ?? "",
        category: it.category ?? "",
        unitPrice: vendorUnitPrice != null ? String(vendorUnitPrice) : null,
        subtotal: vendorSubtotal != null ? String(vendorSubtotal) : (it.subtotal != null ? String(it.subtotal) : null),
        quantity: String(qty),
        unit: extractItemUnit(inp) ?? null,
        _vendorSubtotal: vendorSubtotal,
      };
    });

    // Hitung grandTotal dari harga catalog vendor; fallback ke harga jual jika catalog tidak ada
    const vendorPrices = itemsWithVendorPrice.map(i => i._vendorSubtotal);
    const allPriced = vendorPrices.length > 0 && vendorPrices.every(v => v != null);
    const vendorGrandTotal = allPriced
      ? vendorPrices.reduce((s, v) => s + (v ?? 0), 0)
      : Number(order.grandTotal ?? 0);

    // Exclusive PPN: vendorGrandTotal IS the DPP (base/catalog price), PPN dihitung di atasnya
    const subtotalBeforeTax = vendorGrandTotal > 0 ? vendorGrandTotal : null;
    const taxAmount = subtotalBeforeTax != null ? Math.round(subtotalBeforeTax * TAX_RATE / 100) : null;
    const vendorTotalWithTax = subtotalBeforeTax != null && taxAmount != null ? subtotalBeforeTax + taxAmount : vendorGrandTotal;

    const orderInfo = {
      id: order.id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      serviceType: order.shipmentType,
      orderType: (order as any).orderType ?? null,
      origin: order.origin,
      destination: order.destination,
      commodity: order.commodity ?? null,
      grossWeight: order.grossWeight ?? null,
      requiredDate: (order as any).requiredDate ?? null,
      vehicleType: (order as any).vehicleType ?? null,
      status: order.status,
      items: itemsWithVendorPrice.map(({ _vendorSubtotal: _vs, ...rest }) => rest),
      grandTotal: String(vendorTotalWithTax || (order.grandTotal ?? 0)),
      subtotalBeforeTax: subtotalBeforeTax != null ? String(subtotalBeforeTax) : null,
      taxAmount: taxAmount != null ? String(taxAmount) : null,
      taxRate: TAX_RATE,
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
          priceConfirmed:    (link as any).priceConfirmed ?? null,
          revisedPrice:      (link as any).revisedPrice ?? null,
          leadTime:          (link as any).leadTime ?? null,
          deliveryMethod:    (link as any).deliveryMethod ?? null,
          stockPhotoUrl:     (link as any).stockPhotoUrl ?? null,
          packingListUrl:    (link as any).packingListUrl ?? null,
          invoiceUrl:        (link as any).invoiceUrl ?? null,
          podUrl:            (link as any).podUrl ?? null,
          supportingDocUrl:  (link as any).supportingDocUrl ?? null,
          notes:             link.notes ?? null,
          submittedAt:       link.submittedAt ? (link.submittedAt as Date).toISOString() : null,
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

    const updateData: Record<string, string | null | Date> = {
      status: "submitted",
      submittedAt: new Date(),
    };

    const FIELDS = [
      "driverName", "driverPhone", "plateNumber", "vehicleType", "pickupTime",
      "carrierName", "etd", "eta", "bookingNumber", "awbBlNumber", "flightVessel",
      "stockConfirmed", "qtyConfirmed", "readyDate", "warehouseLocation",
      "customsPicName", "customsDocuments", "customsProcessEta",
      "priceConfirmed", "revisedPrice", "leadTime",
      "deliveryMethod",
      "stockPhotoUrl", "packingListUrl", "invoiceUrl", "podUrl", "supportingDocUrl",
      "notes",
    ];
    for (const f of FIELDS) {
      if (body[f] !== undefined) updateData[f] = body[f] || null;
    }

    await db.update(vendorFulfillmentLinksTable)
      .set(updateData as any)
      .where(eq(vendorFulfillmentLinksTable.token, token));

    let vendorName: string | null = null;
    if (link.vendorId) {
      const [v] = await db.select({ name: suppliersTable.name }).from(suppliersTable)
        .where(eq(suppliersTable.id, link.vendorId));
      vendorName = v?.name ?? null;
    }

    const svcLabel = link.serviceType;
    const STOCK_LABEL: Record<string, string> = {
      all: "Tersedia Semua", partial: "Tersedia Sebagian", none: "Tidak Tersedia",
    };
    const noteParts: string[] = [`Vendor fulfillment (${svcLabel}) telah dikirim`];
    const svcCategory = resolveServiceCategory(link.serviceType);

    if (svcCategory === "trucking") {
      if (body.driverName) noteParts.push(`Driver: ${body.driverName}`);
      if (body.plateNumber) noteParts.push(`Plat: ${body.plateNumber}`);
      if (body.pickupTime) noteParts.push(`Estimasi pickup: ${body.pickupTime}`);
    } else if (svcCategory === "freight") {
      if (body.carrierName) noteParts.push(`Carrier: ${body.carrierName}`);
      if (body.awbBlNumber) noteParts.push(`AWB/BL: ${body.awbBlNumber}`);
      if (body.etd) noteParts.push(`ETD: ${body.etd}`);
    } else if (svcCategory === "product") {
      if (body.stockConfirmed) noteParts.push(`Stok: ${STOCK_LABEL[body.stockConfirmed] ?? body.stockConfirmed}`);
      if (body.qtyConfirmed) noteParts.push(`Qty: ${body.qtyConfirmed}`);
      if (body.readyDate) noteParts.push(`Siap kirim: ${body.readyDate}`);
      if (body.priceConfirmed === "revised" && body.revisedPrice) noteParts.push(`Revisi harga: ${fmtRp(body.revisedPrice)}`);
    } else if (svcCategory === "customs") {
      if (body.customsPicName) noteParts.push(`PIC: ${body.customsPicName}`);
    }
    if (body.notes) noteParts.push(`Catatan: ${body.notes}`);

    // Update order status → "Vendor Confirmed" agar tombol konfirmasi di BizPortal muncul
    await transitionLogisticOrderStatus(link.orderId, "Vendor Confirmed", {
      actorType: "vendor",
      actorName: vendorName,
      source: "vendorFulfillment/submit",
      force: true,
      skipAudit: false,
    });

    await db.insert(orderUpdatesTable).values({
      orderId: link.orderId,
      actorType: "vendor",
      actorName: vendorName,
      status: "Vendor Confirmed",
      notes: noteParts.join("\n"),
      isPublic: true,
    });

    // Notify admin via WA
    const adminWa = await getAdminWa();
    if (adminWa) {
      const domain = getPreferredDomain() || "cstlogistic.co.id";

      // Buat link mini form confirm_fulfillment untuk admin
      let bizportalLink: string;
      try {
        const cfToken = await createAdminActionLink(order.id, "confirm_fulfillment", null, 168);
        const cfUrl = getAdminActionUrl(cfToken);
        bizportalLink = await generateShortLink(cfUrl, {
          context: "admin_action",
          refType: "order",
          refId: order.orderNumber,
        });
      } catch (e) {
        logger.warn({ e }, "vendor-fulfillment: gagal buat confirm_fulfillment link, fallback ke BizPortal URL");
        bizportalLink = `https://${domain}/logistic-admin/orders/${order.id}`;
      }
      const detailLines: string[] = [];
      const cat = resolveServiceCategory(link.serviceType);

      if (cat === "trucking") {
        if (body.driverName)   detailLines.push(`👤 Driver      : ${body.driverName}`);
        if (body.driverPhone)  detailLines.push(`📱 HP Driver   : ${body.driverPhone}`);
        if (body.plateNumber)  detailLines.push(`🚛 Plat Nomor  : ${body.plateNumber}`);
        if (body.vehicleType)  detailLines.push(`🚚 Kendaraan   : ${body.vehicleType}`);
        if (body.pickupTime)   detailLines.push(`⏰ Est. Pickup : ${body.pickupTime}`);
      } else if (cat === "freight") {
        if (body.carrierName)    detailLines.push(`🏢 Carrier     : ${body.carrierName}`);
        if (body.awbBlNumber)    detailLines.push(`📄 AWB/BL No.  : ${body.awbBlNumber}`);
        if (body.bookingNumber)  detailLines.push(`🔖 Booking No. : ${body.bookingNumber}`);
        if (body.flightVessel)   detailLines.push(`✈️ Kapal/Flight : ${body.flightVessel}`);
        if (body.etd)            detailLines.push(`📅 ETD         : ${body.etd}`);
        if (body.eta)            detailLines.push(`📅 ETA         : ${body.eta}`);
      } else if (cat === "product") {
        // ── Item breakdown: barang + harga vendor + PPN + total ──
        if (link.vendorId) {
          const orderItems = await db.select().from(logisticOrderItemsTable)
            .where(eq(logisticOrderItemsTable.orderId, order.id));
          const vendorCatalog = await db.select().from(vendorCatalogItemsTable)
            .where(and(eq(vendorCatalogItemsTable.vendorId, link.vendorId), eq(vendorCatalogItemsTable.isActive, true)));

          const PPN_RATE = 0.11;
          const revisedTotal = (body.priceConfirmed === "revised" && body.revisedPrice)
            ? (parseFloat(String(body.revisedPrice).replace(/[^\d.]/g, "")) || null)
            : null;
          const isSingle = orderItems.length === 1;

          const itemLines: string[] = [];
          for (const item of orderItems) {
            const inputData = (item.inputData as Record<string, unknown>) ?? {};
            const qty = (() => {
              const q = inputData.qty ?? inputData.quantity ?? inputData.jumlah;
              return q != null ? (Number(q) || 1) : 1;
            })();
            const unit = String(inputData.unit ?? (item as any).unit ?? "Unit");
            const name = item.serviceName || item.category || "—";
            const nameLower = name.toLowerCase().trim();
            const catItem = vendorCatalog.find((c) => {
              const cn = c.name.toLowerCase().trim();
              return cn.includes(nameLower) || nameLower.includes(cn);
            }) ?? vendorCatalog[0];
            const priceBase = catItem ? parseFloat(String(catItem.priceBase)) : null;

            let subtotal: number | null = null;
            if (isSingle && revisedTotal != null) subtotal = revisedTotal;
            else if (priceBase != null) subtotal = Math.round(priceBase * qty);

            itemLines.push(`• ${name}`);
            itemLines.push(`  Qty      : ${qty} ${unit}`);
            if (priceBase != null) itemLines.push(`  Harga    : ${fmtRp(priceBase)}/unit`);
            if (subtotal != null) {
              const ppn = Math.round(subtotal * PPN_RATE);
              const total = subtotal + ppn;
              itemLines.push(`  Subtotal : ${fmtRp(subtotal)}`);
              itemLines.push(`  PPN 11%  : ${fmtRp(ppn)}`);
              itemLines.push(`  *Total   : ${fmtRp(total)}*`);
            }
          }
          if (itemLines.length > 0) {
            detailLines.push(...itemLines);
            detailLines.push("──────────────────");
          }
        }

        const SL: Record<string, string> = { all: "Tersedia Semua ✅", partial: "Tersedia Sebagian ⚠️", none: "Tidak Tersedia ❌" };
        if (body.stockConfirmed)    detailLines.push(`📦 Stok        : ${SL[body.stockConfirmed] ?? body.stockConfirmed}`);
        if (body.qtyConfirmed)      detailLines.push(`🔢 Qty         : ${body.qtyConfirmed}`);
        if (body.readyDate)         detailLines.push(`📅 Siap Kirim  : ${body.readyDate}`);
        if (body.leadTime)          detailLines.push(`⏱ Lead Time   : ${body.leadTime}`);
        if (body.warehouseLocation) detailLines.push(`📍 Lokasi      : ${body.warehouseLocation}`);
        if (body.priceConfirmed === "agree")   detailLines.push(`💰 Harga       : Setuju harga asal`);
        else if (body.priceConfirmed === "revised") detailLines.push(`💰 Revisi Harga: ${fmtRp(body.revisedPrice)}`);
        const DELIVERY_LABEL: Record<string, string> = {
          vendor_delivery: "🚛 Vendor Delivery",
          customer_pickup: "🏭 Customer Pickup",
          third_party: "📦 Third Party Carrier",
        };
        if (body.deliveryMethod)    detailLines.push(`🚚 Pengiriman  : ${DELIVERY_LABEL[body.deliveryMethod] ?? body.deliveryMethod}`);
        if (body.packingListUrl)    detailLines.push(`📋 Packing List: ${body.packingListUrl}`);
        if (body.invoiceUrl)        detailLines.push(`📄 Invoice     : ${body.invoiceUrl}`);
        if (body.podUrl)            detailLines.push(`✅ POD         : ${body.podUrl}`);
        if (body.supportingDocUrl)  detailLines.push(`📎 Dok. Lain   : ${body.supportingDocUrl}`);
      } else if (cat === "customs") {
        if (body.customsPicName)     detailLines.push(`👤 PIC         : ${body.customsPicName}`);
        if (body.customsDocuments)   detailLines.push(`📋 Dokumen     : ${body.customsDocuments}`);
        if (body.customsProcessEta)  detailLines.push(`⏱ ETA Proses  : ${body.customsProcessEta}`);
      } else {
        const ALL_FIELDS: [string, string][] = [
          ["driverName", "Driver"], ["driverPhone", "HP Driver"], ["plateNumber", "Plat"],
          ["vehicleType", "Kendaraan"], ["pickupTime", "Pickup"], ["carrierName", "Carrier"],
          ["awbBlNumber", "AWB/BL"], ["bookingNumber", "Booking"], ["flightVessel", "Kapal/Flight"],
          ["etd", "ETD"], ["eta", "ETA"], ["stockConfirmed", "Stok"], ["qtyConfirmed", "Qty"],
          ["readyDate", "Ready Date"], ["warehouseLocation", "Lokasi Gudang"],
          ["customsPicName", "PIC Customs"], ["customsDocuments", "Dokumen Customs"],
          ["customsProcessEta", "ETA Customs"],
        ];
        for (const [key, label] of ALL_FIELDS) {
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
        `✅ *Konfirmasi & Mulai Pengiriman:*\n` +
        `Klik link berikut untuk konfirmasi langsung:\n${bizportalLink}`;

      // Bangun URL publik foto barang (jika ada)
      // Gunakan URL langsung Supabase CDN agar Fonnte bisa download tanpa proxy server
      const rawPhotoUrl = body.stockPhotoUrl as string | undefined;
      let publicPhotoUrl = "";
      if (rawPhotoUrl?.trim()) {
        if (/^https?:\/\//i.test(rawPhotoUrl)) {
          // Sudah URL penuh (mungkin sudah Supabase CDN)
          publicPhotoUrl = rawPhotoUrl;
        } else {
          // Path relatif seperti /api/storage/public-objects/${subPath}
          // → konversi ke Supabase CDN langsung agar Fonnte bisa akses
          const match = rawPhotoUrl.match(/^\/api\/storage\/public-objects\/(.+)$/);
          if (match) {
            publicPhotoUrl = objectStorage.toSupabasePublicUrl(match[1]);
          } else {
            publicPhotoUrl = `https://${domain}${rawPhotoUrl.startsWith("/") ? rawPhotoUrl : "/" + rawPhotoUrl}`;
          }
        }
      }

      sendMediaViaService(adminWa, waMsg, publicPhotoUrl).catch((e) =>
        logger.warn({ e }, "vendor-fulfillment WA to admin failed")
      );
    }

    return res.json({ ok: true, message: "Data fulfillment berhasil dikirim. Terima kasih!" });
  } catch (err) {
    logger.error({ err }, "vendor-fulfillment POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});
