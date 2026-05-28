import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { getAdminWa, setAdminWa, getAdminGroupWa, setAdminGroupWa } from "../lib/adminWa.js";
import { db, portalContentTable } from "@workspace/db";
import { broadcastToPortal } from "../lib/sseManager.js";
import { shortLinksTable, waTemplateConfigsTable, notificationLogsTable } from "@workspace/db/schema";
import { eq, desc, ilike, or, sql, and } from "drizzle-orm";
import { getAiIntakeSettings, saveAiIntakeSettings, type VendorFilterMode } from "../lib/aiOrderIntake.js";
import { LOGISTICS_SUBCATEGORIES } from "@workspace/logistics-constants";

const router = Router();

const CALC_RATES_KEY = "calculator_rates";
const CARGO_TYPES_KEY = "cargo_types";
const DEFAULT_CARGO_TYPES = ["Electronics", "Textiles", "Furniture", "Food & Beverage", "Chemicals", "Machinery", "Automotive Parts", "Medical Supplies", "Paper & Printing", "Raw Materials"];
const LOGISTICS_SUBCATEGORIES_KEY = "logistics_subcategories";

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
  // Notify Customer Portal: tarif kalkulator diperbarui oleh admin.
  // Listener: calculator.tsx (invalidates ["portal-calculator-rates"])
  broadcastToPortal("price_sync", { ts: Date.now() });
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

// ── WA Template Configs (workflow-based) ──────────────────────────────────────

// GET /api/settings/wa-template-configs — fetch all saved workflow templates
router.get("/wa-template-configs", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const { getWaDefaultTemplatesFlatMap } = await import("../lib/orderNotification.js");
    const rows = await db.select().from(waTemplateConfigsTable);
    const savedKeys: string[] = [];
    // Start with all defaults so unsaved templates show their default content
    const configs: Record<string, string> = { ...getWaDefaultTemplatesFlatMap() };
    for (const row of rows) {
      const key = `${row.recipient}__${row.workflow}`;
      // Only override default if body is non-empty (empty DB rows = treat as default)
      if (row.body.trim()) {
        configs[key] = row.body;
        savedKeys.push(key);
      }
    }
    return res.json({ configs, savedKeys });
  } catch {
    return res.json({ configs: {}, savedKeys: [] });
  }
});

// PUT /api/settings/wa-template-configs — save/update one workflow template
router.put("/wa-template-configs", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { recipient, workflow, body } = req.body as { recipient?: string; workflow?: string; body?: string };
  if (!recipient || !workflow || typeof body !== "string") {
    return res.status(400).json({ message: "Payload harus berupa { recipient, workflow, body }" });
  }
  if (!body.trim()) {
    return res.status(400).json({ message: "Template tidak boleh kosong. Gunakan tombol 'Reset ke Default' untuk menghapus kustomisasi." });
  }
  const VALID_RECIPIENTS = ["admin_personal", "admin_group", "customer", "vendor"];
  const VALID_WORKFLOWS = [
    // ── Existing logistics & product order workflows ──────────────────────
    "order_new", "vendor_request", "vendor_submission", "vendor_revision",
    "vendor_confirmed", "vendor_rejected",
    "vendor_submit_confirm", "vendor_rfq_forward", "vendor_submission_summary", "revision_fallback",
    "customer_approval", "customer_approved", "customer_options",
    "customer_revised", "customer_rejected",
    "so_created", "op_request", "task_link", "task_update",
    "driver_assigned", "shipment_update", "customs_update",
    "operational_update", "delivery_completed",
    "rfq_vendor_recap", "customer_rejection", "op_confirm_submitted", "customer_rfq_response",
    "product_order_new",
    "product_order_status_update",
    "product_vendor_response", "vendor_awarded", "vendor_selected_admin",
    "quotation_send",
    // ── PROCUREMENT ───────────────────────────────────────────────────────
    "procurement_purchase_request",
    "procurement_vendor_comparison",
    "procurement_po_release",
    "procurement_goods_receipt",
    "procurement_invoice_matching",
    // ── FINANCE ───────────────────────────────────────────────────────────
    "finance_customer_invoice",
    "finance_vendor_invoice",
    "finance_payment_reminder",
    "finance_payment_confirmation",
    "finance_outstanding_alert",
    // ── DOCUMENT ──────────────────────────────────────────────────────────
    "doc_missing",
    "doc_approved",
    "doc_customs_released",
    "doc_bl_released",
    "doc_coa_uploaded",
    // ── APPROVAL ──────────────────────────────────────────────────────────
    "approval_waiting",
    "approval_approved",
    "approval_rejected",
    "approval_revision_requested",
    // ── OPERATIONS ────────────────────────────────────────────────────────
    "ops_shipment_delayed",
    "ops_truck_arrived",
    "ops_driver_checkin",
    "ops_warehouse_ready",
    // ── SYSTEM ────────────────────────────────────────────────────────────
    "sys_template_updated",
    "sys_required_field_missing",
    "sys_required_doc_missing",
  ];
  if (!VALID_RECIPIENTS.includes(recipient)) return res.status(400).json({ message: "recipient tidak valid" });
  if (!VALID_WORKFLOWS.includes(workflow)) return res.status(400).json({ message: "workflow tidak valid" });

  await db.insert(waTemplateConfigsTable)
    .values({ recipient, workflow, body, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [waTemplateConfigsTable.recipient, waTemplateConfigsTable.workflow],
      set: { body, updatedAt: new Date() },
    });

  try {
    const { invalidateWaTemplateCache } = await import("../lib/orderNotification.js");
    invalidateWaTemplateCache();
  } catch { /* non-fatal */ }

  return res.json({ ok: true });
});

