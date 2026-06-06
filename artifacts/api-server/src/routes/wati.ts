/**
 * WATI Admin API Routes
 * GET  /api/wati/status        — cek status koneksi + provider aktif
 * GET  /api/wati/templates     — list template dari WATI
 * POST /api/wati/test-send     — kirim pesan test ke nomor tertentu
 * POST /api/wati/send-template — kirim template ke nomor tertentu (admin use)
 */

import { Router, type Request } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { testWatiConnection, listWatiTemplates, sendWatiTemplate, sendWatiSession, isWatiConfigured, getWatiAccountInfo } from "../lib/wati.js";
import { logger } from "../lib/logger.js";

export const watiRouter = Router();
watiRouter.use(async (req, res, next) => {
  const ok = await requireAdmin(req, res);
  if (ok) next();
});

// ─── Status ────────────────────────────────────────────────────────────────────
watiRouter.get("/status", async (_req, res) => {
  const watiConfigured = await isWatiConfigured();
  const fonnteConfigured = !!(process.env.FONNTE_TOKEN);

  if (!watiConfigured) {
    return res.json({
      provider: "fonnte",
      wati: { configured: false },
      fonnte: { configured: fonnteConfigured },
    });
  }

  const [test, account] = await Promise.all([testWatiConnection(), getWatiAccountInfo()]);
  return res.json({
    provider: "wati",
    wati: {
      configured: true,
      connected: test.ok,
      error: test.error ?? null,
      baseUrl: process.env.WATI_BASE_URL?.replace(/^(https?:\/\/[^/]+).*/, "$1") ?? null,
      phone: account.phone ?? null,
      accountName: account.name ?? null,
      phoneSource: account.source ?? null,
    },
    fonnte: { configured: fonnteConfigured, note: "digunakan sebagai fallback untuk grup WA admin" },
  });
});

// ─── List templates ────────────────────────────────────────────────────────────
watiRouter.get("/templates", async (_req, res) => {
  if (!(await isWatiConfigured())) {
    return res.status(400).json({ message: "WATI belum dikonfigurasi." });
  }
  const templates = await listWatiTemplates();
  return res.json({ templates });
});

// ─── Test send (session message) ───────────────────────────────────────────────
watiRouter.post("/test-send", async (req: Request, res) => {
  const { phone, message } = req.body ?? {};
  if (!phone?.trim()) return res.status(400).json({ message: "phone wajib diisi." });
  if (!message?.trim()) return res.status(400).json({ message: "message wajib diisi." });

  if (!(await isWatiConfigured())) {
    return res.status(400).json({ message: "WATI belum dikonfigurasi." });
  }

  try {
    const result = await sendWatiSession(String(phone).trim(), String(message).trim(), {
      context: "wati_test",
      refId: String(Date.now()),
    });
    if (!result.ok) {
      return res.status(400).json({
        message: result.error ?? "WATI menolak pengiriman",
        watiResponse: result.watiResponse,
        hint: "Session message hanya berfungsi jika nomor tujuan pernah menghubungi WATI Business number dalam 24 jam terakhir. Gunakan Template Message untuk kirim kapan saja.",
      });
    }
    return res.json({ ok: true, message: "Pesan berhasil dikirim via WATI.", watiResponse: result.watiResponse });
  } catch (err: any) {
    logger.error({ err }, "[wati] test-send error");
    return res.status(500).json({ message: err?.message ?? "Gagal kirim." });
  }
});

// ─── Send template ────────────────────────────────────────────────────────────
watiRouter.post("/send-template", async (req: Request, res) => {
  const { phone, templateName, params, broadcastName } = req.body ?? {};
  if (!phone?.trim()) return res.status(400).json({ message: "phone wajib diisi." });
  if (!templateName?.trim()) return res.status(400).json({ message: "templateName wajib diisi." });
  if (!(await isWatiConfigured())) {
    return res.status(400).json({ message: "WATI belum dikonfigurasi." });
  }

  const paramList = Array.isArray(params)
    ? (params as any[]).filter((p) => p?.name && p?.value)
    : [];

  try {
    await sendWatiTemplate(
      String(phone).trim(),
      String(templateName).trim(),
      paramList,
      { broadcastName: broadcastName?.trim() || undefined, context: "wati_admin_send", refId: String(Date.now()) },
    );
    return res.json({ ok: true, message: "Template berhasil dikirim via WATI." });
  } catch (err: any) {
    logger.error({ err }, "[wati] send-template error");
    return res.status(500).json({ message: err?.message ?? "Gagal kirim." });
  }
});
