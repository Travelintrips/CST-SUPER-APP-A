import type { RequestHandler } from "express";

export const CLERK_PROXY_PATH = "/api/__clerk";

export function clerkProxyMiddleware(): RequestHandler {
  return (_req, _res, next) => next();
}
