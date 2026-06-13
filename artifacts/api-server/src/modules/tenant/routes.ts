import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../../lib/logger.js";
import { requireAdmin } from "../../lib/requireAdmin.js";
import { postTenantRentPayment } from "../../lib/accounting.js";

const router: IRouter = Router();

function companyOf(req: Request): number | null {
  const raw = req.query.companyId ?? (req.body as any)?.company_id;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function nextNumber(prefix: string, table: string): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `${prefix}/${year}/%`;
  const { rows } = (await db.execute(
    sql`SELECT COALESCE(MAX(CAST(SPLIT_PART(order_number, '/', 3) AS INTEGER)), 0) AS max_seq
        FROM ${sql.raw(table)} WHERE order_number LIKE ${pattern}`,
  )) as unknown as { rows: { max_seq: number }[] };
  const seq = (Number(rows[0]?.max_seq ?? 0) + 1).toString().padStart(4, "0");
  return `${prefix}/${year}/${seq}`;
}

async function nextPaymentNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const pattern = `TPY/${year}/%`;
  const { rows } = (await db.execute(
    sql`SELECT COALESCE(MAX(CAST(SPLIT_PART(payment_number, '/', 3) AS INTEGER)), 0) AS max_seq
        FROM tenant_payments WHERE payment_number LIKE ${pattern}`,
  )) as unknown as { rows: { max_seq: number }[] };
  const seq = (Number(rows[0]?.max_seq ?? 0) + 1).toString().padStart(4, "0");
  return `TPY/${year}/${seq}`;
}

async function writeAuditLog(
  action: string,
  module: string,
  referenceId: number | null,
  payload: unknown,
  req: Request,
): Promise<void> {
  try {
    const userId = (req as any).user?.id ?? null;
    const companyId = companyOf(req);
    await db.execute(sql`
      INSERT INTO erp_audit_logs (action, module, reference_id, new_data, user_id, company_id, created_at)
      VALUES (${action}, ${module}, ${referenceId?.toString() ?? null}, ${JSON.stringify(payload)}::jsonb, ${userId}, ${companyId}, NOW())
    `);
  } catch {
    /* audit log failure must not break main flow */
  }
}