// DELETE /api/settings/wa-template-configs/:recipient/:workflow — reset to default
router.delete("/wa-template-configs/:recipient/:workflow", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { recipient, workflow } = req.params as { recipient: string; workflow: string };
  try {
    await db.delete(waTemplateConfigsTable).where(
      and(
        eq(waTemplateConfigsTable.recipient, recipient),
        eq(waTemplateConfigsTable.workflow, workflow),
      )
    );
  } catch { /* ignore */ }
  return res.json({ ok: true });
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

// GET /api/settings/logistics-subcategories — get subcategory list (admin)
router.get("/logistics-subcategories", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, LOGISTICS_SUBCATEGORIES_KEY));
    const cats = row ? JSON.parse(row.value) : LOGISTICS_SUBCATEGORIES;
    return res.json(cats);
  } catch {
    return res.json(LOGISTICS_SUBCATEGORIES);
  }
});

// PUT /api/settings/logistics-subcategories — update subcategory list (admin)
router.put("/logistics-subcategories", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const cats = req.body;
  if (!Array.isArray(cats)) {
    return res.status(400).json({ message: "Payload must be an array of strings" });
  }
  const cleaned = cats.map((c: unknown) => String(c).trim()).filter(Boolean);
  await db
    .insert(portalContentTable)
    .values({ key: LOGISTICS_SUBCATEGORIES_KEY, value: JSON.stringify(cleaned), updatedAt: new Date() })
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

// GET /api/settings/wa-logs?page=1&pageSize=30&status=&search=
router.get("/wa-logs", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const page     = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 30));
  const status   = String(req.query.status ?? "").trim();
  const search   = String(req.query.search  ?? "").trim();
  const offset   = (page - 1) * pageSize;
  try {
    const conditions: ReturnType<typeof eq>[] = [eq(notificationLogsTable.channel, "wa")];
    if (status === "sent" || status === "failed") conditions.push(eq(notificationLogsTable.status, status));
    if (search) {
      conditions.push(
        or(
          ilike(notificationLogsTable.recipient, `%${search}%`),
          ilike(notificationLogsTable.refId,     `%${search}%`),
          ilike(notificationLogsTable.context,   `%${search}%`),
        ) as ReturnType<typeof eq>,
      );
    }
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    const [rows, countResult] = await Promise.all([
      db.select({
        id: notificationLogsTable.id,
        recipient: notificationLogsTable.recipient,
        message: notificationLogsTable.message,
        status: notificationLogsTable.status,
        errorMsg: notificationLogsTable.errorMsg,
        context: notificationLogsTable.context,
        refType: notificationLogsTable.refType,
        refId: notificationLogsTable.refId,
        createdAt: notificationLogsTable.createdAt,
      }).from(notificationLogsTable).where(where).orderBy(desc(notificationLogsTable.createdAt)).limit(pageSize).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(notificationLogsTable).where(where),
    ]);
    return res.json({ data: rows, total: countResult[0]?.count ?? 0, page, pageSize });
  } catch (err) {
    req.log?.error({ err }, "wa-logs list error");
    return res.status(500).json({ message: "Gagal memuat log WA" });
  }
});

