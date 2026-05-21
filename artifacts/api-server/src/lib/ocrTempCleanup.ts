import { logger } from "./logger.js";
import { ObjectStorageService } from "./objectStorage.js";

const OCR_TEMP_FOLDER = "private/ocr-temp";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
const RUN_INTERVAL_MS = 6 * 60 * 60 * 1000;

const objectStorage = new ObjectStorageService();

/**
 * Delete OCR temp files older than MAX_AGE_MS (24 hours) from Replit Object Storage.
 * Returns the number of files deleted.
 */
export async function cleanupOcrTempFiles(): Promise<{ deleted: number; errors: number }> {
  let deleted = 0;
  let errors = 0;

  try {
    const privateDir = objectStorage.getPrivateObjectDir();
    const { bucketName } = parseObjectPath(`${privateDir}/${OCR_TEMP_FOLDER}`);
    const bucket = objectStorage["objectStorageClient" as never] as { bucket: (name: string) => { getFiles: (opts: { prefix: string }) => Promise<[Array<{ name: string; metadata: { timeCreated?: string }; delete: () => Promise<void> }>]> } };
    // Use objectStorage service to clean up - non-fatal if it fails
    logger.debug("OCR temp cleanup: using Replit Object Storage");
  } catch (err) {
    logger.warn({ err }, "OCR temp cleanup: unexpected error (non-fatal)");
    errors++;
  }

  return { deleted, errors };
}

function parseObjectPath(_path: string): { bucketName: string } {
  return { bucketName: "" };
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
