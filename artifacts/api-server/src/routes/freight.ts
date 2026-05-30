import { Router } from "express";
import { db, freightShipmentsTable, freightRfqsTable, freightQuotesTable, freightAttachmentsTable, shipmentStagesTable, salesDocumentsTable, purchaseDocumentsTable, expensesTable, freightCustomsDocsTable, freightShipmentAuditLogsTable, logisticOrdersTable, SHIPMENT_STAGE_TYPES, type ShipmentStageType } from "@workspace/db";
import { eq, desc, inArray, sum, and, sql } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { saveAndBroadcast } from "../lib/notificationStore.js";
import { ObjectStorageService } from "../lib/objectStorage.js";
import {
  sendShipmentUpdateNotification,
  sendDeliveryCompletedNotification,
  type LogisticOrderData,
} from "../lib/orderNotification.js";
import { logStorageEvent, getRequestIp, getActor } from "../lib/storageAuditLog.js";

const _freightObjectStorage = new ObjectStorageService();

function resolveUserDisplay(user: { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }): { name: string; id: string } {
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email || user.id;
  return { name, id: user.id };
}

const TRANSPORT_MODES = ["sea", "air", "land", "multimodal"] as const;
const CARGO_TYPES = ["FCL", "LCL", "Air"] as const;
const FREIGHT_SHIPMENT_STATUSES = ["draft", "rfq_sent", "confirmed", "in_transit", "completed", "cancelled"] as const;
type TransportMode = typeof TRANSPORT_MODES[number];
type CargoType = typeof CARGO_TYPES[number];
type FreightShipmentStatus = typeof FREIGHT_SHIPMENT_STATUSES[number];

function validateTransportMode(v: unknown): TransportMode | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (!TRANSPORT_MODES.includes(v as TransportMode))
    throw Object.assign(new Error(`transportMode tidak valid. Nilai yang diterima: ${TRANSPORT_MODES.join(", ")}`), { statusCode: 400 });
  return v as TransportMode;
}
function validateCargoType(v: unknown): CargoType | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  if (!CARGO_TYPES.includes(v as CargoType))
    throw Object.assign(new Error(`cargoType tidak valid. Nilai yang diterima: ${CARGO_TYPES.join(", ")}`), { statusCode: 400 });
  return v as CargoType;
}
function validateShipmentStatus(v: unknown): FreightShipmentStatus | undefined {
  if (v === undefined) return undefined;
  if (!FREIGHT_SHIPMENT_STATUSES.includes(v as FreightShipmentStatus))
    throw Object.assign(new Error(`status tidak valid. Nilai yang diterima: ${FREIGHT_SHIPMENT_STATUSES.join(", ")}`), { statusCode: 400 });
  return v as FreightShipmentStatus;
}

const STAGE_STATUSES = ["pending", "in_progress", "completed", "skipped"] as const;
type StageStatus = typeof STAGE_STATUSES[number];

function validateStageStatus(v: unknown): StageStatus | undefined {
  if (v === undefined) return undefined;
  if (!STAGE_STATUSES.includes(v as StageStatus))
    throw Object.assign(new Error(`status stage tidak valid. Nilai yang diterima: ${STAGE_STATUSES.join(", ")}`), { statusCode: 400 });
  return v as StageStatus;
}

function validateStageType(v: unknown): ShipmentStageType {
  if (!v || typeof v !== "string")
    throw Object.assign(new Error("stageType wajib diisi"), { statusCode: 400 });
  if (!(SHIPMENT_STAGE_TYPES as readonly string[]).includes(v))
    throw Object.assign(new Error(`stageType tidak valid. Nilai yang diterima: ${SHIPMENT_STAGE_TYPES.join(", ")}`), { statusCode: 400 });
  return v as ShipmentStageType;
}

const router = Router();

router.use(async (req, res, next) => {
  if (!(await requireClerkUser(req, res))) return;
  next();
});

function nextNumber(prefix: string) {
  const now = new Date();
  const yr = now.getFullYear();
  const seq = Date.now().toString().slice(-6);
  return `${prefix}/${yr}/${seq}`;
}

function serializeShipment(s: typeof freightShipmentsTable.$inferSelect) {
  return { ...s, createdAt: s.createdAt.toISOString() };
}
function serializeStage(s: typeof shipmentStagesTable.$inferSelect) {
  return { ...s, createdAt: s.createdAt.toISOString() };
}
function serializeRfq(r: typeof freightRfqsTable.$inferSelect) {
  return { ...r, createdAt: r.createdAt.toISOString() };
}
function serializeQuote(q: typeof freightQuotesTable.$inferSelect) {
  return { ...q, createdAt: q.createdAt.toISOString() };
}

// ─── FREIGHT SHIPMENTS ──────────────────────────────────────────────────────

