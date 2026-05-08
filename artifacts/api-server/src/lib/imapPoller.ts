import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { randomUUID } from "crypto";
import {
  db,
  emailCorrespondencesTable,
  emailAttachmentsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import { objectStorageClient } from "./objectStorage.js";
import { logger } from "./logger.js";
import { processEmailForAiIntake } from "./aiOrderIntake.js";

function getImapConfig() {
  const host = process.env.IMAP_HOST;
  const port = process.env.IMAP_PORT ? Number(process.env.IMAP_PORT) : undefined;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASSWORD;
  return { host, port, user, pass };
}

function isImapConfigured(): boolean {
  const { host, user, pass } = getImapConfig();
  return !!(host && user && pass);
}

async function uploadAttachmentToStorage(
  buffer: Buffer,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) throw new Error("PRIVATE_OBJECT_DIR not set");

  const objectId = randomUUID();
  const fullPath = `${privateObjectDir}/email-attachments/${objectId}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0]!;
  const objectName = parts.slice(1).join("/");

  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: mimeType, resumable: false });

  return `/objects/email-attachments/${objectId}`;
}

export async function syncImapEmails(): Promise<{ synced: number; errors: number }> {
  if (!isImapConfigured()) {
    logger.debug("IMAP not configured (IMAP_HOST/IMAP_USER/IMAP_PASSWORD missing), skipping sync");
    return { synced: 0, errors: 0 };
  }

  const { host, port, user, pass } = getImapConfig();
  let synced = 0;
  let errors = 0;

  const client = new ImapFlow({
    host: host!,
    port: port ?? 993,
    secure: true,
    auth: { user: user!, pass: pass! },
    logger: false,
  });

  // Prevent unhandled 'error' events from crashing the process on socket timeout
  client.on("error", (err) => {
    logger.warn({ err }, "IMAP client error (socket/connection)");
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock("INBOX");

    try {
      const uids: number[] = [];
      for await (const msg of client.fetch("1:*", { uid: true, flags: true, envelope: true })) {
        uids.push(msg.uid);
      }

      if (uids.length === 0) {
        return { synced: 0, errors: 0 };
      }

      const recentUids = uids.slice(-200);

      for (const uid of recentUids) {
        try {
          const msgData = await client.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
          if (!msgData?.source) continue;

          const parsed = await simpleParser(msgData.source);
          const messageId = parsed.messageId ?? `uid-${uid}-${user}`;

          // Deduplication — check email_correspondences table
          const [existing] = await db
            .select({ id: emailCorrespondencesTable.id })
            .from(emailCorrespondencesTable)
            .where(eq(emailCorrespondencesTable.emailMessageId, messageId))
            .limit(1);

          if (existing) continue;

          const fromAddr = Array.isArray(parsed.from?.value)
            ? parsed.from!.value[0]
            : undefined;
          const toList = parsed.to
            ? (Array.isArray(parsed.to)
              ? parsed.to.flatMap((a) => a.value)
              : (parsed.to as any).value ?? [])
            : [];
          const ccList = parsed.cc
            ? (Array.isArray(parsed.cc)
              ? parsed.cc.flatMap((a) => a.value)
              : (parsed.cc as any).value ?? [])
            : [];

          const fromEmail = fromAddr?.address ?? null;
          const toEmail = toList.map((a: any) => a.address).filter(Boolean).join(", ") || null;
          const ccEmail = ccList.map((a: any) => a.address).filter(Boolean).join(", ") || null;

          const body = parsed.text ?? parsed.html?.replace(/<[^>]*>/g, "") ?? null;

          const [saved] = await db
            .insert(emailCorrespondencesTable)
            .values({
              emailMessageId: messageId,
              fromEmail,
              toEmail,
              ccEmail,
              subject: parsed.subject ?? "(No Subject)",
              body: body ? body.slice(0, 10000) : null,
              receivedAt: parsed.date ?? new Date(),
              status: "new",
            })
            .returning();

          if (!saved) continue;

          // Async AI intake — fire-and-forget (don't block email sync)
          if (body && parsed.subject) {
            processEmailForAiIntake(
              saved.id,
              parsed.subject ?? "(No Subject)",
              body,
              fromEmail,
            ).catch((err) => logger.warn({ err, emailId: saved.id }, "AI intake: email processing failed"));
          }

          for (const att of parsed.attachments ?? []) {
            if (!att.content) continue;
            try {
              const fileUrl = await uploadAttachmentToStorage(
                att.content,
                att.filename ?? "attachment",
                att.contentType ?? "application/octet-stream",
              );
              await db.insert(emailAttachmentsTable).values({
                emailCorrespondenceId: saved.id,
                fileName: att.filename ?? "attachment",
                fileUrl,
                mimeType: att.contentType ?? "application/octet-stream",
              });
            } catch (attErr) {
              logger.warn({ attErr, fileName: att.filename }, "Failed to store email attachment");
            }
          }

          synced++;
        } catch (msgErr) {
          logger.warn({ msgErr, uid }, "Failed to process email");
          errors++;
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.error({ err }, "IMAP connection/sync failed");
    errors++;
  } finally {
    try { await client.logout(); } catch {}
  }

  logger.info({ synced, errors }, "IMAP sync completed");
  return { synced, errors };
}

let syncTimer: ReturnType<typeof setInterval> | null = null;

export function startImapPoller(intervalMs = 5 * 60 * 1000): void {
  if (!isImapConfigured()) {
    logger.info("IMAP not configured — email sync disabled. Set IMAP_HOST, IMAP_USER, IMAP_PASSWORD to enable.");
    return;
  }

  syncImapEmails().catch((err) => logger.error({ err }, "Initial IMAP sync failed"));

  syncTimer = setInterval(() => {
    syncImapEmails().catch((err) => logger.error({ err }, "Periodic IMAP sync failed"));
  }, intervalMs);

  logger.info({ intervalMs }, "IMAP poller started");
}

export function stopImapPoller(): void {
  if (syncTimer) {
    clearInterval(syncTimer);
    syncTimer = null;
  }
}
