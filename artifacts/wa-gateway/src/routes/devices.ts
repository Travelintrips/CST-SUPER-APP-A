import { Router } from "express";
import { db } from "@workspace/db";
import { waDevices } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireJwt, JWT_SECRET } from "../middleware/auth.js";
import { startSession, disconnectDevice, getSession, getSessionDir } from "../sessions.js";
import jwt from "jsonwebtoken";
import type { Response } from "express";

const router = Router();

// NOTE: do NOT put router.use(requireJwt) here — the SSE /qr route
// uses EventSource which can't send Authorization headers; it passes token
// via query param and validates it inside the handler.

router.get("/", requireJwt, async (req, res) => {
  const devices = await db.select().from(waDevices).where(eq(waDevices.accountId, req.auth!.accountId));
  res.json(devices);
});

router.post("/", requireJwt, async (req, res) => {
  const { name, webhookUrl } = req.body ?? {};
  if (!name) { res.status(400).json({ error: "Name required" }); return; }

  const [device] = await db.insert(waDevices).values({
    accountId: req.auth!.accountId,
    name,
    webhookUrl: webhookUrl ?? null,
    sessionDir: "",
    status: "disconnected",
  }).returning();

  const sessionDir = getSessionDir(device.id);
  await db.update(waDevices).set({ sessionDir }).where(eq(waDevices.id, device.id));
  device.sessionDir = sessionDir;

  res.status(201).json(device);
});

router.get("/:id", requireJwt, async (req, res) => {
  const id = Number(req.params.id);
  const [device] = await db.select().from(waDevices)
    .where(and(eq(waDevices.id, id), eq(waDevices.accountId, req.auth!.accountId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }
  res.json(device);
});

router.put("/:id", requireJwt, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select({ id: waDevices.id }).from(waDevices)
    .where(and(eq(waDevices.id, id), eq(waDevices.accountId, req.auth!.accountId)));
  if (!existing) { res.status(404).json({ error: "Device not found" }); return; }

  const { name, webhookUrl } = req.body ?? {};
  const update: Record<string, any> = { updatedAt: new Date() };
  if (name) update.name = name;
  if (webhookUrl !== undefined) update.webhookUrl = webhookUrl || null;

  const [device] = await db.update(waDevices).set(update).where(eq(waDevices.id, id)).returning();
  res.json(device);
});

router.delete("/:id", requireJwt, async (req, res) => {
  const id = Number(req.params.id);
  const [existing] = await db.select().from(waDevices)
    .where(and(eq(waDevices.id, id), eq(waDevices.accountId, req.auth!.accountId)));
  if (!existing) { res.status(404).json({ error: "Device not found" }); return; }

  await disconnectDevice(id).catch(() => {});
  await db.delete(waDevices).where(eq(waDevices.id, id));
  res.json({ ok: true });
});

router.post("/:id/connect", requireJwt, async (req, res) => {
  const id = Number(req.params.id);
  const [device] = await db.select().from(waDevices)
    .where(and(eq(waDevices.id, id), eq(waDevices.accountId, req.auth!.accountId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  const sessionDir = device.sessionDir || getSessionDir(id);
  if (!device.sessionDir) {
    await db.update(waDevices).set({ sessionDir }).where(eq(waDevices.id, id));
  }

  startSession(id, sessionDir).catch((e) =>
    console.error(`[wa-gateway] startSession error device ${id}:`, e.message)
  );
  res.json({ ok: true, message: "Connecting…" });
});

router.post("/:id/disconnect", requireJwt, async (req, res) => {
  const id = Number(req.params.id);
  const [device] = await db.select({ id: waDevices.id }).from(waDevices)
    .where(and(eq(waDevices.id, id), eq(waDevices.accountId, req.auth!.accountId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  await disconnectDevice(id);
  res.json({ ok: true });
});

const sseClients = new Map<number, Set<Response>>();

// SSE endpoint — no global requireJwt; validates token from ?token= query param
// because EventSource cannot send Authorization headers.
router.get("/:id/qr", async (req, res) => {
  const id = Number(req.params.id);

  // Validate token from query param (SSE) or Authorization header (fallback)
  const header = (req.headers.authorization ?? "");
  const headerToken = header.startsWith("Bearer ") ? header.slice(7) : null;
  const queryToken = req.query.token ? String(req.query.token) : null;
  const rawToken = headerToken ?? queryToken;

  if (!rawToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    req.auth = jwt.verify(rawToken, JWT_SECRET) as any;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  const [device] = await db.select().from(waDevices)
    .where(and(eq(waDevices.id, id), eq(waDevices.accountId, req.auth!.accountId)));
  if (!device) { res.status(404).json({ error: "Device not found" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("status", { status: device.status, phone: device.phoneNumber });

  if (!sseClients.has(id)) sseClients.set(id, new Set());
  sseClients.get(id)!.add(res);

  const session = getSession(id);
  const qrHandler = (qr: string) => send("qr", { qr });
  const statusHandler = (ev: { status: string; phone?: string }) => send("status", ev);

  if (session) {
    session.qrListeners.add(qrHandler);
    session.statusListeners.add(statusHandler);
  }

  const cleanup = () => {
    sseClients.get(id)?.delete(res);
    const s = getSession(id);
    if (s) {
      s.qrListeners.delete(qrHandler);
      s.statusListeners.delete(statusHandler);
    }
  };

  req.on("close", cleanup);
  const keepAlive = setInterval(() => { res.write(": ping\n\n"); }, 20000);
  req.on("close", () => clearInterval(keepAlive));
});

export default router;
