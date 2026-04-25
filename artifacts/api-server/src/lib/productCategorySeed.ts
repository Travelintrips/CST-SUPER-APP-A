import { db, productsTable, productCategoriesTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger.js";

export async function seedProductCategoriesFromExisting(): Promise<void> {
  const existing = await db
    .selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .where(sql`${productsTable.category} <> ''`);

  if (existing.length === 0) return;

  for (const { category } of existing) {
    const name = category.trim();
    if (!name) continue;
    await db
      .insert(productCategoriesTable)
      .values({ name })
      .onConflictDoNothing();
  }

  logger.info({ count: existing.length }, "Product category backfill complete");
}
