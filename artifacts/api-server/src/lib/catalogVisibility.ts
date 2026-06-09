import { eq, ne } from "drizzle-orm";
import { vendorCatalogItemsTable } from "@workspace/db";

/**
 * Runtime check — cocok untuk filter array in-memory (bukan DB query).
 *
 * Logic:
 *   isPublished === true  — sudah dipublikasikan
 *   isActive    !== false — tidak dinonaktifkan (null/undefined dianggap aktif)
 *   !deletedAt            — belum soft-deleted
 *
 * Endpoint admin/vendor TIDAK menggunakan helper ini karena admin
 * perlu melihat draft dan item yang inactive.
 */
export function isCatalogItemPublic(item: {
  isPublished?: boolean | null;
  isActive?: boolean | null;
  deletedAt?: Date | string | null;
}): boolean {
  return (
    item.isPublished === true &&
    item.isActive !== false &&
    !item.deletedAt
  );
}

/**
 * Drizzle WHERE conditions yang setara dengan isCatalogItemPublic.
 * Gabungkan ke query dengan `and(...catalogPublicConditions(), ...)`.
 *
 * Catatan: isActive di schema adalah NOT NULL DEFAULT true, sehingga
 * ne(isActive, false) lebih aman daripada eq(isActive, true) karena
 * tidak mengecualikan baris yang secara logika "tidak inactive" bila
 * kolom suatu saat menjadi nullable.
 */
export function catalogPublicConditions(
  vci: typeof vendorCatalogItemsTable = vendorCatalogItemsTable,
) {
  return [
    eq(vci.isPublished, true),
    ne(vci.isActive, false),
    // deletedAt belum ada di schema — tambahkan di sini bila ditambahkan:
    // isNull(vci.deletedAt),
  ] as const;
}
