/**
 * WA Gateway Session Manager
 *
 * STUB_MODE (default on Replit): simulates QR + connection flow with demo data.
 * Real WhatsApp: set BAILEYS_STUB=false and install @whiskeysockets/baileys
 * on a non-Replit host.
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
  console.warn("[wa-gateway] Set BAILEYS_STUB=false + install @whiskeysockets/baileys for real WhatsApp.");
}

export interface SendPayload {
  type: "text" | "image" | "document";
  message?: string;
  url?: string;
  caption?: string;
  filename?: string;
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

// ── Stub mode ─────────────────────────────────────────────────────────────────

async function startStubSession(deviceId: number): Promise<void> {
  const ex = sessions.get(deviceId);
  if (ex) {
    clearTimeout(ex.stubTimer);
    clearTimeout(ex.reconnectTimer);
    sessions.delete(deviceId);
  }

  const entry: SessionEntry = { socket: null, qrListeners: new Set(), statusListeners: new Set() };
  sessions.set(deviceId, entry);

  await db.update(waDevices).set({ status: "connecting", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
  entry.statusListeners.forEach((fn) => fn({ status: "connecting" }));

  // Emit a demo QR code string after 1s
  entry.stubTimer = setTimeout(async () => {
    const session = sessions.get(deviceId);
    if (!session) return;
    const qrRaw = `2@WA_GATEWAY_DEMO_${deviceId},${Date.now()},scan_to_link_device`;
    session.qrListeners.forEach((fn) => fn(qrRaw));

    // Auto-connect after another 14s in demo mode
    session.stubTimer = setTimeout(async () => {
      const s = sessions.get(deviceId);
      if (!s) return;
      const demoPhone = `62800${String(deviceId).padStart(8, "0")}`;
      await db.update(waDevices).set({ status: "connected", phoneNumber: demoPhone, updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      s.statusListeners.forEach((fn) => fn({ status: "connected", phone: demoPhone }));
      console.log(`[wa-gateway][stub] Device ${deviceId} auto-connected (demo phone: ${demoPhone})`);
    }, 14_000);
  }, 1_000);
}

async function sendStubMessage(deviceId: number, to: string, payload: SendPayload): Promise<string> {
  const msgId = `stub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const content = payload.type === "text"
    ? (payload.message ?? "")
    : `[${payload.type.toUpperCase()}] ${payload.url ?? ""}${payload.caption ? ` — ${payload.caption}` : ""}`;

  await db.insert(waMessages).values({
    deviceId,
    direction: "outbound",
    toFrom: to,
    messageType: payload.type,
    content,
    status: "sent",
    waMessageId: msgId,
  });
  console.log(`[wa-gateway][stub] ${payload.type} → ${to}: ${content.slice(0, 60)}`);
  return msgId;
}

// ── Real Baileys mode ─────────────────────────────────────────────────────────

async function startBaileysSession(deviceId: number, sessionDir: string): Promise<void> {
  let baileys: any;
  try {
    baileys = await import("@whiskeysockets/baileys");
  } catch {
    console.error("[wa-gateway] @whiskeysockets/baileys not installed — falling back to stub");
    return startStubSession(deviceId);
  }

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = baileys;
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

async function sendBaileysMessage(deviceId: number, to: string, payload: SendPayload): Promise<string> {
  const session = sessions.get(deviceId);
  if (!session?.socket) throw new Error("Device session not active");
  const jid = to.includes("@") ? to : `${to}@s.whatsapp.net`;

  let waPayload: any;
  if (payload.type === "text") {
    waPayload = { text: payload.message ?? "" };
  } else if (payload.type === "image") {
    waPayload = { image: { url: payload.url }, caption: payload.caption ?? "" };
  } else if (payload.type === "document") {
    waPayload = { document: { url: payload.url }, fileName: payload.filename ?? "document", caption: payload.caption ?? "" };
  } else {
    throw new Error(`Unsupported message type: ${(payload as any).type}`);
  }

  const result = await session.socket.sendMessage(jid, waPayload);
  const msgId = result?.key?.id ?? `real_${Date.now()}`;

  const content = payload.type === "text"
    ? (payload.message ?? "")
    : `[${payload.type.toUpperCase()}] ${payload.url ?? ""}${payload.caption ? ` — ${payload.caption}` : ""}`;

  await db.insert(waMessages).values({
    deviceId, direction: "outbound", toFrom: to,
    messageType: payload.type, content, status: "sent", waMessageId: msgId,
  });
  return msgId;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function startSession(deviceId: number, sessionDir: string): Promise<void> {
  return STUB_MODE ? startStubSession(deviceId) : startBaileysSession(deviceId, sessionDir);
}

export async function sendMessage(deviceId: number, to: string, payload: SendPayload): Promise<string> {
  const session = sessions.get(deviceId);
  if (!session) throw new Error("Device not connected");
  return STUB_MODE ? sendStubMessage(deviceId, to, payload) : sendBaileysMessage(deviceId, to, payload);
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
    // In stub mode or if session dir doesn't exist, reset to disconnected
    if (STUB_MODE || !device.sessionDir || !fs.existsSync(device.sessionDir)) {
      await db.update(waDevices)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(waDevices.id, device.id));
    }
  }
}
