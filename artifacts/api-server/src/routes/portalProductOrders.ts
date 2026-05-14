import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import {
  portalProductOrdersTable,
  portalProductOrderItemsTable,
  productsTable,
} from "@workspace/db";
import { eq, ilike, and, or, sql } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { sendWhatsApp } from "../lib/fonnte";
import { getAdminWa } from "../lib/adminWa";
import { getPreferredDomain } from "../lib/domain";
import { sendMail, isSmtpConfigured } from "../lib/mailer";
import { logger } from "../lib/logger";
import { broadcastToAdmins } from "../lib/sseManager";

export const portalProductOrdersRouter = Router();

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
  const orderUrl = domain ? `https://${domain}/bizportal/logistics/portal-orders` : "";

  const itemList = items.map((i) => `• ${i.productName} × ${i.qty} (${i.unit ?? "pcs"}) — Rp ${formatRupiah(i.subtotal)}`).join("\n");

  const waMsg =
    `🛒 *PESANAN PRODUK BARU*\n` +
    `━━━━━━━━━━━━━━━━━━\n` +
    `No. Order   : \`${order.orderNumber}\`\n` +
    `Customer    : ${order.customerName}\n` +
    `Email       : ${order.email}\n` +
    `HP          : ${order.phone}\n` +
    `Alamat      : ${order.shippingAddress}\n` +
    `Produk      :\n${itemList}\n` +
    `Total       : Rp ${formatRupiah(order.grandTotal)}\n` +
    (order.notes ? `Catatan     : ${order.notes}\n` : ``) +
    `━━━━━━━━━━━━━━━━━━\n` +
    (orderUrl ? `🔗 Lihat di BizPortal:\n${orderUrl}\n` : ``);

  try {
    const adminWa = await getAdminWa();
    if (adminWa) await sendWhatsApp(adminWa, waMsg);
  } catch (err) {
    logger.error({ err }, "Failed to send admin WA for product order");
  }

  if (order.phone) {
    const customerMsg =
      `✅ *Pesanan Anda Berhasil Diterima!*\n` +
      `No. Order: *${order.orderNumber}*\n\n` +
      `${itemList}\n\n` +
      `Total: Rp ${formatRupiah(order.grandTotal)}\n\n` +
      `Tim kami akan segera menghubungi Anda untuk konfirmasi. Terima kasih! 🙏`;
    sendWhatsApp(order.phone, customerMsg).catch(() => undefined);
  }

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

  // Real-time SSE: notify BizPortal admins immediately
  broadcastToAdmins("new_order", {
    type: "product",
    orderId: order.id,
    orderNumber,
    customerName: customerName.trim(),
    companyName: null,
    grandTotal: grandTotal,
    itemCount: items.length,
    createdAt: order.createdAt,
  });

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

  if (updated.phone) {
    const statusLabels: Record<string, string> = {
      "New Order": "Order Baru",
      "Confirmed": "Dikonfirmasi",
      "Processing": "Sedang Diproses",
      "Shipped": "Dikirim",
      "Completed": "Selesai",
      "Cancelled": "Dibatalkan",
    };
    const label = statusLabels[status] ?? status;
    const msg =
      `📦 *Update Status Pesanan Anda*\n` +
      `No Order: ${updated.orderNumber}\n` +
      `Status: *${label}*\n\n` +
      `Terima kasih telah berbelanja di CST Logistic. Hubungi kami jika ada pertanyaan.`;
    sendWhatsApp(updated.phone, msg).catch(() => undefined);
  }

  return res.json(toOrder(updated));
});