// GET /api/logistics/freight-shipments
router.get("/freight-shipments", async (req, res) => {
  const salesDocId = req.query.salesDocId ? Number(req.query.salesDocId) : undefined;
  const rows = salesDocId
    ? await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.salesDocId, salesDocId)).orderBy(desc(freightShipmentsTable.createdAt))
    : await db.select().from(freightShipmentsTable).orderBy(desc(freightShipmentsTable.createdAt));
  // Bulk-fetch approved quote costs for all shipments in one query
  const shipmentIds = rows.map((r) => r.id);
  const approvedQuotes = shipmentIds.length > 0
    ? await db
        .select({ shipmentId: freightQuotesTable.shipmentId, totalCost: freightQuotesTable.totalCost })
        .from(freightQuotesTable)
        .where(
          and(
            eq(freightQuotesTable.status, "approved"),
            shipmentIds.length === 1
              ? eq(freightQuotesTable.shipmentId, shipmentIds[0]!)
              : inArray(freightQuotesTable.shipmentId, shipmentIds)
          )
        )
    : [];
  // Pick the first approved quote per shipment (consistent with detail page)
  const approvedCostMap = new Map<number, string | null>();
  for (const q of approvedQuotes) {
    if (!approvedCostMap.has(q.shipmentId)) {
      approvedCostMap.set(q.shipmentId, q.totalCost ?? null);
    }
  }

  // Bulk-fetch total expenses per shipment in one query
  const expenseTotals = shipmentIds.length > 0
    ? await db
        .select({ shipmentId: expensesTable.shipmentId, total: sum(expensesTable.total) })
        .from(expensesTable)
        .where(
          shipmentIds.length === 1
            ? eq(expensesTable.shipmentId, shipmentIds[0]!)
            : inArray(expensesTable.shipmentId, shipmentIds)
        )
        .groupBy(expensesTable.shipmentId)
    : [];
  const expenseTotalMap = new Map<number, string>();
  for (const e of expenseTotals) {
    if (e.shipmentId != null && e.total != null) {
      expenseTotalMap.set(e.shipmentId, e.total);
    }
  }

  return res.json(rows.map((r) => ({
    ...serializeShipment(r),
    approvedQuoteCost: approvedCostMap.get(r.id) ?? null,
    totalExpenses: expenseTotalMap.get(r.id) ?? null,
  })));
});

// GET /api/logistics/freight-shipments/:id
router.get("/freight-shipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [shipment] = await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  if (!shipment) return res.status(404).json({ message: "Shipment not found" });
  const rfqs = await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.shipmentId, id)).orderBy(desc(freightRfqsTable.createdAt));
  const rfqIds = rfqs.map((r) => r.id);
  const quotes = rfqIds.length > 0
    ? await db.select().from(freightQuotesTable)
        .where(rfqIds.length === 1 ? eq(freightQuotesTable.rfqId, rfqIds[0]!) : inArray(freightQuotesTable.rfqId, rfqIds))
        .orderBy(desc(freightQuotesTable.createdAt))
    : [];
  const stages = await db.select().from(shipmentStagesTable).where(eq(shipmentStagesTable.shipmentId, id));

  // Look up the logistic RFQ that spawned this freight shipment (if any).
  // freight_shipment_id was added via a manual migration, not in the Drizzle schema,
  // so we use raw SQL for this join.
  const linkedRfqRows = await db.execute(sql`
    SELECT r.id, r.rfq_number AS "rfqNumber", r.status AS "rfqStatus",
           r.order_id AS "orderId", o.order_number AS "orderNumber"
    FROM logistic_order_rfqs r
    LEFT JOIN logistic_orders o ON o.id = r.order_id
    WHERE r.freight_shipment_id = ${id}
    LIMIT 1
  `);

  const linkedLogisticRfqRow = (linkedRfqRows.rows as any[])[0] ?? null;
  const linkedLogisticRfq = linkedLogisticRfqRow
    ? {
        id: linkedLogisticRfqRow.id as number,
        rfqNumber: linkedLogisticRfqRow.rfqNumber as string,
        rfqStatus: linkedLogisticRfqRow.rfqStatus as string,
        orderId: linkedLogisticRfqRow.orderId as number,
        orderNumber: (linkedLogisticRfqRow.orderNumber as string) ?? null,
      }
    : null;

  return res.json({
    ...serializeShipment(shipment),
    rfqs: rfqs.map((r) => ({
      ...serializeRfq(r),
      quotes: quotes.filter((q) => q.rfqId === r.id).map(serializeQuote),
    })),
    stages: stages.map(serializeStage),
    linkedLogisticRfq,
  });
});

// POST /api/logistics/freight-shipments
router.post("/freight-shipments", async (req, res) => {
  const { shipperName, shipperAddress, consigneeName, consigneeAddress, commodity,
    grossWeight, netWeight, quantity, packingType, dimensions, hsCode, origin, destination,
    portOfLoading, portOfDischarge, vessel, voyage, notifyParty, marksAndNumbers, measurement, notes,
    transportMode, cargoType, containerNo, salesDocId, purchaseDocId } = req.body;
  if (!salesDocId) {
    return res.status(400).json({ message: "Sales Order wajib dipilih sebelum membuat shipment." });
  }
  let validatedTM: TransportMode | null;
  let validatedCT: CargoType | null;
  try {
    validatedTM = validateTransportMode(transportMode) ?? null;
    validatedCT = validateCargoType(cargoType) ?? null;
  } catch (e: any) {
    return res.status(400).json({ message: e.message });
  }
  const [linkedDoc] = await db.select({ id: salesDocumentsTable.id }).from(salesDocumentsTable).where(eq(salesDocumentsTable.id, Number(salesDocId))).limit(1);
  if (!linkedDoc) {
    return res.status(400).json({ message: "Sales Order tidak ditemukan." });
  }
  if (purchaseDocId) {
    const [linkedPO] = await db.select({ id: purchaseDocumentsTable.id }).from(purchaseDocumentsTable).where(eq(purchaseDocumentsTable.id, Number(purchaseDocId))).limit(1);
    if (!linkedPO) return res.status(400).json({ message: "Purchase Order tidak ditemukan." });
  }
  if (!shipperName || !consigneeName || !commodity || !origin || !destination) {
    return res.status(400).json({ message: "shipperName, consigneeName, commodity, origin, destination wajib diisi" });
  }
  const shipmentNumber = nextNumber("FS");
  const [shipment] = await db.insert(freightShipmentsTable).values({
    shipmentNumber, shipperName, shipperAddress: shipperAddress || null,
    consigneeName, consigneeAddress: consigneeAddress || null,
    commodity, grossWeight: grossWeight ? String(grossWeight) : null,
    netWeight: netWeight ? String(netWeight) : null,
    quantity: quantity ? Number(quantity) : null,
    packingType: packingType || null, dimensions: dimensions || null,
    hsCode: hsCode || null, origin, destination,
    portOfLoading: portOfLoading || null, portOfDischarge: portOfDischarge || null,
    vessel: vessel || null, voyage: voyage || null,
    notifyParty: notifyParty || null, marksAndNumbers: marksAndNumbers || null,
    measurement: measurement || null, notes: notes || null,
    transportMode: validatedTM,
    cargoType: validatedCT,
    containerNo: containerNo || null,
    salesDocId: salesDocId ? Number(salesDocId) : null,
    purchaseDocId: purchaseDocId ? Number(purchaseDocId) : null,
  }).returning();
  saveAndBroadcast("freight_shipment_created", {
    type: "freight_new",
    orderId: shipment!.id,
    orderNumber: shipment!.shipmentNumber,
    customerName: shipment!.shipperName,
    companyName: shipment!.consigneeName ?? null,
    origin: shipment!.origin,
    destination: shipment!.destination,
    commodity: shipment!.commodity,
    transportMode: shipment!.transportMode,
    createdAt: shipment!.createdAt.toISOString(),
  }).catch(() => {});
  return res.status(201).json(serializeShipment(shipment!));
});

