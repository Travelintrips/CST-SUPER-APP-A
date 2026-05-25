import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { getAdminWa, setAdminWa, getAdminGroupWa, setAdminGroupWa } from "../lib/adminWa.js";
import { db, portalContentTable } from "@workspace/db";
import { shortLinksTable } from "@workspace/db/schema";
import { eq, desc, ilike, or, sql } from "drizzle-orm";
import { getAiIntakeSettings, saveAiIntakeSettings, type VendorFilterMode } from "../lib/aiOrderIntake.js";

const router = Router();

const CALC_RATES_KEY = "calculator_rates";
const CARGO_TYPES_KEY = "cargo_types";
const DEFAULT_CARGO_TYPES = ["Electronics", "Textiles", "Furniture", "Food & Beverage", "Chemicals", "Machinery", "Automotive Parts", "Medical Supplies", "Paper & Printing", "Raw Materials"];

export const DEFAULT_CALC_RATES = {
  airFreight:  { baseCost: 500000,  ratePerKg: 90000,    handlingPct: 5, customsFee: 1200000 },
  seaFreight:  { baseCost: 750000,  ratePerCbm: 2500000, handlingPct: 5, customsFee: 1500000 },
  customs:     { baseCost: 1500000, ratePerKg: 5000,     handlingFee: 500000, customsPct: 0.5 },
  domestic:    { baseCost: 500000,  ratePerKg: 8500,     handlingPct: 5 },
  warehousing: { baseCost: 5000000, ratePerCbm: 2500000, handlingFee: 500000 },
};

// GET /api/settings/notifications — get notification settings (admin)
router.get("/notifications", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const [adminWa, adminGroupWa] = await Promise.all([getAdminWa(), getAdminGroupWa()]);
  return res.json({ adminWa, adminGroupWa });
});

// PUT /api/settings/notifications — update notification settings (admin)
router.put("/notifications", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { adminWa, adminGroupWa } = req.body ?? {};
  if (typeof adminWa !== "string") {
    return res.status(400).json({ message: "adminWa harus berupa string" });
  }
  const saves: Promise<void>[] = [setAdminWa(adminWa)];
  if (typeof adminGroupWa === "string") saves.push(setAdminGroupWa(adminGroupWa));
  await Promise.all(saves);
  return res.json({ ok: true, adminWa: adminWa.trim(), adminGroupWa: typeof adminGroupWa === "string" ? adminGroupWa.trim() : undefined });
});

// GET /api/settings/calculator-rates — get calculator rates (admin)
router.get("/calculator-rates", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, CALC_RATES_KEY));
    const rates = row ? JSON.parse(row.value) : DEFAULT_CALC_RATES;
    return res.json(rates);
  } catch {
    return res.json(DEFAULT_CALC_RATES);
  }
});

// PUT /api/settings/calculator-rates — update calculator rates (admin)
router.put("/calculator-rates", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const rates = req.body;
  if (!rates || typeof rates !== "object") {
    return res.status(400).json({ message: "Invalid rates payload" });
  }
  await db
    .insert(portalContentTable)
    .values({ key: CALC_RATES_KEY, value: JSON.stringify(rates), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: JSON.stringify(rates), updatedAt: new Date() },
    });
  return res.json({ ok: true });
});

// GET /api/settings/cargo-types — get cargo types list (admin)
router.get("/cargo-types", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, CARGO_TYPES_KEY));
    const types = row ? JSON.parse(row.value) : DEFAULT_CARGO_TYPES;
    return res.json(types);
  } catch {
    return res.json(DEFAULT_CARGO_TYPES);
  }
});

// PUT /api/settings/cargo-types — update cargo types list (admin)
router.put("/cargo-types", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const types = req.body;
  if (!Array.isArray(types)) {
    return res.status(400).json({ message: "Payload must be an array of strings" });
  }
  const cleaned = types.map((t: unknown) => String(t).trim()).filter(Boolean);
  await db
    .insert(portalContentTable)
    .values({ key: CARGO_TYPES_KEY, value: JSON.stringify(cleaned), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: JSON.stringify(cleaned), updatedAt: new Date() },
    });
  return res.json({ ok: true, count: cleaned.length });
});

// GET /api/settings/ai-intake — get AI intake settings (admin)
router.get("/ai-intake", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const settings = await getAiIntakeSettings();
  return res.json(settings);
});

