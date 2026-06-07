/**
 * productFirstFlow.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Phase 2A: Product-First Shipment Flow — backend endpoints.
 *
 * Semua endpoint ini HANYA berlaku untuk orderType = "product_first".
 * Flow lama (orderType = "shipment") tidak tersentuh sama sekali.
 *
 * Endpoints:
 *   POST /:id/product-rfq             — Admin blast RFQ ke vendor produk
 *   POST /:id/select-product-vendor   — Admin pilih vendor produk
 *   POST /:id/send-product-approval   — Admin kirim approval ke customer
 *   POST /:token/customer-product-approve — PUBLIC: customer approve/reject
 *   POST /:id/select-shipment-mode    — Pilih mode pengiriman setelah produk confirmed
 *   POST /:id/shipment-rfq            — Admin blast RFQ ke shipper (dengan 422 guard)
 *
 * ATURAN:
 *  - Semua perubahan status WAJIB melalui transitionLogisticOrderStatus().
 *  - Tidak ada direct db.update pada field status.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, sql, and, inArray } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  logisticOrdersTable,
  logisticOrderRfqsTable,
  rfqVendorLinksTable,
  suppliersTable,
  vendorMiniFormLinksTable,
  customerOrderLinksTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { transitionLogisticOrderStatus } from "../lib/services/logisticOrderStatusService.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";

export const productFirstFlowRouter = Router();

// ── Inline migrations (boot-safe, idempotent) ─────────────────────────────────
db.execute(sql.raw(`
  ALTER TABLE logistic_orders
    ADD COLUMN IF NOT EXISTS product_rfq_id           INTEGER,
    ADD COLUMN IF NOT EXISTS product_vendor_id         INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS product_vendor_confirmed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS product_ready_date        TEXT,
    ADD COLUMN IF NOT EXISTS product_pickup_location   TEXT,
    ADD COLUMN IF NOT EXISTS product_qty_confirmed     NUMERIC(12,3),
    ADD COLUMN IF NOT EXISTS shipment_rfq_id           INTEGER,
    ADD COLUMN IF NOT EXISTS shipment_mode             TEXT,
    ADD COLUMN IF NOT EXISTS shipment_mode_selected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS customer_product_approval_token TEXT UNIQUE,
    ADD COLUMN IF NOT EXISTS customer_product_approved_at    TIMESTAMPTZ;

  ALTER TABLE logistic_order_rfqs
    ADD COLUMN IF NOT EXISTS rfq_type TEXT DEFAULT 'shipment',
    ADD COLUMN IF NOT EXISTS phase    TEXT DEFAULT 'shipment_phase';

  ALTER TABLE rfq_vendor_links
    ADD COLUMN IF NOT EXISTS rfq_type       TEXT,
    ADD COLUMN IF NOT EXISTS pickup_address TEXT,
    ADD COLUMN IF NOT EXISTS ready_date     TEXT,
    ADD COLUMN IF NOT EXISTS qty_confirmed  NUMERIC(12,3),
    ADD COLUMN IF NOT EXISTS qty_unit       TEXT;
`)).catch((e: unknown) => logger.warn({ e }, "productFirstFlow boot migration warn"));

// ── Helpers ───────────────────────────────────────────────────────────────────

function generateRfqNumber(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const rand = randomBytes(2).toString("hex").toUpperCase();
  return `PRFQ/${yy}${mm}${dd}/${rand}`;
}

function generateToken(): string {
  return randomBytes(24).toString("hex");
}

/** Guard: hanya untuk product_first orders */
async function requireProductFirstOrder(id: number): Promise<
  | { ok: true; order: Record<string, unknown> }
  | { ok: false; status: number; error: string }