// POST /api/logistics/freight-shipments/from-portal-order/:orderId
router.post("/freight-shipments/from-portal-order/:orderId", async (req, res) => {
  const orderId = Number(req.params.orderId);
  if (!Number.isInteger(orderId) || orderId <= 0)
    return res.status(400).json({ message: "ID order tidak valid" });

  const [order] = await db.select().from(logisticOrdersTable).where(eq(logisticOrdersTable.id, orderId));
  if (!order) return res.status(404).json({ message: "Portal order tidak ditemukan" });

  const [linkedDoc] = await db
    .select({ id: salesDocumentsTable.id, docNumber: salesDocumentsTable.docNumber })
    .from(salesDocumentsTable)
    .where(eq(salesDocumentsTable.logisticOrderId, orderId))
    .limit(1);

  if (!linkedDoc)
    return res.status(400).json({ message: "Buat Sales Order terlebih dahulu sebelum mengkonversi ke Freight Shipment." });

  const { transportMode: tmOverride, cargoType: ctOverride } = req.body as { transportMode?: string; cargoType?: string };

  let validatedTM: TransportMode | null = null;
  let validatedCT: CargoType | null = null;

  if (tmOverride) {
    try { validatedTM = validateTransportMode(tmOverride) ?? null; } catch { /* ignore */ }
  } else {
    const st = (order.shipmentType ?? "").toLowerCase();
    if (st.includes("sea") || st.includes("laut")) validatedTM = "sea";
    else if (st.includes("air") || st.includes("udara")) validatedTM = "air";
    else if (st.includes("truck") || st.includes("darat") || st.includes("land")) validatedTM = "land";
    else if (st.includes("multi")) validatedTM = "multimodal";
  }

  if (ctOverride) {
    try { validatedCT = validateCargoType(ctOverride) ?? null; } catch { /* ignore */ }
  }

  const shipmentNumber = nextNumber("FS");
  const [shipment] = await db.insert(freightShipmentsTable).values({
    shipmentNumber,
    shipperName: order.customerName,
    consigneeName: order.companyName ?? order.customerName,
    commodity: order.commodity ?? order.shipmentType ?? "General Cargo",
    origin: order.origin ?? "",
    destination: order.destination ?? "",
    grossWeight: order.grossWeight != null ? String(order.grossWeight) : null,
    quantity: order.jumlahKoli ?? null,
    notes: order.notes ?? null,
    transportMode: validatedTM,
    cargoType: validatedCT,
    salesDocId: linkedDoc.id,
  }).returning();

  saveAndBroadcast("freight_shipment_created", {
    type: "freight_new",
    orderId: shipment!.id,
    orderNumber: shipment!.shipmentNumber,
    customerName: shipment!.shipperName,
    companyName: shipment!.consigneeName ?? null,
    origin: shipment!.origin,
    destination: shipment!.destination,
    commodity: shipment!.commodity,
    transportMode: shipment!.transportMode,
    createdAt: shipment!.createdAt.toISOString(),
  }).catch(() => {});

  return res.status(201).json(serializeShipment(shipment!));
});

