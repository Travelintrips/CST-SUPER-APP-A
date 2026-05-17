import type { Request } from "express";

/**
 * Resolves the active company ID for the current request.
 *
 * Isolation rules:
 *  - Non-admin authenticated users with an assigned company_id are locked to
 *    that company. The client-supplied ?companyId / ?company param is ignored.
 *  - Admin users and users without an assigned company may override via query
 *    param (e.g. for multi-company admin or holding-group views).
 *  - Unauthenticated requests fall back to the client param, then 1.
 */
export function resolveCompanyId(req: Request): number {
  const user = req.user;

  if (user?.companyId != null && user.role !== "admin") {
    return user.companyId;
  }

  const raw = (
    req.query["companyId"] ??
    req.query["company"] ??
    (req.body as Record<string, unknown> | undefined)?.["companyId"]
  ) as string | undefined;
  const n = raw ? parseInt(String(raw), 10) : NaN;
  return Number.isNaN(n) ? (user?.companyId ?? 1) : n;
}
