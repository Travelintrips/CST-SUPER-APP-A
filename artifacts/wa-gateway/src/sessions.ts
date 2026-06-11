/**
 * WA Gateway Session Manager
 *
 * Real Baileys mode (default): dynamically imports @whiskeysockets/baileys at
 * session start. If the package is not installed (e.g. Replit where it's blocked
 * by the package firewall), the session automatically falls back to stub mode.
 *
 * Stub mode (BAILEYS_STUB=true): simulates QR + connection flow for development/demo.
 *
 * Security note: always install Baileys from a release that has no spoofing
 * advisories; pin the version explicitly in package.json when deploying.
 */

import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { db } from "@workspace/db";
import { waDevices, waMessages } from "@workspace/db";
import { eq } from "drizzle-orm";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSIONS_ROOT = path.resolve(__dirname, "../../sessions");

// STUB_MODE: opt-in via BAILEYS_STUB=true; default is real mode (with stub fallback).
const STUB_MODE = process.env.BAILEYS_STUB === "true";

if (STUB_MODE) {
  console.warn("[wa-gateway] BAILEYS_STUB=true — WhatsApp sessions are simulated (demo mode).");
} else {
  console.log("[wa-gateway] Real Baileys mode — @whiskeysockets/baileys loaded per-session.");
  console.log("[wa-gateway] Auto-fallback to stub if Baileys is not installed.");
}

export interface SendPayload {
  type: "text" | "image" | "document";
  message?: string;
  url?: string;
  caption?: string;
  filename?: string;
}

// ── Global listener registry ──────────────────────────────────────────────────
// Listeners are stored here INDEPENDENTLY of whether a session exists.
// SSE handlers register here; sessions pull from here when they emit events.
// This eliminates the race condition where SSE connects before the session starts.

type QrListener = (qr: string) => void;
type StatusListener = (ev: { status: string; phone?: string }) => void;

const qrRegistry = new Map<number, Set<QrListener>>();
const statusRegistry = new Map<number, Set<StatusListener>>();

export function addQrListener(deviceId: number, fn: QrListener): () => void {
  if (!qrRegistry.has(deviceId)) qrRegistry.set(deviceId, new Set());
  qrRegistry.get(deviceId)!.add(fn);
  return () => qrRegistry.get(deviceId)?.delete(fn);
}

export function addStatusListener(deviceId: number, fn: StatusListener): () => void {
  if (!statusRegistry.has(deviceId)) statusRegistry.set(deviceId, new Set());
  statusRegistry.get(deviceId)!.add(fn);
  return () => statusRegistry.get(deviceId)?.delete(fn);
}

function emitQr(deviceId: number, qr: string) {
  qrRegistry.get(deviceId)?.forEach((fn) => fn(qr));
}

function emitStatus(deviceId: number, ev: { status: string; phone?: string }) {
  statusRegistry.get(deviceId)?.forEach((fn) => fn(ev));
}

// ── Session socket map (for sending messages) ─────────────────────────────────
interface SessionEntry {
  socket: any;
  reconnectTimer?: NodeJS.Timeout;
  stubTimer?: NodeJS.Timeout;
}

const sessions = new Map<number, SessionEntry>();

export function getSession(deviceId: number): SessionEntry | undefined {
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

  const entry: SessionEntry = { socket: null };
  sessions.set(deviceId, entry);

  await db.update(waDevices).set({ status: "connecting", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
  emitStatus(deviceId, { status: "connecting" });

  // Emit demo QR string after 1s
  entry.stubTimer = setTimeout(async () => {
    const session = sessions.get(deviceId);
    if (!session) return;
    const qrRaw = `2@WA_GATEWAY_DEMO_${deviceId},${Date.now()},scan_to_link_device`;
    emitQr(deviceId, qrRaw);

    // Auto-connect after another 14s in demo mode
    session.stubTimer = setTimeout(async () => {
      if (!sessions.has(deviceId)) return;
      const demoPhone = `62800${String(deviceId).padStart(8, "0")}`;
      await db.update(waDevices).set({ status: "connected", phoneNumber: demoPhone, updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      emitStatus(deviceId, { status: "connected", phone: demoPhone });
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
    deviceId, direction: "outbound", toFrom: to,
    messageType: payload.type, content, status: "sent", waMessageId: msgId,
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
    console.warn(`[wa-gateway] @whiskeysockets/baileys not found — falling back to stub for device ${deviceId}`);
    return startStubSession(deviceId);
  }

  const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestBaileysVersion,
  } = baileys;

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

  const entry: SessionEntry = { socket: sock };
  sessions.set(deviceId, entry);

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update: any) => {
    const { connection, lastDisconnect, qr } = update;
    if (!sessions.has(deviceId)) return;

    if (qr) {
      emitQr(deviceId, qr);
      await db.update(waDevices).set({ status: "connecting", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      emitStatus(deviceId, { status: "connecting" });
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      await db.update(waDevices).set({ status: "disconnected", updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      emitStatus(deviceId, { status: "disconnected" });
      if (!loggedOut) {
        entry.reconnectTimer = setTimeout(() => startBaileysSession(deviceId, sessionDir), 5000);
      } else {
        sessions.delete(deviceId);
      }
    } else if (connection === "open") {
      const jid: string = sock.user?.id ?? "";
      const phone = jid.split(":")[0].split("@")[0];
      await db.update(waDevices).set({ status: "connected", phoneNumber: phone || null, updatedAt: new Date() }).where(eq(waDevices.id, deviceId));
      emitStatus(deviceId, { status: "connected", phone });
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
  // Clear all listeners for this device
  qrRegistry.delete(deviceId);
  statusRegistry.delete(deviceId);
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
      await db.update(waDevices)
        .set({ status: "disconnected", updatedAt: new Date() })
        .where(eq(waDevices.id, device.id));
    }
  }
}
