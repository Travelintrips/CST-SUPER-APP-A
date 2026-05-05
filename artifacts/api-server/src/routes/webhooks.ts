import { Router, type Request, type Response } from "express";
import { db, suppliersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendWhatsApp } from "../lib/fonnte";
import { getAdminWa } from "../lib/adminWa";
import { logger } from "../lib/logger";

const router = Router();

function normalizePhone(raw: string): string {
  let digits = raw.replace(/[^\d]/g, "");
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  return "62" + digits;
}

router.get("/webhook/fonnte", (_req: Request, res: Response) => {
  res.status(200).send("OK");
});

router.post("/webhook/fonnte", async (req: Request, res: Response) => {
  res.status(200).json({ status: true });

  try {
    const body = req.body as Record<string, unknown>;
    const sender = typeof body.sender === "string" ? body.sender : null;
    const message = typeof body.message === "string" ? body.message : null;
    const senderName = typeof body.sender_name === "string" ? body.sender_name : null;

    if (!sender || !message) {
      logger.warn({ body }, "Fonnte webhook: missing sender or message");
      return;
    }

    const normalizedSender = normalizePhone(sender);

    const vendors = await db.select().from(suppliersTable).where(eq(suppliersTable.isActive, true));
    const matchedVendor = vendors.find((v) => v.phone && normalizePhone(v.phone) === normalizedSender);

    const adminWa = await getAdminWa();
    if (!adminWa) {
      logger.warn("Fonnte webhook: no adminWa configured, cannot forward message");
      return;
    }

    if (matchedVendor) {
      const forwardMsg =
        `📩 *Balasan dari Vendor*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Vendor  : *${matchedVendor.name}*\n` +
        `No. HP  : ${sender}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `${message}`;
      await sendWhatsApp(adminWa, forwardMsg);
      logger.info({ vendorId: matchedVendor.id, sender }, "Forwarded vendor reply to admin group");
    } else {
      const displayName = senderName ?? sender;
      const forwardMsg =
        `💬 *Pesan Masuk (WA)*\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `Dari    : ${displayName}\n` +
        `No. HP  : ${sender}\n` +
        `━━━━━━━━━━━━━━━━━━\n` +
        `${message}`;
      await sendWhatsApp(adminWa, forwardMsg);
      logger.info({ sender }, "Forwarded unknown sender message to admin group");
    }
  } catch (err: unknown) {
    logger.error({ err }, "Fonnte webhook processing error");
  }
});

export default router;
