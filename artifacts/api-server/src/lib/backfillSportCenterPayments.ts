import { db, accountingPaymentsTable } from "@workspace/db";
import { sql } from "drizzle-orm";
import { logger } from "./logger";

export async function backfillSportCenterAccountingPayments(): Promise<void> {
  const missing = await db.execute(sql`
    SELECT
      sp.id        AS sport_payment_id,
      sp.company_id,
      sp.payment_number,
      sp.amount,
      sp.method,
      sb.booking_number,
      sb.customer_name,
      sb.booking_date
    FROM sport_payments sp
    LEFT JOIN sport_bookings sb ON sb.id = sp.booking_id
    WHERE sp.payment_type = 'booking'
      AND sp.status = 'paid'
      AND NOT EXISTS (
        SELECT 1 FROM accounting_payments ap
        WHERE ap.source_type = 'sport_center'
          AND ap.source_doc_id = sp.id
      )
    ORDER BY sp.id
  `);

  const rows = missing.rows as Array<Record<string, unknown>>;
  if (rows.length === 0) return;

  logger.info(`[backfill] Found ${rows.length} sport_payment(s) without accounting_payment — backfilling...`);

  for (const row of rows) {
    try {
      const companyId = Number(row.company_id ?? 1);
      const sportPaymentId = Number(row.sport_payment_id);
      const amount = Number(row.amount ?? 0);
      const method = String(row.method ?? "cash");
      const partnerName = String(row.customer_name ?? "");
      const bookingCode = String(row.booking_number ?? row.payment_number ?? "");
      const bookingDate = row.booking_date
        ? String(row.booking_date).slice(0, 10)
        : new Date().toISOString().slice(0, 10);

      const settingsRes = await db.execute(sql`
        SELECT cash_journal_id, bank_journal_id
        FROM accounting_settings
        WHERE company_id = ${companyId}
        LIMIT 1
      `);
      const settings = settingsRes.rows[0] as Record<string, unknown> | undefined;
      if (!settings) {
        logger.warn(`[backfill] SKIP sp.id=${sportPaymentId}: no accounting_settings for company_id=${companyId}`);
        continue;
      }

      const isCash = ["cash", "tunai"].includes(method.toLowerCase());
      const journalId = isCash
        ? (settings["cash_journal_id"] ?? settings["bank_journal_id"])
        : (settings["bank_journal_id"] ?? settings["cash_journal_id"]);

      if (!journalId) {
        logger.warn(`[backfill] SKIP sp.id=${sportPaymentId}: no cash/bank journal for company_id=${companyId}`);
        continue;
      }

      const year = bookingDate.slice(0, 4);
      const cntRes = await db.execute(sql`
        SELECT CAST(COUNT(*) AS int) AS seq FROM accounting_payments
        WHERE company_id = ${companyId}
      `);
      const seq = Number((cntRes.rows[0] as Record<string, unknown>)?.["seq"] ?? 0);
      const paySeq = (seq + 1).toString().padStart(4, "0");
      const acctPayNumber = `PAY/${year}/${paySeq}`;

      await db.insert(accountingPaymentsTable).values({
        companyId,
        paymentNumber: acctPayNumber,
        paymentType: "inbound",
        status: "posted",
        amount: String(Math.round(amount * 100) / 100),
        journalId: Number(journalId),
        partnerName: partnerName || null,
        date: bookingDate,
        ref: bookingCode || null,
        memo: "Backfill: paid booking",
        entryId: null,
        sourceType: "sport_center",
        sourceDocId: sportPaymentId,
        createdById: null,
      });

      logger.info(`[backfill] CREATED ${acctPayNumber} | sp.id=${sportPaymentId} | amount=${amount}`);
    } catch (err) {
      logger.warn({ err, sportPaymentId: row["sport_payment_id"] }, "[backfill] Failed to backfill one sport_payment — skipping");
    }
  }
}
