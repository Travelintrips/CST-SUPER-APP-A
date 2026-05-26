import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  portalProductOrdersTable,
  portalProductOrderItemsTable,
  productsTable,
} from "@workspace/db";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { getPreferredDomain } from "../lib/domain";
import { sendProductOrderWaNotification } from "../lib/orderNotification";
import { sendMail, isSmtpConfigured } from "../lib/mailer";
import { logger } from "../lib/logger";
import { saveAndBroadcast } from "../lib/notificationStore";
import { broadcastToAdmins } from "../lib/sseManager";
import { signVendorResponseToken, verifyVendorResponseToken } from "../lib/vendorResponseToken.js";

export const portalProductOrdersRouter = Router();

db.execute(sql`
  CREATE TABLE IF NOT EXISTS portal_product_vendor_responses (
    id SERIAL PRIMARY KEY,
    order_number TEXT NOT NULL,
    order_id INTEGER,
    vendor_name TEXT,
    status TEXT NOT NULL,
    quoted_price NUMERIC(14, 2),
    notes TEXT,
    submitted_at TIMESTAMP DEFAULT NOW() NOT NULL
  )
`).catch(() => {});

function generateOrderNumber(): string {
  const date = new Date();
  const y = date.getFullYear().toString().slice(-2);
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `PRD-${y}${m}${d}-${rand}`;
}

function toOrder(row: typeof portalProductOrdersTable.$inferSelect) {
  return {
    id: row.id,
    orderNumber: row.orderNumber,
    customerName: row.customerName,
    email: row.email,
    phone: row.phone,
    shippingAddress: row.shippingAddress,
    notes: row.notes ?? null,
    subtotal: parseFloat(row.subtotal),
    grandTotal: parseFloat(row.grandTotal),
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  };
}

function toItem(row: typeof portalProductOrderItemsTable.$inferSelect) {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId ?? null,
    productName: row.productName,
    productSku: row.productSku ?? null,
    unit: row.unit ?? null,
    unitPrice: parseFloat(row.unitPrice),
    qty: row.qty,
    subtotal: parseFloat(row.subtotal),
    createdAt: row.createdAt.toISOString(),
  };
}

function formatRupiah(amount: number): string {
  return amount.toLocaleString("id-ID");
}

async function sendProductOrderNotification(order: ReturnType<typeof toOrder>, items: ReturnType<typeof toItem>[]) {
  const domain = getPreferredDomain();
  const orderUrl = domain ? `https://${domain}/bizportal/logistics/portal-orders` : undefined;
  const vendorToken = signVendorResponseToken(order.orderNumber);
  const vendorFormUrl = domain ? `https://${domain}/vendor-product-approval/${order.orderNumber}?t=${vendorToken}` : undefined;

  sendProductOrderWaNotification({
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    email: order.email,
    phone: order.phone,
    shippingAddress: order.shippingAddress,
    notes: order.notes ?? null,
    grandTotal: order.grandTotal,
    items: items.map((i) => ({
      productName: i.productName,
      qty: i.qty,
      unit: i.unit,
      subtotal: i.subtotal,
    })),
    orderUrl,
    vendorFormUrl,
  }).catch((err: unknown) => logger.error({ err }, "WA product order notification failed"));

  if (isSmtpConfigured() && order.email) {
    sendMail({
      to: order.email,
      subject: `Pesanan Anda Diterima — ${order.orderNumber}`,
      text: `Terima kasih atas pesanan Anda! No. Order: ${order.orderNumber}`,
      html: `<h2>Terima kasih atas pesanan Anda!</h2>
<p><strong>No. Order:</strong> ${order.orderNumber}</p>
<table border="1" cellpadding="6" cellspacing="0">
  <tr><th>Produk</th><th>Qty</th><th>Satuan</th><th>Harga</th></tr>
  ${items.map((i) => `<tr><td>${i.productName}</td><td>${i.qty}</td><td>${i.unit ?? "pcs"}</td><td>Rp ${formatRupiah(i.subtotal)}</td></tr>`).join("")}
</table>
<p><strong>Total: Rp ${formatRupiah(order.grandTotal)}</strong></p>
<p>Alamat pengiriman: ${order.shippingAddress}</p>
${order.notes ? `<p>Catatan: ${order.notes}</p>` : ""}
<p>Tim kami akan segera menghubungi Anda.</p>`,
    }).catch(() => undefined);
  }
}

