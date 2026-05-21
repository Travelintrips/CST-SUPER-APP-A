import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

const router = Router();

// ── GET /api/qr-menu/:branchId/info (public) ─────────────────────────────────
router.get("/:branchId/info", async (req: Request, res: Response) => {
  const branchId = Number(req.params.branchId);
  if (!branchId || isNaN(branchId)) {
    res.status(400).json({ error: "branchId tidak valid" });
    return;
  }
  const result = await db.execute(sql`
    SELECT b.id, b.name, b.address, b.phone, b.company_id,
           c.name  AS company_name,
           c.logo_url AS company_logo
    FROM pos_branches b
    LEFT JOIN companies c ON c.id = b.company_id
    WHERE b.id = ${branchId} AND b.is_active = TRUE
  `);
  const branch = result.rows[0];
  if (!branch) {
    res.status(404).json({ error: "Cabang tidak ditemukan" });
    return;
  }
  res.json(branch);
});

// ── GET /api/qr-menu/:branchId/products (public) ─────────────────────────────
router.get("/:branchId/products", async (req: Request, res: Response) => {
  const branchId = Number(req.params.branchId);
  if (!branchId || isNaN(branchId)) {
    res.status(400).json({ error: "branchId tidak valid" });
    return;
  }
  const branchResult = await db.execute(sql`
    SELECT company_id FROM pos_branches WHERE id = ${branchId} AND is_active = TRUE
  `);
  const branch = branchResult.rows[0] as { company_id: number } | undefined;
  if (!branch) {
    res.status(404).json({ error: "Cabang tidak ditemukan" });
    return;
  }
  const result = await db.execute(sql`
    SELECT id, name, description, price, category, image_url, sort_order
    FROM pos_products
    WHERE is_active = TRUE AND company_id = ${branch.company_id}
    ORDER BY sort_order ASC NULLS LAST, category ASC, name ASC
  `);
  res.json(result.rows);
});

// ── POST /api/qr-menu/:branchId/orders (public) ──────────────────────────────
router.post("/:branchId/orders", async (req: Request, res: Response) => {
  const branchId = Number(req.params.branchId);
  if (!branchId || isNaN(branchId)) {
    res.status(400).json({ error: "branchId tidak valid" });
    return;
  }

  const { items, tableNumber, customerNote, customerName } = req.body as {
    items?: Array<{ productId: number; qty: number }>;
    tableNumber?: string;
    customerNote?: string;
    customerName?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    res.status(400).json({ error: "items wajib diisi dan tidak boleh kosong" });
    return;
  }

  const branchResult = await db.execute(sql`
    SELECT id, company_id, name FROM pos_branches
    WHERE id = ${branchId} AND is_active = TRUE
  `);
  const branch = branchResult.rows[0] as { id: number; company_id: number; name: string } | undefined;
  if (!branch) {
    res.status(404).json({ error: "Cabang tidak ditemukan" });
    return;
  }

  const productIds = items.map((i) => Number(i.productId)).filter((n) => !isNaN(n));
  if (productIds.length !== items.length) {
    res.status(400).json({ error: "productId tidak valid" });
    return;
  }

  const productsResult = await db.execute(sql`
    SELECT id, name, price
    FROM pos_products
    WHERE id = ANY(${productIds}::int[])
      AND company_id = ${branch.company_id}
      AND is_active = TRUE
  `);
  const productMap = new Map(
    (productsResult.rows as Array<{ id: number; name: string; price: string }>).map((p) => [
      p.id,
      p,
    ]),
  );

  let subtotal = 0;
  const lineItems: Array<{
    productId: number;
    productName: string;
    price: string;
    qty: number;
    subtotal: string;
  }> = [];

  for (const item of items) {
    const product = productMap.get(Number(item.productId));
    if (!product) {
      res.status(400).json({ error: `Produk id ${item.productId} tidak ditemukan` });
      return;
    }
    if (!item.qty || item.qty < 1) {
      res.status(400).json({ error: "qty minimal 1" });
      return;
    }
    const price = Number(product.price);
    const sub = price * item.qty;
    subtotal += sub;
    lineItems.push({
      productId: product.id,
      productName: product.name,
      price: String(price),
      qty: item.qty,
      subtotal: String(sub),
    });
  }

  const total = subtotal;
  const orderNum = `QR-${branchId}-${Date.now().toString(36).toUpperCase()}`;
  const noteText =
    [customerName ? `Pelanggan: ${customerName}` : null, customerNote]
      .filter(Boolean)
      .join("\n") || null;

  const orderResult = await db.execute(sql`
    INSERT INTO pos_orders
      (company_id, order_number, cashier_id, branch_id, status,
       subtotal, discount, total, note, table_number, source, customer_note, created_at)
    VALUES
      (${branch.company_id}, ${orderNum}, NULL, ${branchId}, 'open',
       ${String(subtotal)}, '0', ${String(total)}, ${noteText},
       ${tableNumber ?? null}, 'qr_menu', ${customerNote ?? null}, NOW())
    RETURNING id, order_number, status, total, table_number, source, created_at
  `);
  const order = orderResult.rows[0] as {
    id: number;
    order_number: string;
    status: string;
    total: string;
    table_number: string | null;
    source: string;
    created_at: string;
  };

  for (const item of lineItems) {
    await db.execute(sql`
      INSERT INTO pos_order_items (order_id, product_id, product_name, price, qty, subtotal)
      VALUES (${order.id}, ${item.productId}, ${item.productName}, ${item.price}, ${item.qty}, ${item.subtotal})
    `);
  }

  res.status(201).json({
    orderNumber: order.order_number,
    total: order.total,
    tableNumber: order.table_number,
    items: lineItems,
  });
});

export default router;
