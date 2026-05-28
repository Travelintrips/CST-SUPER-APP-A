import { Router } from "express";
import { db, shipmentsTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";

const router = Router();

// GET /api/logistics/shipments
router.get("/shipments", async (req, res) => {
  const page = Math.max(1, parseInt(String(req.query["page"] ?? "1"), 10) || 1);
  const limit = Math.min(500, Math.max(1, parseInt(String(req.query["limit"] ?? "50"), 10) || 50));
  const offset = (page - 1) * limit;

  const [{ total }] = await db.select({ total: count() }).from(shipmentsTable);
  const shipments = await db.select().from(shipmentsTable).orderBy(shipmentsTable.createdAt).limit(limit).offset(offset);
  return res.json({
    data: shipments.map(s => ({ ...s, createdAt: s.createdAt.toISOString() })),
    pagination: { page, limit, total: Number(total), totalPages: Math.ceil(Number(total) / limit) },
  });
});

// POST /api/logistics/shipments
router.post("/shipments", async (req, res) => {
  const { orderId, carrier, origin, destination, estimatedDelivery } = req.body;
  const trackingNumber = `TRK${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const [shipment] = await db.insert(shipmentsTable).values({
    orderId, trackingNumber, carrier, status: "pending", origin, destination, estimatedDelivery
  }).returning();
  return res.status(201).json({ ...shipment, createdAt: shipment.createdAt.toISOString() });
});

// PUT /api/logistics/shipments/:id
router.put("/shipments/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { status } = req.body;
  const [shipment] = await db.update(shipmentsTable).set({ status }).where(eq(shipmentsTable.id, id)).returning();
  if (!shipment) return res.status(404).json({ message: "Shipment not found" });
  return res.json({ ...shipment, createdAt: shipment.createdAt.toISOString() });
});

export default router;