/* ───────────────────────── DASHBOARD ───────────────────────── */
router.get("/dashboard", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const cFilter = companyId ? sql`WHERE company_id = ${companyId}` : sql``;
  const cAnd = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows: t } = (await db.execute(
      sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE status = 'active')::int AS active FROM tenants ${cFilter}`,
    )) as unknown as { rows: { total: number; active: number }[] };
    const { rows: b } = (await db.execute(
      sql`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE payment_status = 'unpaid')::int AS unpaid FROM tenant_bookings ${cFilter}`,
    )) as unknown as { rows: { total: number; unpaid: number }[] };
    const { rows: p } = (await db.execute(
      sql`SELECT COALESCE(SUM(amount), 0)::float AS revenue FROM tenant_payments WHERE status = 'confirmed' ${cAnd}`,
    )) as unknown as { rows: { revenue: number }[] };
    const { rows: pendingAll } = (await db.execute(
      sql`SELECT COUNT(*)::int AS pending FROM tenant_payments WHERE status = 'pending' ${cAnd}`,
    )) as unknown as { rows: { pending: number }[] };

    const uFilter = companyId ? sql`WHERE company_id = ${companyId}` : sql``;
    const { rows: u } = (await db.execute(
      sql`SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'available')::int AS available,
            COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied,
            COUNT(*) FILTER (WHERE status = 'maintenance')::int AS maintenance,
            COUNT(*) FILTER (WHERE company_id = 1)::int AS sport_center,
            COUNT(*) FILTER (WHERE company_id = 2)::int AS tod_m1
          FROM tenant_units ${uFilter}`,
    )) as unknown as { rows: { total: number; available: number; occupied: number; maintenance: number; sport_center: number; tod_m1: number }[] };

    const iFilter = companyId ? sql`WHERE company_id = ${companyId}` : sql``;
    const { rows: inv } = (await db.execute(sql`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE status = 'paid')::int AS paid,
        COUNT(*) FILTER (WHERE status IN ('unpaid','partial','sent'))::int AS unpaid_count,
        COUNT(*) FILTER (WHERE status = 'overdue' OR (due_date < CURRENT_DATE AND status NOT IN ('paid','cancelled')))::int AS overdue,
        COALESCE(SUM(outstanding_amount) FILTER (WHERE status NOT IN ('paid','cancelled')), 0)::float AS total_outstanding,
        COALESCE(SUM(paid_amount) FILTER (WHERE paid_at >= DATE_TRUNC('month', NOW())), 0)::float AS paid_this_month
      FROM tenant_invoices ${iFilter}`,
    )) as unknown as { rows: any[] };

    res.json({
      tenants: t[0] ?? { total: 0, active: 0 },
      bookings: b[0] ?? { total: 0, unpaid: 0 },
      revenue: p[0]?.revenue ?? 0,
      pendingPayments: pendingAll[0]?.pending ?? 0,
      units: u[0] ?? { total: 0, available: 0, occupied: 0, maintenance: 0, sport_center: 0, tod_m1: 0 },
      invoices: inv[0] ?? { total: 0, paid: 0, unpaid_count: 0, overdue: 0, total_outstanding: 0, paid_this_month: 0 },
    });
  } catch (err) {
    logger.error({ err }, "tenant dashboard failed");
    res.status(500).json({ error: "Gagal memuat dashboard" });
  }
});

/* ───────────────────────── TENANT UNITS ───────────────────────── */
router.get("/units", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const search = String(req.query.search ?? "").trim();
  const areaName = String(req.query.area_name ?? "").trim();
  const unitType = String(req.query.unit_type ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  try {
    const conds: ReturnType<typeof sql>[] = [];
    if (companyId) conds.push(sql`company_id = ${companyId}`);
    if (areaName) conds.push(sql`area_name = ${areaName}`);
    if (unitType) conds.push(sql`unit_type = ${unitType}`);
    if (status) conds.push(sql`status = ${status}`);
    if (search) conds.push(sql`(unit_code ILIKE ${"%" + search + "%"} OR name ILIKE ${"%" + search + "%"})`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = (await db.execute(
      sql`SELECT * FROM tenant_units ${where} ORDER BY company_id, area_name, unit_code`,
    )) as unknown as { rows: any[] };
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "list tenant units failed");
    res.status(500).json({ error: "Gagal memuat unit" });
  }
});

router.post("/units", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body ?? {};
  if (!b.unit_code || !b.name) return void res.status(400).json({ error: "Kode unit dan nama wajib diisi" });
  const companyId = Number(b.company_id ?? companyOf(req) ?? 1);
  if (![1, 2].includes(companyId)) return void res.status(400).json({ error: "Lokasi harus Sport Center (1) atau TOD M1 (2)" });
  try {
    const { rows } = (await db.execute(sql`
      INSERT INTO tenant_units (company_id, unit_code, name, area_name, unit_type, area_sqm, monthly_rate, status, notes, position_x, position_y, width, height)
      VALUES (${companyId}, ${String(b.unit_code).toUpperCase()}, ${b.name}, ${b.area_name ?? "Area Kantin"},
              ${b.unit_type ?? "food_booth"}, ${b.area_sqm ?? null}, ${b.monthly_rate ?? null},
              ${b.status ?? "available"}, ${b.notes ?? null},
              ${Number(b.position_x ?? 0)}, ${Number(b.position_y ?? 0)},
              ${Number(b.width ?? 100)}, ${Number(b.height ?? 80)})
      RETURNING *`)) as unknown as { rows: any[] };
    await writeAuditLog("CREATE", "tenant_unit", rows[0]?.id ?? null, { unit_code: rows[0]?.unit_code, company_id: companyId }, req);
    res.json(rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") return void res.status(409).json({ error: "Kode unit sudah digunakan di lokasi ini" });
    logger.error({ err }, "create tenant unit failed");
    res.status(500).json({ error: "Gagal menyimpan unit" });
  }
});

router.put("/units/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`
      UPDATE tenant_units SET
        unit_code = COALESCE(${b.unit_code ? String(b.unit_code).toUpperCase() : null}, unit_code),
        name = COALESCE(${b.name ?? null}, name),
        area_name = COALESCE(${b.area_name ?? null}, area_name),
        unit_type = COALESCE(${b.unit_type ?? null}, unit_type),
        area_sqm = ${b.area_sqm ?? null},
        monthly_rate = ${b.monthly_rate ?? null},
        status = COALESCE(${b.status ?? null}, status),
        notes = ${b.notes ?? null},
        position_x = COALESCE(${b.position_x != null ? Number(b.position_x) : null}, position_x),
        position_y = COALESCE(${b.position_y != null ? Number(b.position_y) : null}, position_y),
        width = COALESCE(${b.width != null ? Number(b.width) : null}, width),
        height = COALESCE(${b.height != null ? Number(b.height) : null}, height),
        updated_at = NOW()
      WHERE id = ${id} ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Unit tidak ditemukan" });
    await writeAuditLog("UPDATE", "tenant_unit", id, { changes: b }, req);
    res.json(rows[0]);
  } catch (err: any) {
    if (err?.code === "23505") return void res.status(409).json({ error: "Kode unit sudah digunakan di lokasi ini" });
    logger.error({ err }, "update tenant unit failed");
    res.status(500).json({ error: "Gagal memperbarui unit" });
  }
});

router.delete("/units/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(
      sql`UPDATE tenant_units SET status = 'inactive', updated_at = NOW() WHERE id = ${id} ${cf} RETURNING *`,
    )) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Unit tidak ditemukan" });
    await writeAuditLog("DEACTIVATE", "tenant_unit", id, { unit_code: rows[0]?.unit_code }, req);
    res.json({ ok: true, unit: rows[0] });
  } catch (err) {
    logger.error({ err }, "deactivate tenant unit failed");
    res.status(500).json({ error: "Gagal menonaktifkan unit" });
  }
});

/* ───────────────────────── TENANTS ───────────────────────── */
router.get("/tenants", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "all");
  try {
    const conds: ReturnType<typeof sql>[] = [];
    if (companyId) conds.push(sql`company_id = ${companyId}`);
    if (status !== "all") conds.push(sql`status = ${status}`);
    if (search) conds.push(sql`(business_name ILIKE ${"%" + search + "%"} OR owner_name ILIKE ${"%" + search + "%"} OR phone ILIKE ${"%" + search + "%"})`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = (await db.execute(
      sql`SELECT * FROM tenants ${where} ORDER BY created_at DESC`,
    )) as unknown as { rows: any[] };
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "list tenants failed");
    res.status(500).json({ error: "Gagal memuat penyewa" });
  }
});

