import { eq } from "drizzle-orm";
import { vendorCatalogItemsTable } from "@workspace/db";

export function isCatalogItemPublic(item: {
  isPublished: boolean;
  isActive: boolean;
  deletedAt?: Date | string | null;
}): boolean {
  return item.isPublished === true
    && item.isActive !== false
    && !item.deletedAt;
}

export function catalogPublicConditions(
  vci: typeof vendorCatalogItemsTable = vendorCatalogItemsTable,
) {
  return [
    eq(vci.isPublished, true),
    eq(vci.isActive, true),
  ] as const;
}