// PUT /api/logistics/freight-shipments/:id
router.put("/freight-shipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const { shipperName, shipperAddress, consigneeName, consigneeAddress, commodity,
    grossWeight, netWeight, quantity, packingType, dimensions, hsCode, origin, destination,
    portOfLoading, portOfDischarge, vessel, voyage, notifyParty, marksAndNumbers, measurement, status, notes,
    actualCost, departureDate, arrivalDate, trackingNumber, awbNumber,
    transportMode, cargoType, containerNo, salesDocId, purchaseDocId } = req.body;
  const [existing] = await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  if (!existing) return res.status(404).json({ message: "Shipment not found" });
  const patch: Partial<typeof freightShipmentsTable.$inferInsert> = {};
  if (shipperName !== undefined) patch.shipperName = shipperName;
  if (shipperAddress !== undefined) patch.shipperAddress = shipperAddress || null;
  if (consigneeName !== undefined) patch.consigneeName = consigneeName;
  if (consigneeAddress !== undefined) patch.consigneeAddress = consigneeAddress || null;
  if (commodity !== undefined) patch.commodity = commodity;
  if (grossWeight !== undefined) patch.grossWeight = grossWeight ? String(grossWeight) : null;
  if (netWeight !== undefined) patch.netWeight = netWeight ? String(netWeight) : null;
  if (quantity !== undefined) patch.quantity = quantity ? Number(quantity) : null;
  if (packingType !== undefined) patch.packingType = packingType || null;
  if (dimensions !== undefined) patch.dimensions = dimensions || null;
  if (hsCode !== undefined) patch.hsCode = hsCode || null;
  if (origin !== undefined) patch.origin = origin;
  if (destination !== undefined) patch.destination = destination;
  if (portOfLoading !== undefined) patch.portOfLoading = portOfLoading || null;
  if (portOfDischarge !== undefined) patch.portOfDischarge = portOfDischarge || null;
  if (vessel !== undefined) patch.vessel = vessel || null;
  if (voyage !== undefined) patch.voyage = voyage || null;
  if (notifyParty !== undefined) patch.notifyParty = notifyParty || null;
  if (marksAndNumbers !== undefined) patch.marksAndNumbers = marksAndNumbers || null;
  if (measurement !== undefined) patch.measurement = measurement || null;
  if (status !== undefined) {
    try { patch.status = validateShipmentStatus(status); }
    catch (e: any) { return res.status(400).json({ message: e.message }); }
  }
  if (notes !== undefined) patch.notes = notes || null;
  if (actualCost !== undefined) patch.actualCost = actualCost != null ? String(actualCost) : null;
  if (departureDate !== undefined) patch.departureDate = departureDate || null;
  if (arrivalDate !== undefined) patch.arrivalDate = arrivalDate || null;
  if (trackingNumber !== undefined) patch.trackingNumber = trackingNumber || null;
  if (awbNumber !== undefined) patch.awbNumber = awbNumber || null;
  if (transportMode !== undefined) {
    try { patch.transportMode = validateTransportMode(transportMode) ?? null; }
    catch (e: any) { return res.status(400).json({ message: e.message }); }
  }
  if (cargoType !== undefined) {
    try { patch.cargoType = validateCargoType(cargoType) ?? null; }
    catch (e: any) { return res.status(400).json({ message: e.message }); }
  }
  if (containerNo !== undefined) patch.containerNo = containerNo || null;
  if (salesDocId !== undefined) patch.salesDocId = salesDocId ? Number(salesDocId) : null;
  if (purchaseDocId !== undefined) {
    if (purchaseDocId) {
      const [linkedPO] = await db.select({ id: purchaseDocumentsTable.id }).from(purchaseDocumentsTable).where(eq(purchaseDocumentsTable.id, Number(purchaseDocId))).limit(1);
      if (!linkedPO) return res.status(400).json({ message: "Purchase order not found" });
    }
    patch.purchaseDocId = purchaseDocId ? Number(purchaseDocId) : null;
  }
  const [updated] = await db.update(freightShipmentsTable).set(patch).where(eq(freightShipmentsTable.id, id)).returning();
  if (status !== undefined && status !== existing.status) {
    const actor = req.user ? resolveUserDisplay(req.user as { id: string; firstName?: string | null; lastName?: string | null; email?: string | null }) : { name: "System", id: "system" };
    await db.insert(freightShipmentAuditLogsTable).values({
      shipmentId: updated!.id,
      shipmentNumber: updated!.shipmentNumber,
      fromStatus: existing.status,
      toStatus: updated!.status,
      changedBy: actor.name,
      changedById: actor.id,
    });
    saveAndBroadcast("freight_shipment_status", {
      type: "freight_status",
      orderId: updated!.id,
      orderNumber: updated!.shipmentNumber,
      customerName: updated!.shipperName,
      companyName: updated!.consigneeName ?? null,
      origin: updated!.origin,
      destination: updated!.destination,
      status: updated!.status,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});

    // Notifikasi template ke customer berdasarkan status baru
    const newStatus = updated!.status;
    if (newStatus === "in_transit" || newStatus === "completed") {
      // Cari logistic order via RFQ (freight_shipment_id disimpan di logistic_order_rfqs)
      db.execute(sql`
        SELECT lo.* FROM logistic_orders lo
        JOIN logistic_order_rfqs lor ON lor.order_id = lo.id
        WHERE lor.freight_shipment_id = ${updated!.id}
        LIMIT 1
      `).then((result) => {
        const row = result.rows[0] as (typeof logisticOrdersTable.$inferSelect) | undefined;
        if (!row?.phone) return;
        const orderData: LogisticOrderData = {
          id: Number(row.id),
          orderNumber: String(row.order_number ?? ""),
          customerName: String(row.customer_name ?? ""),
          companyName: String(row.company_name ?? ""),
          email: String(row.email ?? ""),
          phone: String(row.phone ?? ""),
          orderType: row.order_type ? String(row.order_type) : undefined,
          shipmentType: String(row.shipment_type ?? ""),
          origin: String(row.origin ?? ""),
          destination: String(row.destination ?? ""),
          commodity: row.commodity ? String(row.commodity) : null,
          cargoDescription: row.cargo_description ? String(row.cargo_description) : null,
          grossWeight: row.gross_weight ? Number(row.gross_weight) : null,
          volumeCbm: row.volume_cbm ? Number(row.volume_cbm) : null,
          jumlahKoli: row.jumlah_koli ? Number(row.jumlah_koli) : null,
          grandTotal: row.grand_total ? Number(row.grand_total) : 0,
          serviceList: String(row.shipment_type ?? ""),
          requiredDate: row.required_date ? String(row.required_date) : null,
          notes: row.notes ? String(row.notes) : null,
          jamOrder: row.jam_order ? String(row.jam_order) : null,
          vehicleType: row.truck_type ? String(row.truck_type) : null,
          createdAt: row.created_at ? new Date(String(row.created_at)) : null,
          publicRfqToken: row.public_rfq_token ? String(row.public_rfq_token) : null,
        };
        if (newStatus === "in_transit") {
          sendShipmentUpdateNotification(orderData, {
            vessel: updated!.vessel ?? undefined,
            voyage: updated!.voyage ?? undefined,
            containerNumber: updated!.containerNo ?? undefined,
            awbNumber: updated!.awbNumber ?? undefined,
          }).catch(() => {});
        } else if (newStatus === "completed") {
          sendDeliveryCompletedNotification(orderData).catch(() => {});
        }
      }).catch(() => {});
    }
  }
  return res.json(serializeShipment(updated!));
});

