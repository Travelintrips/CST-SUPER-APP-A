import { Router, type Request, type Response } from "express";
import { resolveShortLink } from "../lib/shortLink.js";

export const shortLinkRedirectRouter: Router = Router();

shortLinkRedirectRouter.get("/q/:code", async (req: Request, res: Response) => {
  const code = String(req.params.code ?? "").trim();
  if (!code || !/^[A-Z0-9]{4,32}$/i.test(code)) {
    return res.status(400).json({ error: "Invalid short link" });
  }
  const target = await resolveShortLink(code);
  if (!target) {
    return res.status(404).json({ error: "Link tidak ditemukan atau sudah kedaluwarsa." });
  }
  return res.redirect(302, target);
});
