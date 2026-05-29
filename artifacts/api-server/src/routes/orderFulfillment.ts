/**
 * Order Fulfillment Flow
 * - Admin: POST /api/logistic/orders/:orderId/send-fulfillment  → kirim form ke vendor
 * - Admin: GET  /api/logistic/orders/:orderId/fulfillment        → lihat data fulfillment
 * - Public: GET  /api/fulfillment/:token                         → ambil form info
 * - Public: POST /api/fulfillment/:token                         → vendor submit
 */
import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, desc, sql } from "drizzle-orm";
import {
  db,
  logisticOrdersTable,
  suppliersTable,
  orderFulfillmentLinksTable,
  orderFulfillmentSubmissionsTable,
  orderUpdatesTable,
  vendorFulfillmentLinksTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminWa } from "../lib/adminWa.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";
import { resolveServiceCategory } from "@workspace/logistics-constants";

// ─────────────────────────────────────────────────────────────────────────────
// Migration (idempotent)
// ─────────────────────────────────────────────────────────────────────────────

export async function runOrderFulfillmentMigration() {
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS order_fulfillment_links (
        id          SERIAL PRIMARY KEY,
        order_id    INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        vendor_id   INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
        service_type TEXT NOT NULL,
        token       TEXT NOT NULL UNIQUE,
        status      TEXT NOT NULL DEFAULT 'pending',
        sent_at     TIMESTAMPTZ,
        expires_at  TIMESTAMPTZ,
        submitted_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS order_fulfillment_submissions (
        id           SERIAL PRIMARY KEY,
        link_id      INTEGER NOT NULL REFERENCES order_fulfillment_links(id) ON DELETE CASCADE,
        order_id     INTEGER NOT NULL REFERENCES logistic_orders(id) ON DELETE CASCADE,
        service_type TEXT NOT NULL,
        fulfillment_data JSONB NOT NULL,
        submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS ofl_order_idx ON order_fulfillment_links(order_id);
      CREATE INDEX IF NOT EXISTS ofl_token_idx ON order_fulfillment_links(token);
      CREATE INDEX IF NOT EXISTS ofs_order_idx ON order_fulfillment_submissions(order_id);
      CREATE INDEX IF NOT EXISTS ofs_link_idx  ON order_fulfillment_submissions(link_id);
    `);
    logger.info("Order fulfillment migration: ok");
  } catch (err) {
    logger.warn({ err }, "Order fulfillment migration warn");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const tok = () => randomBytes(24).toString("hex");

function getBaseUrl(): string {
  const d = getPreferredDomain();
  return d ? `https://${d}` : "";
}

/** Field definitions per category */
const FIELD_DEFS: Record<string, { key: string; label: string; type: "text" | "textarea" | "datetime-local"; required: boolean; placeholder?: string }[]> = {
  trucking: [
    { key: "driver_name",      label: "Nama Driver",             type: "text",           required: true,  placeholder: "Nama lengkap driver" },
    { key: "driver_phone",     label: "No. HP Driver",           type: "text",           required: true,  placeholder: "Contoh: 0812xxxx" },
    { key: "vehicle_plate",    label: "Plat Nomor Kendaraan",    type: "text",           required: true,  placeholder: "Contoh: B 1234 XYZ" },
    { key: "vehicle_type",     label: "Jenis Kendaraan",         type: "text",           required: true,  placeholder: "Contoh: CDE / Fuso / Engkel" },
    { key: "pickup_time",      label: "Waktu Pickup",            type: "datetime-local", required: true },
    { key: "operational_note", label: "Catatan Operasional",     type: "textarea",       required: false, placeholder: "Instruksi khusus, kendala, dll." },
  ],
  freight: [
    { key: "carrier_name",    label: "Nama Carrier / Maskapai", type: "text",           required: true,  placeholder: "Contoh: Garuda Cargo, Salam Pacific" },
    { key: "booking_number",  label: "Nomor Booking",           type: "text",           required: true,  placeholder: "Nomor booking dari carrier" },
    { key: "awb_or_bl_number",label: "AWB / BL Number",         type: "text",           required: false, placeholder: "Air Waybill atau Bill of Lading" },
    { key: "etd",             label: "ETD (Tgl Keberangkatan)", type: "datetime-local", required: true },
    { key: "eta",             label: "ETA (Tgl Tiba)",          type: "datetime-local", required: true },
    { key: "cutoff_time",     label: "Cutoff Time",             type: "datetime-local", required: false },
    { key: "operational_note",label: "Catatan Operasional",     type: "textarea",       required: false, placeholder: "Informasi tambahan dari carrier..." },
  ],
  product: [
    { key: "stock_available",  label: "Stok Tersedia",           type: "text",     required: true,  placeholder: "Jumlah stok yang bisa dipenuhi" },
    { key: "confirmed_qty",    label: "Qty Dikonfirmasi",        type: "text",     required: true,  placeholder: "Jumlah yang akan dikirim" },
    { key: "ready_date",       label: "Tanggal Siap Kirim",      type: "text",     required: true,  placeholder: "Contoh: 28 Mei 2026" },
    { key: "source_warehouse", label: "Gudang Asal",             type: "text",     required: true,  placeholder: "Nama / lokasi gudang" },
    { key: "batch_or_serial",  label: "Batch / Serial Number",   type: "text",     required: false, placeholder: "Nomor batch atau serial" },
    { key: "delivery_note",    label: "Catatan Pengiriman",      type: "textarea", required: false, placeholder: "Instruksi packing, SLA, dll." },
  ],
  customs: [
    { key: "pic_name",          label: "Nama PIC",                type: "text",     required: true,  placeholder: "Nama penanggung jawab proses" },
    { key: "pic_phone",         label: "No. HP PIC",              type: "text",     required: true,  placeholder: "Contoh: 0812xxxx" },
    { key: "required_documents",label: "Dokumen yang Diperlukan", type: "textarea", required: true,  placeholder: "Invoice, Packing List, COO, dll." },
    { key: "process_eta",       label: "Estimasi Selesai Proses", type: "text",     required: true,  placeholder: "Contoh: 3–5 hari kerja" },
    { key: "clearance_note",    label: "Catatan Customs",         type: "textarea", required: false, placeholder: "Hambatan dokumen, catatan HS code, dll." },
  ],
};

const CATEGORY_LABELS: Record<string, string> = {
  trucking: "Trucking",
  freight: "Freight (Sea/Air)",
  product: "Produk / Barang",
  customs: "Customs / Handling",
};

// ─────────────────────────────────────────────────────────────────────────────
// Admin Router  (mounted under /api/logistic)
// ─────────────────────────────────────────────────────────────────────────────

export const fulfillmentAdminRouter = Router();

// POST /api/logistic/orders/:orderId/send-fulfillment
fulfillmentAdminRouter.post("/orders/:orderId/send-fulfillment", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const { expiresInDays, customNote } = req.body as { expiresInDays?: number; customNote?: string };

  try {
    const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    const vendor = order.approvedVendorId
      ? (await db.select().from(suppliersTable).where(eq(suppliersTable.id, order.approvedVendorId)))[0] ?? null
      : null;

    const category = resolveServiceCategory(order.shipmentType);
    const token = tok();
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : new Date(Date.now() + 7 * 86_400_000);

    const [link] = await db.insert(orderFulfillmentLinksTable).values({
      orderId,
      vendorId: vendor?.id ?? null,
      serviceType: category,
      token,
      status: "pending",
      sentAt: new Date(),
      expiresAt,
    }).returning();

    // Log activity
    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorName: "Admin",
      status: "Processing",
      notes: `Form fulfillment dikirim ke vendor${vendor ? ` (${vendor.name})` : ""}. Tipe: ${CATEGORY_LABELS[category] ?? category}.`,
      isPublic: false,
    });

    // Update order status to Processing
    await db.update(logisticOrdersTable).set({ status: "Processing" }).where(eq(logisticOrdersTable.id, orderId));

    const formUrl = `${getBaseUrl()}/fulfillment/${token}`;

    // Send WA to vendor
    const vendorPhone = vendor?.phone ?? null;
    if (vendorPhone) {
      const waMsg =
        `📋 *Form Fulfillment Order — CST Logistics*\n\n` +
        `Order: *${order.orderNumber}*\n` +
        `Layanan: ${order.shipmentType}\n` +
        `Rute: ${order.origin} → ${order.destination}\n` +
        (customNote ? `\nCatatan: ${customNote}\n` : "") +
        `\nSilakan isi form fulfillment melalui link berikut:\n${formUrl}\n\n` +
        `_Link berlaku hingga ${expiresAt.toLocaleDateString("id-ID")}._`;
      sendWhatsApp(vendorPhone, waMsg).catch((e) =>
        logger.warn({ e }, "fulfillment WA to vendor failed")
      );
    }

    logger.info({ orderId, token, category }, "Fulfillment form sent");
    return res.status(201).json({
      ok: true, token, formUrl, link,
      vendorPhone, category,
    });
  } catch (err) {
    logger.error({ err }, "send-fulfillment error");
    return res.status(500).json({ message: "Gagal mengirim form fulfillment" });
  }
});

