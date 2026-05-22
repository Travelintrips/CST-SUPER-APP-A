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
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { sendWhatsApp } from "../lib/fonnte.js";
import { getAdminWa } from "../lib/adminWa.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";

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

/** Normalize shipmentType → fulfillment category */
function resolveCategory(shipmentType: string): "trucking" | "freight" | "product" | "customs" {
  const t = shipmentType.toLowerCase();
  if (t.includes("truck") || t.includes("trucking")) return "trucking";
  if (t.includes("sea") || t.includes("air") || t.includes("freight")) return "freight";
  if (t.includes("product") || t.includes("barang")) return "product";
  if (t.includes("custom") || t.includes("ppjk") || t.includes("handling") || t.includes("bea cukai")) return "customs";
  return "freight"; // fallback
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

    const category = resolveCategory(order.shipmentType);
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

// GET /api/logistic/orders/:orderId/fulfillment
fulfillmentAdminRouter.get("/orders/:orderId/fulfillment", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  try {
    const links = await db.select().from(orderFulfillmentLinksTable)
      .where(eq(orderFulfillmentLinksTable.orderId, orderId))
      .orderBy(desc(orderFulfillmentLinksTable.createdAt));

    const submissions = await db.select().from(orderFulfillmentSubmissionsTable)
      .where(eq(orderFulfillmentSubmissionsTable.orderId, orderId))
      .orderBy(desc(orderFulfillmentSubmissionsTable.createdAt));

    const base = getBaseUrl();
    return res.json({
      links: links.map(l => ({ ...l, formUrl: `${base}/fulfillment/${l.token}` })),
      submissions,
    });
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

    const fields = FIELD_DEFS[link.serviceType] ?? FIELD_DEFS["freight"];

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
    const fields = FIELD_DEFS[link.serviceType] ?? FIELD_DEFS["freight"];
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
