import { Router } from "express";
import { randomBytes } from "crypto";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import { requireAdmin } from "../lib/requireAdmin.js";
import { logger } from "../lib/logger.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminGroupWa } from "../lib/adminWa.js";

export const escrowAdminRouter = Router();
export const escrowPublicRouter = Router();

// ── Boot migration ────────────────────────────────────────────────────────────
db.execute(sql.raw(`
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS escrow_enabled   BOOLEAN     NOT NULL DEFAULT FALSE;
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS dp_percentage    NUMERIC(5,2);
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS dp_amount        NUMERIC(14,2);
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS dp_status        TEXT        NOT NULL DEFAULT 'none';
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS dp_held_at       TIMESTAMPTZ;
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS dp_released_at   TIMESTAMPTZ;
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS customer_confirmed_at TIMESTAMPTZ;
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS escrow_token     TEXT        UNIQUE;
  ALTER TABLE sales_documents ADD COLUMN IF NOT EXISTS escrow_notes     TEXT;
`)).catch((e: unknown) => logger.warn({ e }, "[escrow] migration warn"));

// ── Admin auth middleware ─────────────────────────────────────────────────────
escrowAdminRouter.use(async (req, res, next) => {
  if (!(await requireAdmin(req, res))) return;
  next();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function idrFormat(n: number) {
  return `Rp ${Math.round(n).toLocaleString("id-ID")}`;
}

const DP_STATUS_LABEL: Record<string, string> = {
  none:                   "Belum Diaktifkan",
  dp_pending:             "Menunggu DP Customer",
  dp_held:                "DP Diterima Platform",
  confirmed_by_customer:  "Barang Dikonfirmasi Customer",
  dp_released:            "Dana Dirilis ke Vendor",
  completed:              "Selesai",
};

// ── GET /api/sales/escrow/:id ─────────────────────────────────────────────────
escrowAdminRouter.get("/:id", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const rows = await db.execute(sql.raw(`
    SELECT id, doc_number, customer_name, grand_total,
           escrow_enabled, dp_percentage, dp_amount, dp_status,
           dp_held_at, dp_released_at, customer_confirmed_at,
           escrow_token, escrow_notes
    FROM sales_documents WHERE id = ${id} LIMIT 1
  `));

  const row = rows.rows[0];
  if (!row) return res.status(404).json({ error: "Not found" });

  const r = row as Record<string, unknown>;
  return res.json({
    ...r,
    dp_status_label: DP_STATUS_LABEL[String(r.dp_status ?? "none")] ?? r.dp_status,
    confirm_url: r.escrow_token
      ? `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers.host}/escrow-confirm/${r.escrow_token}`
      : null,
  });
});

// ── POST /api/sales/escrow/:id/enable ────────────────────────────────────────
escrowAdminRouter.post("/:id/enable", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const { dpPercentage, notes } = req.body ?? {};
  const pct = Number(dpPercentage);
  if (!pct || pct <= 0 || pct > 100) {
    return res.status(400).json({ error: "dpPercentage harus antara 1–100" });
  }

  const docRows = await db.execute(sql.raw(`
    SELECT grand_total, escrow_token FROM sales_documents WHERE id = ${id} LIMIT 1
  `));
  const doc = docRows.rows[0] as Record<string, unknown> | undefined;
  if (!doc) return res.status(404).json({ error: "Not found" });

  const dpAmount = ((Number(doc.grand_total) * pct) / 100).toFixed(2);
  const existingToken = doc.escrow_token as string | null;
  const token = existingToken || randomBytes(32).toString("hex");
  const notesVal = notes ? `'${String(notes).replace(/'/g, "''")}'` : "NULL";

  await db.execute(sql.raw(`
    UPDATE sales_documents SET
      escrow_enabled = TRUE,
      dp_percentage  = ${pct},
      dp_amount      = ${dpAmount},
      dp_status      = 'dp_pending',
      escrow_token   = COALESCE(escrow_token, '${token}'),
      escrow_notes   = ${notesVal},
      updated_at     = NOW()
    WHERE id = ${id}
  `));

  return res.json({
    ok: true,
    dpAmount: Number(dpAmount),
    token,
    confirm_url: `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers.host}/escrow-confirm/${token}`,
  });
});

// ── POST /api/sales/escrow/:id/hold ──────────────────────────────────────────
escrowAdminRouter.post("/:id/hold", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const checkRows = await db.execute(sql.raw(`
    SELECT dp_status, escrow_enabled FROM sales_documents WHERE id = ${id} LIMIT 1
  `));
  const doc = checkRows.rows[0] as Record<string, unknown> | undefined;
  if (!doc) return res.status(404).json({ error: "Not found" });
  if (!doc.escrow_enabled) return res.status(409).json({ error: "Escrow belum diaktifkan" });

  await db.execute(sql.raw(`
    UPDATE sales_documents SET
      dp_status   = 'dp_held',
      dp_held_at  = NOW(),
      updated_at  = NOW()
    WHERE id = ${id}
  `));

  return res.json({ ok: true, dp_status: "dp_held" });
});

