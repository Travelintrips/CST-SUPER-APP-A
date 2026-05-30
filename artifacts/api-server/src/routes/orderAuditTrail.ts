import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { logisticOrdersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { getOrderAuditTrail } from "../lib/auditTrail.js";

export const orderAuditTrailRouter = Router();

// GET /api/logistic/orders/:orderId/audit-trail
// Full audit trail untuk satu order — status history, activity logs, vendor quotes, customer approvals
orderAuditTrailRouter.get("/orders/:orderId/audit-trail", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;

  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const [order] = await db
    .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber })
    .from(logisticOrdersTable)
    .where(eq(logisticOrdersTable.id, orderId));

  if (!order) return res.status(404).json({ message: "Order tidak ditemukan" });

  const trail = await getOrderAuditTrail(orderId);

  // Merge all events menjadi satu unified timeline, diurutkan ascending
  const merged = [
    ...(trail.statusHistory as any[]).map((e) => ({ ...e, _source: "status_history" })),
    ...(trail.activityLogs as any[]).map((e) => ({ ...e, _source: "activity_logs" })),
    ...(trail.vendorQuotes as any[]).map((e) => ({ ...e, _source: "vendor_quotes" })),
    ...(trail.customerApprovals as any[]).map((e) => ({ ...e, _source: "customer_approvals" })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  return res.json({
    orderNumber: order.orderNumber,
    ...trail,
    timeline: merged,
  });
});

// GET /api/logistic/orders/:orderId/status-history
orderAuditTrailRouter.get("/orders/:orderId/status-history", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;

  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const rows = await db.execute(sql`
    SELECT * FROM order_status_history
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `);

  return res.json({ data: rows.rows });
});

// GET /api/logistic/orders/:orderId/vendor-quote-history
orderAuditTrailRouter.get("/orders/:orderId/vendor-quote-history", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;

  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const rows = await db.execute(sql`
    SELECT * FROM vendor_quote_history
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `);

  return res.json({ data: rows.rows });
});

// GET /api/logistic/orders/:orderId/customer-approval-history
orderAuditTrailRouter.get("/orders/:orderId/customer-approval-history", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;

  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const rows = await db.execute(sql`
    SELECT * FROM customer_approval_history
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `);

  return res.json({ data: rows.rows });
});

// GET /api/logistic/orders/:orderId/order-audit-logs
orderAuditTrailRouter.get("/orders/:orderId/order-audit-logs", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;

  const orderId = Number(req.params["orderId"]);
  if (isNaN(orderId)) return res.status(400).json({ message: "orderId tidak valid" });

  const rows = await db.execute(sql`
    SELECT * FROM order_audit_logs
    WHERE order_id = ${orderId}
    ORDER BY created_at ASC
  `);

  return res.json({ data: rows.rows });
});
