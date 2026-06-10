/**
 * Reusable upload file validator.
 * Validates MIME type, file extension, and size.
 * Always rejects executables, scripts, and HTML regardless of options.
 */

const ALWAYS_BLOCKED_MIME = new Set([
  "text/html",
  "application/javascript",
  "application/x-javascript",
  "text/javascript",
  "application/x-sh",
  "application/x-csh",
  "application/x-bat",
  "application/x-msdos-program",
  "application/x-msdownload",
  "application/x-executable",
  "application/x-elf",
  "application/vnd.microsoft.portable-executable",
  "application/x-php",
  "application/x-httpd-php",
  "text/x-php",
  "image/svg+xml",
]);

const ALWAYS_BLOCKED_EXT = new Set([
  "exe", "sh", "bat", "cmd", "com", "msi", "ps1", "psm1", "vbs", "vbe",
  "js", "mjs", "cjs", "ts", "php", "php3", "php4", "php5", "phtml",
  "asp", "aspx", "jsp", "cgi", "pl", "py", "rb", "html", "htm", "svg",
  "jar", "war", "class",
]);

export interface ValidateUploadOptions {
  allowedMime: ReadonlySet<string> | string[];
  allowedExt?: ReadonlySet<string> | string[];
  maxSizeBytes?: number;
}

export interface ValidateUploadResult {
  ok: boolean;
  errorMessage?: string;
}

function toSet(input: ReadonlySet<string> | string[]): Set<string> {
  return input instanceof Set ? input : new Set(input);
}

/**
 * Validates an uploaded file against MIME type, extension, size, and
 * a hardcoded blocklist of dangerous types (executables, scripts, SVG, HTML).
 *
 * @param file - multer file object (req.file)
 * @param options - validation options
 * @returns { ok: true } or { ok: false, errorMessage: string }
 */
export function validateUploadFile(
  file: Express.Multer.File,
  options: ValidateUploadOptions,
): ValidateUploadResult {
  const allowedMime = toSet(options.allowedMime);
  const allowedExt = options.allowedExt ? toSet(options.allowedExt) : null;
  const maxSize = options.maxSizeBytes;

  const mime = file.mimetype.toLowerCase().trim();
  const originalName = file.originalname ?? "";
  const ext = originalName.includes(".")
    ? originalName.split(".").pop()!.toLowerCase().trim()
    : "";

  // 1. Blocklist check (always enforced regardless of options)
  if (ALWAYS_BLOCKED_MIME.has(mime)) {
    return { ok: false, errorMessage: `Tipe file '${mime}' tidak diizinkan.` };
  }
  if (ext && ALWAYS_BLOCKED_EXT.has(ext)) {
    return { ok: false, errorMessage: `Ekstensi '.${ext}' tidak diizinkan.` };
  }

  // 2. MIME whitelist
  if (!allowedMime.has(mime)) {
    return {
      ok: false,
      errorMessage: `Tipe file tidak didukung. Diizinkan: ${[...allowedMime].join(", ")}.`,
    };
  }

  // 3. Extension whitelist (optional)
  if (allowedExt && ext && !allowedExt.has(ext)) {
    return {
      ok: false,
      errorMessage: `Ekstensi '.${ext}' tidak didukung. Diizinkan: ${[...allowedExt].map((e) => `.${e}`).join(", ")}.`,
    };
  }

  // 4. Size check
  if (maxSize !== undefined && file.size > maxSize) {
    const maxMb = (maxSize / 1024 / 1024).toFixed(0);
    return { ok: false, errorMessage: `Ukuran file melebihi batas ${maxMb} MB.` };
  }

  return { ok: true };
}
