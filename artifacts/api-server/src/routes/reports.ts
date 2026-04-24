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
    .where(and(eq(salesDocumentsTable.kind, "order"), eq(salesDocumentsTable.invoiceStatus, "to_invoice")));
  const now = Date.now();
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
  const items = docs.map((d) => {
    const baseDate = d.confirmedAt ?? d.createdAt;
    const daysOld = Math.floor((now - baseDate.getTime()) / (1000 * 60 * 60 * 24));
    const bucket = bucketDays(daysOld);
    buckets[bucket] += Number(d.totalAmount);
    return {
      id: d.id,
      docNumber: d.docNumber,
      customerName: d.customerName,
      amount: Number(d.totalAmount),
      daysOld,
      bucket,
      confirmedAt: d.confirmedAt?.toISOString() ?? d.createdAt.toISOString(),
    };
  });
  const total = items.reduce((s, i) => s + i.amount, 0);
  return res.json({ total, buckets, items: items.sort((a, b) => b.daysOld - a.daysOld) });
});

router.get("/ap-aging", async (_req, res) => {
  const docs = await db
    .select()
    .from(purchaseDocumentsTable)
    .where(and(eq(purchaseDocumentsTable.kind, "order"), eq(purchaseDocumentsTable.billStatus, "to_bill")));
  const now = Date.now();
  const buckets = { "0-30": 0, "31-60": 0, "61-90": 0, "90+": 0 } as Record<string, number>;
  const items = docs.map((d) => {
    const baseDate = d.confirmedAt ?? d.createdAt;
    const daysOld = Math.floor((now - baseDate.getTime()) / (1000 * 60 * 60 * 24));
    const bucket = bucketDays(daysOld);
    buckets[bucket] += Number(d.totalAmount);
    return {
      id: d.id,
      docNumber: d.docNumber,
      supplierName: d.supplierName,
      amount: Number(d.totalAmount),
      daysOld,
      bucket,
      confirmedAt: d.confirmedAt?.toISOString() ?? d.createdAt.toISOString(),
    };
  });
  const total = items.reduce((s, i) => s + i.amount, 0);
  return res.json({ total, buckets, items: items.sort((a, b) => b.daysOld - a.daysOld) });
});

export default router;