// GET /api/settings/wa-logs/stats — summary counts for 7d and 30d
router.get("/wa-logs/stats", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  try {
    const now = new Date();
    const d7  = new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000);
    const d30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [rows7, rows30, rowsAll] = await Promise.all([
      db.select({
        status: notificationLogsTable.status,
        count: sql<number>`count(*)::int`,
      }).from(notificationLogsTable)
        .where(and(eq(notificationLogsTable.channel, "wa"), sql`${notificationLogsTable.createdAt} >= ${d7}`))
        .groupBy(notificationLogsTable.status),
      db.select({
        status: notificationLogsTable.status,
        count: sql<number>`count(*)::int`,
      }).from(notificationLogsTable)
        .where(and(eq(notificationLogsTable.channel, "wa"), sql`${notificationLogsTable.createdAt} >= ${d30}`))
        .groupBy(notificationLogsTable.status),
      db.select({
        status: notificationLogsTable.status,
        count: sql<number>`count(*)::int`,
      }).from(notificationLogsTable)
        .where(eq(notificationLogsTable.channel, "wa"))
        .groupBy(notificationLogsTable.status),
    ]);

    const tally = (rows: { status: string; count: number }[]) => ({
      sent:   rows.find(r => r.status === "sent")?.count   ?? 0,
      failed: rows.find(r => r.status === "failed")?.count ?? 0,
    });

    return res.json({ d7: tally(rows7), d30: tally(rows30), all: tally(rowsAll) });
  } catch (err) {
    req.log?.error({ err }, "wa-logs stats error");
    return res.status(500).json({ message: "Gagal memuat statistik WA" });
  }
});

