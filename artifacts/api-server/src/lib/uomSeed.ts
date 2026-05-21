import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

interface UomRow { id: number; code: string; }

const STANDARD_UOMS: Array<{ code: string; name: string; symbol: string }> = [
  { code: "g",    name: "Gram",      symbol: "g" },
  { code: "kg",   name: "Kilogram",  symbol: "kg" },
  { code: "ml",   name: "Mililiter", symbol: "ml" },
  { code: "l",    name: "Liter",     symbol: "L" },
  { code: "pcs",  name: "Pcs",       symbol: "pcs" },
  { code: "box",  name: "Box",       symbol: "box" },
  { code: "ctn",  name: "Karton",    symbol: "ctn" },
  { code: "m",    name: "Meter",     symbol: "m" },
  { code: "yd",   name: "Yard",      symbol: "yd" },
  { code: "roll", name: "Roll",      symbol: "roll" },
];

export async function seedUom(): Promise<void> {
  try {
    const existing = (await db.execute(sql`SELECT id, code FROM uom`))
      .rows as UomRow[];
    const existingCodes = new Set(existing.map((r) => r.code));

    for (const u of STANDARD_UOMS) {
      if (!existingCodes.has(u.code)) {
        await db.execute(sql`
          INSERT INTO uom (code, name, symbol)
          VALUES (${u.code}, ${u.name}, ${u.symbol})
          ON CONFLICT (code) DO NOTHING
        `);
        logger.info(`[uomSeed] inserted UOM: ${u.code}`);
      }
    }

    // Re-fetch IDs after insert
    const allRows = (await db.execute(sql`SELECT id, code FROM uom`))
      .rows as UomRow[];
    const byCode: Record<string, number> = {};
    for (const r of allRows) byCode[r.code] = r.id;

    const conversions: Array<{ fromCode: string; toCode: string; factor: string }> = [
      { fromCode: "kg",  toCode: "g",   factor: "1000" },
      { fromCode: "g",   toCode: "kg",  factor: "0.001" },
      { fromCode: "l",   toCode: "ml",  factor: "1000" },
      { fromCode: "ml",  toCode: "l",   factor: "0.001" },
      { fromCode: "box", toCode: "pcs", factor: "12" },
      { fromCode: "ctn", toCode: "pcs", factor: "24" },
      { fromCode: "ctn", toCode: "box", factor: "2" },
      { fromCode: "yd",  toCode: "m",   factor: "0.9144" },
      { fromCode: "m",   toCode: "yd",  factor: "1.09361" },
    ];

    for (const c of conversions) {
      const fromId = byCode[c.fromCode];
      const toId = byCode[c.toCode];
      if (!fromId || !toId) continue;
      await db.execute(sql`
        INSERT INTO uom_conversions (from_uom_id, to_uom_id, factor)
        VALUES (${fromId}, ${toId}, ${c.factor})
        ON CONFLICT (from_uom_id, to_uom_id) DO NOTHING
      `);
    }

    logger.info("[uomSeed] UOM seed complete");
  } catch (err) {
    logger.error({ err }, "[uomSeed] UOM seed failed");
  }
}