> {
  const rows = await db.execute(sql`
    SELECT id, order_number AS "orderNumber", status, order_type AS "orderType",
           product_rfq_id AS "productRfqId",
           product_vendor_id AS "productVendorId",
           product_vendor_confirmed_at AS "productVendorConfirmedAt",
           product_ready_date AS "productReadyDate",
           product_pickup_location AS "productPickupLocation",
           product_qty_confirmed AS "productQtyConfirmed",
           shipment_rfq_id AS "shipmentRfqId",
           shipment_mode AS "shipmentMode",
           shipment_mode_selected_at AS "shipmentModeSelectedAt",
           customer_product_approval_token AS "customerProductApprovalToken",
           customer_product_approved_at AS "customerProductApprovedAt",
           phone, customer_name AS "customerName",
           commodity, origin, destination
    FROM logistic_orders WHERE id = ${id}
  `);
  const order = rows.rows[0] as Record<string, unknown> | undefined;
  if (!order) return { ok: false, status: 404, error: "Order tidak ditemukan" };
  if (order.orderType !== "product_first") {
    return {
      ok: false,
      status: 400,
      error: `Endpoint ini hanya untuk orderType="product_first". Order ini adalah "${order.orderType}".`,
    };
  }
  return { ok: true, order };
}

// ── 1. POST /:id/product-rfq ─────────────────────────────────────────────────
// Admin blast RFQ produk ke vendor-vendor produk.
// Membuat record logistic_order_rfqs (rfqType=product) + rfq_vendor_links (rfqType=product_rfq)
// + VMF links (mode=product_vendor) per vendor.
// Transisi ke "Product RFQ Sent".
productFirstFlowRouter.post("/:id/product-rfq", requireClerkUser, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ error: "ID tidak valid" });

  const { vendorIds, notes, responseDeadline, expiresInDays } = req.body as {
    vendorIds?: number[];
    notes?: string;
    responseDeadline?: string;
    expiresInDays?: number;
  };

  if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
    return res.status(400).json({ error: "vendorIds wajib diisi (min 1 vendor)" });
  }

  const guard = await requireProductFirstOrder(orderId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  const order = guard.order;

  const deadlineDate = responseDeadline ? new Date(responseDeadline) : null;
  const expireDate = expiresInDays
    ? new Date(Date.now() + expiresInDays * 86_400_000)
    : deadlineDate;

  const rfqNumber = generateRfqNumber();

  const [rfq] = await db.execute(sql`
    INSERT INTO logistic_order_rfqs
      (order_id, rfq_number, vendor_ids, notes, status, rfq_type, phase,
       response_deadline, created_at)
    VALUES
      (${orderId}, ${rfqNumber}, ${sql.raw(`'{}'::integer[]`)}, ${notes ?? null},
       'open', 'product', 'product_phase',
       ${deadlineDate?.toISOString() ?? null}, NOW())
    RETURNING id
  `);
  const rfqId = (rfq.rows[0] as { id: number }).id;

  // Update order.product_rfq_id
  await db.execute(sql`
    UPDATE logistic_orders SET product_rfq_id = ${rfqId}, updated_at = NOW()
    WHERE id = ${orderId}
  `);

  const vendors = await db
    .select({
      id: suppliersTable.id,
      name: suppliersTable.name,
      phone: suppliersTable.phone,
      contactPerson: suppliersTable.contactPerson,
    })
    .from(suppliersTable)
    .where(inArray(suppliersTable.id, vendorIds));

  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const vmfLinks: { vendorId: number; token: string; formUrl: string }[] = [];

  for (const vendor of vendors) {
    const linkToken = generateToken();
    const formUrl = `https://${domain}/vendor-form/${linkToken}`;

    // rfq_vendor_links
    await db.execute(sql`
      INSERT INTO rfq_vendor_links
        (rfq_id, vendor_id, token, status, rfq_type,
         ${expireDate ? sql.raw("expired_at,") : sql.raw("")} created_at)
      VALUES
        (${rfqId}, ${vendor.id}, ${linkToken}, 'waiting_response', 'product_rfq',
         ${expireDate ? sql.raw(`'${expireDate.toISOString()}',`) : sql.raw("")} NOW())
    `);

    // vendor_mini_form_links
    await db.execute(sql`
      INSERT INTO vendor_mini_form_links
        (token, supplier_id, service_type, mode, order_id, order_number,
         vendor_name, is_active, form_target, phase, admin_notes,
         ${expireDate ? sql.raw("expires_at,") : sql.raw("")} created_at)
      VALUES
        (${linkToken}, ${vendor.id}, 'product_vendor', 'product_vendor',
         ${orderId}, ${String(order.orderNumber ?? "")},
         ${vendor.name}, TRUE, 'vendor', 'quotation',
         ${notes ?? null},
         ${expireDate ? sql.raw(`'${expireDate.toISOString()}',`) : sql.raw("")} NOW())
    `);

    vmfLinks.push({ vendorId: vendor.id, token: linkToken, formUrl });

    // WA ke vendor produk
    if (vendor.phone) {
      const msg =
        `📦 *Permintaan Penawaran Produk*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `No RFQ   : *${rfqNumber}*\n` +
        `No Order : *${String(order.orderNumber ?? "")}*\n` +
        `Produk   : ${String(order.commodity ?? "-")}\n` +
        `Rute     : ${String(order.origin ?? "-")} → ${String(order.destination ?? "-")}\n\n` +
        `Silakan berikan penawaran harga produk, ketersediaan stok, dan tanggal siap melalui link berikut:\n` +
        `🔗 ${formUrl}\n\n` +
        (notes ? `*Catatan:* ${notes}\n\n` : "") +
        `Terima kasih atas kerja sama Anda.`;

      sendWhatsApp(vendor.phone.trim(), msg, {
        context: "product-rfq-blast",
        refType: "logistic_order",
        refId: String(orderId),
      }).catch(() => {});
    }
  }

  const tr = await transitionLogisticOrderStatus(orderId, "Product RFQ Sent", {
    actorType: "admin",
    actorId: (req as any).user?.id ?? null,
    actorName: (req as any).user?.name ?? null,
    source: "productFirstFlow:product-rfq",
    notes: `Product RFQ ${rfqNumber} dikirim ke ${vendors.length} vendor`,
  });

  if (!tr.ok) {
    return res.status(422).json({
      error: `Gagal transisi status: ${tr.error}`,
      allowedTransitions: tr.allowedTransitions,
    });
  }

  return res.status(201).json({
    rfqId,
    rfqNumber,
    vendorCount: vendors.length,
    vmfLinks,
    status: tr.toStatus,
  });
});

// ── 2. POST /:id/select-product-vendor ───────────────────────────────────────
// Admin memilih vendor produk dari penawaran yang masuk.
// Menyimpan productVendorId, productReadyDate, productPickupLocation, dll.
// Transisi ke "Product Vendor Selected".
productFirstFlowRouter.post("/:id/select-product-vendor", requireClerkUser, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ error: "ID tidak valid" });

  const { vendorId, price, readyDate, pickupLocation, qtyConfirmed, notes } = req.body as {
    vendorId?: number;
    price?: number;
    readyDate?: string;
    pickupLocation?: string;
    qtyConfirmed?: number;
    notes?: string;
  };

  if (!vendorId) return res.status(400).json({ error: "vendorId wajib diisi" });

  const guard = await requireProductFirstOrder(orderId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  const [vendor] = await db
    .select({ id: suppliersTable.id, name: suppliersTable.name })
    .from(suppliersTable)
    .where(eq(suppliersTable.id, vendorId));
  if (!vendor) return res.status(404).json({ error: "Vendor tidak ditemukan" });

  await db.execute(sql`
    UPDATE logistic_orders SET
      product_vendor_id         = ${vendorId},
      product_vendor_confirmed_at = NOW(),
      product_ready_date        = ${readyDate ?? null},
      product_pickup_location   = ${pickupLocation ?? null},
      product_qty_confirmed     = ${qtyConfirmed ?? null},
      product_price             = ${price ?? null},
      updated_at                = NOW()
    WHERE id = ${orderId}
  `);

  const tr = await transitionLogisticOrderStatus(orderId, "Product Vendor Selected", {
    actorType: "admin",
    actorId: (req as any).user?.id ?? null,
    actorName: (req as any).user?.name ?? null,
    source: "productFirstFlow:select-product-vendor",
    notes: `Vendor produk dipilih: ${vendor.name} (ID ${vendorId})${notes ? ` — ${notes}` : ""}`,
  });

  if (!tr.ok) {
    return res.status(422).json({
      error: `Gagal transisi status: ${tr.error}`,
      allowedTransitions: tr.allowedTransitions,
    });
  }

  return res.json({
    vendorId,
    vendorName: vendor.name,
    productReadyDate: readyDate ?? null,
    productPickupLocation: pickupLocation ?? null,
    status: tr.toStatus,
  });
});

// ── 3. POST /:id/send-product-approval ───────────────────────────────────────
// Admin mengirim link approval harga produk ke customer.
// Menggenerate customerProductApprovalToken dan mengirim WA ke customer.
// Transisi ke "Customer Product Approval".
productFirstFlowRouter.post("/:id/send-product-approval", requireClerkUser, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ error: "ID tidak valid" });

  const guard = await requireProductFirstOrder(orderId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  const order = guard.order;

  // Generate token (idempotent: reuse existing jika ada)
  const existingToken = order.customerProductApprovalToken as string | null;
  const approvalToken = existingToken ?? generateToken();

  if (!existingToken) {
    await db.execute(sql`
      UPDATE logistic_orders
      SET customer_product_approval_token = ${approvalToken}, updated_at = NOW()
      WHERE id = ${orderId}
    `);
  }

  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const approvalUrl = `https://${domain}/product-approve/${approvalToken}`;

  // WA ke customer
  const customerPhone = String(order.phone ?? "").trim();
  if (customerPhone) {
    const price = req.body?.sellingPrice;
    const msg =
      `✅ *Penawaran Harga Produk*\n` +
      `━━━━━━━━━━━━━━━━\n` +
      `No Order : *${String(order.orderNumber ?? "")}*\n` +
      `Produk   : ${String(order.commodity ?? "-")}\n` +
      (price ? `Harga    : Rp ${Number(price).toLocaleString("id-ID")}\n` : "") +
      (order.productReadyDate ? `Siap     : ${String(order.productReadyDate)}\n` : "") +
      (order.productPickupLocation ? `Lokasi   : ${String(order.productPickupLocation)}\n` : "") +
      `\nSilakan klik link berikut untuk menyetujui atau menolak harga produk:\n` +
      `🔗 ${approvalUrl}\n\n` +
      `Link ini berlaku selama 48 jam. Terima kasih!`;

    sendWhatsApp(customerPhone, msg, {
      context: "product-approval-send",
      refType: "logistic_order",
      refId: String(orderId),
    }).catch(() => {});
  }

  const tr = await transitionLogisticOrderStatus(orderId, "Customer Product Approval", {
    actorType: "admin",
    actorId: (req as any).user?.id ?? null,
    actorName: (req as any).user?.name ?? null,
    source: "productFirstFlow:send-product-approval",
    notes: "Link approval harga produk dikirim ke customer",
  });

  if (!tr.ok) {
    return res.status(422).json({
      error: `Gagal transisi status: ${tr.error}`,
      allowedTransitions: tr.allowedTransitions,
    });
  }

  return res.json({
    approvalToken,
    approvalUrl,
    customerPhone: customerPhone || null,
    status: tr.toStatus,
  });
});

// ── 4. POST /:token/customer-product-approve (PUBLIC) ─────────────────────────
// Customer menyetujui atau menolak harga produk via token.
// Tidak perlu auth — menggunakan token sebagai credential.
// approve → "Shipment Selection Pending"
// reject  → "Product Vendor Selected" (admin harus pilih vendor lain atau negosiasi)
productFirstFlowRouter.post("/:token/customer-product-approve", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  const { action, notes } = req.body as { action?: string; notes?: string };

  if (!action || !["approve", "reject"].includes(action)) {
    return res.status(400).json({ error: 'action wajib: "approve" atau "reject"' });
  }

  const rows = await db.execute(sql`
    SELECT id, order_number AS "orderNumber", status, order_type AS "orderType",
           customer_product_approved_at AS "customerProductApprovedAt",
           product_vendor_id AS "productVendorId"
    FROM logistic_orders
    WHERE customer_product_approval_token = ${token}
    LIMIT 1
  `);
  const order = rows.rows[0] as Record<string, unknown> | undefined;
  if (!order) return res.status(404).json({ error: "Link tidak valid atau sudah kadaluarsa" });
  if (order.orderType !== "product_first") {
    return res.status(400).json({ error: "Link ini bukan untuk product-first order" });
  }

  if (action === "approve") {
    if (order.customerProductApprovedAt) {
      return res.json({ alreadyApproved: true, status: order.status });
    }

    await db.execute(sql`
      UPDATE logistic_orders
      SET customer_product_approved_at = NOW(), updated_at = NOW()
      WHERE id = ${order.id}
    `);

    const tr = await transitionLogisticOrderStatus(order.id as number, "Shipment Selection Pending", {
      actorType: "customer",
      source: "productFirstFlow:customer-product-approve",
      notes: `Customer menyetujui harga produk${notes ? `: ${notes}` : ""}`,
    });

    if (!tr.ok) {
      return res.status(422).json({ error: `Gagal transisi status: ${tr.error}` });
    }

    return res.json({
      approved: true,
      orderNumber: order.orderNumber,
      status: tr.toStatus,
    });
  } else {
    // reject: kembalikan ke Product Vendor Selected
    const tr = await transitionLogisticOrderStatus(order.id as number, "Product Vendor Selected", {
      actorType: "customer",
      source: "productFirstFlow:customer-product-reject",
      notes: `Customer menolak harga produk${notes ? `: ${notes}` : ""}`,
    });

    if (!tr.ok) {
      return res.status(422).json({ error: `Gagal transisi status: ${tr.error}` });
    }

    return res.json({
      approved: false,
      orderNumber: order.orderNumber,
      status: tr.toStatus,
    });
  }
});

