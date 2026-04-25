import { db, productsTable, productCategoriesTable, productCategoryMapTable } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "./logger.js";

export async function seedProductCategoriesFromExisting(): Promise<void> {
  const existing = await db
    .selectDistinct({ category: productsTable.category })
    .from(productsTable)
    .where(sql`${productsTable.category} IS NOT NULL AND ${productsTable.category} <> ''`);

  if (existing.length === 0) return;

  for (const { category } of existing) {
    if (!category) continue;
    const name = category.trim();
    if (!name) continue;
    await db
      .insert(productCategoriesTable)
      .values({ name })
      .onConflictDoNothing();
  }

  const allProducts = await db
    .select({ id: productsTable.id, category: productsTable.category })
    .from(productsTable)
    .where(sql`${productsTable.category} IS NOT NULL AND ${productsTable.category} <> ''`);

  for (const product of allProducts) {
    if (!product.category) continue;
    const [cat] = await db
      .select({ id: productCategoriesTable.id })
      .from(productCategoriesTable)
      .where(eq(productCategoriesTable.name, product.category.trim()));
    if (!cat) continue;
    await db
      .insert(productCategoryMapTable)
      .values({ productId: product.id, categoryId: cat.id })
      .onConflictDoNothing();
  }

  logger.info({ count: allProducts.length }, "Product category backfill complete");
}