// GET /api/settings/wa-logs/export?status=&search= — download as CSV
router.get("/wa-logs/export", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const status = String(req.query.status ?? "").trim();
  const search = String(req.query.search  ?? "").trim();
  try {
    const conditions: ReturnType<typeof eq>[] = [eq(notificationLogsTable.channel, "wa")];
    if (status === "sent" || status === "failed") conditions.push(eq(notificationLogsTable.status, status));
    if (search) {
      conditions.push(
        or(
          ilike(notificationLogsTable.recipient, `%${search}%`),
          ilike(notificationLogsTable.refId,     `%${search}%`),
          ilike(notificationLogsTable.context,   `%${search}%`),
        ) as ReturnType<typeof eq>,
      );
    }
    const where = conditions.length === 1 ? conditions[0] : and(...conditions);
    const rows = await db.select({
      id: notificationLogsTable.id,
      recipient: notificationLogsTable.recipient,
      status: notificationLogsTable.status,
      errorMsg: notificationLogsTable.errorMsg,
      context: notificationLogsTable.context,
      refType: notificationLogsTable.refType,
      refId: notificationLogsTable.refId,
      message: notificationLogsTable.message,
      createdAt: notificationLogsTable.createdAt,
    }).from(notificationLogsTable).where(where).orderBy(desc(notificationLogsTable.createdAt)).limit(5000);

    const escape = (v: unknown) => {
      if (v == null) return "";
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };
    const header = ["id", "tanggal", "penerima", "status", "error", "context", "refType", "refId", "pesan"];
    const csvRows = [
      header.join(","),
      ...rows.map(r => [
        r.id,
        new Date(r.createdAt).toLocaleString("id-ID"),
        escape(r.recipient),
        escape(r.status),
        escape(r.errorMsg),
        escape(r.context),
        escape(r.refType),
        escape(r.refId),
        escape(r.message),
      ].join(",")),
    ];
    const csv = csvRows.join("\r\n");
    const filename = `wa-log-${new Date().toISOString().slice(0,10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Cache-Control", "no-cache");
    return res.send("\uFEFF" + csv); // BOM for Excel UTF-8
  } catch (err) {
    req.log?.error({ err }, "wa-logs export error");
    return res.status(500).json({ message: "Gagal export log WA" });
  }
});

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

// ── Page Content (konten teks halaman publik) ────────────────────────────────
const PAGE_CONTENT_KEY = "page_content";

export const DEFAULT_PAGE_CONTENT = {
  admin_review: {
    pageTitle: "Review & Blast Vendor",
    pageSubtitle: "CST Logistics — Admin Panel",
    deadlineLabel: "Batas Waktu Respon Vendor",
    vendorSectionTitle: "Pilih Vendor",
    blastHint: "Vendor akan menerima WA dengan link form penawaran",
  },
};

// GET /api/settings/page-content — public (dipakai customer portal)
router.get("/page-content", async (req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, PAGE_CONTENT_KEY));
    const content = row ? JSON.parse(row.value) : DEFAULT_PAGE_CONTENT;
    return res.json({ ...DEFAULT_PAGE_CONTENT, ...content });
  } catch {
    return res.json(DEFAULT_PAGE_CONTENT);
  }
});

// PUT /api/settings/page-content — admin only
router.put("/page-content", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const content = req.body;
  if (!content || typeof content !== "object") {
    return res.status(400).json({ message: "Invalid payload" });
  }
  await db
    .insert(portalContentTable)
    .values({ key: PAGE_CONTENT_KEY, value: JSON.stringify(content), updatedAt: new Date() })
    .onConflictDoUpdate({
      target: portalContentTable.key,
      set: { value: JSON.stringify(content), updatedAt: new Date() },
    });
  return res.json({ ok: true });
});

// ── Freight Stage Labels ──────────────────────────────────────────────────────
const FREIGHT_STAGE_LABELS_KEY = "freight_stage_labels";

export const DEFAULT_FREIGHT_STAGE_LABELS: Record<string, string> = {
  booking: "Booking",
  trucking: "Trucking",
  handling: "Handling",
  customs: "Customs Clearance",
};

// GET /api/settings/freight-stage-labels — no auth required (used by authenticated BizPortal pages)
router.get("/freight-stage-labels", async (_req: Request, res: Response) => {
  try {
    const [row] = await db.select().from(portalContentTable).where(eq(portalContentTable.key, FREIGHT_STAGE_LABELS_KEY));
    const stored: Record<string, string> = row ? JSON.parse(row.value) as Record<string, string> : {};
    return res.json({ labels: { ...DEFAULT_FREIGHT_STAGE_LABELS, ...stored } });
  } catch {
    return res.json({ labels: DEFAULT_FREIGHT_STAGE_LABELS });
  }
});

// PUT /api/settings/freight-stage-labels — admin only
router.put("/freight-stage-labels", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { labels } = req.body as { labels?: Record<string, string> };
  if (!labels || typeof labels !== "object") return res.status(400).json({ message: "Invalid payload" });
  const filtered: Record<string, string> = {};
  for (const k of Object.keys(DEFAULT_FREIGHT_STAGE_LABELS)) {
    if (typeof labels[k] === "string" && labels[k].trim()) filtered[k] = labels[k].trim();
  }
  await db
    .insert(portalContentTable)
    .values({ key: FREIGHT_STAGE_LABELS_KEY, value: JSON.stringify(filtered), updatedAt: new Date() })
    .onConflictDoUpdate({ target: portalContentTable.key, set: { value: JSON.stringify(filtered), updatedAt: new Date() } });
  return res.json({ ok: true, labels: { ...DEFAULT_FREIGHT_STAGE_LABELS, ...filtered } });
});

export default router;
