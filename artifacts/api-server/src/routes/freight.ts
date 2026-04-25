import { Router } from "express";
import { db, freightShipmentsTable, freightRfqsTable, freightQuotesTable } from "@workspace/db";
import { eq, desc, inArray } from "drizzle-orm";

const router = Router();

function nextNumber(prefix: string) {
  const now = new Date();
  const yr = now.getFullYear();
  const seq = Date.now().toString().slice(-6);
  return `${prefix}/${yr}/${seq}`;
}

function serializeShipment(s: typeof freightShipmentsTable.$inferSelect) {
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
router.get("/freight-shipments", async (_req, res) => {
  const rows = await db.select().from(freightShipmentsTable).orderBy(desc(freightShipmentsTable.createdAt));
  return res.json(rows.map(serializeShipment));
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
  return res.json({
    ...serializeShipment(shipment),
    rfqs: rfqs.map((r) => ({
      ...serializeRfq(r),
      quotes: quotes.filter((q) => q.rfqId === r.id).map(serializeQuote),
    })),
  });
});

// POST /api/logistics/freight-shipments
router.post("/freight-shipments", async (req, res) => {
  const { shipperName, shipperAddress, consigneeName, consigneeAddress, commodity,
    grossWeight, netWeight, quantity, packingType, dimensions, hsCode, origin, destination, notes } = req.body;
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
    hsCode: hsCode || null, origin, destination, notes: notes || null,
  }).returning();
  return res.status(201).json(serializeShipment(shipment!));
});

// PUT /api/logistics/freight-shipments/:id
router.put("/freight-shipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const { shipperName, shipperAddress, consigneeName, consigneeAddress, commodity,
    grossWeight, netWeight, quantity, packingType, dimensions, hsCode, origin, destination, status, notes } = req.body;
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
  if (status !== undefined) patch.status = status;
  if (notes !== undefined) patch.notes = notes || null;
  const [updated] = await db.update(freightShipmentsTable).set(patch).where(eq(freightShipmentsTable.id, id)).returning();
  return res.json(serializeShipment(updated!));
});

// DELETE /api/logistics/freight-shipments/:id
router.delete("/freight-shipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ message: "Invalid id" });
  const [existing] = await db.select().from(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  if (!existing) return res.status(404).json({ message: "Shipment not found" });
  await db.delete(freightShipmentsTable).where(eq(freightShipmentsTable.id, id));
  return res.json({ message: "Berhasil dihapus" });
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
  await db.update(freightQuotesTable)
    .set({ status: "rejected" })
    .where(eq(freightQuotesTable.rfqId, quote.rfqId));
  const [approved] = await db.update(freightQuotesTable)
    .set({ status: "approved" })
    .where(eq(freightQuotesTable.id, id))
    .returning();
  await db.update(freightRfqsTable).set({ status: "closed" }).where(eq(freightRfqsTable.id, quote.rfqId));
  await db.update(freightShipmentsTable).set({ status: "confirmed" }).where(eq(freightShipmentsTable.id, rfq.shipmentId));
  return res.json(serializeQuote(approved!));
});

export default router;
