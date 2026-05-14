import { randomUUID } from "crypto";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const MEDIA_BUCKET = "media";

function getSupabaseHeaders() {
  return {
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    apikey: SUPABASE_SERVICE_KEY,
  };
}

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
 * Upload buffer ke Supabase Storage bucket "media" (public).
 * Returns absolute public URL.
 */
export async function uploadToSupabase(
  buffer: Buffer,
  contentType: string,
  folder = "uploads",
): Promise<{ publicUrl: string; storagePath: string }> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY tidak dikonfigurasi");
  }

  const ext = extFromContentType(contentType);
  const objectId = randomUUID();
  const fileName = `${objectId}.${ext}`;
  const storagePath = `${folder}/${fileName}`;

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${storagePath}`;
  const res = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      ...getSupabaseHeaders(),
      "Content-Type": contentType,
    },
    body: buffer,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase upload gagal (${res.status}): ${body}`);
  }

  const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${MEDIA_BUCKET}/${storagePath}`;
  return { publicUrl, storagePath };
}

/**
 * Download file dari Supabase Storage.
 * Returns Buffer.
 */
export async function downloadFromSupabase(storagePath: string): Promise<Buffer> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    throw new Error("Supabase tidak dikonfigurasi");
  }
  const downloadUrl = `${SUPABASE_URL}/storage/v1/object/${MEDIA_BUCKET}/${storagePath}`;
  const res = await fetch(downloadUrl, {
    headers: getSupabaseHeaders(),
  });
  if (!res.ok) throw new Error(`Download gagal (${res.status})`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * Check apakah URL adalah Supabase URL
 */
export function isSupabaseUrl(url: string): boolean {
  return url.startsWith("https://") && url.includes("supabase.co/storage");
}
