import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
export function assetUrl(path: string): string {
  return `${BASE}${path}`;
}

/**
 * Resolve a stored image URL to a displayable URL.
 * - Paths starting with /objects/ (BizPortal format) → /api/storage/objects/...
 * - Paths already starting with /api/storage → used as-is
 * - Other URLs (http/https or null) → returned as-is or null
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("/objects/")) return `/api/storage${url}`;
  return url;
}
