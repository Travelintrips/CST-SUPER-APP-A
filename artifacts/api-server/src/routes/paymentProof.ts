import { Router, type Request, type Response } from "express";
import multer from "multer";
import { randomBytes } from "crypto";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendViaService as sendWhatsApp } from "../lib/waTransport.js";
import { getAdminWa } from "../lib/adminWa.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

const router = Router();

// ─── Boot migration ───────────────────────────────────────────────────────────
let migrationDone = false;
async function ensureColumns() {
  if (migrationDone) return;
  try {
    await db.execute(sql`
      ALTER TABLE sales_documents
        ADD COLUMN IF NOT EXISTS proof_upload_token TEXT UNIQUE,
        ADD COLUMN IF NOT EXISTS proof_url TEXT,
        ADD COLUMN IF NOT EXISTS proof_remarks TEXT,
        ADD COLUMN IF NOT EXISTS proof_uploaded_at TIMESTAMPTZ
    `);
    migrationDone = true;
  } catch (err) {
    logger.error({ err }, "paymentProof ensureColumns error");
  }
}
ensureColumns().catch(() => {});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "application/pdf",
]);

function getPublicBase() {
  return (process.env.PUBLIC_URL ?? "https://cstlogistic.co.id").replace(/\/$/, "");
}

// ─── GET /api/payment-proof/:token ────────────────────────────────────────────
router.get("/:token", async (req: Request, res: Response) => {
  await ensureColumns();
  const { token } = req.params;
  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    return res.status(400).json({ error: "Token tidak valid." });
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, doc_number, invoice_number, customer_name, grand_total,
             payment_status, proof_url, proof_remarks, proof_uploaded_at, due_date
      FROM sales_documents
      WHERE proof_upload_token = ${token}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    if (!row) return res.status(404).json({ error: "Link tidak ditemukan atau sudah kedaluwarsa." });

    return res.json({
      ok: true,
      invoice: {
        docNumber: row["doc_number"],
        invoiceNumber: row["invoice_number"],
        customerName: row["customer_name"],
        grandTotal: Number(row["grand_total"]),
        paymentStatus: row["payment_status"],
        proofUrl: row["proof_url"],
        proofRemarks: row["proof_remarks"],
        proofUploadedAt: row["proof_uploaded_at"],
        dueDate: row["due_date"],
      },
    });
  } catch (e) {
    logger.error({ e }, "paymentProof GET error");
    return res.status(500).json({ error: "Terjadi kesalahan." });
  }
});

// ─── POST /api/payment-proof/:token/upload ────────────────────────────────────
router.post("/:token/upload", upload.single("file"), async (req: Request, res: Response) => {
  await ensureColumns();
  const { token } = req.params;
  if (!token || !/^[a-f0-9]{48}$/.test(token)) {
    return res.status(400).json({ error: "Token tidak valid." });
  }

  const file = req.file;
  if (!file) return res.status(400).json({ error: "File wajib dilampirkan." });
  if (!ALLOWED_MIME.has(file.mimetype)) {
    return res.status(400).json({ error: "Format tidak didukung. Gunakan PDF, JPG, atau PNG." });
  }

  const bodyRaw = req.body as Record<string, unknown>;
  const remarks =
    typeof bodyRaw["remarks"] === "string"
      ? String(bodyRaw["remarks"]).slice(0, 500)
      : null;

  try {
    const rows = await db.execute(sql`
      SELECT id, doc_number, invoice_number, customer_name, grand_total,
             customer_id, logistic_order_id
      FROM sales_documents
      WHERE proof_upload_token = ${token}
      LIMIT 1
    `);
    const row = (rows as unknown as Record<string, unknown>[])[0];
    if (!row) return res.status(404).json({ error: "Link tidak ditemukan." });

    // Upload file
    const ext = file.mimetype === "application/pdf" ? "pdf" : file.mimetype.split("/")[1] ?? "bin";
    const storagePath = `payment-proofs/${String(row["id"])}-${randomBytes(8).toString("hex")}.${ext}`;
    const objStore = new ObjectStorageService();
    const proofRelUrl = await objStore.uploadPublicRaw(storagePath, file.buffer, file.mimetype);
    const proofFullUrl = `${getPublicBase()}${proofRelUrl}`;

    // Update record
    await db.execute(sql`
      UPDATE sales_documents
      SET proof_url = ${proofRelUrl},
          proof_remarks = ${remarks},
          proof_uploaded_at = NOW()
      WHERE id = ${Number(row["id"])}
    `);

    // Audit log
    db.execute(sql`
      INSERT INTO erp_audit_logs (event_type, ref_type, ref_id, actor_type, metadata, created_at)
      VALUES (
        'payment_proof_uploaded',
        'sales_order',
        ${String(row["doc_number"])},
        'customer',
        ${JSON.stringify({
          invoiceNumber: row["invoice_number"],
          proofUrl: proofRelUrl,
          remarks,
          customerId: row["customer_id"],
        })}::jsonb,
        NOW()
      )
    `).catch((e: unknown) => logger.error({ e }, "paymentProof audit log failed"));

    // WA notif admin
    const fmtIdr = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;
    const adminMsg = [
      `📎 *Bukti Pembayaran Diterima*`,
      ``,
      `Customer: ${String(row["customer_name"] ?? "-")}`,
      `Invoice: ${String(row["invoice_number"] ?? row["doc_number"])}`,
      `Total: ${fmtIdr(Number(row["grand_total"]))}`,
      remarks ? `Catatan: ${remarks}` : null,
      ``,
      `Link bukti: ${proofFullUrl}`,
    ].filter((l) => l !== null).join("\n");

    getAdminWa()
      .then((adminWa) => {
        if (adminWa) {
          sendWhatsApp(adminWa, adminMsg, {
            context: "payment_proof_uploaded",
            refType: "sales_order",
            refId: String(row["doc_number"]),
          }).catch((e: unknown) => logger.error({ e }, "paymentProof admin WA failed"));
        }
      })
      .catch((e: unknown) => logger.error({ e }, "paymentProof getAdminWa failed"));

    // WA konfirmasi ke customer
    if (row["customer_id"]) {
      (async () => {
        try {
          const custRows = await db.execute(sql`
            SELECT phone FROM customers WHERE id = ${Number(row["customer_id"])} LIMIT 1
          `);
          const cust = (custRows as unknown as Record<string, unknown>[])[0];
          const customerPhone = cust?.["phone"] as string | null;
          if (customerPhone) {
            const customerMsg = [
              `✅ *Bukti pembayaran Anda berhasil diterima.*`,
              ``,
              `Invoice: ${String(row["invoice_number"] ?? row["doc_number"])}`,
              ``,
              `Terima kasih. Tim kami akan segera memverifikasi pembayaran Anda.`,
            ].join("\n");
            await sendWhatsApp(customerPhone, customerMsg, {
              context: "payment_proof_confirmed",
              refType: "invoice",
              refId: String(row["invoice_number"] ?? row["doc_number"]),
            });
          }
        } catch (e) {
          logger.error({ e }, "paymentProof customer WA confirm failed");
        }
      })().catch(() => {});
    }

    return res.json({ ok: true, proofUrl: proofRelUrl, message: "Bukti pembayaran berhasil diunggah." });
  } catch (e) {
    logger.error({ e }, "paymentProof POST upload error");
    return res.status(500).json({ error: "Gagal mengunggah file. Silakan coba lagi." });
  }
});

export { router as paymentProofRouter };
