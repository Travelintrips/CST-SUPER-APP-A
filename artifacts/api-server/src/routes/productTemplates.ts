import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { productTemplatesTable } from "@workspace/db";
import { eq, asc, sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";
import { logger } from "../lib/logger.js";
import {
  resolveAllTemplates,
  resolveTemplate,
  getAllInCodeTemplates,
  type ProductTemplateOverride,
} from "@workspace/product-templates";

/**
 * Map a raw DB row from product_templates → ProductTemplateOverride shape
 * expected by the shared resolver.
 */
function dbRowToOverride(row: typeof productTemplatesTable.$inferSelect): ProductTemplateOverride {
  return {
    categoryKey: row.categoryKey,
    label: row.label,
    version: row.version,
    isActive: row.isActive,
    requiredDocuments: row.requiredDocuments as ProductTemplateOverride["requiredDocuments"],
    checklist: row.checklist as ProductTemplateOverride["checklist"],
    customFields: row.customFields as ProductTemplateOverride["customFields"],
    packagingInstructions: row.packagingInstructions ?? null,
    conditionalRules: row.conditionalRules as ProductTemplateOverride["conditionalRules"],
    validationRules: row.validationRules as ProductTemplateOverride["validationRules"],
  };
}

export const productTemplatesRouter = Router();

// Inline table creation — ensures table exists before any query
db.execute(sql`
  CREATE TABLE IF NOT EXISTS product_templates (
    id SERIAL PRIMARY KEY,
    category_key TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    version TEXT NOT NULL DEFAULT '1.0.0',
    is_active BOOLEAN NOT NULL DEFAULT true,
    required_documents JSONB NOT NULL DEFAULT '[]',
    checklist JSONB NOT NULL DEFAULT '[]',
    custom_fields JSONB NOT NULL DEFAULT '[]',
    packaging_instructions TEXT DEFAULT '',
    conditional_rules JSONB NOT NULL DEFAULT '[]',
    validation_rules JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
  )
`).catch((err) => {
  logger.warn("product_templates table creation failed (non-fatal)", { err: String(err) });
});

const SEED_TEMPLATES = getAllInCodeTemplates().map((t) => ({
  categoryKey: t.category,
  label: t.label,
  version: t.version,
  requiredDocuments: t.requiredDocuments,
  checklist: t.checklist,
  customFields: t.customFields,
  packagingInstructions: t.packagingInstructions,
  conditionalRules: t.conditionalRules,
  validationRules: t.validationRules,
}));

// ─────────────────────────────────────────────
// BOOT SEEDER — jalankan sekali saat server start
// ─────────────────────────────────────────────
export async function seedProductTemplates() {
  try {
    const existing = await db.select({ id: productTemplatesTable.id }).from(productTemplatesTable).limit(1);
    if (existing.length > 0) return;

    for (const tpl of SEED_TEMPLATES) {
      await db.insert(productTemplatesTable).values({
        categoryKey: tpl.categoryKey,
        label: tpl.label,
        version: tpl.version,
        isActive: true,
        requiredDocuments: tpl.requiredDocuments as unknown as Record<string, unknown>[],
        checklist: tpl.checklist as unknown as Record<string, unknown>[],
        customFields: tpl.customFields as unknown as Record<string, unknown>[],
        packagingInstructions: tpl.packagingInstructions,
        conditionalRules: tpl.conditionalRules as unknown as Record<string, unknown>[],
        validationRules: tpl.validationRules as unknown as Record<string, unknown>[],
      }).onConflictDoNothing();
    }
    logger.info("Product templates seeded", { count: SEED_TEMPLATES.length });
  } catch (err) {
    logger.warn("Product templates seed failed (non-fatal)", { err: String(err) });
  }
}

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function bumpPatch(version: string): string {
  const parts = version.split(".").map(Number);
  if (parts.length !== 3) return "1.0.1";
  parts[2] = (parts[2] ?? 0) + 1;
  return parts.join(".");
}

// ─────────────────────────────────────────────
// PUBLIC — GET /api/product-templates
//
// Hybrid: returns RESOLVED templates (in-code definition + DB override merge).
// `?raw=1` returns raw DB rows (admin CMS uses this to edit overrides only).
// ─────────────────────────────────────────────
productTemplatesRouter.get("/", async (req: Request, res: Response) => {
  try {
    const rows = await db
      .select()
      .from(productTemplatesTable)
      .orderBy(asc(productTemplatesTable.categoryKey));

    if (req.query.raw === "1") {
      return res.json(rows);
    }

    const overrides = rows.map(dbRowToOverride);
    const resolved = resolveAllTemplates(overrides);
    // Frontend code expects camelCase ProductTemplate shape — resolveAllTemplates
    // already returns that. Filter inactive DB-only categories already handled.
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// PUBLIC — GET /api/product-templates/:key  (by id or categoryKey)
// Returns the RESOLVED template (in-code + DB override). Always succeeds for
// in-code categories even when DB is empty; falls back to `general` for
// unknown keys.
productTemplatesRouter.get("/:key", async (req: Request, res: Response) => {
  try {
    const key = req.params.key as string;
    const byId = Number(key);
    let dbRows;
    if (!isNaN(byId)) {
      dbRows = await db.select().from(productTemplatesTable).where(eq(productTemplatesTable.id, byId));
    } else {
      dbRows = await db.select().from(productTemplatesTable).where(eq(productTemplatesTable.categoryKey, key));
    }
    if (req.query.raw === "1") {
      if (!dbRows.length) return res.status(404).json({ message: "Template tidak ditemukan" });
      return res.json(dbRows[0]);
    }
    const override = dbRows[0] ? dbRowToOverride(dbRows[0]) : null;
    const categoryKey = override?.categoryKey ?? key;
    const resolved = resolveTemplate(categoryKey, override);
    res.json(resolved);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// ADMIN — POST /api/product-templates  (create)
productTemplatesRouter.post("/", requireAdmin, async (req: Request, res: Response) => {
  try {
    const body = req.body as Record<string, unknown>;
    const { categoryKey, label, version = "1.0.0", isActive = true,
      requiredDocuments = [], checklist = [], customFields = [],
      packagingInstructions = "", conditionalRules = [], validationRules = [] } = body;

    if (!categoryKey || !label) {
      return res.status(400).json({ message: "categoryKey dan label wajib diisi" });
    }

    const [row] = await db.insert(productTemplatesTable).values({
      categoryKey: String(categoryKey),
      label: String(label),
      version: String(version),
      isActive: Boolean(isActive),
      requiredDocuments: requiredDocuments as unknown as Record<string, unknown>[],
      checklist: checklist as unknown as Record<string, unknown>[],
      customFields: customFields as unknown as Record<string, unknown>[],
      packagingInstructions: String(packagingInstructions),
      conditionalRules: conditionalRules as unknown as Record<string, unknown>[],
      validationRules: validationRules as unknown as Record<string, unknown>[],
    }).returning();

    res.status(201).json(row);
  } catch (err: unknown) {
    const msg = String((err as { message?: string }).message ?? err);
    if (msg.includes("unique")) {
      return res.status(409).json({ message: `Category key "${req.body.categoryKey}" sudah ada` });
    }
    res.status(500).json({ message: msg });
  }
});

// ADMIN — PUT /api/product-templates/:id  (update, auto-bump version)
productTemplatesRouter.put("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

    const existing = await db.select().from(productTemplatesTable).where(eq(productTemplatesTable.id, id));
    if (!existing.length) return res.status(404).json({ message: "Template tidak ditemukan" });

    const body = req.body as Record<string, unknown>;
    const newVersion = typeof body.version === "string" && body.version !== existing[0]!.version
      ? body.version
      : bumpPatch(existing[0]!.version);

    const [updated] = await db.update(productTemplatesTable)
      .set({
        label: typeof body.label === "string" ? body.label : existing[0]!.label,
        version: newVersion,
        isActive: typeof body.isActive === "boolean" ? body.isActive : existing[0]!.isActive,
        requiredDocuments: Array.isArray(body.requiredDocuments) ? body.requiredDocuments as unknown as Record<string, unknown>[] : existing[0]!.requiredDocuments as unknown as Record<string, unknown>[],
        checklist: Array.isArray(body.checklist) ? body.checklist as unknown as Record<string, unknown>[] : existing[0]!.checklist as unknown as Record<string, unknown>[],
        customFields: Array.isArray(body.customFields) ? body.customFields as unknown as Record<string, unknown>[] : existing[0]!.customFields as unknown as Record<string, unknown>[],
        packagingInstructions: typeof body.packagingInstructions === "string" ? body.packagingInstructions : existing[0]!.packagingInstructions,
        conditionalRules: Array.isArray(body.conditionalRules) ? body.conditionalRules as unknown as Record<string, unknown>[] : existing[0]!.conditionalRules as unknown as Record<string, unknown>[],
        validationRules: Array.isArray(body.validationRules) ? body.validationRules as unknown as Record<string, unknown>[] : existing[0]!.validationRules as unknown as Record<string, unknown>[],
        updatedAt: new Date(),
      })
      .where(eq(productTemplatesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// ADMIN — POST /api/product-templates/:id/duplicate
productTemplatesRouter.post("/:id/duplicate", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

    const existing = await db.select().from(productTemplatesTable).where(eq(productTemplatesTable.id, id));
    if (!existing.length) return res.status(404).json({ message: "Template tidak ditemukan" });

    const src = existing[0]!;
    const newKey = `${src.categoryKey}_copy_${Date.now()}`;

    const [dup] = await db.insert(productTemplatesTable).values({
      categoryKey: newKey,
      label: `${src.label} (Salinan)`,
      version: "1.0.0",
      isActive: false,
      requiredDocuments: src.requiredDocuments as unknown as Record<string, unknown>[],
      checklist: src.checklist as unknown as Record<string, unknown>[],
      customFields: src.customFields as unknown as Record<string, unknown>[],
      packagingInstructions: src.packagingInstructions,
      conditionalRules: src.conditionalRules as unknown as Record<string, unknown>[],
      validationRules: src.validationRules as unknown as Record<string, unknown>[],
    }).returning();

    res.status(201).json(dup);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// ADMIN — PATCH /api/product-templates/:id/toggle  (activate / deactivate)
productTemplatesRouter.patch("/:id/toggle", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

    const existing = await db.select().from(productTemplatesTable).where(eq(productTemplatesTable.id, id));
    if (!existing.length) return res.status(404).json({ message: "Template tidak ditemukan" });

    const [updated] = await db.update(productTemplatesTable)
      .set({ isActive: !existing[0]!.isActive, updatedAt: new Date() })
      .where(eq(productTemplatesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// ADMIN — POST /api/product-templates/sync-defaults
// Upsert semua SEED_TEMPLATES ke DB. Template yang sudah ada di-update,
// template baru di-insert. Template custom (tidak ada di SEED_TEMPLATES) dibiarkan.
productTemplatesRouter.post("/sync-defaults", requireAdmin, async (req: Request, res: Response) => {
  try {
    const results: { categoryKey: string; action: "inserted" | "updated" }[] = [];
    for (const tpl of SEED_TEMPLATES) {
      const existing = await db
        .select({ id: productTemplatesTable.id, version: productTemplatesTable.version })
        .from(productTemplatesTable)
        .where(eq(productTemplatesTable.categoryKey, tpl.categoryKey));

      if (existing.length === 0) {
        await db.insert(productTemplatesTable).values({
          categoryKey: tpl.categoryKey,
          label: tpl.label,
          version: tpl.version,
          isActive: true,
          requiredDocuments: tpl.requiredDocuments as unknown as Record<string, unknown>[],
          checklist: tpl.checklist as unknown as Record<string, unknown>[],
          customFields: tpl.customFields as unknown as Record<string, unknown>[],
          packagingInstructions: tpl.packagingInstructions,
          conditionalRules: tpl.conditionalRules as unknown as Record<string, unknown>[],
          validationRules: tpl.validationRules as unknown as Record<string, unknown>[],
        });
        results.push({ categoryKey: tpl.categoryKey, action: "inserted" });
      } else {
        const newVersion = bumpPatch(existing[0]!.version);
        await db.update(productTemplatesTable)
          .set({
            label: tpl.label,
            version: newVersion,
            requiredDocuments: tpl.requiredDocuments as unknown as Record<string, unknown>[],
            checklist: tpl.checklist as unknown as Record<string, unknown>[],
            customFields: tpl.customFields as unknown as Record<string, unknown>[],
            packagingInstructions: tpl.packagingInstructions,
            conditionalRules: tpl.conditionalRules as unknown as Record<string, unknown>[],
            validationRules: tpl.validationRules as unknown as Record<string, unknown>[],
            updatedAt: new Date(),
          })
          .where(eq(productTemplatesTable.categoryKey, tpl.categoryKey));
        results.push({ categoryKey: tpl.categoryKey, action: "updated" });
      }
    }
    logger.info("sync-defaults: completed", { inserted: results.filter(r => r.action === "inserted").length, updated: results.filter(r => r.action === "updated").length });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});

// ADMIN — DELETE /api/product-templates/:id  (hard delete — hanya template inaktif)
productTemplatesRouter.delete("/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ message: "ID tidak valid" });

    const existing = await db.select().from(productTemplatesTable).where(eq(productTemplatesTable.id, id));
    if (!existing.length) return res.status(404).json({ message: "Template tidak ditemukan" });
    if (existing[0]!.isActive) return res.status(400).json({ message: "Nonaktifkan template terlebih dahulu sebelum menghapus" });

    await db.delete(productTemplatesTable).where(eq(productTemplatesTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ message: String(err) });
  }
});
