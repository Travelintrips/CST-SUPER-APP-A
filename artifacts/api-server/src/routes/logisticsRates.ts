import { Router } from "express";
import { z } from "zod";
import { db } from "@workspace/db";
import {
  logisticsRateCardsTable,
  logisticsServiceRatesTable,
  logisticsSurchargesTable,
} from "@workspace/db";
import { eq, and, asc, isNull, or, gte, lte } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";

const router = Router();

// ─── helpers ───────────────────────────────────────────────────────────────

const SERVICE_TYPES = [
  "seaFreight",
  "airFreight",
  "customs",
  "trucking",
  "warehousing",
  "projectCargo",
] as const;
type ServiceType = (typeof SERVICE_TYPES)[number];

/** Bangun object rates yang backward-compatible dengan DEFAULT_SERVICE_RATES_V2 */
function buildRatesCompat(
  cards: (typeof logisticsRateCardsTable.$inferSelect)[],
  rateItems: (typeof logisticsServiceRatesTable.$inferSelect)[],
  surcharges: (typeof logisticsSurchargesTable.$inferSelect)[]
) {
  const now = new Date();
  const result: Record<string, Record<string, unknown>> = {};

  for (const serviceType of SERVICE_TYPES) {
    const card = cards.find(
      (c) =>
        c.serviceType === serviceType &&
        c.isActive &&
        (!c.validFrom || c.validFrom <= now) &&
        (!c.validTo || c.validTo >= now)
    );
    if (!card) continue;

    const items = rateItems
      .filter((r) => r.rateCardId === card.id)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const surchs = surcharges
      .filter((s) => s.serviceType === serviceType && s.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const obj: Record<string, unknown> = {};

    // Base rates from items
    for (const item of items) {
      const val =
        item.valueType === "percentage"
          ? Number(item.valueAmount)
          : Number(item.valueAmount);

      if (item.containerType) {
        // nested ratePerContainer
        if (!obj["ratePerContainer"]) obj["ratePerContainer"] = {};
        (obj["ratePerContainer"] as Record<string, number>)[item.containerType] = val;
      } else if (item.vehicleType) {
        if (!obj["vehicleRates"]) obj["vehicleRates"] = {};
        (obj["vehicleRates"] as Record<string, number>)[item.vehicleType] = val;
      } else {
        obj[item.rateKey] = val;
      }
    }

    // Append surcharges list for frontend
    obj["_surcharges"] = surchs.map((s) => ({
      id: s.id,
      name: s.name,
      label: s.label,
      surchargeType: s.surchargeType,
      amount: Number(s.amount),
      unit: s.unit,
      isMandatory: s.isMandatory,
      appliesTo: s.appliesTo,
    }));

    result[serviceType] = obj;
  }

  return result;
}

// ─── DEFAULT SEED DATA (mirror of portal.ts DEFAULT_SERVICE_RATES_V2) ──────

const DEFAULT_SEED: Record<ServiceType, { name: string; rates: { rateKey: string; label: string; valueType: "fixed" | "percentage"; valueAmount: number; containerType?: string; vehicleType?: string; sortOrder: number }[] }> = {
  airFreight: {
    name: "Air Freight Standard",
    rates: [
      { rateKey: "ratePerKg", label: "Rate per Kg", valueType: "fixed", valueAmount: 90000, sortOrder: 1 },
      { rateKey: "fuelSurchargePct", label: "Fuel Surcharge (%)", valueType: "percentage", valueAmount: 25, sortOrder: 2 },
      { rateKey: "securityFeePerKg", label: "Security Fee per Kg", valueType: "fixed", valueAmount: 2000, sortOrder: 3 },
      { rateKey: "handlingFee", label: "Handling Fee", valueType: "fixed", valueAmount: 350000, sortOrder: 4 },
      { rateKey: "awbFee", label: "AWB Fee", valueType: "fixed", valueAmount: 250000, sortOrder: 5 },
      { rateKey: "documentationFee", label: "Documentation Fee", valueType: "fixed", valueAmount: 200000, sortOrder: 6 },
      { rateKey: "insurancePct", label: "Insurance (%)", valueType: "percentage", valueAmount: 0.15, sortOrder: 7 },
      { rateKey: "ppnPct", label: "PPN (%)", valueType: "percentage", valueAmount: 11, sortOrder: 8 },
    ],
  },
  seaFreight: {
    name: "Sea Freight Standard",
    rates: [
      { rateKey: "ratePerCbmLcl", label: "Rate per CBM (LCL)", valueType: "fixed", valueAmount: 2500000, sortOrder: 1 },
      { rateKey: "ratePerContainer", label: "Rate per Container (20GP)", valueType: "fixed", valueAmount: 12000000, containerType: "20GP", sortOrder: 2 },
      { rateKey: "ratePerContainer", label: "Rate per Container (40GP)", valueType: "fixed", valueAmount: 18000000, containerType: "40GP", sortOrder: 3 },
      { rateKey: "ratePerContainer", label: "Rate per Container (40HC)", valueType: "fixed", valueAmount: 20000000, containerType: "40HC", sortOrder: 4 },
      { rateKey: "ratePerContainer", label: "Rate per Container (Reefer)", valueType: "fixed", valueAmount: 35000000, containerType: "Reefer", sortOrder: 5 },
      { rateKey: "ratePerContainer", label: "Rate per Container (Open Top)", valueType: "fixed", valueAmount: 25000000, containerType: "Open Top", sortOrder: 6 },
      { rateKey: "ratePerContainer", label: "Rate per Container (Flat Rack)", valueType: "fixed", valueAmount: 28000000, containerType: "Flat Rack", sortOrder: 7 },
      { rateKey: "thc", label: "THC", valueType: "fixed", valueAmount: 1500000, sortOrder: 8 },
      { rateKey: "documentationFee", label: "Documentation Fee", valueType: "fixed", valueAmount: 750000, sortOrder: 9 },
      { rateKey: "customsClearance", label: "Customs Clearance", valueType: "fixed", valueAmount: 1500000, sortOrder: 10 },
      { rateKey: "truckingFee", label: "Trucking Fee", valueType: "fixed", valueAmount: 1200000, sortOrder: 11 },
      { rateKey: "insurancePct", label: "Insurance (%)", valueType: "percentage", valueAmount: 0.10, sortOrder: 12 },
      { rateKey: "ppnPct", label: "PPN (%)", valueType: "percentage", valueAmount: 11, sortOrder: 13 },
    ],
  },
  customs: {
    name: "PPJK / Customs Clearance Standard",
    rates: [
      { rateKey: "jasaPpjk", label: "Jasa PPJK", valueType: "fixed", valueAmount: 2500000, sortOrder: 1 },
      { rateKey: "customsHandling", label: "Customs Handling", valueType: "fixed", valueAmount: 750000, sortOrder: 2 },
      { rateKey: "documentProcessing", label: "Document Processing", valueType: "fixed", valueAmount: 500000, sortOrder: 3 },
      { rateKey: "pibSubmission", label: "PIB Submission", valueType: "fixed", valueAmount: 350000, sortOrder: 4 },
      { rateKey: "courierFee", label: "Courier Fee", valueType: "fixed", valueAmount: 150000, sortOrder: 5 },
      { rateKey: "additionalServiceFee", label: "Additional Service Fee", valueType: "fixed", valueAmount: 500000, sortOrder: 6 },
    ],
  },
  trucking: {
    name: "Domestic Trucking Standard",
    rates: [
      { rateKey: "vehicleRates", label: "Pickup Rate", valueType: "fixed", valueAmount: 500000, vehicleType: "pickup", sortOrder: 1 },
      { rateKey: "vehicleRates", label: "Blind Van Rate", valueType: "fixed", valueAmount: 600000, vehicleType: "blindVan", sortOrder: 2 },
      { rateKey: "vehicleRates", label: "CDE Rate", valueType: "fixed", valueAmount: 750000, vehicleType: "CDE", sortOrder: 3 },
      { rateKey: "vehicleRates", label: "CDD Rate", valueType: "fixed", valueAmount: 1000000, vehicleType: "CDD", sortOrder: 4 },
      { rateKey: "vehicleRates", label: "Fuso Rate", valueType: "fixed", valueAmount: 1500000, vehicleType: "Fuso", sortOrder: 5 },
      { rateKey: "vehicleRates", label: "Wingbox Rate", valueType: "fixed", valueAmount: 2000000, vehicleType: "Wingbox", sortOrder: 6 },
      { rateKey: "vehicleRates", label: "Trailer 20FT Rate", valueType: "fixed", valueAmount: 3500000, vehicleType: "Trailer 20FT", sortOrder: 7 },
      { rateKey: "vehicleRates", label: "Trailer 40FT Rate", valueType: "fixed", valueAmount: 5000000, vehicleType: "Trailer 40FT", sortOrder: 8 },
      { rateKey: "distanceRatePerKm", label: "Distance Rate per Km", valueType: "fixed", valueAmount: 8500, sortOrder: 9 },
      { rateKey: "loadingFee", label: "Loading Fee", valueType: "fixed", valueAmount: 350000, sortOrder: 10 },
      { rateKey: "unloadingFee", label: "Unloading Fee", valueType: "fixed", valueAmount: 350000, sortOrder: 11 },
      { rateKey: "overnightFee", label: "Overnight Fee", valueType: "fixed", valueAmount: 500000, sortOrder: 12 },
      { rateKey: "helperFeePerDay", label: "Helper Fee per Day", valueType: "fixed", valueAmount: 200000, sortOrder: 13 },
    ],
  },
  warehousing: {
    name: "Warehousing Standard",
    rates: [
      { rateKey: "palletRatePerDay", label: "Pallet Rate per Day", valueType: "fixed", valueAmount: 15000, sortOrder: 1 },
      { rateKey: "cbmRatePerDay", label: "CBM Rate per Day", valueType: "fixed", valueAmount: 25000, sortOrder: 2 },
      { rateKey: "sqmRatePerDay", label: "SQM Rate per Day", valueType: "fixed", valueAmount: 8000, sortOrder: 3 },
      { rateKey: "inboundFee", label: "Inbound Fee", valueType: "fixed", valueAmount: 25000, sortOrder: 4 },
      { rateKey: "outboundFeePerPallet", label: "Outbound Fee per Pallet", valueType: "fixed", valueAmount: 25000, sortOrder: 5 },
      { rateKey: "inventoryFeePerMonth", label: "Inventory Fee per Month", valueType: "fixed", valueAmount: 500000, sortOrder: 6 },
    ],
  },
  projectCargo: {
    name: "Project Cargo Standard",
    rates: [
      { rateKey: "surveyFee", label: "Survey Fee", valueType: "fixed", valueAmount: 2500000, sortOrder: 1 },
      { rateKey: "permitFee", label: "Permit & Escort Fee", valueType: "fixed", valueAmount: 5000000, sortOrder: 2 },
      { rateKey: "engineeringFee", label: "Engineering & Rigging", valueType: "fixed", valueAmount: 7500000, sortOrder: 3 },
      { rateKey: "handlingFee", label: "Special Handling", valueType: "fixed", valueAmount: 10000000, sortOrder: 4 },
      { rateKey: "insurancePct", label: "Insurance (%)", valueType: "percentage", valueAmount: 0.25, sortOrder: 5 },
    ],
  },
};

/** Seed default rates jika tabel kosong */
async function ensureSeedData() {
  let existing: { id: number }[];
  try {
    existing = await db.select({ id: logisticsRateCardsTable.id }).from(logisticsRateCardsTable).limit(1);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("does not exist")) return; // tabel belum dibuat, skip seed
    throw err;
  }
  if (existing.length > 0) return; // sudah ada data

  for (const [serviceType, def] of Object.entries(DEFAULT_SEED) as [ServiceType, typeof DEFAULT_SEED[ServiceType]][]) {
    const [card] = await db
      .insert(logisticsRateCardsTable)
      .values({ serviceType, name: def.name, isActive: true })
      .returning();

    if (card) {
      await db.insert(logisticsServiceRatesTable).values(
        def.rates.map((r) => ({
          rateCardId: card.id,
          rateKey: r.rateKey,
          label: r.label,
          valueType: r.valueType,
          valueAmount: String(r.valueAmount),
          containerType: r.containerType ?? null,
          vehicleType: r.vehicleType ?? null,
          sortOrder: r.sortOrder,
        }))
      );
    }
  }
}