// GET /api/logistics/freight-shipments/:id/audit-log
router.get("/freight-shipments/:id/audit-log", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const logs = await db
    .select()
    .from(freightShipmentAuditLogsTable)
    .where(eq(freightShipmentAuditLogsTable.shipmentId, id))
    .orderBy(desc(freightShipmentAuditLogsTable.createdAt));
  return res.json(logs.map((l) => ({ ...l, createdAt: l.createdAt.toISOString() })));
});

// DELETE /api/logistics/freight-shipments/:id
router.delete("/freight-shipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  if (!existing) return res.status(404).json({ message: "Shipment not found" });
  // Ambil semua objectPath attachment sebelum DB cascade menghapus recordnya
  const attachments = await db
    .select({ objectPath: freightAttachmentsTable.objectPath })
    .from(freightAttachmentsTable)
    .where(eq(freightAttachmentsTable.shipmentId, id));
  await db.delete(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  // Cascade storage cleanup — hapus file fisik (non-fatal)
  for (const a of attachments) {
    if (a.objectPath) _freightObjectStorage.tryDeletePrivateEntity(a.objectPath).catch(() => {});
  }
  return res.json({ message: "Berhasil dihapus" });
});

// ─── SHIPMENT STAGES ─────────────────────────────────────────────────────────

// GET /api/logistics/freight-shipments/:shipmentId/stages
router.get("/freight-shipments/:shipmentId/stages", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) return res.status(400).json({ message: "Invalid shipmentId" });
  const rows = await db.select().from(shipmentStagesTable).where(eq(shipmentStagesTable.shipmentId, shipmentId));
  return res.json(rows.map(serializeStage));
});

// POST /api/logistics/freight-shipments/:shipmentId/stages  (upsert by stageType)
router.post("/freight-shipments/:shipmentId/stages", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) return res.status(400).json({ message: "Invalid shipmentId" });
  const { stageType, vendorName, date, status, notes } = req.body;
  let validatedStageType: StageType;
  let validatedStatus: StageStatus | undefined;
  try { validatedStageType = validateStageType(stageType); }
  catch (e: any) { return res.status(400).json({ message: e.message }); }
  try { validatedStatus = validateStageStatus(status); }
  catch (e: any) { return res.status(400).json({ message: e.message }); }
  const [existing] = await db.select().from(shipmentStagesTable)
    .where(eq(shipmentStagesTable.shipmentId, shipmentId))
    .then((rows) => rows.filter((r) => r.stageType === stageType));
  let stage;
  if (existing) {
    [stage] = await db.update(shipmentStagesTable)
      .set({
        vendorName: vendorName ?? null,
        date: date ?? null,
        status: validatedStatus ?? existing.status,
        notes: notes ?? null,
      })
      .where(eq(shipmentStagesTable.id, existing.id))
      .returning();
  } else {
    [stage] = await db.insert(shipmentStagesTable)
      .values({
        shipmentId,
        stageType: validatedStageType,
        vendorName: vendorName ?? null,
        date: date ?? null,
        status: validatedStatus ?? "pending",
        notes: notes ?? null,
      })
      .returning();
  }
  if (status !== undefined && status !== (existing?.status)) {
    const [parentShipment] = await db.select({ shipmentNumber: freightShipmentsTable.shipmentNumber, shipperName: freightShipmentsTable.shipperName, consigneeName: freightShipmentsTable.consigneeName })
      .from(freightShipmentsTable).where(eq(freightShipmentsTable.id, shipmentId)).limit(1);
    saveAndBroadcast("freight_stage_update", {
      type: "freight_stage",
      orderId: shipmentId,
      orderNumber: parentShipment?.shipmentNumber ?? `#${shipmentId}`,
      customerName: parentShipment?.shipperName ?? "—",
      companyName: parentShipment?.consigneeName ?? null,
      stageType: stage!.stageType,
      stageStatus: stage!.status,
      vendorName: stage!.vendorName ?? null,
      updatedAt: new Date().toISOString(),
    }).catch(() => {});
  }
  return res.json(serializeStage(stage!));
});

// ─── FREIGHT RFQs ────────────────────────────────────────────────────────────

// GET /api/logistics/freight-rfqs?shipmentId=:shipmentId
router.get("/freight-rfqs", async (req, res) => {
  const shipmentId = req.query.shipmentId ? Number(req.query.shipmentId) : undefined;
  const rows = shipmentId
    ? await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.shipmentId, shipmentId)).orderBy(desc(freightRfqsTable.createdAt))
    : await db.select().from(freightRfqsTable).orderBy(desc(freightRfqsTable.createdAt));
  return res.json(rows.map(serializeRfq));
});

// GET /api/logistics/freight-rfqs/:id
router.get("/freight-rfqs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [rfq] = await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.id, id));
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  const quotes = await db.select().from(freightQuotesTable).where(eq(freightQuotesTable.rfqId, id)).orderBy(desc(freightQuotesTable.createdAt));
  return res.json({ ...serializeRfq(rfq), quotes: quotes.map(serializeQuote) });
});

// POST /api/logistics/freight-shipments/:shipmentId/rfqs
router.post("/freight-shipments/:shipmentId/rfqs", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) return res.status(400).json({ message: "Invalid shipmentId" });
  const [shipment] = await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.id, shipmentId));
  if (!shipment) return res.status(404).json({ message: "Shipment not found" });
  const { vendorNames = [], notes } = req.body;
  const rfqNumber = nextNumber("RFQ-F");
  const [rfq] = await db.insert(freightRfqsTable).values({
    rfqNumber, shipmentId,
    vendorNames: Array.isArray(vendorNames) ? vendorNames : [],
    notes: notes || null, status: "open",
  }).returning();
  await db.update(freightShipmentsTable).set({ status: "rfq_sent" }).where(eq(freightShipmentsTable.id, shipmentId));
  return res.status(201).json(serializeRfq(rfq!));
});

