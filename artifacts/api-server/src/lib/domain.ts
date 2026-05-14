/**
 * Returns the best public domain from REPLIT_DOMAINS.
 * Prefers a custom domain (non-Replit) over *.replit.app / *.replit.dev.
 * Falls back to the first domain in the list, or empty string.
 */
export function getPreferredDomain(): string {
  const raw = process.env.REPLIT_DOMAINS ?? "";
  const domains = raw.split(",").map((d) => d.trim()).filter(Boolean);
  if (!domains.length) return "";
  const custom = domains.find(
    (d) => !d.endsWith(".replit.app") && !d.endsWith(".replit.dev") && !d.endsWith(".repl.co")
  );
  return custom ?? domains[0];
}
