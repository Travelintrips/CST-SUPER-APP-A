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
    SELECT hidden_items, item_order FROM user_nav_preferences WHERE user_id = ${userId}
  `);
  const row = result.rows[0] as { hidden_items?: string[]; item_order?: string[] } | undefined;
  res.json({
    hiddenItems: row?.hidden_items ?? [],
    itemOrder: row?.item_order ?? [],
  });
});

router.put("/", async (req: Request, res: Response) => {
  const userId = (req.user as { id: string }).id;
  const body = req.body as { hiddenItems?: unknown; itemOrder?: unknown };

  if (body.hiddenItems !== undefined && !Array.isArray(body.hiddenItems)) {
    res.status(400).json({ error: "hiddenItems must be an array" });
    return;
  }
  if (body.itemOrder !== undefined && !Array.isArray(body.itemOrder)) {
    res.status(400).json({ error: "itemOrder must be an array" });
    return;
  }

  const hiddenItems = (body.hiddenItems ?? []) as string[];
  const itemOrder = (body.itemOrder ?? []) as string[];

  await db.execute(sql`
    INSERT INTO user_nav_preferences (user_id, hidden_items, item_order, updated_at)
    VALUES (${userId}, ${hiddenItems}, ${itemOrder}, NOW())
    ON CONFLICT (user_id) DO UPDATE
      SET hidden_items = ${hiddenItems},
          item_order   = ${itemOrder},
          updated_at   = NOW()
  `);
  res.json({ ok: true });
});

export default router;
