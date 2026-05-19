import { randomUUID } from "crypto";
import { ObjectStorageService } from "./objectStorage.js";

const objectStorage = new ObjectStorageService();

function extFromContentType(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/tiff": "tiff",
    "image/bmp": "bmp",
    "image/heic": "heic",
    "image/heif": "heif",
    "application/pdf": "pdf",
  };
  return map[contentType.toLowerCase()] ?? "bin";
}

/**
 * Upload buffer ke Replit Object Storage (public).
 * Returns absolute public URL path.
 */
export async function uploadToSupabase(
  buffer: Buffer,
  contentType: string,
  folder = "uploads",
): Promise<{ publicUrl: string; storagePath: string }> {
  const ext = extFromContentType(contentType);
  const objectId = randomUUID();
  const fileName = `${objectId}.${ext}`;
  const objectKey = `${folder}/${fileName}`;

  const publicUrl = await objectStorage.uploadPublicAsset(buffer, objectKey, contentType);
  return { publicUrl, storagePath: objectKey };
}

/**
 * Download file dari Replit Object Storage.
 * Returns Buffer.
 */
export async function downloadFromSupabase(storagePath: string): Promise<Buffer> {
  const file = await objectStorage.searchPublicObject(storagePath);
  if (!file) throw new Error(`Object not found: ${storagePath}`);
  const [contents] = await file.download();
  return contents as Buffer;
}

/**
 * Check apakah URL adalah Supabase URL (legacy — always false on Replit)
 */
export function isSupabaseUrl(url: string): boolean {
  return url.includes("supabase.co/storage");
}
