import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.delete("/admin-clear-transactions", async (req, res) => {
  const key = req.headers["x-admin-key"] ?? req.query["key"];
  if (!key || key !== process.env["PORTAL_ADMIN_KEY"]) {
    res.status(401).json({ error: "unauthorized" });
    return;
  }

  try {
    await db.execute(sql`
      TRUNCATE TABLE
        accounting_entries,
        accounting_entry_lines,
        accounting_journals,
        accounting_payments,
        ai_chat_messages,
        ai_chat_sessions,
        api_response_times,
        correspondence_attachments,
        correspondences,
        driver_job_logs,
        driver_jobs,
        driver_photos,
        email_attachments,
        email_correspondences,
        email_links,
        expense_attachments,
        expenses,
        freight_attachments,
        freight_customs_docs,
        freight_quotes,
        freight_rfqs,
        freight_shipments,
        logistic_order_items,
        logistic_order_quotes,
        logistic_order_rfqs,
        logistic_orders,
        orders,
        payments,
        purchase_document_lines,
        purchase_documents,
        sales_document_lines,
        sales_documents,
        shipment_stages,
        shipments,
        stocks,
        transactions,
        wa_ai_intake_log
      CASCADE
    `);
    logger.info("All transaction tables cleared by admin");
    res.json({ ok: true, message: "All transaction tables cleared" });
  } catch (err) {
    logger.error({ err }, "Failed to clear transaction tables");
    res.status(500).json({ error: "Failed to clear transactions" });
  }
});

export default router;
