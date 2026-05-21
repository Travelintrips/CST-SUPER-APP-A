import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export type PosRoleType = "owner" | "admin" | "manager" | "kasir" | "gudang";

export interface PosSessionContext {
  type: "cashier" | "user";
  id: string | number;
  companyId: number | null;
  role: PosRoleType;
  defaultBranchId: number | null;
  branchAccessList: number[];
  canAccessAllBranches: boolean;
  canAccessAllCompanies: boolean;
  permissions: string[];
}

const ROLE_HIERARCHY: Record<PosRoleType, number> = {
  owner: 5,
  admin: 4,
  manager: 3,
  kasir: 2,
  gudang: 1,
};

export function hasPermission(ctx: PosSessionContext, permission: string): boolean {
  if (ctx.canAccessAllCompanies) return true;
  if (ctx.permissions.includes("pos.*")) return true;
  if (ctx.permissions.includes(permission)) return true;
  const parts = permission.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const wildcard = parts.slice(0, i).join(".") + ".*";
    if (ctx.permissions.includes(wildcard)) return true;
  }
  return false;
}

export function canAccessBranch(ctx: PosSessionContext, branchId: number): boolean {
  if (ctx.canAccessAllBranches) return true;
  return ctx.branchAccessList.includes(branchId);
}

export async function getPosSessionByCashierId(cashierId: number): Promise<PosSessionContext | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        c.id,
        c.company_id,
        c.pos_role,
        c.default_branch_id,
        c.branch_id,
        COALESCE(
          (SELECT jsonb_agg(DISTINCT uba.branch_id)
           FROM user_branch_access uba
           WHERE uba.cashier_id = c.id),
          '[]'::jsonb
        ) AS branch_access,
        COALESCE(
          (SELECT permissions FROM pos_roles pr
           WHERE pr.name = c.pos_role AND (pr.company_id = c.company_id OR pr.is_system_role = TRUE)
           ORDER BY pr.company_id NULLS LAST
           LIMIT 1),
          '[]'::jsonb
        ) AS permissions
      FROM pos_cashiers c
      WHERE c.id = ${cashierId}
      LIMIT 1
    `);

    if (!result.rows.length) return null;

    const row = result.rows[0] as {
      id: number;
      company_id: number | null;
      pos_role: PosRoleType;
      default_branch_id: number | null;
      branch_id: number | null;
      branch_access: number[];
      permissions: string[];
    };

    const role = row.pos_role ?? "kasir";
    const branchAccess = Array.isArray(row.branch_access) ? row.branch_access.map(Number) : [];

    // Jika branch_id ada tapi belum di user_branch_access, tambahkan
    if (row.branch_id && !branchAccess.includes(row.branch_id)) {
      branchAccess.push(row.branch_id);
    }

    return {
      type: "cashier",
      id: row.id,
      companyId: row.company_id,
      role,
      defaultBranchId: row.default_branch_id ?? row.branch_id,
      branchAccessList: branchAccess,
      canAccessAllBranches: role === "owner" || role === "admin",
      canAccessAllCompanies: role === "owner",
      permissions: Array.isArray(row.permissions) ? row.permissions : [],
    };
  } catch (err) {
    logger.warn({ err, cashierId }, "posSessionHelper: failed to get cashier session");
    return null;
  }
}

export async function getPosSessionByUserId(userId: string): Promise<PosSessionContext | null> {
  try {
    const result = await db.execute(sql`
      SELECT
        u.id,
        u.company_id,
        u.role,
        u.branch_id,
        u.default_branch_id,
        COALESCE(
          (SELECT jsonb_agg(DISTINCT uba.branch_id)
           FROM user_branch_access uba
           WHERE uba.user_id = u.id),
          '[]'::jsonb
        ) AS branch_access
      FROM users u
      WHERE u.id = ${userId}
      LIMIT 1
    `);

    if (!result.rows.length) return null;

    const row = result.rows[0] as {
      id: string;
      company_id: number | null;
      role: string;
      branch_id: number | null;
      default_branch_id: number | null;
      branch_access: number[];
    };

    const isAdmin = row.role === "admin";
    const branchAccess = Array.isArray(row.branch_access) ? row.branch_access.map(Number) : [];

    const posRole: PosRoleType = isAdmin ? "admin" :
      (row.role === "pos" || row.role === "pos-kasir") ? "kasir" :
      (row.role === "pos-inventory") ? "gudang" : "kasir";

    return {
      type: "user",
      id: row.id,
      companyId: row.company_id,
      role: posRole,
      defaultBranchId: row.default_branch_id ?? row.branch_id,
      branchAccessList: branchAccess,
      canAccessAllBranches: isAdmin || posRole === "owner",
      canAccessAllCompanies: isAdmin,
      permissions: isAdmin ? ["pos.*"] : [],
    };
  } catch (err) {
    logger.warn({ err, userId }, "posSessionHelper: failed to get user session");
    return null;
  }
}

export function buildBranchFilter(ctx: PosSessionContext, branchIdColumn = "branch_id"): string {
  if (ctx.canAccessAllBranches) return "";
  if (!ctx.branchAccessList.length) return `${branchIdColumn} IS NULL`;
  return `${branchIdColumn} IN (${ctx.branchAccessList.join(",")})`;
}

export function buildCompanyFilter(ctx: PosSessionContext, companyIdColumn = "company_id"): string {
  if (ctx.canAccessAllCompanies) return "";
  if (!ctx.companyId) return `${companyIdColumn} IS NULL`;
  return `${companyIdColumn} = ${ctx.companyId}`;
}
