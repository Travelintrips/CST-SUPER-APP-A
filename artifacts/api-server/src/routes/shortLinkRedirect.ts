import { Router, type Request, type Response } from "express";
import { resolveShortLink, lookupShortLinkRow, generateShortLink } from "../lib/shortLink.js";
import { sendAdminLinkRefreshedNotification } from "../lib/orderNotification.js";
import { logger } from "../lib/logger.js";

export const shortLinkRedirectRouter: Router = Router();

shortLinkRedirectRouter.get("/q/:code", async (req: Request, res: Response) => {
  const code = String(req.params.code ?? "").trim();
  if (!code || !/^[A-Z0-9]{4,32}$/i.test(code)) {
    return res.status(400).json({ error: "Invalid short link" });
  }

  // Happy path: link valid dan belum expired
  const target = await resolveShortLink(code);
  if (target) {
    return res.redirect(302, target);
  }

  // Cek apakah kode ada di DB (expired vs tidak ada sama sekali)
  const row = await lookupShortLinkRow(code);
  if (!row) {
    return res.status(404).json({ error: "Link tidak ditemukan." });
  }

  const isExpired = row.expiresAt != null && row.expiresAt.getTime() < Date.now();

  // Auto-refresh untuk admin_action links yang expired
  if (isExpired && row.context === "admin_action" && row.refId) {
    try {
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000); // 72 jam dari sekarang
      const newShortUrl = await generateShortLink(row.targetUrl, {
        context: "admin_action",
        refType: row.refType ?? undefined,
        refId: row.refId,
        expiresAt,
      });

      // Kirim notifikasi WA ke admin (fire and forget)
      sendAdminLinkRefreshedNotification(row.refId, newShortUrl).catch((err: unknown) =>
        logger.warn({ err, code }, "shortLink: expired refresh WA notification failed")
      );

      logger.info(
        { oldCode: code, refId: row.refId, newShortUrl },
        "shortLink: expired admin_action link auto-refreshed"
      );

      // Redirect langsung ke target URL (tanpa extra hop ke short link baru)
      return res.redirect(302, row.targetUrl);
    } catch (err) {
      logger.warn({ err, code }, "shortLink: auto-refresh failed, returning expired error");
    }
  }

  return res.status(410).json({ error: "Link sudah kadaluarsa.", isExpired: true });
});