// ── 5. POST /:id/select-shipment-mode ────────────────────────────────────────
// Admin atau operator memilih mode pengiriman setelah harga produk diapprove.
// mode = "pickup_self" → transisi ke "Ready for Pickup"
// mode lainnya (trucking, air_freight, sea_freight, door_to_door)
//   → simpan shipmentMode, tetap di "Shipment Selection Pending" (admin blast shipment RFQ)
productFirstFlowRouter.post("/:id/select-shipment-mode", requireClerkUser, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ error: "ID tidak valid" });

  const { mode, notes } = req.body as {
    mode?: string;
    notes?: string;
  };

  const VALID_MODES = ["pickup_self", "trucking", "air_freight", "sea_freight", "door_to_door"];
  if (!mode || !VALID_MODES.includes(mode)) {
    return res.status(400).json({
      error: "mode tidak valid",
      validModes: VALID_MODES,
    });
  }

  const guard = await requireProductFirstOrder(orderId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });

  await db.execute(sql`
    UPDATE logistic_orders
    SET shipment_mode = ${mode},
        shipment_mode_selected_at = NOW(),
        updated_at = NOW()
    WHERE id = ${orderId}
  `);

  if (mode === "pickup_self") {
    const tr = await transitionLogisticOrderStatus(orderId, "Ready for Pickup", {
      actorType: "admin",
      actorId: (req as any).user?.id ?? null,
      actorName: (req as any).user?.name ?? null,
      source: "productFirstFlow:select-shipment-mode",
      notes: `Mode pengiriman dipilih: pickup_self${notes ? ` — ${notes}` : ""}`,
    });

    if (!tr.ok) {
      return res.status(422).json({
        error: `Gagal transisi status: ${tr.error}`,
        allowedTransitions: tr.allowedTransitions,
      });
    }

    return res.json({ shipmentMode: mode, status: tr.toStatus, readyForPickup: true });
  }

  return res.json({
    shipmentMode: mode,
    status: guard.order.status,
    message: `Mode "${mode}" disimpan. Jalankan POST /:id/shipment-rfq untuk blast RFQ ke shipper.`,
    readyForPickup: false,
  });
});

