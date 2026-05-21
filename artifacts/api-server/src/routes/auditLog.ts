/**
 * GET /api/audit-logs — Lihat audit trail ERP
 * Hanya admin/owner yang boleh mengakses.
 */

import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin, requireClerkUser } from "../lib/requireAdmin.js";
import { resolveCompanyId } from "../lib/resolveCompany.js";

const router = Router();

router.use(async (req: Request, res: Response, next) => {
  if (!(await requireClerkUser(req, res))) return;
  next();
});

// GET /api/audit-logs — list audit log dengan filter
router.get("/", async (req: Request, res: Response) => {
  // Hanya admin/owner boleh lihat semua audit log
  const user = req.user as { role?: string | null; companyId?: number | null };
  const isAdmin = ["admin", "owner"].includes(user?.role ?? "");
  if (!isAdmin) {
    res.status(403).json({ message: "Hanya admin/owner yang bisa mengakses audit log" });
    return;
  }

  const companyId = resolveCompanyId(req);
  const { from, to, module: mod, action, userId, branchId, referenceId } = req.query as Record<string, string>;
  const limit = Math.min(Number(req.query.limit ?? 100), 500);
  const offset = Number(req.query.offset ?? 0);

  const rows = await db.execute(sql`
    SELECT
      al.id, al.company_id, al.branch_id, al.user_id, al.user_email,
      al.action, al.module, al.reference_id,
      al.old_data, al.new_data,
      al.ip_address, al.created_at,
      b.name AS branch_name
    FROM erp_audit_logs al
    LEFT JOIN pos_branches b ON b.id = al.branch_id
    WHERE (al.company_id = ${companyId} OR al.company_id IS NULL)
      ${mod ? sql`AND al.module = ${mod}` : sql``}
      ${action ? sql`AND al.action = ${action}` : sql``}
      ${userId ? sql`AND al.user_id = ${userId}` : sql``}
      ${branchId ? sql`AND al.branch_id = ${Number(branchId)}` : sql``}
      ${referenceId ? sql`AND al.reference_id ILIKE ${"%" + referenceId + "%"}` : sql``}
      ${from ? sql`AND al.created_at >= ${from}::timestamp` : sql``}
      ${to ? sql`AND al.created_at <= ${to}::timestamp + interval '1 day'` : sql``}
    ORDER BY al.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const countRows = await db.execute(sql`
    SELECT COUNT(*)::int AS total
    FROM erp_audit_logs al
    WHERE (al.company_id = ${companyId} OR al.company_id IS NULL)
      ${mod ? sql`AND al.module = ${mod}` : sql``}
      ${action ? sql`AND al.action = ${action}` : sql``}
      ${userId ? sql`AND al.user_id = ${userId}` : sql``}
      ${branchId ? sql`AND al.branch_id = ${Number(branchId)}` : sql``}
      ${referenceId ? sql`AND al.reference_id ILIKE ${"%" + referenceId + "%"}` : sql``}
      ${from ? sql`AND al.created_at >= ${from}::timestamp` : sql``}
      ${to ? sql`AND al.created_at <= ${to}::timestamp + interval '1 day'` : sql``}
  `);

  res.json({
    rows: rows.rows,
    total: (countRows.rows[0] as any)?.total ?? 0,
    limit,
    offset,
  });
});

// GET /api/audit-logs/stats — ringkasan aktivitas
router.get("/stats", async (req: Request, res: Response) => {
  const user = req.user as { role?: string | null; companyId?: number | null };
  const isAdmin = ["admin", "owner"].includes(user?.role ?? "");
  if (!isAdmin) { res.status(403).json({ message: "Forbidden" }); return; }

  const companyId = resolveCompanyId(req);
  const { from, to } = req.query as Record<string, string>;
  const today = new Date().toISOString().split("T")[0];
  const fromDate = from ?? today;
  const toDate = to ?? today;

  const [byModule, byAction, byUser, totalRow] = await Promise.all([
    db.execute(sql`
      SELECT module, COUNT(*)::int AS total
      FROM erp_audit_logs
      WHERE (company_id = ${companyId} OR company_id IS NULL)
        AND created_at >= ${fromDate}::date
        AND created_at < ${toDate}::date + interval '1 day'
      GROUP BY module ORDER BY total DESC
    `),
    db.execute(sql`
      SELECT action, COUNT(*)::int AS total
      FROM erp_audit_logs
      WHERE (company_id = ${companyId} OR company_id IS NULL)
        AND created_at >= ${fromDate}::date
        AND created_at < ${toDate}::date + interval '1 day'
      GROUP BY action ORDER BY total DESC
    `),
    db.execute(sql`
      SELECT user_email, COUNT(*)::int AS total
      FROM erp_audit_logs
      WHERE (company_id = ${companyId} OR company_id IS NULL)
        AND created_at >= ${fromDate}::date
        AND created_at < ${toDate}::date + interval '1 day'
        AND user_email IS NOT NULL
      GROUP BY user_email ORDER BY total DESC LIMIT 10
    `),
    db.execute(sql`
      SELECT COUNT(*)::int AS total
      FROM erp_audit_logs
      WHERE (company_id = ${companyId} OR company_id IS NULL)
        AND created_at >= ${fromDate}::date
        AND created_at < ${toDate}::date + interval '1 day'
    `),
  ]);

  res.json({
    total: (totalRow.rows[0] as any)?.total ?? 0,
    byModule: byModule.rows,
    byAction: byAction.rows,
    byUser: byUser.rows,
    period: { from: fromDate, to: toDate },
  });
});

// GET /api/audit-logs/modules — daftar modul unik
router.get("/modules", async (req: Request, res: Response) => {
  const rows = await db.execute(sql`SELECT DISTINCT module FROM erp_audit_logs ORDER BY module`);
  res.json(rows.rows.map((r: any) => r.module));
});

export default router;
