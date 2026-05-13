import { createClient } from "@supabase/supabase-js";
import { logger } from "./logger.js";

const OCR_TEMP_FOLDER = "private/ocr-temp";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return createClient(url, key);
}

function getBucket() {
  return process.env.SUPABASE_STORAGE_BUCKET ?? "bizportal";
}

/**
 * List all files in a Supabase Storage folder recursively.
 * Supabase Storage list() only goes one level deep, so we need to
 * walk subdirectories manually.
 */
async function listFilesRecursive(
  supabase: ReturnType<typeof createClient>,
  bucket: string,
  prefix: string,
): Promise<{ name: string; id: string | null; created_at: string | null; fullPath: string }[]> {
  const { data, error } = await supabase.storage.from(bucket).list(prefix, {
    limit: 1000,
    offset: 0,
  });

  if (error || !data) return [];

  const results: { name: string; id: string | null; created_at: string | null; fullPath: string }[] = [];

  for (const item of data) {
    const fullPath = `${prefix}/${item.name}`;
    if (item.id) {
      results.push({ name: item.name, id: item.id, created_at: item.created_at ?? null, fullPath });
    } else {
      const nested = await listFilesRecursive(supabase, bucket, fullPath);
      results.push(...nested);
    }
  }

  return results;
}

/**
 * Delete OCR temp files older than MAX_AGE_MS (24 hours).
 * Returns the number of files deleted.
 */
export async function cleanupOcrTempFiles(): Promise<{ deleted: number; errors: number }> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    logger.debug("OCR temp cleanup skipped — Supabase not configured");
    return { deleted: 0, errors: 0 };
  }

  const supabase = getSupabase();
  const bucket = getBucket();
  const cutoff = Date.now() - MAX_AGE_MS;

  let deleted = 0;
  let errors = 0;

  try {
    const files = await listFilesRecursive(supabase as any, bucket, OCR_TEMP_FOLDER);

    const toDelete = files.filter((f) => {
      if (!f.created_at) return false;
      const createdMs = new Date(f.created_at).getTime();
      return createdMs < cutoff;
    });

    if (toDelete.length === 0) {
      logger.info("OCR temp cleanup: no expired files found");
      return { deleted: 0, errors: 0 };
    }

    const paths = toDelete.map((f) => f.fullPath);

    const CHUNK = 100;
    for (let i = 0; i < paths.length; i += CHUNK) {
      const chunk = paths.slice(i, i + CHUNK);
      const { error } = await supabase.storage.from(bucket).remove(chunk);
      if (error) {
        logger.warn({ err: error }, `OCR temp cleanup: failed to delete chunk starting at index ${i}`);
        errors += chunk.length;
      } else {
        deleted += chunk.length;
      }
    }

    logger.info({ deleted, errors, total: toDelete.length }, "OCR temp cleanup complete");
  } catch (err) {
    logger.warn({ err }, "OCR temp cleanup: unexpected error");
    errors++;
  }

  return { deleted, errors };
}

/**
 * Start the OCR temp cleanup scheduler.
 * Runs once immediately on server start, then every RUN_INTERVAL_MS (6 hours).
 */
export function startOcrTempCleanup(): void {
  const run = () => {
    cleanupOcrTempFiles().catch((err) => {
      logger.warn({ err }, "OCR temp cleanup scheduler error");
    });
  };

  run();
  setInterval(run, RUN_INTERVAL_MS).unref();

  logger.info(
    { intervalHours: RUN_INTERVAL_MS / 3600000, maxAgeHours: MAX_AGE_MS / 3600000 },
    "OCR temp cleanup scheduler started",
  );
}
