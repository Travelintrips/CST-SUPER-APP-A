import { Router } from "express";
import { db } from "@workspace/db";
import { waMessages, waDevices } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireJwtOrApiKey } from "../middleware/auth.js";
import { sendTextMessage, getSession } from "../sessions.js";

const router = Router();
router.use(requireJwtOrApiKey);

router.post("/send", async (req, res) => {
  const { device_id, to, message, type = "text" } = req.body ?? {};

  if (!device_id || !to || !message) {
    res.status(400).json({ error: "device_id, to, and message are required" });
    return;
  }

  const deviceId = Number(device_id);
  const [device] = await db.select().from(waDevices)
    .where(and(
      eq(waDevices.id, deviceId),
      eq(waDevices.accountId, req.auth!.accountId)
    ));

  if (!device) {
    res.status(404).json({ error: "Device not found" });
    return;
  }

  if (device.status !== "connected") {
    res.status(400).json({ error: `Device is ${device.status}, not connected` });
    return;
  }

  const session = getSession(deviceId);
  if (!session) {
    res.status(400).json({ error: "Device session not active" });
    return;
  }

  try {
    const msgId = await sendTextMessage(deviceId, to, message);
    res.json({ ok: true, messageId: msgId });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/", async (req, res) => {
  const deviceId = req.query.device_id ? Number(req.query.device_id) : null;
  const limit = Math.min(Number(req.query.limit ?? 50), 200);
  const page = Number(req.query.page ?? 1);
  const offset = (page - 1) * limit;

  const devices = await db.select({ id: waDevices.id })
    .from(waDevices)
    .where(eq(waDevices.accountId, req.auth!.accountId));
  const deviceIds = devices.map((d) => d.id);

  if (deviceIds.length === 0) {
    res.json({ messages: [], total: 0 });
    return;
  }

  let query = db.select().from(waMessages);

  if (deviceId && deviceIds.includes(deviceId)) {
    query = query.where(eq(waMessages.deviceId, deviceId)) as any;
  } else {
    const { inArray } = await import("drizzle-orm");
    query = query.where(inArray(waMessages.deviceId, deviceIds)) as any;
  }

  const messages = await (query as any)
    .orderBy(desc(waMessages.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ messages, page, limit });
});

export default router;
