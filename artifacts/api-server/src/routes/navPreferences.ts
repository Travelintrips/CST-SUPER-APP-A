import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireClerkUser } from "../lib/requireAdmin.js";

const router = Router();

router.use(async (req: Request, res: Response, next) => {
  const ok = await requireClerkUser(req, res);
  if (ok) next();
});

router.get("/", async (req: Request, res: Response) => {
  const userId = (req.user as { id: string }).id;
  const result = await db.execute(sql`
    SELECT hidden_items FROM user_nav_preferences WHERE user_id = ${userId}
  `);
  const row = result.rows[0] as { hidden_items?: string[] } | undefined;
  res.json({ hiddenItems: row?.hidden_items ?? [] });
});

router.put("/", async (req: Request, res: Response) => {
  const userId = (req.user as { id: string }).id;
  const { hiddenItems } = req.body as { hiddenItems?: unknown };
  if (!Array.isArray(hiddenItems)) {
    res.status(400).json({ error: "hiddenItems must be an array" });
    return;
  }
  await db.execute(sql`
    INSERT INTO user_nav_preferences (user_id, hidden_items, updated_at)
    VALUES (${userId}, ${hiddenItems as string[]}, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET hidden_items = ${hiddenItems as string[]},
          updated_at   = NOW()
  `);
  res.json({ ok: true });
});

export default router;
