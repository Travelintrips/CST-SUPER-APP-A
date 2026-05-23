import { Router, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { logisticOrdersTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { getPreferredDomain } from "../lib/domain.js";
import { logger } from "../lib/logger.js";

export const adminActionRouter: Router = Router();

/**
 * GET /admin-action/:token
 *
 * Public no-login redirect link sent to admin via WhatsApp.
 *
 * Lookup strategy:
 *   1. Try publicRfqToken column on logistic_orders (new format, 32 hex chars)
 *   2. Fallback: query short_links table for target_url matching this token,
 *      then use ref_id as orderNumber or orderId.
 *   3. Final fallback: redirect to BizPortal logistics orders list.
 */
adminActionRouter.get("/admin-action/:token", async (req: Request, res: Response) => {
  const token = String(req.params.token ?? "").trim();

  if (!token || !/^[a-f0-9]{8,128}$/i.test(token)) {
    return res.status(400).send("Link tidak valid.");
  }

  const domain = getPreferredDomain() || "cstlogistic.co.id";

  // ── Strategy 1: publicRfqToken on logistic_orders ─────────────────────────
  try {
    const [order] = await db
      .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber })
      .from(logisticOrdersTable)
      .where(eq(logisticOrdersTable.publicRfqToken, token))
      .limit(1);

    if (order) {
      const url = `https://${domain}/bizportal/logistics/orders/${order.id}`;
      logger.info({ orderId: order.id, orderNumber: order.orderNumber, via: "publicRfqToken" }, "admin-action redirect");
      return res.redirect(302, url);
    }
  } catch (err) {
    logger.warn({ err }, "admin-action: publicRfqToken lookup failed, trying fallback");
  }

  // ── Strategy 2: short_links ref_id fallback ───────────────────────────────
  try {
    const pattern = `%/admin-action/${token}`;
    const linkRow = (await db.execute(
      sql`SELECT ref_id, ref_type FROM short_links WHERE target_url LIKE ${pattern} LIMIT 1`
    )).rows[0] as { ref_id?: string | null; ref_type?: string | null } | undefined;

    if (linkRow !== undefined) {
      // Link found in short_links — try to resolve to order
      const refId = linkRow.ref_id;
      if (refId) {
        const numId = parseInt(refId, 10);
        let orderId: number | null = null;
        let orderNumber: string | null = null;

        if (!isNaN(numId) && (linkRow.ref_type === "order_id" || linkRow.ref_type === "order")) {
          const [o] = await db
            .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber })
            .from(logisticOrdersTable)
            .where(eq(logisticOrdersTable.id, numId))
            .limit(1);
          if (o) { orderId = o.id; orderNumber = o.orderNumber; }
        }

        if (!orderId) {
          // Try by orderNumber string
          const [o] = await db
            .select({ id: logisticOrdersTable.id, orderNumber: logisticOrdersTable.orderNumber })
            .from(logisticOrdersTable)
            .where(eq(logisticOrdersTable.orderNumber, refId))
            .limit(1);
          if (o) { orderId = o.id; orderNumber = o.orderNumber; }
        }

        if (orderId) {
          const url = `https://${domain}/bizportal/logistics/orders/${orderId}`;
          logger.info({ orderId, orderNumber, via: "short_links.ref_id" }, "admin-action redirect");
          return res.redirect(302, url);
        }
      }

      // Link found but ref_id is null or order not found → go to orders list
      const fallbackUrl = `https://${domain}/bizportal/logistics/orders`;
      logger.info({ token, refId, via: "short_links.fallback_list" }, "admin-action redirect to orders list");
      return res.redirect(302, fallbackUrl);
    }
  } catch (err) {
    logger.warn({ err }, "admin-action: short_links fallback failed");
  }

  // ── Strategy 3: final fallback to BizPortal logistics list ────────────────
  logger.warn({ token }, "admin-action: token not resolved, redirecting to orders list");
  return res.redirect(302, `https://${domain}/bizportal/logistics/orders`);
});