router.get("/tenants/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`SELECT * FROM tenants WHERE id = ${id} ${cf} LIMIT 1`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Penyewa tidak ditemukan" });
    const { rows: bookings } = (await db.execute(
      sql`SELECT b.*, u.unit_code, u.name AS unit_name FROM tenant_bookings b
          LEFT JOIN tenant_units u ON u.id = b.unit_id
          WHERE b.tenant_id = ${id} ORDER BY b.created_at DESC`,
    )) as unknown as { rows: any[] };
    const { rows: payments } = (await db.execute(
      sql`SELECT p.* FROM tenant_payments p
          JOIN tenant_bookings b ON b.id = p.tenant_booking_id
          WHERE b.tenant_id = ${id} ORDER BY p.created_at DESC`,
    )) as unknown as { rows: any[] };
    res.json({ ...rows[0], bookings, payments });
  } catch (err) {
    logger.error({ err }, "get tenant failed");
    res.status(500).json({ error: "Gagal memuat penyewa" });
  }
});

router.post("/tenants", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body ?? {};
  if (!b.business_name || !b.owner_name) return void res.status(400).json({ error: "Nama usaha dan pemilik wajib diisi" });
  try {
    const { rows } = (await db.execute(sql`
      INSERT INTO tenants (company_id, business_name, owner_name, phone, email, business_category, logo_url, address, status)
      VALUES (${companyOf(req) ?? 1}, ${b.business_name}, ${b.owner_name}, ${b.phone ?? null}, ${b.email ?? null},
              ${b.business_category ?? null}, ${b.logo_url ?? null}, ${b.address ?? null}, ${b.status ?? "active"})
      RETURNING *`)) as unknown as { rows: any[] };
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "create tenant failed");
    res.status(500).json({ error: "Gagal menyimpan penyewa" });
  }
});

router.put("/tenants/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`
      UPDATE tenants SET
        business_name = COALESCE(${b.business_name ?? null}, business_name),
        owner_name = COALESCE(${b.owner_name ?? null}, owner_name),
        phone = ${b.phone ?? null},
        email = ${b.email ?? null},
        business_category = ${b.business_category ?? null},
        logo_url = ${b.logo_url ?? null},
        address = ${b.address ?? null},
        status = COALESCE(${b.status ?? null}, status),
        updated_at = NOW()
      WHERE id = ${id} ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Penyewa tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "update tenant failed");
    res.status(500).json({ error: "Gagal memperbarui penyewa" });
  }
});

router.delete("/tenants/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`DELETE FROM tenants WHERE id = ${id} ${cf} RETURNING id`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Penyewa tidak ditemukan" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete tenant failed");
    res.status(500).json({ error: "Gagal menghapus penyewa" });
  }
});

/* ───────────────────────── BOOKINGS ───────────────────────── */
router.get("/bookings", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const status = String(req.query.status ?? "all");
  const search = String(req.query.search ?? "").trim();
  try {
    const conds: ReturnType<typeof sql>[] = [];
    if (companyId) conds.push(sql`b.company_id = ${companyId}`);
    if (status !== "all") conds.push(sql`b.payment_status = ${status}`);
    if (search) conds.push(sql`(b.order_number ILIKE ${"%" + search + "%"} OR t.business_name ILIKE ${"%" + search + "%"})`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = (await db.execute(sql`
      SELECT b.*, t.business_name, t.owner_name, u.unit_code, u.name AS unit_name
      FROM tenant_bookings b
      JOIN tenants t ON t.id = b.tenant_id
      LEFT JOIN tenant_units u ON u.id = b.unit_id
      ${where} ORDER BY b.created_at DESC`)) as unknown as { rows: any[] };
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "list bookings failed");
    res.status(500).json({ error: "Gagal memuat penyewaan" });
  }
});

router.post("/bookings", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body ?? {};
  if (!b.tenant_id) return void res.status(400).json({ error: "Penyewa wajib dipilih" });
  const companyId = companyOf(req) ?? 1;
  try {
    const { rows: tRows } = (await db.execute(
      sql`SELECT id, site_id FROM tenants WHERE id = ${Number(b.tenant_id)} AND company_id = ${companyId} LIMIT 1`,
    )) as unknown as { rows: { id: number; site_id: number | null }[] };
    if (!tRows[0]) return void res.status(400).json({ error: "Penyewa tidak valid untuk perusahaan ini" });
    const siteId = tRows[0].site_id;

    if (b.unit_id) {
      const unitId = Number(b.unit_id);
      const { rows: uRows } = (await db.execute(
        sql`SELECT id, status FROM tenant_units WHERE id = ${unitId} AND company_id = ${companyId} LIMIT 1`,
      )) as unknown as { rows: { id: number; status: string }[] };
      if (!uRows[0]) return void res.status(400).json({ error: "Unit tidak ditemukan" });
      if (uRows[0].status === "maintenance") return void res.status(409).json({ error: "Unit sedang maintenance, tidak bisa dipesan" });
      if (uRows[0].status === "inactive") return void res.status(409).json({ error: "Unit tidak aktif, tidak bisa dipesan" });

      if (b.start_date && b.end_date) {
        const { rows: overlap } = (await db.execute(
          sql`SELECT id FROM tenant_bookings
              WHERE unit_id = ${unitId}
                AND status NOT IN ('cancelled')
                AND start_date IS NOT NULL AND end_date IS NOT NULL
                AND start_date <= ${b.end_date} AND end_date >= ${b.start_date}
              LIMIT 1`,
        )) as unknown as { rows: any[] };
        if (overlap[0]) return void res.status(409).json({ error: "Unit sudah dibooking pada periode yang sama" });
      }
    }

    const orderNumber = await nextNumber("TNT", "tenant_bookings");
    const { rows } = (await db.execute(sql`
      INSERT INTO tenant_bookings
        (company_id, site_id, order_number, tenant_id, unit_id, booking_type, start_date, end_date, duration_months,
         requested_area, description, price, payment_status, status, admin_notes,
         payment_period_type, total_months, monthly_price, yearly_price, total_price)
      VALUES
        (${companyId}, ${siteId}, ${orderNumber}, ${Number(b.tenant_id)}, ${b.unit_id ? Number(b.unit_id) : null},
         ${b.booking_type ?? "rental"},
         ${b.start_date ?? null}, ${b.end_date ?? null}, ${b.duration_months ?? null},
         ${b.requested_area ?? null}, ${b.description ?? null}, ${Number(b.price ?? b.total_price ?? 0)},
         ${b.payment_status ?? "unpaid"}, ${b.status ?? "pending"}, ${b.admin_notes ?? null},
         ${b.payment_period_type ?? "monthly"}, ${b.total_months ?? null},
         ${b.monthly_price ?? null}, ${b.yearly_price ?? null}, ${b.total_price ?? b.price ?? null})
      RETURNING *`)) as unknown as { rows: any[] };
    await writeAuditLog("CREATE", "tenant_booking", rows[0]?.id ?? null, { order_number: rows[0]?.order_number, unit_id: b.unit_id ?? null }, req);
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "create booking failed");
    res.status(500).json({ error: "Gagal menyimpan penyewaan" });
  }
});

