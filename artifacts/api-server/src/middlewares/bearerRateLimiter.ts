import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

/**
 * Rate limiter that applies only to requests carrying a Supabase bearer token.
 *
 * Purpose: prevent brute-force / enumeration of Supabase access tokens against
 * the ERP API.  Internal BizPortal session-cookie requests are NOT limited here
 * because they carry no Authorization header.
 *
 * Limits:
 *   - 60 requests per IP per 1-minute window (legitimate portal/mobile use)
 *   - Separate limit of 10 failed/auth-error responses per IP per 5 minutes
 *     is enforced downstream by the skipSuccessfulRequests variant below.
 *
 * Headers returned to the client:
 *   RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset  (RFC-compliant)
 */

const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 60;

const limiter = rateLimit({
  windowMs: WINDOW_MS,
  max: MAX_PER_WINDOW,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  keyGenerator: (req: Request) => {
    const forwarded = req.headers["x-forwarded-for"];
    const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ?? req.ip ?? "unknown";
    return ipKeyGenerator(raw.trim());
  },
  message: {
    message: "Too many requests. Please wait before retrying.",
  },
  skip: (req: Request) => {
    return !req.headers.authorization?.startsWith("Bearer ");
  },
});

/**
 * Stricter limiter counting only failed (4xx/5xx) responses.
 * 10 auth failures per IP within 5 minutes triggers a block.
 * This catches repeated invalid-token probing without penalising
 * clients that are making valid requests in the same window.
 */
const failureLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req: Request) => {
    const forwarded = req.headers["x-forwarded-for"];
    const raw = (Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]) ?? req.ip ?? "unknown";
    return `fail:${ipKeyGenerator(raw.trim())}`;
  },
  message: {
    message: "Too many failed requests. Please wait 5 minutes before retrying.",
  },
  skip: (req: Request) => {
    return !req.headers.authorization?.startsWith("Bearer ");
  },
});

export function bearerRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  limiter(req, res, (err?: unknown) => {
    if (err) return next(err);
    failureLimiter(req, res, next);
  });
}
