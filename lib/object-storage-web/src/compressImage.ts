const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.75;

const COMPRESSIBLE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/tiff",
]);

/**
 * Compress an image File in the browser using Canvas API.
 * - Resizes to max 1600px wide (maintains aspect ratio)
 * - Outputs JPEG at 75% quality
 * - Skips PDFs and non-image files
 * - Falls back to original file on any error
 */
export async function compressImageFile(file: File): Promise<File> {
  if (!COMPRESSIBLE_TYPES.has(file.type.toLowerCase())) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const originalWidth = img.naturalWidth;
      const originalHeight = img.naturalHeight;

      const scale = originalWidth > MAX_WIDTH ? MAX_WIDTH / originalWidth : 1;
      const targetWidth = Math.round(originalWidth * scale);
      const targetHeight = Math.round(originalHeight * scale);

      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(file);
        return;
      }

      ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            resolve(file);
            return;
          }
          const baseName = file.name.replace(/\.[^.]+$/, "");
          const compressed = new File([blob], `${baseName}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          });
          resolve(compressed);
        },
        "image/jpeg",
        JPEG_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };

    img.src = objectUrl;
  });
}
