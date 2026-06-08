import { Router } from "express";
import { db } from "@workspace/db";
import { vendorCatalogItemsTable, suppliersTable } from "@workspace/db";
import { eq, and, ilike, or, sql, asc } from "drizzle-orm";

export const marketplaceRouter = Router();

// Helper: kondisi visibilitas item publik customer
// Aturan: isPublished = true DAN isActive = true
// Export supaya bisa dipakai di file lain jika perlu
export function isCatalogItemPublic(item: { isPublished: boolean; isActive: boolean }): boolean {
  return item.isPublished === true && item.isActive !== false;
}
function catalogPublicConditions() {
  return [
    eq(vendorCatalogItemsTable.isPublished, true),
    eq(vendorCatalogItemsTable.isActive, true),
  ] as const;
}

// GET /api/marketplace/products — list published+active vendor catalog items (public)
// SECURITY: hanya ekspos priceSell, BUKAN priceBase
marketplaceRouter.get("/products", async (req, res) => {
  const { vendor, category, location, search } = req.query as Record<string, string>;

  // Publik: wajib isPublished = true DAN isActive = true
  const conditions = [...catalogPublicConditions()];

  if (vendor && !isNaN(Number(vendor))) {
    conditions.push(eq(vendorCatalogItemsTable.vendorId, Number(vendor)));
  }
  if (category) {
    const catCond = or(
      eq(vendorCatalogItemsTable.kategori, category),
      eq(vendorCatalogItemsTable.categoryKey, category),
    );
    if (catCond) conditions.push(catCond);
  }
  if (location) {
    conditions.push(ilike(vendorCatalogItemsTable.location, `%${location}%`));
  }
  if (search?.trim()) {
    const q = `%${search.trim()}%`;
    const searchCond = or(
      ilike(vendorCatalogItemsTable.name, q),
      ilike(vendorCatalogItemsTable.description, q),
      ilike(vendorCatalogItemsTable.vendorName, q),
    );
    if (searchCond) conditions.push(searchCond);
  }

  const rows = await db
    .select({
      id:             vendorCatalogItemsTable.id,
      name:           vendorCatalogItemsTable.name,
      description:    vendorCatalogItemsTable.description,
      kategori:       vendorCatalogItemsTable.kategori,
      categoryKey:    vendorCatalogItemsTable.categoryKey,
      priceSell:      vendorCatalogItemsTable.priceSell,
      currency:       vendorCatalogItemsTable.currency,
      unit:           vendorCatalogItemsTable.unit,
      moq:            vendorCatalogItemsTable.moq,
      stockStatus:    vendorCatalogItemsTable.stockStatus,
      leadTime:       vendorCatalogItemsTable.leadTime,
      location:       vendorCatalogItemsTable.location,
      origin:         vendorCatalogItemsTable.origin,
      specValues:     vendorCatalogItemsTable.specValues,
      templateKind:   vendorCatalogItemsTable.templateKind,
      sortOrder:      vendorCatalogItemsTable.sortOrder,
      vendorId:       vendorCatalogItemsTable.vendorId,
      vendorName:     vendorCatalogItemsTable.vendorName,
      supplierName:   suppliersTable.name,
      mediaAssets:    vendorCatalogItemsTable.mediaAssets,
    })
    .from(vendorCatalogItemsTable)
    .leftJoin(suppliersTable, eq(vendorCatalogItemsTable.vendorId, suppliersTable.id))
    .where(and(...conditions))
    .orderBy(asc(vendorCatalogItemsTable.sortOrder), asc(vendorCatalogItemsTable.id));

  return res.json(
    rows.map((r) => {
      const media = Array.isArray(r.mediaAssets) ? r.mediaAssets as { type: string; url: string; isPrimary?: boolean }[] : [];
      const primaryImage = media.find((m) => m.type === "image" && m.isPrimary)?.url
        ?? media.find((m) => m.type === "image")?.url
        ?? null;
      return {
        ...r,
        priceSell:         r.priceSell != null ? Number(r.priceSell) : null,
        vendorDisplayName: r.vendorName || r.supplierName || "Vendor",
        imageUrl:          primaryImage,
        mediaItems:        media,
      };
    }),
  );
});

// GET /api/marketplace/vendors — vendor list for filter dropdown (published+active only)
marketplaceRouter.get("/vendors", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT DISTINCT
      s.id,
      COALESCE(vci.vendor_name, s.name) AS name
    FROM vendor_catalog_items vci
    LEFT JOIN suppliers s ON vci.vendor_id = s.id
    WHERE vci.is_published = true
      AND vci.is_active = true
    ORDER BY 2
  `);
  return res.json(rows.rows as { id: number; name: string }[]);
});

// GET /api/marketplace/categories — unique categories for filter chips (published+active only)
marketplaceRouter.get("/categories", async (_req, res) => {
  const rows = await db.execute(sql`
    SELECT DISTINCT COALESCE(category_key, kategori) AS key
    FROM vendor_catalog_items
    WHERE is_published = true
      AND is_active = true
      AND COALESCE(category_key, kategori) IS NOT NULL
      AND COALESCE(category_key, kategori) != ''
    ORDER BY 1
  `);
  return res.json(
    (rows.rows as { key: string }[]).map((r) => r.key).filter(Boolean),
  );
});