// GET /api/portal-product/products — list active products (public)
portalProductOrdersRouter.get("/products", async (req: Request, res: Response) => {
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : null;
  const subcategory = typeof req.query["subcategory"] === "string" ? req.query["subcategory"].trim() : null;

  const conds = [eq(productsTable.isActive, true), eq(productsTable.itemType, "barang")];
  if (search) conds.push(or(ilike(productsTable.name, `%${search}%`), ilike(productsTable.sku, `%${search}%`))!);
  if (subcategory) conds.push(eq(productsTable.subcategory, subcategory));

  const rows = await db
    .select()
    .from(productsTable)
    .where(and(...conds))
    .orderBy(productsTable.name);

  return res.json(rows.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    price: parseFloat(String(p.price ?? "0")),
    unit: p.unit ?? null,
    description: p.description ?? null,
    imageUrl: p.imageUrl ?? null,
    subcategory: p.subcategory ?? null,
    stock: p.stock ?? 0,
  })));
});

// POST /api/portal-product/orders — create order (public)
portalProductOrdersRouter.post("/orders", async (req: Request, res: Response) => {
  const { customerName, email, phone, shippingAddress, notes, items } = req.body as {
    customerName?: string;
    email?: string;
    phone?: string;
    shippingAddress?: string;
    notes?: string;
    items?: { productId?: number; productName: string; productSku?: string; unit?: string; unitPrice: number; qty: number; subtotal: number }[];
  };

  if (!customerName?.trim() || !email?.trim() || !phone?.trim() || !shippingAddress?.trim()) {
    return res.status(400).json({ message: "customerName, email, phone, shippingAddress wajib diisi" });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "Minimal satu produk harus dipilih" });
  }

  const subtotal = items.reduce((s, i) => s + (i.subtotal ?? 0), 0);
  const grandTotal = subtotal;
  const orderNumber = generateOrderNumber();

  const [order] = await db
    .insert(portalProductOrdersTable)
    .values({
      orderNumber,
      customerName: customerName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      shippingAddress: shippingAddress.trim(),
      notes: notes?.trim() ?? null,
      subtotal: String(subtotal),
      grandTotal: String(grandTotal),
      status: "New Order",
    })
    .returning();

  const itemRows = items.map((i) => ({
    orderId: order.id,
    productId: i.productId ?? null,
    productName: i.productName,
    productSku: i.productSku ?? null,
    unit: i.unit ?? null,
    unitPrice: String(i.unitPrice),
    qty: i.qty,
    subtotal: String(i.subtotal),
  }));

  const insertedItems = await db
    .insert(portalProductOrderItemsTable)
    .values(itemRows)
    .returning();

  const orderOut = toOrder(order);
  const itemsOut = insertedItems.map(toItem);

  // Real-time SSE: notify BizPortal admins immediately (persisted to DB)
  saveAndBroadcast("new_order", {
    type: "product",
    orderId: order.id,
    orderNumber,
    customerName: customerName.trim(),
    companyName: null,
    grandTotal: grandTotal,
    itemCount: items.length,
    createdAt: (order.createdAt as Date).toISOString(),
  }).catch(() => {});

  sendProductOrderNotification(orderOut, itemsOut).catch((err: unknown) => {
    req.log.error({ err }, "sendProductOrderNotification failed");
  });

  return res.status(201).json({ ...orderOut, items: itemsOut });
});

// GET /api/portal-product/orders — list orders (admin)
portalProductOrdersRouter.get("/orders", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const status = typeof req.query["status"] === "string" ? req.query["status"] : null;
  const search = typeof req.query["search"] === "string" ? req.query["search"].trim() : null;

  const conds = [];
  if (status) conds.push(eq(portalProductOrdersTable.status, status));
  if (search) {
    conds.push(
      or(
        ilike(portalProductOrdersTable.customerName, `%${search}%`),
        ilike(portalProductOrdersTable.orderNumber, `%${search}%`),
        ilike(portalProductOrdersTable.email, `%${search}%`)
      )!
    );
  }

  const rows = conds.length > 0
    ? await db.select().from(portalProductOrdersTable).where(and(...conds)).orderBy(sql`${portalProductOrdersTable.createdAt} DESC`)
    : await db.select().from(portalProductOrdersTable).orderBy(sql`${portalProductOrdersTable.createdAt} DESC`);

  return res.json(rows.map(toOrder));
});

