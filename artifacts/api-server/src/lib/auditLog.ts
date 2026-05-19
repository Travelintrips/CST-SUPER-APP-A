/**
 * Audit Log Service — ERP
 *
 * Fire-and-forget: writeAuditLog() tidak memblok request.
 * Error ditulis ke console saja, tidak melempar exception ke caller.
 *
 * Modules: auth | pos | product | recipe | stock | transfer | return | damage | opname | role | permission
 * Actions: login | logout | create | update | delete | confirm | cancel | pay | adjust | transfer | opname
 */

import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import type { Request } from "express";

export interface AuditLogEntry {
  companyId?: number | null;
  branchId?: number | null;
  userId?: string | null;
  userEmail?: string | null;
  action: string;
  module: string;
  referenceId?: string | null;
  oldData?: Record<string, unknown> | null;
  newData?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

type UserInfo = { id?: string; email?: string | null; companyId?: number | null };

export function extractRequestMeta(req: Request): { ipAddress: string; userAgent: string; userId: string | null; userEmail: string | null; companyId: number | null } {
  const user = req.user as UserInfo | undefined;
  return {
    ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.socket?.remoteAddress ?? "unknown",
    userAgent: (req.headers["user-agent"] as string) ?? "unknown",
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
    companyId: user?.companyId ?? null,
  };
}

export function writeAuditLog(entry: AuditLogEntry): void {
  // Fire and forget — no await
  const oldDataStr = entry.oldData != null ? JSON.stringify(entry.oldData) : null;
  const newDataStr = entry.newData != null ? JSON.stringify(entry.newData) : null;

  db.execute(sql`
    INSERT INTO erp_audit_logs (
      company_id, branch_id, user_id, user_email,
      action, module, reference_id,
      old_data, new_data,
      ip_address, user_agent, created_at
    ) VALUES (
      ${entry.companyId ?? null},
      ${entry.branchId ?? null},
      ${entry.userId ?? null},
      ${entry.userEmail ?? null},
      ${entry.action},
      ${entry.module},
      ${entry.referenceId ?? null},
      ${oldDataStr ? sql`${oldDataStr}::jsonb` : sql`NULL`},
      ${newDataStr ? sql`${newDataStr}::jsonb` : sql`NULL`},
      ${entry.ipAddress ?? null},
      ${entry.userAgent ?? null},
      NOW()
    )
  `).catch((err: unknown) => {
    console.error("[auditLog] Failed to write audit entry:", err);
  });
}

/** Convenience: extract meta from req and write audit log */
export function auditFromReq(
  req: Request,
  opts: {
    action: string;
    module: string;
    branchId?: number | null;
    referenceId?: string | null;
    oldData?: Record<string, unknown> | null;
    newData?: Record<string, unknown> | null;
  }
): void {
  const meta = extractRequestMeta(req);
  writeAuditLog({
    companyId: meta.companyId,
    branchId: opts.branchId ?? null,
    userId: meta.userId,
    userEmail: meta.userEmail,
    action: opts.action,
    module: opts.module,
    referenceId: opts.referenceId ?? null,
    oldData: opts.oldData ?? null,
    newData: opts.newData ?? null,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
  });
}
