import { Router } from "express";
import {
  db,
  salesDocumentsTable,
  salesDocumentLinesTable,
  purchaseDocumentsTable,
  purchaseDocumentLinesTable,
} from "@workspace/db";
import { eq, gte, lte, and, type SQL } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

router.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

function parseDateRange(req: any): { from?: Date; to?: Date; error?: string } {
  const fromStr = typeof req.query["from"] === "string" ? req.query["from"] : undefined;
  const toStr = typeof req.query["to"] === "string" ? req.query["to"] : undefined;
  let from: Date | undefined;
  let to: Date | undefined;
  if (fromStr) {
    const d = new Date(fromStr);
    if (Number.isNaN(d.getTime())) return { error: `Invalid 'from' date: ${fromStr}` };
    from = d;
  }
  if (toStr) {
    const d = new Date(toStr);
    if (Number.isNaN(d.getTime())) return { error: `Invalid 'to' date: ${toStr}` };
    to = d;
  }
  return { from, to };
}

router.get("/sales", async (req, res) => {
  const { from, to, error } = parseDateRange(req);
  if (error) return res.status(400).json({ message: error });
  const groupBy = (req.query["groupBy"] as string) || "month";

  const conds: SQL[] = [eq(salesDocumentsTable.kind, "order")];
  if (from) conds.push(gte(salesDocumentsTable.createdAt, from));
  if (to) conds.push(lte(salesDocumentsTable.createdAt, to));

  const docs = await db
    .select()
    .from(salesDocumentsTable)
    .where(and(...conds));

  const active = docs.filter((d) => d.status !== "cancelled");
  const totalRevenue = active.reduce((s, d) => s + Number(d.totalAmount), 0);
  const totalOrders = active.length;

  const byMonth = new Map<string, { revenue: number; count: number }>();
  const byCustomer = new Map<string, { revenue: number; count: number }>();
  for (const d of active) {
    const ym = d.createdAt.toISOString().slice(0, 7);
    const m = byMonth.get(ym) ?? { revenue: 0, count: 0 };
    m.revenue += Number(d.totalAmount);
    m.count += 1;
    byMonth.set(ym, m);
    const c = byCustomer.get(d.customerName) ?? { revenue: 0, count: 0 };
    c.revenue += Number(d.totalAmount);
    c.count += 1;
    byCustomer.set(d.customerName, c);
  }

  const lineRows = await db.select().from(salesDocumentLinesTable);
  const docIds = new Set(active.map((d) => d.id));
  const byProduct = new Map<string, { revenue: number; qty: number }>();
  for (const l of lineRows) {
    if (!docIds.has(l.documentId)) continue;
    const p = byProduct.get(l.name) ?? { revenue: 0, qty: 0 };
    p.revenue += Number(l.subtotal);
    p.qty += Number(l.quantity);
    byProduct.set(l.name, p);
  }

  return res.json({
    totalRevenue,
    totalOrders,
    avgOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    byMonth: Array.from(byMonth.entries())
      .map(([period, v]) => ({ period, revenue: v.revenue, count: v.count }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    byCustomer: Array.from(byCustomer.entries())
      .map(([name, v]) => ({ name, revenue: v.revenue, count: v.count }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    byProduct: Array.from(byProduct.entries())
      .map(([name, v]) => ({ name, revenue: v.revenue, qty: v.qty }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 10),
    groupBy,
  });
});

router.get("/purchase", async (req, res) => {
  const { from, to, error } = parseDateRange(req);
  if (error) return res.status(400).json({ message: error });
  const conds: SQL[] = [eq(purchaseDocumentsTable.kind, "order")];
  if (from) conds.push(gte(purchaseDocumentsTable.createdAt, from));
  if (to) conds.push(lte(purchaseDocumentsTable.createdAt, to));
  const docs = await db
    .select()
    .from(purchaseDocumentsTable)
    .where(and(...conds));

  const active = docs.filter((d) => d.status !== "cancelled");
  const totalSpend = active.reduce((s, d) => s + Number(d.totalAmount), 0);
  const totalOrders = active.length;

  const byMonth = new Map<string, { spend: number; count: number }>();
  const byVendor = new Map<string, { spend: number; count: number }>();
  for (const d of active) {
    const ym = d.createdAt.toISOString().slice(0, 7);
    const m = byMonth.get(ym) ?? { spend: 0, count: 0 };
    m.spend += Number(d.totalAmount);
    m.count += 1;
    byMonth.set(ym, m);
    const v = byVendor.get(d.supplierName) ?? { spend: 0, count: 0 };
    v.spend += Number(d.totalAmount);
    v.count += 1;
    byVendor.set(d.supplierName, v);
  }

  const lineRows = await db.select().from(purchaseDocumentLinesTable);
  const docIds = new Set(active.map((d) => d.id));
  const byProduct = new Map<string, { spend: number; qty: number }>();
  for (const l of lineRows) {
    if (!docIds.has(l.documentId)) continue;
    const p = byProduct.get(l.name) ?? { spend: 0, qty: 0 };
    p.spend += Number(l.subtotal);
    p.qty += Number(l.quantity);
    byProduct.set(l.name, p);
  }

  return res.json({
    totalSpend,
    totalOrders,
    avgOrderValue: totalOrders > 0 ? totalSpend / totalOrders : 0,
    byMonth: Array.from(byMonth.entries())
      .map(([period, v]) => ({ period, spend: v.spend, count: v.count }))
      .sort((a, b) => a.period.localeCompare(b.period)),
    byVendor: Array.from(byVendor.entries())
      .map(([name, v]) => ({ name, spend: v.spend, count: v.count }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10),
    byProduct: Array.from(byProduct.entries())
      .map(([name, v]) => ({ name, spend: v.spend, qty: v.qty }))
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 10),
  });
});

// Rounding threshold: exclude items whose outstanding balance rounds to zero
// (avoids floating-point noise after partial payments)
const OUTSTANDING_THRESHOLD = 0.005;

function bucketDays(daysOld: number): "0-30" | "31-60" | "61-90" | "90+" {
  if (daysOld <= 30) return "0-30";
  if (daysOld <= 60) return "31-60";
  if (daysOld <= 90) return "61-90";
  return "90+";
}

router.get("/ar-aging", async (_req, res) => {
  const docs = await db
    .select()
    .from(salesDocumentsTable)
    .where(and(
      eq(salesDocumentsTable.kind, "order"),
      eq(salesDocumentsTable.invoiceStatus, "to_invoice"),
    ));
  const now = Date.now();
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
  const items = docs
    .map((d) => {
      const outstanding = Math.max(0, Number(d.grandTotal) - Number(d.amountPaid));
      const baseDate = d.confirmedAt ?? d.createdAt;
      const daysOld = Math.floor((now - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      const bucket = bucketDays(daysOld);
      return {
        id: d.id,
        docNumber: d.docNumber,
        customerName: d.customerName,
        grandTotal: Number(d.grandTotal),
        amountPaid: Number(d.amountPaid),
        amount: outstanding,
        daysOld,
        bucket,
        confirmedAt: d.confirmedAt?.toISOString() ?? d.createdAt.toISOString(),
      };
    })
    // amountPaid is void-safe: the void handler recalculates it excluding voided payments
    .filter((item) => item.amount > OUTSTANDING_THRESHOLD);
  items.forEach((item) => { buckets[item.bucket] += item.amount; });
  const total = items.reduce((s, i) => s + i.amount, 0);
  return res.json({ total, buckets, items: items.sort((a, b) => b.daysOld - a.daysOld) });
});

router.get("/ap-aging", async (_req, res) => {
  const docs = await db
    .select()
    .from(purchaseDocumentsTable)
    .where(and(
      eq(purchaseDocumentsTable.kind, "order"),
      eq(purchaseDocumentsTable.billStatus, "to_bill"),
    ));
  const now = Date.now();
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
  const items = docs
    .map((d) => {
      const outstanding = Math.max(0, Number(d.grandTotal) - Number(d.amountPaid));
      const baseDate = d.confirmedAt ?? d.createdAt;
      const daysOld = Math.floor((now - baseDate.getTime()) / (1000 * 60 * 60 * 24));
      const bucket = bucketDays(daysOld);
      return {
        id: d.id,
        docNumber: d.docNumber,
        supplierName: d.supplierName,
        grandTotal: Number(d.grandTotal),
        amountPaid: Number(d.amountPaid),
        amount: outstanding,
        daysOld,
        bucket,
        confirmedAt: d.confirmedAt?.toISOString() ?? d.createdAt.toISOString(),
      };
    })
    // amountPaid is void-safe: the void handler recalculates it excluding voided payments
    .filter((item) => item.amount > OUTSTANDING_THRESHOLD);
  items.forEach((item) => { buckets[item.bucket] += item.amount; });
  const total = items.reduce((s, i) => s + i.amount, 0);
  return res.json({ total, buckets, items: items.sort((a, b) => b.daysOld - a.daysOld) });
});

// GET /api/reports/inventory-valuation
// Laporan valuasi persediaan: nilai stok per produk, per gudang, per perusahaan
router.get("/inventory-valuation", async (req, res) => {
  const companyId = typeof req.query["companyId"] === "string" && req.query["companyId"] !== "all"
    ? Number(req.query["companyId"]) : null;
  const warehouseId = typeof req.query["warehouseId"] === "string" ? Number(req.query["warehouseId"]) : null;

  const rows = await db.execute<{
    product_id: string; product_name: string; sku: string | null;
    warehouse_id: string; warehouse_name: string;
    company_id: string; company_name: string;
    qty: string; cost_price: string; total_value: string;
    category: string | null;
  }>(sql`
    SELECT
      p.id::text AS product_id,
      p.name AS product_name,
      p.sku,
      w.id::text AS warehouse_id,
      w.name AS warehouse_name,
      c.id::text AS company_id,
      c.company_name,
      COALESCE(ws.qty, '0') AS qty,
      COALESCE(ws.cost_price, '0') AS cost_price,
      COALESCE((ws.qty::numeric * ws.cost_price::numeric), 0)::text AS total_value,
      pc.name AS category
    FROM wh_stock ws
    JOIN products p ON p.id = ws.product_id
    JOIN warehouses w ON w.id = ws.warehouse_id
    LEFT JOIN companies c ON c.id = w.company_id
    LEFT JOIN product_categories pc ON pc.id = p.category_id
    WHERE ws.qty::numeric > 0
      ${companyId ? sql`AND w.company_id = ${companyId}` : sql``}
      ${warehouseId ? sql`AND ws.warehouse_id = ${warehouseId}` : sql``}
    ORDER BY c.company_name, w.name, p.name
  `);

  // Aggregate totals
  const items = rows.rows.map((r) => ({
    productId: Number(r.product_id),
    productName: r.product_name,
    sku: r.sku ?? null,
    warehouseId: Number(r.warehouse_id),
    warehouseName: r.warehouse_name,
    companyId: Number(r.company_id),
    companyName: r.company_name,
    qty: Number(r.qty),
    costPrice: Number(r.cost_price),
    totalValue: Number(r.total_value),
    category: r.category ?? null,
  }));

  const totalValue = items.reduce((s, i) => s + i.totalValue, 0);
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  const totalItems = items.length;

  // Summary per company
  const byCompany: Record<string, { companyName: string; totalValue: number; itemCount: number }> = {};
  for (const item of items) {
    const key = String(item.companyId);
    if (!byCompany[key]) byCompany[key] = { companyName: item.companyName, totalValue: 0, itemCount: 0 };
    byCompany[key].totalValue += item.totalValue;
    byCompany[key].itemCount += 1;
  }

  // Summary per warehouse
  const byWarehouse: Record<string, { warehouseName: string; totalValue: number; itemCount: number }> = {};
  for (const item of items) {
    const key = String(item.warehouseId);
    if (!byWarehouse[key]) byWarehouse[key] = { warehouseName: item.warehouseName, totalValue: 0, itemCount: 0 };
    byWarehouse[key].totalValue += item.totalValue;
    byWarehouse[key].itemCount += 1;
  }

  return res.json({
    items,
    summary: { totalValue, totalQty, totalItems },
    byCompany: Object.entries(byCompany).map(([id, v]) => ({ companyId: Number(id), ...v })),
    byWarehouse: Object.entries(byWarehouse).map(([id, v]) => ({ warehouseId: Number(id), ...v })),
  });
});

// GET /api/reports/stock-movements
// Laporan mutasi stok dalam periode tertentu
router.get("/stock-movements", async (req, res) => {
  const { from, to, error } = parseDateRange(req);
  if (error) return res.status(400).json({ message: error });
  const companyId = typeof req.query["companyId"] === "string" && req.query["companyId"] !== "all"
    ? Number(req.query["companyId"]) : null;

  const rows = await db.execute<{
    id: string; product_name: string; warehouse_name: string;
    type: string; qty: string; qty_before: string; qty_after: string;
    cost_price: string; ref_type: string | null; ref_id: string | null;
    note: string | null; created_at: string;
  }>(sql`
    SELECT
      m.id::text,
      p.name AS product_name,
      w.name AS warehouse_name,
      m.type,
      m.qty,
      m.qty_before,
      m.qty_after,
      COALESCE(m.cost_price, '0') AS cost_price,
      m.ref_type,
      m.ref_id::text,
      m.note,
      m.created_at::text
    FROM wh_movements m
    JOIN products p ON p.id = m.product_id
    JOIN warehouses w ON w.id = m.warehouse_id
    WHERE 1=1
      ${from ? sql`AND m.created_at >= ${from}` : sql``}
      ${to ? sql`AND m.created_at <= ${to}` : sql``}
      ${companyId ? sql`AND w.company_id = ${companyId}` : sql``}
    ORDER BY m.created_at DESC
    LIMIT 1000
  `);

  return res.json({ movements: rows.rows, count: rows.rows.length });
});

export default router;