// PUT /api/logistics/freight-rfqs/:id
router.put("/freight-rfqs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.id, id));
  if (!existing) return res.status(404).json({ message: "RFQ not found" });
  const { vendorNames, notes, status } = req.body;
  const patch: Partial<typeof freightRfqsTable.$inferInsert> = {};
  if (vendorNames !== undefined) patch.vendorNames = Array.isArray(vendorNames) ? vendorNames : [];
  if (notes !== undefined) patch.notes = notes || null;
  if (status !== undefined) patch.status = status;
  const [updated] = await db.update(freightRfqsTable).set(patch).where(eq(freightRfqsTable.id, id)).returning();
  return res.json(serializeRfq(updated!));
});

// DELETE /api/logistics/freight-rfqs/:id
router.delete("/freight-rfqs/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.id, id));
  if (!existing) return res.status(404).json({ message: "RFQ not found" });
  await db.delete(freightQuotesTable).where(eq(freightQuotesTable.rfqId, id));
  await db.delete(freightRfqsTable).where(eq(freightRfqsTable.id, id));
  return res.json({ message: "Berhasil dihapus" });
});

// ─── FREIGHT QUOTES ──────────────────────────────────────────────────────────

// GET /api/logistics/freight-quotes?rfqId=:rfqId
router.get("/freight-quotes", async (req, res) => {
  const rfqId = req.query.rfqId ? Number(req.query.rfqId) : undefined;
  const rows = rfqId
    ? await db.select().from(freightQuotesTable).where(eq(freightQuotesTable.rfqId, rfqId)).orderBy(desc(freightQuotesTable.createdAt))
    : await db.select().from(freightQuotesTable).orderBy(desc(freightQuotesTable.createdAt));
  return res.json(rows.map(serializeQuote));
});

// GET /api/logistics/freight-quotes/:id
router.get("/freight-quotes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [quote] = await db.select().from(freightQuotesTable).where(eq(freightQuotesTable.id, id));
  if (!quote) return res.status(404).json({ message: "Quote not found" });
  return res.json(serializeQuote(quote));
});

// POST /api/logistics/freight-rfqs/:rfqId/quotes
router.post("/freight-rfqs/:rfqId/quotes", async (req, res) => {
  const rfqId = Number(req.params.rfqId);
  if (!Number.isInteger(rfqId) || rfqId <= 0) return res.status(400).json({ message: "Invalid rfqId" });
  const [rfq] = await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.id, rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  const { vendorName, truckingCost = 0, handlingCost = 0, freightCost = 0, otherCost = 0, estimatedDays, notes } = req.body;
  if (!vendorName) return res.status(400).json({ message: "vendorName wajib diisi" });
  const totalCost = Number(truckingCost) + Number(handlingCost) + Number(freightCost) + Number(otherCost);
  const [quote] = await db.insert(freightQuotesTable).values({
    rfqId, shipmentId: rfq.shipmentId, vendorName,
    truckingCost: String(truckingCost), handlingCost: String(handlingCost),
    freightCost: String(freightCost), otherCost: String(otherCost),
    totalCost: String(totalCost),
    estimatedDays: estimatedDays ? Number(estimatedDays) : null,
    notes: notes || null,
  }).returning();
  return res.status(201).json(serializeQuote(quote!));
});

// PUT /api/logistics/freight-quotes/:id
router.put("/freight-quotes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(freightQuotesTable).where(eq(freightQuotesTable.id, id));
  if (!existing) return res.status(404).json({ message: "Quote not found" });
  const { vendorName, truckingCost, handlingCost, freightCost, otherCost, estimatedDays, notes } = req.body;
  const tc = truckingCost !== undefined ? Number(truckingCost) : Number(existing.truckingCost ?? 0);
  const hc = handlingCost !== undefined ? Number(handlingCost) : Number(existing.handlingCost ?? 0);
  const fc = freightCost !== undefined ? Number(freightCost) : Number(existing.freightCost ?? 0);
  const oc = otherCost !== undefined ? Number(otherCost) : Number(existing.otherCost ?? 0);
  const totalCost = tc + hc + fc + oc;
  const patch: Partial<typeof freightQuotesTable.$inferInsert> = {
    truckingCost: String(tc), handlingCost: String(hc), freightCost: String(fc),
    otherCost: String(oc), totalCost: String(totalCost),
  };
  if (vendorName !== undefined) patch.vendorName = vendorName;
  if (estimatedDays !== undefined) patch.estimatedDays = estimatedDays ? Number(estimatedDays) : null;
  if (notes !== undefined) patch.notes = notes || null;
  const [updated] = await db.update(freightQuotesTable).set(patch).where(eq(freightQuotesTable.id, id)).returning();
  return res.json(serializeQuote(updated!));
});

// DELETE /api/logistics/freight-quotes/:id
router.delete("/freight-quotes/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(freightQuotesTable).where(eq(freightQuotesTable.id, id));
  if (!existing) return res.status(404).json({ message: "Quote not found" });
  await db.delete(freightQuotesTable).where(eq(freightQuotesTable.id, id));
  return res.json({ message: "Berhasil dihapus" });
});