router.put("/bookings/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`
      UPDATE tenant_bookings SET
        booking_type = COALESCE(${b.booking_type ?? null}, booking_type),
        unit_id = CASE WHEN ${b.unit_id != null} THEN ${b.unit_id ? Number(b.unit_id) : null} ELSE unit_id END,
        start_date = ${b.start_date ?? null},
        end_date = ${b.end_date ?? null},
        duration_months = ${b.duration_months ?? null},
        requested_area = ${b.requested_area ?? null},
        description = ${b.description ?? null},
        price = COALESCE(${b.price ?? null}, price),
        payment_status = COALESCE(${b.payment_status ?? null}, payment_status),
        status = COALESCE(${b.status ?? null}, status),
        admin_notes = ${b.admin_notes ?? null},
        total_price = COALESCE(${b.total_price ?? null}, total_price),
        updated_at = NOW()
      WHERE id = ${id} ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Penyewaan tidak ditemukan" });
    await writeAuditLog("UPDATE", "tenant_booking", id, { changes: b }, req);
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "update booking failed");
    res.status(500).json({ error: "Gagal memperbarui penyewaan" });
  }
});

router.delete("/bookings/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`DELETE FROM tenant_bookings WHERE id = ${id} ${cf} RETURNING id`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Penyewaan tidak ditemukan" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete booking failed");
    res.status(500).json({ error: "Gagal menghapus penyewaan" });
  }
});

/* ───────────────────────── PAYMENTS ───────────────────────── */
router.get("/payments", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const status = String(req.query.status ?? "all");
  const search = String(req.query.search ?? "").trim();
  try {
    const conds: ReturnType<typeof sql>[] = [];
    if (companyId) conds.push(sql`p.company_id = ${companyId}`);
    if (status !== "all") conds.push(sql`p.status = ${status}`);
    if (search) conds.push(sql`(p.payment_number ILIKE ${"%" + search + "%"} OR b.order_number ILIKE ${"%" + search + "%"} OR t.business_name ILIKE ${"%" + search + "%"})`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = (await db.execute(sql`
      SELECT p.*, b.order_number, t.business_name, t.owner_name
      FROM tenant_payments p
      JOIN tenant_bookings b ON b.id = p.tenant_booking_id
      JOIN tenants t ON t.id = b.tenant_id
      ${where} ORDER BY p.created_at DESC`)) as unknown as { rows: any[] };
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "list payments failed");
    res.status(500).json({ error: "Gagal memuat pembayaran" });
  }
});

router.post("/payments", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body ?? {};
  if (!b.tenant_booking_id || !b.amount) return void res.status(400).json({ error: "Booking dan jumlah wajib diisi" });
  const companyId = companyOf(req) ?? 1;
  try {
    const { rows: bRows } = (await db.execute(
      sql`SELECT id, site_id, tenant_id FROM tenant_bookings WHERE id = ${Number(b.tenant_booking_id)} AND company_id = ${companyId} LIMIT 1`,
    )) as unknown as { rows: any[] };
    if (!bRows[0]) return void res.status(400).json({ error: "Penyewaan tidak valid untuk perusahaan ini" });
    const siteId = bRows[0].site_id ?? 1;
    const tenantId = bRows[0].tenant_id ?? null;
    const paymentNumber = await nextPaymentNumber();
    const invoiceId = b.invoice_id ? Number(b.invoice_id) : null;
    const { rows } = (await db.execute(sql`
      INSERT INTO tenant_payments (company_id, site_id, tenant_id, tenant_booking_id, payment_number, proof_image_url, amount, method, notes, status, invoice_id)
      VALUES (${companyId}, ${siteId}, ${tenantId}, ${Number(b.tenant_booking_id)}, ${paymentNumber}, ${b.proof_image_url ?? null},
              ${Number(b.amount)}, ${b.method ?? "transfer"}, ${b.notes ?? null}, ${b.status ?? "pending"}, ${invoiceId})
      RETURNING *`)) as unknown as { rows: any[] };
    const payment = rows[0];
    if (payment.status === "confirmed") await confirmPaymentInternal(payment.id, req, companyId);
    res.json(payment);
  } catch (err) {
    logger.error({ err }, "create payment failed");
    res.status(500).json({ error: "Gagal menyimpan pembayaran" });
  }
});