// DELETE /api/portal-product/orders/:id — delete order (admin)
portalProductOrdersRouter.delete("/orders/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const [deleted] = await db
    .delete(portalProductOrdersTable)
    .where(eq(portalProductOrdersTable.id, id))
    .returning();

  if (!deleted) return res.status(404).json({ message: "Order tidak ditemukan" });
  return res.json({ message: "Order berhasil dihapus", id });
});

// PATCH /api/portal-product/orders/items/:itemId/link — re-link item to master product (admin)
portalProductOrdersRouter.patch("/orders/items/:itemId/link", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const itemId = parseInt(String(req.params.itemId), 10);
  if (isNaN(itemId)) return res.status(400).json({ message: "Item ID tidak valid" });

  const { productId } = req.body as { productId?: number };
  if (!productId) return res.status(400).json({ message: "productId wajib diisi" });

  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, productId));
  if (!product) return res.status(404).json({ message: "Produk tidak ditemukan" });

  const [updated] = await db
    .update(portalProductOrderItemsTable)
    .set({
      productId: product.id,
      productName: product.name,
      productSku: product.sku ?? null,
      unit: product.unit ?? null,
    })
    .where(eq(portalProductOrderItemsTable.id, itemId))
    .returning();

  if (!updated) return res.status(404).json({ message: "Item tidak ditemukan" });
  return res.json(toItem(updated));
});

// GET /api/portal-product/orders/:id — get order detail (admin)
portalProductOrdersRouter.get("/orders/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const [order] = await db.select().from(portalProductOrdersTable).where(eq(portalProductOrdersTable.id, id));
  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const items = await db.select().from(portalProductOrderItemsTable).where(eq(portalProductOrderItemsTable.orderId, id));

  return res.json({ ...toOrder(order), items: items.map(toItem) });
});

// PUT /api/portal-product/orders/:id/status — update status (admin)
portalProductOrdersRouter.put("/orders/:id/status", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const { status } = req.body as { status?: string };
  if (!status?.trim()) return res.status(400).json({ message: "Status wajib diisi" });

  const [updated] = await db
    .update(portalProductOrdersTable)
    .set({ status: status.trim() })
    .where(eq(portalProductOrdersTable.id, id))
    .returning();

  if (!updated) return res.status(404).json({ message: "Order tidak ditemukan" });

  const statusLabels: Record<string, string> = {
    "New Order": "Order Baru ✅",
    "Confirmed": "Dikonfirmasi ✅",
    "Processing": "Sedang Diproses 🔄",
    "Shipped": "Dikirim 🚚",
    "Completed": "Selesai 🎉",
    "Cancelled": "Dibatalkan ❌",
  };
  const label = statusLabels[status.trim()] ?? status.trim();

  // Notif WA ke customer
  if (updated.phone) {
    const custMsg =
      `📦 *Update Status Pesanan Anda*\n` +
      `No. Order: ${updated.orderNumber}\n` +
      `Customer: ${updated.customerName}\n` +
      `Status: *${label}*\n\n` +
      `Terima kasih telah berbelanja di CST Logistics. Hubungi kami jika ada pertanyaan. 🙏`;
    sendWhatsApp(updated.phone, custMsg).catch(() => undefined);
  }

  // Notif WA ke admin
  getAdminWa().then((adminWa) => {
    if (!adminWa) return;
    const adminMsg =
      `🔔 *Status Order Produk Diperbarui*\n` +
      `No. Order : ${updated.orderNumber}\n` +
      `Customer  : ${updated.customerName}\n` +
      `HP        : ${updated.phone}\n` +
      `Status    : *${label}*`;
    return sendWhatsApp(adminWa, adminMsg);
  }).catch(() => undefined);

  return res.json(toOrder(updated));
});