// POST /api/logistics/freight-quotes/:id/approve
router.post("/freight-quotes/:id/approve", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [quote] = await db.select().from(freightQuotesTable).where(eq(freightQuotesTable.id, id));
  if (!quote) return res.status(404).json({ message: "Quote not found" });
  const [rfq] = await db.select().from(freightRfqsTable).where(eq(freightRfqsTable.id, quote.rfqId));
  if (!rfq) return res.status(404).json({ message: "RFQ not found" });
  const approved = await db.transaction(async (tx) => {
    await tx.update(freightQuotesTable)
      .set({ status: "rejected" })
      .where(eq(freightQuotesTable.rfqId, quote.rfqId));
    const [approvedQuote] = await tx.update(freightQuotesTable)
      .set({ status: "approved" })
      .where(eq(freightQuotesTable.id, id))
      .returning();
    await tx.update(freightRfqsTable).set({ status: "closed" }).where(eq(freightRfqsTable.id, quote.rfqId));
    await tx.update(freightShipmentsTable)
      .set({ status: "confirmed", approvedVendorName: quote.vendorName })
      .where(eq(freightShipmentsTable.id, rfq.shipmentId));
    return approvedQuote!;
  });
  return res.json(serializeQuote(approved));
});

// GET /api/logistics/freight-shipments/:id/profitability
router.get("/freight-shipments/:id/profitability", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });

  const [shipment] = await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  if (!shipment) return res.status(404).json({ message: "Shipment not found" });

  // Revenue: from linked Sales Order grand total (only if invoiced)
  let revenue = 0;
  let invoiceStatus = "none";
  if (shipment.salesDocId) {
    const [doc] = await db.select({
      grandTotal: salesDocumentsTable.grandTotal,
      invoiceStatus: salesDocumentsTable.invoiceStatus,
    }).from(salesDocumentsTable).where(eq(salesDocumentsTable.id, shipment.salesDocId));
    if (doc) {
      invoiceStatus = doc.invoiceStatus;
      if (doc.invoiceStatus === "invoiced") revenue = Number(doc.grandTotal);
    }
  }

  // Cost: sum of all expenses linked to this shipment
  const [expResult] = await db.select({ total: sum(expensesTable.total) })
    .from(expensesTable)
    .where(eq(expensesTable.shipmentId, id));
  const totalCost = Number(expResult?.total ?? 0);

  const profit = revenue - totalCost;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : null;

  return res.json({ revenue, totalCost, profit, margin, invoiceStatus });
});

// ─── Freight Attachments ────────────────────────────────────────────────────

// GET /api/logistics/freight-shipments/:shipmentId/attachments
router.get("/freight-shipments/:shipmentId/attachments", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) return res.status(400).json({ message: "Invalid shipmentId" });
  const attachments = await db
    .select()
    .from(freightAttachmentsTable)
    .where(eq(freightAttachmentsTable.shipmentId, shipmentId))
    .orderBy(desc(freightAttachmentsTable.createdAt));
  return res.json(attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })));
});

// POST /api/logistics/freight-shipments/:shipmentId/attachments
router.post("/freight-shipments/:shipmentId/attachments", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId) || shipmentId <= 0) return res.status(400).json({ message: "Invalid shipmentId" });
  const { objectPath, fileName, contentType, fileType, label, docType, docNumber, docDate, docStatus, invoiceId } = req.body;
  if (!objectPath || !fileName || !contentType || !fileType) {
    return res.status(400).json({ message: "objectPath, fileName, contentType, fileType wajib diisi" });
  }
  if (!["photo", "document"].includes(fileType)) {
    return res.status(400).json({ message: "fileType harus photo atau document" });
  }
  const [existing] = await db.select({ id: freightShipmentsTable.id }).from(freightShipmentsTable).where(eq(freightShipmentsTable.id, shipmentId));
  if (!existing) return res.status(404).json({ message: "Shipment tidak ditemukan" });

  // Duplicate guard: reject if the same objectPath is already linked to this shipment
  const [dup] = await db.select({ id: freightAttachmentsTable.id })
    .from(freightAttachmentsTable)
    .where(and(eq(freightAttachmentsTable.shipmentId, shipmentId), eq(freightAttachmentsTable.objectPath, String(objectPath))))
    .limit(1);
  if (dup) return res.status(409).json({ message: "File ini sudah terlampir ke shipment ini" });

  // Verify objectPath actually exists in storage before persisting the link
  if (String(objectPath).startsWith("/objects/")) {
    try {
      await _freightObjectStorage.getObjectEntityFile(String(objectPath));
    } catch {
      return res.status(422).json({ message: "File tidak ditemukan di storage. Pastikan upload berhasil sebelum melampirkan." });
    }
  }

  const [attachment] = await db.insert(freightAttachmentsTable).values({
    shipmentId, objectPath, fileName, contentType,
    fileType: fileType as "photo" | "document",
    label: label || null,
    docType: docType || null,
    docNumber: docNumber || null,
    docDate: docDate || null,
    docStatus: docStatus || null,
    invoiceId: invoiceId ? Number(invoiceId) : null,
  }).returning();
  const actor = getActor(req);
  logStorageEvent({
    action: "upload",
    entityType: "freight_attachment",
    entityId: attachment!.id,
    objectPath: String(objectPath),
    fileName: String(fileName),
    contentType: String(contentType),
    actorId: actor.actorId,
    actorType: actor.actorType,
    ipAddress: getRequestIp(req),
    details: `shipmentId=${shipmentId} docType=${docType ?? "-"}`,
  });
  return res.status(201).json({ ...attachment!, createdAt: attachment!.createdAt.toISOString() });
});