async function confirmPaymentInternal(paymentId: number, req: Request, companyId?: number | null): Promise<boolean> {
  const cf = companyId ? sql`AND p.company_id = ${companyId}` : sql``;
  const { rows } = (await db.execute(sql`
    SELECT p.id, p.payment_number, p.amount, p.status, p.company_id, p.invoice_id,
           b.id AS booking_id, b.order_number, t.business_name
    FROM tenant_payments p
    JOIN tenant_bookings b ON b.id = p.tenant_booking_id
    JOIN tenants t ON t.id = b.tenant_id
    WHERE p.id = ${paymentId} ${cf} LIMIT 1`)) as unknown as { rows: any[] };
  const row = rows[0];
  if (!row) return false;
  await db.execute(sql`UPDATE tenant_payments SET status = 'confirmed', paid_at = COALESCE(paid_at, NOW()), updated_at = NOW() WHERE id = ${paymentId}`);
  await db.execute(sql`UPDATE tenant_bookings SET payment_status = 'paid', updated_at = NOW() WHERE id = ${row.booking_id}`);
  await postTenantRentPayment({
    paymentId: row.id,
    paymentNumber: row.payment_number,
    orderNumber: row.order_number,
    businessName: row.business_name,
    date: new Date().toISOString(),
    amount: Number(row.amount),
    createdById: (req as any).user?.id ?? null,
    companyId: row.company_id ?? null,
  });
  if (row.invoice_id) {
    await applyPaymentToInvoice(row.invoice_id, Number(row.amount));
  }
  return true;
}

router.post("/payments/:id/confirm", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  try {
    const ok = await confirmPaymentInternal(id, req, companyId);
    if (!ok) return void res.status(404).json({ error: "Pembayaran tidak ditemukan" });
    const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
    const { rows } = (await db.execute(sql`SELECT * FROM tenant_payments WHERE id = ${id} ${cf} LIMIT 1`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Pembayaran tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "confirm payment failed");
    res.status(500).json({ error: "Gagal konfirmasi pembayaran" });
  }
});

/* ───────────────────────── UNITS ───────────────────────── */
router.get("/units", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const search = String(req.query.search ?? "").trim();
  try {
    const conds: ReturnType<typeof sql>[] = [];
    if (companyId) conds.push(sql`company_id = ${companyId}`);
    if (search) conds.push(sql`(unit_code ILIKE ${"%" + search + "%"} OR name ILIKE ${"%" + search + "%"} OR area_name ILIKE ${"%" + search + "%"})`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = (await db.execute(
      sql`SELECT * FROM tenant_units ${where} ORDER BY area_name, unit_code`,
    )) as unknown as { rows: any[] };
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "list units failed");
    res.status(500).json({ error: "Gagal memuat unit" });
  }
});

router.post("/units", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body ?? {};
  if (!b.unit_code || !b.name) return res.status(400).json({ error: "Kode dan nama unit wajib diisi" });
  const companyId = companyOf(req) ?? 1;
  try {
    const { rows } = (await db.execute(sql`
      INSERT INTO tenant_units (company_id, unit_code, name, area_name, unit_type, area_sqm, monthly_rate, status, notes, position_x, position_y, width, height)
      VALUES (${companyId}, ${b.unit_code}, ${b.name}, ${b.area_name ?? ""}, ${b.unit_type ?? "other"},
              ${b.area_sqm ?? null}, ${b.monthly_rate ?? null}, ${b.status ?? "available"},
              ${b.notes ?? null}, 0, 0, 100, 80)
      RETURNING *`)) as unknown as { rows: any[] };
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "create unit failed");
    res.status(500).json({ error: "Gagal menyimpan unit" });
  }
});

router.put("/units/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`
      UPDATE tenant_units SET
        unit_code = COALESCE(${b.unit_code ?? null}, unit_code),
        name = COALESCE(${b.name ?? null}, name),
        area_name = COALESCE(${b.area_name ?? null}, area_name),
        unit_type = COALESCE(${b.unit_type ?? null}, unit_type),
        area_sqm = ${b.area_sqm ?? null},
        monthly_rate = ${b.monthly_rate ?? null},
        status = COALESCE(${b.status ?? null}, status),
        notes = ${b.notes ?? null},
        updated_at = NOW()
      WHERE id = ${id} ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return res.status(404).json({ error: "Unit tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "update unit failed");
    res.status(500).json({ error: "Gagal memperbarui unit" });
  }
});

router.delete("/units/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`DELETE FROM tenant_units WHERE id = ${id} ${cf} RETURNING id`)) as unknown as { rows: any[] };
    if (!rows[0]) return res.status(404).json({ error: "Unit tidak ditemukan" });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "delete unit failed");
    res.status(500).json({ error: "Gagal menghapus unit" });
  }
});

/* ───────────────────────── INVOICES ───────────────────────── */
/* ───────────────────────── INVOICES ───────────────────────── */
async function nextInvoiceNumber(date: Date = new Date()): Promise<string> {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const pattern = `TIN/${year}/${month}/%`;
  const { rows } = (await db.execute(
    sql`SELECT COALESCE(MAX(CAST(SPLIT_PART(invoice_number, '/', 4) AS INTEGER)), 0) AS max_seq
        FROM tenant_invoices WHERE invoice_number LIKE ${pattern}`,
  )) as unknown as { rows: { max_seq: number }[] };
  const seq = (Number(rows[0]?.max_seq ?? 0) + 1).toString().padStart(4, "0");
  return `TIN/${year}/${month}/${seq}`;
}

