/**
 * Automated daily database backup.
 *
 * - Runs pg_dump, gzips the output in-memory, uploads to Replit Object Storage
 *   under the private bucket at prefix `db-backups/`.
 * - Rotates: keeps only the last KEEP_BACKUPS files (default 7).
 * - Scheduled daily at 02:00 WIB (19:00 UTC). Can also be triggered on demand.
 * - Non-fatal: failures are logged but never crash the server.
 */

import { spawn } from "child_process";
import { gzip } from "zlib";
import { promisify } from "util";
import { objectStorageClient } from "./objectStorage.js";
import { logger } from "./logger.js";

const gzipAsync = promisify(gzip);

const KEEP_BACKUPS = 7;
const PG_DUMP_BIN = process.env["PG_DUMP_BIN"] ?? "pg_dump";
const BACKUP_HOUR_UTC = 19; // 02:00 WIB
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // check every hour

let lastBackupDate = ""; // "YYYY-MM-DD" of last successful backup

// ── helpers ──────────────────────────────────────────────────────────────────

/** Parse Replit Object Storage path into { bucketName, objectName }. */
function parsePath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) path = `/${path}`;
  const parts = path.split("/");
  if (parts.length < 3) throw new Error(`Invalid object storage path: ${path}`);
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

/** Run pg_dump and return stdout as a Buffer. */
function runPgDump(databaseUrl: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    const proc = spawn(PG_DUMP_BIN, [
      "--format=plain",
      "--no-owner",
      "--no-acl",
      "--no-password",
      databaseUrl,
    ], { stdio: ["ignore", "pipe", "pipe"] });

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => errChunks.push(chunk));

    proc.on("error", (err) => reject(err));
    proc.on("close", (code) => {
      if (code !== 0) {
        const stderr = Buffer.concat(errChunks).toString("utf8").slice(0, 500);
        reject(new Error(`pg_dump exited with code ${code}: ${stderr}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

// ── core backup function ──────────────────────────────────────────────────────

export async function runDbBackup(): Promise<{ ok: boolean; key?: string; sizeKb?: number; error?: string }> {
  const databaseUrl = process.env["DATABASE_URL"];
  const privateDir = process.env["PRIVATE_OBJECT_DIR"];

  if (!databaseUrl) {
    logger.warn("DB backup: DATABASE_URL not set — skipping");
    return { ok: false, error: "DATABASE_URL not set" };
  }
  if (!privateDir) {
    logger.warn("DB backup: PRIVATE_OBJECT_DIR not set — skipping");
    return { ok: false, error: "PRIVATE_OBJECT_DIR not set" };
  }

  const now = new Date();
  const ts = now.toISOString().replace(/[:.]/g, "-").slice(0, 19); // 2026-05-27T19-00-00
  const filename = `backup-${ts}.sql.gz`;
  const fullPath = `${privateDir}/db-backups/${filename}`;
  const { bucketName, objectName } = parsePath(fullPath);
  const prefix = parsePath(`${privateDir}/db-backups/`).objectName;

  logger.info({ filename }, "DB backup: starting pg_dump");

  try {
    // 1. Dump
    const sqlBuffer = await runPgDump(databaseUrl);

    // 2. Compress
    const gzBuffer = await gzipAsync(sqlBuffer);
    const sizeKb = Math.round(gzBuffer.byteLength / 1024);

    // 3. Upload
    const bucket = objectStorageClient.bucket(bucketName);
    await bucket.file(objectName).save(gzBuffer, {
      contentType: "application/gzip",
      resumable: false,
      metadata: { cacheControl: "private, no-store" },
    });

    logger.info({ filename, sizeKb }, "DB backup: uploaded successfully");

    // 4. Rotate — delete old backups beyond KEEP_BACKUPS
    try {
      const [files] = await bucket.getFiles({ prefix });
      // Sort by name ascending (timestamps are lexicographic)
      const backupFiles = files
        .filter((f) => f.name.endsWith(".sql.gz"))
        .sort((a, b) => a.name.localeCompare(b.name));

      const toDelete = backupFiles.slice(0, Math.max(0, backupFiles.length - KEEP_BACKUPS));
      for (const f of toDelete) {
        await f.delete().catch((e: unknown) => logger.warn({ err: e, name: f.name }, "DB backup: rotation delete failed"));
        logger.info({ name: f.name }, "DB backup: rotated old backup");
      }
    } catch (rotateErr) {
      logger.warn({ err: rotateErr }, "DB backup: rotation failed (non-fatal)");
    }

    return { ok: true, key: objectName, sizeKb };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "DB backup: failed");
    return { ok: false, error: message };
  }
}

// ── scheduler ─────────────────────────────────────────────────────────────────

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

function currentHourUtc(): number {
  return new Date().getUTCHours();
}

export function startDbBackupScheduler(): void {
  const check = () => {
    const today = todayUtc();
    const hour = currentHourUtc();

    // Run if: correct hour AND not already run today
    if (hour === BACKUP_HOUR_UTC && lastBackupDate !== today) {
      lastBackupDate = today; // mark immediately to prevent duplicate runs
      logger.info({ date: today }, "DB backup: scheduled run starting");
      runDbBackup().catch((err) => logger.error({ err }, "DB backup: scheduler error"));
    }
  };

  // Check once now (in case server restarts during the backup window)
  check();
  setInterval(check, CHECK_INTERVAL_MS).unref();

  logger.info(
    { backupHourUtc: BACKUP_HOUR_UTC, keepBackups: KEEP_BACKUPS },
    "DB backup scheduler started (daily 02:00 WIB)"
  );
}
