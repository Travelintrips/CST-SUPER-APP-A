import { Router, type Request, type Response } from "express";
import { randomBytes } from "crypto";
import { eq, sql } from "drizzle-orm";
import { db, purchaseMiniFormsTable } from "@workspace/db";
import { requireClerkUser } from "../lib/requireAdmin.js";
import { logger } from "../lib/logger.js";

export const purchaseMiniPublicRouter = Router();
export const purchaseMiniAdminRouter = Router();

// ─── Boot migration ───────────────────────────────────────────────────────────
let migrationDone = false;
async function ensureTable() {
  if (migrationDone) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS purchase_mini_forms (
        id SERIAL PRIMARY KEY,
        token TEXT NOT NULL UNIQUE,
        form_type TEXT NOT NULL,
        ref_number TEXT,
        title TEXT,
        notes TEXT,
        target_name TEXT,
        currency TEXT NOT NULL DEFAULT 'IDR',
        payload JSONB NOT NULL DEFAULT '{}',
        status TEXT NOT NULL DEFAULT 'pending',
        submission_data JSONB DEFAULT '{}',
        submitted_at TIMESTAMPTZ,
        order_id INTEGER,
        purchase_doc_id INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by TEXT,
        expires_at TIMESTAMPTZ
      )
    `);
    migrationDone = true;
  } catch (err) {
    logger.error({ err }, "purchaseMiniForm ensureTable error");
  }
}

// ─── Admin: POST /api/purchase-mini/create ───────────────────────────────────
// Buat link form baru (purchase_request | vendor_invoice | goods_receipt)
purchaseMiniAdminRouter.post("/create", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTable();

  const {
    formType,
    refNumber,
    title,
    notes,
    targetName,
    currency = "IDR",
    payload = {},
    orderId,
    purchaseDocId,
    expiresInDays = 30,
  } = req.body as {
    formType: string;
    refNumber?: string;
    title?: string;
    notes?: string;
    targetName?: string;
    currency?: string;
    payload?: Record<string, unknown>;
    orderId?: number;
    purchaseDocId?: number;
    expiresInDays?: number;
  };

  const validTypes = ["purchase_request", "vendor_invoice", "goods_receipt"];
  if (!formType || !validTypes.includes(formType)) {
    return res.status(400).json({ error: `formType harus salah satu dari: ${validTypes.join(", ")}` });
  }

  try {
    const token = randomBytes(24).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000);

    const [inserted] = await db
      .insert(purchaseMiniFormsTable)
      .values({
        token,
        formType,
        refNumber: refNumber ?? null,
        title: title ?? null,
        notes: notes ?? null,
        targetName: targetName ?? null,
        currency,
        payload,
        status: "pending",
        orderId: orderId ?? null,
        purchaseDocId: purchaseDocId ?? null,
        expiresAt,
        createdBy: (req as any).user?.email ?? null,
      })
      .returning();

    const pathMap: Record<string, string> = {
      purchase_request: "purchase-request",
      vendor_invoice: "vendor-invoice",
      goods_receipt: "goods-receipt",
    };
    const formUrl = `/${pathMap[formType]}/${token}`;

    return res.json({ ok: true, token, formUrl, link: inserted });
  } catch (err) {
    logger.error({ err }, "purchaseMiniForm create error");
    return res.status(500).json({ error: "Gagal membuat link form" });
  }
});

// ─── Admin: GET /api/purchase-mini/list ──────────────────────────────────────
purchaseMiniAdminRouter.get("/list", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTable();
  try {
    const { formType, status } = req.query as { formType?: string; status?: string };
    let query = db.select().from(purchaseMiniFormsTable).$dynamic();
    if (formType) query = query.where(eq(purchaseMiniFormsTable.formType, formType));
    if (status)   query = query.where(eq(purchaseMiniFormsTable.status, status));
    const rows = await query.orderBy(sql`${purchaseMiniFormsTable.createdAt} DESC`).limit(200);
    return res.json(rows);
  } catch (err) {
    logger.error({ err }, "purchaseMiniForm list error");
    return res.status(500).json({ error: "Gagal memuat data" });
  }
});

// ─── Admin: GET /api/purchase-mini/submissions/:id ───────────────────────────
purchaseMiniAdminRouter.get("/submissions/:id", async (req: Request, res: Response) => {
  if (!(await requireClerkUser(req, res))) return;
  await ensureTable();
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID tidak valid" });
    const [row] = await db
      .select()
      .from(purchaseMiniFormsTable)
      .where(eq(purchaseMiniFormsTable.id, id))
      .limit(1);
    if (!row) return res.status(404).json({ error: "Form tidak ditemukan" });
    return res.json(row);
  } catch (err) {
    logger.error({ err }, "purchaseMiniForm get submission error");
    return res.status(500).json({ error: "Gagal memuat data" });
  }
});

// ─── Public: GET /api/purchase-mini/:token ───────────────────────────────────
purchaseMiniPublicRouter.get("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTable();

  try {
    const [row] = await db
      .select()
      .from(purchaseMiniFormsTable)
      .where(eq(purchaseMiniFormsTable.token, token))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Link tidak ditemukan atau sudah tidak berlaku" });
    if (row.expiresAt && row.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link ini sudah kedaluwarsa" });
    }

    return res.json({
      token: row.token,
      formType: row.formType,
      refNumber: row.refNumber,
      title: row.title,
      notes: row.notes,
      targetName: row.targetName,
      status: row.status,
      currency: row.currency,
      payload: row.payload ?? {},
    });
  } catch (err) {
    logger.error({ err }, "purchaseMiniForm GET error");
    return res.status(500).json({ error: "Gagal memuat data" });
  }
});

// ─── Public: POST /api/purchase-mini/:token ──────────────────────────────────
purchaseMiniPublicRouter.post("/:token", async (req: Request, res: Response) => {
  const { token } = req.params as { token: string };
  await ensureTable();

  try {
    const [row] = await db
      .select()
      .from(purchaseMiniFormsTable)
      .where(eq(purchaseMiniFormsTable.token, token))
      .limit(1);

    if (!row) return res.status(404).json({ error: "Link tidak ditemukan" });
    if (row.expiresAt && row.expiresAt < new Date()) {
      return res.status(410).json({ error: "Link ini sudah kedaluwarsa" });
    }
    if (row.status === "submitted") {
      return res.status(409).json({ error: "Form ini sudah pernah disubmit", alreadySubmitted: true });
    }

    const body = req.body as Record<string, unknown>;

    // Validasi per formType
    if (row.formType === "purchase_request") {
      if (!body.requesterName || typeof body.requesterName !== "string" || !body.requesterName.trim()) {
        return res.status(400).json({ error: "Nama pengaju wajib diisi" });
      }
      const items = body.items as unknown[];
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "Minimal 1 item wajib diisi" });
      }
    }

    if (row.formType === "vendor_invoice") {
      if (!body.vendorInvoiceRef || typeof body.vendorInvoiceRef !== "string" || !body.vendorInvoiceRef.trim()) {
        return res.status(400).json({ error: "Nomor invoice wajib diisi" });
      }
      if (!body.invoiceAmount || Number(body.invoiceAmount) <= 0) {
        return res.status(400).json({ error: "Jumlah invoice wajib diisi" });
      }
      if (!body.bankAccount || typeof body.bankAccount !== "string" || !body.bankAccount.trim()) {
        return res.status(400).json({ error: "Nomor rekening wajib diisi" });
      }
    }

    if (row.formType === "goods_receipt") {
      if (!body.receiverName || typeof body.receiverName !== "string" || !body.receiverName.trim()) {
        return res.status(400).json({ error: "Nama penerima wajib diisi" });
      }
    }

    await db
      .update(purchaseMiniFormsTable)
      .set({
        submissionData: body,
        status: "submitted",
        submittedAt: new Date(),
      })
      .where(eq(purchaseMiniFormsTable.token, token));

    return res.json({ success: true, formType: row.formType, refNumber: row.refNumber });
  } catch (err) {
    logger.error({ err }, "purchaseMiniForm POST error");
    return res.status(500).json({ error: "Gagal menyimpan data" });
  }
});