// GET /api/portal-product/vendor-access/:orderNumber — public vendor access (no login)
portalProductOrdersRouter.get("/vendor-access/:orderNumber", async (req: Request, res: Response) => {
  const orderNumber = req.params["orderNumber"] as string;
  const token = String(req.query["t"] ?? "").trim();
  if (!verifyVendorResponseToken(orderNumber, token)) {
    return res.status(403).json({ error: "Link tidak valid atau sudah kadaluarsa" });
  }

  const [order] = await db.select().from(portalProductOrdersTable)
    .where(eq(portalProductOrdersTable.orderNumber, orderNumber));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  const items = await db.select().from(portalProductOrderItemsTable)
    .where(eq(portalProductOrderItemsTable.orderId, order.id));

  const existing = await db.execute(sql`
    SELECT id FROM portal_product_vendor_responses WHERE order_number = ${orderNumber} LIMIT 1
  `);

  return res.json({
    orderNumber: order.orderNumber,
    customerName: order.customerName,
    shippingAddress: order.shippingAddress,
    notes: order.notes ?? null,
    grandTotal: parseFloat(order.grandTotal),
    items: items.map(i => ({
      productName: i.productName,
      productSku: i.productSku ?? null,
      qty: i.qty,
      unit: i.unit ?? null,
      unitPrice: parseFloat(i.unitPrice),
      subtotal: parseFloat(i.subtotal),
    })),
    alreadySubmitted: (existing as unknown as { rows: unknown[] }).rows?.length > 0,
  });
});

// POST /api/portal-product/vendor-response/:orderNumber — public vendor response (no login)
portalProductOrdersRouter.post("/vendor-response/:orderNumber", async (req: Request, res: Response) => {
  const orderNumber = req.params["orderNumber"] as string;
  const { vendorName, status, quotedPrice, notes, token } = req.body as Record<string, string>;

  const tok = String(token ?? String(req.query["t"] ?? "")).trim();
  if (!verifyVendorResponseToken(orderNumber, tok)) {
    return res.status(403).json({ error: "Link tidak valid atau sudah kadaluarsa" });
  }

  if (!status || !["SETUJU", "TOLAK"].includes(status)) {
    return res.status(400).json({ error: "Status harus SETUJU atau TOLAK" });
  }

  const [order] = await db.select({ id: portalProductOrdersTable.id })
    .from(portalProductOrdersTable)
    .where(eq(portalProductOrdersTable.orderNumber, orderNumber));
  if (!order) return res.status(404).json({ error: "Order tidak ditemukan" });

  const qp = quotedPrice ? parseFloat(String(quotedPrice)) : null;

  await db.execute(sql`
    INSERT INTO portal_product_vendor_responses (order_number, order_id, vendor_name, status, quoted_price, notes)
    VALUES (${orderNumber}, ${order.id}, ${vendorName ?? null}, ${status}, ${qp}, ${notes ?? null})
  `);

  const statusEmoji = status === "SETUJU" ? "✅" : "❌";
  const domain = getPreferredDomain() || "cstlogistic.co.id";
  const adminUrl = `https://${domain}/bizportal/logistics/portal-orders`;
  const waMsg =
    `${statusEmoji} *VENDOR RESPONSE — ORDER PRODUK*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `No. Order : \`${orderNumber}\`\n` +
    `Vendor    : ${vendorName ?? "—"}\n` +
    `Status    : ${statusEmoji} ${status}\n` +
    (qp ? `💰 Harga  : Rp ${qp.toLocaleString("id-ID")}\n` : ``) +
    (notes ? `Catatan   : ${notes}\n` : ``) +
    `━━━━━━━━━━━━━━━━━━\n` +
    `🔗 Lihat di BizPortal:\n${adminUrl}`;

  try {
    const adminGroupWa = await getAdminGroupWa();
    if (adminGroupWa) await sendWhatsApp(adminGroupWa, waMsg);
  } catch (err) {
    logger.error({ err }, "Failed to send admin WA for product vendor response");
  }

  return res.json({ success: true });
});