// ─── PUBLIC ROUTES ──────────────────────────────────────────────────────────

// GET /api/logistics-rates/all — semua service rates (backward-compat dengan calculator-rates-v2)
router.get("/all", async (_req, res) => {
  try {
    await ensureSeedData();
    const [cards, rateItems, surcharges] = await Promise.all([
      db.select().from(logisticsRateCardsTable).orderBy(asc(logisticsRateCardsTable.id)),
      db.select().from(logisticsServiceRatesTable).orderBy(asc(logisticsServiceRatesTable.sortOrder)),
      db.select().from(logisticsSurchargesTable).where(eq(logisticsSurchargesTable.isActive, true)).orderBy(asc(logisticsSurchargesTable.sortOrder)),
    ]);
    return res.json(buildRatesCompat(cards, rateItems, surcharges));
  } catch (err) {
    console.error("[logistics-rates/all]", err);
    return res.status(500).json({ error: "Failed to load rates" });
  }
});

// GET /api/logistics-rates/:serviceType — single service
router.get("/:serviceType", async (req, res) => {
  const { serviceType } = req.params;
  if (!(SERVICE_TYPES as readonly string[]).includes(serviceType)) {
    return res.status(400).json({ error: "Invalid service type" });
  }
  try {
    await ensureSeedData();
    const now = new Date();
    const [card] = await db
      .select()
      .from(logisticsRateCardsTable)
      .where(
        and(
          eq(logisticsRateCardsTable.serviceType, serviceType as ServiceType),
          eq(logisticsRateCardsTable.isActive, true)
        )
      )
      .limit(1);

    if (!card) return res.json({});

    const [rateItems, surcharges] = await Promise.all([
      db
        .select()
        .from(logisticsServiceRatesTable)
        .where(eq(logisticsServiceRatesTable.rateCardId, card.id))
        .orderBy(asc(logisticsServiceRatesTable.sortOrder)),
      db
        .select()
        .from(logisticsSurchargesTable)
        .where(
          and(
            eq(logisticsSurchargesTable.serviceType, serviceType),
            eq(logisticsSurchargesTable.isActive, true)
          )
        )
        .orderBy(asc(logisticsSurchargesTable.sortOrder)),
    ]);

    const allCards = [card];
    return res.json(buildRatesCompat(allCards, rateItems, surcharges));
  } catch (err) {
    console.error("[logistics-rates/:serviceType]", err);
    return res.status(500).json({ error: "Failed to load rates" });
  }
});

