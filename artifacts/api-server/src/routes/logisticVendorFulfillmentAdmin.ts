import { Router, type Request, type Response } from "express";
import { eq, and, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";
import {
  db,
  logisticVendorFulfillmentsTable,
  logisticOrdersTable,
  logisticOrderItemsTable,
  suppliersTable,
  vendorCatalogItemsTable,
} from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { logOrderAudit } from "../lib/auditTrail.js";
import { logger } from "../lib/logger.js";

export const logisticVendorFulfillmentAdminRouter = Router();

const VALID_STATUSES = new Set(["pending", "confirmed", "in_progress", "completed", "cancelled"]);

const TRANSITIONS: Record<string, string[]> = {
  pending:     ["confirmed", "cancelled"],
  confirmed:   ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed:   [],
  cancelled:   [],
};

// ─── GET /:id ─────────────────────────────────────────────────────────────────
logisticVendorFulfillmentAdminRouter.get("/:id", requireClerkUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const [vf] = await db
    .select({
      id:                 logisticVendorFulfillmentsTable.id,
      orderId:            logisticVendorFulfillmentsTable.orderId,
      orderItemId:        logisticVendorFulfillmentsTable.orderItemId,
      vendorCatalogItemId: logisticVendorFulfillmentsTable.vendorCatalogItemId,
      vendorId:           logisticVendorFulfillmentsTable.vendorId,
      serviceType:        logisticVendorFulfillmentsTable.serviceType,
      status:             logisticVendorFulfillmentsTable.status,
      fulfillmentPayload: logisticVendorFulfillmentsTable.fulfillmentPayload,
      calculationInput:   logisticVendorFulfillmentsTable.calculationInput,
      templateSnapshot:   logisticVendorFulfillmentsTable.templateSnapshot,
      priceSnapshot:      logisticVendorFulfillmentsTable.priceSnapshot,
      adminNotes:         logisticVendorFulfillmentsTable.adminNotes,
      createdAt:          logisticVendorFulfillmentsTable.createdAt,
      updatedAt:          logisticVendorFulfillmentsTable.updatedAt,
      orderNumber:        logisticOrdersTable.orderNumber,
      customerName:       logisticOrdersTable.customerName,
      companyName:        logisticOrdersTable.companyName,
      orderStatus:        logisticOrdersTable.status,
      itemServiceName:    logisticOrderItemsTable.serviceName,
      itemCategory:       logisticOrderItemsTable.category,
      itemSubtotal:       logisticOrderItemsTable.subtotal,
      itemInputData:      logisticOrderItemsTable.inputData,
      itemSource:         logisticOrderItemsTable.itemSource,
      vendorName:         suppliersTable.name,
      vendorPhone:        suppliersTable.phone,
      vendorEmail:        suppliersTable.contactEmail,
    })
    .from(logisticVendorFulfillmentsTable)
    .leftJoin(logisticOrdersTable, eq(logisticOrdersTable.id, logisticVendorFulfillmentsTable.orderId))
    .leftJoin(logisticOrderItemsTable, eq(logisticOrderItemsTable.id, logisticVendorFulfillmentsTable.orderItemId))
    .leftJoin(suppliersTable, eq(suppliersTable.id, logisticVendorFulfillmentsTable.vendorId))
    .where(eq(logisticVendorFulfillmentsTable.id, id));

  if (!vf) return res.status(404).json({ message: "Fulfillment tidak ditemukan" });

  let catalogItem: {
    id: number; name: string; unit: string | null; kategori: string | null;
    description: string | null; priceBase: string; markupPct: string; priceSell: string | null;
  } | null = null;
  if (vf.vendorCatalogItemId) {
    const [ci] = await db
      .select({
        id:          vendorCatalogItemsTable.id,
        name:        vendorCatalogItemsTable.name,
        unit:        vendorCatalogItemsTable.unit,
        kategori:    vendorCatalogItemsTable.kategori,
        description: vendorCatalogItemsTable.description,
        priceBase:   vendorCatalogItemsTable.priceBase,
        markupPct:   vendorCatalogItemsTable.markupPct,
        priceSell:   vendorCatalogItemsTable.priceSell,
      })
      .from(vendorCatalogItemsTable)
      .where(eq(vendorCatalogItemsTable.id, vf.vendorCatalogItemId));
    catalogItem = ci ?? null;
  }

  const auditRows = await db.execute<{
    id: number; actor_name: string | null; action: string;
    description: string | null; old_value: unknown; new_value: unknown; created_at: string;
  }>(sql`
    SELECT id, actor_name, action, description, old_value, new_value, created_at
    FROM order_audit_logs
    WHERE order_id = ${vf.orderId}
      AND action = 'vendor_fulfillment_status'
      AND (new_value->>'fulfillmentId')::int = ${id}
    ORDER BY created_at ASC
  `);

  const allowedTransitions = TRANSITIONS[vf.status] ?? [];

  return res.json({
    id:              vf.id,
    orderId:         vf.orderId,
    orderItemId:     vf.orderItemId,
    vendorCatalogItemId: vf.vendorCatalogItemId,
    vendorId:        vf.vendorId,
    serviceType:     vf.serviceType,
    status:          vf.status,
    adminNotes:      vf.adminNotes,
    createdAt:       vf.createdAt?.toISOString() ?? "",
    updatedAt:       vf.updatedAt?.toISOString() ?? "",
    fulfillmentPayload: vf.fulfillmentPayload,
    calculationInput:   vf.calculationInput,
    templateSnapshot:   vf.templateSnapshot,
    priceSnapshot:      vf.priceSnapshot,
    allowedTransitions,
    order: {
      orderNumber:  vf.orderNumber ?? "",
      customerName: vf.customerName ?? "",
      companyName:  vf.companyName ?? "",
      status:       vf.orderStatus ?? "",
    },
    item: {
      serviceName: vf.itemServiceName ?? "",
      category:    vf.itemCategory ?? "",
      subtotal:    vf.itemSubtotal ? parseFloat(vf.itemSubtotal) : 0,
      inputData:   vf.itemInputData,
      itemSource:  vf.itemSource ?? "",
    },
    vendor: {
      id:    vf.vendorId,
      name:  vf.vendorName ?? "",
      phone: vf.vendorPhone ?? null,
      email: vf.vendorEmail ?? null,
    },
    catalogItem,
    auditHistory: (auditRows.rows ?? []).map((r) => ({
      id:          r.id,
      actorName:   r.actor_name,
      description: r.description,
      oldValue:    r.old_value,
      newValue:    r.new_value,
      createdAt:   r.created_at,
    })),
  });
});

