import { createHmac } from "crypto";

function getSecret(): string {
  const s = process.env.PORTAL_ADMIN_KEY ?? process.env.SESSION_SECRET ?? "";
  if (!s) {
    throw new Error(
      "Vendor response token secret not configured. " +
      "Set PORTAL_ADMIN_KEY or SESSION_SECRET environment variable."
    );
  }
  return s;
}

/**
 * Produce a 32-hex-char HMAC token scoped to a specific order number.
 * Used to authenticate vendor-response GET/POST without requiring login.
 */
export function signVendorResponseToken(orderNumber: string): string {
  return createHmac("sha256", getSecret())
    .update(orderNumber)
    .digest("hex")
    .slice(0, 32);
}

export function verifyVendorResponseToken(orderNumber: string, token: string): boolean {
  if (!token) return false;
  try {
    return token === signVendorResponseToken(orderNumber);
  } catch {
    return false;
  }
}
