import { Router, type Request, type Response } from "express";
import { requireAdmin } from "../lib/requireAdmin.js";
import { getAdminWa, setAdminWa } from "../lib/adminWa.js";

const router = Router();

// GET /api/settings/notifications — get notification settings (admin)
router.get("/notifications", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const adminWa = await getAdminWa();
  return res.json({ adminWa });
});

// PUT /api/settings/notifications — update notification settings (admin)
router.put("/notifications", async (req: Request, res: Response) => {
  if (!(await requireAdmin(req, res))) return;
  const { adminWa } = req.body ?? {};
  if (typeof adminWa !== "string") {
    return res.status(400).json({ message: "adminWa harus berupa string" });
  }
  await setAdminWa(adminWa);
  return res.json({ ok: true, adminWa: adminWa.trim() });
});

export default router;
