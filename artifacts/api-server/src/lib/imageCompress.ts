import sharp from "sharp";

const MAX_WIDTH = 1600;
const JPEG_QUALITY = 75;
const WEBP_QUALITY = 75;

const IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/tiff",
  "image/bmp",
  "image/heic",
  "image/heif",
]);

export function isCompressibleImage(contentType: string): boolean {
  return IMAGE_MIME_TYPES.has(contentType.toLowerCase());
}

/**
 * Compress an image buffer using sharp.
 * - Resizes to max 1600px width (maintains aspect ratio)
 * - Outputs JPEG at 75% quality
 * - Skips compression if not an image (PDF, etc.)
 * Returns { buffer, contentType } — use these for the final upload.
 */
export async function compressImageBuffer(
  buffer: Buffer,
  contentType: string,
): Promise<{ buffer: Buffer; contentType: string }> {
  if (!isCompressibleImage(contentType)) {
    return { buffer, contentType };
  }

  try {
    const image = sharp(buffer, { failOn: "none" });
    const meta = await image.metadata();

    const width = meta.width ?? 0;
    const needsResize = width > MAX_WIDTH;

    let pipeline = image.rotate();

    if (needsResize) {
      pipeline = pipeline.resize({ width: MAX_WIDTH, withoutEnlargement: true });
    }

    if (contentType === "image/webp") {
      const compressed = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer();
      return { buffer: compressed, contentType: "image/webp" };
    }

    const compressed = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
    return { buffer: compressed, contentType: "image/jpeg" };
  } catch {
    return { buffer, contentType };
  }
}