async function applyPaymentToInvoice(invoiceId: number, paymentAmount: number): Promise<void> {
  try {
    const { rows } = (await db.execute(
      sql`SELECT id, total_amount, paid_amount FROM tenant_invoices WHERE id = ${invoiceId} LIMIT 1`,
    )) as unknown as { rows: any[] };
    if (!rows[0]) return;
    const inv = rows[0];
    const newPaid = Math.min(Number(inv.total_amount), Number(inv.paid_amount) + paymentAmount);
    const newOutstanding = Math.max(0, Number(inv.total_amount) - newPaid);
    const isPaid = newOutstanding <= 0;
    const newStatus = isPaid ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    await db.execute(sql`
      UPDATE tenant_invoices SET paid_amount = ${newPaid}, outstanding_amount = ${newOutstanding},
        status = ${newStatus}, paid_at = ${isPaid ? new Date().toISOString() : null}, updated_at = NOW()
      WHERE id = ${invoiceId}`);
  } catch (e) {
    logger.error({ e }, "applyPaymentToInvoice failed");
  }
}

router.get("/invoices", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const companyId = companyOf(req);
  const status = String(req.query.status ?? "all");
  const search = String(req.query.search ?? "").trim();
  const tenantId = req.query.tenant_id ? Number(req.query.tenant_id) : null;
  const bookingId = req.query.booking_id ? Number(req.query.booking_id) : null;
  const from = req.query.from ? String(req.query.from) : null;
  const to = req.query.to ? String(req.query.to) : null;
  try {
    const conds: ReturnType<typeof sql>[] = [];
    if (companyId) conds.push(sql`i.company_id = ${companyId}`);
    if (status !== "all") conds.push(sql`i.status = ${status}`);
    if (tenantId) conds.push(sql`i.tenant_id = ${tenantId}`);
    if (bookingId) conds.push(sql`i.booking_id = ${bookingId}`);
    if (from) conds.push(sql`i.invoice_date >= ${from}`);
    if (to) conds.push(sql`i.invoice_date <= ${to}`);
    if (search) conds.push(sql`(i.invoice_number ILIKE ${"%" + search + "%"} OR t.business_name ILIKE ${"%" + search + "%"} OR t.owner_name ILIKE ${"%" + search + "%"})`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    const { rows } = (await db.execute(sql`
      SELECT i.*, t.business_name, t.owner_name, t.phone AS tenant_phone, t.email AS tenant_email,
             b.order_number, b.requested_area,
             COALESCE(u2.unit_code, u1.unit_code, i.unit_code) AS eff_unit_code,
             COALESCE(u2.name, u1.name) AS unit_name,
             COALESCE(u2.area_name, u1.area_name, b.requested_area) AS unit_area
      FROM tenant_invoices i
      JOIN tenants t ON t.id = i.tenant_id
      LEFT JOIN tenant_bookings b ON b.id = i.booking_id
      LEFT JOIN tenant_units u1 ON u1.id = b.unit_id
      LEFT JOIN tenant_units u2 ON u2.id = i.unit_id
      ${where} ORDER BY i.created_at DESC`)) as unknown as { rows: any[] };
    res.json({ data: rows, total: rows.length });
  } catch (err) {
    logger.error({ err }, "list invoices failed");
    res.status(500).json({ error: "Gagal memuat invoice" });
  }
});

router.get("/invoices/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND i.company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`
      SELECT i.*, t.business_name
      FROM tenant_invoices i
      LEFT JOIN tenants t ON t.id = i.tenant_id
      WHERE i.id = ${id} ${cf} LIMIT 1`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    const { rows: payments } = (await db.execute(
      sql`SELECT * FROM tenant_payments WHERE invoice_id = ${id} ORDER BY created_at DESC`,
    )) as unknown as { rows: any[] };
    res.json({ ...rows[0], payment_history: payments });
  } catch (err) {
    logger.error({ err }, "get invoice failed");
    res.status(500).json({ error: "Gagal memuat invoice" });
  }
});

router.put("/invoices/:id/status", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const { status } = req.body ?? {};
  const allowed = ["draft", "sent", "partial", "paid", "overdue", "cancelled"];
  if (!allowed.includes(status)) return res.status(400).json({ error: "Status tidak valid" });
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const paidAt = status === "paid" ? sql`, paid_at = COALESCE(paid_at, NOW())` : sql``;
    const cancelledAt = status === "cancelled" ? sql`, cancelled_at = COALESCE(cancelled_at, NOW())` : sql``;
    const sentAt = status === "sent" ? sql`, sent_at = COALESCE(sent_at, NOW())` : sql``;
    const { rows } = (await db.execute(sql`
      UPDATE tenant_invoices SET status = ${status}, updated_at = NOW() ${paidAt} ${cancelledAt} ${sentAt}
      WHERE id = ${id} ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return res.status(404).json({ error: "Invoice tidak ditemukan" });
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "update invoice status failed");
    res.status(500).json({ error: "Gagal memperbarui status invoice" });
  }
});

