import { db, productsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

const LOGISTICS_SERVICE_ITEMS = [
  { sku: "SVC-OCEAN-FREIGHT",   name: "Jasa Ocean Freight",           unit: "shipment", price: "0" },
  { sku: "SVC-AIR-FREIGHT",     name: "Jasa Air Freight",             unit: "shipment", price: "0" },
  { sku: "SVC-TRUCKING",        name: "Jasa Trucking",                unit: "trip",     price: "0" },
  { sku: "SVC-HANDLING",        name: "Jasa Handling",                unit: "lot",      price: "0" },
  { sku: "SVC-CUSTOMS",         name: "Jasa Customs Clearance",       unit: "dokumen",  price: "0" },
  { sku: "SVC-PPJK",            name: "Jasa Pengurusan Dokumen PPJK", unit: "dokumen",  price: "0" },
  { sku: "SVC-PORT-CHARGES",    name: "Jasa Port Charges",            unit: "lot",      price: "0" },
  { sku: "SVC-STORAGE",         name: "Jasa Storage / Demurrage",     unit: "hari",     price: "0" },
  { sku: "SVC-EMKL",            name: "Jasa EMKL",                    unit: "lot",      price: "0" },
  { sku: "SVC-INSURANCE",       name: "Jasa Asuransi Kargo",          unit: "shipment", price: "0" },
];

export async function seedLogisticsServiceItems(): Promise<void> {
  try {
    await db
      .insert(productsTable)
      .values(
        LOGISTICS_SERVICE_ITEMS.map((item) => ({
          sku: item.sku,
          name: item.name,
          itemType: "jasa",
          unit: item.unit,
          price: item.price,
          stock: 0,
          subcategory: "Logistics Services",
          isActive: true,
        })),
      )
      .onConflictDoNothing({ target: productsTable.sku });
    logger.info("Logistics service items seeded");
  } catch (err) {
    logger.error({ err }, "Failed to seed logistics service items");
  }
}