// ─── ADMIN ROUTES ────────────────────────────────────────────────────────────

const rateCardSchema = z.object({
  serviceType: z.enum(["seaFreight", "airFreight", "customs", "trucking", "warehousing", "projectCargo"]),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  currency: z.string().default("IDR"),
  isActive: z.boolean().default(true),
  validFrom: z.string().optional().nullable(),
  validTo: z.string().optional().nullable(),
});

const rateItemSchema = z.object({
  rateKey: z.string().min(1),
  label: z.string().min(1),
  valueType: z.enum(["fixed", "percentage"]).default("fixed"),
  valueAmount: z.number(),
  containerType: z.string().optional().nullable(),
  vehicleType: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.number().int().default(0),
});

const surchargeSchema = z.object({
  serviceType: z.string().min(1),
  name: z.string().min(1),
  label: z.string().min(1),
  surchargeType: z.enum(["fixed", "percentage", "per_unit"]).default("fixed"),
  amount: z.number(),
  unit: z.enum(["per_kg", "per_cbm", "per_container", "per_day", "per_pallet", "flat"]).default("flat"),
  isMandatory: z.boolean().default(false),
  isActive: z.boolean().default(true),
  appliesTo: z.enum(["all", "dg", "temp_controlled", "oversize", "overnight"]).default("all"),
  sortOrder: z.number().int().default(0),
});

