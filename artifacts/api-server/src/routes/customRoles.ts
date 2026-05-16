import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { requireAdmin } from "../lib/requireAdmin.js";

const router = Router();

router.use(async (req: Request, res: Response, next) => {
  const ok = await requireAdmin(req, res);
  if (ok) next();
});

router.get("/", async (_req: Request, res: Response) => {
  const roles = await db.execute(sql`
    SELECT cr.id, cr.name, cr.description, cr.color, cr.permissions, cr.created_at,
           COUNT(u.id)::int AS user_count
    FROM custom_roles cr
    LEFT JOIN users u ON u.custom_role_id = cr.id
    GROUP BY cr.id
    ORDER BY cr.created_at ASC
  `);
  res.json(roles.rows);
});

router.get("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const roleRes = await db.execute(sql`SELECT * FROM custom_roles WHERE id = ${Number(id)}`);
  const role = roleRes.rows[0];
  if (!role) return res.status(404).json({ message: "Role tidak ditemukan" });

  const usersRes = await db.execute(sql`
    SELECT id, email, name, role, division FROM users WHERE custom_role_id = ${Number(id)} ORDER BY name
  `);
  return res.json({ ...role, users: usersRes.rows });
});

router.post("/", async (req: Request, res: Response) => {
  const { name, description, color, permissions } = req.body as {
    name: string;
    description?: string;
    color?: string;
    permissions?: string[];
  };

  if (!name?.trim()) return res.status(400).json({ message: "Nama role wajib diisi" });

  const result = await db.execute(sql`
    INSERT INTO custom_roles (name, description, color, permissions)
    VALUES (${name.trim()}, ${description ?? null}, ${color ?? "#6366f1"}, ${JSON.stringify(permissions ?? [])}::jsonb)
    RETURNING *
  `);
  return res.status(201).json(result.rows[0]);
});

router.put("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, description, color, permissions } = req.body as {
    name?: string;
    description?: string;
    color?: string;
    permissions?: string[];
  };

  const existing = await db.execute(sql`SELECT * FROM custom_roles WHERE id = ${Number(id)}`);
  if (!existing.rows[0]) return res.status(404).json({ message: "Role tidak ditemukan" });

  const cur = existing.rows[0] as any;
  const newName = name?.trim() ?? cur.name;
  const newDesc = description !== undefined ? description : cur.description;
  const newColor = color ?? cur.color;
  const newPerms = permissions !== undefined ? JSON.stringify(permissions) : JSON.stringify(cur.permissions);

  const result = await db.execute(sql`
    UPDATE custom_roles
    SET name        = ${newName},
        description = ${newDesc},
        color       = ${newColor},
        permissions = ${newPerms}::jsonb,
        updated_at  = NOW()
    WHERE id = ${Number(id)}
    RETURNING *
  `);
  return res.json(result.rows[0]);
});

router.delete("/:id", async (req: Request, res: Response) => {
  const { id } = req.params;
  await db.execute(sql`UPDATE users SET custom_role_id = NULL WHERE custom_role_id = ${Number(id)}`);
  await db.execute(sql`DELETE FROM custom_roles WHERE id = ${Number(id)}`);
  return res.json({ message: "Role dihapus" });
});

router.post("/:id/assign", async (req: Request, res: Response) => {
  const { id } = req.params;
  const { userId } = req.body as { userId: string };
  if (!userId) return res.status(400).json({ message: "userId wajib diisi" });

  const roleRes = await db.execute(sql`SELECT id FROM custom_roles WHERE id = ${Number(id)}`);
  if (!roleRes.rows[0]) return res.status(404).json({ message: "Role tidak ditemukan" });

  await db.execute(sql`UPDATE users SET custom_role_id = ${Number(id)} WHERE id = ${userId}`);
  return res.json({ message: "Pengguna berhasil ditetapkan ke role" });
});

router.delete("/:id/assign/:userId", async (req: Request, res: Response) => {
  const { userId, id } = req.params;
  await db.execute(sql`
    UPDATE users SET custom_role_id = NULL WHERE id = ${userId} AND custom_role_id = ${Number(id)}
  `);
  return res.json({ message: "Pengguna dilepas dari role" });
});

export default router;
