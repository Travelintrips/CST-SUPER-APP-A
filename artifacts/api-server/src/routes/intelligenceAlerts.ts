import { Router, type Request, type Response } from "express";
import { db, intelligenceAlertsTable } from "@workspace/db";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";

export const intelligenceAlertsRouter = Router();

// GET /api/intelligence-alerts
// Query: ?severity=critical,warning&status=open&companyId=1&limit=50&offset=0
intelligenceAlertsRouter.get("/", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const severities = req.query.severity
      ? String(req.query.severity).split(",").filter(Boolean)
      : [];
    const statuses = req.query.status
      ? String(req.query.status).split(",").filter(Boolean)
      : ["open"];
    const limit = Math.min(parseInt(String(req.query.limit ?? "50"), 10), 200);
    const offset = parseInt(String(req.query.offset ?? "0"), 10);
    const companyId = req.query.companyId ? parseInt(String(req.query.companyId), 10) : null;

    const conditions = [];

    if (statuses.length > 0) {
      conditions.push(inArray(intelligenceAlertsTable.status, statuses));
    }
    if (severities.length > 0) {
      conditions.push(inArray(intelligenceAlertsTable.severity, severities));
    }
    if (companyId) {
      conditions.push(
        or(
          eq(intelligenceAlertsTable.companyId, companyId),
          isNull(intelligenceAlertsTable.companyId),
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [alerts, countResult] = await Promise.all([
      db
        .select()
        .from(intelligenceAlertsTable)
        .where(whereClause)
        .orderBy(desc(intelligenceAlertsTable.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`COUNT(*)::int` })
        .from(intelligenceAlertsTable)
        .where(whereClause),
    ]);

    res.json({
      alerts,
      total: countResult[0]?.count ?? 0,
      limit,
      offset,
    });
  } catch (err) {
    res.status(500).json({ error: "Gagal mengambil alerts" });
  }
});

// GET /api/intelligence-alerts/summary
intelligenceAlertsRouter.get("/summary", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const rows = await db
      .select({
        severity: intelligenceAlertsTable.severity,
        status: intelligenceAlertsTable.status,
        count: sql<number>`COUNT(*)::int`,
      })
      .from(intelligenceAlertsTable)
      .groupBy(intelligenceAlertsTable.severity, intelligenceAlertsTable.status);

    const summary = {
      total: 0,
      open: { critical: 0, warning: 0, info: 0 },
      acknowledged: { critical: 0, warning: 0, info: 0 },
    };

    for (const r of rows) {
      const sev = r.severity as "critical" | "warning" | "info";
      const st = r.status as "open" | "acknowledged" | "resolved";
      summary.total += r.count;
      if (st === "open" || st === "acknowledged") {
        summary[st][sev] = (summary[st][sev] ?? 0) + r.count;
      }
    }

    res.json(summary);
  } catch {
    res.status(500).json({ error: "Gagal mengambil summary" });
  }
});

// PUT /api/intelligence-alerts/bulk-acknowledge (must be before /:id routes)
intelligenceAlertsRouter.put("/bulk-acknowledge", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "ids required" });
    }
    const actor = (req as any).user?.name ?? (req as any).user?.email ?? "admin";

    await db
      .update(intelligenceAlertsTable)
      .set({ status: "acknowledged", isRead: true, acknowledgedAt: new Date(), acknowledgedBy: actor })
      .where(inArray(intelligenceAlertsTable.id, ids));

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal bulk acknowledge" });
  }
});

// PUT /api/intelligence-alerts/:id/acknowledge
intelligenceAlertsRouter.put("/:id/acknowledge", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = parseInt(String(req.params.id), 10);
    const actor = (req as any).user?.name ?? (req as any).user?.email ?? "admin";

    await db
      .update(intelligenceAlertsTable)
      .set({
        status: "acknowledged",
        isRead: true,
        acknowledgedAt: new Date(),
        acknowledgedBy: actor,
      })
      .where(eq(intelligenceAlertsTable.id, id));

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal acknowledge alert" });
  }
});

// PUT /api/intelligence-alerts/:id/resolve
intelligenceAlertsRouter.put("/:id/resolve", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const id = parseInt(String(req.params.id), 10);
    const actor = (req as any).user?.name ?? (req as any).user?.email ?? "admin";

    await db
      .update(intelligenceAlertsTable)
      .set({
        status: "resolved",
        isRead: true,
        resolvedAt: new Date(),
        resolvedBy: actor,
      })
      .where(eq(intelligenceAlertsTable.id, id));

    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Gagal resolve alert" });
  }
});
