/**
 * WA Gateway Session Manager
 *
 * This file manages WhatsApp device sessions.
 *
 * In Replit dev mode (BAILEYS_STUB=true or Baileys not installed), uses a STUB
 * that simulates the connection flow with a demo QR code.
 *
 * For production with real WhatsApp:
 *   1. Deploy outside Replit
 *   2. Install: npm install @whiskeysockets/baileys
 *   3. Set BAILEYS_STUB=false
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { waDevices, waMessages } from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_ROOT = path.resolve(__dirname, "../../sessions");

const STUB_MODE = process.env.BAILEYS_STUB !== "false";

if (STUB_MODE) {
  console.warn("[wa-gateway] Running in STUB mode — WhatsApp sessions are simulated.");
  console.warn("[wa-gateway] To use real WhatsApp, set BAILEYS_STUB=false and install @whiskeysockets/baileys.");
}

interface SessionEntry {
  socket: any;
  qrListeners: Set<(qr: string) => void>;
  statusListeners: Set<(event: { status: string; phone?: string }) => void>;
  reconnectTimer?: NodeJS.Timeout;
  stubTimer?: NodeJS.Timeout;
}

const sessions = new Map<number, SessionEntry>();

export function getSession(deviceId: number) {
  return sessions.get(deviceId);
}

export function getSessionDir(deviceId: number): string {
  const dir = path.join(SESSIONS_ROOT, String(deviceId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Stub mode ────────────────────────────────────────────────────────────────

async function startStubSession(deviceId: number): Promise<void> {
  if (sessions.has(deviceId)) {
    const ex = sessions.get(deviceId)!;
    clearTimeout(ex.stubTimer);
    sessions.delete(deviceId);
  }

  const entry: SessionEntry = {
    socket: null,
    qrListeners: new Set(),
    statusListeners: new Set(),
  };
  sessions.set(deviceId, entry);

  await db.update(waDevices)
    .set({ status: "connecting", updatedAt: new Date() })
    .where(eq(waDevices.id, deviceId));

  entry.statusListeners.forEach((fn) => fn({ status: "connecting" }));

  // Generate a demo QR code string
  const { default: QRCode } = await import("qrcode");
  const demoPayload = `WA_GATEWAY_DEMO,${deviceId},${Date.now()},SCAN_TO_LINK`;
  const qrDataUrl = await QRCode.toString(demoPayload, { type: "terminal", small: true }).catch(() => demoPayload);
  const qrRaw = `2@${deviceId},${Date.now()},demo`;

  entry.qrListeners.forEach((fn) => fn(qrRaw));

  // Simulate auto-connect after 15 seconds (demo mode)
  entry.stubTimer = setTimeout(async () => {
    const session = sessions.get(deviceId);
    if (!session) return;
    const demoPhone = `62800${String(deviceId).padStart(8, "0")}`;
    await db.update(waDevices)
      .set({ status: "connected", phoneNumber: demoPhone, updatedAt: new Date() })
      .where(eq(waDevices.id, deviceId));
    session.statusListeners.forEach((fn) => fn({ status: "connected", phone: demoPhone }));
    console.log(`[wa-gateway][stub] Device ${deviceId} auto-connected (demo)`);
  }, 15_000);
}

async function sendStubMessage(deviceId: number, to: string, text: string): Promise<string> {
  const msgId = `stub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  await db.insert(waMessages).values({
    deviceId,
    direction: "outbound",
    toFrom: to,
    messageType: "text",
    content: text,
    status: "sent",
    waMessageId: msgId,
  });
  console.log(`[wa-gateway][stub] Message to ${to}: ${text.slice(0, 50)}`);
  return msgId;
}

// ── Real Baileys mode ─────────────────────────────────────────────────────────

async function startBaileysSession(deviceId: number, sessionDir: string): Promise<void> {
  // Dynamic import so missing package doesn't crash the whole server
  let baileys: any;
  try {
    baileys = await import("@whiskeysockets/baileys");
  } catch {
    console.error("[wa-gateway] @whiskeysockets/baileys not installed — falling back to stub mode");
    return startStubSession(deviceId);
  }

  const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;
  const { Boom } = await import("@hapi/boom").catch(() => ({ Boom: Error }));
  const pino = (await import("pino")).default;

  fs.mkdirSync(sessionDir, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: "warn" }),
    browser: ["WA-Gateway", "Chrome", "1.0.0"],
  });

  const entry: SessionEntry = { socket: sock, qrListeners: new Set(), statusListeners: new Set() };
  sessions.set(deviceId, entry);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    const session = sessions.get(deviceId);
    if (!session) return;

    if (qr) {
      session.qrListeners.forEach((fn) => fn(qr));
      await db.update(waDevices).set({ status: "connecting", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      session.statusListeners.forEach((fn) => fn({ status: "connecting" }));
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      await db.update(waDevices).set({ status: "disconnected", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      session.statusListeners.forEach((fn) => fn({ status: "disconnected" }));
      if (!loggedOut) {
        session.reconnectTimer = setTimeout(() => startBaileysSession(deviceId, sessionDir), 5000);
      } else {
        sessions.delete(deviceId);
      }
    } else if (connection === "open") {
      const jid: string = sock.user?.id ?? "";
      const phone = jid.split(":")[0].split("@")[0];
      await db.update(waDevices).set({ status: "connected", phoneNumber: phone || null, updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      session.statusListeners.forEach((fn) => fn({ status: "connected", phone }));
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }: any) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe) continue;
      const from = msg.key.remoteJid ?? "";
      if (!from || from === "status@broadcast") continue;
      const phone = from.split("@")[0];
      const text = msg.message?.conversation || msg.message?.extendedTextMessage?.text || "";

      await db.insert(waMessages).values({
        deviceId, direction: "inbound", toFrom: phone,
        messageType: "text", content: text, status: "received", waMessageId: msg.key.id ?? null,
      });

      const [device] = await db.select({ webhookUrl: waDevices.webhookUrl }).from(waDevices).where(eq(waDevices.id, deviceId));
      if (device?.webhookUrl) {
        deliverWebhook(device.webhookUrl, {
          event: "message.received", deviceId, from: phone, text, messageId: msg.key.id, timestamp: Date.now(),
        }).catch(console.error);
      }
    }
  });
}

async function sendBaileysMessage(deviceId: number, to: string, text: string): Promise<string> {
  const session = sessions.get(deviceId);
  if (!session?.socket) throw new Error("Device session not active");
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;
  const result = await session.socket.sendMessage(jid, { text });
  const msgId = result?.key?.id ?? `real_${Date.now()}`;
  await db.insert(waMessages).values({ deviceId, direction: "outbound", toFrom: to, messageType: "text", content: text, status: "sent", waMessageId: msgId });
  return msgId;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startSession(deviceId: number, sessionDir: string): Promise<void> {
  if (STUB_MODE) {
    return startStubSession(deviceId);
  }
  return startBaileysSession(deviceId, sessionDir);
}

export async function sendTextMessage(deviceId: number, to: string, text: string): Promise<string> {
  const session = sessions.get(deviceId);
  if (!session) throw new Error("Device not connected");
  if (STUB_MODE) return sendStubMessage(deviceId, to, text);
  return sendBaileysMessage(deviceId, to, text);
}

export async function disconnectDevice(deviceId: number): Promise<void> {
  const session = sessions.get(deviceId);
  if (!session) return;
  clearTimeout(session.stubTimer);
  clearTimeout(session.reconnectTimer);
  try { await session.socket?.logout?.(); } catch {}
  sessions.delete(deviceId);
  await db.update(waDevices).set({ status: "disconnected", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
}

async function deliverWebhook(url: string, payload: object): Promise<void> {
  try {
    const { default: fetch } = await import("node-fetch");
    await (fetch as any)(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err: any) {
    console.error(`[wa-gateway] Webhook delivery failed: ${err.message}`);
  }
}

export async function initAllSessions(): Promise<void> {
  const devices = await db.select().from(waDevices).where(eq(waDevices.status, "connected"));
  for (const device of devices) {
    if (STUB_MODE || !device.sessionDir || !fs.existsSync(device.sessionDir)) {
      await db.update(waDevices).set({ status: "disconnected", updatedAt: new Date() }).where(eq(waDevices.id, device.id));
    }
  }
}