router.post("/invoices/generate-from-booking/:bookingId", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const bookingId = Number(req.params.bookingId);
  const b = req.body ?? {};
  try {
    const { rows: bRows } = (await db.execute(sql`
      SELECT bk.*, t.business_name, t.owner_name, u.unit_code AS u_code, u.name AS u_name
      FROM tenant_bookings bk
      JOIN tenants t ON t.id = bk.tenant_id
      LEFT JOIN tenant_units u ON u.id = bk.unit_id
      WHERE bk.id = ${bookingId} LIMIT 1`)) as unknown as { rows: any[] };
    if (!bRows[0]) return void res.status(404).json({ error: "Booking tidak ditemukan" });
    const booking = bRows[0];
    const periodStart = b.periodStart ?? booking.start_date ?? null;
    const periodEnd = b.periodEnd ?? booking.end_date ?? null;
    const { rows: existing } = (await db.execute(sql`
      SELECT id, invoice_number FROM tenant_invoices
      WHERE booking_id = ${bookingId} AND status != 'cancelled' LIMIT 1`)) as unknown as { rows: any[] };
    if (existing[0]) {
      return void res.status(409).json({
        error: "Invoice untuk booking ini sudah ada",
        invoice_id: existing[0].id,
        invoice_number: existing[0].invoice_number,
      });
    }
    const invoiceDate = new Date();
    const invoiceNumber = await nextInvoiceNumber(invoiceDate);
    const subtotal = Number(booking.total_price ?? booking.price ?? 0);
    const { rows } = (await db.execute(sql`
      INSERT INTO tenant_invoices (
        company_id, tenant_id, booking_id, unit_id,
        invoice_number, invoice_date, period_start, period_end, due_date,
        rent_amount, subtotal, tax_amount, discount_amount, penalty_amount,
        total_amount, paid_amount, outstanding_amount,
        status, notes, created_by
      ) VALUES (
        ${booking.company_id ?? 1}, ${booking.tenant_id}, ${bookingId},
        ${booking.unit_id ?? null}, ${invoiceNumber},
        ${invoiceDate.toISOString().slice(0, 10)},
        ${periodStart ?? null}, ${periodEnd ?? null}, ${b.dueDate ?? null},
        ${subtotal}, ${subtotal}, 0, 0, 0,
        ${subtotal}, 0, ${subtotal},
        'unpaid', ${b.notes ?? null}, ${(req as any).user?.id ?? null}
      ) RETURNING *`)) as unknown as { rows: any[] };
    await writeAuditLog("CREATE", "tenant_invoice", rows[0]?.id ?? null, {
      invoice_number: invoiceNumber, booking_id: bookingId, tenant_id: booking.tenant_id,
    }, req);
    res.status(201).json({ ...rows[0], isNew: true });
  } catch (err: any) {
    logger.error({ err }, "generate invoice from booking failed");
    res.status(500).json({ error: "Gagal membuat invoice dari booking" });
  }
});

router.post("/invoices", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const b = req.body ?? {};
  if (!b.tenant_id) return void res.status(400).json({ error: "Penyewa wajib diisi" });
  const companyId = companyOf(req) ?? 1;
  try {
    const invoiceDate = new Date();
    const invoiceNumber = await nextInvoiceNumber(invoiceDate);
    const subtotal = Number(b.subtotal ?? b.amount ?? 0);
    const tax = Number(b.tax_amount ?? 0);
    const disc = Number(b.discount_amount ?? 0);
    const pen = Number(b.penalty_amount ?? 0);
    const total = subtotal + tax - disc + pen;
    const { rows } = (await db.execute(sql`
      INSERT INTO tenant_invoices (
        company_id, tenant_id, booking_id, unit_id,
        invoice_number, invoice_date, period_start, period_end, due_date,
        rent_amount, subtotal, tax_amount, discount_amount, penalty_amount,
        total_amount, paid_amount, outstanding_amount,
        status, notes, created_by
      ) VALUES (
        ${companyId}, ${Number(b.tenant_id)},
        ${b.booking_id ? Number(b.booking_id) : null},
        ${b.unit_id ? Number(b.unit_id) : null},
        ${invoiceNumber}, ${b.invoice_date ?? invoiceDate.toISOString().slice(0, 10)},
        ${b.period_start ?? null}, ${b.period_end ?? null}, ${b.due_date ?? null},
        ${subtotal}, ${subtotal}, ${tax}, ${disc}, ${pen},
        ${total}, 0, ${total},
        ${b.status ?? "draft"}, ${b.notes ?? null}, ${(req as any).user?.id ?? null}
      ) RETURNING *`)) as unknown as { rows: any[] };
    await writeAuditLog("CREATE", "tenant_invoice", rows[0]?.id ?? null, { invoice_number: rows[0]?.invoice_number }, req);
    res.json(rows[0]);
  } catch (err: any) {
    logger.error({ err }, "create invoice failed");
    res.status(500).json({ error: "Gagal membuat invoice" });
  }
});