// ── 6. POST /:id/shipment-rfq ─────────────────────────────────────────────────
// Admin blast RFQ ke shipper/trucking setelah product phase selesai.
//
// GUARD (422): shipment RFQ TIDAK boleh dibuat jika:
//   - product_vendor_id belum ada
//   - customer_product_approved_at belum ada
//   - product_ready_date belum ada
//   - product_pickup_location belum ada
//
// Membuat logistic_order_rfqs (rfqType=shipment) + rfq_vendor_links + VMF links.
// Transisi ke "RFQ Sent".
productFirstFlowRouter.post("/:id/shipment-rfq", requireClerkUser, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ error: "ID tidak valid" });

  const { vendorIds, notes, responseDeadline } = req.body as {
    vendorIds?: number[];
    notes?: string;
    responseDeadline?: string;
  };

  if (!Array.isArray(vendorIds) || vendorIds.length === 0) {
    return res.status(400).json({ error: "vendorIds wajib diisi (min 1 vendor)" });
  }

  const guard = await requireProductFirstOrder(orderId);
  if (!guard.ok) return res.status(guard.status).json({ error: guard.error });
  const order = guard.order;

  // ── 422 Guard: product phase wajib lengkap ─────────────────────────────────
  const missingFields: string[] = [];
  if (!order.productVendorId) missingFields.push("product_vendor_id (vendor produk belum dipilih)");
  if (!order.customerProductApprovedAt) missingFields.push("customer_product_approved_at (customer belum approve harga produk)");
  if (!order.productReadyDate) missingFields.push("product_ready_date (tanggal siap produk belum diisi)");
  if (!order.productPickupLocation) missingFields.push("product_pickup_location (lokasi pickup produk belum diisi)");

  if (missingFields.length > 0) {
    return res.status(422).json({
      error: "Shipment RFQ tidak dapat dibuat — product phase belum lengkap",
      missingFields,
      hint: "Selesaikan product RFQ → select-product-vendor → send-product-approval → customer-product-approve terlebih dahulu",
    });
  }

  const deadlineDate = responseDeadline ? new Date(responseDeadline) : null;

  const rfqNumber = generateRfqNumber().replace("PRFQ", "SRFQ");

  const [rfq] = await db.execute(sql`
    INSERT INTO logistic_order_rfqs
      (order_id, rfq_number, vendor_ids, notes, status, rfq_type, phase,
       response_deadline, created_at)
    VALUES
      (${orderId}, ${rfqNumber}, ${sql.raw(`'{}'::integer[]`)}, ${notes ?? null},
       'open', 'shipment', 'shipment_phase',
       ${deadlineDate?.toISOString() ?? null}, NOW())
    RETURNING id
  `);
  const rfqId = (rfq.rows[0] as { id: number }).id;

  await db.execute(sql`
    UPDATE logistic_orders SET shipment_rfq_id = ${rfqId}, updated_at = NOW()
    WHERE id = ${orderId}
  `);

  const vendors = await db
    .select({
      id: suppliersTable.id,
      name: suppliersTable.name,
      phone: suppliersTable.phone,
    })
    .from(suppliersTable)
    .where(inArray(suppliersTable.id, vendorIds));

  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const vmfLinks: { vendorId: number; token: string; formUrl: string }[] = [];

  for (const vendor of vendors) {
    const linkToken = generateToken();
    const formUrl = `https://${domain}/vendor-form/${linkToken}`;

    await db.execute(sql`
      INSERT INTO rfq_vendor_links
        (rfq_id, vendor_id, token, status, rfq_type,
         ${deadlineDate ? sql.raw("expired_at,") : sql.raw("")} created_at)
      VALUES
        (${rfqId}, ${vendor.id}, ${linkToken}, 'waiting_response', 'shipment_rfq',
         ${deadlineDate ? sql.raw(`'${deadlineDate.toISOString()}',`) : sql.raw("")} NOW())
    `);

    await db.execute(sql`
      INSERT INTO vendor_mini_form_links
        (token, supplier_id, service_type, mode, order_id, order_number,
         vendor_name, is_active, form_target, phase, admin_notes,
         ${deadlineDate ? sql.raw("expires_at,") : sql.raw("")} created_at)
      VALUES
        (${linkToken}, ${vendor.id},
         ${String(order.shipmentMode ?? "trucking")}, 'order_based',
         ${orderId}, ${String(order.orderNumber ?? "")},
         ${vendor.name}, TRUE, 'vendor', 'quotation',
         ${notes ?? null},
         ${deadlineDate ? sql.raw(`'${deadlineDate.toISOString()}',`) : sql.raw("")} NOW())
    `);

    vmfLinks.push({ vendorId: vendor.id, token: linkToken, formUrl });

    if (vendor.phone) {
      const msg =
        `🚚 *Permintaan Penawaran Pengiriman*\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `No RFQ   : *${rfqNumber}*\n` +
        `No Order : *${String(order.orderNumber ?? "")}*\n` +
        `Muatan   : ${String(order.commodity ?? "-")}\n` +
        `Pickup   : ${String(order.productPickupLocation ?? "-")}\n` +
        `Tujuan   : ${String(order.destination ?? "-")}\n` +
        `Tgl Siap : ${String(order.productReadyDate ?? "-")}\n\n` +
        `Silakan berikan penawaran biaya pengiriman melalui link berikut:\n` +
        `🔗 ${formUrl}\n\n` +
        (notes ? `*Catatan:* ${notes}\n\n` : "") +
        `Terima kasih.`;

      sendWhatsApp(vendor.phone.trim(), msg, {
        context: "shipment-rfq-blast",
        refType: "logistic_order",
        refId: String(orderId),
      }).catch(() => {});
    }
  }

  const tr = await transitionLogisticOrderStatus(orderId, "RFQ Sent", {
    actorType: "admin",
    actorId: (req as any).user?.id ?? null,
    actorName: (req as any).user?.name ?? null,
    source: "productFirstFlow:shipment-rfq",
    notes: `Shipment RFQ ${rfqNumber} dikirim ke ${vendors.length} vendor`,
  });

  if (!tr.ok) {
    return res.status(422).json({
      error: `Gagal transisi status: ${tr.error}`,
      allowedTransitions: tr.allowedTransitions,
    });
  }

  return res.status(201).json({
    rfqId,
    rfqNumber,
    vendorCount: vendors.length,
    vmfLinks,
    status: tr.toStatus,
  });
});

// ── GET /:id/product-phase — ringkasan product phase untuk admin ──────────────
productFirstFlowRouter.get("/:id/product-phase", requireClerkUser, async (req: Request, res: Response) => {
  const orderId = parseInt(String(req.params.id), 10);
  if (isNaN(orderId)) return res.status(400).json({ error: "ID tidak valid" });

  const rows = await db.execute(sql`
    SELECT
      lo.id, lo.order_number AS "orderNumber", lo.status, lo.order_type AS "orderType",
      lo.product_rfq_id AS "productRfqId",
      lo.product_vendor_id AS "productVendorId",
      lo.product_vendor_confirmed_at AS "productVendorConfirmedAt",
      lo.product_ready_date AS "productReadyDate",
      lo.product_pickup_location AS "productPickupLocation",
      lo.product_qty_confirmed AS "productQtyConfirmed",
      lo.product_price AS "productPrice",
      lo.shipment_rfq_id AS "shipmentRfqId",
      lo.shipment_mode AS "shipmentMode",
      lo.shipment_mode_selected_at AS "shipmentModeSelectedAt",
      lo.customer_product_approval_token AS "customerProductApprovalToken",
      lo.customer_product_approved_at AS "customerProductApprovedAt",
      s.name AS "productVendorName"
    FROM logistic_orders lo
    LEFT JOIN suppliers s ON s.id = lo.product_vendor_id
    WHERE lo.id = ${orderId}
  `);

  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Order tidak ditemukan" });

  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const approvalUrl = row.customerProductApprovalToken
    ? `https://${domain}/product-approve/${row.customerProductApprovalToken}`
    : null;

  const guardFields = {
    hasProductVendor: !!row.productVendorId,
    hasCustomerApproval: !!row.customerProductApprovedAt,
    hasProductReadyDate: !!row.productReadyDate,
    hasProductPickupLocation: !!row.productPickupLocation,
  };
  const shipmentRfqReady = Object.values(guardFields).every(Boolean);

  return res.json({
    ...row,
    approvalUrl,
    shipmentRfqReady,
    guardFields,
  });
});
