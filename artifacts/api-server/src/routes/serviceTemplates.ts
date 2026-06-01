import { Router } from "express";
import { db } from "@workspace/db";
import { serviceTemplatesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  resolveServiceTemplate,
  resolveAllServiceTemplates,
  getInCodeServiceTemplate,
  getAllInCodeServiceTemplates,
  hasInCodeServiceTemplate,
} from "@workspace/service-templates";
import type { ServiceTemplateOverride } from "@workspace/service-templates";
import type { Request, Response } from "express";

export const serviceTemplatesRouter = Router();

/* ── DB row → ServiceTemplateOverride ── */
function rowToOverride(row: typeof serviceTemplatesTable.$inferSelect): ServiceTemplateOverride {
  return {
    serviceType:       row.serviceType,
    label:             row.label,
    emoji:             row.emoji,
    version:           row.version,
    isActive:          row.isActive,
    fields:            (row.fields as ServiceTemplateOverride["fields"]) ?? null,
    requiredDocuments: (row.requiredDocuments as ServiceTemplateOverride["requiredDocuments"]) ?? null,
    checklist:         (row.checklist as ServiceTemplateOverride["checklist"]) ?? null,
    conditionalRules:  (row.conditionalRules as ServiceTemplateOverride["conditionalRules"]) ?? null,
    validationRules:   (row.validationRules as ServiceTemplateOverride["validationRules"]) ?? null,
  };
}

/* ── GET /api/service-templates ── */
serviceTemplatesRouter.get("/", async (_req: Request, res: Response) => {
  try {
    const dbRows = await db
      .select()
      .from(serviceTemplatesTable)
      .orderBy(serviceTemplatesTable.sortOrder);

    let templates: Array<ReturnType<typeof resolveServiceTemplate> & { source: "db" | "in-code" }>;
    let source: "db" | "in-code";

    if (dbRows.length > 0) {
      const overrides = dbRows.map(rowToOverride);
      const overrideMap = new Map(overrides.map((o) => [o.serviceType, o]));
      templates = resolveAllServiceTemplates(overrides).map((tpl) => ({
        ...tpl,
        source: overrideMap.has(tpl.serviceType) ? ("db" as const) : ("in-code" as const),
      }));
      source = "db";
    } else {
      templates = getAllInCodeServiceTemplates().map((tpl) => ({
        ...tpl,
        source: "in-code" as const,
      }));
      source = "in-code";
    }

    return res.json({ count: templates.length, source, templates });
  } catch (err) {
    return res.status(500).json({ error: "Gagal mengambil service templates", detail: String(err) });
  }
});

/* ── GET /api/service-templates/:serviceType ── */
serviceTemplatesRouter.get("/:serviceType", async (req: Request, res: Response) => {
  const serviceType = String(req.params["serviceType"] ?? "").trim();
  if (!serviceType) {
    return res.status(400).json({ error: "serviceType wajib diisi" });
  }

  try {
    let dbOverride: ServiceTemplateOverride | null = null;

    const rows = await db
      .select()
      .from(serviceTemplatesTable)
      .where(eq(serviceTemplatesTable.serviceType, serviceType))
      .limit(1);

    if (rows.length > 0) {
      dbOverride = rowToOverride(rows[0]!);
    }

    const inCodeExists = hasInCodeServiceTemplate(serviceType);

    let source: "db" | "in-code" | "fallback";
    if (dbOverride) {
      source = "db";
    } else if (inCodeExists) {
      source = "in-code";
    } else {
      source = "fallback";
    }

    const resolved = resolveServiceTemplate(serviceType, dbOverride);

    return res.json({ ...resolved, source });
  } catch (err) {
    return res.status(500).json({ error: "Gagal mengambil service template", detail: String(err) });
  }
});
