import { Router } from "express";
import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { db } from "@workspace/db";
import { waApiKeys, waDevices } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireJwt } from "../middleware/auth.js";

const router = Router();
router.use(requireJwt);

router.get("/", async (req, res) => {
  const keys = await db.select({
    id: waApiKeys.id,
    name: waApiKeys.name,
    keyPrefix: waApiKeys.keyPrefix,
    deviceId: waApiKeys.deviceId,
    lastUsedAt: waApiKeys.lastUsedAt,
    createdAt: waApiKeys.createdAt,
  }).from(waApiKeys).where(eq(waApiKeys.accountId, req.auth!.accountId));
  res.json(keys);
});

router.post("/", async (req, res) => {
  const { name, device_id } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "Name required" }); return; }

  let deviceId: number | null = null;
  if (device_id) {
    deviceId = Number(device_id);
    const [device] = await db.select({ id: waDevices.id }).from(waDevices)
      .where(and(eq(waDevices.id, deviceId), eq(waDevices.accountId, req.auth!.accountId)));
    if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  }

  const rawKey = `wag_${randomBytes(24).toString("hex")}`;
  const keyPrefix = rawKey.slice(0, 12);
  const keyHash = await bcrypt.hash(rawKey, 10);

  const [key] = await db.insert(waApiKeys).values({
    accountId: req.auth!.accountId,
    deviceId,
    name,
    keyHash,
    keyPrefix,
  }).returning({
    id: waApiKeys.id,
    name: waApiKeys.name,
    keyPrefix: waApiKeys.keyPrefix,
    deviceId: waApiKeys.deviceId,
    createdAt: waApiKeys.createdAt,
  });

  res.status(201).json({ ...key, key: rawKey, warning: "Save this key — it won't be shown again." });
});

router.delete("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select({ id: waApiKeys.id }).from(waApiKeys)
    .where(and(eq(waApiKeys.id, id), eq(waApiKeys.accountId, req.auth!.accountId)));
  if (!existing) { res.status(404).json({ error: "API key not found" }); return; }

  await db.delete(waApiKeys).where(eq(waApiKeys.id, id));
  res.json({ ok: true });
});

export default router;