router.put("/invoices/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const b = req.body ?? {};
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows: cur } = (await db.execute(
      sql`SELECT status, subtotal, tax_amount, discount_amount, penalty_amount, paid_amount
          FROM tenant_invoices WHERE id = ${id} ${cf} LIMIT 1`,
    )) as unknown as { rows: any[] };
    if (!cur[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    if (cur[0].status === "paid") return void res.status(409).json({ error: "Invoice lunas tidak bisa diubah" });
    if (cur[0].status === "cancelled") return void res.status(409).json({ error: "Invoice yang dibatalkan tidak bisa diubah" });
    const subtotal = b.subtotal != null ? Number(b.subtotal) : Number(cur[0].subtotal);
    const tax = b.tax_amount != null ? Number(b.tax_amount) : Number(cur[0].tax_amount);
    const disc = b.discount_amount != null ? Number(b.discount_amount) : Number(cur[0].discount_amount);
    const pen = b.penalty_amount != null ? Number(b.penalty_amount) : Number(cur[0].penalty_amount);
    const total = subtotal + tax - disc + pen;
    const outstanding = Math.max(0, total - Number(cur[0].paid_amount ?? 0));
    const updates: ReturnType<typeof sql>[] = [
      sql`subtotal = ${subtotal}`, sql`rent_amount = ${subtotal}`,
      sql`tax_amount = ${tax}`, sql`discount_amount = ${disc}`, sql`penalty_amount = ${pen}`,
      sql`total_amount = ${total}`, sql`outstanding_amount = ${outstanding}`,
      sql`updated_at = NOW()`,
    ];
    if (b.status !== undefined) updates.push(sql`status = ${b.status}`);
    if (b.notes !== undefined) updates.push(sql`notes = ${b.notes ?? null}`);
    if (b.due_date !== undefined) updates.push(sql`due_date = ${b.due_date ?? null}`);
    if (b.period_start !== undefined) updates.push(sql`period_start = ${b.period_start ?? null}`);
    if (b.period_end !== undefined) updates.push(sql`period_end = ${b.period_end ?? null}`);
    if (b.invoice_date !== undefined) updates.push(sql`invoice_date = ${b.invoice_date ?? sql`invoice_date`}`);
    const { rows } = (await db.execute(
      sql`UPDATE tenant_invoices SET ${sql.join(updates, sql`, `)} WHERE id = ${id} ${cf} RETURNING *`,
    )) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    await writeAuditLog("UPDATE", "tenant_invoice", id, { changes: b }, req);
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "update invoice failed");
    res.status(500).json({ error: "Gagal memperbarui invoice" });
  }
});

router.delete("/invoices/:id", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows: cur } = (await db.execute(
      sql`SELECT status FROM tenant_invoices WHERE id = ${id} ${cf} LIMIT 1`,
    )) as unknown as { rows: any[] };
    if (!cur[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    if (cur[0].status === "paid") return void res.status(409).json({ error: "Invoice lunas tidak bisa dibatalkan" });
    const { rows } = (await db.execute(sql`
      UPDATE tenant_invoices SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
      WHERE id = ${id} ${cf} RETURNING id`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    await writeAuditLog("CANCEL", "tenant_invoice", id, {}, req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "cancel invoice failed");
    res.status(500).json({ error: "Gagal membatalkan invoice" });
  }
});

router.post("/invoices/:id/cancel", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  const reason = String((req.body as any)?.reason ?? "").trim() || "Dibatalkan admin";
  try {
    const { rows: cur } = (await db.execute(
      sql`SELECT status FROM tenant_invoices WHERE id = ${id} ${cf} LIMIT 1`,
    )) as unknown as { rows: any[] };
    if (!cur[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    if (cur[0].status === "paid") return void res.status(409).json({ error: "Invoice lunas tidak bisa dibatalkan" });
    const { rows } = (await db.execute(sql`
      UPDATE tenant_invoices
      SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW(),
          notes = CASE WHEN notes IS NULL THEN ${reason} ELSE notes || ' | ' || ${reason} END
      WHERE id = ${id} ${cf} RETURNING id`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    await writeAuditLog("CANCEL", "tenant_invoice", id, { reason }, req);
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "cancel invoice (post) failed");
    res.status(500).json({ error: "Gagal membatalkan invoice" });
  }
});

router.post("/invoices/:id/send", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows } = (await db.execute(sql`
      UPDATE tenant_invoices
      SET status = CASE WHEN status = 'draft' THEN 'unpaid' ELSE status END,
          sent_at = COALESCE(sent_at, NOW()), updated_at = NOW()
      WHERE id = ${id} AND status NOT IN ('cancelled', 'paid') ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan atau tidak bisa dikirim" });
    await writeAuditLog("SENT", "tenant_invoice", id, {}, req);
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "send invoice failed");
    res.status(500).json({ error: "Gagal mengirim invoice" });
  }
});

router.post("/invoices/:id/mark-paid", async (req, res) => {
  if (!(await requireAdmin(req, res))) return;
  const id = Number(req.params.id);
  const companyId = companyOf(req);
  const cf = companyId ? sql`AND company_id = ${companyId}` : sql``;
  try {
    const { rows: cur } = (await db.execute(
      sql`SELECT total_amount FROM tenant_invoices WHERE id = ${id} ${cf} LIMIT 1`,
    )) as unknown as { rows: any[] };
    if (!cur[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    const total = Number(cur[0].total_amount);
    const { rows } = (await db.execute(sql`
      UPDATE tenant_invoices
      SET status = 'paid', paid_amount = ${total}, outstanding_amount = 0,
          paid_at = COALESCE(paid_at, NOW()), updated_at = NOW()
      WHERE id = ${id} AND status NOT IN ('cancelled') ${cf} RETURNING *`)) as unknown as { rows: any[] };
    if (!rows[0]) return void res.status(404).json({ error: "Invoice tidak ditemukan" });
    await writeAuditLog("PAID", "tenant_invoice", id, { total_amount: total }, req);
    res.json(rows[0]);
  } catch (err) {
    logger.error({ err }, "mark invoice paid failed");
    res.status(500).json({ error: "Gagal menandai invoice lunas" });
  }
});

export default router;