// ─── PATCH /:id/status ────────────────────────────────────────────────────────
logisticVendorFulfillmentAdminRouter.patch("/:id/status", requireClerkUser, async (req: Request, res: Response) => {
  const id = parseInt(req.params.id ?? "", 10);
  if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

  const { status: newStatus, notes } = req.body as { status?: string; notes?: string };
  if (!newStatus || !VALID_STATUSES.has(newStatus)) {
    return res.status(400).json({ message: `Status tidak valid. Pilih: ${[...VALID_STATUSES].join(", ")}` });
  }

  const [vf] = await db
    .select({
      id:          logisticVendorFulfillmentsTable.id,
      orderId:     logisticVendorFulfillmentsTable.orderId,
      status:      logisticVendorFulfillmentsTable.status,
      adminNotes:  logisticVendorFulfillmentsTable.adminNotes,
      orderNumber: logisticOrdersTable.orderNumber,
    })
    .from(logisticVendorFulfillmentsTable)
    .leftJoin(logisticOrdersTable, eq(logisticOrdersTable.id, logisticVendorFulfillmentsTable.orderId))
    .where(eq(logisticVendorFulfillmentsTable.id, id));

  if (!vf) return res.status(404).json({ message: "Fulfillment tidak ditemukan" });

  const allowed = TRANSITIONS[vf.status] ?? [];
  if (!allowed.includes(newStatus)) {
    return res.status(422).json({
      message: `Tidak bisa transisi dari "${vf.status}" ke "${newStatus}". Transisi yang diizinkan: ${allowed.join(", ") || "tidak ada"}`,
    });
  }

  const updateFields: Partial<typeof logisticVendorFulfillmentsTable.$inferInsert> = {
    status:    newStatus,
    updatedAt: new Date(),
  };
  if (notes !== undefined) updateFields.adminNotes = notes.trim() || null;

  const [updated] = await db
    .update(logisticVendorFulfillmentsTable)
    .set(updateFields)
    .where(eq(logisticVendorFulfillmentsTable.id, id))
    .returning();

  const actor = (req as any).clerkUser;
  await logOrderAudit({
    orderId:     vf.orderId,
    orderNumber: vf.orderNumber ?? null,
    actorType:   "admin",
    actorId:     actor?.id ?? null,
    actorName:   actor?.name ?? actor?.email ?? "Admin",
    action:      "vendor_fulfillment_status",
    description: `VF#${id}: ${vf.status} → ${newStatus}${notes?.trim() ? ` — ${notes.trim()}` : ""}`,
    oldValue:    { status: vf.status, fulfillmentId: id },
    newValue:    { status: newStatus, fulfillmentId: id, notes: notes?.trim() || null },
    ipAddress:   req.ip ?? null,
  });

  logger.info({ fulfillmentId: id, from: vf.status, to: newStatus }, "vendor fulfillment status updated");

  return res.json({ ok: true, fulfillment: updated });
});