// GET /api/logistics-rates/admin — list all rate cards
router.get("/admin", requireClerkUser, async (_req, res) => {
  try {
    await ensureSeedData();
    const cards = await db
      .select()
      .from(logisticsRateCardsTable)
      .orderBy(asc(logisticsRateCardsTable.serviceType));
    return res.json(cards);
  } catch (err) {
    console.error("[logistics-rates/admin GET]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// POST /api/logistics-rates/admin — create rate card
router.post("/admin", requireClerkUser, async (req, res) => {
  const parsed = rateCardSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [card] = await db
      .insert(logisticsRateCardsTable)
      .values({
        ...parsed.data,
        validFrom: parsed.data.validFrom ? new Date(parsed.data.validFrom) : null,
        validTo: parsed.data.validTo ? new Date(parsed.data.validTo) : null,
      })
      .returning();
    return res.status(201).json(card);
  } catch (err) {
    console.error("[logistics-rates/admin POST]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// GET /api/logistics-rates/admin/:id — detail + rate items + surcharges
router.get("/admin/:id", requireClerkUser, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    const [card] = await db
      .select()
      .from(logisticsRateCardsTable)
      .where(eq(logisticsRateCardsTable.id, id));
    if (!card) return res.status(404).json({ error: "Not found" });

    const [rateItems, surcharges] = await Promise.all([
      db
        .select()
        .from(logisticsServiceRatesTable)
        .where(eq(logisticsServiceRatesTable.rateCardId, id))
        .orderBy(asc(logisticsServiceRatesTable.sortOrder)),
      db
        .select()
        .from(logisticsSurchargesTable)
        .where(eq(logisticsSurchargesTable.serviceType, card.serviceType))
        .orderBy(asc(logisticsSurchargesTable.sortOrder)),
    ]);

    return res.json({ ...card, rates: rateItems, surcharges });
  } catch (err) {
    console.error("[logistics-rates/admin/:id GET]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/logistics-rates/admin/:id — update rate card
router.put("/admin/:id", requireClerkUser, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = rateCardSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [updated] = await db
      .update(logisticsRateCardsTable)
      .set({
        ...parsed.data,
        validFrom: parsed.data.validFrom !== undefined ? (parsed.data.validFrom ? new Date(parsed.data.validFrom) : null) : undefined,
        validTo: parsed.data.validTo !== undefined ? (parsed.data.validTo ? new Date(parsed.data.validTo) : null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(logisticsRateCardsTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("[logistics-rates/admin/:id PUT]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/logistics-rates/admin/:id — hapus rate card
router.delete("/admin/:id", requireClerkUser, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(logisticsRateCardsTable).where(eq(logisticsRateCardsTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[logistics-rates/admin/:id DELETE]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// POST /api/logistics-rates/admin/:id/rates — tambah rate item
router.post("/admin/:id/rates", requireClerkUser, async (req, res) => {
  const rateCardId = Number(req.params.id);
  if (isNaN(rateCardId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = rateItemSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [item] = await db
      .insert(logisticsServiceRatesTable)
      .values({
        rateCardId,
        rateKey: parsed.data.rateKey,
        label: parsed.data.label,
        valueType: parsed.data.valueType,
        valueAmount: String(parsed.data.valueAmount),
        containerType: parsed.data.containerType ?? null,
        vehicleType: parsed.data.vehicleType ?? null,
        notes: parsed.data.notes ?? null,
        sortOrder: parsed.data.sortOrder,
      })
      .returning();
    return res.status(201).json(item);
  } catch (err) {
    console.error("[logistics-rates/admin/:id/rates POST]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/logistics-rates/admin/rates/:itemId — edit rate item
router.put("/admin/rates/:itemId", requireClerkUser, async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (isNaN(itemId)) return res.status(400).json({ error: "Invalid id" });
  const parsed = rateItemSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [updated] = await db
      .update(logisticsServiceRatesTable)
      .set({
        ...parsed.data,
        valueAmount: parsed.data.valueAmount !== undefined ? String(parsed.data.valueAmount) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(logisticsServiceRatesTable.id, itemId))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("[logistics-rates/admin/rates/:itemId PUT]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/logistics-rates/admin/rates/:itemId — hapus rate item
router.delete("/admin/rates/:itemId", requireClerkUser, async (req, res) => {
  const itemId = Number(req.params.itemId);
  if (isNaN(itemId)) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(logisticsServiceRatesTable).where(eq(logisticsServiceRatesTable.id, itemId));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[logistics-rates/admin/rates/:itemId DELETE]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// POST /api/logistics-rates/admin/surcharges — create surcharge
router.post("/admin/surcharges", requireClerkUser, async (req, res) => {
  const parsed = surchargeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [item] = await db
      .insert(logisticsSurchargesTable)
      .values({
        serviceType: parsed.data.serviceType,
        name: parsed.data.name,
        label: parsed.data.label,
        surchargeType: parsed.data.surchargeType,
        amount: String(parsed.data.amount),
        unit: parsed.data.unit,
        isMandatory: parsed.data.isMandatory,
        isActive: parsed.data.isActive,
        appliesTo: parsed.data.appliesTo,
        sortOrder: parsed.data.sortOrder,
      })
      .returning();
    return res.status(201).json(item);
  } catch (err) {
    console.error("[logistics-rates/admin/surcharges POST]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// PUT /api/logistics-rates/admin/surcharges/:id — edit surcharge
router.put("/admin/surcharges/:id", requireClerkUser, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  const parsed = surchargeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const [updated] = await db
      .update(logisticsSurchargesTable)
      .set({
        ...parsed.data,
        amount: parsed.data.amount !== undefined ? String(parsed.data.amount) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(logisticsSurchargesTable.id, id))
      .returning();
    if (!updated) return res.status(404).json({ error: "Not found" });
    return res.json(updated);
  } catch (err) {
    console.error("[logistics-rates/admin/surcharges/:id PUT]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// DELETE /api/logistics-rates/admin/surcharges/:id — hapus surcharge
router.delete("/admin/surcharges/:id", requireClerkUser, async (req, res) => {
  const id = Number(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "Invalid id" });
  try {
    await db.delete(logisticsSurchargesTable).where(eq(logisticsSurchargesTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    console.error("[logistics-rates/admin/surcharges/:id DELETE]", err);
    return res.status(500).json({ error: "Failed" });
  }
});

export default router;