// ─── Helper: extract display data from vendor_fulfillment_links row ───────────
const VF_FIELD_KEYS = [
  "stockConfirmed", "qtyConfirmed", "readyDate", "leadTime", "warehouseLocation",
  "priceConfirmed", "revisedPrice", "driverName", "driverPhone", "plateNumber",
  "vehicleType", "pickupTime", "carrierName", "awbBlNumber", "flightVessel",
  "bookingNumber", "etd", "eta", "customsPicName", "customsDocuments",
  "customsProcessEta", "stockPhotoUrl", "invoiceUrl", "supportingDocUrl", "notes",
] as const;

function extractVfData(l: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of VF_FIELD_KEYS) {
    const v = l[k];
    if (v != null && v !== "") out[k] = String(v);
  }
  return out;
}

// Offset to avoid ID collision between old (order_fulfillment_links) and new (vendor_fulfillment_links)
const VF_ID_OFFSET = 10_000_000;

// GET /api/logistic/orders/:orderId/fulfillment
fulfillmentAdminRouter.get("/orders/:orderId/fulfillment", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  try {
    const [oldLinks, oldSubs, vfLinks] = await Promise.all([
      db.select().from(orderFulfillmentLinksTable)
        .where(eq(orderFulfillmentLinksTable.orderId, orderId))
        .orderBy(desc(orderFulfillmentLinksTable.createdAt)),
      db.select().from(orderFulfillmentSubmissionsTable)
        .where(eq(orderFulfillmentSubmissionsTable.orderId, orderId))
        .orderBy(desc(orderFulfillmentSubmissionsTable.createdAt)),
      db.select().from(vendorFulfillmentLinksTable)
        .where(eq(vendorFulfillmentLinksTable.orderId, orderId))
        .orderBy(desc(vendorFulfillmentLinksTable.createdAt)),
    ]);

    const base = getBaseUrl();

    const mergedLinks = [
      ...oldLinks.map(l => ({ ...l, formUrl: `${base}/fulfillment/${l.token}` })),
      ...vfLinks.map(l => ({
        id: VF_ID_OFFSET + l.id,
        orderId: l.orderId,
        vendorId: l.vendorId ?? null,
        serviceType: l.serviceType,
        token: l.token,
        status: l.status,
        sentAt: null,
        expiresAt: l.expiresAt?.toISOString() ?? null,
        submittedAt: l.submittedAt?.toISOString() ?? null,
        createdAt: (l.createdAt as Date | null)?.toISOString() ?? null,
        formUrl: `${base}/vendor-fulfillment/${l.token}`,
      })),
    ];

    const mergedSubs = [
      ...oldSubs,
      ...vfLinks
        .filter(l => l.status === "submitted")
        .map(l => ({
          id: VF_ID_OFFSET + l.id,
          linkId: VF_ID_OFFSET + l.id,
          orderId: l.orderId,
          serviceType: l.serviceType,
          fulfillmentData: extractVfData(l as unknown as Record<string, unknown>),
          submittedAt: l.submittedAt?.toISOString() ?? new Date().toISOString(),
          createdAt: l.submittedAt?.toISOString() ?? null,
        })),
    ];

    return res.json({ links: mergedLinks, submissions: mergedSubs });
  } catch (err) {
    logger.error({ err }, "get-fulfillment error");
    return res.status(500).json({ message: "Gagal memuat data fulfillment" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Public Router  (mounted under /api/fulfillment)
// ─────────────────────────────────────────────────────────────────────────────

export const fulfillmentPublicRouter = Router();

// GET /api/fulfillment/:token
fulfillmentPublicRouter.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  try {
    const [link] = await db.select().from(orderFulfillmentLinksTable)
      .where(eq(orderFulfillmentLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak aktif." });

    const isExpired = link.expiresAt && link.expiresAt < new Date();
    if (isExpired) return res.status(410).json({ error: "Link ini sudah kedaluwarsa." });

    if (link.status === "submitted") {
      return res.status(409).json({ error: "Form ini sudah pernah disubmit. Terima kasih!" });
    }

    const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, link.orderId));
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan." });

    const vendor = link.vendorId
      ? (await db.select({ id: suppliersTable.id, name: suppliersTable.name })
          .from(suppliersTable).where(eq(suppliersTable.id, link.vendorId)))[0] ?? null
      : null;

    const fields = FIELD_DEFS[resolveServiceCategory(link.serviceType)];

    return res.json({
      token,
      orderId: order.id,
      orderNumber: order.orderNumber,
      shipmentType: order.shipmentType,
      origin: order.origin,
      destination: order.destination,
      commodity: order.commodity ?? null,
      cargoDescription: order.cargoDescription ?? null,
      grossWeight: order.grossWeight ?? null,
      expiresAt: link.expiresAt?.toISOString() ?? null,
      serviceType: link.serviceType,
      categoryLabel: CATEGORY_LABELS[link.serviceType] ?? link.serviceType,
      vendorName: vendor?.name ?? null,
      fields,
    });
  } catch (err) {
    logger.error({ err }, "get-fulfillment-form error");
    return res.status(500).json({ error: "Terjadi kesalahan server." });
  }
});

// POST /api/fulfillment/:token
fulfillmentPublicRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  const body = req.body as Record<string, unknown>;

  try {
    const [link] = await db.select().from(orderFulfillmentLinksTable)
      .where(eq(orderFulfillmentLinksTable.token, token));
    if (!link) return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak aktif." });

    const isExpired = link.expiresAt && link.expiresAt < new Date();
    if (isExpired) return res.status(410).json({ error: "Link sudah kedaluwarsa." });

    if (link.status === "submitted") {
      return res.status(409).json({ error: "Form ini sudah pernah disubmit." });
    }

    const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, link.orderId));
    if (!order) return res.status(404).json({ error: "Order tidak ditemukan." });

    // Validate required fields
    const fields = FIELD_DEFS[resolveServiceCategory(link.serviceType)];
    const missing = fields.filter(f => f.required && !String(body[f.key] ?? "").trim());
    if (missing.length > 0) {
      return res.status(400).json({ error: `Field wajib belum diisi: ${missing.map(f => f.label).join(", ")}` });
    }

    // Save submission
    const now = new Date();
    await db.insert(orderFulfillmentSubmissionsTable).values({
      linkId: link.id,
      orderId: link.orderId,
      serviceType: link.serviceType,
      fulfillmentData: body as object,
    });

    // Mark link as submitted
    await db.update(orderFulfillmentLinksTable)
      .set({ status: "submitted", submittedAt: now })
      .where(eq(orderFulfillmentLinksTable.token, token));

    // Update order status → Vendor Confirmed
    await db.update(logisticOrdersTable)
      .set({ status: "Vendor Confirmed" })
      .where(eq(logisticOrdersTable.id, link.orderId));

    // Activity log
    const summaryLines = fields
      .map(f => `${f.label}: ${String(body[f.key] ?? "").trim() || "—"}`)
      .join("\n");

    await db.insert(orderUpdatesTable).values({
      orderId: link.orderId,
      actorType: "vendor",
      actorName: "Vendor",
      status: "Vendor Confirmed",
      notes: `Vendor mengisi form fulfillment.\n\n${summaryLines}`,
      isPublic: true,
    });

    // Notify admin via WA
    const adminWa = await getAdminWa();
    if (adminWa) {
      const adminLink = `${getBaseUrl()}/bizportal/logistics/orders/${link.orderId}`;
      const waMsg =
        `✅ *Vendor Mengisi Form Fulfillment*\n\n` +
        `Order: *${order.orderNumber}*\n` +
        `Rute: ${order.origin} → ${order.destination}\n` +
        `Tipe: ${CATEGORY_LABELS[link.serviceType] ?? link.serviceType}\n\n` +
        `Ringkasan:\n${summaryLines}\n\n` +
        `Lihat order: ${adminLink}`;
      sendWhatsApp(adminWa, waMsg).catch((e) =>
        logger.warn({ e }, "fulfillment WA to admin failed")
      );
    }

    logger.info({ orderId: link.orderId, token }, "Fulfillment submitted by vendor");
    return res.status(201).json({ ok: true, message: "Data berhasil disimpan. Terima kasih!" });
  } catch (err) {
    logger.error({ err }, "submit-fulfillment error");
    return res.status(500).json({ error: "Terjadi kesalahan server. Coba lagi." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Konfirmasi fulfillment → In Progress + WA ke customer
// POST /api/logistic/orders/:orderId/confirm-fulfillment
// ─────────────────────────────────────────────────────────────────────────────

fulfillmentAdminRouter.post("/orders/:orderId/confirm-fulfillment", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  try {
    const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    const allowedStatuses = ["Vendor Confirmed", "Processing", "Customer Approved"];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({ message: `Status saat ini "${order.status}" tidak bisa dikonfirmasi.` });
    }

    // Ambil submission terbaru: cek old system dulu, lalu vendor_fulfillment_links (new system)
    const [latestOldSub] = await db.select()
      .from(orderFulfillmentSubmissionsTable)
      .where(eq(orderFulfillmentSubmissionsTable.orderId, orderId))
      .orderBy(desc(orderFulfillmentSubmissionsTable.createdAt))
      .limit(1);
    const [latestVfLink] = await db.select()
      .from(vendorFulfillmentLinksTable)
      .where(eq(vendorFulfillmentLinksTable.orderId, orderId))
      .orderBy(desc(vendorFulfillmentLinksTable.createdAt))
      .limit(1);
    const latestSub = latestOldSub ?? null;
    // For WA detail lines, merge both sources
    const vfFulfillmentData = latestVfLink?.status === "submitted"
      ? extractVfData(latestVfLink as unknown as Record<string, unknown>)
      : null;

    await db.update(logisticOrdersTable)
      .set({ status: "In Progress" })
      .where(eq(logisticOrdersTable.id, orderId));

    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorName: "Admin",
      status: "In Progress",
      notes: "Admin mengkonfirmasi data fulfillment. Order sedang diproses / dalam perjalanan.",
      isPublic: true,
    });

    // Kirim WA ke customer
    const customerPhone = order.phone?.trim();
    if (customerPhone) {
      const domain = getBaseUrl();
      let detailLines = "";
      const FIELD_LABELS: Record<string, string> = {
        driver_name: "Driver", driverName: "Driver",
        driver_phone: "HP Driver", driverPhone: "HP Driver",
        vehicle_plate: "Plat Nomor", plateNumber: "Plat Nomor",
        vehicle_type: "Jenis Kendaraan", vehicleType: "Jenis Kendaraan",
        pickup_time: "Waktu Pickup", pickupTime: "Waktu Pickup",
        carrier_name: "Carrier", carrierName: "Carrier",
        booking_number: "Nomor Booking", bookingNumber: "Nomor Booking",
        awb_or_bl_number: "AWB / BL", awbBlNumber: "AWB / BL",
        etd: "ETD", eta: "ETA",
        ready_date: "Siap Kirim", readyDate: "Siap Kirim",
        source_warehouse: "Gudang Asal", warehouseLocation: "Gudang Asal",
        operational_note: "Catatan", notes: "Catatan",
        stockConfirmed: "Status Stok", qtyConfirmed: "Qty Dipenuhi",
        leadTime: "Lead Time", priceConfirmed: "Konfirmasi Harga",
        revisedPrice: "Harga Revisi",
      };
      const fdSource: Record<string, string> = {
        ...(latestSub?.fulfillmentData as Record<string, string> ?? {}),
        ...(vfFulfillmentData ?? {}),
      };
      if (Object.keys(fdSource).length > 0) {
        const lines = Object.entries(fdSource)
          .filter(([, v]) => v?.trim() && !v.startsWith("http"))
          .map(([k, v]) => `  • ${FIELD_LABELS[k] ?? k.replace(/_/g, " ")}: ${v}`)
          .join("\n");
        if (lines) detailLines = `\n\nDetail operasional:\n${lines}`;
      }
      const trackUrl = domain ? `\n\nCek status order: ${domain}/track` : "";
      const waMsg =
        `🚀 *Order Anda Sedang Diproses — CST Logistics*\n\n` +
        `Halo ${order.customerName},\n\n` +
        `Order *${order.orderNumber}* (${order.shipmentType}) sedang dalam proses pengiriman.\n` +
        `Rute: ${order.origin} → ${order.destination}` +
        detailLines +
        trackUrl;
      sendWhatsApp(customerPhone, waMsg).catch((e) =>
        logger.warn({ e }, "confirm-fulfillment WA to customer failed")
      );
    }

    logger.info({ orderId }, "Fulfillment confirmed → In Progress");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "confirm-fulfillment error");
    return res.status(500).json({ message: "Gagal konfirmasi fulfillment" });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Admin: Selesaikan order → Completed + WA ke customer
// POST /api/logistic/orders/:orderId/complete-order
// ─────────────────────────────────────────────────────────────────────────────

fulfillmentAdminRouter.post("/orders/:orderId/complete-order", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const { note } = req.body as { note?: string };

  try {
    const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
    if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

    const allowedStatuses = ["In Progress", "Vendor Confirmed", "Processing"];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({ message: `Status saat ini "${order.status}" tidak bisa diselesaikan dari sini.` });
    }

    await db.update(logisticOrdersTable)
      .set({ status: "Completed" })
      .where(eq(logisticOrdersTable.id, orderId));

    await db.insert(orderUpdatesTable).values({
      orderId,
      actorType: "admin",
      actorName: "Admin",
      status: "Completed",
      notes: note?.trim()
        ? `Order diselesaikan oleh admin. Catatan: ${note.trim()}`
        : "Order telah diselesaikan oleh admin.",
      isPublic: true,
    });

    // WA ke customer
    const customerPhone = order.phone?.trim();
    if (customerPhone) {
      const waMsg =
        `✅ *Order Selesai — CST Logistics*\n\n` +
        `Halo ${order.customerName},\n\n` +
        `Order *${order.orderNumber}* (${order.shipmentType}) telah *diselesaikan*.\n` +
        `Rute: ${order.origin} → ${order.destination}\n\n` +
        (note?.trim() ? `Catatan: ${note.trim()}\n\n` : "") +
        `Terima kasih telah mempercayakan pengiriman Anda kepada CST Logistics! 🙏`;
      sendWhatsApp(customerPhone, waMsg).catch((e) =>
        logger.warn({ e }, "complete-order WA to customer failed")
      );
    }

    logger.info({ orderId }, "Order completed by admin");
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "complete-order error");
    return res.status(500).json({ message: "Gagal menyelesaikan order" });
  }
});