// PUT /api/settings/ai-intake — update AI intake settings (admin)
router.put("/ai-intake", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { enabled, replyWaTemplate, replyEmailSubject, replyEmailBody, vendorFilterMode } = req.body ?? {};
  if (enabled !== undefined && typeof enabled !== "boolean") {
    return res.status(400).json({ message: "enabled harus boolean" });
  }
  const validFilterModes: VendorFilterMode[] = ["all", "by-service-type"];
  if (vendorFilterMode !== undefined && !validFilterModes.includes(vendorFilterMode as VendorFilterMode)) {
    return res.status(400).json({ message: "vendorFilterMode harus 'all' atau 'by-service-type'" });
  }
  await saveAiIntakeSettings({
    enabled: enabled ?? true,
    replyWaTemplate: typeof replyWaTemplate === "string" ? replyWaTemplate : undefined,
    replyEmailSubject: typeof replyEmailSubject === "string" ? replyEmailSubject : undefined,
    replyEmailBody: typeof replyEmailBody === "string" ? replyEmailBody : undefined,
    vendorFilterMode: vendorFilterMode as VendorFilterMode | undefined,
  });
  return res.json({ message: "Pengaturan AI intake disimpan." });
});

const NAV_COMPANY_CONFIG_KEY = "nav_company_config";

// GET /api/settings/nav-company-config — load nav item company restrictions (admin)
router.get("/nav-company-config", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, NAV_COMPANY_CONFIG_KEY));
    return res.json(row ? JSON.parse(row.value) : {});
  } catch {
    return res.json({});
  }
});

// PUT /api/settings/nav-company-config — save nav item company restrictions (admin)
router.put("/nav-company-config", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const config = req.body;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return res.status(400).json({ message: "Payload harus berupa object" });
  }
  await db
    .insert(portalContentTable)
    .values({ key: NAV_COMPANY_CONFIG_KEY, value: JSON.stringify(config), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: JSON.stringify(config), updatedAt: new Date() },
    });
  return res.json({ ok: true });
});

// ── Short Links Management (admin) ─────────────────────────────────────────

// GET /api/settings/short-links?page=1&pageSize=20&search=xxx
router.get("/short-links", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  const search = String(req.query.search ?? "").trim();
  const offset = (page - 1) * pageSize;

  try {
    const where = search
      ? or(
          ilike(shortLinksTable.code, `%${search}%`),
          ilike(shortLinksTable.targetUrl, `%${search}%`),
          ilike(shortLinksTable.context, `%${search}%`),
          ilike(shortLinksTable.refId, `%${search}%`),
        )
      : undefined;

    const [rows, countResult] = await Promise.all([
      db.select().from(shortLinksTable)
        .where(where)
        .orderBy(desc(shortLinksTable.createdAt))
        .limit(pageSize)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(shortLinksTable).where(where),
    ]);

    return res.json({
      data: rows,
      total: countResult[0]?.count ?? 0,
      page,
      pageSize,
    });
  } catch (err) {
    req.log?.error({ err }, "short-links list error");
    return res.status(500).json({ message: "Gagal memuat short links" });
  }
});

// DELETE /api/settings/short-links/:id
router.delete("/short-links/:id", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID tidak valid" });
  try {
    await db.delete(shortLinksTable).where(eq(shortLinksTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "short-link delete error");
    return res.status(500).json({ message: "Gagal menghapus" });
  }
});

// PATCH /api/settings/short-links/:id/deactivate — set expiresAt to now (expired)
router.patch("/short-links/:id/deactivate", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID tidak valid" });
  try {
    await db.update(shortLinksTable)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(shortLinksTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "short-link deactivate error");
    return res.status(500).json({ message: "Gagal menonaktifkan" });
  }
});

// PATCH /api/settings/short-links/:id/reactivate — clear expiresAt
router.patch("/short-links/:id/reactivate", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ message: "ID tidak valid" });
  try {
    await db.update(shortLinksTable)
      .set({ expiresAt: null })
      .where(eq(shortLinksTable.id, id));
    return res.json({ ok: true });
  } catch (err) {
    req.log?.error({ err }, "short-link reactivate error");
    return res.status(500).json({ message: "Gagal mengaktifkan kembali" });
  }
});

export default router;