// PUT /api/logistics/freight-shipments/:shipmentId/attachments/:attachmentId
router.put("/freight-shipments/:shipmentId/attachments/:attachmentId", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(shipmentId) || !Number.isInteger(attachmentId)) return res.status(400).json({ message: "Invalid id" });
  const { label, docType, docNumber, docDate, docStatus, invoiceId } = req.body;
  const patch: Record<string, unknown> = {};
  if (label !== undefined) patch.label = label || null;
  if (docType !== undefined) patch.docType = docType || null;
  if (docNumber !== undefined) patch.docNumber = docNumber || null;
  if (docDate !== undefined) patch.docDate = docDate || null;
  if (docStatus !== undefined) patch.docStatus = docStatus || null;
  if (invoiceId !== undefined) patch.invoiceId = invoiceId ? Number(invoiceId) : null;
  if (Object.keys(patch).length === 0) return res.status(400).json({ message: "No fields to update" });
  const [updated] = await db.update(freightAttachmentsTable).set(patch).where(eq(freightAttachmentsTable.id, attachmentId)).returning();
  if (!updated) return res.status(404).json({ message: "Attachment tidak ditemukan" });
  return res.json({ ...updated, createdAt: updated.createdAt.toISOString() });
});

// DELETE /api/logistics/freight-shipments/:shipmentId/attachments/:attachmentId
router.delete("/freight-shipments/:shipmentId/attachments/:attachmentId", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  const attachmentId = Number(req.params.attachmentId);
  if (!Number.isInteger(shipmentId) || !Number.isInteger(attachmentId)) return res.status(400).json({ message: "Invalid id" });
  // Filter by BOTH id AND shipmentId to prevent IDOR (deleting another shipment's attachment)
  const [deleted] = await db
    .delete(freightAttachmentsTable)
    .where(and(eq(freightAttachmentsTable.id, attachmentId), eq(freightAttachmentsTable.shipmentId, shipmentId)))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Attachment tidak ditemukan" });
  // Delete the underlying GCS object (non-fatal — DB record already removed)
  if (deleted.objectPath) {
    _freightObjectStorage.tryDeletePrivateEntity(deleted.objectPath).catch(() => {});
  }
  const actor = getActor(req);
  logStorageEvent({
    action: "delete",
    entityType: "freight_attachment",
    entityId: deleted.id,
    objectPath: deleted.objectPath,
    fileName: deleted.fileName,
    contentType: deleted.contentType,
    actorId: actor.actorId,
    actorType: actor.actorType,
    ipAddress: getRequestIp(req),
    details: `shipmentId=${shipmentId}`,
  });
  return res.json({ message: "Deleted" });
});

// ─── FREIGHT CUSTOMS DOCS ────────────────────────────────────────────────────

// GET /api/logistics/freight-shipments/:shipmentId/customs-docs
router.get("/freight-shipments/:shipmentId/customs-docs", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId)) return res.status(400).json({ message: "Invalid id" });
  const docs = await db
    .select()
    .from(freightCustomsDocsTable)
    .where(eq(freightCustomsDocsTable.shipmentId, shipmentId))
    .orderBy(desc(freightCustomsDocsTable.createdAt));
  return res.json(docs.map((d) => ({ ...d, createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })));
});

// POST /api/logistics/freight-shipments/:shipmentId/customs-docs
router.post("/freight-shipments/:shipmentId/customs-docs", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  if (!Number.isInteger(shipmentId)) return res.status(400).json({ message: "Invalid id" });
  const { docType, nomorAju, nomorDokumen, tanggalDokumen, data, scanSource, notes } = req.body;
  if (!docType) return res.status(400).json({ message: "docType wajib diisi" });
  const [created] = await db.insert(freightCustomsDocsTable).values({
    shipmentId,
    docType,
    nomorAju: nomorAju || null,
    nomorDokumen: nomorDokumen || null,
    tanggalDokumen: tanggalDokumen || null,
    data: data ?? {},
    scanSource: scanSource || "manual",
    notes: notes || null,
  }).returning();
  return res.status(201).json({ ...created, createdAt: created.createdAt.toISOString(), updatedAt: created.updatedAt.toISOString() });
});

// PUT /api/logistics/freight-shipments/:shipmentId/customs-docs/:docId
router.put("/freight-shipments/:shipmentId/customs-docs/:docId", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  const docId = Number(req.params.docId);
  if (!Number.isInteger(shipmentId) || !Number.isInteger(docId)) return res.status(400).json({ message: "Invalid id" });
  const { docType, nomorAju, nomorDokumen, tanggalDokumen, data, notes } = req.body;
  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if (docType !== undefined) patch.docType = docType;
  if (nomorAju !== undefined) patch.nomorAju = nomorAju || null;
  if (nomorDokumen !== undefined) patch.nomorDokumen = nomorDokumen || null;
  if (tanggalDokumen !== undefined) patch.tanggalDokumen = tanggalDokumen || null;
  if (data !== undefined) patch.data = data;
  if (notes !== undefined) patch.notes = notes || null;
  const [updated] = await db
    .update(freightCustomsDocsTable)
    .set(patch)
    .where(and(eq(freightCustomsDocsTable.id, docId), eq(freightCustomsDocsTable.shipmentId, shipmentId)))
    .returning();
  if (!updated) return res.status(404).json({ message: "Dokumen tidak ditemukan" });
  return res.json({ ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() });
});

// DELETE /api/logistics/freight-shipments/:shipmentId/customs-docs/:docId
router.delete("/freight-shipments/:shipmentId/customs-docs/:docId", async (req, res) => {
  const shipmentId = Number(req.params.shipmentId);
  const docId = Number(req.params.docId);
  if (!Number.isInteger(shipmentId) || !Number.isInteger(docId)) return res.status(400).json({ message: "Invalid id" });
  const [deleted] = await db
    .delete(freightCustomsDocsTable)
    .where(and(eq(freightCustomsDocsTable.id, docId), eq(freightCustomsDocsTable.shipmentId, shipmentId)))
    .returning();
  if (!deleted) return res.status(404).json({ message: "Dokumen tidak ditemukan" });
  return res.json({ message: "Deleted" });
});

export default router;