// ── POST /api/sales/escrow/:id/release ───────────────────────────────────────
escrowAdminRouter.post("/:id/release", async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id" });

  const checkRows = await db.execute(sql.raw(`
    SELECT dp_status, escrow_enabled, customer_name, doc_number, dp_amount
    FROM sales_documents WHERE id = ${id} LIMIT 1
  `));
  const doc = checkRows.rows[0] as Record<string, unknown> | undefined;
  if (!doc) return res.status(404).json({ error: "Not found" });
  if (!doc.escrow_enabled) return res.status(409).json({ error: "Escrow belum diaktifkan" });

  await db.execute(sql.raw(`
    UPDATE sales_documents SET
      dp_status        = 'dp_released',
      dp_released_at   = NOW(),
      updated_at       = NOW()
    WHERE id = ${id}
  `));

  // Notify admin WA (fire-and-forget)
  getAdminGroupWa().then((waTarget) => {
    if (!waTarget) return;
    sendWhatsApp(
      waTarget,
      `✅ *Dana DP Dirilis*\n\nDana DP untuk *${doc.doc_number}* (${doc.customer_name}) sebesar *${idrFormat(Number(doc.dp_amount))}* telah dirilis ke vendor.`
    ).catch(() => {});
  }).catch(() => {});

  return res.json({ ok: true, dp_status: "dp_released" });
});

// ── GET /api/sales/escrow/confirm/:token  (public) ───────────────────────────
escrowPublicRouter.get("/confirm/:token", async (req, res) => {
  const token = String(req.params.token ?? "").trim();
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return res.status(400).json({ error: "Token tidak valid" });
  }

  const rows = await db.execute(sql.raw(`
    SELECT id, doc_number, customer_name, grand_total,
           dp_percentage, dp_amount, dp_status,
           dp_held_at, customer_confirmed_at, escrow_notes
    FROM sales_documents
    WHERE escrow_token = '${token.replace(/'/g, "''")}' AND escrow_enabled = TRUE
    LIMIT 1
  `));

  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Link tidak valid atau sudah kedaluwarsa" });

  return res.json({
    ...row,
    dp_status_label: DP_STATUS_LABEL[String(row.dp_status ?? "none")] ?? row.dp_status,
  });
});

// ── POST /api/sales/escrow/confirm/:token  (public) ──────────────────────────
escrowPublicRouter.post("/confirm/:token", async (req, res) => {
  const token = String(req.params.token ?? "").trim();
  if (!token || !/^[0-9a-f]{64}$/i.test(token)) {
    return res.status(400).json({ error: "Token tidak valid" });
  }

  const rows = await db.execute(sql.raw(`
    SELECT id, doc_number, customer_name, dp_status, dp_amount, dp_held_at
    FROM sales_documents
    WHERE escrow_token = '${token.replace(/'/g, "''")}' AND escrow_enabled = TRUE
    LIMIT 1
  `));

  const row = rows.rows[0] as Record<string, unknown> | undefined;
  if (!row) return res.status(404).json({ error: "Link tidak valid" });

  const status = String(row.dp_status ?? "");

  if (status === "confirmed_by_customer" || status === "dp_released" || status === "completed") {
    return res.status(409).json({ error: "Konfirmasi sudah dilakukan sebelumnya" });
  }
  if (status !== "dp_held") {
    return res.status(409).json({
      error: "DP belum diterima platform. Konfirmasi hanya bisa dilakukan setelah DP masuk.",
    });
  }

  await db.execute(sql.raw(`
    UPDATE sales_documents SET
      customer_confirmed_at = NOW(),
      dp_status             = 'confirmed_by_customer',
      updated_at            = NOW()
    WHERE id = ${row.id}
  `));

  // Notify admin (fire-and-forget)
  getAdminGroupWa().then((waTarget) => {
    if (!waTarget) return;
    sendWhatsApp(
      waTarget,
      `🔔 *Konfirmasi Penerimaan Barang/Jasa*\n\nCustomer *${row.customer_name}* telah mengkonfirmasi penerimaan untuk:\n📄 ${row.doc_number}\n💰 DP Escrow: ${idrFormat(Number(row.dp_amount))}\n\n✅ Dana DP siap dirilis ke vendor.`
    ).catch(() => {});
  }).catch(() => {});

  return res.json({
    ok: true,
    message: "Konfirmasi berhasil. Admin akan segera merilis dana DP ke vendor.",
  });
});
