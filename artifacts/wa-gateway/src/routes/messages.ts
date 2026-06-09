import { Router } from "express";
import { db } from "@workspace/db";
import { waMessages, waDevices } from "@workspace/db";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireJwtOrApiKey } from "../middleware/auth.js";
import { sendMessage, getSession } from "../sessions.js";

const router = Router();
router.use(requireJwtOrApiKey);

/**
 * POST /api/messages/send  — also aliased via /api/send in index.ts
 *
 * Body:
 *   device_id  number   required
 *   to         string   required  — phone number (e.g. "6281234567890")
 *   message    string   required for type=text
 *   type       string   "text" | "image" | "document"  (default: "text")
 *   url        string   required for type=image|document (publicly accessible URL)
 *   caption    string   optional caption for image
 *   filename   string   optional original filename for document
 */
router.post("/send", async (req, res) => {
  const { device_id, to, message, type = "text", url, caption, filename } = req.body ?? {};

  if (!device_id || !to) {
    res.status(400).json({ error: "device_id and to are required" });
    return;
  }
  if (type === "text" && !message) {
    res.status(400).json({ error: "message is required for type=text" });
    return;
  }
  if ((type === "image" || type === "document") && !url) {
    res.status(400).json({ error: "url is required for type=image or type=document" });
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
    const msgId = await sendMessage(deviceId, to, { type, message, url, caption, filename });
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

  const ownedDevices = await db.select({ id: waDevices.id })
    .from(waDevices)
    .where(eq(waDevices.accountId, req.auth!.accountId));
  const deviceIds = ownedDevices.map((d) => d.id);

  if (deviceIds.length === 0) {
    res.json({ messages: [], total: 0, page, limit });
    return;
  }

  const whereClause = (deviceId && deviceIds.includes(deviceId))
    ? eq(waMessages.deviceId, deviceId)
    : inArray(waMessages.deviceId, deviceIds);

  const messages = await db.select()
    .from(waMessages)
    .where(whereClause)
    .orderBy(desc(waMessages.createdAt))
    .limit(limit)
    .offset(offset);

  res.json({ messages, page, limit });
});

export default router;
